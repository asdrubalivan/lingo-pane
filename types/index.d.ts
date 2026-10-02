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
 * Still version 1: a setup saved before `interests`, `splitShare`, `tutorModel`,
 * `theme` and `isContextual` existed reads back with their defaults.
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
  /** Opt-in: short excerpts of the learner's own session (last prompt, Claude's last reply) feed the tutor's topics. */
  isContextual: boolean
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
  isContextual: boolean
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

/** What the split teaches; `review` is in the menu but the tutor never suggests it. */
export type LingoActivity = 'conversation' | 'roleplay' | 'reading' | 'review'

/** One line of a micro-unit, as drawn. */
export type LingoLine =
  /** `mark`: the learner's words the tutor points at, drawn in the error color. */
  | { who: 'tutor'; text: string; mark: string | null }
  | { who: 'you'; text: string }
  /** The scaffold an empty Enter asked for. */
  | { who: 'help'; text: string }

/** A mistake the tutor spotted; it becomes a card when its unit closes. */
export type LingoCorrection = {
  /** The learner's words, as short as the tutor could make them. */
  wrong: string
  right: string
  /** Why, in a few words of the native language. */
  note: string
  /** The learner's whole line. */
  sentence: string
}

/** What the split is waiting on the tutor for. */
export type LingoPending = 'opening' | 'reply' | 'help'

/** How a micro-unit went: `✓ 3 sentences, 1 correction saved`. */
export type LingoUnitSummary = { sentences: number; corrections: number }

/** A role-play's setting: from the fixed A1-C2 list (`id`) or made up from the learner's interests (`id` null). */
export type LingoScenario = {
  id: string | null
  title: string
  situation: string
  tutorRole: string
  learnerRole: string
}

/** A micro-unit of conversation or role-play: 2-4 exchanges, then a summary. */
export type LingoUnit = {
  /** Tells this unit from the next one, so a late tutor reply never lands in another. */
  id: string
  activity: 'conversation' | 'roleplay'
  /** Oldest first; the tutor opens. */
  lines: LingoLine[]
  /** Replies the learner has sent. */
  replies: number
  corrections: LingoCorrection[]
  pending: LingoPending | null
  /** A short message when the tutor could not answer. */
  notice: string | null
  /** Set once the unit is over. */
  summary: LingoUnitSummary | null
  /** Role-play only. */
  scenario: LingoScenario | null
  /** The due mistake cards the tutor was asked to weave in. */
  woven: { id: string; wrong: string; right: string }[]
}

/** One question about a reading, answered in a word or three. */
export type LingoReadingQuestion = {
  question: string
  answer: string
  /** Answered right, shown on an empty Enter (and made a card), or still open. */
  outcome: 'right' | 'shown' | null
}

/** A reading: a short text the tutor wrote at the learner's level, and 2-3 questions. */
export type LingoReading = {
  id: string
  title: string
  text: string
  questions: LingoReadingQuestion[]
  /** The question on screen. */
  index: number
  /** Wrong tries on it. */
  misses: number
  /** Waiting for the tutor to write it. */
  isPending: boolean
  notice: string | null
  summary: LingoUnitSummary | null
}

/** The lesson in the split: the activity on screen and the unit in progress. */
export type LingoLesson = {
  activity: LingoActivity
  /** Null until the first unit of a conversation or role-play opens. */
  unit: LingoUnit | null
  /** Null until the first reading. */
  reading: LingoReading | null
  /** The `switch ▸` menu is open (the field is not drawn meanwhile). */
  isMenuOpen: boolean
}

/** What the mod saves in `$.store` under `activity`: what was done, to rotate activities and number cards. */
export type LingoActivityLog = {
  version: 1
  /** Finished micro-units so far; a mistake card is numbered by the unit it came from. */
  units: number
  /** ISO time each activity was last finished. */
  lastDoneAt: Partial<Record<LingoActivity, string>>
  /** How many units of each activity were finished (role-play scenarios rotate by it). */
  done: Partial<Record<LingoActivity, number>>
  /** The last 20 finished units, oldest first. */
  recent: { activity: LingoActivity; at: string; sentences: number; corrections: number }[]
}

/** A card made from a mistake: the learner's line, the wrong words and the right ones. */
export type LingoMistakeCard = {
  id: string
  wrong: string
  right: string
  note: string
  sentence: string
  /** The micro-unit it came from (1-based): Pimsleur brings it back at units n+1, n+3 and n+7. */
  unit: number
  createdAt: string
  /** Oldest first, the last 20. */
  reviews: { at: string; isCorrect: boolean }[]
}

/** What the mod saves in `$.store` under `mistakes`. */
export type LingoMistakes = { version: 1; cards: LingoMistakeCard[] }

/** The contextual mode's material: the learner's last prompt and Claude's last reply, cut short and redacted. Empty unless opted in. */
export type LingoWorkContext = { prompt: string | null; answer: string | null }

/** The micro-card the Spinner carries for one turn, worked out when the turn's delay ends. */
export type LingoSpinnerCard = { turnId: string | null; text: string | null }

declare module 'claude-code' {
  interface PluginState {
    'lingo-pane': {
      wait: LingoWaitState
      setupWizard: LingoSetupWizard
      setupCache: LingoSetupCache
      setupBand: LingoSetupBand
      practice: LingoPractice
      lesson: LingoLesson
      spinnerCard: LingoSpinnerCard
      workContext: LingoWorkContext
    }
  }
}
