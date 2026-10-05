import { expect, test } from 'claude-code/testing'

import { ROLEPLAY_SCENARIOS, scenarioById, scenariosFor } from './roleplay-scenarios'
import type { LingoLevel } from '../../types'

const EXPECTED_COUNTS: Record<LingoLevel, number> = { A1: 10, A2: 10, B1: 11, B2: 11, C1: 10, C2: 9 }
const LEVEL_ORDER = Object.keys(EXPECTED_COUNTS) as LingoLevel[]

test('there are 61 scenarios: 10, 10, 11, 11, 10 and 9 from A1 to C2, in level order', () => {
  expect(ROLEPLAY_SCENARIOS.length).toBe(61)
  for (const level of LEVEL_ORDER) {
    expect(ROLEPLAY_SCENARIOS.filter(s => s.level === level).length).toBe(EXPECTED_COUNTS[level])
  }
  const ranks = ROLEPLAY_SCENARIOS.map(s => LEVEL_ORDER.indexOf(s.level))
  expect(ranks.every((rank, i) => rank >= 0 && (i === 0 || rank >= (ranks[i - 1] ?? 0)))).toBe(true)
})

test('ids are unique and kebab-case', () => {
  const ids = ROLEPLAY_SCENARIOS.map(s => s.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
})

test('every text field is filled in and minutes is a number or a range', () => {
  for (const s of ROLEPLAY_SCENARIOS) {
    for (const text of [s.title, s.situation, s.tutorRole, s.learnerRole, s.communicativeFunction, s.domain]) {
      expect(text.trim().length > 0).toBe(true)
    }
    expect(s.minutes).toMatch(/^\d+(-\d+)?$/)
  }
})

test('scenariosFor returns only the scenarios of that level', () => {
  const b1 = scenariosFor('B1')
  expect(b1.length).toBe(11)
  expect(b1.every(s => s.level === 'B1')).toBe(true)
})

test('scenarioById finds a scenario by id, or returns undefined', () => {
  expect(scenarioById('greeting-at-coffee-shop')?.level).toBe('A1')
  expect(scenarioById('nope')).toBeUndefined()
})
