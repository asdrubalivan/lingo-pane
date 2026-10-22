import { expect, test } from 'claude-code/testing'

import { ACTIVITY, MISTAKES, SETUP, commitUnit, keepMistakes, load, migrate, mistakeKey, modify, progressCardKey, progressOf } from './storage'
import type { Store } from './storage'
import { memoryStore as memory } from './memory-store'
import { MAX_MISTAKES, mistakeId, parseMistakes, recordMistakeReview } from './mistakes'
import { advanceLesson, parseProgress, recordAttempt } from './lesson'
import type { LingoMistakeCard } from '../types'

const PACK = ['c1', 'c2', 'c3', 'c4']
const PROGRESS = progressOf(PACK)
// What a store holds once the move to the layout of one key per item is done.
const MOVED = { 'storage.layout': { version: 1 } }

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

const card = (id: string, unit: number, overrides: Partial<LingoMistakeCard> = {}): LingoMistakeCard => ({
  id,
  wrong: `wrong ${id}`,
  right: `right ${id}`,
  note: 'nota',
  sentence: `a sentence with wrong ${id}`,
  unit,
  createdAt: AT,
  reviews: [],
  ...overrides,
})

// A second view of the store whose writes wait: `arrived` says the session has read and
// is about to write, `release` lets it. Whatever runs in between is "another session".
function stalled(store: Store) {
  let release = () => {}
  let arrive = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  const arrived = new Promise<void>(resolve => (arrive = resolve))
  const slow: Store = { ...store, set: async (key, value) => (arrive(), await held, store.set(key, value)) }
  return { slow, arrived, release }
}

// What a learner of a few weeks has under the old keys: progress through lesson 3
// with attempts on several cards, and mistakes with some reviews.
const OLD_PROGRESS = {
  version: 1,
  currentLesson: 3,
  cards: {
    c1: { reviews: [{ at: AT, isCorrect: false }, { at: AT, isCorrect: true }] },
    c2: { reviews: [{ at: AT, isCorrect: true }] },
    c4: { reviews: [{ at: AT, isCorrect: false }] },
    'not-in-the-pack': { reviews: [{ at: AT, isCorrect: true }] },
  },
}
const OLD_MISTAKES = {
  version: 1,
  cards: [
    card('mistake-00000001', 1),
    card('mistake-00000002', 2, { reviews: [{ at: AT, isCorrect: false }, { at: AT, isCorrect: true }] }),
    card('mistake-00000003', 4, { wrong: '', sentence: 'What is the capital?' }),
  ],
}
const oldLayout = () => ({ progress: OLD_PROGRESS, mistakes: OLD_MISTAKES })

// --- Reading and changing ----------------------------------------------------

test('load parses what the store holds with the key\'s own validator', async () => {
  const { store } = memory(new Map(Object.entries({ ...MOVED, 'progress.lesson': { version: 1, currentLesson: 3 } })))
  expect((await load(store, PROGRESS)).currentLesson).toBe(3)
})

test('load falls back safely: missing, corrupt, unknown version, or a store that fails to read', async () => {
  const { store, entries, failing } = memory()
  expect(await load(store, MISTAKES)).toEqual({ version: 1, cards: [] })
  entries.set('mistakes.index', 'not json at all')
  expect(await load(store, MISTAKES)).toEqual({ version: 1, cards: [] })
  entries.set('mistakes.index', { version: 99, ids: ['x'] })
  expect(await load(store, MISTAKES)).toEqual({ version: 1, cards: [] })
  entries.set('activity', { version: 2, units: 7 })
  expect((await load(store, ACTIVITY)).units).toBe(0)
  entries.set('setup', { version: 1 })
  expect(await load(store, SETUP)).toBeNull()
  entries.set('progress.lesson', { version: 1, currentLesson: 4 })
  failing.get.add('progress.lesson')
  expect((await load(store, PROGRESS)).currentLesson).toBe(1)
})

test('modify re-reads before it changes, so a write made meanwhile by another session is kept', async () => {
  const { store, entries } = memory(new Map(Object.entries(MOVED)))
  const first = await modify(store, PROGRESS, p => advanceLesson(p, 5))
  // Another session advances behind this one's back.
  entries.set('progress.lesson', { version: 1, currentLesson: 3 })
  const second = await modify(store, PROGRESS, p => advanceLesson(p, 5))
  expect(first?.after.currentLesson).toBe(2)
  expect(second?.before.currentLesson).toBe(3)
  expect(entries.get('progress.lesson')).toEqual({ version: 1, currentLesson: 4 })
})

