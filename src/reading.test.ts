import { expect, test } from 'claude-code/testing'

import { answerReading, isReadingAnswerRight, parseReading, readingPrompt, showReadingAnswer } from './reading'
import type { TutorContext } from './tutor'

const REPLY = [
  'TITLE: A chess club',
  'TEXT: Ana goes to a chess club every Tuesday.',
  'The club is in an old library.',
  'Q1: When does Ana go? :: Tuesday',
  'Q2: Where is the club? :: an old library',
  'Q3: What game? :: chess',
].join('\n')

const CTX: TutorContext = {
  targetLanguage: 'English', nativeLanguage: 'Spanish', level: 'A2', interests: ['chess'],
  activity: 'conversation', scenario: null, weave: [], workContext: null,
}

test('the prompt asks for a text of the level\'s length and short-answer questions', () => {
  const prompt = readingPrompt(CTX)
  expect(prompt).toContain('60-80 words in English')
  expect(prompt).toContain("one of the learner's interests: chess")
  expect(prompt).toContain('Q1: <question> :: <answer>')
  expect(readingPrompt({ ...CTX, interests: [] })).toContain('everyday life')
  expect(readingPrompt({ ...CTX, workContext: 'billing refactor' })).toContain('"""billing refactor"""')
})

test('a reply in the format is a reading; the text may span lines; bold markers are dropped', () => {
  const reading = parseReading('r1', REPLY)
  expect(reading).toMatchObject({
    id: 'r1',
    title: 'A chess club',
    text: 'Ana goes to a chess club every Tuesday. The club is in an old library.',
    index: 0,
    summary: null,
  })
  expect(reading?.questions.map(q => q.answer)).toEqual(['Tuesday', 'an old library', 'chess'])
  expect(parseReading('r', '**TITLE:** T\n**TEXT:** Some text.\n**Q1:** A? :: a\n**Q2:** B? :: b')?.questions.length).toBe(2)
})

test('no text, or fewer than two questions, is no reading', () => {
  expect(parseReading('r', 'TITLE: T\nQ1: A? :: a\nQ2: B? :: b')).toBeNull()
  expect(parseReading('r', 'TEXT: Some text.\nQ1: A? :: a')).toBeNull()
  expect(parseReading('r', 'TEXT: Some text.\nQ1: A? :: \nQ2: B? :: b')).toBeNull()
  expect(parseReading('r', 'TEXT: Some text.\nQ1: A? :: a\nQ2: B? :: b')?.title).toBe('Reading')
})

test('an answer is right when the learner\'s words hold it', () => {
  expect(isReadingAnswerRight('Tuesday', 'Tuesday')).toBe(true)
  expect(isReadingAnswerRight('on tuesday!', 'Tuesday')).toBe(true)
  expect(isReadingAnswerRight('in an old library', 'an old library')).toBe(true)
  expect(isReadingAnswerRight('library', 'an old library')).toBe(false)
  expect(isReadingAnswerRight('Tues', 'Tuesday')).toBe(false)
  expect(isReadingAnswerRight('', 'Tuesday')).toBe(false)
})

test('right answers move on, wrong ones count a miss, an empty Enter shows it; the end sums up', () => {
  const reading = parseReading('r1', REPLY)!
  const missed = answerReading(reading, 'Monday')
  expect(missed).toMatchObject({ index: 0, misses: 1 })
  const one = answerReading(missed, 'Tuesday')
  expect(one).toMatchObject({ index: 1, misses: 0 })
  expect(one.questions[0]?.outcome).toBe('right')
  const two = showReadingAnswer(one)
  expect(two.questions[1]?.outcome).toBe('shown')
  expect(answerReading(two, '  ')).toBe(two)
  const done = answerReading(two, 'chess')
  expect(done.summary).toEqual({ sentences: 3, corrections: 1 })
  // Nothing moves after the end.
  expect(answerReading(done, 'x')).toBe(done)
  expect(showReadingAnswer(done)).toBe(done)
})
