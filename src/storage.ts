// Everything the mod keeps in `$.store` goes through here: the keys, reading with
// the validators that already guard each value, and changing a value by reading
// it again first. `$.store` is not atomic and is shared between sessions, so
// re-reading narrows the window in which two sessions overwrite each other; it
// does not close it. A value that cannot be read or written never throws here:
// a read falls back as a corrupt value does, a change is skipped (never written
// over a value that could not be read) and says so by returning null.

import { nextUnit, parseActivityLog, recordUnit, ACTIVITY_STORE_KEY } from './activities'
import { PROGRESS_STORE_KEY, parseProgress } from './lesson'
import { MISTAKES_STORE_KEY, addCorrections, parseMistakes, recordMistakeReview, wovenOutcome } from './mistakes'
import { SETUP_STORE_KEY, parseSetup } from './setup'
import type { LingoActivity, LingoActivityLog, LingoCorrection, LingoLine, LingoUnitSummary } from '../types'

/** What the module needs of `$.store`. A hooks module cannot hand `$` across an import: it wraps the two calls (`storeOf` in hooks/register.tsx). */
export type Store = {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
}

/** A key and the validator for what it holds: `parse` takes anything and always answers. */
export type Entry<T> = { key: string; parse: (raw: unknown) => T }

export const SETUP: Entry<ReturnType<typeof parseSetup>> = { key: SETUP_STORE_KEY, parse: parseSetup }
export const PROGRESS: Entry<ReturnType<typeof parseProgress>> = { key: PROGRESS_STORE_KEY, parse: parseProgress }
export const MISTAKES: Entry<ReturnType<typeof parseMistakes>> = { key: MISTAKES_STORE_KEY, parse: parseMistakes }
export const ACTIVITY: Entry<LingoActivityLog> = { key: ACTIVITY_STORE_KEY, parse: parseActivityLog }

/** What the store holds under the entry; what a missing or corrupt value gives, when it cannot be read. */
export async function load<T>(store: Store, entry: Entry<T>): Promise<T> {
  try {
    return entry.parse(await store.get(entry.key))
  } catch {
    return entry.parse(undefined)
  }
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
    const before = entry.parse(await store.get(entry.key))
    const after = change(before)
    if (after !== before) await store.set(entry.key, after)
    return { before, after }
  } catch {
    return null
  }
}

/** Writes the value as it is; false when the store failed. */
export async function save<T>(store: Store, entry: Entry<T>, value: T): Promise<boolean> {
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

// The unit's corrections as cards numbered `unitNumber`, and the woven ones counted as reviewed.
function saveMistakes(store: Store, unit: UnitMistakes, unitNumber: number, at: string) {
  if (unit.corrections.length === 0 && unit.woven.length === 0) return Promise.resolve(null)
  return modify(store, MISTAKES, mistakes => {
    let changed = mistakes
    for (const card of unit.woven) {
      const outcome = wovenOutcome(unit.lines, card)
      if (outcome !== null) changed = recordMistakeReview(changed, card.id, at, outcome)
    }
    return addCorrections(changed, unit.corrections, unitNumber, at)
  })
}

/**
 * A finished unit, recorded in one step: the activity log counts it (and keeps
 * its id, which marks it as recorded), and its mistakes become cards numbered
 * by the unit the log just gave it, so the two always agree and the recall at
 * n+1, n+3 and n+7 lands on the right units. A unit whose id is already in the
 * log is left alone. The log goes first: if the store fails after it the cards
 * of that unit are lost, but a retry never counts the unit twice. Null when the
 * log could not be written (nothing was recorded).
 */
export async function commitUnit(
  store: Store,
  unit: FinishedUnit,
  at: string,
): Promise<{ isRecorded: boolean; log: LingoActivityLog } | null> {
  const logged = await modify(store, ACTIVITY, log =>
    log.recent.some(r => r.id === unit.id) ? log : recordUnit(log, unit.activity, unit.summary, at, unit.id),
  )
  if (logged === null) return null
  const isRecorded = logged.after !== logged.before
  if (isRecorded) await saveMistakes(store, unit, logged.after.units, at)
  return { isRecorded, log: logged.after }
}

/**
 * The mistakes of a unit that is not logged (left half done for another one, or
 * a reading's answer that was shown), numbered by the unit that comes next.
 */
export async function keepMistakes(store: Store, unit: UnitMistakes, at: string): Promise<void> {
  await saveMistakes(store, unit, nextUnit(await load(store, ACTIVITY)), at)
}
