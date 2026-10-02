import { expect, test } from 'claude-code/testing'

import { badThemeText, parseLingoArgs, unknownSubcommandText } from './command'

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

test('theme takes a name, accents and case aside', () => {
  expect(parseLingoArgs('theme Trópico')).toEqual({ kind: 'theme', theme: 'tropico' })
  expect(parseLingoArgs('THEME pastel extra')).toEqual({ kind: 'theme', theme: 'pastel' })
  expect(parseLingoArgs('theme')).toEqual({ kind: 'bad-theme', name: '' })
  expect(parseLingoArgs('theme neon')).toEqual({ kind: 'bad-theme', name: 'neon' })
})

test('a bad theme answer lists the themes; the help lists theme', () => {
  expect(badThemeText('neon')).toContain('"neon"')
  expect(badThemeText('neon')).toContain('atardecer (Atardecer)')
  expect(badThemeText('')).toMatch(/name a theme/)
  expect(unknownSubcommandText('x')).toContain('/lingo theme <name>')
})