test('modify writes nothing when the change returns what it was given', async () => {
  const { store, writes } = memory(new Map(Object.entries(MOVED)))
  const result = await modify(store, PROGRESS, p => p)
  expect(result?.after).toBe(result?.before)
  expect(writes).toEqual([])
})

test('modify never writes over a value it could not read', async () => {
  const { store, entries, failing, writes } = memory(new Map(Object.entries({
    ...MOVED,
    'mistakes.index': { version: 1, ids: ['a'] },
    'mistakes.card.a': { version: 1, ...card('a', 1) },
  })))
  failing.get.add('mistakes.card.a')
  expect(await modify(store, MISTAKES, m => ({ ...m, cards: [] }))).toBeNull()
  expect(writes).toEqual([])
  expect(entries.get('mistakes.index')).toEqual({ version: 1, ids: ['a'] })
})

test('modify says so when the write fails, and does not throw', async () => {
  const { store, entries, failing } = memory(new Map(Object.entries(MOVED)))
  failing.set.add('progress.lesson')
  expect(await modify(store, PROGRESS, p => advanceLesson(p, 5))).toBeNull()
  expect(entries.has('progress.lesson')).toBe(false)
})

// --- One key per item --------------------------------------------------------

test('an attempt writes only that card\'s key', async () => {
  const { store, entries, writes } = memory(new Map(Object.entries(MOVED)))
  await modify(store, PROGRESS, p => recordAttempt(p, 'c2', AT, true))
  await modify(store, PROGRESS, p => recordAttempt(p, 'c2', AT, false))
  expect(writes).toEqual([progressCardKey('c2'), progressCardKey('c2')])
  expect(entries.get(progressCardKey('c2'))).toEqual({
    version: 1,
    reviews: [{ at: AT, isCorrect: true }, { at: AT, isCorrect: false }],
  })
  expect((await load(store, PROGRESS)).cards).toEqual({ c2: { reviews: [{ at: AT, isCorrect: true }, { at: AT, isCorrect: false }] } })
})

test('a mistake review writes only that mistake\'s key, and a new mistake its key and the index', async () => {
  const { store, writes } = memory(new Map(Object.entries({
    ...MOVED,
    'mistakes.index': { version: 1, ids: ['a', 'b'] },
    'mistakes.card.a': { version: 1, ...card('a', 1) },
    'mistakes.card.b': { version: 1, ...card('b', 2) },
  })))
  await modify(store, MISTAKES, m => recordMistakeReview(m, 'b', AT, true))
  expect(writes).toEqual([mistakeKey('b')])
  writes.length = 0
  await keepMistakes(store, unit('conversation-1'), AT)
  expect(writes).toEqual([mistakeKey(mistakeId('go', 'went')), 'mistakes.index'])
  expect((await load(store, MISTAKES)).cards.map(c => c.id)).toEqual(['a', 'b', mistakeId('go', 'went')])
})

test('mistakes that fall off the end lose their keys; a key that cannot be deleted is no error', async () => {
  const cards = Array.from({ length: MAX_MISTAKES }, (_, i) => card(`m${i}`, 1))
  const seeded: Record<string, unknown> = { ...MOVED, 'mistakes.index': { version: 1, ids: cards.map(c => c.id) } }
  for (const c of cards) seeded[mistakeKey(c.id)] = { version: 1, ...c }
  const { store, entries, failing } = memory(new Map(Object.entries(seeded)))
  await keepMistakes(store, unit('conversation-1'), AT)
  expect(entries.has(mistakeKey('m0'))).toBe(false)
  expect(entries.has(mistakeKey('m1'))).toBe(true)
  expect((await load(store, MISTAKES)).cards).toHaveLength(MAX_MISTAKES)

  failing.delete.add(mistakeKey('m1'))
  expect(await modify(store, MISTAKES, m => ({ ...m, cards: m.cards.slice(1) }))).not.toBeNull()
  expect(entries.has(mistakeKey('m1'))).toBe(true)
  expect((await load(store, MISTAKES)).cards.some(c => c.id === 'm1')).toBe(false)
})

