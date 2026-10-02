import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { microLesson, spinnerSuffix } from '../src/microcards'
import {
  CLOSE_DELAY_MS,
  INITIAL_WAIT,
  SHOW_DELAY_MS,
  isLessonVisible,
  isOfferVisible,
  ownsOpenPane,
  transition,
} from '../src/wait-machine'

const PANE = 'lingo'

// Waiting-state trigger, kept in `$.state` so the Spinner and the band above
// the prompt redraw when it changes (contract: types/index.d.ts).
const wait = atom({ plugin: 'lingo-pane', key: 'wait' } as const, INITIAL_WAIT)

export const register: Register = (on, options) => {
  const target = String(options.targetLanguage)
  const native = String(options.nativeLanguage)
  const shouldOpenPane = options.openPaneWhileWaiting === true

  // Timer handles live in module variables: a hot reload drops them together
  // with the timers themselves (the engine cancels pending waits on reload).
  let delayTimer: { cancel: () => void } | null = null
  let closeTimer: { cancel: () => void } | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lingo',
      description: 'Open the live language lesson pane',
    })

    return next(e)
  })

  on('command.run', { command: 'lingo' }, async $ => {
    await $.ui.open({ id: PANE, title: 'lingo-pane' })

    return {}
  })

  // --- Busy detection -------------------------------------------------------

  // `turn.start` is raised for the main loop only (a subagent's run raises none).
  on('turn.start', async ($, e, next) => {
    delayTimer?.cancel()
    closeTimer?.cancel()
    await update($, wait, s => transition(s, { type: 'turn-start', turnId: e.turnId }))

    const turnId = e.turnId
    delayTimer = $.clock.after(SHOW_DELAY_MS, async () => {
      await update($, wait, s => transition(s, { type: 'delay-elapsed', turnId }))
      if (!shouldOpenPane) return

      // Only if still showing (not retired for a permission ask meanwhile) and
      // not a pane the person already has open.
      const state = await read($, wait)
      const panes = await $.ui.panes()
      if (state.phase !== 'showing' || panes.some(p => p.id === PANE)) return

      // Opened by a timer, so it is placed only from 144 columns.
      const opened = await $.ui.open({ id: PANE, title: 'lingo-pane' })
      if (opened.isPlaced) {
        await update($, wait, s => transition(s, { type: 'pane-placed' }))
      } else {
        // It would sit undrawn: drop it and offer a button above the prompt.
        await $.ui.close({ id: PANE })
        await update($, wait, s => transition(s, { type: 'pane-not-placed' }))
      }
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn also reaches this hook; only the main loop's counts.
    if (e.agentId !== undefined) return next(e)

    const turnId = e.turnId
    const before = await read($, wait)
    const complete = { type: 'turn-complete', turnId, isAborted: e.isAborted } as const
    const isCounting = transition(before, complete).phase === 'closing'
    delayTimer?.cancel()
    closeTimer?.cancel()
    await update($, wait, s => transition(s, complete))

    if (isCounting) {
      closeTimer = $.clock.after(CLOSE_DELAY_MS, async () => {
        const state = await read($, wait)
        await update($, wait, s => transition(s, { type: 'countdown-elapsed', turnId }))
        if (ownsOpenPane(state)) await $.ui.close({ id: PANE })
      })
    } else if (ownsOpenPane(before)) {
      await $.ui.close({ id: PANE })
    }

    return next(e)
  })

  // --- Do not cover what the person must answer ----------------------------

  // A real tool call the mode decider will put to the person (a permission ask).
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'ask' || e.tool_use_id === undefined) return verdict

    delayTimer?.cancel()
    const state = await read($, wait)
    await update($, wait, s => transition(s, { type: 'needs-user' }))
    if (ownsOpenPane(state)) {
      await $.ui.close({ id: PANE })
      await update($, wait, s => transition(s, { type: 'pane-closed' }))
    }

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    if (String(e.tool) !== 'AskUserQuestion') {
      // A tool is running, so whatever asked before has been answered.
      await update($, wait, s => transition(s, { type: 'user-answered' }))
      return next(e)
    }

    delayTimer?.cancel()
    const state = await read($, wait)
    await update($, wait, s => transition(s, { type: 'needs-user' }))
    if (ownsOpenPane(state)) {
      await $.ui.close({ id: PANE })
      await update($, wait, s => transition(s, { type: 'pane-closed' }))
    }

    // The call resolves once the question has been answered.
    const answered = await next(e)
    await update($, wait, s => transition(s, { type: 'user-answered' }))

    return answered
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      await update($, wait, s => transition(s, { type: 'pane-closed' }))
    }

    return next(e)
  })

  // --- What is drawn --------------------------------------------------------

  // One micro-lesson per turn in the Spinner's suffix: no pane, any terminal.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const state = await read($, wait)
    if (!isLessonVisible(state) || state.turnId === null) return next(e)

    const suffix = spinnerSuffix(microLesson(target, native, state.turnId))

    return next({ ...e, props: { ...e.props, suffix } })
  })

  // Width fallback: the pane the mod opened was not placed, so offer it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, wait)
    if (e.props.hasSurvey || !isOfferVisible(state)) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>lingo-pane: </Text>
        <Button
          key="open-lingo"
          label="Open the lesson pane"
          hotkey="1"
          onPress={async () => {
            await update($, wait, s => transition(s, { type: 'offer-taken' }))
            // Opened by a press, so it is placed at any width.
            await $.ui.open({ id: PANE, title: 'lingo-pane' })
          }}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text bold>lingo-pane</Text>
        <Text>
          Learning {target} from {native}.
        </Text>
        <Text dimColor>Skeleton only: lessons are not built yet.</Text>
      </Box>
    )
  })
}
