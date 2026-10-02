import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DEMO_CARDS, DEMO_LESSON_COUNT, DEMO_PACK_TITLE } from '../src/content/demo-english-a1'
import type { LessonQueue } from '../src/lesson'
import {
  IDLE_PRACTICE,
  PROGRESS_STORE_KEY,
  advanceLesson,
  afterAnswer,
  buildQueue,
  isCorrectAnswer,
  isFinished,
  leaksAnswer,
  nextCard,
  parseProgress,
  recordAttempt,
  reveal,
  startPractice,
  tutorPrompt,
} from '../src/lesson'
import { socratic } from '../src/correction/socratic'
import { badThemeText, parseLingoArgs, unknownSubcommandText } from '../src/command'
import { LABELS } from '../src/labels'
import { THEMES, themeByName } from '../src/themes'
import { microLesson, spinnerSuffix } from '../src/microcards'
import {
  CLOSED_WIZARD,
  DEFAULT_SPLIT_SHARE,
  LEVELS,
  SETUP_STORE_KEY,
  SPLIT_SHARES,
  STEPS,
  STRATEGY_AXES,
  TUTOR_MODELS,
  buildSetup,
  draftFromConfig,
  draftFromSetup,
  parseInterests,
  parseSetup,
  resolveSetup,
  stepProblem,
  withTheme,
  wizardTransition,
} from '../src/setup'
import type { WizardEvent } from '../src/setup'
import {
  CLOSE_DELAY_MS,
  INITIAL_WAIT,
  SHOW_DELAY_MS,
  closeOnTurnComplete,
  isClaudeWorking,
  isKeptOpen,
  isLessonVisible,
  isOfferVisible,
  transition,
} from '../src/wait-machine'
import type { WaitEvent } from '../src/wait-machine'
import { canSeatSplit, claudeStateLine, inlineRows, splitColumns } from '../src/split'
import type { Viewport } from '../src/split'
import type { LingoActivity, LingoLesson, LingoPractice, LingoReading, LingoSetup, LingoTutorState, LingoUnit, LingoUnitSummary } from '../types'
import {
  ACTIVITIES,
  ACTIVITY_STORE_KEY,
  activityLabel,
  levelHint,
  parseActivityLog,
  recordUnit,
  suggestActivity,
} from '../src/activities'
import {
  IDLE_LESSON,
  UNIT_REPLIES,
  askedForHelp,
  isAwaitingLearner,
  markedParts,
  newUnit,
  summaryText,
  withHelp,
  withLearnerLine,
  withTutorTurn,
  withoutTutor,
} from '../src/conversation'
import {
  TUTOR_MAX_TOKENS,
  TUTOR_TIMEOUT_MS,
  helpPrompt,
  openingPrompt,
  parseTutorTurn,
  replyPrompt,
  tutorSystem,
} from '../src/tutor'
import type { TutorContext } from '../src/tutor'
import { listenUrl } from '../src/listen'
import { MAX_ANSWER_EXCERPT, MAX_PROMPT_EXCERPT, NO_CONTEXT, contextForTutor, excerpt } from '../src/context'
import { generatedOpeningPrompt, parseScenario, pickScenario } from '../src/roleplay'
import {
  READING_MAX_TOKENS,
  answerReading,
  parseReading,
  readingPrompt,
  readingSystem,
  showReadingAnswer,
} from '../src/reading'
import {
  MAX_WOVEN,
  MISTAKES_STORE_KEY,
  addCorrections,
  dueMistakes,
  isFormCard,
  mistakeAsCard,
  parseMistakes,
  pickForTurn,
  recordMistakeReview,
  spinnerLine,
  wovenOutcome,
} from '../src/mistakes'

const PANE = 'lingo'
const PANE_TITLE = 'lingo-pane'

// Waiting-state trigger and the split's standing, kept in `$.state` so the
// Spinner, the band and the pane redraw when it changes (contract: types/index.d.ts).
const wait = atom({ plugin: 'lingo-pane', key: 'wait' } as const, INITIAL_WAIT)

// Guided setup (contract: types/index.d.ts). The saved setup lives in `$.store`
// (the source of truth); `setupCache` mirrors it so the band and the Spinner
// redraw when it changes, and `$.state` resets on /clear, hence the fallback to
// the store whenever the mirror is not loaded.
const setupWizard = atom({ plugin: 'lingo-pane', key: 'setupWizard' } as const, CLOSED_WIZARD)
const setupCache = atom({ plugin: 'lingo-pane', key: 'setupCache' } as const, { isLoaded: false, setup: null })
const setupBand = atom({ plugin: 'lingo-pane', key: 'setupBand' } as const, { isHidden: false })

// The practice session in the pane (contract: types/index.d.ts). Progress lives
// in `$.store` under `progress`; this is only where the learner is right now.
const practice = atom({ plugin: 'lingo-pane', key: 'practice' } as const, IDLE_PRACTICE)

// The lesson in the split: the activity on screen and its micro-unit (contract: types/index.d.ts).
const lesson = atom({ plugin: 'lingo-pane', key: 'lesson' } as const, IDLE_LESSON)

// The Spinner's micro-card for the turn, worked out once when the turn's delay ends.
const spinnerCard = atom({ plugin: 'lingo-pane', key: 'spinnerCard' } as const, { turnId: null, text: null })

// The contextual mode's material (opt-in): the last prompt and Claude's last reply, cut short and redacted.
const workContext = atom({ plugin: 'lingo-pane', key: 'workContext' } as const, NO_CONTEXT)

// What the `switch ▸` menu offers.
const AVAILABLE_ACTIVITIES: readonly LingoActivity[] = ['conversation', 'roleplay', 'reading', 'review']

// The review's tutor hint (the flashcard practice kept from the first lesson).
const HINT_TIMEOUT_MS = 20000

// The setup in force: the mirror once loaded, the store otherwise.
async function currentSetup($: EngineInterface): Promise<LingoSetup | null> {
  const cache = await read($, setupCache)
  return resolveSetup(cache, cache.isLoaded ? undefined : await $.store.get(SETUP_STORE_KEY))
}

function dispatchWait($: EngineInterface, event: WaitEvent) {
  return update($, wait, s => transition(s, event))
}

async function closeSplit($: EngineInterface) {
  await $.ui.close({ id: PANE })
  await dispatchWait($, { type: 'pane-closed' })
}

// Any key typed in the split's field or any press there: the split is in use.
async function touch($: EngineInterface) {
  const state = await read($, wait)
  if (state.pane === 'open' && !state.isTouched) await dispatchWait($, { type: 'touched' })
}

const nowIso = async ($: EngineInterface) => new Date(await $.clock.now()).toISOString()

// Moving the ring is never worth failing a press over: a pane drawn without the keyboard denies it.
async function focusKey($: EngineInterface, key: string) {
  await $.ui.focus({ requestId: PANE, key }).catch(() => undefined)
}

// What the tutor may read of the learner's session: only with the opt-in.
async function sessionMaterial($: EngineInterface, setup: LingoSetup): Promise<string | null> {
  return setup.isContextual ? contextForTutor(await read($, workContext)) : null
}

// What the tutor knows about this learner and this unit.
function tutorContext(setup: LingoSetup, unit: LingoUnit | null, material: string | null = null): TutorContext {
  return {
    targetLanguage: setup.targetLanguage,
    nativeLanguage: setup.nativeLanguage,
    level: setup.level,
    interests: setup.interests,
    activity: unit?.activity ?? 'conversation',
    scenario: unit?.scenario ?? null,
    weave: unit?.woven ?? [],
    workContext: material,
  }
}