test('two sessions answering different cards lose no attempts, even when one writes after the other finished', async () => {
  const { store, entries } = memory(new Map(Object.entries(MOVED)))
  // The first session reads, then its write waits until the second one is done.
  const { slow, arrived, release } = stalled(store)
  const first = modify(slow, PROGRESS, p => recordAttempt(p, 'c1', AT, false))
  await arrived
  await modify(store, PROGRESS, p => recordAttempt(p, 'c2', AT, true))
  release()
  await first

  const progress = await load(store, PROGRESS)
  expect(progress.cards.c1?.reviews).toEqual([{ at: AT, isCorrect: false }])
  expect(progress.cards.c2?.reviews).toEqual([{ at: AT, isCorrect: true }])
  expect(entries.has('progress')).toBe(false)
})

test('two sessions reviewing different mistakes lose no reviews', async () => {
  const { store } = memory(new Map(Object.entries({
    ...MOVED,
    'mistakes.index': { version: 1, ids: ['a', 'b'] },
    'mistakes.card.a': { version: 1, ...card('a', 1) },
    'mistakes.card.b': { version: 1, ...card('b', 2) },
  })))
  const { slow, arrived, release } = stalled(store)
  const first = modify(slow, MISTAKES, m => recordMistakeReview(m, 'a', AT, false))
  await arrived
  await modify(store, MISTAKES, m => recordMistakeReview(m, 'b', AT, true))
  release()
  await first

  const saved = await load(store, MISTAKES)
  expect(saved.cards.map(c => [c.id, c.reviews.map(r => r.isCorrect)])).toEqual([['a', [false]], ['b', [true]]])
})

// --- Corrupt and unknown values ----------------------------------------------

test('a corrupt or foreign item is dropped by itself and the rest is kept', async () => {
  const { store } = memory(new Map(Object.entries({
    ...MOVED,
    'progress.lesson': { version: 1, currentLesson: 2 },
    [progressCardKey('c1')]: { version: 1, reviews: [{ at: AT, isCorrect: true }] },
    [progressCardKey('c2')]: { version: 9, reviews: [{ at: AT, isCorrect: true }] },
    [progressCardKey('c3')]: 'garbage',
    [progressCardKey('c4')]: { version: 1, reviews: 'x' },
    'mistakes.index': { version: 1, ids: ['a', 'b', 'c', 'd', 'e', 7] },
    'mistakes.card.a': { version: 1, ...card('a', 1) },
    'mistakes.card.b': { version: 2, ...card('b', 1) },
    'mistakes.card.c': { version: 1, ...card('other', 1) },
    'mistakes.card.d': { version: 1, id: 'd', unit: 0 },
  })))
  expect(await load(store, PROGRESS)).toEqual({
    version: 1,
    currentLesson: 2,
    cards: { c1: { reviews: [{ at: AT, isCorrect: true }] } },
  })
  expect((await load(store, MISTAKES)).cards.map(c => c.id)).toEqual(['a'])
})

test('a lesson of an unknown version or shape starts at 1; so does an index that is not an index', async () => {
  const { store, entries } = memory(new Map(Object.entries({ ...MOVED, 'progress.lesson': { version: 3, currentLesson: 5 } })))
  expect((await load(store, PROGRESS)).currentLesson).toBe(1)
  entries.set('progress.lesson', { version: 1, currentLesson: 0 })
  expect((await load(store, PROGRESS)).currentLesson).toBe(1)
  entries.set('mistakes.index', ['a'])
  expect((await load(store, MISTAKES)).cards).toEqual([])
})

// --- Migration ---------------------------------------------------------------

test('the old layout moves to the new one with the same progress and mistakes, and the old keys stay', async () => {
  const before = oldLayout()
  const { store, entries } = memory(new Map(Object.entries(structuredClone(before))))
  expect(await migrate(store)).toBe(true)

  const progress = await load(store, PROGRESS)
  const expected = parseProgress(before.progress)
  expect(progress).toEqual({ ...expected, cards: { c1: expected.cards.c1, c2: expected.cards.c2, c4: expected.cards.c4 } })
  // A card the pack does not list is kept all the same.
  expect(entries.get(progressCardKey('not-in-the-pack'))).toEqual({ version: 1, ...expected.cards['not-in-the-pack'] })
  expect(await load(store, MISTAKES)).toEqual(parseMistakes(before.mistakes))
  expect(entries.get('progress')).toEqual(before.progress)
  expect(entries.get('mistakes')).toEqual(before.mistakes)
  expect(entries.get('storage.layout')).toEqual({ version: 1 })
})

