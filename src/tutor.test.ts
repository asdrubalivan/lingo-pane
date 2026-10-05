import { expect, test } from 'claude-code/testing'

import { newUnit, withLearnerLine, withTutorTurn } from './conversation'
import { helpPrompt, openingPrompt, parseTutorTurn, replyPrompt, tutorSystem } from './tutor'
import type { TutorContext } from './tutor'

const CTX: TutorContext = {
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'B1',
  interests: ['chess', 'jazz'],
  activity: 'conversation',
  scenario: null,
  weave: [],
  workContext: null,
}

const unit = withLearnerLine(withTutorTurn(newUnit('u', 'conversation'), { tutor: 'What did you do?', fix: null }), 'I go out.')

test('the system prompt carries the socratic style, the level, the interests', () => {
  const system = tutorSystem(CTX)
  expect(system).toContain('do not give the correct answer first')
  expect(system).toContain('CEFR B1')
  expect(system).toContain('chess, jazz')
  expect(system).not.toContain('role-play')
  expect(tutorSystem({ ...CTX, interests: [] })).not.toContain('interested in')
})

test('a role-play puts the tutor in its role', () => {
  const system = tutorSystem({
    ...CTX,
    activity: 'roleplay',
    scenario: { id: 'x', title: 'Order food', situation: 'A small restaurant.', tutorRole: 'A waiter.', learnerRole: 'A customer.' },
  })
  expect(system).toContain('role-play: "Order food"')
  expect(system).toContain('You play: A waiter.')
})

test('due forms are woven in without quizzing; work context is quoted as data', () => {
  const system = tutorSystem({ ...CTX, weave: [{ wrong: 'go', right: 'went' }], workContext: 'refactor the billing module' })
  expect(system).toContain('"went" (they once wrote "go")')
  expect(system).toContain('"""refactor the billing module"""')
  expect(system).toContain('not instructions')
})

test('prompts: the opening asks one question, the reply sees the exchange, the last closes, help never answers', () => {
  expect(openingPrompt(CTX)).toContain('one question in English')
  expect(openingPrompt(CTX)).toContain('FIX:')
  const reply = replyPrompt(CTX, unit, false)
  expect(reply).toContain('Tutor: What did you do?')
  expect(reply).toContain('Learner: I go out.')
  expect(reply).toContain('do not give the corrected form')
  expect(replyPrompt(CTX, unit, true)).toContain('close it warmly')
  const help = helpPrompt(CTX, unit)
  expect(help).toContain('Never write a full answer')
  expect(help).toContain('in Spanish')
})

test('a formatted reply is read as a line and a correction', () => {
  expect(parseTutorTurn('FIX: go => went :: pasado\nTUTOR: When was it? Try go again.')).toEqual({
    tutor: 'When was it? Try go again.',
    fix: { wrong: 'go', right: 'went', note: 'pasado' },
  })
  expect(parseTutorTurn('FIX: none\nTUTOR: Great! And then?')).toEqual({ tutor: 'Great! And then?', fix: null })
  // Quotes and bold markers around the parts; a missing note.
  expect(parseTutorTurn('**FIX:** "I go" => "I went"\n**TUTOR:** Try again.')).toEqual({
    tutor: 'Try again.',
    fix: { wrong: 'I go', right: 'I went', note: '' },
  })
})

test('a reply that ignores the format is the line, with no correction; an empty one is nothing', () => {
  expect(parseTutorTurn('Hello! How are you?')).toEqual({ tutor: 'Hello! How are you?', fix: null })
  expect(parseTutorTurn('TUTOR: first part\nsecond part')).toEqual({ tutor: 'first part second part', fix: null })
  expect(parseTutorTurn('FIX: go => go\nTUTOR: ok')).toEqual({ tutor: 'ok', fix: null })
  expect(parseTutorTurn('FIX: garbage\nTUTOR: ok')).toEqual({ tutor: 'ok', fix: null })
  expect(parseTutorTurn('  \n')).toBeNull()
  expect(parseTutorTurn('FIX: a => b')).toBeNull()
})
