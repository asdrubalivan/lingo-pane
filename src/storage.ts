// Everything the mod keeps in `$.store` goes through here: the keys, reading with
// the validators that already guard each value, and changing a value by reading
// it again first. `$.store` is not atomic and is shared between sessions, so
// re-reading narrows the window in which two sessions overwrite each other; it
// does not close it. A value that cannot be read or written never throws here:
// a read falls back as a corrupt value does, a change is skipped (never written
// over a value that could not be read) and says so by returning null.
//
// Card progress and each mistake live under a key of their own, so a change
// writes only the items it touched and two sessions answering different cards
// lose nothing. Layout:
//   setup, activity           one value each
//   progress.lesson           { version, currentLesson }
//   progress.card.<cardId>    { version, reviews }          (no index: the pack's ids are known)
//   mistakes.index            { version, ids }              (oldest first; review needs the list)
//   mistakes.card.<id>        { version, ...card }
//   storage.layout            marks the move from the old `progress` and `mistakes` keys as done
// The old whole-object keys stay as they were for one release. Until the move is
// marked done, a read joins both layouts item by item (what the new layout holds
// wins), so a move that cannot finish never stops a change from being saved.

import { nextUnit, parseActivityLog, recordUnit, ACTIVITY_STORE_KEY } from './activities'
import { FRESH_PROGRESS, PROGRESS_STORE_KEY, PROGRESS_VERSION, parseCardProgress, parseLessonNumber, parseProgress } from './lesson'
import {
  MAX_MISTAKES,
  MISTAKES_STORE_KEY,
  MISTAKES_VERSION,
  NO_MISTAKES,
  addCorrections,
  parseMistakeCard,
  parseMistakes,
  recordMistakeReview,
  wovenOutcome,
} from './mistakes'
import { SETUP_STORE_KEY, parseSetup } from './setup'
import type {
  LingoActivity,
  LingoActivityLog,
  LingoCorrection,
  LingoLine,
  LingoMistakeCard,
  LingoMistakes,
  LingoProgress,
  LingoUnitSummary,
} from '../types'

/** What the module needs of `$.store`. A hooks module cannot hand `$` across an import: it wraps the calls (`storeOf` in hooks/register.tsx). */
export type Store = {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
}

/**
 * A value kept in the store and how to move it in and out. `read` throws when
 * the store fails; `write` gets what `read` gave and the changed value and
 * writes only the difference.
 */
export type Entry<T> = {
  empty: T
  read: (store: Store) => Promise<T>
  write: (store: Store, before: T, after: T) => Promise<void>
}

/** An entry that is one value under one key; `parse` takes anything and always answers. */
export type Whole<T> = Entry<T> & { key: string; parse: (raw: unknown) => T }

function whole<T>(key: string, parse: (raw: unknown) => T): Whole<T> {
  return {
    key,
    parse,
    empty: parse(undefined),
    read: async store => parse(await store.get(key)),
    write: (store, _before, after) => store.set(key, after),
  }
}

export const SETUP = whole(SETUP_STORE_KEY, parseSetup)
export const ACTIVITY: Whole<LingoActivityLog> = whole(ACTIVITY_STORE_KEY, parseActivityLog)

// --- Layout: one key per item -----------------------------------------------

const LAYOUT_KEY = 'storage.layout'
const LAYOUT_VERSION = 1
const PROGRESS_LESSON_KEY = 'progress.lesson'
const MISTAKES_INDEX_KEY = 'mistakes.index'
export const progressCardKey = (cardId: string): string => `progress.card.${cardId}`
export const mistakeKey = (id: string): string => `mistakes.card.${id}`

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// A stored item is accepted only at the version this code writes.
const versioned = (raw: unknown, version: number): Record<string, unknown> | null =>
  isObject(raw) && raw.version === version ? raw : null

function parseIndex(raw: unknown): string[] {
  const item = versioned(raw, MISTAKES_VERSION)
  if (item === null || !Array.isArray(item.ids)) return []
  const ids = item.ids.filter((id): id is string => typeof id === 'string')
  return [...new Set(ids)].slice(-MAX_MISTAKES)
}

const isAbsent = async (store: Store, key: string): Promise<boolean> => (await store.get(key)) === undefined

// The old `progress` key becomes the lesson key and one key per card; what the
// new layout already holds is not touched, so a session that moved first and
// has since written is never overwritten by one that moves second.
async function moveProgress(store: Store) {
  const old = parseProgress(await store.get(PROGRESS_STORE_KEY))
  if (old.currentLesson !== FRESH_PROGRESS.currentLesson && (await isAbsent(store, PROGRESS_LESSON_KEY))) {
    await store.set(PROGRESS_LESSON_KEY, { version: PROGRESS_VERSION, currentLesson: old.currentLesson })
  }
  for (const [id, card] of Object.entries(old.cards)) {
    if (await isAbsent(store, progressCardKey(id))) await store.set(progressCardKey(id), { version: PROGRESS_VERSION, ...card })
  }
}

