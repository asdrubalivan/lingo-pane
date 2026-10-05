import { expect, test } from 'claude-code/testing'

import { NO_CONTEXT, contextForTutor, excerpt } from './context'

test('excerpts are cut short with whitespace collapsed; empty is nothing', () => {
  expect(excerpt('  refactor   the\nbilling module ', 300)).toBe('refactor the billing module')
  const long = excerpt('word '.repeat(100), 50)
  expect(long?.length).toBe(50)
  expect(long?.endsWith('…')).toBe(true)
  expect(excerpt('   ', 300)).toBeNull()
})

test('what looks like a secret or an email never gets kept', () => {
  const said = [
    'use sk-ant-REDACTEDREDACTED123 and ghp_abcdefghijklmnop',
    'AKIAABCDEFGHIJKLMNOP',
    'password: hunter2, api_key=abc123',
    'mail me at ana@example.com',
    'token a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----',
  ].join(' ')
  const kept = excerpt(said, 1000) ?? ''
  for (const leak of ['sk-ant', 'ghp_', 'AKIA', 'hunter2', 'abc123', 'ana@example.com', 'a1b2c3d4e5f6', 'MIIEow']) {
    expect(kept).not.toContain(leak)
  }
  expect(kept).toContain('[email]')
  expect(excerpt('fix the date parser in utils.ts', 300)).toBe('fix the date parser in utils.ts')
})

test('the tutor reads the prompt and the reply, or nothing', () => {
  expect(contextForTutor(NO_CONTEXT)).toBeNull()
  expect(contextForTutor({ prompt: 'fix the parser', answer: null })).toBe('The learner asked Claude: fix the parser')
  expect(contextForTutor({ prompt: 'fix it', answer: 'Done: the parser handles dates.' })).toBe(
    'The learner asked Claude: fix it\nClaude replied: Done: the parser handles dates.',
  )
})
