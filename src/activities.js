// The split's activities: which exist, which one the tutor suggests next (it
// rotates, favouring the one done least recently, and never suggests review),
// the log of finished micro-units kept in `$.store`, and the level hint (the
// tutor suggests moving up or down; it never changes the level by itself).
// Pure: hooks/register.tsx reads and writes the store.
import { LEVELS } from './setup';
export const ACTIVITY_STORE_KEY = 'activity';
export const ACTIVITY_LOG_VERSION = 1;
/** Finished units the log keeps. */
export const MAX_RECENT = 20;
/** Talk units the level hint looks back on. */
export const LEVEL_WINDOW = 5;
/** The `switch ▸` menu, in order (digits 1-4). */
export const ACTIVITIES = [
    { id: 'conversation', label: 'conversation' },
    { id: 'roleplay', label: 'role-play' },
    { id: 'reading', label: 'reading' },
    { id: 'review', label: 'review' },
];
/** What the tutor rotates through. */
export const SUGGESTED = ['conversation', 'roleplay', 'reading'];
export const activityLabel = (activity) => ACTIVITIES.find(a => a.id === activity)?.label ?? activity;
export const FRESH_LOG = { version: ACTIVITY_LOG_VERSION, units: 0, lastDoneAt: {}, done: {}, recent: [] };
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isActivity = (value) => ACTIVITIES.some(a => a.id === value);
const isCount = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
/** Whatever `$.store` held under `activity`; a fresh log when it is not one. */
export function parseActivityLog(raw) {
    if (!isObject(raw) || raw.version !== ACTIVITY_LOG_VERSION || !isCount(raw.units))
        return FRESH_LOG;
    const lastDoneAt = {};
    if (isObject(raw.lastDoneAt)) {
        for (const [activity, at] of Object.entries(raw.lastDoneAt)) {
            if (isActivity(activity) && typeof at === 'string')
                lastDoneAt[activity] = at;
        }
    }
    const done = {};
    if (isObject(raw.done)) {
        for (const [activity, count] of Object.entries(raw.done)) {
            if (isActivity(activity) && isCount(count))
                done[activity] = count;
        }
    }
    const recent = (Array.isArray(raw.recent) ? raw.recent : [])
        .filter(isObject)
        .filter(r => isActivity(r.activity) && typeof r.at === 'string' && isCount(r.sentences) && isCount(r.corrections))
        .map(r => ({
        activity: r.activity,
        at: r.at,
        sentences: r.sentences,
        corrections: r.corrections,
    }))
        .slice(-MAX_RECENT);
    return { version: ACTIVITY_LOG_VERSION, units: raw.units, lastDoneAt, done, recent };
}
/** A finished unit: counted, dated, and kept among the recent ones. */
export function recordUnit(log, activity, summary, at) {
    return {
        ...log,
        units: log.units + 1,
        lastDoneAt: { ...log.lastDoneAt, [activity]: at },
        done: { ...log.done, [activity]: (log.done[activity] ?? 0) + 1 },
        recent: [...log.recent, { activity, at, ...summary }].slice(-MAX_RECENT),
    };
}
/** The activity the split opens into: never done first, else the one done least recently. */
export function suggestActivity(log, available) {
    const candidates = SUGGESTED.filter(a => available.includes(a));
    const never = candidates.find(a => log.lastDoneAt[a] === undefined);
    if (never !== undefined)
        return never;
    const sorted = [...candidates].sort((a, b) => (log.lastDoneAt[a] ?? '').localeCompare(log.lastDoneAt[b] ?? ''));
    return sorted[0] ?? 'conversation';
}
/**
 * After enough talk: no mistakes at all suggests the next level; most lines
 * corrected suggests the one below. Only ever a suggestion.
 */
export function levelHint(log, level) {
    const talk = log.recent.filter(r => r.activity === 'conversation' || r.activity === 'roleplay').slice(-LEVEL_WINDOW);
    if (talk.length < LEVEL_WINDOW)
        return null;
    const sentences = talk.reduce((n, r) => n + r.sentences, 0);
    const corrections = talk.reduce((n, r) => n + r.corrections, 0);
    const index = LEVELS.indexOf(level);
    const above = LEVELS[index + 1];
    const below = LEVELS[index - 1];
    if (corrections === 0 && above !== undefined)
        return { direction: 'up', level: above };
    if (sentences > 0 && corrections / sentences >= 0.6 && below !== undefined)
        return { direction: 'down', level: below };
    return null;
}
