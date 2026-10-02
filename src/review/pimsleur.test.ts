import { expect, test } from 'claude-code/testing'
import type { Card, Progress } from '../strategies'
import { dueCards } from './pimsleur'

const now = new Date('2026-10-02T00:00:00Z')
const card = (id: string, lesson: number): Card => ({
  id,
  prompt: id,
  answer: id,
  tags: [`leccion-${String(lesson).padStart(2, '0')}`],
  lesson,
})
const ids = (cs: Card[]) => cs.map(c => c.id)
const all: Card[] = []
for (let l = 1; l <= 9; l++) all.push(card(`l${l}-b`, l), card(`l${l}-a`, l))

test('lesson 1 has nothing due', async () => {
  expect(dueCards(all, [], { now, currentLesson: 1 })).toEqual([])
})

test('lesson 8 reviews lessons 7, 5 and 1, most recent first', async () => {
  const out = dueCards(all, [], { now, currentLesson: 8 })
  expect(ids(out)).toEqual(['l7-a', 'l7-b', 'l5-a', 'l5-b', 'l1-a', 'l1-b'])
})

test('lessons below 1 are ignored', async () => {
  // lesson 3 -> only n-1 = 2 (n-3 = 0 and n-7 = -4 do not exist)
  expect(ids(dueCards(all, [], { now, currentLesson: 3 }))).toEqual(['l2-a', 'l2-b'])
})

test('order is stable regardless of input order', async () => {
  const ctx = { now, currentLesson: 8 }
  const a = ids(dueCards(all, [], ctx))
  const b = ids(dueCards([...all].reverse(), [], ctx))
  expect(b).toEqual(a)
})

test('cards failed in their last review go first within their lesson', async () => {
  const progress: Progress[] = [
    // failed, then passed: not failed any more
    { cardId: 'l7-a', reviews: [{ at: '2026-09-01T00:00:00Z', isCorrect: false }, { at: '2026-09-02T00:00:00Z', isCorrect: true }] },
    // passed, then failed: failed
    { cardId: 'l7-b', reviews: [{ at: '2026-09-01T00:00:00Z', isCorrect: true }, { at: '2026-09-02T00:00:00Z', isCorrect: false }] },
    { cardId: 'l1-b', reviews: [{ at: '2026-09-01T00:00:00Z', isCorrect: false }] },
  ]
  const out = dueCards(all, progress, { now, currentLesson: 8 })
  // a failed card never jumps ahead of a more recent lesson
  expect(ids(out)).toEqual(['l7-b', 'l7-a', 'l5-a', 'l5-b', 'l1-b', 'l1-a'])
})

test('no duplicates, even if the input repeats a card', async () => {
  const dup = [...all, card('l7-a', 7), card('l7-a', 7)]
  const out = ids(dueCards(dup, [], { now, currentLesson: 8 }))
  expect(new Set(out).size).toBe(out.length)
  expect(out).toEqual(['l7-a', 'l7-b', 'l5-a', 'l5-b', 'l1-a', 'l1-b'])
})

test('missing lessons are skipped without error', async () => {
  const some = [card('x', 7), card('y', 1)]
  expect(ids(dueCards(some, [], { now, currentLesson: 8 }))).toEqual(['x', 'y'])
  expect(dueCards([], [], { now, currentLesson: 8 })).toEqual([])
})

test('does not mutate its inputs', async () => {
  const input = [...all].reverse()
  const snapshot = ids(input)
  dueCards(input, [], { now, currentLesson: 8 })
  expect(ids(input)).toEqual(snapshot)
})