// One call on the learner's own plan, with the model chosen in the setup.
async function callTutor($: EngineInterface, setup: LingoSetup, system: string, prompt: string, maxTokens = TUTOR_MAX_TOKENS) {
  return $.model.complete({
    model: setup.tutorModel,
    system,
    prompt,
    effort: 'low',
    maxTokens,
    timeoutMs: TUTOR_TIMEOUT_MS,
  })
}

// A change to the unit on screen, only if it is still the same unit.
async function updateUnit($: EngineInterface, id: string, change: (unit: LingoUnit) => LingoUnit) {
  await update($, lesson, l => (l.unit === null || l.unit.id !== id ? l : { ...l, unit: change(l.unit) }))
}

// A new micro-unit of conversation or role-play: the tutor opens it. A role-play
// takes the next scenario of the learner's level, or one the tutor makes up from
// their interests in the same call.
async function openTalkUnit($: EngineInterface, setup: LingoSetup, activity: LingoUnit['activity']) {
  // The tutor weaves in a couple of the mistakes due at this unit.
  const log = parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY))
  const due = dueMistakes(parseMistakes(await $.store.get(MISTAKES_STORE_KEY)), log.units + 1).filter(isFormCard)
  const woven = due.slice(0, MAX_WOVEN).map(c => ({ id: c.id, wrong: c.wrong, right: c.right }))
  const pick = activity === 'roleplay' ? pickScenario(setup.level, setup.interests, log.done.roleplay ?? 0) : null
  const scenario = pick?.kind === 'fixed' ? pick.scenario : null
  const unit = newUnit(`${activity}-${await $.clock.now()}`, activity, scenario, woven)
  await update($, lesson, l => ({ ...l, activity, unit, isMenuOpen: false }))
  await focusKey($, 'reply')
  const ctx = tutorContext(setup, unit, await sessionMaterial($, setup))
  const isMadeUp = pick?.kind === 'generated'
  const reply = await callTutor($, setup, tutorSystem(ctx), isMadeUp ? generatedOpeningPrompt(ctx) : openingPrompt(ctx))
  const turn = reply.isAnswered ? parseTutorTurn(reply.text) : null
  const madeUp = isMadeUp && reply.isAnswered ? parseScenario(reply.text) : null
  await updateUnit($, unit.id, u => {
    if (u.pending !== 'opening') return u
    const opened = turn === null ? withoutTutor(u, LABELS.tutorSilentOpening) : withTutorTurn(u, turn)
    return madeUp === null ? opened : { ...opened, scenario: madeUp }
  })
}

// A reading: the tutor writes a short text at the learner's level and 2-3 questions.
async function openReading($: EngineInterface, setup: LingoSetup) {
  const id = `reading-${await $.clock.now()}`
  const waiting: LingoReading = {
    id,
    title: '',
    text: '',
    questions: [],
    index: 0,
    misses: 0,
    isPending: true,
    notice: null,
    summary: null,
  }
  await update($, lesson, (l): LingoLesson => ({ ...l, activity: 'reading', reading: waiting, isMenuOpen: false }))
  const ctx = tutorContext(setup, null, await sessionMaterial($, setup))
  const reply = await callTutor($, setup, readingSystem(ctx), readingPrompt(ctx), READING_MAX_TOKENS)
  const written = reply.isAnswered ? parseReading(id, reply.text) : null
  await update($, lesson, (l): LingoLesson =>
    l.reading === null || l.reading.id !== id
      ? l
      : { ...l, reading: written ?? { ...l.reading, isPending: false, notice: LABELS.readingSilent } },
  )
  if (written !== null) await focusKey($, 'reading-answer')
}

// The learner's answer to the question on screen; an empty Enter shows it and makes it a card.
async function answerQuestion($: EngineInterface, value: string) {
  const before = (await read($, lesson)).reading
  const question = before?.questions[before.index]
  if (before === null || question === undefined || before.summary !== null || before.isPending) return
  const isShown = value.trim() === ''
  const after = isShown ? showReadingAnswer(before) : answerReading(before, value)
  await update($, lesson, (l): LingoLesson => (l.reading?.id === before.id ? { ...l, reading: after } : l))
  if (isShown) {
    const unitNumber = parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY)).units + 1
    const card = { wrong: '', right: question.answer, note: before.title, sentence: question.question }
    const mistakes = parseMistakes(await $.store.get(MISTAKES_STORE_KEY))
    await $.store.set(MISTAKES_STORE_KEY, addCorrections(mistakes, [card], unitNumber, await nowIso($)))
  }
  if (after.summary !== null) await finishActivity($, 'reading', after.summary)
}

// The review: the built-in pack's Pimsleur queue, started at once (zero clicks).
async function startReview($: EngineInterface) {
  await update($, lesson, (l): LingoLesson => ({ ...l, activity: 'review', isMenuOpen: false }))
  const session = await read($, practice)
  if (session.lesson !== null && session.status !== 'done') return
  const queue = await reviewQueue($)
  if (queue.recall.length + queue.fresh.length === 0) return
  const latest = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
  await update($, practice, () => startPractice(queue, latest.currentLesson))
  await focusKey($, 'answer-0')
}

// The review: the mistakes due at the next unit first, then the built-in pack's Pimsleur lesson.
async function reviewQueue($: EngineInterface): Promise<LessonQueue> {
  const log = parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY))
  const due = dueMistakes(parseMistakes(await $.store.get(MISTAKES_STORE_KEY)), log.units + 1).map(c => c.id)
  const latest = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
  const pack = isFinished(latest, DEMO_LESSON_COUNT)
    ? { recall: [], fresh: [] }
    : buildQueue(DEMO_CARDS, latest, new Date(await $.clock.now()))
  return { recall: [...due, ...pack.recall], fresh: pack.fresh }
}

async function startActivity($: EngineInterface, setup: LingoSetup, activity: LingoActivity) {
  if (activity === 'review') return startReview($)
  if (activity === 'reading') return openReading($, setup)
  // A talk unit left half done for another one closes here: its mistakes are kept.
  const left = (await read($, lesson)).unit
  if (left !== null && left.summary === null) {
    await saveUnitMistakes($, left, parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY)).units + 1)
  }
  return openTalkUnit($, setup, activity)
}

// The split opens straight into the unfinished activity, or into the suggested one.
async function ensureLesson($: EngineInterface, setup: LingoSetup) {
  const current = await read($, lesson)
  if (current.activity === 'review') {
    const session = await read($, practice)
    if (session.lesson !== null && session.status !== 'done') return
  } else if (current.activity === 'reading') {
    const reading = current.reading
    if (reading !== null && reading.summary === null && !(reading.isPending && reading.text === '')) return
  } else if (current.unit !== null && current.unit.summary === null) {
    // A call lost with a reload leaves the unit waiting forever: give it back.
    if (current.unit.pending !== null && current.unit.lines.length === 0) {
      return openTalkUnit($, setup, current.unit.activity)
    }
    return
  }
  const log = parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY))
  return startActivity($, setup, suggestActivity(log, AVAILABLE_ACTIVITIES))
}

// A unit's mistakes become cards (numbered by the unit), and the woven ones count as reviewed.
async function saveUnitMistakes($: EngineInterface, unit: LingoUnit, unitNumber: number) {
  if (unit.corrections.length === 0 && unit.woven.length === 0) return
  const at = await nowIso($)
  // Re-read before writing: the store is shared between sessions.
  let mistakes = parseMistakes(await $.store.get(MISTAKES_STORE_KEY))
  for (const card of unit.woven) {
    const outcome = wovenOutcome(unit.lines, card)
    if (outcome !== null) mistakes = recordMistakeReview(mistakes, card.id, at, outcome)
  }
  await $.store.set(MISTAKES_STORE_KEY, addCorrections(mistakes, unit.corrections, unitNumber, at))
}

