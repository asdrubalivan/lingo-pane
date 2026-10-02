import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { parseLingoArgs, unknownSubcommandText } from '../src/command'
import { microLesson, spinnerSuffix } from '../src/microcards'
import {
  CLOSED_WIZARD,
  LEVELS,
  SETUP_STORE_KEY,
  STEPS,
  STRATEGY_AXES,
  buildSetup,
  draftFromConfig,
  draftFromSetup,
  parseSetup,
  resolveSetup,
  stepProblem,
  wizardTransition,
} from '../src/setup'
import type { WizardEvent } from '../src/setup'
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

// Guided setup (contract: types/index.d.ts). The saved setup lives in `$.store`
// (the source of truth); `setupCache` mirrors it so the band and the Spinner
// redraw when it changes, and `$.state` resets on /clear, hence the fallback to
// the store whenever the mirror is not loaded.
const setupWizard = atom({ plugin: 'lingo-pane', key: 'setupWizard' } as const, CLOSED_WIZARD)
const setupCache = atom({ plugin: 'lingo-pane', key: 'setupCache' } as const, { isLoaded: false, setup: null })
const setupBand = atom({ plugin: 'lingo-pane', key: 'setupBand' } as const, { isHidden: false })

const PENDING_TOAST = 'lingo-pane: setup pending. Run /lingo setup (or press 2 in the band above the prompt).'