test('reading the old layout moves it by itself, and a change afterwards lands in the new one only', async () => {
  const { store, entries } = memory(new Map(Object.entries(structuredClone(oldLayout()))))
  expect((await load(store, PROGRESS)).currentLesson).toBe(3)
  await modify(store, PROGRESS, p => recordAttempt(p, 'c1', AT, true))
  expect((await load(store, PROGRESS)).cards.c1?.reviews).toHaveLength(3)
  expect(entries.get('progress')).toEqual(OLD_PROGRESS)
})

test('moving twice changes nothing, and never undoes what was written after the first time', async () => {
  const { store, entries, writes } = memory(new Map(Object.entries(structuredClone(oldLayout()))))
  await migrate(store)
  const moved = structuredClone([...entries])
  writes.length = 0
  expect(await migrate(store)).toBe(true)
  expect(writes).toEqual([])
  expect([...entries]).toEqual(moved)

  // A session that carried on after the move; a late second move (marker lost) must not overwrite it.
  await modify(store, PROGRESS, p => recordAttempt(advanceLesson(p, 6), 'c1', AT, false))
  await keepMistakes(store, unit('conversation-1'), AT)
  const carried = structuredClone([...entries])
  entries.delete('storage.layout')
  expect(await migrate(store)).toBe(true)
  expect([...entries]).toEqual([...carried.filter(([key]) => key !== 'storage.layout'), ['storage.layout', { version: 1 }]])
})

test('old keys that are corrupt or of an unknown version move as empty, and the move is still marked done', async () => {
  const { store, entries } = memory(new Map(Object.entries({ progress: { version: 9, currentLesson: 'x' }, mistakes: 'garbage' })))
  expect(await migrate(store)).toBe(true)
  expect(await load(store, PROGRESS)).toEqual({ version: 1, currentLesson: 1, cards: {} })
  expect((await load(store, MISTAKES)).cards).toEqual([])
  expect(entries.get('progress')).toEqual({ version: 9, currentLesson: 'x' })
})

test('nothing old to move: the move is marked done and writes only the marker', async () => {
  const { store, writes } = memory()
  expect(await migrate(store)).toBe(true)
  expect(writes).toEqual(['storage.layout'])
})

test('a store that cannot read an old key loses nothing: not marked, that entry reads empty and is never written over, and the move happens later', async () => {
  const before = oldLayout()
  const { store, entries, failing, writes } = memory(new Map(Object.entries(structuredClone(before))))
  failing.get.add('progress')
  failing.get.add('mistakes')
  expect(await migrate(store)).toBe(false)
  expect(await load(store, PROGRESS)).toEqual({ version: 1, currentLesson: 1, cards: {} })
  expect(await load(store, MISTAKES)).toEqual({ version: 1, cards: [] })
  expect(await modify(store, PROGRESS, p => advanceLesson(p, 6))).toBeNull()
  expect(await modify(store, MISTAKES, m => recordMistakeReview(m, 'mistake-00000001', AT, true))).toBeNull()
  expect(writes).toEqual([])
  expect(entries.has('storage.layout')).toBe(false)

  failing.get.clear()
  expect((await load(store, PROGRESS)).currentLesson).toBe(3)
  expect(await load(store, MISTAKES)).toEqual(parseMistakes(before.mistakes))
  expect(entries.get('progress')).toEqual(before.progress)
})

test('an old key that can be read is not held back by another that cannot', async () => {
  const before = oldLayout()
  const { store, failing } = memory(new Map(Object.entries(structuredClone(before))))
  failing.get.add('progress')
  expect(await modify(store, PROGRESS, p => advanceLesson(p, 6))).toBeNull()
  expect(await modify(store, MISTAKES, m => recordMistakeReview(m, 'mistake-00000001', AT, true))).not.toBeNull()
  expect((await load(store, MISTAKES)).cards[0]?.reviews).toHaveLength(1)
})

