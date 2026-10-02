// Pure logic of the practice session: answer matching, hints, progress and the
// queue. No `$`, no I/O; inputs are never mutated.

import { dueCards } from './review/pimsleur'
import type { Card, Progress } from './strategies'
import type { LingoPractice, LingoProgress } from '../types'

export const PROGRESS_STORE_KEY = 'progress'
export const PROGRESS_VERSION = 1
/** Past attempts kept per card (the store is small and shared). */
export const MAX_REVIEWS_PER_CARD = 20

export const FRESH_PROGRESS: LingoProgress = { version: PROGRESS_VERSION, currentLesson: 1, cards: {} }

// --- Answers ----------------------------------------------------------------

/** Lowercase, no punctuation, one space between words, no edge spaces. */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCorrectAnswer(input: string, answer: string): boolean {
  const given = normalizeAnswer(input)
  return given !== '' && given === normalizeAnswer(answer)
}

/** A deterministic hint: the first letter and the size, never the answer. */
export function hintFor(answer: string): string {
  const words = normalizeAnswer(answer).split(' ')
  const letters = words.join('').length
  const first = (normalizeAnswer(answer)[0] ?? '?').toUpperCase()
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return `Starts with "${first}", ${count(words.length, 'word', 'words')}, ${count(letters, 'letter', 'letters')}.`
}

/** True when a tutor reply contains the answer, so it must not be shown. */
export function leaksAnswer(reply: string, answer: string): boolean {
  const target = normalizeAnswer(answer)
  return target !== '' && ` ${normalizeAnswer(reply)} `.includes(` ${target} `)
}

/** The prompt handed to `$.model.complete`; the answer is for the tutor only. */
export function tutorPrompt(card: Card, failed: string, targetLanguage: string, nativeLanguage: string): string {
  return [
    `Exercise: the learner must translate "${card.prompt}" into ${targetLanguage}.`,
    `Reference answer (for you only; never write it, spell it out or translate it): "${card.answer}"`,
    `The learner answered: "${failed}"`,
    `Reply in ${nativeLanguage} with one short guiding question or hint, at most two lines, without giving the answer.`,
  ].join('\n')
}

// --- Progress ---------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whatever `$.store` held under `progress`, as progress; a fresh one when it is not valid. */
export function parseProgress(raw: unknown): LingoProgress {
  if (!isObject(raw) || raw.version !== PROGRESS_VERSION) return FRESH_PROGRESS
  const { currentLesson, cards } = raw
  if (typeof currentLesson !== 'number' || !Number.isInteger(currentLesson) || currentLesson < 1) return FRESH_PROGRESS
  if (!isObject(cards)) return FRESH_PROGRESS

  const clean: LingoProgress['cards'] = {}
  for (const [id, entry] of Object.entries(cards)) {
    if (!isObject(entry) || !Array.isArray(entry.reviews)) continue
    const reviews = entry.reviews
      .filter(isObject)
      .filter(r => typeof r.at === 'string' && typeof r.isCorrect === 'boolean')
      .map(r => ({ at: r.at as string, isCorrect: r.isCorrect as boolean }))
    clean[id] = { reviews: reviews.slice(-MAX_REVIEWS_PER_CARD) }
  }
  return { version: PROGRESS_VERSION, currentLesson, cards: clean }
}

export function recordAttempt(progress: LingoProgress, cardId: string, at: string, isCorrect: boolean): LingoProgress {
  const before = progress.cards[cardId]?.reviews ?? []
  const reviews = [...before, { at, isCorrect }].slice(-MAX_REVIEWS_PER_CARD)
  return { ...progress, cards: { ...progress.cards, [cardId]: { reviews } } }
}

/** After finishing the current lesson: the next one, or "finished" (lessons + 1). */
export function advanceLesson(progress: LingoProgress, lessonCount: number): LingoProgress {
  return { ...progress, currentLesson: Math.min(progress.currentLesson + 1, lessonCount + 1) }
}

export const isFinished = (progress: LingoProgress, lessonCount: number): boolean =>
  progress.currentLesson > lessonCount

function toList(progress: LingoProgress): Progress[] {
  return Object.entries(progress.cards).map(([cardId, entry]) => ({ cardId, reviews: entry.reviews }))
}

// --- Queue ------------------------------------------------------------------

export type LessonQueue = { recall: string[]; fresh: string[] }

/** Pimsleur recall block (n-1, n-3, n-7), then the new cards of the current lesson. */
export function buildQueue(cards: readonly Card[], progress: LingoProgress, now: Date): LessonQueue {
  const all = [...cards]
  const recall = dueCards(all, toList(progress), { now, currentLesson: progress.currentLesson }).map(c => c.id)
  const fresh = all
    .filter(c => c.lesson === progress.currentLesson)
    .map(c => c.id)
    .sort()
  return { recall, fresh }
}

export const queueIds = (queue: LessonQueue): string[] => [...queue.recall, ...queue.fresh]

// --- Session state ----------------------------------------------------------

export const IDLE_PRACTICE: LingoPractice = {
  lesson: null,
  queue: [],
  recallCount: 0,
  index: 0,
  status: 'asking',
  misses: 0,
  hint: null,
  tutor: { kind: 'idle' },
}

export function startPractice(queue: LessonQueue, lesson: number): LingoPractice {
  const ids = queueIds(queue)
  return { ...IDLE_PRACTICE, lesson, queue: ids, recallCount: queue.recall.length, status: ids.length === 0 ? 'done' : 'asking' }
}

/** After a right or wrong answer: the new state of the card on screen. */
export function afterAnswer(session: LingoPractice, isCorrect: boolean, answer: string): LingoPractice {
  if (isCorrect) return { ...session, status: 'correct', hint: null, tutor: { kind: 'idle' } }
  return { ...session, misses: session.misses + 1, hint: hintFor(answer), tutor: { kind: 'idle' } }
}

export const reveal = (session: LingoPractice): LingoPractice => ({ ...session, status: 'revealed', hint: null })

/** Next card, or `done` after the last one. */
export function nextCard(session: LingoPractice): LingoPractice {
  const index = session.index + 1
  if (index >= session.queue.length) return { ...session, index, status: 'done', misses: 0, hint: null, tutor: { kind: 'idle' } }
  return { ...session, index, status: 'asking', misses: 0, hint: null, tutor: { kind: 'idle' } }
}
