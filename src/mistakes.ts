// Mistakes become cards: when a micro-unit closes, each correction the tutor
// made is kept in `$.store` (one key each, see storage.ts), numbered by the unit it came
// from, so the Pimsleur review brings it back at units n+1, n+3 and n+7. Due
// cards are woven into the next conversations, shown in the Spinner, and come
// first in `review`. A reading question whose answer was shown is kept the same
// way, with no wrong words (`wrong` empty): it is reviewed, never woven or shown
// in the Spinner. Pure: no `$`, no I/O; inputs are never mutated.

import { validCorrection } from './conversation'
import { normalizeAnswer } from './lesson'
import { pickIndex } from './microcards'
import type { Card, ReviewAlgorithm } from './strategies'
import type { LingoCorrection, LingoLine, LingoMistakeCard, LingoMistakes } from '../types'

export const MISTAKES_STORE_KEY = 'mistakes'
export const MISTAKES_VERSION = 1
/** Cards kept (the store is small and shared); the oldest go first. */
export const MAX_MISTAKES = 300
export const MAX_REVIEWS = 20
/** Due cards handed to the tutor per unit. */
export const MAX_WOVEN = 2

export const NO_MISTAKES: LingoMistakes = { version: MISTAKES_VERSION, cards: [] }

/** One card per wrong -> right pair, whatever the case and punctuation. */
export function mistakeId(wrong: string, right: string): string {
  const key = `${normalizeAnswer(wrong)}=>${normalizeAnswer(right)}`
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `mistake-${hash.toString(16).padStart(8, '0')}`
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === 'string'

/** One stored mistake card; null when it is not valid. */
export function parseMistakeCard(raw: unknown): LingoMistakeCard | null {
  if (
    !isObject(raw) ||
    !(isText(raw.id) && isText(raw.wrong) && isText(raw.right) && isText(raw.note) && isText(raw.sentence) && isText(raw.createdAt)) ||
    typeof raw.unit !== 'number' || !Number.isInteger(raw.unit) || raw.unit < 1
  ) {
    return null
  }
  return {
    id: raw.id,
    wrong: raw.wrong,
    right: raw.right,
    note: raw.note,
    sentence: raw.sentence,
    unit: raw.unit,
    createdAt: raw.createdAt,
    reviews: (Array.isArray(raw.reviews) ? raw.reviews : [])
      .filter(isObject)
      .filter(r => isText(r.at) && typeof r.isCorrect === 'boolean')
      .map(r => ({ at: r.at as string, isCorrect: r.isCorrect as boolean }))
      .slice(-MAX_REVIEWS),
  }
}

/** Whatever `$.store` held under `mistakes` (the layout before one key per card); none when it is not readable. */
export function parseMistakes(raw: unknown): LingoMistakes {
  if (!isObject(raw) || raw.version !== MISTAKES_VERSION || !Array.isArray(raw.cards)) return NO_MISTAKES
  const cards = raw.cards.map(parseMistakeCard).filter((c): c is LingoMistakeCard => c !== null)
  return { version: MISTAKES_VERSION, cards: cards.slice(-MAX_MISTAKES) }
}

/** A closed unit's corrections as cards. A pair already kept is made again from this unit, as a fresh mistake. */
export function addCorrections(
  mistakes: LingoMistakes,
  corrections: readonly LingoCorrection[],
  unit: number,
  at: string,
): LingoMistakes {
  let cards = mistakes.cards
  for (const c of corrections) {
    // A question card has no wrong words: the question names it.
    const id = mistakeId(c.wrong === '' ? c.sentence : c.wrong, c.right)
    const before = cards.find(card => card.id === id)
    cards = [
      ...cards.filter(card => card.id !== id),
      { id, wrong: c.wrong, right: c.right, note: c.note, sentence: c.sentence, unit, createdAt: at, reviews: before?.reviews ?? [] },
    ]
  }
  return { ...mistakes, cards: cards.slice(-MAX_MISTAKES) }
}

/** A mistake as a review card: fix the marked words in the learner's own line. */
export function mistakeAsCard(card: LingoMistakeCard): Card {
  return { id: card.id, prompt: card.sentence, answer: card.right, tags: ['mistake'], lesson: card.unit }
}

/** The cards due at `currentUnit` (the unit about to start): from units n-1, n-3, n-7, failed ones first. */
export function dueMistakes(mistakes: LingoMistakes, currentUnit: number, algorithm: ReviewAlgorithm): LingoMistakeCard[] {
  const due = algorithm.dueCards(
    mistakes.cards.map(mistakeAsCard),
    mistakes.cards.map(c => ({ cardId: c.id, reviews: c.reviews })),
    { now: new Date(0), currentLesson: currentUnit },
  )
  return due.map(card => mistakes.cards.find(c => c.id === card.id)).filter((c): c is LingoMistakeCard => c !== undefined)
}

export function recordMistakeReview(mistakes: LingoMistakes, id: string, at: string, isCorrect: boolean): LingoMistakes {
  return {
    ...mistakes,
    cards: mistakes.cards.map(c => (c.id === id ? { ...c, reviews: [...c.reviews, { at, isCorrect }].slice(-MAX_REVIEWS) } : c)),
  }
}

/**
 * How a woven card went in a unit: the learner used the right form (true), the
 * wrong one again (false), or neither (null: nothing to record).
 */
export function wovenOutcome(lines: readonly LingoLine[], card: { wrong: string; right: string }): boolean | null {
  const said = ` ${lines.filter(l => l.who === 'you').map(l => normalizeAnswer(l.text)).join(' ')} `
  if (said.includes(` ${normalizeAnswer(card.right)} `)) return true
  if (said.includes(` ${normalizeAnswer(card.wrong)} `)) return false
  return null
}

/** The Spinner's line for a mistake. */
export const spinnerLine = (card: { wrong: string; right: string }): string => `${card.wrong} → ${card.right}`

/**
 * Cards from a wrong form (not reading questions) that would still pass as a
 * correction: the ones to weave into a prompt and to show in the Spinner. A card
 * kept under older rules that does not is still kept and reviewed (the review
 * draws it and a hint for it is asked of the tutor), but it is never woven into a
 * conversation nor shown in the Spinner.
 */
export const isFormCard = (card: LingoMistakeCard): boolean => card.wrong !== '' && validCorrection(card) !== null

/** The mistake the Spinner shows this turn: a due one if any, else one of the latest; null with none. */
export function pickForTurn(
  mistakes: LingoMistakes,
  currentUnit: number,
  turnId: string,
  algorithm: ReviewAlgorithm,
): LingoMistakeCard | null {
  const due = dueMistakes(mistakes, currentUnit, algorithm).filter(isFormCard)
  const pool = due.length > 0 ? due : mistakes.cards.filter(isFormCard).slice(-20)
  return pool[pickIndex(turnId, pool.length)] ?? null
}