test('a store that fails half way through the move keeps working: reads join the new and the old, a change lands in the new, and the move completes later', async () => {
  const before = oldLayout()
  const { store, entries, failing } = memory(new Map(Object.entries(structuredClone(before))))
  failing.set.add(mistakeKey('mistake-00000002'))
  expect(await migrate(store)).toBe(false)
  expect(entries.has('storage.layout')).toBe(false)
  // Part of the new layout is already there; reads answer with everything, moved or not.
  expect(entries.has(progressCardKey('c1'))).toBe(true)
  expect(await load(store, MISTAKES)).toEqual(parseMistakes(before.mistakes))
  expect((await load(store, PROGRESS)).cards.c4?.reviews).toHaveLength(1)

  // A change is not refused: it lands in the new layout and the old keys stay as they were.
  expect(await modify(store, MISTAKES, m => recordMistakeReview(m, 'mistake-00000001', AT, true))).not.toBeNull()
  expect(await modify(store, PROGRESS, p => advanceLesson(p, 6))).not.toBeNull()
  expect((await load(store, MISTAKES)).cards[0]?.reviews).toHaveLength(1)
  expect((await load(store, PROGRESS)).currentLesson).toBe(advanceLesson(parseProgress(before.progress), 6).currentLesson)
  expect(entries.get('mistakes')).toEqual(before.mistakes)
  expect(entries.get('progress')).toEqual(before.progress)

  failing.set.clear()
  expect(await migrate(store)).toBe(true)
  const mistakes = await load(store, MISTAKES)
  expect(mistakes.cards.map(c => c.id)).toEqual(parseMistakes(before.mistakes).cards.map(c => c.id))
  expect(mistakes.cards[0]?.reviews).toHaveLength(1) // what was changed meanwhile survives the move
  expect((await load(store, PROGRESS)).currentLesson).toBe(advanceLesson(parseProgress(before.progress), 6).currentLesson)
})

test('a store that never takes the marker still saves everything, and nothing old comes back once a change was made', async () => {
  const before = oldLayout()
  const { store, entries, failing } = memory(new Map(Object.entries(structuredClone(before))))
  failing.set.add('storage.layout')
  const ids = parseMistakes(before.mistakes).cards.map(c => c.id)
  expect(await modify(store, MISTAKES, m => recordMistakeReview(m, ids[1] as string, AT, true))).not.toBeNull()
  expect(await modify(store, PROGRESS, p => recordAttempt(p, 'c3', AT, true))).not.toBeNull()
  expect(await migrate(store)).toBe(false)
  expect((await load(store, MISTAKES)).cards.map(c => c.id)).toEqual(ids)
  expect((await load(store, MISTAKES)).cards[1]?.reviews).toHaveLength(3)
  expect((await load(store, PROGRESS)).cards.c3?.reviews).toHaveLength(1)
  expect((await load(store, PROGRESS)).cards.c1?.reviews).toHaveLength(2)
  expect(entries.get('mistakes')).toEqual(before.mistakes)
})

test('a store that cannot write the move at all does not throw anywhere and keeps the old data readable', async () => {
  const { store, entries, failing } = memory(new Map(Object.entries(structuredClone(oldLayout()))))
  failing.set.add(progressCardKey('c1'))
  failing.set.add(mistakeKey('mistake-00000001'))
  failing.set.add('storage.layout')
  expect(await migrate(store)).toBe(false)
  const { 'not-in-the-pack': _outsideThePack, ...inThePack } = parseProgress(OLD_PROGRESS).cards
  expect(await load(store, PROGRESS)).toEqual({ ...parseProgress(OLD_PROGRESS), cards: inThePack })
  expect(await load(store, MISTAKES)).toEqual(parseMistakes(OLD_MISTAKES))
  expect(entries.get('progress')).toEqual(OLD_PROGRESS)
})

// --- Units -------------------------------------------------------------------

test('a finished unit fixes its number once: the mistakes and the log agree on it', async () => {
  const { store, entries } = memory(new Map(Object.entries({ activity: { version: 1, units: 4, lastDoneAt: {}, done: {}, recent: [] } })))
  const done = await commitUnit(store, unit('conversation-1'), AT)
  expect(done?.isRecorded).toBe(true)
  expect((entries.get('activity') as { units: number }).units).toBe(5)
  expect((await load(store, MISTAKES)).cards.map(c => c.unit)).toEqual([5])
})

test('the number is the log\'s even when another session logged a unit meanwhile', async () => {
  const { store, entries } = memory(new Map(Object.entries({ activity: { version: 1, units: 1, lastDoneAt: {}, done: {}, recent: [] } })))
  // This session read 1; the other one finishes unit 2 before this one commits.
  entries.set('activity', { version: 1, units: 2, lastDoneAt: {}, done: { reading: 1 }, recent: [] })
  await commitUnit(store, unit('conversation-1'), AT)
  expect((entries.get('activity') as { units: number }).units).toBe(3)
  expect((await load(store, MISTAKES)).cards[0]?.unit).toBe(3)
})

