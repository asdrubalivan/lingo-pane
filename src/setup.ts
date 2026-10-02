// The guided setup as pure logic: the wizard's steps, the strategy catalogue,
// validation, and reading the saved setup back from `$.store`. The pane that
// draws it and the `$.store` / `$.state` calls live in hooks/register.tsx.

import type {
  LingoLevel,
  LingoSetup,
  LingoSetupDraft,
  LingoSetupStep,
  LingoSetupWizard,
  LingoStrategyChoices,
} from '../types'

/** `$.store` key holding the saved setup. */
export const SETUP_STORE_KEY = 'setup'
export const SETUP_VERSION = 1
export const MAX_LANGUAGE_LENGTH = 40

export const LEVELS: readonly LingoLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const STEPS: readonly LingoSetupStep[] = [
  'languages',
  'level',
  'placement',
  'strategies',
  'summary',
]

export type StrategyAxis = keyof LingoStrategyChoices
export type StrategyOption = { id: string; label: string; isImplemented: boolean }
export type StrategyAxisInfo = { axis: StrategyAxis; title: string; options: readonly StrategyOption[] }

/**
 * Every option the design names per axis. Only the implemented ones can be
 * chosen; the rest are listed as "coming later". Ids match the built-ins
 * (src/correction/socratic.ts, src/review/pimsleur.ts).
 */
export const STRATEGY_AXES: readonly StrategyAxisInfo[] = [
  {
    axis: 'correctionStyle',
    title: 'Correction style',
    options: [
      { id: 'socratic', label: 'Socratic (hints before answers)', isImplemented: true },
      { id: 'direct', label: 'Direct', isImplemented: false },
      { id: 'progressive-hints', label: 'Progressive hints', isImplemented: false },
    ],
  },
  {
    axis: 'reviewAlgorithm',
    title: 'Review algorithm',
    options: [
      { id: 'pimsleur', label: 'Pimsleur (n-1, n-3, n-7)', isImplemented: true },
      { id: 'sm2', label: 'SM-2', isImplemented: false },
      { id: 'fsrs', label: 'FSRS', isImplemented: false },
      { id: 'leitner', label: 'Leitner', isImplemented: false },
    ],
  },
  {
    axis: 'contentStore',
    title: 'Content store',
    options: [
      { id: 'local', label: 'Local (in $.store)', isImplemented: true },
      { id: 'folder', label: 'Markdown/JSON folder', isImplemented: false },
      { id: 'anki', label: 'Anki', isImplemented: false },
      { id: 'obsidian', label: 'Obsidian', isImplemented: false },
    ],
  },
  {
    axis: 'activityLog',
    title: 'Activity log',
    options: [
      { id: 'local', label: 'Local (in $.store)', isImplemented: true },
      { id: 'markdown', label: 'Markdown file', isImplemented: false },
      { id: 'none', label: 'None', isImplemented: false },
    ],
  },
]

export const DEFAULT_STRATEGIES: LingoStrategyChoices = {
  contentStore: 'local',
  reviewAlgorithm: 'pimsleur',
  correctionStyle: 'socratic',
  activityLog: 'local',
}

export const CLOSED_WIZARD: LingoSetupWizard = { isOpen: false, step: 'languages', draft: null }

const isImplemented = (axis: StrategyAxis, id: string): boolean =>
  STRATEGY_AXES.find(info => info.axis === axis)?.options.some(o => o.id === id && o.isImplemented) ?? false

const sameLanguage = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

// --- Drafts -----------------------------------------------------------------

/** The assistant's starting point: the `userConfig` languages, no level yet. */
export function draftFromConfig(nativeLanguage: string, targetLanguage: string): LingoSetupDraft {
  return { nativeLanguage, targetLanguage, level: null, strategies: { ...DEFAULT_STRATEGIES } }
}

/** Re-running `/lingo setup` starts from what is saved. */
export function draftFromSetup(setup: LingoSetup): LingoSetupDraft {
  return {
    nativeLanguage: setup.nativeLanguage,
    targetLanguage: setup.targetLanguage,
    level: setup.level,
    strategies: { ...setup.strategies },
  }
}

/** Why a step cannot be left yet, or null when it can. */
export function stepProblem(step: LingoSetupStep, draft: LingoSetupDraft): string | null {
  if (step === 'languages') {
    if (draft.nativeLanguage.trim() === '' || draft.targetLanguage.trim() === '') {
      return 'Fill in both languages.'
    }
    if (sameLanguage(draft.nativeLanguage, draft.targetLanguage)) {
      return 'The two languages must differ.'
    }
  }
  if (step === 'level' && draft.level === null) return 'Pick a level.'
  return null
}

