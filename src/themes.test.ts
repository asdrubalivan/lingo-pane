import { expect, test } from 'claude-code/testing'

import { DEFAULT_THEME, THEMES, isThemeName, parseThemeName, themeByName } from './themes'

const HEX = /^#[0-9a-f]{6}$/

test('three themes, Atardecer first and the default, every color a hex', () => {
  expect(THEMES.map(t => t.name)).toEqual(['atardecer', 'tropico', 'pastel'])
  expect(DEFAULT_THEME).toBe('atardecer')
  for (const theme of THEMES) {
    for (const color of Object.values(theme.colors)) expect(color).toMatch(HEX)
  }
})

test('the mockup colors: each activity its own, tutor and learner apart', () => {
  const sunset = themeByName('atardecer').colors
  expect([sunset.conversation, sunset.roleplay, sunset.reading]).toEqual(['#ff8a65', '#b39ddb', '#4db6ac'])
  expect([sunset.tutor, sunset.you, sunset.err]).toEqual(['#90caf9', '#ffcc80', '#ef9a9a'])
  expect(themeByName('tropico').colors.conversation).toBe('#ffb347')
  expect(themeByName('pastel').colors.err).toBe('#f38ba8')
  for (const { colors } of THEMES) {
    expect(new Set([colors.conversation, colors.roleplay, colors.reading]).size).toBe(3)
    expect(colors.tutor).not.toBe(colors.you)
  }
})

test('names are read without accents or case; unknown ones fall back or are refused', () => {
  expect(parseThemeName(' Trópico ')).toBe('tropico')
  expect(parseThemeName('PASTEL')).toBe('pastel')
  expect(parseThemeName('neon')).toBeNull()
  expect(themeByName('neon').name).toBe('atardecer')
  expect(isThemeName('pastel')).toBe(true)
  expect(isThemeName('Pastel')).toBe(false)
})
