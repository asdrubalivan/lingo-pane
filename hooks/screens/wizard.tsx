
import { LABELS } from '../../src/labels'
import {
  CLOSED_WIZARD,
  LEVELS,
  SPLIT_SHARES,
  STEPS,
  STRATEGY_AXES,
  TUTOR_MODELS,
  buildSetup,
  draftFromConfig,
  draftFromSetup,
  parseInterests,
  stepProblem,
  wizardTransition,
} from '../../src/setup'
import type { WizardEvent } from '../../src/setup'
import { SETUP, save } from '../../src/storage'
import { THEMES, themeByName } from '../../src/themes'
import type { LingoSetup, LingoSetupWizard } from '../../types'
import { nowIso, touch } from '../engine'
import { ensureLesson } from '../orchestration'
import type { PaneContext } from './context'
import { drawEcho } from './echo'

// Setup pending, or being redone: the guided wizard, one step at a time.
export function drawWizard(pane: PaneContext, setup: LingoSetup | null, wizard: LingoSetupWizard) {
  const { engine, rt, ui } = pane
  const { Box, Button, Input, Text } = ui
  const { native, target } = rt.config
  // What an untouched draft stands for: what is saved, else the userConfig.
  const defaults = setup === null ? draftFromConfig(native, target) : draftFromSetup(setup)
  const draft = wizard.draft ?? defaults
  const step = wizard.step
  const number = STEPS.indexOf(step) + 1
  const problem = stepProblem(step, draft)
  const dispatch = async (event: WizardEvent) => {
    await touch(engine)
    await engine.setupWizard.update(s => wizardTransition(s, event, defaults))
  }
  // Enter empties a field on screen; a new key redraws it with the draft.
  const keepText = () => {
    rt.inputRev += 1
    engine.ui.invalidate('ui.render')
  }

  const confirm = async () => {
    const latest = await engine.setupWizard.read()
    const built = buildSetup(latest.draft ?? defaults, await nowIso(engine))
    if (built === null) return
    if (!(await save(engine.store, SETUP, built))) return
    await engine.setupCache.update(() => ({ isLoaded: true, setup: built }))
    await engine.setupWizard.update(() => CLOSED_WIZARD)
    engine.ui.toast(LABELS.setupSaved)
    // Straight into the lesson, zero clicks.
    await ensureLesson(engine, built)
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
  // The fields keep their text in the wizard's draft on every change: the echo reads it from there.
  const echo = (field: string, text: string, label: string) => drawEcho(pane, field, text, { label, isBoxed: false })

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
            key={`native-${rt.inputRev}`}
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
          {echo('native', draft.nativeLanguage, LABELS.setupNative)}
          <Input
            key={`target-${rt.inputRev}`}
            label={LABELS.setupTarget}
            value={draft.targetLanguage}
            placeholder={LABELS.setupTargetPlaceholder}
            onInput={value => dispatch({ type: 'set-field', field: 'targetLanguage', value })}
            onSubmit={value => {
              dispatch({ type: 'set-field', field: 'targetLanguage', value: value === '' ? draft.targetLanguage : value })
              keepText()
            }}
          />
          {echo('target', draft.targetLanguage, LABELS.setupTarget)}
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
            key={`interests-${rt.inputRev}`}
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
          {echo('interests', draft.interests, LABELS.setupInterests)}
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