test('a repeated finish records the unit once: one log entry, one card, one review', async () => {
  const id = mistakeId('go', 'went')
  const woven = { id, wrong: 'go', right: 'went' }
  const { store, entries } = memory(new Map(Object.entries({
    ...MOVED,
    'mistakes.index': { version: 1, ids: [id] },
    [mistakeKey(id)]: { version: 1, id, ...GO, unit: 1, createdAt: AT, reviews: [] },
    activity: { version: 1, units: 1, lastDoneAt: {}, done: {}, recent: [] },
  })))
  const finished = unit('conversation-2', {
    corrections: [],
    woven: [woven],
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
  const saved = (await load(store, MISTAKES)).cards
  expect(saved[0]?.reviews.length).toBe(1)
})

test('a unit with nothing to keep still counts, and leaves the mistakes alone', async () => {
  const { store, entries } = memory()
  await commitUnit(store, unit('reading-1', { activity: 'reading', corrections: [] }), AT)
  expect((entries.get('activity') as { units: number }).units).toBe(1)
  expect([...entries.keys()].some(key => key.startsWith('mistakes'))).toBe(false)
})

test('a store that cannot write the log records nothing, mistakes included', async () => {
  const { store, entries, failing } = memory()
  failing.set.add('activity')
  expect(await commitUnit(store, unit('conversation-1'), AT)).toBeNull()
  expect([...entries.keys()].some(key => key.startsWith('mistakes'))).toBe(false)
})

test('a store that cannot write the mistakes still logs the unit, and says the cards were not kept', async () => {
  const { store, entries, failing } = memory()
  failing.set.add('mistakes.index')
  const done = await commitUnit(store, unit('conversation-1'), AT)
  expect(done?.isRecorded).toBe(true)
  expect(done?.areMistakesKept).toBe(false)
  expect((entries.get('activity') as { units: number }).units).toBe(1)
  expect((await load(store, MISTAKES)).cards).toEqual([])
})

test('a unit says its cards were kept, also when it had none to keep', async () => {
  const { store } = memory()
  expect((await commitUnit(store, unit('conversation-1'), AT))?.areMistakesKept).toBe(true)
  expect((await commitUnit(store, unit('reading-1', { activity: 'reading', corrections: [] }), AT))?.areMistakesKept).toBe(true)
})

test('a unit keeps its cards even when the move of the old layout can never be marked done', async () => {
  const { store, failing } = memory(new Map(Object.entries(structuredClone(oldLayout()))))
  failing.set.add('storage.layout')
  const done = await commitUnit(store, unit('conversation-1'), AT)
  expect(done?.areMistakesKept).toBe(true)
  expect((await load(store, MISTAKES)).cards.map(c => c.wrong)).toContain('go')
})

test('a unit whose cards cannot be read before they are changed says they were not kept', async () => {
  const { store, failing } = memory(new Map(Object.entries(structuredClone(oldLayout()))))
  failing.get.add('mistakes')
  const done = await commitUnit(store, unit('conversation-1'), AT)
  expect(done?.isRecorded).toBe(true)
  expect(done?.areMistakesKept).toBe(false)
})

test('mistakes are not kept when the log that numbers them cannot be read: a card numbered 1 would never fall due', async () => {
  const { store, entries, failing } = memory(new Map(Object.entries({ activity: { version: 1, units: 40, lastDoneAt: {}, done: {}, recent: [] } })))
  failing.get.add('activity')
  expect(await keepMistakes(store, unit('conversation-1'), AT)).toBe(false)
  expect([...entries.keys()].some(key => key.startsWith('mistakes'))).toBe(false)
})

test('mistakes of a unit left half done are numbered by the next unit, without logging it', async () => {
  const { store, entries } = memory(new Map(Object.entries({ activity: { version: 1, units: 2, lastDoneAt: {}, done: {}, recent: [] } })))
  await keepMistakes(store, unit('conversation-1'), AT)
  expect((await load(store, MISTAKES)).cards[0]?.unit).toBe(3)
  expect((entries.get('activity') as { units: number }).units).toBe(2)
})
