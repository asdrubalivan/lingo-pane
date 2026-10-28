// The four axes that vary between learners. The core talks only to these
// interfaces; the saved setup holds a choice per axis and `resolver.ts` turns
// the choices into implementations. Later other plugins can ship their own
// through `dependencies`.

import type { LingoActivity, LingoActivityLog, LingoLevel, LingoUnitSummary } from '../types'

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

/** The two languages a learner studies: what is taught and the one it is explained in. */
export type LanguagePair = { target: string; native: string }

/** The material a store gives for one language pair. */
export type ContentPack = {
  id: string
  title: string
  cards: readonly Card[]
  /** Lessons the cards are split in (1-based). */
  lessonCount: number
  /** False when the store has no pack made for the pair and gives its fallback. */
  isForPair: boolean
}

/** Where the learning material lives, keyed by language pair. */
export interface ContentStore {
  readonly id: string
  pack(pair: LanguagePair): ContentPack
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
  instruction(ctx: { targetLanguage: string; nativeLanguage: string }): string
}

/** The tutor suggests moving up or down a level; it never changes the level by itself. */
export type LevelHint = { direction: 'up' | 'down'; level: LingoLevel }

/**
 * Records the finished units of the learner and numbers them. Every operation
 * is pure: the core keeps the value in `$.store` under `storeKey` and hands it
 * back to the log to read, count or ask about.
 */
export interface ActivityLog {
  readonly id: string
  /** Where the log's value lives in `$.store`. */
  readonly storeKey: string
  /** The log of a learner who has done nothing yet. */
  readonly empty: LingoActivityLog
  /** Whatever the store held under `storeKey`; the empty log when it is not one. */
  parse(raw: unknown): LingoActivityLog
  /** The number of the unit about to be logged; cards and due checks take it from here. */
  nextUnit(log: LingoActivityLog): number
  /** A finished unit, counted and dated (`id` marks it as recorded). */
  record(log: LingoActivityLog, activity: LingoActivity, summary: LingoUnitSummary, at: string, id?: string): LingoActivityLog
  /** The activity the split opens into, among the available ones. */
  suggest(log: LingoActivityLog, available: readonly LingoActivity[]): LingoActivity
  levelHint(log: LingoActivityLog, level: LingoLevel): LevelHint | null
}

export type Strategies = {
  contentStore: ContentStore
  reviewAlgorithm: ReviewAlgorithm
  correctionStyle: CorrectionStyle
  activityLog: ActivityLog
}