// A finished unit of any activity: logged; with Claude idle, a split in use
// closes and says how it went, else the next activity is one press away.
async function finishActivity($: EngineInterface, activity: LingoActivity, summary: LingoUnitSummary) {
  const log = recordUnit(parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY)), activity, summary, await nowIso($))
  await $.store.set(ACTIVITY_STORE_KEY, log)
  const state = await read($, wait)
  if (!isClaudeWorking(state) && isKeptOpen(state)) {
    await closeSplit($)
    $.ui.toast(`${LABELS.modName}: ${summaryText(summary, activity)}`)
    return log
  }
  await focusKey($, 'next-unit')
  return log
}

// A finished talk unit: its mistakes become cards, numbered by it.
async function finishUnit($: EngineInterface, unit: LingoUnit) {
  if (unit.summary === null) return
  const units = parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY)).units + 1
  await saveUnitMistakes($, unit, units)
  await finishActivity($, unit.activity, unit.summary)
}

// The learner's line: shown at once, then the tutor's answer.
async function sendReply($: EngineInterface, setup: LingoSetup, text: string) {
  const before = (await read($, lesson)).unit
  if (before === null) return
  const asked = withLearnerLine(before, text)
  if (asked === before) return
  await updateUnit($, before.id, () => asked)
  const ctx = tutorContext(setup, asked, await sessionMaterial($, setup))
  const reply = await callTutor($, setup, tutorSystem(ctx), replyPrompt(ctx, asked, asked.replies >= UNIT_REPLIES))
  const turn = reply.isAnswered ? parseTutorTurn(reply.text) : null
  await updateUnit($, before.id, u =>
    u.pending !== 'reply' ? u : turn === null ? withoutTutor(u, LABELS.tutorSilentReply) : withTutorTurn(u, turn),
  )
  const after = (await read($, lesson)).unit
  if (after !== null && after.id === before.id && after.summary !== null) await finishUnit($, after)
}

// An empty Enter: a scaffold, never the answer.
async function sendHelp($: EngineInterface, setup: LingoSetup) {
  const before = (await read($, lesson)).unit
  if (before === null) return
  const asked = askedForHelp(before)
  if (asked === before) return
  await updateUnit($, before.id, () => asked)
  const ctx = tutorContext(setup, asked, await sessionMaterial($, setup))
  const reply = await callTutor($, setup, tutorSystem(ctx), helpPrompt(ctx, asked))
  const text = reply.isAnswered ? reply.text.trim() : ''
  await updateUnit($, before.id, u => (u.pending !== 'help' ? u : text === '' ? withoutTutor(u, LABELS.tutorSilentHelp) : withHelp(u, text)))
}

