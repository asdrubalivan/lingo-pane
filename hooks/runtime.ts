import { DEFAULT_SPLIT_SHARE } from '../src/setup'
import { inlineRows, splitColumns } from '../src/split'
import type { Viewport } from '../src/split'
import type { LingoSetup } from '../types'
import { PANE, PANE_TITLE } from './state'

type Timer = { cancel: () => void }

// What one registration of the mod keeps in memory between events. Timer handles
// live here, not in `$.state`: a hot reload drops them together with the timers
// themselves (the engine cancels pending waits on reload).
export type Runtime = {
  // The userConfig, validated by `draftFromConfig`, where it is used.
  readonly config: { readonly native: unknown; readonly target: unknown }
  delayTimer: Timer | null
  closeTimer: Timer | null
  // Redraws the split once a second while Claude works, for the elapsed time.
  ticker: Timer | null
  // Bumped on Enter in a wizard field so the field is drawn again with its text.
  inputRev: number
  // The last size a render event reported: `turn.start` carries none, and a
  // render hook may not write `$.state`. The terminal's wins over a remote one.
  terminalViewport: Viewport | null
  otherViewport: Viewport | null
}

export function createRuntime(options: { targetLanguage?: unknown; nativeLanguage?: unknown }): Runtime {
  return {
    config: { native: options.nativeLanguage, target: options.targetLanguage },
    delayTimer: null,
    closeTimer: null,
    ticker: null,
    inputRev: 0,
    terminalViewport: null,
    otherViewport: null,
  }
}

export function noteViewport(rt: Runtime, e: { surface: string; viewport?: Viewport }) {
  if (e.viewport === undefined) return
  if (e.surface === 'terminal') rt.terminalViewport = e.viewport
  else rt.otherViewport = e.viewport
}

export const viewportOf = (rt: Runtime) => rt.terminalViewport ?? rt.otherViewport

// What the split asks for: the keyboard (granted only over an empty prompt),
// its share of the width when docked, about 40 % of the height inline.
export function openArgs(rt: Runtime, setup: LingoSetup | null, terminalColumns?: number) {
  const seen = viewportOf(rt)
  const columns = terminalColumns ?? seen?.columns
  return {
    id: PANE,
    title: PANE_TITLE,
    focus: true as const,
    ...(columns === undefined ? {} : { columns: splitColumns(columns, setup?.splitShare ?? DEFAULT_SPLIT_SHARE) }),
    ...(seen === null ? {} : { rows: inlineRows(seen.rows) }),
  }
}
