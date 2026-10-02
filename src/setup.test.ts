import { expect, test } from 'claude-code/testing'

import type { LingoSetupWizard } from '../types'
import {
  CLOSED_WIZARD,
  DEFAULT_STRATEGIES,
  STRATEGY_AXES,
  buildSetup,
  canAdvance,
  draftFromConfig,
  draftFromSetup,
  parseInterests,
  parseSetup,
  resolveSetup,
  stepProblem,
  withTheme,
  wizardTransition,
} from './setup'
import type { WizardEvent } from './setup'

const defaults = draftFromConfig('Spanish', 'English')
const run = (events: WizardEvent[], from: LingoSetupWizard = CLOSED_WIZARD) =>
  events.reduce((state, event) => wizardTransition(state, event, defaults), from)

// A setup saved before interests, split share, tutor model and theme existed.
const SAVED_V1 = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'A2',
  strategies: { ...DEFAULT_STRATEGIES },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const SAVED = {
  ...SAVED_V1,
  interests: ['chess', 'cooking'],
  splitShare: 45,
  tutorModel: 'haiku',
  theme: 'pastel',
  isContextual: false,
}

test('the wizard walks languages, level, interests, placement, strategies, preferences, summary', () => {
  const open = run([{ type: 'open' }])
  expect(open).toEqual({ isOpen: true, step: 'languages', draft: null })

  // The defaults come from userConfig, so languages can be left at once.
  const atLevel = run([{ type: 'next' }], open)
  expect(atLevel.step).toBe('level')

  // No level yet: next does nothing until one is picked.
  expect(run([{ type: 'next' }], atLevel).step).toBe('level')
  const atInterests = run([{ type: 'set-level', level: 'B1' }, { type: 'next' }], atLevel)
  expect(atInterests.step).toBe('interests')
  // Interests are optional: empty can go on.
  const atPlacement = run([{ type: 'next' }], atInterests)
  expect(atPlacement.step).toBe('placement')

  const atStrategies = run([{ type: 'skip' }], atPlacement)
  expect(atStrategies.step).toBe('strategies')
  const atPreferences = run([{ type: 'next' }], atStrategies)
  expect(atPreferences.step).toBe('preferences')
  // Nothing past the summary; back goes one step each time.
  const summary = run([{ type: 'next' }], atPreferences)
  expect(summary.step).toBe('summary')
  expect(run([{ type: 'next' }], summary).step).toBe('summary')
  expect(run([{ type: 'back' }, { type: 'back' }], summary).step).toBe('strategies')
  expect(run([{ type: 'back' }], open).step).toBe('languages')
})

test('the new preferences start at their defaults and only valid values are taken', () => {
  expect(defaults).toMatchObject({ interests: '', splitShare: 40, tutorModel: 'sonnet', theme: 'atardecer', isContextual: false })
  expect(run([{ type: 'set-contextual', isOn: true }]).draft?.isContextual).toBe(true)
  const picked = run([
    { type: 'set-share', share: 50 },
    { type: 'set-tutor', model: 'opus' },
    { type: 'set-theme', theme: 'tropico' },
    { type: 'set-interests', value: 'jazz, hiking' },
  ])
  expect(picked.draft).toMatchObject({ splitShare: 50, tutorModel: 'opus', theme: 'tropico', interests: 'jazz, hiking' })
  // Out of range or unknown: ignored.
  expect(run([{ type: 'set-share', share: 70 }]).draft).toBeNull()
  expect(run([{ type: 'set-share', share: 32 }]).draft).toBeNull()
  expect(run([{ type: 'set-tutor', model: 'gpt' as never }]).draft).toBeNull()
  expect(run([{ type: 'set-theme', theme: 'neon' as never }]).draft).toBeNull()
  expect(run([{ type: 'set-interests', value: 'x'.repeat(500) }]).draft?.interests.length).toBe(200)
})

test('interests are split on commas, trimmed, capped and never repeated', () => {
  expect(parseInterests(' chess, cooking,, Chess , jazz ')).toEqual(['chess', 'cooking', 'jazz'])
  expect(parseInterests('')).toEqual([])
  expect(parseInterests('a,b,c,d,e,f,g')).toEqual(['a', 'b', 'c', 'd', 'e'])
  expect(parseInterests('y'.repeat(60))[0]?.length).toBe(40)
})

test('opening an open wizard resumes it; close forgets everything', () => {
  const mid = run([{ type: 'open' }, { type: 'set-field', field: 'targetLanguage', value: 'French' }, { type: 'next' }])
  expect(run([{ type: 'open' }], mid)).toEqual(mid)
  expect(run([{ type: 'close' }], mid)).toEqual(CLOSED_WIZARD)
})

test('languages must be filled in and different', () => {
  const draft = draftFromConfig('Spanish', 'English')
  expect(stepProblem('languages', draft)).toBeNull()
  expect(stepProblem('languages', { ...draft, targetLanguage: '  ' })).toMatch(/both/)
  expect(stepProblem('languages', { ...draft, targetLanguage: ' spanish ' })).toMatch(/differ/)
  expect(canAdvance('level', draft)).toBe(false)
  expect(canAdvance('level', { ...draft, level: 'C2' })).toBe(true)
  // Typing past the cap is cut, not refused.
  const long = run([{ type: 'set-field', field: 'nativeLanguage', value: 'x'.repeat(100) }])
  expect(long.draft?.nativeLanguage.length).toBe(40)
})

