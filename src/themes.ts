// The lesson pane's color themes: raw hex colors handed to `color`,
// `backgroundColor` and `borderColor` on Text and Box. Each activity has its
// own color, and the tutor and the learner are told apart at a glance. The
// values come from the UI mockup of the 2026-10-02 grilling.

import type { LingoThemeName } from '../types'

export type ThemeColors = {
  /** The pane's background. */
  bg: string
  /** Ordinary text. */
  fg: string
  /** Hints and secondary lines. */
  dim: string
  /** Activity colors. */
  conversation: string
  roleplay: string
  reading: string
  review: string
  /** Who speaks. */
  tutor: string
  you: string
  /** A mistake. */
  err: string
  /** The frame around the answer field. */
  ring: string
}

export type Theme = { name: LingoThemeName; label: string; colors: ThemeColors }

export const DEFAULT_THEME: LingoThemeName = 'atardecer'

// The mockup gives no color to `review` (it shows three activities); it borrows
// the learner's own color, the warmest one that is not an activity's.
export const THEMES: readonly Theme[] = [
  {
    name: 'atardecer',
    label: 'Atardecer',
    colors: {
      bg: '#17202b',
      fg: '#e8e3da',
      dim: '#7e8a99',
      conversation: '#ff8a65',
      roleplay: '#b39ddb',
      reading: '#4db6ac',
      review: '#ffcc80',
      tutor: '#90caf9',
      you: '#ffcc80',
      err: '#ef9a9a',
      ring: '#ff8a65',
    },
  },
  {
    name: 'tropico',
    label: 'Trópico',
    colors: {
      bg: '#1b1a22',
      fg: '#ece6dc',
      dim: '#8a8494',
      conversation: '#ffb347',
      roleplay: '#ff6f91',
      reading: '#5fd38d',
      review: '#ffd59e',
      tutor: '#4fc3f7',
      you: '#ffd59e',
      err: '#ff6f91',
      ring: '#ffb347',
    },
  },
  {
    name: 'pastel',
    label: 'Pastel',
    colors: {
      bg: '#1e1e2e',
      fg: '#cdd6f4',
      dim: '#7f849c',
      conversation: '#cba6f7',
      roleplay: '#fab387',
      reading: '#a6e3a1',
      review: '#f5c2e7',
      tutor: '#89dceb',
      you: '#f5c2e7',
      err: '#f38ba8',
      ring: '#cba6f7',
    },
  },
]

/** The theme by name; the default for anything unknown. */
export function themeByName(name: string): Theme {
  return THEMES.find(t => t.name === name) ?? (THEMES[0] as Theme)
}

/** "Trópico", "tropico", " PASTEL " -> the theme's name; null when none matches. */
export function parseThemeName(text: string): LingoThemeName | null {
  const plain = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  return THEMES.find(t => t.name === plain)?.name ?? null
}

export const isThemeName = (value: unknown): value is LingoThemeName =>
  typeof value === 'string' && THEMES.some(t => t.name === value)
