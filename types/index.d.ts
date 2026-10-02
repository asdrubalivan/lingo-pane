// State contract of lingo-pane: what the mod keeps in `$.state` (the waiting-state
// trigger, the guided setup and the practice session) and the shape of what it
// saves in `$.store` (the setup and the progress).
// Self-contained on purpose (no imports): the engine lays it beside dependents.

/** Where the waiting-state trigger is for the current turn. */
export type LingoWaitPhase =
  /** Claude is not working, or the trigger has finished with this turn. */
  | 'idle'
  /** A turn started; waiting out the short delay before showing anything. */
  | 'armed'
  /** The micro-lesson is on screen. */
  | 'showing'
  /** Claude needs the learner (a permission ask or a question): the split dims and waits. */
  | 'paused'
  /** The turn completed; the lesson stays a few seconds, then goes. */
  | 'closing'

/** Where the lesson split stands. */
export type LingoWaitPane =
  /** Not open. */
  | 'none'
  /** Open and drawn (docked beside the transcript, or inline). */
  | 'open'
  /** It could not seat while Claude works (main screen, narrow terminal, not placed): the band offers it. */
  | 'offered'

/** Who opened the split that is open: the mod by itself while waiting, or the person (`/lingo`, the band). */
export type LingoPaneOpener = 'mod' | 'person'

export type LingoWaitState = {
  phase: LingoWaitPhase
  /** The main-loop turn the trigger follows; null while idle. */
  turnId: string | null
  /** When that turn started (`$.clock` milliseconds); null while idle. */
  startedAt: number | null
  pane: LingoWaitPane
  /** Null unless `pane` is `open`. */
  opener: LingoPaneOpener | null
  /** A key typed in the split's field or a press since it opened (getting focus does not count). */
  isTouched: boolean
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

/** The color themes of the lesson pane. */
export type LingoThemeName = 'atardecer' | 'tropico' | 'pastel'

/** The model the tutor's own calls use (an alias `$.model.complete` takes). */
export type LingoTutorModel = 'sonnet' | 'haiku' | 'opus'

/**
 * What the guided setup saves in `$.store` under the key `setup` (JSON).
 * Still version 1: a setup saved before `interests`, `splitShare`, `tutorModel`
 * and `theme` existed reads back with their defaults.
 */
export type LingoSetup = {
  version: 1
  targetLanguage: string
  nativeLanguage: string
  level: LingoLevel
  strategies: LingoStrategyChoices
  /** What the learner likes to talk about (role-play scenarios come from it); may be empty. */
  interests: string[]
  /** Share of the terminal's width the docked split asks for, in percent (33-50). */
  splitShare: number
  tutorModel: LingoTutorModel
  theme: LingoThemeName
  /** ISO timestamp of the confirmation. */
  completedAt: string
}

/** The wizard's steps, in order. */
export type LingoSetupStep =
  | 'languages'
  | 'level'
  | 'interests'
  | 'placement'
  | 'strategies'
  | 'preferences'
  | 'summary'

/** What the learner has chosen so far, before confirming. */
export type LingoSetupDraft = {
  nativeLanguage: string
  targetLanguage: string
  /** Null until a level button is pressed. */
  level: LingoLevel | null
  strategies: LingoStrategyChoices
  /** As typed: comma-separated, split when the setup is saved. */
  interests: string
  splitShare: number
  tutorModel: LingoTutorModel
  theme: LingoThemeName
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

/** What the practice session saves in `$.store` under the key `progress` (JSON). */
export type LingoProgress = {
  version: 1
  /** Lesson being studied (1-based); one past the last lesson once the pack is finished. */
  currentLesson: number
  /** Past attempts per card id, oldest first (the last 20 are kept). */
  cards: Record<string, { reviews: { at: string; isCorrect: boolean }[] }>
}

/** What the card on screen is waiting for. */
export type LingoPracticeStatus = 'asking' | 'correct' | 'revealed' | 'done'

/** The tutor hint button: nothing yet, waiting for the model, answered, or unavailable. */
export type LingoTutorState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'answered'; text: string }
  | { kind: 'unavailable'; text: string }

/** The practice session in the `/lingo` pane; `lesson` null means "not started". */
export type LingoPractice = {
  lesson: number | null
  /** Card ids in order: the recall block first, then the new cards. */
  queue: string[]
  recallCount: number
  index: number
  status: LingoPracticeStatus
  /** Failed attempts on the current card. */
  misses: number
  /** The deterministic hint shown after a miss. */
  hint: string | null
  /** What the learner typed on the last miss (the tutor hint reads it). */
  lastAnswer: string | null
  tutor: LingoTutorState
}

declare module 'claude-code' {
  interface PluginState {
    'lingo-pane': {
      wait: LingoWaitState
      setupWizard: LingoSetupWizard
      setupCache: LingoSetupCache
      setupBand: LingoSetupBand
      practice: LingoPractice
    }
  }
}
