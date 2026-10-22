import { expect, test } from 'claude-code/testing'

import { MISTAKES, PROGRESS, SETUP, ACTIVITY, commitUnit, keepMistakes, load, modify } from './storage'
import type { Store } from './storage'
import { mistakeId } from './mistakes'
import { advanceLesson } from './lesson'

// A store in memory, as the engine keeps it (JSON in, JSON out), that can fail
// on a key and lets a test play "another session" by writing behind the module.
function memory(initial: Record<string, unknown> = {}) {
  const entries = new Map<string, unknown>(Object.entries(initial))
  const failing = { get: new Set<string>(), set: new Set<string>() }
  const store: Store = {
    get: async key => {
      if (failing.get.has(key)) throw new Error(`read ${key}`)
      return entries.get(key)
    },
    set: async (key, value) => {
      if (failing.set.has(key)) throw new Error(`write ${key}`)
      entries.set(key, JSON.parse(JSON.stringify(value)))
    },
  }
  return { store, entries, failing }
}

const GO = { wrong: 'go', right: 'went', note: 'pasado', sentence: 'I go to the beach yesterday.' }
const AT = '2026-10-02T10:00:00.000Z'
const SUMMARY = { sentences: 3, corrections: 1 }
const unit = (id: string, overrides: Partial<Parameters<typeof commitUnit>[1]> = {}) => ({
  id,
  activity: 'conversation' as const,
  summary: SUMMARY,
  corrections: [GO],
  woven: [],
  lines: [],
  ...overrides,
})

test('load parses what the store holds with the key\'s own validator', async () => {
  const { store } = memory({ progress: { version: 1, currentLesson: 3, cards: {} } })
  expect((await load(store, PROGRESS)).currentLesson).toBe(3)
})

test('load falls back safely: missing, corrupt, unknown version, or a store that fails to read', async () => {
  const { store, entries, failing } = memory()
  expect(await load(store, MISTAKES)).toEqual({ version: 1, cards: [] })
  entries.set('mistakes', 'not json at all')
  expect(await load(store, MISTAKES)).toEqual({ version: 1, cards: [] })
  entries.set('mistakes', { version: 99, cards: [{ id: 'x' }] })
  expect(await load(store, MISTAKES)).toEqual({ version: 1, cards: [] })
  entries.set('activity', { version: 2, units: 7 })
  expect((await load(store, ACTIVITY)).units).toBe(0)
  entries.set('setup', { version: 1 })
  expect(await load(store, SETUP)).toBeNull()
  entries.set('progress', { version: 1, currentLesson: 4, cards: {} })
  failing.get.add('progress')
  expect((await load(store, PROGRESS)).currentLesson).toBe(1)
})

test('modify re-reads before it changes, so a write made meanwhile by another session is kept', async () => {
  const { store, entries } = memory({ progress: { version: 1, currentLesson: 1, cards: {} } })
  const first = await modify(store, PROGRESS, p => advanceLesson(p, 5))
  // Another session advances behind this one's back.
  entries.set('progress', { version: 1, currentLesson: 3, cards: {} })
  const second = await modify(store, PROGRESS, p => advanceLesson(p, 5))
  expect(first?.after.currentLesson).toBe(2)
  expect(second?.before.currentLesson).toBe(3)
  expect((entries.get('progress') as { currentLesson: number }).currentLesson).toBe(4)
})

test('modify writes nothing when the change returns what it was given', async () => {
  const { store, entries } = memory()
  const result = await modify(store, PROGRESS, p => p)
  expect(result?.after).toBe(result?.before)
  expect(entries.has('progress')).toBe(false)
})

test('modify never writes over a value it could not read', async () => {
  const { store, entries, failing } = memory({ mistakes: { version: 1, cards: [{ id: 'a' }] } })
  failing.get.add('mistakes')
  expect(await modify(store, MISTAKES, m => ({ ...m, cards: [] }))).toBeNull()
  expect(entries.get('mistakes')).toEqual({ version: 1, cards: [{ id: 'a' }] })
})

