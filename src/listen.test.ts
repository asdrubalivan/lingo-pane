import { expect, test } from 'claude-code/testing'

import { languageCode, listenUrl } from './listen'

test('language names as typed become codes; unknown ones are null', () => {
  expect(languageCode(' English ')).toBe('en')
  expect(languageCode('español')).toBe('es')
  expect(languageCode('Ukrainian')).toBe('uk')
  expect(languageCode('Klingon')).toBeNull()
})

test('the listen link is Google Translate with the phrase encoded, written as URL spells it', () => {
  const url = listenUrl("It's a nice day!", 'English', 'Spanish')
  expect(url).toBe(new URL(url).href)
  expect(url.startsWith('https://translate.google.com/?sl=en&tl=es&text=')).toBe(true)
  expect(url).toContain('It%27s%20a%20nice%20day!')
  expect(listenUrl('Привіт', 'Ukrainian', 'Klingon')).toContain('sl=uk&tl=en')
  expect(listenUrl('x', 'Klingon', 'Spanish')).toContain('sl=auto')
  // ASCII only, and capped.
  expect(/^[\x21-\x7e]+$/.test(listenUrl('Привіт світ', 'Ukrainian', 'Spanish'))).toBe(true)
  expect(listenUrl('a'.repeat(1000), 'English', 'Spanish').length).toBeLessThan(400)
})