export const register: Register = (on, options) => {
  const target = String(options.targetLanguage)
  const native = String(options.nativeLanguage)
  const shouldOpenPane = options.openPaneWhileWaiting === true

  // Timer handles live in module variables: a hot reload drops them together
  // with the timers themselves (the engine cancels pending waits on reload).
  let delayTimer: { cancel: () => void } | null = null
  let closeTimer: { cancel: () => void } | null = null
  // Bumped on Enter in a wizard field so the field is drawn again with its text.
  let inputRev = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lingo',
      description: 'Open the lesson pane; "/lingo setup" runs the guided setup',
    })

    // Load what is saved into the mirror; a missing or unreadable value is pending.
    const setup = parseSetup(await $.store.get(SETUP_STORE_KEY))
    await update($, setupCache, () => ({ isLoaded: true, setup }))
    if (setup === null) $.ui.toast(PENDING_TOAST)

    return next(e)
  })

  // /clear, /resume and /branch start a new session without `session.start`
  // (the process goes on) and reset `$.state`: reload the mirror from the store
  // and remind again, since the band's "Later" was forgotten with the state.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'startup' || e.source === 'compact') return next(e)

    const setup = parseSetup(await $.store.get(SETUP_STORE_KEY))
    await update($, setupCache, () => ({ isLoaded: true, setup }))
    if (setup === null) $.ui.toast(PENDING_TOAST)

    return next(e)
  })

  on('command.run', { command: 'lingo' }, async ($, e) => {
    const parsed = parseLingoArgs(e.args)
    if (parsed.kind === 'unknown') return { text: unknownSubcommandText(parsed.name) }

    const cache = await read($, setupCache)
    const setup = resolveSetup(cache, await $.store.get(SETUP_STORE_KEY))

    if (parsed.kind === 'setup') {
      // Always the wizard, never a toggle: re-running it resumes where it was.
      await update($, setupWizard, s => wizardTransition(s, { type: 'open' }, draftFromConfig(native, target)))
      await $.ui.open({ id: PANE, title: 'lingo-pane', focus: true })
      return {}
    }

    // A second /lingo closes a pane that is up and drawn (the person's toggle).
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE && p.isPlaced)) {
      await $.ui.close({ id: PANE })
      await update($, wait, s => transition(s, { type: 'pane-closed' }))
      return {}
    }

    // Pending setup: the pane shows the wizard, so ask for the keyboard too.
    if (setup === null) {
      await $.ui.open({ id: PANE, title: 'lingo-pane', focus: true })
    } else {
      await $.ui.open({ id: PANE, title: 'lingo-pane' })
    }

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

    // Nothing to teach until the setup says which languages and level.
    const setup = resolveSetup(await read($, setupCache), await $.store.get(SETUP_STORE_KEY))
    if (setup === null) return next(e)

    const suffix = spinnerSuffix(microLesson(setup.targetLanguage, setup.nativeLanguage, state.turnId))

    return next({ ...e, props: { ...e.props, suffix } })
  })

  // The band above the prompt: the setup reminder while setup is pending, and the
  // width fallback (the pane the mod opened was not placed, so offer it).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const state = await read($, wait)
    const setup = resolveSetup(await read($, setupCache), await $.store.get(SETUP_STORE_KEY))
    const band = await read($, setupBand)
    const isSetupShown = setup === null && !band.isHidden
    const isOfferShown = isOfferVisible(state)
    if (!isSetupShown && !isOfferShown) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {isSetupShown && (
          <Box>
            <Text dimColor>lingo-pane: setup pending. </Text>
            <Button
              key="setup-start"
              label="Start setup (2)"
              hotkey="2"
              variant="primary"
              onPress={async () => {
                await update($, setupWizard, s => wizardTransition(s, { type: 'open' }, draftFromConfig(native, target)))
                // Opened by a press, so it is placed at any width.
                await $.ui.open({ id: PANE, title: 'lingo-pane', focus: true })
              }}
            />
            <Text> </Text>
            <Button
              key="setup-later"
              label="Later (3)"
              hotkey="3"
              onPress={() => update($, setupBand, () => ({ isHidden: true }))}
            />
          </Box>
        )}
        {isOfferShown && (
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
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const setup = resolveSetup(await read($, setupCache), await $.store.get(SETUP_STORE_KEY))
    const wizard = await read($, setupWizard)

    if (e.surface === 'mobile') {
      // The mobile app draws no Input yet, so the wizard cannot run there.
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text bold>lingo-pane</Text>
          <Text dimColor>
            {setup === null ? 'Setup needs a terminal or the desktop app.' : `Learning ${setup.targetLanguage} from ${setup.nativeLanguage}.`}
          </Text>
        </Box>
      )
    }

    const { Box, Button, Input, Text } = $.ui.resolve(e)

    // Setup pending, or being redone: the wizard. Otherwise the greeting.
    if (setup !== null && !wizard.isOpen) {
      return (
        <Box flexDirection="column">
          <Text bold>lingo-pane</Text>
          <Text>
            Learning {setup.targetLanguage} from {setup.nativeLanguage}, level {setup.level}.
          </Text>
          <Text dimColor>Skeleton only: lessons are not built yet. /lingo setup changes your choices.</Text>
        </Box>
      )
    }

    // What an untouched draft stands for: what is saved, else the userConfig.
    const defaults = setup === null ? draftFromConfig(native, target) : draftFromSetup(setup)
    const draft = wizard.draft ?? defaults
    const step = wizard.step
    const number = STEPS.indexOf(step) + 1
    const problem = stepProblem(step, draft)
    const dispatch = (event: WizardEvent) =>
      update($, setupWizard, s => wizardTransition(s, event, defaults))

    const confirm = async () => {
      const latest = await read($, setupWizard)
      const built = buildSetup(latest.draft ?? defaults, new Date(await $.clock.now()).toISOString())
      if (built === null) return
      await $.store.set(SETUP_STORE_KEY, built)
      await update($, setupCache, () => ({ isLoaded: true, setup: built }))
      await update($, setupWizard, () => CLOSED_WIZARD)
      $.ui.toast('lingo-pane: setup saved')
    }

    return (
      <Box flexDirection="column">
        <Text bold>lingo-pane setup</Text>
        <Text dimColor>
          Step {number} of {STEPS.length}
        </Text>
        <Text dimColor>
          {step === 'languages'
            ? 'Type, Enter keeps the text, Tab moves to the next field or button.'
            : 'Tab moves between buttons and Enter presses, or press the key shown.'}
        </Text>

        {step === 'languages' && (
          <Box flexDirection="column">
            <Text>Which languages? The explanations are in your native language.</Text>
            <Input
              key={`native-${inputRev}`}
              label="Native language: "
              value={draft.nativeLanguage}
              placeholder="e.g. Spanish"
              autoFocus
              onInput={value => dispatch({ type: 'set-field', field: 'nativeLanguage', value })}
              onSubmit={value => {
                dispatch({ type: 'set-field', field: 'nativeLanguage', value: value === '' ? draft.nativeLanguage : value })
                // Enter empties the field on screen; a new key redraws it with the draft.
                inputRev += 1
                $.ui.invalidate('ui.render')
              }}
            />
            <Input
              key={`target-${inputRev}`}
              label="Target language: "
              value={draft.targetLanguage}
              placeholder="e.g. English"
              onInput={value => dispatch({ type: 'set-field', field: 'targetLanguage', value })}
              onSubmit={value => {
                dispatch({ type: 'set-field', field: 'targetLanguage', value: value === '' ? draft.targetLanguage : value })
                // Enter empties the field on screen; a new key redraws it with the draft.
                inputRev += 1
                $.ui.invalidate('ui.render')
              }}
            />
          </Box>
        )}

        {step === 'level' && (
          <Box flexDirection="column">
            <Text>Your level in {draft.targetLanguage.trim()} (CEFR):</Text>
            <Box>
              {LEVELS.map((level, index) => (
                <Box key={`box-${level}`} marginRight={1}>
                  <Button
                    key={`level-${level}`}
                    label={level}
                    hotkey={String(index + 1)}
                    plain
                    variant={draft.level === level ? 'primary' : 'secondary'}
                    onPress={() => dispatch({ type: 'set-level', level })}
                  />
                </Box>
              ))}
            </Box>
            <Text dimColor>{draft.level === null ? 'None picked yet.' : `Picked: ${draft.level}`}</Text>
          </Box>
        )}

        {step === 'placement' && (
          <Box flexDirection="column">
            <Text>Placement test (optional)</Text>
            <Text dimColor>placement test: coming later</Text>
            <Button key="skip" label="Skip" hotkey="s" plain onPress={() => dispatch({ type: 'skip' })} />
          </Box>
        )}

        {step === 'strategies' && (
          <Box flexDirection="column">
            <Text>How should it work? Defaults are fine; "coming later" ones are not built yet.</Text>
            {STRATEGY_AXES.map(info => (
              <Box key={`axis-${info.axis}`} flexDirection="column">
                <Text bold>{info.title}</Text>
                <Box flexWrap="wrap">
                  {info.options.map(option =>
                    option.isImplemented ? (
                      <Box key={`box-${info.axis}-${option.id}`} marginRight={1}>
                        <Button
                          key={`${info.axis}-${option.id}`}
                          label={option.label}
                          variant={draft.strategies[info.axis] === option.id ? 'primary' : 'secondary'}
                          onPress={() => dispatch({ type: 'set-strategy', axis: info.axis, id: option.id })}
                        />
                      </Box>
                    ) : (
                      <Box key={`box-${info.axis}-${option.id}`} marginRight={1}>
                        <Text dimColor>{option.label} (coming later)</Text>
                      </Box>
                    ),
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {step === 'summary' && (
          <Box flexDirection="column">
            <Text>Summary</Text>
            <Text>
              {draft.targetLanguage.trim()} from {draft.nativeLanguage.trim()}, level {draft.level ?? '?'}
            </Text>
            {STRATEGY_AXES.map(info => (
              <Text key={`summary-${info.axis}`} dimColor>
                {info.title}: {info.options.find(o => o.id === draft.strategies[info.axis])?.label ?? draft.strategies[info.axis]}
              </Text>
            ))}
            <Button key="confirm" label="Confirm" hotkey="c" plain onPress={confirm} />
          </Box>
        )}

        <Box marginTop={1}>
          {step !== 'languages' && (
            <Box marginRight={1}>
              <Button key="back" label="Back" hotkey="b" plain onPress={() => dispatch({ type: 'back' })} />
            </Box>
          )}
          {(step === 'languages' || step === 'level' || step === 'strategies') && problem === null && (
            <Box marginRight={1}>
              <Button key="next" label="Next" hotkey="n" plain onPress={() => dispatch({ type: 'next' })} />
            </Box>
          )}
          {step === 'strategies' && (
            <Button key="skip" label="Skip" hotkey="s" plain onPress={() => dispatch({ type: 'skip' })} />
          )}
        </Box>
        {problem !== null && <Text dimColor>{problem}</Text>}
      </Box>
    )
  })
}
