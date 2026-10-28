import { expect, test } from 'claude-code/testing'

import { DEMO_PACK_ID } from './demo-english-a1'
import { localStore } from './local-store'

test('English for Spanish speakers gets the demo pack, marked as made for the pair', () => {
  const pack = localStore.pack({ target: 'English', native: 'Spanish' })
  expect(pack.id).toBe(DEMO_PACK_ID)
  expect(pack.cards.length).toBe(30)
  expect(pack.lessonCount).toBe(6)
  expect(pack.isForPair).toBe(true)
})

test('the pair is matched whatever the case and the spaces', () => {
  expect(localStore.pack({ target: ' english ', native: 'SPANISH' }).isForPair).toBe(true)
})

test('a pair with no pack of its own still practises the demo pack, and says it is not for them', () => {
  for (const pair of [
    { target: 'Ukrainian', native: 'English' },
    { target: 'English', native: 'French' },
    { target: 'Spanish', native: 'English' },
    { target: '', native: '' },
  ]) {
    const pack = localStore.pack(pair)
    expect(pack.id).toBe(DEMO_PACK_ID)
    expect(pack.lessonCount).toBe(6)
    expect(pack.isForPair).toBe(false)
  }
})

test('every card of a pack belongs to a lesson the pack counts', () => {
  const pack = localStore.pack({ target: 'English', native: 'Spanish' })
  for (const card of pack.cards) {
    expect(card.lesson).toBeGreaterThanOrEqual(1)
    expect(card.lesson).toBeLessThanOrEqual(pack.lessonCount)
  }
})