test('only implemented strategies can be chosen; skip on strategies restores the defaults', () => {
  expect(run([{ type: 'set-strategy', axis: 'correctionStyle', id: 'direct' }]).draft).toBeNull()
  expect(run([{ type: 'set-strategy', axis: 'reviewAlgorithm', id: 'nope' }]).draft).toBeNull()
  expect(run([{ type: 'set-strategy', axis: 'reviewAlgorithm', id: 'pimsleur' }]).draft?.strategies).toEqual(
    DEFAULT_STRATEGIES,
  )

  const atStrategies: LingoSetupWizard = { isOpen: true, step: 'strategies', draft: defaults }
  const skipped = run([{ type: 'skip' }], atStrategies)
  expect(skipped.step).toBe('preferences')
  expect(skipped.draft?.strategies).toEqual(DEFAULT_STRATEGIES)
  // Skip means nothing on the required steps.
  expect(run([{ type: 'skip' }], { isOpen: true, step: 'level', draft: null }).step).toBe('level')
})

test('every axis has at least one implemented option and the defaults are among them', () => {
  for (const info of STRATEGY_AXES) {
    const implemented = info.options.filter(o => o.isImplemented).map(o => o.id)
    expect(implemented).toContain(DEFAULT_STRATEGIES[info.axis])
    expect(info.options.some(o => !o.isImplemented)).toBe(true)
  }
})

test('buildSetup saves a valid draft trimmed, and refuses an incomplete or invalid one', () => {
  const draft = { ...draftFromConfig(' Spanish ', 'English '), level: 'B2' as const }
  expect(buildSetup(draft, 'now')).toEqual({
    version: 1,
    targetLanguage: 'English',
    nativeLanguage: 'Spanish',
    level: 'B2',
    strategies: DEFAULT_STRATEGIES,
    interests: [],
    splitShare: 40,
    tutorModel: 'sonnet',
    theme: 'atardecer',
    isContextual: false,
    completedAt: 'now',
  })
  expect(buildSetup({ ...draft, isContextual: true }, 'now')?.isContextual).toBe(true)
  expect(buildSetup({ ...draft, interests: 'chess, chess, jazz', theme: 'pastel' }, 'now')).toMatchObject({
    interests: ['chess', 'jazz'],
    theme: 'pastel',
  })
  expect(buildSetup({ ...draft, splitShare: 60 }, 'now')).toBeNull()
  expect(buildSetup(draftFromConfig('Spanish', 'English'), 'now')).toBeNull()
  expect(buildSetup({ ...draft, targetLanguage: 'spanish' }, 'now')).toBeNull()
  expect(buildSetup({ ...draft, strategies: { ...DEFAULT_STRATEGIES, correctionStyle: 'direct' } }, 'now')).toBeNull()
})

test('parseSetup accepts what buildSetup wrote and nothing else', () => {
  expect(parseSetup(SAVED)).toEqual(SAVED)
  // Round trip through JSON, as $.store gives it back.
  expect(parseSetup(JSON.parse(JSON.stringify(SAVED)))).toEqual(SAVED)
  expect(draftFromSetup(parseSetup(SAVED)!).level).toBe('A2')

  const bad: unknown[] = [
    undefined,
    null,
    'text',
    [],
    42,
    {},
    { ...SAVED, version: 2 },
    { ...SAVED, version: '1' },
    { ...SAVED, level: 'D1' },
    { ...SAVED, level: undefined },
    { ...SAVED, targetLanguage: '' },
    { ...SAVED, nativeLanguage: 3 },
    { ...SAVED, completedAt: undefined },
    { ...SAVED, strategies: undefined },
    { ...SAVED, strategies: { ...SAVED.strategies, reviewAlgorithm: 'fsrs' } },
    { ...SAVED, strategies: { ...SAVED.strategies, activityLog: undefined } },
  ]
  for (const raw of bad) expect(parseSetup(raw)).toBeNull()
})

test('parseSetup drops unknown extra fields instead of carrying them', () => {
  expect(parseSetup({ ...SAVED, extra: 'x' })).toEqual(SAVED)
})

test('a setup saved before the new preferences stays done, with their defaults', () => {
  const read = parseSetup(SAVED_V1)
  expect(read).toEqual({ ...SAVED_V1, interests: [], splitShare: 40, tutorModel: 'sonnet', theme: 'atardecer', isContextual: false })
  // Only an explicit true is the opt-in.
  expect(parseSetup({ ...SAVED, isContextual: 'yes' })?.isContextual).toBe(false)
  expect(parseSetup({ ...SAVED, isContextual: true })?.isContextual).toBe(true)
  // Unreadable new fields fall back to the defaults too; they never make it pending.
  expect(parseSetup({ ...SAVED, splitShare: 99, tutorModel: 'gpt', theme: 'neon', interests: 'chess' })).toMatchObject({
    splitShare: 40,
    tutorModel: 'sonnet',
    theme: 'atardecer',
    interests: [],
  })
  expect(parseSetup({ ...SAVED, interests: ['chess', 3, ' jazz '] })?.interests).toEqual(['chess', 'jazz'])
  expect(draftFromSetup(parseSetup(SAVED)!)).toMatchObject({ interests: 'chess, cooking', splitShare: 45, theme: 'pastel' })
})

test('withTheme changes the theme and nothing else', () => {
  const setup = parseSetup(SAVED)!
  expect(withTheme(setup, 'tropico')).toEqual({ ...setup, theme: 'tropico' })
})

test('resolveSetup trusts the mirror once loaded, else reads the stored value', () => {
  const setup = parseSetup(SAVED)
  expect(resolveSetup({ isLoaded: true, setup }, undefined)).toEqual(setup)
  expect(resolveSetup({ isLoaded: true, setup: null }, SAVED)).toBeNull()
  // After /clear the mirror is empty and the store is the truth.
  expect(resolveSetup({ isLoaded: false, setup: null }, SAVED)).toEqual(setup)
  expect(resolveSetup({ isLoaded: false, setup: null }, { garbage: true })).toBeNull()
})
