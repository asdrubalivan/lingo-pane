// State contract of lingo-pane: what the mod keeps in `$.state` (the waiting-state
// trigger and the guided setup) and the shape of the setup saved in `$.store`.
// Self-contained on purpose (no imports): the engine lays it beside dependents.

/** Where the waiting-state trigger is for the current turn. */
export type LingoWaitPhase =
  /** Claude is not working, or the trigger has finished with this turn. */
  | 'idle'
  /** A turn started; waiting out the short delay before showing anything. */
  | 'armed'
  /** The micro-lesson is on screen. */
  | 'showing'
  /** Claude needs the learner (a permission ask or a question): nothing is shown. */
  | 'paused'
  /** The turn completed; the lesson stays a few seconds, then goes. */
  | 'closing'

/** What became of the lesson pane the mod itself opened while waiting. */
export type LingoWaitPane =
  /** The mod has no pane open (or the person opened it themselves). */
  | 'none'
  /** The mod opened it and it is drawn: the mod closes it when the turn ends. */
  | 'open'
  /** The mod tried and the pane was not placed (narrow terminal): a button offers it. */
  | 'offered'

export type LingoWaitState = {
  phase: LingoWaitPhase
  /** The main-loop turn the trigger follows; null while idle. */
  turnId: string | null
  pane: LingoWaitPane
}

/** CEFR level the learner starts at. */
export type LingoLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

/** The chosen implementation (by id) for each strategy axis. */
export type LingoStrategyChoices = {
  contentStore: string
  reviewAlgorithm: string
  correctionStyle: string
  activityLog: string
}

/** What the guided setup saves in `$.store` under the key `setup` (JSON). */
export type LingoSetup = {
  version: 1
  targetLanguage: string
  nativeLanguage: string
  level: LingoLevel
  strategies: LingoStrategyChoices
  /** ISO timestamp of the confirmation. */
  completedAt: string
}

/** The wizard's steps, in order. */
export type LingoSetupStep = 'languages' | 'level' | 'placement' | 'strategies' | 'summary'

/** What the learner has chosen so far, before confirming. */
export type LingoSetupDraft = {
  nativeLanguage: string
  targetLanguage: string
  /** Null until a level button is pressed. */
  level: LingoLevel | null
  strategies: LingoStrategyChoices
}

/** The wizard in the `/lingo` pane. `draft` null means "still the defaults". */
export type LingoSetupWizard = {
  isOpen: boolean
  step: LingoSetupStep
  draft: LingoSetupDraft | null
}

/**
 * The saved setup mirrored in `$.state` so that the band and the Spinner redraw
 * when it changes. `$.state` resets on /clear: `isLoaded` false then means
 * "read `$.store`" (the source of truth), never "setup pending".
 */
export type LingoSetupCache = { isLoaded: boolean; setup: LingoSetup | null }

/** "Later" on the band: hides it for the rest of this session. */
export type LingoSetupBand = { isHidden: boolean }

declare module 'claude-code' {
  interface PluginState {
    'lingo-pane': {
      wait: LingoWaitState
      setupWizard: LingoSetupWizard
      setupCache: LingoSetupCache
      setupBand: LingoSetupBand
    }
  }
}
