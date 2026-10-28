import { expect, test } from 'claude-code/testing'

import { localActivityLog } from './activities'
import type { ActivityLog } from './strategies'

// What any activity log must do for the core, shown on the built-in one.
const log: ActivityLog = localActivityLog

test('the log says what it is and where its value lives in the store', () => {
  expect(log.id).toBe('local')
  expect(log.storeKey).toBe('activity')
})

test('a log that was never written, or was damaged, is the empty one', () => {
  expect(log.parse(undefined)).toEqual(log.empty)
  expect(log.parse({ version: 99, units: 3 })).toEqual(log.empty)
  expect(log.nextUnit(log.empty)).toBe(1)
})

test('recording a unit counts it, numbers the next one and survives a round trip through the store', () => {
  const recorded = log.record(log.empty, 'conversation', { sentences: 3, corrections: 1 }, '2026-10-02T10:00:00Z', 'conversation-1')
  expect(log.nextUnit(recorded)).toBe(2)
  expect(recorded.recent.map(r => r.id)).toEqual(['conversation-1'])
  expect(log.parse(JSON.parse(JSON.stringify(recorded)))).toEqual(recorded)
  // The input is not changed.
  expect(log.empty.units).toBe(0)
})

test('the next activity rotates through what is available', () => {
  expect(log.suggest(log.empty, ['conversation', 'roleplay', 'reading', 'review'])).toBe('conversation')
  const afterTalk = log.record(log.empty, 'conversation', { sentences: 3, corrections: 0 }, '2026-10-02T10:00:00Z')
  expect(log.suggest(afterTalk, ['conversation', 'roleplay', 'reading', 'review'])).toBe('roleplay')
})

test('five smooth units suggest the level above; fewer suggest nothing', () => {
  let smooth = log.empty
  for (let i = 0; i < 4; i += 1) smooth = log.record(smooth, 'conversation', { sentences: 3, corrections: 0 }, `t${i}`)
  expect(log.levelHint(smooth, 'B1')).toBeNull()
  smooth = log.record(smooth, 'conversation', { sentences: 3, corrections: 0 }, 't4')
  expect(log.levelHint(smooth, 'B1')).toEqual({ direction: 'up', level: 'B2' })
})
