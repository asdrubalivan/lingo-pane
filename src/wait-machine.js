// The waiting-state trigger as a pure state machine: what to show while Claude
// is busy, and when the docked split opens and closes. Timers, `$.ui.open` and
// the rest live in hooks/register.tsx; this file only decides the next state
// from the current one and an event.
/** Claude must be busy this long before anything is shown. */
export const SHOW_DELAY_MS = 2000;
/** After the turn completes the lesson lingers this long, then goes. */
export const CLOSE_DELAY_MS = 3000;
export const INITIAL_WAIT = {
    phase: 'idle',
    turnId: null,
    startedAt: null,
    pane: 'none',
    opener: null,
    isTouched: false,
};
const PANE_CLOSED = { pane: 'none', opener: null, isTouched: false };
/** Idle again; a split that is open stays (the hook decides whether to close it). */
const idle = (state) => ({
    ...state,
    phase: 'idle',
    turnId: null,
    startedAt: null,
    pane: state.pane === 'offered' ? 'none' : state.pane,
});
export function transition(state, event) {
    switch (event.type) {
        case 'turn-start':
            // A new turn re-evaluates the offer; a split that is open stays as it is.
            return {
                ...(state.pane === 'open' ? state : { ...state, ...PANE_CLOSED }),
                phase: 'armed',
                turnId: event.turnId,
                startedAt: event.at,
            };
        case 'delay-elapsed':
            return state.phase === 'armed' && state.turnId === event.turnId
                ? { ...state, phase: 'showing' }
                : state;
        case 'needs-user':
            return state.phase === 'armed' || state.phase === 'showing'
                ? { ...state, phase: 'paused' }
                : state;
        case 'user-answered':
            return state.phase === 'paused' ? { ...state, phase: 'showing' } : state;
        case 'turn-complete':
            if (state.turnId !== event.turnId || state.phase === 'idle' || state.phase === 'closing') {
                return state;
            }
            // Only a lesson that was on screen gets the short countdown; an interrupted
            // turn, or one that finished before anything showed (or while retired),
            // goes idle at once.
            return event.isAborted || state.phase !== 'showing' ? idle(state) : { ...state, phase: 'closing' };
        case 'countdown-elapsed':
            return state.phase === 'closing' && state.turnId === event.turnId ? idle(state) : state;
        case 'pane-placed':
            return { ...state, pane: 'open', opener: event.opener, isTouched: false };
        case 'pane-not-placed':
            return { ...state, ...PANE_CLOSED, pane: 'offered' };
        case 'pane-closed':
        case 'offer-taken':
            return { ...state, ...PANE_CLOSED };
        case 'touched':
            return state.pane === 'open' ? { ...state, isTouched: true } : state;
    }
}
/** The micro-lesson belongs in the spinner while the trigger is showing it. */
export function isLessonVisible(state) {
    return (state.phase === 'showing' || state.phase === 'closing') && state.turnId !== null;
}
/** The "open lesson" button belongs above the prompt only while showing. */
export function isOfferVisible(state) {
    return state.phase === 'showing' && state.pane === 'offered';
}
/** Claude is working (or waiting on the person mid-turn). */
export function isClaudeWorking(state) {
    return state.phase === 'armed' || state.phase === 'showing' || state.phase === 'paused';
}
/** The mod opened the split by itself and nobody has used it: it goes when the turn does. */
export function isUntouchedAuto(state) {
    return state.pane === 'open' && state.opener === 'mod' && !state.isTouched;
}
/**
 * A split the learner is using: touched, or opened by the person (`/lingo`, the
 * band). It stays after the turn and closes when its micro-unit ends with Claude
 * idle, when the learner submits their next prompt, or by hand.
 */
export function isKeptOpen(state) {
    return state.pane === 'open' && (state.isTouched || state.opener === 'person');
}
/** When a completed turn closes the split: now, after the short countdown, or not at all. */
export function closeOnTurnComplete(state, event) {
    if (!isUntouchedAuto(state) || state.turnId !== event.turnId)
        return 'keep';
    return transition(state, { type: 'turn-complete', ...event }).phase === 'closing' ? 'after-countdown' : 'now';
}
