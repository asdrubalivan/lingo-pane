import { expect, test } from 'claude-code/testing'

import { DEMO_CARDS, DEMO_LESSON_COUNT } from './demo-english-a1'

test('the demo pack has 30 cards, 5 in each of 6 lessons', () => {
  expect(DEMO_CARDS.length).toBe(30)
  for (let lesson = 1; lesson <= DEMO_LESSON_COUNT; lesson += 1) {
    expect(DEMO_CARDS.filter(c => c.lesson === lesson).length).toBe(5)
  }
  expect(new Set(DEMO_CARDS.map(c => c.id)).size).toBe(30)
})

