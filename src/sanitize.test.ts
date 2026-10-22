import { expect, test } from 'claude-code/testing'

import { sanitizeModelText } from './sanitize'

const ESC = '\u001b'
const BEL = '\u0007'
const NOT_CAPPED = 1000

test('plain text and line breaks survive; carriage returns become line breaks', () => {
  expect(sanitizeModelText('Hola, ¿qué tal?\nBien — gracias.', NOT_CAPPED)).toBe('Hola, ¿qué tal?\nBien — gracias.')
  expect(sanitizeModelText('a\r\nb\rc', NOT_CAPPED)).toBe('a\nb\nc')
})

test('every C0 control but the line break is removed (a tab becomes a space)', () => {
  for (let code = 0; code < 0x20; code++) {
    if (code === 0x0a || code === 0x0d || code === 0x09 || code === 0x1b) continue
    expect(sanitizeModelText(`a${String.fromCharCode(code)}b`, NOT_CAPPED)).toBe('ab')
  }
  expect(sanitizeModelText('a\tb', NOT_CAPPED)).toBe('a b')
  expect(sanitizeModelText('a\u007fb', NOT_CAPPED)).toBe('ab')
})

test('every C1 control is removed', () => {
  // The ones that introduce a sequence are covered below.
  for (let code = 0x80; code <= 0x9f; code++) {
    if ([0x90, 0x98, 0x9b, 0x9d, 0x9e, 0x9f].includes(code)) continue
    expect(sanitizeModelText(`a${String.fromCharCode(code)}b`, NOT_CAPPED)).toBe('ab')
  }
})

test('colour, cursor and erase sequences leave no trace', () => {
  expect(sanitizeModelText(`${ESC}[31mred${ESC}[0m text`, NOT_CAPPED)).toBe('red text')
  expect(sanitizeModelText(`a${ESC}[2J${ESC}[Hb${ESC}[?25lc`, NOT_CAPPED)).toBe('abc')
  expect(sanitizeModelText('a\u009b31mb', NOT_CAPPED)).toBe('ab')
})

test('OSC sequences (window title, clipboard, hyperlinks) go with their payload', () => {
  expect(sanitizeModelText(`${ESC}]0;pwned${BEL}Hello`, NOT_CAPPED)).toBe('Hello')
  expect(sanitizeModelText(`${ESC}]52;c;ZWNobyBoaQ==${ESC}\\Hello`, NOT_CAPPED)).toBe('Hello')
  expect(sanitizeModelText(`${ESC}]8;;https://evil.example${BEL}click${ESC}]8;;${BEL}`, NOT_CAPPED)).toBe('click')
  expect(sanitizeModelText('\u009d0;pwned\u009cHello', NOT_CAPPED)).toBe('Hello')
})

test('an unterminated OSC stops at the end of its line', () => {
  expect(sanitizeModelText(`${ESC}]0;pwned\nnext line`, NOT_CAPPED)).toBe('\nnext line')
})

test('DCS, APC and other string sequences, and lone escapes, are removed', () => {
  expect(sanitizeModelText(`a${ESC}Pq#0;2;0;0;0${ESC}\\b`, NOT_CAPPED)).toBe('ab')
  expect(sanitizeModelText(`a${ESC}_Gi=1;payload${ESC}\\b`, NOT_CAPPED)).toBe('ab')
  expect(sanitizeModelText(`a${ESC}cb${ESC}`, NOT_CAPPED)).toBe('ab')
})

test('the text is cut at the cap, never inside a surrogate pair', () => {
  expect(sanitizeModelText('abcdef', 3)).toBe('abc')
  expect(sanitizeModelText('ab😀cd', 3)).toBe('ab')
  expect(sanitizeModelText('ab😀cd', 4)).toBe('ab😀')
})

test('the cap counts what is left after stripping', () => {
  expect(sanitizeModelText(`${ESC}[31m${'x'.repeat(10)}${ESC}[0m`, 5)).toBe('xxxxx')
})
