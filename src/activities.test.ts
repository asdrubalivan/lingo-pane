import { expect, test } from 'claude-code/testing'

import {
  ACTIVITIES,
  FRESH_LOG,
  levelHint,
  parseActivityLog,
  recordUnit,
  suggestActivity,
} from './activities'
import type { LingoActivityLog } from '../types'

const ALL = ACTIVITIES.map(a => a.id)

test('the menu is conversation, role-play, reading, review', () => {
  expect(ACTIVITIES.map(a => a.label)).toEqual(['conversation', 'role-play', 'reading', 'review'])
})

test('the suggestion rotates: never done first, else the least recent; review never', () => {
  expect(suggestActivity(FRESH_LOG, ALL)).toBe('conversation')
  const log = recordUnit(FRESH_LOG, 'conversation', { sentences: 3, corrections: 0 }, '2026-10-02T10:00:00Z')
  expect(suggestActivity(log, ALL)).toBe('roleplay')
  const all = recordUnit(
    recordUnit(log, 'roleplay', { sentences: 3, corrections: 1 }, '2026-10-02T11:00:00Z'),
    'reading',
    { sentences: 3, corrections: 0 },
    '2026-10-02T09:00:00Z',
  )
  expect(suggestActivity(all, ALL)).toBe('reading')
  expect(suggestActivity(recordUnit(all, 'reading', { sentences: 1, corrections: 0 }, '2026-10-02T12:00:00Z'), ALL)).toBe('conversation')
  // Only what is available; review is never suggested.
  expect(suggestActivity(log, ['conversation', 'review'])).toBe('conversation')
})

test('a finished unit is counted, dated and kept among the last 20', () => {
  let log: LingoActivityLog = FRESH_LOG
  for (let i = 0; i < 25; i += 1) log = recordUnit(log, 'conversation', { sentences: 3, corrections: i % 2 }, `t${i}`)
  expect(log.units).toBe(25)
  expect(log.recent.length).toBe(20)
  expect(log.recent[0]?.at).toBe('t5')
  expect(log.lastDoneAt.conversation).toBe('t24')
})

test('the stored log is validated; anything else is a fresh one', () => {
  const log = recordUnit(FRESH_LOG, 'roleplay', { sentences: 2, corrections: 1 }, 'now')
  expect(parseActivityLog(JSON.parse(JSON.stringify(log)))).toEqual(log)
  for (const bad of [undefined, null, 'x', { version: 2, units: 1 }, { version: 1, units: -1 }]) {
    expect(parseActivityLog(bad)).toEqual(FRESH_LOG)
  }
  expect(
    parseActivityLog({ ...log, lastDoneAt: { roleplay: 'now', poetry: 'x' }, recent: [...log.recent, { activity: 'poetry' }] }),
  ).toEqual(log)
})

test('the level hint needs five talk units: none wrong suggests up, most wrong suggests down', () => {
  const units = (corrections: number, count = 5) => {
    let log: LingoActivityLog = FRESH_LOG
    for (let i = 0; i < count; i += 1) log = recordUnit(log, 'conversation', { sentences: 3, corrections }, `t${i}`)
    return log
  }
  expect(levelHint(units(0, 4), 'B1')).toBeNull()
  expect(levelHint(units(0), 'B1')).toEqual({ direction: 'up', level: 'B2' })
  expect(levelHint(units(2), 'B1')).toEqual({ direction: 'down', level: 'A2' })
  expect(levelHint(units(1), 'B1')).toBeNull()
  // Nowhere to go past the ends.
  expect(levelHint(units(0), 'C2')).toBeNull()
  expect(levelHint(units(3), 'A1')).toBeNull()
  // Reading does not count as talk.
  let reading: LingoActivityLog = FRESH_LOG
  for (let i = 0; i < 5; i += 1) reading = recordUnit(reading, 'reading', { sentences: 3, corrections: 0 }, `t${i}`)
  expect(levelHint(reading, 'B1')).toBeNull()
})
