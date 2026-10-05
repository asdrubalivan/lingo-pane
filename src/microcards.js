// Provisional micro-lesson content: a short embedded list of English -> Spanish
// cards. The real source will be a ContentStore (see strategies.ts); until
// then nothing here pretends to cover other languages.
export const ENGLISH_TO_SPANISH = [
    { word: 'deadline', gloss: 'fecha límite' },
    { word: 'workaround', gloss: 'solución provisional' },
    { word: 'reliable', gloss: 'confiable' },
    { word: 'to figure out', gloss: 'averiguar, descifrar' },
    { word: 'to look into', gloss: 'investigar, revisar' },
    { word: 'to roll back', gloss: 'revertir' },
    { word: 'to rely on', gloss: 'depender de, confiar en' },
    { word: 'to carry out', gloss: 'llevar a cabo' },
];
const ENGLISH = ['english', 'inglés', 'ingles'];
const SPANISH = ['spanish', 'español', 'espanol'];
const normalize = (language) => language.trim().toLowerCase();
/**
 * The cards for a language pair, or the reason there are none. Only the pair
 * the embedded list really covers is answered; nothing is translated on the fly.
 */
export function cardsFor(target, native) {
    if (!ENGLISH.includes(normalize(target))) {
        return { kind: 'unsupported', message: `no built-in cards for ${target.trim()} yet` };
    }
    if (!SPANISH.includes(normalize(native))) {
        return { kind: 'unsupported', message: `no built-in cards explained in ${native.trim()} yet` };
    }
    return { kind: 'cards', cards: ENGLISH_TO_SPANISH };
}
/** A stable index in [0, count) from a seed (FNV-1a), so one turn keeps one card. */
export function pickIndex(seed, count) {
    if (count <= 0)
        return 0;
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % count;
}
/** The one line a turn shows: a card's word and gloss, or the "no cards" note. */
export function microLesson(target, native, turnId) {
    const found = cardsFor(target, native);
    if (found.kind === 'unsupported')
        return found.message;
    const card = found.cards[pickIndex(turnId, found.cards.length)];
    return card === undefined ? '' : `${card.word} = ${card.gloss}`;
}
/**
 * The Spinner `suffix` carrying the lesson. The engine draws a rewritten
 * suffix as given, so the ellipsis it would have drawn is kept in front.
 */
export function spinnerSuffix(lesson) {
    return lesson === '' ? '…' : `… · ${lesson}`;
}
