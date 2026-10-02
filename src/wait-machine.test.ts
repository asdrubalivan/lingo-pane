import { expect, test } from 'claude-code/testing'

import { ENGLISH_TO_SPANISH, cardsFor, microLesson, pickIndex, spinnerSuffix } from './microcards'
import {
  INITIAL_WAIT,
  isLessonVisible,
  isOfferVisible,
  ownsOpenPane,
  transition,
} from './wait-machine'
import type { WaitEvent } from './wait-machine'

const run = (events: WaitEvent[]) => events.reduce(transition, INITIAL_WAIT)

test('a turn shows the lesson only after the delay elapses', () => {
  const armed = run([{ type: 'turn-start', turnId: 't1' }])
  expect(armed.phase).toBe('armed')
  expect(isLessonVisible(armed)).toBe(false)

  const showing = transition(armed, { type: 'delay-elapsed', turnId: 't1' })
  expect(showing.phase).toBe('showing')
  expect(isLessonVisible(showing)).toBe(true)
})

test('a stale delay or countdown from another turn is ignored', () => {
  const armed = run([{ type: 'turn-start', turnId: 't2' }])
  expect(transition(armed, { type: 'delay-elapsed', turnId: 't1' })).toEqual(armed)

  const closing = run([
    { type: 'turn-start', turnId: 't2' },
    { type: 'delay-elapsed', turnId: 't2' },
    { type: 'turn-complete', turnId: 't2', isAborted: false },
  ])
  expect(closing.phase).toBe('closing')
  expect(transition(closing, { type: 'countdown-elapsed', turnId: 't1' })).toEqual(closing)
  expect(transition(closing, { type: 'countdown-elapsed', turnId: 't2' })).toEqual(INITIAL_WAIT)
})

test('completing before the delay never shows anything', () => {
  const state = run([
    { type: 'turn-start', turnId: 't1' },
    { type: 'turn-complete', turnId: 't1', isAborted: false },
    { type: 'delay-elapsed', turnId: 't1' },
  ])
  expect(isLessonVisible(state)).toBe(false)
})

test('an interrupted turn goes idle at once, an answered one counts down', () => {
  const showing = run([
    { type: 'turn-start', turnId: 't1' },
    { type: 'delay-elapsed', turnId: 't1' },
  ])
  expect(transition(showing, { type: 'turn-complete', turnId: 't1', isAborted: true })).toEqual(
    INITIAL_WAIT,
  )
  expect(transition(showing, { type: 'turn-complete', turnId: 't1', isAborted: false }).phase).toBe(
    'closing',
  )
})

test('a pending ask retires the lesson until a tool runs again', () => {
  const showing = run([
    { type: 'turn-start', turnId: 't1' },
    { type: 'delay-elapsed', turnId: 't1' },
  ])
  const paused = transition(showing, { type: 'needs-user' })
  expect(paused.phase).toBe('paused')
  expect(isLessonVisible(paused)).toBe(false)
  expect(transition(paused, { type: 'user-answered' }).phase).toBe('showing')
  // Nothing to pause or resume while idle.
  expect(transition(INITIAL_WAIT, { type: 'needs-user' })).toEqual(INITIAL_WAIT)
  expect(transition(INITIAL_WAIT, { type: 'user-answered' })).toEqual(INITIAL_WAIT)
})

test('a pane that is not placed becomes an offer, shown only while showing', () => {
  const offered = run([
    { type: 'turn-start', turnId: 't1' },
    { type: 'delay-elapsed', turnId: 't1' },
    { type: 'pane-not-placed' },
  ])
  expect(isOfferVisible(offered)).toBe(true)
  expect(ownsOpenPane(offered)).toBe(false)
  expect(isOfferVisible(transition(offered, { type: 'needs-user' }))).toBe(false)
  expect(transition(offered, { type: 'offer-taken' }).pane).toBe('none')

  const placed = transition(offered, { type: 'pane-placed' })
  expect(ownsOpenPane(placed)).toBe(true)
  expect(isOfferVisible(placed)).toBe(false)
  // A pane the mod still owns survives into the next turn; an offer does not.
  expect(transition(placed, { type: 'turn-start', turnId: 't2' }).pane).toBe('open')
  expect(transition(offered, { type: 'turn-start', turnId: 't2' }).pane).toBe('none')
})

test('the card is stable for a turn and only English to Spanish is built in', () => {
  expect(pickIndex('turn-1', 8)).toBe(pickIndex('turn-1', 8))
  for (const seed of ['a', 'b', 'turn-1', 'turn-2', '']) {
    const index = pickIndex(seed, ENGLISH_TO_SPANISH.length)
    expect(index >= 0 && index < ENGLISH_TO_SPANISH.length).toBe(true)
  }

  const lesson = microLesson('English', 'Spanish', 'turn-1')
  const card = ENGLISH_TO_SPANISH[pickIndex('turn-1', ENGLISH_TO_SPANISH.length)]
  expect(lesson).toBe(`${card?.word} = ${card?.gloss}`)
  expect(spinnerSuffix(lesson)).toBe(`… · ${lesson}`)

  expect(cardsFor(' english ', 'español').kind).toBe('cards')
  expect(microLesson('Ukrainian', 'Spanish', 'turn-1')).toBe('no built-in cards for Ukrainian yet')
  expect(cardsFor('English', 'French').kind).toBe('unsupported')
})
