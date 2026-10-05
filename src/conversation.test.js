import { expect, test } from 'claude-code/testing';
import { UNIT_REPLIES, askedForHelp, isAwaitingLearner, markedParts, newUnit, summaryText, withHelp, withLearnerLine, withTutorTurn, withoutTutor, } from './conversation';
const opened = withTutorTurn(newUnit('u1', 'conversation'), { tutor: 'What did you do last weekend?', fix: null });
test('a unit opens waiting on the tutor, then on the learner', () => {
    const fresh = newUnit('u1', 'conversation');
    expect(fresh.pending).toBe('opening');
    expect(isAwaitingLearner(fresh)).toBe(false);
    expect(opened.lines).toEqual([{ who: 'tutor', text: 'What did you do last weekend?', mark: null }]);
    expect(isAwaitingLearner(opened)).toBe(true);
    // An opening never carries a correction.
    const withFix = withTutorTurn(newUnit('u2', 'conversation'), { tutor: 'Hi!', fix: { wrong: 'a', right: 'b', note: '' } });
    expect(withFix.corrections).toEqual([]);
});
test('a reply shows at once; while the tutor thinks, more lines and help are ignored', () => {
    const asked = withLearnerLine(opened, '  I go to the beach.  ');
    expect(asked.lines.at(-1)).toEqual({ who: 'you', text: 'I go to the beach.' });
    expect(asked).toMatchObject({ replies: 1, pending: 'reply' });
    expect(withLearnerLine(asked, 'again')).toBe(asked);
    expect(askedForHelp(asked)).toBe(asked);
    expect(withLearnerLine(opened, '   ')).toBe(opened);
    expect(withLearnerLine(opened, 'x'.repeat(1000)).lines.at(-1)?.text.length).toBe(400);
});
test('a correction marks the wrong words on screen and is kept with the whole line', () => {
    const asked = withLearnerLine(opened, 'I go to the beach.');
    const answered = withTutorTurn(asked, {
        tutor: 'Nice! When was it? Try go again.',
        fix: { wrong: 'go', right: 'went', note: 'pasado' },
    });
    expect(answered.lines.at(-1)).toEqual({ who: 'tutor', text: 'Nice! When was it? Try go again.', mark: 'go' });
    expect(answered.corrections).toEqual([{ wrong: 'go', right: 'went', note: 'pasado', sentence: 'I go to the beach.' }]);
    expect(answered.pending).toBeNull();
});
test(`after ${UNIT_REPLIES} replies the unit closes with a summary`, () => {
    let unit = opened;
    for (let i = 1; i <= UNIT_REPLIES; i += 1) {
        unit = withLearnerLine(unit, `line ${i}`);
        unit = withTutorTurn(unit, { tutor: 'ok', fix: i === 2 ? { wrong: 'line', right: 'sentence', note: '' } : null });
        expect(unit.summary === null).toBe(i < UNIT_REPLIES);
    }
    expect(unit.summary).toEqual({ sentences: 3, corrections: 1 });
    expect(isAwaitingLearner(unit)).toBe(false);
    expect(summaryText({ sentences: 3, corrections: 1 })).toBe('✓ 3 sentences, 1 correction saved');
    expect(summaryText({ sentences: 1, corrections: 0 })).toBe('✓ 1 sentence, 0 corrections saved');
});
test('help is asked on an empty Enter and shown as a scaffold line', () => {
    const asked = askedForHelp(opened);
    expect(asked.pending).toBe('help');
    const helped = withHelp(asked, 'Last weekend I ___ to ...');
    expect(helped.lines.at(-1)).toEqual({ who: 'help', text: 'Last weekend I ___ to ...' });
    expect(helped.pending).toBeNull();
    // Help that arrives for nothing asked is dropped.
    expect(withHelp(opened, 'late')).toBe(opened);
});
test('a silent tutor gives the learner their line back, or leaves a note', () => {
    const asked = withLearnerLine(opened, 'I go.');
    const back = withoutTutor(asked, 'send it again');
    expect(back.lines).toEqual(opened.lines);
    expect(back).toMatchObject({ replies: 0, pending: null, notice: 'send it again' });
    expect(withoutTutor(newUnit('u3', 'conversation'), 'no opening')).toMatchObject({ pending: null, notice: 'no opening' });
});
test('the marked words are found whatever their case, once', () => {
    expect(markedParts('Try go again', 'go')).toEqual([['Try ', false], ['go', true], [' again', false]]);
    expect(markedParts('Go on', 'go')).toEqual([['Go', true], [' on', false]]);
    expect(markedParts('Nothing here', 'went')).toEqual([['Nothing here', false]]);
    expect(markedParts('Plain', null)).toEqual([['Plain', false]]);
});
