import type { Hook, MatchedHook } from 'claude-code'

import { nextUnit } from '../src/activities'
import { badThemeText, parseLingoArgs, unknownSubcommandText } from '../src/command'
import { MAX_ANSWER_EXCERPT, MAX_PROMPT_EXCERPT, excerpt } from '../src/context'
import { summaryText } from '../src/conversation'
import { LABELS } from '../src/labels'
import { pickForTurn, spinnerLine } from '../src/mistakes'
import { draftFromConfig, withTheme, wizardTransition } from '../src/setup'
import { canSeatSplit } from '../src/split'
import { ACTIVITY, MISTAKES, SETUP, load, modify } from '../src/storage'
import { themeByName } from '../src/themes'
import { CLOSE_DELAY_MS, SHOW_DELAY_MS, closeOnTurnComplete, isKeptOpen, transition } from '../src/wait-machine'
import { closeSplit, currentSetup, dispatchWait, loadSetupMirror, refreshPaneData } from './engine'
import type { Engine } from './engine'
import { ensureLesson, finishedSummary } from './orchestration'
import { openArgs, viewportOf } from './runtime'
import type { Runtime } from './runtime'
import { PANE } from './state'

// What the mod does when Claude Code raises an event that is not a draw: the
// session starting, the `/lingo` command, a turn beginning and ending, the
// learner's prompt, a permission ask. The entry point registers a handler per event;
// each calls one of these with the engine port and the event, and goes on with `next`.

// The events as the engine hands them to a hook (frozen).
type Event<N extends 'classic.SessionStart' | 'turn.start' | 'turn.complete' | 'prompt.submit' | 'tool.check' | 'tool.call'> = Parameters<Hook<N>>[1]
type CommandEvent = Parameters<MatchedHook<'command.run', { readonly command: 'lingo' }>>[1]

export async function sessionStarted(engine: Engine) {
  await engine.command.register({
    name: 'lingo',
    description: 'Open the lesson pane; "/lingo setup" runs the guided setup; "/lingo theme <name>" switches colors',
    argumentHint: '[setup | theme <name>]',
    // Typed while Claude works it runs at once: that is when the split is useful.
    immediate: true,
  })

  // Load what is saved into the mirror; a missing or unreadable value is pending.
  const setup = await loadSetupMirror(engine)
  await refreshPaneData(engine)
  if (setup === null) engine.ui.toast(LABELS.setupPendingToast)
}

// /clear, /resume and /branch start a new session without `session.start`
// (the process goes on) and reset `$.state`: reload the mirror from the store
// and remind again, since the band's "Later" was forgotten with the state.
export async function sessionRestarted(engine: Engine, e: Event<'classic.SessionStart'>) {
  if (e.source === 'startup' || e.source === 'compact') return

  const setup = await loadSetupMirror(engine)
  await refreshPaneData(engine)
  if (setup === null) engine.ui.toast(LABELS.setupPendingToast)
}

export async function lingoCommand(rt: Runtime, engine: Engine, e: CommandEvent) {
  const parsed = parseLingoArgs(e.args)
  if (parsed.kind === 'unknown') return { text: unknownSubcommandText(parsed.name) }
  if (parsed.kind === 'bad-theme') return { text: badThemeText(parsed.name) }

  const setup = await currentSetup(engine)

  if (parsed.kind === 'theme') {
    // Re-reads the store before writing: another session may have saved since.
    // A store that fails is told like a setup that is not there.
    const changed = await modify(engine.store, SETUP, latest => (latest === null ? null : withTheme(latest, parsed.theme)))
    if (changed === null || changed.after === null) return { text: LABELS.themeNeedsSetup }
    const saved = changed.after
    await engine.setupCache.update(() => ({ isLoaded: true, setup: saved }))
    return { text: LABELS.themeSet(themeByName(parsed.theme).label) }
  }

  if (parsed.kind === 'setup') {
    // Always the wizard, never a toggle: re-running it resumes where it was.
    await engine.setupWizard.update(s => wizardTransition(s, { type: 'open' }, draftFromConfig(rt.config.native, rt.config.target)))
    const opened = await engine.ui.open(openArgs(rt, setup, e.presentation?.columns))
    if (opened.isPlaced) await dispatchWait(engine, { type: 'pane-placed', opener: 'person' })
    return {}
  }

  // A second /lingo closes a pane that is up and drawn (the person's toggle).
  const panes = await engine.ui.panes()
  if (panes.some(p => p.id === PANE && p.isPlaced)) {
    await closeSplit(engine)
    return {}
  }

  // Asked by the person, so it is placed at any width (docked from 110 columns in fullscreen).
  await refreshPaneData(engine)
  const opened = await engine.ui.open(openArgs(rt, setup, e.presentation?.columns))
  if (opened.isPlaced) await dispatchWait(engine, { type: 'pane-placed', opener: 'person' })
  // Straight into the unfinished activity or the suggested one.
  if (setup !== null) await ensureLesson(engine, setup)

  return {}
}

// --- Turns ---------------------------------------------------------------

