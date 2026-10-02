import { expect, test } from 'claude-code/testing'

import { parseLingoArgs, unknownSubcommandText } from './command'

test('no arguments, or only blanks, open the pane', () => {
  expect(parseLingoArgs('')).toEqual({ kind: 'open' })
  expect(parseLingoArgs('   ')).toEqual({ kind: 'open' })
})

test('setup is recognised whatever its case and spacing, extra words ignored', () => {
  expect(parseLingoArgs('setup')).toEqual({ kind: 'setup' })
  expect(parseLingoArgs('  SETUP  ')).toEqual({ kind: 'setup' })
  expect(parseLingoArgs('setup now please')).toEqual({ kind: 'setup' })
})

test('anything else is unknown and keeps the word as typed', () => {
  expect(parseLingoArgs('Frobnicate x')).toEqual({ kind: 'unknown', name: 'Frobnicate' })
})

test('the unknown-subcommand answer names the word and lists the real ones', () => {
  const text = unknownSubcommandText('nope')
  expect(text).toContain('"nope"')
  expect(text).toContain('/lingo setup')
  expect(text).toMatch(/^ {2}\/lingo {2}open or close/m)
})
