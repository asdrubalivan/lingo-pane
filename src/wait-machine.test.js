import { expect, test } from 'claude-code/testing';
import { ENGLISH_TO_SPANISH, cardsFor, microLesson, pickIndex, spinnerSuffix } from './microcards';
import { INITIAL_WAIT, closeOnTurnComplete, isClaudeWorking, isKeptOpen, isLessonVisible, isOfferVisible, isUntouchedAuto, transition, } from './wait-machine';
const run = (events, from = INITIAL_WAIT) => events.reduce(transition, from);
test('a turn shows the lesson only after the delay elapses', () => {
    const armed = run([{ type: 'turn-start', turnId: 't1', at: 0 }]);
    expect(armed.phase).toBe('armed');
    expect(isLessonVisible(armed)).toBe(false);
    const showing = transition(armed, { type: 'delay-elapsed', turnId: 't1' });
    expect(showing.phase).toBe('showing');
    expect(isLessonVisible(showing)).toBe(true);
});
test('a stale delay or countdown from another turn is ignored', () => {
    const armed = run([{ type: 'turn-start', turnId: 't2', at: 0 }]);
    expect(transition(armed, { type: 'delay-elapsed', turnId: 't1' })).toEqual(armed);
    const closing = run([
        { type: 'turn-start', turnId: 't2', at: 0 },
        { type: 'delay-elapsed', turnId: 't2' },
        { type: 'turn-complete', turnId: 't2', isAborted: false },
    ]);
    expect(closing.phase).toBe('closing');
    expect(transition(closing, { type: 'countdown-elapsed', turnId: 't1' })).toEqual(closing);
    expect(transition(closing, { type: 'countdown-elapsed', turnId: 't2' })).toEqual(INITIAL_WAIT);
});
test('completing before the delay never shows anything', () => {
    const state = run([
        { type: 'turn-start', turnId: 't1', at: 0 },
        { type: 'turn-complete', turnId: 't1', isAborted: false },
        { type: 'delay-elapsed', turnId: 't1' },
    ]);
    expect(isLessonVisible(state)).toBe(false);
});
test('an interrupted turn goes idle at once, an answered one counts down', () => {
    const showing = run([
        { type: 'turn-start', turnId: 't1', at: 0 },
        { type: 'delay-elapsed', turnId: 't1' },
    ]);
    expect(transition(showing, { type: 'turn-complete', turnId: 't1', isAborted: true })).toEqual(INITIAL_WAIT);
    expect(transition(showing, { type: 'turn-complete', turnId: 't1', isAborted: false }).phase).toBe('closing');
});
test('a pending ask retires the lesson until a tool runs again', () => {
    const showing = run([
        { type: 'turn-start', turnId: 't1', at: 0 },
        { type: 'delay-elapsed', turnId: 't1' },
    ]);
    const paused = transition(showing, { type: 'needs-user' });
    expect(paused.phase).toBe('paused');
    expect(isLessonVisible(paused)).toBe(false);
    expect(transition(paused, { type: 'user-answered' }).phase).toBe('showing');
    // Nothing to pause or resume while idle.
    expect(transition(INITIAL_WAIT, { type: 'needs-user' })).toEqual(INITIAL_WAIT);
    expect(transition(INITIAL_WAIT, { type: 'user-answered' })).toEqual(INITIAL_WAIT);
});
test('a split that cannot seat becomes an offer, shown only while showing', () => {
    const offered = run([
        { type: 'turn-start', turnId: 't1', at: 0 },
        { type: 'delay-elapsed', turnId: 't1' },
        { type: 'pane-not-placed' },
    ]);
    expect(isOfferVisible(offered)).toBe(true);
    expect(isOfferVisible(transition(offered, { type: 'needs-user' }))).toBe(false);
    expect(transition(offered, { type: 'offer-taken' }).pane).toBe('none');
    const placed = transition(offered, { type: 'pane-placed', opener: 'person' });
    expect(isOfferVisible(placed)).toBe(false);
    // An open split survives into the next turn, with who opened it; an offer does not.
    expect(transition(placed, { type: 'turn-start', turnId: 't2', at: 5 })).toMatchObject({ pane: 'open', opener: 'person', startedAt: 5 });
    expect(transition(offered, { type: 'turn-start', turnId: 't2', at: 5 }).pane).toBe('none');
});
test('the turn start time is kept while Claude works and dropped when idle', () => {
    const armed = run([{ type: 'turn-start', turnId: 't1', at: 1000 }]);
    expect(armed.startedAt).toBe(1000);
    expect(isClaudeWorking(armed)).toBe(true);
    const paused = run([{ type: 'delay-elapsed', turnId: 't1' }, { type: 'needs-user' }], armed);
    expect(isClaudeWorking(paused)).toBe(true);
    const done = transition(armed, { type: 'turn-complete', turnId: 't1', isAborted: false });
    expect(done).toMatchObject({ phase: 'idle', startedAt: null });
    expect(isClaudeWorking(done)).toBe(false);
});
test('an untouched split the mod opened goes with the turn; touched or asked, it stays', () => {
    const opened = run([
        { type: 'turn-start', turnId: 't1', at: 0 },
        { type: 'delay-elapsed', turnId: 't1' },
        { type: 'pane-placed', opener: 'mod' },
    ]);
    expect(isUntouchedAuto(opened)).toBe(true);
    expect(isKeptOpen(opened)).toBe(false);
    expect(closeOnTurnComplete(opened, { turnId: 't1', isAborted: false })).toBe('after-countdown');
    expect(closeOnTurnComplete(opened, { turnId: 't1', isAborted: true })).toBe('now');
    // Another turn's completion is not this one's.
    expect(closeOnTurnComplete(opened, { turnId: 'other', isAborted: false })).toBe('keep');
    // Retired for a permission ask: no lingering, it goes at once.
    expect(closeOnTurnComplete(transition(opened, { type: 'needs-user' }), { turnId: 't1', isAborted: false })).toBe('now');
    const touched = transition(opened, { type: 'touched' });
    expect(isUntouchedAuto(touched)).toBe(false);
    expect(isKeptOpen(touched)).toBe(true);
    expect(closeOnTurnComplete(touched, { turnId: 't1', isAborted: false })).toBe('keep');
    // The turn ending leaves it open and touched.
    expect(transition(touched, { type: 'turn-complete', turnId: 't1', isAborted: true })).toMatchObject({
        phase: 'idle',
        pane: 'open',
        isTouched: true,
    });
    const asked = transition(INITIAL_WAIT, { type: 'pane-placed', opener: 'person' });
    expect(isKeptOpen(asked)).toBe(true);
    expect(isUntouchedAuto(asked)).toBe(false);
    // Touching nothing open changes nothing; closing forgets who opened it.
    expect(transition(INITIAL_WAIT, { type: 'touched' })).toEqual(INITIAL_WAIT);
    expect(transition(touched, { type: 'pane-closed' })).toMatchObject({ pane: 'none', opener: null, isTouched: false });
    // A reopened split starts untouched.
    expect(transition(touched, { type: 'pane-placed', opener: 'mod' }).isTouched).toBe(false);
});
test('the card is stable for a turn and only English to Spanish is built in', () => {
    expect(pickIndex('turn-1', 8)).toBe(pickIndex('turn-1', 8));
    for (const seed of ['a', 'b', 'turn-1', 'turn-2', '']) {
        const index = pickIndex(seed, ENGLISH_TO_SPANISH.length);
        expect(index >= 0 && index < ENGLISH_TO_SPANISH.length).toBe(true);
    }
    const lesson = microLesson('English', 'Spanish', 'turn-1');
    const card = ENGLISH_TO_SPANISH[pickIndex('turn-1', ENGLISH_TO_SPANISH.length)];
    expect(lesson).toBe(`${card?.word} = ${card?.gloss}`);
    expect(spinnerSuffix(lesson)).toBe(`… · ${lesson}`);
    expect(cardsFor(' english ', 'español').kind).toBe('cards');
    expect(microLesson('Ukrainian', 'Spanish', 'turn-1')).toBe('no built-in cards for Ukrainian yet');
    expect(cardsFor('English', 'French').kind).toBe('unsupported');
});
