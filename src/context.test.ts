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

test('bearer tokens, dotted tokens, URL credentials and padded tokens never get kept', () => {
  const jwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFuYSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  const said = [
    `curl -H "Authorization: Bearer 8f3k2LmQ9xT7vB1nZ4cR" https://api.example.com`,
    `the session cookie is ${jwt}`,
    'clone https://deploy-bot:s3cretPass@git.example.com/acme/app.git',
    'or https://ghp_x7Kd92LmQpRt@github.com/acme/app.git',
    'blob dGhpcyBpcyBhIHNlY3JldCBwYXlsb2FkIQ== was sent',
    'again dGhpcyBpcyBhIHNlY3JldCBwYXlsb2FkISEhISE=',
    'dotted K7xP2mQ9vL4nR8tW.Zb3Yc6Hd1Fg5Js0A.Xe9Uo2Ki7Mp4Nq1B',
  ].join(' ')
  const kept = excerpt(said, 1000) ?? ''
  for (const leak of [
    '8f3k2LmQ',
    'eyJ',
    'SflKxw',
    'deploy-bot',
    's3cretPass',
    'ghp_',
    'dGhpcy',
    '==',
    'ISEhISE',
    'K7xP2mQ9',
    'Zb3Yc6Hd',
    'Xe9Uo2Ki',
  ]) {
    expect(kept).not.toContain(leak)
  }
  expect(kept).toContain('https://[redacted]@git.example.com/acme/app.git')
  expect(kept).toContain('https://api.example.com')
})

test('ordinary dotted and hyphenated text is not mistaken for a token', () => {
  expect(excerpt('see https://example.com/docs and src/app.module.ts, then com.example.app', 300)).toBe(
    'see https://example.com/docs and src/app.module.ts, then com.example.app',
  )
})

test('the tutor reads the prompt and the reply, or nothing', () => {
  expect(contextForTutor(NO_CONTEXT)).toBeNull()
  expect(contextForTutor({ prompt: 'fix the parser', answer: null })).toBe('The learner asked Claude: fix the parser')
  expect(contextForTutor({ prompt: 'fix it', answer: 'Done: the parser handles dates.' })).toBe(
    'The learner asked Claude: fix it\nClaude replied: Done: the parser handles dates.',
  )
})