test('modify says so when the write fails, and does not throw', async () => {
  const { store, entries, failing } = memory()
  failing.set.add('progress')
  expect(await modify(store, PROGRESS, p => advanceLesson(p, 5))).toBeNull()
  expect(entries.has('progress')).toBe(false)
})

test('a finished unit fixes its number once: the mistakes and the log agree on it', async () => {
  const { store, entries } = memory({ activity: { version: 1, units: 4, lastDoneAt: {}, done: {}, recent: [] } })
  const done = await commitUnit(store, unit('conversation-1'), AT)
  expect(done?.isRecorded).toBe(true)
  expect((entries.get('activity') as { units: number }).units).toBe(5)
  const cards = (entries.get('mistakes') as { cards: { unit: number }[] }).cards
  expect(cards.map(c => c.unit)).toEqual([5])
})

test('the number is the log\'s even when another session logged a unit meanwhile', async () => {
  const { store, entries } = memory({ activity: { version: 1, units: 1, lastDoneAt: {}, done: {}, recent: [] } })
  // This session read 1; the other one finishes unit 2 before this one commits.
  entries.set('activity', { version: 1, units: 2, lastDoneAt: {}, done: { reading: 1 }, recent: [] })
  await commitUnit(store, unit('conversation-1'), AT)
  expect((entries.get('activity') as { units: number }).units).toBe(3)
  expect((entries.get('mistakes') as { cards: { unit: number }[] }).cards[0]?.unit).toBe(3)
})

test('a repeated finish records the unit once: one log entry, one card, one review', async () => {
  const id = mistakeId('go', 'went')
  const card = { id, wrong: 'go', right: 'went' }
  const { store, entries } = memory({
    mistakes: { version: 1, cards: [{ id, ...GO, unit: 1, createdAt: AT, reviews: [] }] },
    activity: { version: 1, units: 1, lastDoneAt: {}, done: {}, recent: [] },
  })
  const finished = unit('conversation-2', {
    corrections: [],
    woven: [card],
    lines: [{ who: 'you', text: 'I went home.' }],
  })
  const first = await commitUnit(store, finished, AT)
  const second = await commitUnit(store, finished, AT)
  expect(first?.isRecorded).toBe(true)
  expect(second?.isRecorded).toBe(false)
  const log = entries.get('activity') as { units: number; done: Record<string, number>; recent: unknown[] }
  expect(log.units).toBe(2)
  expect(log.done).toEqual({ conversation: 1 })
  expect(log.recent.length).toBe(1)
  const saved = (entries.get('mistakes') as { cards: { reviews: unknown[] }[] }).cards
  expect(saved[0]?.reviews.length).toBe(1)
})

test('a unit with nothing to keep still counts, and leaves the mistakes alone', async () => {
  const { store, entries } = memory()
  await commitUnit(store, unit('reading-1', { activity: 'reading', corrections: [] }), AT)
  expect((entries.get('activity') as { units: number }).units).toBe(1)
  expect(entries.has('mistakes')).toBe(false)
})

test('a store that cannot write the log records nothing, mistakes included', async () => {
  const { store, entries, failing } = memory()
  failing.set.add('activity')
  expect(await commitUnit(store, unit('conversation-1'), AT)).toBeNull()
  expect(entries.has('mistakes')).toBe(false)
})

test('a store that cannot write the mistakes still logs the unit', async () => {
  const { store, entries, failing } = memory()
  failing.set.add('mistakes')
  const done = await commitUnit(store, unit('conversation-1'), AT)
  expect(done?.isRecorded).toBe(true)
  expect((entries.get('activity') as { units: number }).units).toBe(1)
})

test('mistakes of a unit left half done are numbered by the next unit, without logging it', async () => {
  const { store, entries } = memory({ activity: { version: 1, units: 2, lastDoneAt: {}, done: {}, recent: [] } })
  await keepMistakes(store, unit('conversation-1'), AT)
  expect((entries.get('mistakes') as { cards: { unit: number }[] }).cards[0]?.unit).toBe(3)
  expect((entries.get('activity') as { units: number }).units).toBe(2)
})
