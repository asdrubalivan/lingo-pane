import { expect, test } from 'claude-code/testing';
import { DEMO_CARDS, DEMO_LESSON_COUNT } from './content/demo-english-a1';
import { FRESH_PROGRESS, advanceLesson, afterAnswer, buildQueue, hintFor, isCorrectAnswer, isFinished, leaksAnswer, nextCard, normalizeAnswer, parseProgress, queueIds, recordAttempt, reveal, startPractice, } from './lesson';
const NOW = new Date('2026-10-02T12:00:00Z');
test('answers match ignoring case, punctuation and spacing', () => {
    expect(normalizeAnswer('  Good   MORNING! ')).toBe('good morning');
    expect(isCorrectAnswer('good morning', 'Good morning')).toBe(true);
    expect(isCorrectAnswer("  How are you?? ", 'How are you?')).toBe(true);
    expect(isCorrectAnswer('good evening', 'Good morning')).toBe(false);
    expect(isCorrectAnswer('   ', 'Hello')).toBe(false);
});
test('the hint gives the first letter and the size, never the answer', () => {
    expect(hintFor('Good morning')).toBe('Starts with "G", 2 words, 11 letters.');
    expect(hintFor('Hello')).toBe('Starts with "H", 1 word, 5 letters.');
    expect(leaksAnswer('Piensa en la forma: good morning, ¿no?', 'Good morning')).toBe(true);
    expect(leaksAnswer('Piensa en el saludo de la mañana', 'Good morning')).toBe(false);
});
test('progress is validated when read, and bad data starts fresh', () => {
    expect(parseProgress(undefined)).toEqual(FRESH_PROGRESS);
    expect(parseProgress('x')).toEqual(FRESH_PROGRESS);
    expect(parseProgress({ version: 2, currentLesson: 1, cards: {} })).toEqual(FRESH_PROGRESS);
    expect(parseProgress({ version: 1, currentLesson: 0, cards: {} })).toEqual(FRESH_PROGRESS);
    const kept = parseProgress({
        version: 1,
        currentLesson: 3,
        cards: { a: { reviews: [{ at: 't', isCorrect: true }, { at: 1, isCorrect: true }] }, b: 5 },
    });
    expect(kept).toEqual({ version: 1, currentLesson: 3, cards: { a: { reviews: [{ at: 't', isCorrect: true }] } } });
});
test('attempts are recorded without mutating, and capped', () => {
    const one = recordAttempt(FRESH_PROGRESS, 'c1', 't1', false);
    expect(FRESH_PROGRESS.cards).toEqual({});
    expect(one.cards.c1?.reviews).toEqual([{ at: 't1', isCorrect: false }]);
    let many = one;
    for (let i = 0; i < 30; i += 1)
        many = recordAttempt(many, 'c1', `t${i}`, true);
    expect(many.cards.c1?.reviews.length).toBe(20);
});
test('lessons advance up to "finished"', () => {
    let p = FRESH_PROGRESS;
    for (let i = 0; i < DEMO_LESSON_COUNT; i += 1)
        p = advanceLesson(p, DEMO_LESSON_COUNT);
    expect(p.currentLesson).toBe(7);
    expect(isFinished(p, DEMO_LESSON_COUNT)).toBe(true);
    expect(advanceLesson(p, DEMO_LESSON_COUNT).currentLesson).toBe(7);
    expect(isFinished(FRESH_PROGRESS, DEMO_LESSON_COUNT)).toBe(false);
});
test('lesson 1 has no recall; lesson 8 would recall 7, 5 and 1', () => {
    const first = buildQueue(DEMO_CARDS, FRESH_PROGRESS, NOW);
    expect(first.recall).toEqual([]);
    expect(first.fresh.length).toBe(5);
    const fourth = buildQueue(DEMO_CARDS, { ...FRESH_PROGRESS, currentLesson: 4 }, NOW);
    // n-1 = 3 and n-3 = 1 (n-7 does not exist), then lesson 4's new cards.
    expect(fourth.recall.map(id => DEMO_CARDS.find(c => c.id === id)?.lesson)).toEqual([3, 3, 3, 3, 3, 1, 1, 1, 1, 1]);
    expect(fourth.fresh.every(id => DEMO_CARDS.find(c => c.id === id)?.lesson === 4)).toBe(true);
    expect(queueIds(fourth).length).toBe(15);
});
test('a failed card in the recall block goes first inside its lesson', () => {
    const lesson3 = DEMO_CARDS.filter(c => c.lesson === 3);
    const failed = lesson3[4].id;
    const progress = recordAttempt({ ...FRESH_PROGRESS, currentLesson: 4 }, failed, 't', false);
    expect(buildQueue(DEMO_CARDS, progress, NOW).recall[0]).toBe(failed);
});
test('the session walks asking, correct or revealed, next, done', () => {
    const queue = { recall: ['r1'], fresh: ['n1'] };
    let s = startPractice(queue, 2);
    expect(s).toMatchObject({ lesson: 2, queue: ['r1', 'n1'], recallCount: 1, index: 0, status: 'asking' });
    s = afterAnswer(s, false, 'Hello', 'Helo');
    expect(s).toMatchObject({ status: 'asking', misses: 1, hint: 'Starts with "H", 1 word, 5 letters.', lastAnswer: 'Helo' });
    s = afterAnswer(s, true, 'Hello', 'Hello');
    expect(s.status).toBe('correct');
    s = nextCard(s);
    expect(s).toMatchObject({ index: 1, status: 'asking', misses: 0, hint: null });
    s = nextCard(reveal(s));
    expect(s.status).toBe('done');
    expect(startPractice({ recall: [], fresh: [] }, 1).status).toBe('done');
});