async function moveMistakes(store: Store) {
  const old = parseMistakes(await store.get(MISTAKES_STORE_KEY))
  for (const card of old.cards) {
    if (await isAbsent(store, mistakeKey(card.id))) await store.set(mistakeKey(card.id), { version: MISTAKES_VERSION, ...card })
  }
  const current = parseIndex(await store.get(MISTAKES_INDEX_KEY))
  const merged = [...new Set([...old.cards.map(c => c.id), ...current])].slice(-MAX_MISTAKES)
  if (merged.length !== current.length) await store.set(MISTAKES_INDEX_KEY, { version: MISTAKES_VERSION, ids: merged })
}

/**
 * Moves the old whole-object `progress` and `mistakes` keys to the layout above,
 * once: the marker is written last, so a move that failed half way is simply
 * made again (it only adds what is missing). The old keys are left as they are.
 * False when the store failed and the move is not done; nothing is lost then,
 * because the old keys are still there and reads join them with the new ones.
 */
export async function migrate(store: Store): Promise<boolean> {
  try {
    if (versioned(await store.get(LAYOUT_KEY), LAYOUT_VERSION) !== null) return true
    await moveProgress(store)
    await moveMistakes(store)
    await store.set(LAYOUT_KEY, { version: LAYOUT_VERSION })
    return true
  } catch {
    return false
  }
}

/**
 * The progress of the cards whose ids are given (the built-in pack's): the
 * lesson and each card under its own key. A change writes the cards whose
 * attempts changed and the lesson if it moved.
 */
export function progressOf(cardIds: readonly string[]): Entry<LingoProgress> {
  return {
    empty: FRESH_PROGRESS,
    read: async store => {
      const isMoved = await migrate(store)
      const [lesson, ...stored] = await Promise.all([
        store.get(PROGRESS_LESSON_KEY),
        ...cardIds.map(id => store.get(progressCardKey(id))),
      ])
      // Not moved yet: what the new layout lacks is read from the old key (which must be readable).
      const old = isMoved ? FRESH_PROGRESS : parseProgress(await store.get(PROGRESS_STORE_KEY))
      const cards: LingoProgress['cards'] = {}
      cardIds.forEach((id, i) => {
        const item = versioned(stored[i], PROGRESS_VERSION)
        const card = (item === null ? null : parseCardProgress(item)) ?? old.cards[id]
        if (card !== undefined) cards[id] = card
      })
      const item = versioned(lesson, PROGRESS_VERSION)
      const currentLesson = (item === null ? null : parseLessonNumber(item.currentLesson)) ?? old.currentLesson
      return { version: PROGRESS_VERSION, currentLesson, cards }
    },
    write: async (store, before, after) => {
      for (const [id, card] of Object.entries(after.cards)) {
        if (card !== before.cards[id]) await store.set(progressCardKey(id), { version: PROGRESS_VERSION, ...card })
      }
      if (after.currentLesson !== before.currentLesson) {
        await store.set(PROGRESS_LESSON_KEY, { version: PROGRESS_VERSION, currentLesson: after.currentLesson })
      }
    },
  }
}

/**
 * The mistake cards, oldest first: an index of ids and each card under its own
 * key. A change writes the cards that changed, then the index if the list of
 * ids moved (so it never names a card that is not there), then drops the keys
 * of cards that fell off the end. The index is the one key two sessions can
 * still overwrite, and only when both add a new mistake at the same time.
 */
export const MISTAKES: Entry<LingoMistakes> = {
  empty: NO_MISTAKES,
  read: async store => {
    const isMoved = await migrate(store)
    const raw = await store.get(MISTAKES_INDEX_KEY)
    // Not moved yet: the old key (which must be readable) lists what the new layout does not list yet.
    const old = isMoved ? NO_MISTAKES : parseMistakes(await store.get(MISTAKES_STORE_KEY))
    const ids = versioned(raw, MISTAKES_VERSION) === null && !isMoved ? old.cards.map(c => c.id) : parseIndex(raw)
    const oldCards = new Map(old.cards.map(c => [c.id, c]))
    const stored = await Promise.all(ids.map(id => store.get(mistakeKey(id))))
    const cards = stored.flatMap((value, i) => {
      const item = versioned(value, MISTAKES_VERSION)
      const card = (item === null ? null : parseMistakeCard(item)) ?? oldCards.get(ids[i] as string)
      return card !== undefined && card.id === ids[i] ? [card] : []
    })
    return { version: MISTAKES_VERSION, cards }
  },
  write: async (store, before, after) => {
    const kept = new Map<string, LingoMistakeCard>(before.cards.map(c => [c.id, c]))
    for (const card of after.cards) {
      if (card !== kept.get(card.id)) await store.set(mistakeKey(card.id), { version: MISTAKES_VERSION, ...card })
    }
    const ids = after.cards.map(c => c.id)
    if (ids.join('\n') !== before.cards.map(c => c.id).join('\n')) {
      await store.set(MISTAKES_INDEX_KEY, { version: MISTAKES_VERSION, ids })
    }
    // A key left behind only costs space, so a failed delete is not an error.
    const stays = new Set(ids)
    for (const id of kept.keys()) {
      if (!stays.has(id)) await store.delete(mistakeKey(id)).catch(() => undefined)
    }
  },
}