export const register: Register = (on, options) => {
  const target = String(options.targetLanguage)
  const native = String(options.nativeLanguage)

  // Timer handles live in module variables: a hot reload drops them together
  // with the timers themselves (the engine cancels pending waits on reload).
  let delayTimer: { cancel: () => void } | null = null
  let closeTimer: { cancel: () => void } | null = null
  // Redraws the split once a second while Claude works, for the elapsed time.
  let ticker: { cancel: () => void } | null = null
  // Bumped on Enter in a wizard field so the field is drawn again with its text.
  let inputRev = 0
  // The last size a render event reported: `turn.start` carries none, and a
  // render hook may not write `$.state`. The terminal's wins over a remote one.
  let terminalViewport: Viewport | null = null
  let otherViewport: Viewport | null = null
  const noteViewport = (e: { surface: string; viewport?: Viewport }) => {
    if (e.viewport === undefined) return
    if (e.surface === 'terminal') terminalViewport = e.viewport
    else otherViewport = e.viewport
  }
  const viewport = () => terminalViewport ?? otherViewport

  // What the split asks for: the keyboard (granted only over an empty prompt),
  // its share of the width when docked, about 40 % of the height inline.
  const openArgs = (setup: LingoSetup | null, terminalColumns?: number) => {
    const seen = viewport()
    const columns = terminalColumns ?? seen?.columns
    return {
      id: PANE,
      title: PANE_TITLE,
      focus: true as const,
      ...(columns === undefined ? {} : { columns: splitColumns(columns, setup?.splitShare ?? DEFAULT_SPLIT_SHARE) }),
      ...(seen === null ? {} : { rows: inlineRows(seen.rows) }),
    }
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lingo',
      description: 'Open the lesson pane; "/lingo setup" runs the guided setup; "/lingo theme <name>" switches colors',
      argumentHint: '[setup | theme <name>]',
      // Typed while Claude works it runs at once: that is when the split is useful.
      immediate: true,
    })

    // Load what is saved into the mirror; a missing or unreadable value is pending.
    const setup = parseSetup(await $.store.get(SETUP_STORE_KEY))
    await update($, setupCache, () => ({ isLoaded: true, setup }))
    if (setup === null) $.ui.toast(LABELS.setupPendingToast)

    return next(e)
  })

  // /clear, /resume and /branch start a new session without `session.start`
  // (the process goes on) and reset `$.state`: reload the mirror from the store
  // and remind again, since the band's "Later" was forgotten with the state.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'startup' || e.source === 'compact') return next(e)

    const setup = parseSetup(await $.store.get(SETUP_STORE_KEY))
    await update($, setupCache, () => ({ isLoaded: true, setup }))
    if (setup === null) $.ui.toast(LABELS.setupPendingToast)

    return next(e)
  })

  on('command.run', { command: 'lingo' }, async ($, e) => {
    const parsed = parseLingoArgs(e.args)
    if (parsed.kind === 'unknown') return { text: unknownSubcommandText(parsed.name) }
    if (parsed.kind === 'bad-theme') return { text: badThemeText(parsed.name) }

    const setup = await currentSetup($)

    if (parsed.kind === 'theme') {
      // Re-read the store before writing: another session may have saved since.
      const latest = parseSetup(await $.store.get(SETUP_STORE_KEY))
      if (latest === null) return { text: LABELS.themeNeedsSetup }
      const changed = withTheme(latest, parsed.theme)
      await $.store.set(SETUP_STORE_KEY, changed)
      await update($, setupCache, () => ({ isLoaded: true, setup: changed }))
      return { text: LABELS.themeSet(themeByName(parsed.theme).label) }
    }

    if (parsed.kind === 'setup') {
      // Always the wizard, never a toggle: re-running it resumes where it was.
      await update($, setupWizard, s => wizardTransition(s, { type: 'open' }, draftFromConfig(native, target)))
      const opened = await $.ui.open(openArgs(setup, e.presentation?.columns))
      if (opened.isPlaced) await dispatchWait($, { type: 'pane-placed', opener: 'person' })
      return {}
    }

    // A second /lingo closes a pane that is up and drawn (the person's toggle).
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE && p.isPlaced)) {
      await closeSplit($)
      return {}
    }

    // Asked by the person, so it is placed at any width (docked from 110 columns in fullscreen).
    const opened = await $.ui.open(openArgs(setup, e.presentation?.columns))
    if (opened.isPlaced) await dispatchWait($, { type: 'pane-placed', opener: 'person' })
    // Straight into the unfinished activity or the suggested one.
    if (setup !== null) await ensureLesson($, setup)

    return {}
  })

  // --- Busy detection -------------------------------------------------------

  // `turn.start` is raised for the main loop only (a subagent's run raises none).
  on('turn.start', async ($, e, next) => {
    delayTimer?.cancel()
    closeTimer?.cancel()
    await dispatchWait($, { type: 'turn-start', turnId: e.turnId, at: await $.clock.now() })

    ticker?.cancel()
    ticker = $.clock.every(1000, async () => {
      if ((await read($, wait)).pane === 'open') $.ui.invalidate('ui.render')
    })

    const turnId = e.turnId
    delayTimer = $.clock.after(SHOW_DELAY_MS, async () => {
      await dispatchWait($, { type: 'delay-elapsed', turnId })

      // The Spinner's card for this turn: one of the learner's own mistakes, due ones first.
      const setup = await currentSetup($)
      if (setup !== null) {
        const log = parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY))
        const mistake = pickForTurn(parseMistakes(await $.store.get(MISTAKES_STORE_KEY)), log.units + 1, turnId)
        await update($, spinnerCard, () => ({ turnId, text: mistake === null ? null : spinnerLine(mistake) }))
      }

      // Nothing opens while the setup is pending, once retired for a permission
      // ask, or over a split that is already open.
      const state = await read($, wait)
      if (setup === null || state.phase !== 'showing' || state.pane !== 'none') return
      if ((await $.ui.panes()).some(p => p.id === PANE)) return

      // Only a docked split opens by itself: in fullscreen, from 110 columns.
      const seen = viewport()
      if (seen === null || !canSeatSplit(seen)) {
        await dispatchWait($, { type: 'pane-not-placed' })
        return
      }

      // Unasked, the engine seats it from 144 columns (110 once the person opened it).
      const opened = await $.ui.open(openArgs(setup))
      if (opened.isPlaced) {
        await dispatchWait($, { type: 'pane-placed', opener: 'mod' })
        await ensureLesson($, setup)
      } else {
        // It would sit undrawn: drop it and offer a button above the prompt.
        await $.ui.close({ id: PANE })
        await dispatchWait($, { type: 'pane-not-placed' })
      }
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn also reaches this hook; only the main loop's counts.
    if (e.agentId !== undefined) return next(e)

    // The contextual opt-in keeps a short, redacted excerpt of Claude's reply; off, nothing.
    const setup = await currentSetup($)
    if (setup?.isContextual === true && e.answer.trim() !== '') {
      const answer = excerpt(e.answer, MAX_ANSWER_EXCERPT)
      await update($, workContext, c => ({ ...c, answer }))
    }

    const turnId = e.turnId
    const before = await read($, wait)
    const complete = { type: 'turn-complete', turnId, isAborted: e.isAborted } as const
    const isCounting = transition(before, complete).phase === 'closing'
    const closing = closeOnTurnComplete(before, complete)
    delayTimer?.cancel()
    closeTimer?.cancel()
    ticker?.cancel()
    await dispatchWait($, complete)
    // The split's top line turns to "done".
    $.ui.invalidate('ui.render')

    if (closing === 'now') await closeSplit($)
    if (isCounting) {
      closeTimer = $.clock.after(CLOSE_DELAY_MS, async () => {
        // Untouched until the end of the countdown: it goes; touched meanwhile, it stays.
        const state = await read($, wait)
        await dispatchWait($, { type: 'countdown-elapsed', turnId })
        if (closing === 'after-countdown' && closeOnTurnComplete(state, complete) !== 'keep') await closeSplit($)
      })
    }

    return next(e)
  })

  // The learner's next prompt closes a split they were using; an untouched one
  // the mod opened goes with its turn instead.
  on('prompt.submit', async ($, e, next) => {
    if (isKeptOpen(await read($, wait))) await closeSplit($)
    // The contextual opt-in keeps a short, redacted excerpt of the prompt; off, nothing.
    const setup = await currentSetup($)
    if (setup?.isContextual === true && !e.text.trimStart().startsWith('/')) {
      const prompt = excerpt(e.text, MAX_PROMPT_EXCERPT)
      await update($, workContext, c => ({ ...c, prompt }))
    }
    return next(e)
  })

  // --- Do not cover what the person must answer ----------------------------

  // A real tool call the mode decider will put to the person (a permission ask).
  // The split stays, dimmed and without its field, so no key meant for the
  // dialog lands in it.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'ask' || e.tool_use_id === undefined) return verdict

    delayTimer?.cancel()
    await dispatchWait($, { type: 'needs-user' })

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    if (String(e.tool) !== 'AskUserQuestion') {
      // A tool is running, so whatever asked before has been answered.
      await dispatchWait($, { type: 'user-answered' })
      return next(e)
    }

    delayTimer?.cancel()
    await dispatchWait($, { type: 'needs-user' })

    // The call resolves once the question has been answered.
    const answered = await next(e)
    await dispatchWait($, { type: 'user-answered' })

    return answered
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    // The person's mark or key, the mod's own close, or an unload: the split is gone.
    await dispatchWait($, { type: 'pane-closed' })
    return next(e)
  })

  // --- What is drawn --------------------------------------------------------

  // One micro-lesson per turn in the Spinner's suffix: no pane, any terminal.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    noteViewport(e)
    const state = await read($, wait)
    if (!isLessonVisible(state) || state.turnId === null) return next(e)

    // Nothing to teach until the setup says which languages and level.
    const setup = await currentSetup($)
    if (setup === null) return next(e)

    // The learner's own mistake when there is one; the built-in cards otherwise.
    const card = await read($, spinnerCard)
    const line = card.turnId === state.turnId && card.text !== null ? card.text : microLesson(setup.targetLanguage, setup.nativeLanguage, state.turnId)
    const suffix = spinnerSuffix(line)

    return next({ ...e, props: { ...e.props, suffix } })
  })

  // The band above the prompt: the setup reminder while setup is pending, and
  // "open lesson" while Claude works and the split cannot seat by itself.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    noteViewport(e)
    if (e.props.hasSurvey) return next(e)

    const state = await read($, wait)
    const setup = await currentSetup($)
    const band = await read($, setupBand)
    const isSetupShown = setup === null && !band.isHidden
    const isOfferShown = setup !== null && isOfferVisible(state)
    if (!isSetupShown && !isOfferShown) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {isSetupShown && (
          <Box columnGap={1}>
            <Text dimColor>{LABELS.bandSetupPending}</Text>
            <Button
              key="setup-start"
              label={LABELS.bandStartSetup}
              hotkey="2"
              plain
              onPress={async () => {
                await update($, setupWizard, s => wizardTransition(s, { type: 'open' }, draftFromConfig(native, target)))
                // Opened by a press, so it is placed at any width.
                const opened = await $.ui.open(openArgs(setup))
                if (opened.isPlaced) await dispatchWait($, { type: 'pane-placed', opener: 'person' })
              }}
            />
            <Button
              key="setup-later"
              label={LABELS.bandLater}
              hotkey="3"
              plain
              onPress={() => update($, setupBand, () => ({ isHidden: true }))}
            />
          </Box>
        )}
        {isOfferShown && (
          <Box columnGap={1}>
            <Text dimColor>{LABELS.modName}</Text>
            <Button
              key="open-lingo"
              label={LABELS.bandOpenLesson}
              hotkey="1"
              plain
              onPress={async () => {
                await dispatchWait($, { type: 'offer-taken' })
                // Opened by a press: placed at any width, inline when it cannot dock.
                const opened = await $.ui.open(openArgs(setup))
                if (opened.isPlaced) await dispatchWait($, { type: 'pane-placed', opener: 'person' })
                if (setup !== null) await ensureLesson($, setup)
              }}
            />
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    noteViewport(e)
    const setup = await currentSetup($)
    const wizard = await read($, setupWizard)
    const state = await read($, wait)

    if (e.surface === 'mobile') {
      // The mobile app draws no Input yet, so the wizard cannot run there.
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text bold>{LABELS.modName}</Text>
          <Text dimColor>
            {setup === null ? LABELS.setupNeedsInput : LABELS.learning(setup.targetLanguage, setup.nativeLanguage)}
          </Text>
        </Box>
      )
    }

    const { Box, Button, Input, Link, Text } = $.ui.resolve(e)

    // On top of the split: whether the keys are here (Esc hands them back and the
    // split stays), and what Claude is doing.
    const isFocused = e.props.isFocused
    const top = (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold={isFocused} dimColor={!isFocused}>
          {isFocused ? LABELS.keysHere : LABELS.keysAway}
        </Text>
        <Text dimColor>{claudeStateLine(state, state.startedAt === null ? 0 : await $.clock.now())}</Text>
      </Box>
    )

    // A permission ask or a question: the split waits, dimmed and with no field,
    // so a key meant for the dialog never lands in it.
    if (state.phase === 'paused') {
      return (
        <Box flexDirection="column">
          {top}
          <Text dimColor>{LABELS.waitingForYou}</Text>
        </Box>
      )
    }

    // Setup pending, or being redone: the wizard.
    const drawWizard = () => {
      // What an untouched draft stands for: what is saved, else the userConfig.
      const defaults = setup === null ? draftFromConfig(native, target) : draftFromSetup(setup)
      const draft = wizard.draft ?? defaults
      const step = wizard.step
      const number = STEPS.indexOf(step) + 1
      const problem = stepProblem(step, draft)
      const dispatch = async (event: WizardEvent) => {
        await touch($)
        await update($, setupWizard, s => wizardTransition(s, event, defaults))
      }
      // Enter empties a field on screen; a new key redraws it with the draft.
      const keepText = () => {
        inputRev += 1
        $.ui.invalidate('ui.render')
      }

      const confirm = async () => {
        const latest = await read($, setupWizard)
        const built = buildSetup(latest.draft ?? defaults, new Date(await $.clock.now()).toISOString())
        if (built === null) return
        await $.store.set(SETUP_STORE_KEY, built)
        await update($, setupCache, () => ({ isLoaded: true, setup: built }))
        await update($, setupWizard, () => CLOSED_WIZARD)
        $.ui.toast(LABELS.setupSaved)
        // Straight into the lesson, zero clicks.
        await ensureLesson($, built)
      }

      // One row of choice buttons; the picked one is primary. No hotkeys: Tab and Enter.
      const choices = <T extends string | number>(
        prefix: string,
        options: readonly { id: T; label: string }[],
        picked: T,
        pick: (id: T) => unknown,
      ) => (
        <Box flexWrap="wrap" columnGap={1}>
          {options.map(option => (
            <Button
              key={`${prefix}-${option.id}`}
              label={option.label}
              variant={picked === option.id ? 'primary' : 'secondary'}
              onPress={() => pick(option.id)}
            />
          ))}
        </Box>
      )
      const preview = themeByName(draft.theme).colors

      return (
        <Box flexDirection="column">
          <Text bold>{LABELS.setupTitle}</Text>
          <Text dimColor>{LABELS.setupStep(number, STEPS.length)}</Text>
          <Text dimColor>
            {step === 'languages' || step === 'interests'
              ? LABELS.setupHintTyping
              : step === 'level'
                ? LABELS.setupHintLevel
                : LABELS.setupHintButtons}
          </Text>

          {step === 'languages' && (
            <Box flexDirection="column">
              <Text>{LABELS.setupLanguagesAsk}</Text>
              <Input
                key={`native-${inputRev}`}
                label={LABELS.setupNative}
                value={draft.nativeLanguage}
                placeholder={LABELS.setupNativePlaceholder}
                autoFocus
                onInput={value => dispatch({ type: 'set-field', field: 'nativeLanguage', value })}
                onSubmit={value => {
                  dispatch({ type: 'set-field', field: 'nativeLanguage', value: value === '' ? draft.nativeLanguage : value })
                  keepText()
                }}
              />
              <Input
                key={`target-${inputRev}`}
                label={LABELS.setupTarget}
                value={draft.targetLanguage}
                placeholder={LABELS.setupTargetPlaceholder}
                onInput={value => dispatch({ type: 'set-field', field: 'targetLanguage', value })}
                onSubmit={value => {
                  dispatch({ type: 'set-field', field: 'targetLanguage', value: value === '' ? draft.targetLanguage : value })
                  keepText()
                }}
              />
            </Box>
          )}

          {step === 'level' && (
            <Box flexDirection="column">
              <Text>{LABELS.setupLevelAsk(draft.targetLanguage.trim())}</Text>
              <Box flexWrap="wrap" columnGap={1}>
                {LEVELS.map((level, index) => (
                  <Button
                    key={`level-${level}`}
                    label={level}
                    hotkey={String(index + 1)}
                    plain
                    variant={draft.level === level ? 'primary' : 'secondary'}
                    onPress={() => dispatch({ type: 'set-level', level })}
                  />
                ))}
              </Box>
              <Text dimColor>{draft.level === null ? LABELS.setupLevelNone : LABELS.setupLevelPicked(draft.level)}</Text>
            </Box>
          )}

          {step === 'interests' && (
            <Box flexDirection="column">
              <Text>{LABELS.setupInterestsAsk}</Text>
              <Text dimColor>{LABELS.setupInterestsNote}</Text>
              <Input
                key={`interests-${inputRev}`}
                label={LABELS.setupInterests}
                value={draft.interests}
                placeholder={LABELS.setupInterestsPlaceholder}
                autoFocus
                onInput={value => dispatch({ type: 'set-interests', value })}
                onSubmit={value => {
                  dispatch({ type: 'set-interests', value: value === '' ? draft.interests : value })
                  keepText()
                }}
              />
            </Box>
          )}

          {step === 'placement' && (
            <Box flexDirection="column">
              <Text>{LABELS.setupPlacementTitle}</Text>
              <Text dimColor>{LABELS.setupPlacementLater}</Text>
            </Box>
          )}

          {step === 'strategies' && (
            <Box flexDirection="column">
              <Text>{LABELS.setupStrategiesAsk}</Text>
              {STRATEGY_AXES.map(info => (
                <Box key={`axis-${info.axis}`} flexDirection="column">
                  <Text bold>{info.title}</Text>
                  <Box flexWrap="wrap" columnGap={1}>
                    {info.options.map(option =>
                      option.isImplemented ? (
                        <Button
                          key={`${info.axis}-${option.id}`}
                          label={option.label}
                          variant={draft.strategies[info.axis] === option.id ? 'primary' : 'secondary'}
                          onPress={() => dispatch({ type: 'set-strategy', axis: info.axis, id: option.id })}
                        />
                      ) : (
                        <Text key={`soon-${info.axis}-${option.id}`} dimColor>
                          {LABELS.setupComingLater(option.label)}
                        </Text>
                      ),
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {step === 'preferences' && (
            <Box flexDirection="column">
              <Text>{LABELS.setupPreferencesAsk}</Text>
              <Text bold>{LABELS.setupShareTitle}</Text>
              {choices('share', SPLIT_SHARES.map(share => ({ id: share, label: LABELS.setupShare(share) })), draft.splitShare, share =>
                dispatch({ type: 'set-share', share }),
              )}
              <Text bold>{LABELS.setupTutorTitle}</Text>
              {choices('tutor', TUTOR_MODELS, draft.tutorModel, model => dispatch({ type: 'set-tutor', model }))}
              <Text dimColor>{LABELS.setupTutorNote}</Text>
              <Text bold>{LABELS.setupThemeTitle}</Text>
              {choices('theme', THEMES.map(t => ({ id: t.name, label: t.label })), draft.theme, theme =>
                dispatch({ type: 'set-theme', theme }),
              )}
              <Box key="theme-preview" columnGap={1} flexWrap="wrap">
                <Text color={preview.conversation}>conversation</Text>
                <Text color={preview.roleplay}>role-play</Text>
                <Text color={preview.reading}>reading</Text>
                <Text color={preview.tutor}>tutor</Text>
                <Text color={preview.you}>you</Text>
              </Box>
              <Text bold>{LABELS.setupContextTitle}</Text>
              {choices(
                'context',
                [
                  { id: 'off', label: LABELS.setupContextOff },
                  { id: 'on', label: LABELS.setupContextOn },
                ],
                draft.isContextual ? 'on' : 'off',
                id => dispatch({ type: 'set-contextual', isOn: id === 'on' }),
              )}
              <Text dimColor>{LABELS.setupContextNote}</Text>
            </Box>
          )}

          {step === 'summary' && (
            <Box flexDirection="column">
              <Text>{LABELS.setupSummary}</Text>
              <Text>{LABELS.setupSummaryLanguages(draft.targetLanguage.trim(), draft.nativeLanguage.trim(), draft.level ?? '?')}</Text>
              <Text dimColor>{LABELS.setupSummaryInterests(parseInterests(draft.interests))}</Text>
              <Text dimColor>
                {LABELS.setupSummaryLook(
                  draft.splitShare,
                  TUTOR_MODELS.find(m => m.id === draft.tutorModel)?.label ?? draft.tutorModel,
                  themeByName(draft.theme).label,
                )}
              </Text>
              <Text dimColor>{LABELS.setupSummaryContext(draft.isContextual)}</Text>
              {STRATEGY_AXES.map(info => (
                <Text key={`summary-${info.axis}`} dimColor>
                  {info.title}: {info.options.find(o => o.id === draft.strategies[info.axis])?.label ?? draft.strategies[info.axis]}
                </Text>
              ))}
            </Box>
          )}

          <Box marginTop={1} columnGap={1} flexWrap="wrap">
            {step !== 'languages' && <Button key="back" label={LABELS.back} plain onPress={() => dispatch({ type: 'back' })} />}
            {step !== 'placement' && step !== 'summary' && problem === null && (
              <Button key="next" label={LABELS.next} plain onPress={() => dispatch({ type: 'next' })} />
            )}
            {(step === 'placement' || step === 'strategies') && (
              <Button key="skip" label={LABELS.skip} plain onPress={() => dispatch({ type: 'skip' })} />
            )}
            {step === 'summary' && <Button key="confirm" label={LABELS.confirm} variant="primary" autoFocus onPress={confirm} />}
          </Box>
          {problem !== null && <Text dimColor>{problem}</Text>}
        </Box>
      )
    }

    if (setup === null || wizard.isOpen) {
      return (
        <Box flexDirection="column">
          {top}
          {drawWizard()}
        </Box>
      )
    }

    // The lesson, in the theme's colors; dim while the keys are elsewhere.
    const theme = themeByName(setup.theme).colors
    const dim = !isFocused
    const current = await read($, lesson)
    const activityColor = theme[current.activity]
    const chip = (
      <Box columnGap={1}>
        <Text backgroundColor={activityColor} color={theme.bg} bold dimColor={dim}>
          {` ${activityLabel(current.activity)} · ${setup.level} `}
        </Text>
        {current.activity === 'roleplay' && current.unit?.scenario != null && (
          <Text color={theme.roleplay} dimColor={dim}>
            {current.unit.scenario.id === null ? LABELS.madeUpScenario(current.unit.scenario.title) : current.unit.scenario.title}
          </Text>
        )}
        {current.activity === 'reading' && current.reading !== null && current.reading.title !== '' && (
          <Text color={theme.reading} dimColor={dim}>
            {current.reading.title}
          </Text>
        )}
      </Box>
    )
    // Where a role-play happens and who plays whom, under the chip.
    const scene =
      current.activity === 'roleplay' && current.unit?.scenario != null ? (
        <Text color={theme.dim} dimColor={dim} wrap="wrap">
          {LABELS.scene(current.unit.scenario.situation, current.unit.scenario.learnerRole)}
        </Text>
      ) : null

    const openMenu = async () => {
      await touch($)
      await update($, lesson, l => ({ ...l, isMenuOpen: true }))
      await focusKey($, `switch-${current.activity}`)
    }
    const closeMenu = async () => {
      await touch($)
      await update($, lesson, l => ({ ...l, isMenuOpen: false }))
      const field =
        current.activity === 'review'
          ? `answer-${(await read($, practice)).index}`
          : current.activity === 'reading'
            ? 'reading-answer'
            : 'reply'
      await focusKey($, field)
    }
    // An activity left half done is resumed where it was; otherwise it starts.
    const choose = async (activity: LingoActivity) => {
      await touch($)
      const latest = await read($, lesson)
      const session = await read($, practice)
      const isRunning =
        activity === 'review'
          ? session.lesson !== null && session.status !== 'done'
          : activity === 'reading'
            ? latest.reading !== null && latest.reading.summary === null && latest.reading.text !== ''
            : latest.unit !== null && latest.unit.activity === activity && latest.unit.summary === null
      if (!isRunning) return startActivity($, setup, activity)
      await update($, lesson, (l): LingoLesson => ({ ...l, activity, isMenuOpen: false }))
      await focusKey($, activity === 'review' ? `answer-${session.index}` : activity === 'reading' ? 'reading-answer' : 'reply')
    }
    const switchButton = <Button key="switch" label={LABELS.switchActivity} plain dimColor={dim} onPress={openMenu} />

    if (current.isMenuOpen) {
      const menu = ACTIVITIES.filter(a => AVAILABLE_ACTIVITIES.includes(a.id))
      return (
        <Box flexDirection="column">
          {top}
          {chip}
          <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={theme.ring} paddingX={1}>
            {menu.map((a, index) => (
              <Button
                key={`switch-${a.id}`}
                label={a.id === current.activity ? `${a.label} ${LABELS.current}` : a.label}
                hotkey={String(index + 1)}
                plain
                onPress={() => choose(a.id)}
              />
            ))}
            <Button key="switch-back" label={LABELS.backToField} plain dimColor onPress={closeMenu} />
          </Box>
          <Text color={theme.dim}>{LABELS.menuHint(menu.length)}</Text>
        </Box>
      )
    }

    const log = parseActivityLog(await $.store.get(ACTIVITY_STORE_KEY))
    const suggested = suggestActivity(log, AVAILABLE_ACTIVITIES)
    const nextButton = (
      <Button
        key="next-unit"
        label={LABELS.nextActivity(activityLabel(suggested))}
        variant="primary"
        autoFocus
        onPress={async () => {
          await touch($)
          await startActivity($, setup, suggested)
        }}
      />
    )

    // A reading: the text, then one question at a time. An empty Enter shows the
    // answer and makes a card of the question.
    if (current.activity === 'reading') {
      const reading = current.reading
      const question = reading?.questions[reading.index]
      return (
        <Box flexDirection="column">
          {top}
          {chip}
          {reading === null || reading.isPending ? (
            <Text color={theme.dim} dimColor={dim}>
              {LABELS.readingWriting}
            </Text>
          ) : (
            <Box flexDirection="column" marginTop={1}>
              {reading.text !== '' && (
                <Text color={theme.fg} dimColor={dim} wrap="wrap">
                  {reading.text}
                </Text>
              )}
              {reading.text !== '' && (
                <Text color={theme.dim} dimColor={dim}>
                  {LABELS.readingGenerated}
                </Text>
              )}
              {reading.questions.slice(0, reading.index).map((q, at) => (
                <Text key={`answered-${at}`} color={q.outcome === 'right' ? theme.you : theme.err} dimColor={dim}>
                  {LABELS.readingAnswered(at + 1, q.question, q.answer, q.outcome === 'right')}
                </Text>
              ))}
              {question !== undefined && reading.summary === null && (
                <Box flexDirection="column" marginTop={1}>
                  <Text color={theme.fg} bold dimColor={dim}>
                    {LABELS.readingQuestion(reading.index + 1, reading.questions.length, question.question)}
                  </Text>
                  <Box borderStyle="round" borderColor={isFocused ? theme.ring : theme.dim} paddingX={1}>
                    <Input
                      key="reading-answer"
                      placeholder={LABELS.readingPlaceholder}
                      submitLabel={LABELS.reviewSubmit}
                      autoFocus
                      onInput={() => touch($)}
                      onSubmit={async value => {
                        await touch($)
                        await answerQuestion($, value)
                      }}
                    />
                  </Box>
                  {reading.misses > 0 && (
                    <Text color={theme.err} dimColor={dim}>
                      {LABELS.readingNotQuite}
                    </Text>
                  )}
                </Box>
              )}
              {reading.notice !== null && (
                <Text color={theme.err} dimColor={dim}>
                  {reading.notice}
                </Text>
              )}
              {reading.summary !== null && (
                <Text color={theme.you} bold dimColor={dim}>
                  {summaryText(reading.summary, 'reading')}
                </Text>
              )}
            </Box>
          )}
          <Box columnGap={2} marginTop={1} flexWrap="wrap">
            {reading !== null && (reading.summary !== null || (reading.notice !== null && reading.text === '')) && nextButton}
            {reading !== null && reading.text !== '' && (
              <Text color={theme.tutor} dimColor={dim}>
                <Link href={listenUrl(reading.text, setup.targetLanguage, setup.nativeLanguage)}>{LABELS.listen}</Link>
              </Text>
            )}
            {switchButton}
          </Box>
          {question !== undefined && reading?.summary === null && (
            <Text color={theme.dim} dimColor={dim}>
              {LABELS.readingHint}
            </Text>
          )}
        </Box>
      )
    }

    if (current.activity === 'review') {
      return (
        <Box flexDirection="column">
          {top}
          {chip}
          {await drawReview()}
          <Box marginTop={1}>{switchButton}</Box>
        </Box>
      )
    }

    const unit = current.unit

    // Nothing in progress (a reset state): the suggested activity, one press away.
    if (unit === null) {
      return (
        <Box flexDirection="column">
          {top}
          {chip}
          <Box marginTop={1} columnGap={2}>
            {nextButton}
            {switchButton}
          </Box>
        </Box>
      )
    }

    const lastTutor = [...unit.lines].reverse().find(l => l.who === 'tutor')
    const hint = unit.summary === null ? levelHintLine(null) : levelHintLine(levelHint(log, setup.level))
    function levelHintLine(found: ReturnType<typeof levelHint>) {
      return found === null ? null : LABELS.levelHint(found.direction, found.level)
    }

    return (
      <Box flexDirection="column">
        {top}
        {chip}
        {scene}
        <Box flexDirection="column" marginTop={1}>
          {unit.lines.map((line, index) =>
            line.who === 'tutor' ? (
              <Text key={`line-${index}`} color={theme.fg} dimColor={dim}>
                <Text color={theme.tutor} bold>
                  {LABELS.tutor}
                </Text>
                {markedParts(line.text, line.mark).map(([part, isMark], at) =>
                  isMark ? (
                    <Text key={`mark-${at}`} color={theme.err} underline>
                      {part}
                    </Text>
                  ) : (
                    part
                  ),
                )}
              </Text>
            ) : line.who === 'you' ? (
              <Text key={`line-${index}`} color={theme.fg} dimColor={dim}>
                <Text color={theme.you} bold>
                  {LABELS.you}
                </Text>
                {line.text}
              </Text>
            ) : (
              <Text key={`line-${index}`} color={theme.dim} italic dimColor={dim}>
                {LABELS.help}
                {line.text}
              </Text>
            ),
          )}
          {unit.pending !== null && (
            <Text color={theme.dim} dimColor={dim}>
              {LABELS.tutorThinking}
            </Text>
          )}
          {unit.notice !== null && (
            <Text color={theme.err} dimColor={dim}>
              {unit.notice}
            </Text>
          )}
        </Box>

        {unit.summary === null ? (
          <Box flexDirection="column" marginTop={1}>
            <Box borderStyle="round" borderColor={isFocused ? theme.ring : theme.dim} paddingX={1}>
              <Input
                key="reply"
                placeholder={LABELS.replyPlaceholder(setup.targetLanguage)}
                submitLabel={LABELS.replySubmit}
                autoFocus
                onInput={() => touch($)}
                onSubmit={async value => {
                  await touch($)
                  if (value.trim() === '') return sendHelp($, setup)
                  return sendReply($, setup, value)
                }}
              />
            </Box>
            <Box columnGap={2} flexWrap="wrap">
              {lastTutor !== undefined && (
                <Text color={theme.tutor} dimColor={dim}>
                  <Link href={listenUrl(lastTutor.text, setup.targetLanguage, setup.nativeLanguage)}>{LABELS.listen}</Link>
                </Text>
              )}
              {switchButton}
            </Box>
            <Text color={theme.dim} dimColor={dim}>
              {isAwaitingLearner(unit) ? LABELS.talkHint : LABELS.talkHintWaiting}
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.you} bold dimColor={dim}>
              {summaryText(unit.summary, unit.activity)}
            </Text>
            {hint !== null && (
              <Text color={theme.tutor} dimColor={dim}>
                {hint}
              </Text>
            )}
            <Box columnGap={2} marginTop={1}>
              {nextButton}
              {switchButton}
            </Box>
          </Box>
        )}
      </Box>
    )

    // The review: the built-in pack, card by card. An empty Enter shows the answer
    // (a miss); no letter hotkeys, since the field takes every printable key.
    async function drawReview() {
      const learner = setup as LingoSetup
      const session = await read($, practice)
      const progress = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
      const mistakes = parseMistakes(await $.store.get(MISTAKES_STORE_KEY))
      const mistakeOf = (id: string | undefined) => mistakes.cards.find(c => c.id === id)
      const cardOf = (id: string | undefined) => {
        const mistake = mistakeOf(id)
        return mistake === undefined ? DEMO_CARDS.find(c => c.id === id) : mistakeAsCard(mistake)
      }
      const card = session.lesson === null ? undefined : cardOf(session.queue[session.index])
      const cardMistake = session.lesson === null ? undefined : mistakeOf(session.queue[session.index])
      const color = { color: theme.fg, dimColor: dim }

      const start = async () => {
        await touch($)
        const latest = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
        const queue = await reviewQueue($)
        await update($, practice, () => startPractice(queue, latest.currentLesson))
        await focusKey($, 'answer-0')
      }

      // Every attempt is recorded: a mistake card's in the mistakes, a pack card's in the progress.
      const record = async (cardId: string, isCorrect: boolean) => {
        const at = await nowIso($)
        if (mistakeOf(cardId) !== undefined) {
          const latest = parseMistakes(await $.store.get(MISTAKES_STORE_KEY))
          await $.store.set(MISTAKES_STORE_KEY, recordMistakeReview(latest, cardId, at, isCorrect))
          return
        }
        const latest = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
        await $.store.set(PROGRESS_STORE_KEY, recordAttempt(latest, cardId, at, isCorrect))
      }

      const showAnswer = async () => {
        const latest = await read($, practice)
        const current = cardOf(latest.queue[latest.index])
        if (latest.status !== 'asking' || current === undefined) return
        // Giving up on a card never tried counts as a miss.
        if (latest.misses === 0) await record(current.id, false)
        await update($, practice, s => reveal(s))
        await focusKey($, 'next')
      }

      const submit = async (value: string) => {
        await touch($)
        if (value.trim() === '') return showAnswer()
        const latest = await read($, practice)
        const current = cardOf(latest.queue[latest.index])
        if (latest.status !== 'asking' || current === undefined) return
        const isCorrect = isCorrectAnswer(value, current.answer)
        await record(current.id, isCorrect)
        await update($, practice, s => afterAnswer(s, isCorrect, current.answer, value.trim()))
        if (isCorrect) await focusKey($, 'next')
      }

      const next = async () => {
        await touch($)
        const latest = await read($, practice)
        if (latest.status !== 'correct' && latest.status !== 'revealed') return
        const advanced = nextCard(latest)
        if (advanced.status === 'done') {
          // Finishing the lesson being studied moves the learner on, once.
          const stored = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
          if (latest.lesson === stored.currentLesson) {
            await $.store.set(PROGRESS_STORE_KEY, advanceLesson(stored, DEMO_LESSON_COUNT))
          }
        }
        await update($, practice, () => advanced)
        // The button that was pressed holds the ring: hand it to the new field.
        await focusKey($, advanced.status === 'asking' ? `answer-${advanced.index}` : 'continue')
      }

      const askTutor = async () => {
        await touch($)
        const latest = await read($, practice)
        const current = cardOf(latest.queue[latest.index])
        if (latest.status !== 'asking' || current === undefined || latest.tutor.kind === 'loading') return
        await update($, practice, (s): LingoPractice => ({ ...s, tutor: { kind: 'loading' } }))

        const reply = await $.model.complete({
          model: 'haiku',
          system: socratic.instruction({ targetLanguage: learner.targetLanguage, nativeLanguage: learner.nativeLanguage }),
          prompt: tutorPrompt(current, latest.lastAnswer ?? '(nothing yet)', learner.targetLanguage, learner.nativeLanguage),
          effort: 'low',
          maxTokens: 200,
          timeoutMs: HINT_TIMEOUT_MS,
        })

        // The learner may have moved on while the model thought: drop the reply.
        const after = await read($, practice)
        if (after.index !== latest.index || after.status !== 'asking') return
        const tutor: LingoTutorState = !reply.isAnswered
          ? { kind: 'unavailable', text: LABELS.hintUnavailable }
          : leaksAnswer(reply.text, current.answer)
            ? { kind: 'unavailable', text: LABELS.hintLeaked }
            : { kind: 'answered', text: reply.text.trim() }
        await update($, practice, s => ({ ...s, tutor }))
      }

      const isDemoPair = learner.targetLanguage.toLowerCase() === 'english' && learner.nativeLanguage.toLowerCase() === 'spanish'
      const packNote = !isDemoPair && (
        <Text color={theme.dim} dimColor={dim}>
          {LABELS.reviewPackNote(DEMO_PACK_TITLE)}
        </Text>
      )

      if (session.lesson === null) {
        const finished = isFinished(progress, DEMO_LESSON_COUNT)
        const queue = await reviewQueue($)
        const isEmpty = queue.recall.length + queue.fresh.length === 0
        return (
          <Box flexDirection="column" marginTop={1}>
            {packNote}
            <Text {...color}>
              {isEmpty
                ? LABELS.reviewDemoFinished(DEMO_LESSON_COUNT)
                : finished
                  ? LABELS.reviewMistakesIntro(queue.recall.length)
                  : LABELS.reviewLessonIntro(progress.currentLesson, DEMO_LESSON_COUNT, queue.recall.length, queue.fresh.length)}
            </Text>
            {!isEmpty && <Button key="start" label={LABELS.reviewStart} variant="primary" autoFocus onPress={start} />}
          </Box>
        )
      }

      if (session.status === 'done') {
        return (
          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.you} bold dimColor={dim}>
              {session.lesson > DEMO_LESSON_COUNT ? LABELS.reviewDone : LABELS.reviewLessonDone(session.lesson)}
            </Text>
            {session.lesson >= DEMO_LESSON_COUNT && <Text {...color}>{LABELS.reviewDemoLast}</Text>}
            <Button
              key="continue"
              label={LABELS.reviewContinue}
              variant="primary"
              autoFocus
              onPress={async () => {
                await touch($)
                await update($, practice, () => IDLE_PRACTICE)
              }}
            />
          </Box>
        )
      }

      const isRecall = session.index < session.recallCount
      return (
        <Box flexDirection="column" marginTop={1}>
          {packNote}
          <Text color={theme.dim} dimColor={dim}>
            {cardMistake !== undefined
              ? LABELS.reviewMistakeOf(session.index + 1, session.queue.length)
              : LABELS.reviewCardOf(session.lesson, session.index + 1, session.queue.length, isRecall)}
          </Text>
          {cardMistake === undefined ? (
            <Text color={theme.fg} bold dimColor={dim}>
              {card?.prompt ?? '?'}
            </Text>
          ) : (
            // The learner's own line, the wrong words marked: type the right ones.
            <Text color={theme.fg} bold dimColor={dim}>
              {markedParts(cardMistake.sentence, cardMistake.wrong).map(([part, isMark], at) =>
                isMark ? (
                  <Text key={`mark-${at}`} color={theme.err} underline>
                    {part}
                  </Text>
                ) : (
                  part
                ),
              )}
            </Text>
          )}
          {cardMistake !== undefined && session.status === 'revealed' && cardMistake.note !== '' && (
            <Text color={theme.dim} dimColor={dim}>
              {cardMistake.note}
            </Text>
          )}

          {session.status === 'asking' && (
            <Box flexDirection="column">
              <Box borderStyle="round" borderColor={isFocused ? theme.ring : theme.dim} paddingX={1}>
                <Input
                  key={`answer-${session.index}`}
                  label={LABELS.reviewIn(learner.targetLanguage)}
                  placeholder={LABELS.reviewPlaceholder}
                  submitLabel={LABELS.reviewSubmit}
                  autoFocus
                  onInput={() => touch($)}
                  onSubmit={submit}
                />
              </Box>
              {session.hint !== null && (
                <Text color={theme.err} dimColor={dim}>
                  {LABELS.reviewNotYet(session.hint)}
                </Text>
              )}
              <Box columnGap={2}>
                <Button key="tutor" label={LABELS.reviewHintFromTutor} plain dimColor={dim} onPress={askTutor} />
              </Box>
              {session.tutor.kind === 'loading' && <Text color={theme.dim}>{LABELS.tutorThinking}</Text>}
              {session.tutor.kind === 'answered' && (
                <Text color={theme.fg} dimColor={dim}>
                  <Text color={theme.tutor} bold>
                    {LABELS.tutor}
                  </Text>
                  {session.tutor.text}
                </Text>
              )}
              {session.tutor.kind === 'unavailable' && <Text color={theme.dim}>{session.tutor.text}</Text>}
              <Text color={theme.dim} dimColor={dim}>
                {LABELS.reviewHint}
              </Text>
            </Box>
          )}

          {session.status !== 'asking' && (
            <Box flexDirection="column">
              {session.status === 'correct' ? (
                <Text color={theme.you} bold dimColor={dim}>
                  {LABELS.reviewCorrect(card?.answer ?? '')}
                </Text>
              ) : (
                <Text {...color}>{LABELS.reviewAnswer(card?.answer ?? '')}</Text>
              )}
              <Button key="next" label={LABELS.next} variant="primary" autoFocus onPress={next} />
            </Box>
          )}
        </Box>
      )
    }
  })
}
