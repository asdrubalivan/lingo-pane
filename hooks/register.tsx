import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { DEMO_CARDS, DEMO_LESSON_COUNT, DEMO_PACK_TITLE } from '../src/content/demo-english-a1'
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

// The practice session in the pane (contract: types/index.d.ts). Progress lives
// in `$.store` under `progress`; this is only where the learner is right now.
const practice = atom({ plugin: 'lingo-pane', key: 'practice' } as const, IDLE_PRACTICE)

const TUTOR_TIMEOUT_MS = 20000


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
      description: 'Open the lesson pane; "/lingo setup" runs the guided setup; "/lingo theme <name>" switches colors',
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

    const cache = await read($, setupCache)
    const setup = resolveSetup(cache, await $.store.get(SETUP_STORE_KEY))

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

    // The practice needs the keyboard too (the answer field and the hotkeys).
    await $.ui.open({ id: PANE, title: 'lingo-pane', focus: true })

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

    // Setup pending, or being redone: the wizard. Otherwise the practice.
    if (setup !== null && !wizard.isOpen) {
      const session = await read($, practice)
      const progress = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
      const nowIso = async () => new Date(await $.clock.now()).toISOString()
      const cardOf = (id: string | undefined) => DEMO_CARDS.find(c => c.id === id)
      const card = session.lesson === null ? undefined : cardOf(session.queue[session.index])

      const start = async () => {
        const latest = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
        const queue = buildQueue(DEMO_CARDS, latest, new Date(await $.clock.now()))
        await update($, practice, () => startPractice(queue, latest.currentLesson))
      }

      // Every attempt goes into the progress: re-read, add, write.
      const record = async (cardId: string, isCorrect: boolean) => {
        const latest = parseProgress(await $.store.get(PROGRESS_STORE_KEY))
        await $.store.set(PROGRESS_STORE_KEY, recordAttempt(latest, cardId, await nowIso(), isCorrect))
      }

      const submit = async (value: string) => {
        const latest = await read($, practice)
        const current = cardOf(latest.queue[latest.index])
        if (latest.status !== 'asking' || current === undefined || value.trim() === '') return
        const isCorrect = isCorrectAnswer(value, current.answer)
        await record(current.id, isCorrect)
        await update($, practice, s => afterAnswer(s, isCorrect, current.answer, value.trim()))
      }

      const showAnswer = async () => {
        const latest = await read($, practice)
        const current = cardOf(latest.queue[latest.index])
        if (latest.status !== 'asking' || current === undefined) return
        // Giving up on a card never tried counts as a miss.
        if (latest.misses === 0) await record(current.id, false)
        await update($, practice, s => reveal(s))
      }

      const next = async () => {
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
        if (advanced.status === 'asking') {
          // Never worth failing the press over (a pane drawn without the keyboard denies it).
          await $.ui.focus({ requestId: PANE, key: `answer-${advanced.index}` }).catch(() => undefined)
        }
      }

      const askTutor = async () => {
        const latest = await read($, practice)
        const current = cardOf(latest.queue[latest.index])
        if (latest.status !== 'asking' || current === undefined || latest.tutor.kind === 'loading') return
        await update($, practice, s => ({ ...s, tutor: { kind: 'loading' } }))

        const reply = await $.model.complete({
          model: 'haiku',
          system: socratic.instruction({ targetLanguage: setup.targetLanguage, nativeLanguage: setup.nativeLanguage }),
          prompt: tutorPrompt(current, latest.lastAnswer ?? '(nothing yet)', setup.targetLanguage, setup.nativeLanguage),
          effort: 'low',
          maxTokens: 200,
          timeoutMs: TUTOR_TIMEOUT_MS,
        })

        // The learner may have moved on while the model thought: drop the reply.
        const after = await read($, practice)
        if (after.index !== latest.index || after.status !== 'asking') return
        if (!reply.isAnswered) {
          await update($, practice, s => ({ ...s, tutor: { kind: 'unavailable', text: 'The tutor is not available right now. Use the hint above or try again.' } }))
        } else if (leaksAnswer(reply.text, current.answer)) {
          await update($, practice, s => ({ ...s, tutor: { kind: 'unavailable', text: 'The tutor reply would have given the answer away, so it was dropped. Try again or look at the hint.' } }))
        } else {
          await update($, practice, s => ({ ...s, tutor: { kind: 'answered', text: reply.text.trim() } }))
        }
      }

      const finished = isFinished(progress, DEMO_LESSON_COUNT)
      const isDemoPair = setup.targetLanguage.toLowerCase() === 'english' && setup.nativeLanguage.toLowerCase() === 'spanish'
      const header = (
        <Box flexDirection="column">
          <Text bold>lingo-pane</Text>
          <Text>
            Learning {setup.targetLanguage} from {setup.nativeLanguage}, level {setup.level}. /lingo setup changes your choices.
          </Text>
          {!isDemoPair && (
            <Text dimColor>The built-in pack is {DEMO_PACK_TITLE}; it will be used for now.</Text>
          )}
        </Box>
      )

      if (session.lesson === null) {
        const queue = buildQueue(DEMO_CARDS, progress, new Date(await $.clock.now()))
        return (
          <Box flexDirection="column">
            {header}
            <Box marginTop={1} flexDirection="column">
              {finished ? (
                <Text>Demo finished: all {DEMO_LESSON_COUNT} lessons are done. Come back to review, or wait for the lesson generator.</Text>
              ) : (
                <Text>
                  Lesson {progress.currentLesson} of {DEMO_LESSON_COUNT}: {queue.recall.length} to recall, {queue.fresh.length} new.
                </Text>
              )}
              {!finished && <Button key="start" label="Start lesson" hotkey="s" plain onPress={start} />}
              <Text dimColor>Tab moves between the field and the buttons; press the key shown.</Text>
            </Box>
          </Box>
        )
      }

      if (session.status === 'done') {
        const isLast = session.lesson >= DEMO_LESSON_COUNT
        return (
          <Box flexDirection="column">
            {header}
            <Box marginTop={1} flexDirection="column">
              <Text bold color="green">Lesson {session.lesson} done</Text>
              {isLast && <Text>Demo finished: that was the last lesson.</Text>}
              <Button key="continue" label="Continue" hotkey="c" plain onPress={() => update($, practice, () => IDLE_PRACTICE)} />
            </Box>
          </Box>
        )
      }

      const isRecall = session.index < session.recallCount
      return (
        <Box flexDirection="column">
          {header}
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              Lesson {session.lesson} - card {session.index + 1} of {session.queue.length} ({isRecall ? 'recall' : 'new'})
            </Text>
            <Text bold>{card?.prompt ?? '?'}</Text>

            {session.status === 'asking' && (
              <Box flexDirection="column">
                <Input
                  key={`answer-${session.index}`}
                  label={`In ${setup.targetLanguage}`}
                  placeholder="type your answer"
                  autoFocus
                  onSubmit={submit}
                />
                {session.hint !== null && <Text color="yellow">Not yet. {session.hint}</Text>}
                <Box>
                  <Box marginRight={2}>
                    <Button key="show-answer" label="Show answer" hotkey="a" plain onPress={showAnswer} />
                  </Box>
                  <Button key="tutor" label="Hint from tutor" hotkey="h" plain onPress={askTutor} />
                </Box>
                {session.tutor.kind === 'loading' && <Text dimColor>The tutor is thinking...</Text>}
                {session.tutor.kind === 'answered' && <Text>Tutor: {session.tutor.text}</Text>}
                {session.tutor.kind === 'unavailable' && <Text dimColor>{session.tutor.text}</Text>}
              </Box>
            )}

            {session.status === 'correct' && (
              <Box flexDirection="column">
                <Text bold color="green">Correct: {card?.answer}</Text>
                <Button key="next" label="Next" hotkey="n" plain onPress={next} />
              </Box>
            )}

            {session.status === 'revealed' && (
              <Box flexDirection="column">
                <Text>Answer: {card?.answer}</Text>
                <Button key="next" label="Next" hotkey="n" plain onPress={next} />
              </Box>
            )}
          </Box>
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
  })
}
