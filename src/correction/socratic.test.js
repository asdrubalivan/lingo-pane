import { expect, test } from 'claude-code/testing';
import { socratic } from './socratic';
const ctx = { targetLanguage: 'English', nativeLanguage: 'Spanish' };
test('socratic names both languages', () => {
    const text = socratic.instruction(ctx);
    expect(text.includes('English')).toBe(true);
    expect(text.includes('Spanish')).toBe(true);
});
test('socratic asks before answering', () => {
    const text = socratic.instruction(ctx);
    expect(text.includes('do not give the correct answer first')).toBe(true);
});
test('socratic is deterministic and has an id', () => {
    expect(socratic.instruction(ctx)).toBe(socratic.instruction(ctx));
    expect(socratic.id).toBe('socratic');
});
