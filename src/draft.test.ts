import { expect, test } from 'claude-code/testing'

import { fieldRoom, needsEcho, textColumns } from './draft'

test('the room of a field is what the pane leaves after its border, label and submit hint', () => {
  // 54 columns, a bordered reply field with "reply" beside it: about the 38 characters seen cut in the demo take.
  const room = fieldRoom({ columns: 54, submitLabel: 'reply', isBoxed: true })
  expect(room).toBeGreaterThanOrEqual(34)
  expect(room).toBeLessThanOrEqual(42)
  // A label and a longer hint take room; a field with no border has more.
  expect(fieldRoom({ columns: 54, label: 'In English: ', submitLabel: 'answer', isBoxed: true })).toBeLessThan(room)
  expect(fieldRoom({ columns: 54, submitLabel: 'reply', isBoxed: false })).toBeGreaterThan(room)
})

test('the room is never negative, however narrow the pane', () => {
  expect(fieldRoom({ columns: 5, label: 'Native language: ', isBoxed: true })).toBe(0)
})

test('a line needs the echo only when it is longer than the room; an empty one never does', () => {
  expect(needsEcho('', 0)).toBe(false)
  expect(needsEcho('abcd', 4)).toBe(false)
  expect(needsEcho('abcde', 4)).toBe(true)
})

test('wide characters take two columns, so a short line in Japanese can still outgrow the field', () => {
  expect(textColumns('hello')).toBe(5)
  expect(textColumns('こんにちは')).toBe(10)
  expect(needsEcho('こんにちは', 8)).toBe(true)
  expect(needsEcho('hello', 8)).toBe(false)
})