// `turn.start` is raised for the main loop only (a subagent's run raises none).
export async function turnStarted(rt: Runtime, engine: Engine, e: Event<'turn.start'>) {
  rt.delayTimer?.cancel()
  rt.closeTimer?.cancel()
  await dispatchWait(engine, { type: 'turn-start', turnId: e.turnId, at: await engine.clock.now() })

  rt.ticker?.cancel()
  rt.ticker = engine.clock.every(1000, async () => {
    if ((await engine.wait.read()).pane !== 'open') return
    // A mirror the store would not give (it failed when the pane opened) is tried again here: a handler may
    // write state, a render may not.
    if (!(await engine.paneData.read()).isLoaded) await refreshPaneData(engine)
    engine.ui.invalidate('ui.render')
  })

  const turnId = e.turnId
  rt.delayTimer = engine.clock.after(SHOW_DELAY_MS, async () => {
    await dispatchWait(engine, { type: 'delay-elapsed', turnId })

    // The Spinner's card for this turn: one of the learner's own mistakes, due ones first.
    const setup = await currentSetup(engine)
    if (setup !== null) {
      const log = await load(engine.store, ACTIVITY)
      const mistake = pickForTurn(await load(engine.store, MISTAKES), nextUnit(log), turnId)
      await engine.spinnerCard.update(() => ({ turnId, text: mistake === null ? null : spinnerLine(mistake) }))
    }

    // Nothing opens while the setup is pending, once retired for a permission
    // ask, or over a split that is already open.
    const state = await engine.wait.read()
    if (setup === null || state.phase !== 'showing' || state.pane !== 'none') return
    if ((await engine.ui.panes()).some(p => p.id === PANE)) return

    // Only a docked split opens by itself: in fullscreen, from 110 columns.
    const seen = viewportOf(rt)
    if (seen === null || !canSeatSplit(seen)) {
      await dispatchWait(engine, { type: 'pane-not-placed' })
      return
    }

    // Unasked, the engine seats it from 144 columns (110 once the person opened it).
    await refreshPaneData(engine)
    const opened = await engine.ui.open(openArgs(rt, setup))
    if (opened.isPlaced) {
      await dispatchWait(engine, { type: 'pane-placed', opener: 'mod' })
      await ensureLesson(engine, setup)
    } else {
      // It would sit undrawn: drop it and offer a button above the prompt.
      await engine.ui.close({ id: PANE })
      await dispatchWait(engine, { type: 'pane-not-placed' })
    }
  })
}

export async function turnCompleted(rt: Runtime, engine: Engine, e: Event<'turn.complete'>) {
  // A subagent's turn also reaches this hook; only the main loop's counts.
  if (e.agentId !== undefined) return

  // The contextual opt-in keeps a short, redacted excerpt of Claude's reply; off, nothing.
  const setup = await currentSetup(engine)
  if (setup?.isContextual === true && e.answer.trim() !== '') {
    const answer = excerpt(e.answer, MAX_ANSWER_EXCERPT)
    await engine.workContext.update(c => ({ ...c, answer }))
  }

  const turnId = e.turnId
  const before = await engine.wait.read()
  const complete = { type: 'turn-complete', turnId, isAborted: e.isAborted } as const
  const isCounting = transition(before, complete).phase === 'closing'
  const closing = closeOnTurnComplete(before, complete)
  rt.delayTimer?.cancel()
  rt.closeTimer?.cancel()
  rt.ticker?.cancel()
  await dispatchWait(engine, complete)
  // The split's top line turns to "done".
  engine.ui.invalidate('ui.render')

  if (closing === 'now') await closeSplit(engine)
  // A split in use whose micro-unit already ended while Claude worked: with
  // Claude idle now, it goes, and says how the unit went.
  const atRest = finishedSummary(await engine.lesson.read())
  if (closing === 'keep' && isKeptOpen(before) && atRest !== null) {
    await closeSplit(engine)
    engine.ui.toast(`${LABELS.modName}: ${summaryText(atRest.summary, atRest.activity)}`)
  }
  if (isCounting) {
    rt.closeTimer = engine.clock.after(CLOSE_DELAY_MS, async () => {
      // Untouched until the end of the countdown: it goes; touched meanwhile, it stays.
      const state = await engine.wait.read()
      await dispatchWait(engine, { type: 'countdown-elapsed', turnId })
      if (closing === 'after-countdown' && closeOnTurnComplete(state, complete) !== 'keep') await closeSplit(engine)
    })
  }
}

// The learner's next prompt closes a split they were using; an untouched one
// the mod opened goes with its turn instead.
export async function promptSubmitted(engine: Engine, e: Event<'prompt.submit'>) {
  // A slash command (`/lingo` itself) is not the learner's next prompt.
  const isCommand = e.text.trimStart().startsWith('/')
  if (!isCommand && isKeptOpen(await engine.wait.read())) await closeSplit(engine)
  // The contextual opt-in keeps a short, redacted excerpt of the prompt; off, nothing.
  const setup = await currentSetup(engine)
  if (setup?.isContextual === true && !isCommand) {
    const prompt = excerpt(e.text, MAX_PROMPT_EXCERPT)
    await engine.workContext.update(c => ({ ...c, prompt }))
  }
}

// --- Do not cover what the person must answer ----------------------------

// A real tool call the mode decider will put to the person (a permission ask).
// The split stays, dimmed and without its field, so no key meant for the
// dialog lands in it.
export async function toolChecked(
  rt: Runtime,
  engine: Engine,
  e: Event<'tool.check'>,
  verdict: { decision?: string },
) {
  if (verdict.decision !== 'ask' || e.tool_use_id === undefined) return

  rt.delayTimer?.cancel()
  await dispatchWait(engine, { type: 'needs-user' })
}

// A tool is running, so whatever asked before has been answered.
export const toolRunning = (engine: Engine) => dispatchWait(engine, { type: 'user-answered' })

// A question put to the person: the split waits, dimmed, until it is answered.
export async function questionAsked(rt: Runtime, engine: Engine) {
  rt.delayTimer?.cancel()
  await dispatchWait(engine, { type: 'needs-user' })
}

export const isQuestion = (e: Event<'tool.call'>) => String(e.tool) === 'AskUserQuestion'

// The person's mark or key, the mod's own close, or an unload: the split is gone.
export const paneClosed = (engine: Engine) => dispatchWait(engine, { type: 'pane-closed' })