export const canAdvance = (step: LingoSetupStep, draft: LingoSetupDraft): boolean =>
  stepProblem(step, draft) === null

// --- The wizard -------------------------------------------------------------

export type WizardEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'set-field'; field: 'nativeLanguage' | 'targetLanguage'; value: string }
  | { type: 'set-level'; level: LingoLevel }
  | { type: 'set-strategy'; axis: StrategyAxis; id: string }
  | { type: 'next' }
  | { type: 'back' }
  /** Placement: leave the optional test. Strategies: take the defaults. */
  | { type: 'skip' }

const stepAt = (index: number): LingoSetupStep => STEPS[Math.max(0, Math.min(STEPS.length - 1, index))] ?? 'languages'

/**
 * The next wizard state. `defaults` is what a draft that was never touched
 * stands for (the `userConfig` languages, or the saved setup being edited).
 * Opening a wizard that is already open resumes it where it was.
 */
export function wizardTransition(
  state: LingoSetupWizard,
  event: WizardEvent,
  defaults: LingoSetupDraft,
): LingoSetupWizard {
  const draft = state.draft ?? defaults
  switch (event.type) {
    case 'open':
      return state.isOpen ? state : { isOpen: true, step: 'languages', draft: null }
    case 'close':
      return CLOSED_WIZARD
    case 'set-field':
      return { ...state, draft: { ...draft, [event.field]: event.value.slice(0, MAX_LANGUAGE_LENGTH) } }
    case 'set-level':
      return LEVELS.includes(event.level) ? { ...state, draft: { ...draft, level: event.level } } : state
    case 'set-strategy':
      // A "coming later" option cannot be chosen.
      return isImplemented(event.axis, event.id)
        ? { ...state, draft: { ...draft, strategies: { ...draft.strategies, [event.axis]: event.id } } }
        : state
    case 'next':
      return canAdvance(state.step, draft) && state.step !== 'summary'
        ? { ...state, draft, step: stepAt(STEPS.indexOf(state.step) + 1) }
        : state
    case 'back':
      return { ...state, draft, step: stepAt(STEPS.indexOf(state.step) - 1) }
    case 'skip':
      if (state.step === 'placement') return { ...state, draft, step: 'strategies' }
      if (state.step === 'strategies') {
        return { ...state, draft: { ...draft, strategies: { ...DEFAULT_STRATEGIES } }, step: 'summary' }
      }
      return state
  }
}

// --- Saving and reading back ------------------------------------------------

/** The setup to save from a finished draft, or null when it is not valid. */
export function buildSetup(draft: LingoSetupDraft, completedAt: string): LingoSetup | null {
  if (!canAdvance('languages', draft) || draft.level === null) return null
  const { strategies } = draft
  const isValid = (Object.keys(DEFAULT_STRATEGIES) as StrategyAxis[]).every(axis =>
    isImplemented(axis, strategies[axis]),
  )
  if (!isValid) return null
  return {
    version: SETUP_VERSION,
    targetLanguage: draft.targetLanguage.trim(),
    nativeLanguage: draft.nativeLanguage.trim(),
    level: draft.level,
    strategies: { ...strategies },
    completedAt,
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/**
 * Whatever `$.store` held under `setup`, as a setup, or null when it is not one
 * this version understands: missing, corrupt, another version, an unknown
 * strategy id. Null means setup is pending.
 */
export function parseSetup(raw: unknown): LingoSetup | null {
  if (!isObject(raw) || raw.version !== SETUP_VERSION) return null
  const { targetLanguage, nativeLanguage, level, strategies, completedAt } = raw
  if (!isText(targetLanguage) || !isText(nativeLanguage) || !isText(completedAt)) return null
  if (typeof level !== 'string' || !LEVELS.includes(level as LingoLevel)) return null
  if (!isObject(strategies)) return null

  const chosen = {} as Record<StrategyAxis, string>
  for (const axis of Object.keys(DEFAULT_STRATEGIES) as StrategyAxis[]) {
    const id = strategies[axis]
    if (typeof id !== 'string' || !isImplemented(axis, id)) return null
    chosen[axis] = id
  }

  return {
    version: SETUP_VERSION,
    targetLanguage,
    nativeLanguage,
    level: level as LingoLevel,
    strategies: chosen,
    completedAt,
  }
}

/**
 * The setup in force: the one mirrored in `$.state` once loaded, else what the
 * store held (`$.state` resets on /clear). Null means pending.
 */
export function resolveSetup(
  cache: { isLoaded: boolean; setup: LingoSetup | null },
  stored: unknown,
): LingoSetup | null {
  return cache.isLoaded ? cache.setup : parseSetup(stored)
}
