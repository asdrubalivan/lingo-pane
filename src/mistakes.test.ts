import { expect, test } from 'claude-code/testing'

import {
  NO_MISTAKES,
  addCorrections,
  dueMistakes,
  mistakeAsCard,
  mistakeId,
  parseMistakes,
  pickForTurn,
  recordMistakeReview,
  spinnerLine,
  wovenOutcome,
} from './mistakes'
import type { LingoMistakes } from '../types'

const GO = { wrong: 'go', right: 'went', note: 'pasado', sentence: 'I go to the beach yesterday.' }
const AM = { wrong: 'am from', right: 'come from', note: 'verbo', sentence: 'I am from Caracas.' }

test('corrections become cards numbered by their unit; a repeated pair is one card, renewed', () => {
  const one = addCorrections(NO_MISTAKES, [GO], 1, 't1')
  expect(one.cards).toEqual([{ id: mistakeId('go', 'went'), ...GO, unit: 1, createdAt: 't1', reviews: [] }])
  const reviewed = recordMistakeReview(one, mistakeId('go', 'went'), 't2', false)
  const again = addCorrections(reviewed, [{ ...GO, wrong: 'Go', sentence: 'Go there last week.' }, AM], 4, 't3')
  expect(again.cards.length).toBe(2)
  expect(again.cards[0]).toMatchObject({ unit: 4, sentence: 'Go there last week.', reviews: [{ at: 't2', isCorrect: false }] })
  expect(mistakeId('Go!', 'WENT')).toBe(mistakeId('go', 'went'))
  expect(mistakeId('go', 'went')).toMatch(/^mistake-[0-9a-f]{8}$/)
})

test('the stored cards are validated, and capped', () => {
  const one = addCorrections(NO_MISTAKES, [GO], 1, 't1')
  expect(parseMistakes(JSON.parse(JSON.stringify(one)))).toEqual(one)
  for (const bad of [undefined, null, { version: 2, cards: [] }, { version: 1, cards: 'x' }]) {
    expect(parseMistakes(bad)).toEqual(NO_MISTAKES)
  }
  expect(parseMistakes({ version: 1, cards: [{ id: 'x' }, ...one.cards] })).toEqual(one)
  let many: LingoMistakes = NO_MISTAKES
  for (let i = 0; i < 320; i += 1) many = addCorrections(many, [{ ...GO, wrong: `w${i}` }], 1, 't')
  expect(many.cards.length).toBe(300)
  expect(many.cards[0]?.wrong).toBe('w20')
})

test('Pimsleur by unit: a mistake from unit n is due at n+1, n+3 and n+7, failed ones first', () => {
  const store = addCorrections(addCorrections(NO_MISTAKES, [GO], 1, 't1'), [AM], 3, 't3')
  expect(dueMistakes(store, 2).map(c => c.wrong)).toEqual(['go'])
  expect(dueMistakes(store, 3).map(c => c.wrong)).toEqual([])
  expect(dueMistakes(store, 4).map(c => c.wrong)).toEqual(['am from', 'go'])
  expect(dueMistakes(store, 8).map(c => c.wrong)).toEqual(['go'])
  expect(dueMistakes(store, 9).map(c => c.wrong)).toEqual([])
})

test('a mistake reviews as its own line, answered with the right words', () => {
  const [card] = addCorrections(NO_MISTAKES, [GO], 5, 't').cards
  expect(mistakeAsCard(card!)).toEqual({ id: card!.id, prompt: GO.sentence, answer: 'went', tags: ['mistake'], lesson: 5 })
  expect(spinnerLine(GO)).toBe('go → went')
})

test('a woven card counts as right when the learner used the right form, wrong when the old one again', () => {
  const lines = (text: string) => [{ who: 'tutor' as const, text: 'Where did you go?', mark: null }, { who: 'you' as const, text }]
  expect(wovenOutcome(lines('I went to Paris!'), GO)).toBe(true)
  expect(wovenOutcome(lines('I go to Paris'), GO)).toBe(false)
  expect(wovenOutcome(lines('Paris, I think'), GO)).toBeNull()
  // The tutor saying it does not count.
  expect(wovenOutcome([{ who: 'tutor', text: 'I went', mark: null }], GO)).toBeNull()
})

test('the Spinner picks one mistake per turn, due ones first', () => {
  const store = addCorrections(addCorrections(NO_MISTAKES, [GO], 1, 't1'), [AM], 3, 't3')
  expect(pickForTurn(store, 2, 'turn-1')?.wrong).toBe('go')
  expect(pickForTurn(store, 2, 'turn-1')).toEqual(pickForTurn(store, 2, 'turn-1'))
  // Nothing due: any of the latest.
  expect(['go', 'am from']).toContain(pickForTurn(store, 6, 'turn-9')?.wrong)
  expect(pickForTurn(NO_MISTAKES, 1, 'turn-1')).toBeNull()
})