// --- Reading and changing ---------------------------------------------------

/** What the store holds for the entry; null when it cannot be read (a missing or corrupt value is not a failure: it reads as the entry's empty one). */
export async function tryLoad<T>(store: Store, entry: Entry<T>): Promise<T | null> {
  try {
    return await entry.read(store)
  } catch {
    return null
  }
}

/** What the store holds for the entry; what a missing or corrupt value gives, when it cannot be read. */
export async function load<T>(store: Store, entry: Entry<T>): Promise<T> {
  return (await tryLoad(store, entry)) ?? entry.empty
}

/**
 * Reads the entry again, applies a pure change and writes the result. Answers
 * what it read and what it wrote (the same object when the change left it as
 * it was, and then nothing is written), or null when the store failed.
 */
export async function modify<T>(
  store: Store,
  entry: Entry<T>,
  change: (current: T) => T,
): Promise<{ before: T; after: T } | null> {
  try {
    const before = await entry.read(store)
    const after = change(before)
    if (after !== before) await entry.write(store, before, after)
    return { before, after }
  } catch {
    return null
  }
}

/** Writes the value as it is; false when the store failed. */
export async function save<T>(store: Store, entry: Whole<T>, value: T): Promise<boolean> {
  try {
    await store.set(entry.key, value)
    return true
  } catch {
    return false
  }
}

/** What a closed unit leaves in the mistakes: the corrections it made and how the woven cards went. */
export type UnitMistakes = {
  corrections: readonly LingoCorrection[]
  woven: readonly { id: string; wrong: string; right: string }[]
  lines: readonly LingoLine[]
}

/** A finished unit of any activity. A reading has no lines and keeps its cards as the answers are shown. */
export type FinishedUnit = UnitMistakes & { id: string; activity: LingoActivity; summary: LingoUnitSummary }

// The unit's corrections as cards numbered `unitNumber`, and the woven ones counted as reviewed. False when the store failed.
async function saveMistakes(store: Store, unit: UnitMistakes, unitNumber: number, at: string): Promise<boolean> {
  if (unit.corrections.length === 0 && unit.woven.length === 0) return true
  const saved = await modify(store, MISTAKES, mistakes => {
    let changed = mistakes
    for (const card of unit.woven) {
      const outcome = wovenOutcome(unit.lines, card)
      if (outcome !== null) changed = recordMistakeReview(changed, card.id, at, outcome)
    }
    return addCorrections(changed, unit.corrections, unitNumber, at)
  })
  return saved !== null
}

/**
 * A finished unit, recorded in one step: the activity log counts it (and keeps
 * its id, which marks it as recorded), and its mistakes become cards numbered
 * by the unit the log just gave it, so the two always agree and the recall at
 * n+1, n+3 and n+7 lands on the right units. A unit whose id is already in the
 * log is left alone. The log goes first: if the store fails after it the cards
 * of that unit are lost, but a retry never counts the unit twice. Null when the
 * log could not be written (nothing was recorded); `areMistakesKept` is false
 * when the cards could not be, so the caller can say so.
 */
export async function commitUnit(
  store: Store,
  unit: FinishedUnit,
  at: string,
): Promise<{ isRecorded: boolean; areMistakesKept: boolean; log: LingoActivityLog } | null> {
  const logged = await modify(store, ACTIVITY, log =>
    log.recent.some(r => r.id === unit.id) ? log : recordUnit(log, unit.activity, unit.summary, at, unit.id),
  )
  if (logged === null) return null
  const isRecorded = logged.after !== logged.before
  const areMistakesKept = isRecorded ? await saveMistakes(store, unit, logged.after.units, at) : true
  return { isRecorded, areMistakesKept, log: logged.after }
}

/**
 * The mistakes of a unit that is not logged (left half done for another one, or
 * a reading's answer that was shown), numbered by the unit that comes next.
 */
export function keepMistakes(store: Store, unit: UnitMistakes, at: string): Promise<boolean> {
  return load(store, ACTIVITY).then(log => saveMistakes(store, unit, nextUnit(log), at))
}
