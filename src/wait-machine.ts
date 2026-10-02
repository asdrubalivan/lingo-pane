// The waiting-state trigger as a pure state machine: what to show while Claude
// is busy. Timers, `$.ui.open` and the rest live in hooks/register.tsx; this
// file only decides the next state from the current one and an event.

import type { LingoWaitState } from '../types'

/** Claude must be busy this long before anything is shown. */
export const SHOW_DELAY_MS = 2000
/** After the turn completes the lesson lingers this long, then goes. */
export const CLOSE_DELAY_MS = 3000

export const INITIAL_WAIT: LingoWaitState = { phase: 'idle', turnId: null, pane: 'none' }

export type WaitEvent =
  | { type: 'turn-start'; turnId: string }
  | { type: 'delay-elapsed'; turnId: string }
  | { type: 'turn-complete'; turnId: string; isAborted: boolean }
  | { type: 'countdown-elapsed'; turnId: string }
  /** A permission ask or an AskUserQuestion: the learner is needed elsewhere. */
  | { type: 'needs-user' }
  /** A later tool call ran: whatever asked has been answered. */
  | { type: 'user-answered' }
  | { type: 'pane-placed' }
  | { type: 'pane-not-placed' }
  /** The pane is gone (the mod closed it, or the person did). */
  | { type: 'pane-closed' }
  /** The person pressed the offer button and opened the pane themselves. */
  | { type: 'offer-taken' }

export function transition(state: LingoWaitState, event: WaitEvent): LingoWaitState {
  switch (event.type) {
    case 'turn-start':
      // A new turn re-evaluates the offer; a pane the mod still has open stays ours.
      return {
        phase: 'armed',
        turnId: event.turnId,
        pane: state.pane === 'open' ? 'open' : 'none',
      }
    case 'delay-elapsed':
      return state.phase === 'armed' && state.turnId === event.turnId
        ? { ...state, phase: 'showing' }
        : state
    case 'needs-user':
      return state.phase === 'armed' || state.phase === 'showing'
        ? { ...state, phase: 'paused' }
        : state
    case 'user-answered':
      return state.phase === 'paused' ? { ...state, phase: 'showing' } : state
    case 'turn-complete':
      if (state.turnId !== event.turnId || state.phase === 'idle' || state.phase === 'closing') {
        return state
      }
      // Only a lesson that was on screen gets the short countdown; an interrupted
      // turn, or one that finished before anything showed (or while retired),
      // goes idle at once.
      return event.isAborted || state.phase !== 'showing'
        ? { phase: 'idle', turnId: null, pane: 'none' }
        : { ...state, phase: 'closing' }
    case 'countdown-elapsed':
      return state.phase === 'closing' && state.turnId === event.turnId
        ? { phase: 'idle', turnId: null, pane: 'none' }
        : state
    case 'pane-placed':
      return { ...state, pane: 'open' }
    case 'pane-not-placed':
      return { ...state, pane: 'offered' }
    case 'pane-closed':
    case 'offer-taken':
      return { ...state, pane: 'none' }
  }
}

/** The micro-lesson belongs in the spinner while the trigger is showing it. */
export function isLessonVisible(state: LingoWaitState): boolean {
  return (state.phase === 'showing' || state.phase === 'closing') && state.turnId !== null
}

/** The "open the pane" button belongs above the prompt only while showing. */
export function isOfferVisible(state: LingoWaitState): boolean {
  return state.phase === 'showing' && state.pane === 'offered'
}

/** Whether the mod itself has a pane open that it must close when it retires. */
export function ownsOpenPane(state: LingoWaitState): boolean {
  return state.pane === 'open'
}
