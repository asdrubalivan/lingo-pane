import { expect, test } from 'claude-code/testing';
import { INITIAL_WAIT } from './wait-machine';
import { canSeatSplit, claudeStateLine, formatElapsed, inlineRows, splitColumns } from './split';
test('the split opens by itself only in fullscreen from 110 columns', () => {
    expect(canSeatSplit({ columns: 200, rows: 50, isFullscreen: true })).toBe(true);
    expect(canSeatSplit({ columns: 110, rows: 50, isFullscreen: true })).toBe(true);
    expect(canSeatSplit({ columns: 109, rows: 50, isFullscreen: true })).toBe(false);
    expect(canSeatSplit({ columns: 200, rows: 50, isFullscreen: false })).toBe(false);
    // Unknown fullscreen is not fullscreen; no viewport seen yet, nothing opens.
    expect(canSeatSplit({ columns: 200, rows: 50 })).toBe(false);
    expect(canSeatSplit(null)).toBe(false);
});
test('the split asks for its share of the width; inline about 40 % of the height', () => {
    expect(splitColumns(200, 40)).toBe(80);
    expect(splitColumns(151, 33)).toBe(50);
    expect(splitColumns(120, 50)).toBe(60);
    expect(inlineRows(50)).toBe(20);
    expect(inlineRows(24)).toBe(10);
    expect(inlineRows(10)).toBe(8);
});
test('the Claude line says working with the time, needs you, or done', () => {
    expect(formatElapsed(41900)).toBe('41s');
    expect(formatElapsed(125000)).toBe('2m 05s');
    expect(formatElapsed(-5)).toBe('0s');
    const working = { ...INITIAL_WAIT, phase: 'showing', turnId: 't', startedAt: 1000 };
    expect(claudeStateLine(working, 42000)).toBe('✻ Claude working · 41s');
    expect(claudeStateLine({ ...working, phase: 'armed' }, 3000)).toBe('✻ Claude working · 2s');
    expect(claudeStateLine({ ...working, phase: 'paused' }, 3000)).toMatch(/Claude needs you/);
    expect(claudeStateLine({ ...working, phase: 'closing' }, 3000)).toBe('✓ Claude done');
    expect(claudeStateLine(INITIAL_WAIT, 3000)).toBe('✓ Claude done');
});
