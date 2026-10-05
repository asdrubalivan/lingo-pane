// Sizing and seating of the docked split, and the line that tells a learner
// studying in it what Claude is doing. Pure: hooks/register.tsx reads the
// viewport off the render events and calls `$.ui.open` with these numbers.

import type { LingoWaitState } from '../types'

/** The engine docks a pane only in fullscreen and from this many columns (144 for one it opens unasked the first time). */
export const DOCK_MIN_COLUMNS = 110
/** An inline pane (no room for the split) is opened about this share of the terminal's height. */
export const INLINE_ROWS_SHARE = 0.4
export const MIN_INLINE_ROWS = 8

export type Viewport = { columns: number; rows: number; isFullscreen?: boolean }

/** Whether the split may open by itself: fullscreen and wide enough to dock. */
export function canSeatSplit(viewport: Viewport | null): boolean {
  return viewport !== null && viewport.isFullscreen === true && viewport.columns >= DOCK_MIN_COLUMNS
}

/** The columns the docked split asks for: the share of the terminal's width. */
export function splitColumns(terminalColumns: number, sharePercent: number): number {
  return Math.max(1, Math.round((terminalColumns * sharePercent) / 100))
}

/** The rows an inline pane asks for: about 40 % of the terminal's height. */
export function inlineRows(terminalRows: number): number {
  return Math.max(MIN_INLINE_ROWS, Math.round(terminalRows * INLINE_ROWS_SHARE))
}

/** 41s, 2m 05s. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/** The top line of the split: what Claude is doing right now. */
export function claudeStateLine(state: LingoWaitState, nowMs: number): string {
  if (state.phase === 'paused') return '! Claude needs you · answer below'
  if (state.phase === 'armed' || state.phase === 'showing') {
    return state.startedAt === null ? '✻ Claude working' : `✻ Claude working · ${formatElapsed(nowMs - state.startedAt)}`
  }
  return '✓ Claude done'
}
