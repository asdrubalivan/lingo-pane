// State contract of lingo-pane: what the waiting-state trigger keeps in `$.state`.
// Self-contained on purpose (no imports): the engine lays it beside dependents.

/** Where the waiting-state trigger is for the current turn. */
export type LingoWaitPhase =
  /** Claude is not working, or the trigger has finished with this turn. */
  | 'idle'
  /** A turn started; waiting out the short delay before showing anything. */
  | 'armed'
  /** The micro-lesson is on screen. */
  | 'showing'
  /** Claude needs the learner (a permission ask or a question): nothing is shown. */
  | 'paused'
  /** The turn completed; the lesson stays a few seconds, then goes. */
  | 'closing'

/** What became of the lesson pane the mod itself opened while waiting. */
export type LingoWaitPane =
  /** The mod has no pane open (or the person opened it themselves). */
  | 'none'
  /** The mod opened it and it is drawn: the mod closes it when the turn ends. */
  | 'open'
  /** The mod tried and the pane was not placed (narrow terminal): a button offers it. */
  | 'offered'

export type LingoWaitState = {
  phase: LingoWaitPhase
  /** The main-loop turn the trigger follows; null while idle. */
  turnId: string | null
  pane: LingoWaitPane
}

declare module 'claude-code' {
  interface PluginState {
    'lingo-pane': { wait: LingoWaitState }
  }
}
