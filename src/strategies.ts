// The four axes that vary between learners. The core talks only to these
// interfaces; built-in implementations are picked with `userConfig`, and later
// other plugins can ship their own through `dependencies`.
// Shapes below are a first draft (see docs/decisions.md, "Still open").

export type Card = {
  id: string
  prompt: string
  answer: string
  tags: string[]
  /** Lesson the card belongs to (1-based). Used by lesson-based review. */
  lesson: number
}

export type Progress = {
  cardId: string
  /** ISO timestamps of past reviews, oldest first. */
  reviews: { at: string; isCorrect: boolean }[]
}

/** Where the learning material lives. */
export interface ContentStore {
  readonly id: string
  listCards(): Promise<Card[]>
}

/** What the algorithm needs to know about "now". */
export type ReviewContext = {
  now: Date
  /** Lesson the learner is starting or studying (1-based). */
  currentLesson: number
}

/** Decides which cards are due. */
export interface ReviewAlgorithm {
  readonly id: string
  dueCards(cards: Card[], progress: Progress[], ctx: ReviewContext): Card[]
}

/** Decides how the tutor reacts to an answer. */
export interface CorrectionStyle {
  readonly id: string
  /** Instruction handed to the model for how to correct this learner. */
  instruction(): string
}

/** Records what was studied. */
export interface ActivityLog {
  readonly id: string
  record(entry: { cardId: string; isCorrect: boolean; at: string }): Promise<void>
}

export type Strategies = {
  contentStore: ContentStore
  reviewAlgorithm: ReviewAlgorithm
  correctionStyle: CorrectionStyle
  activityLog: ActivityLog
}
