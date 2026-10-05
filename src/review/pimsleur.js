// Pimsleur-style review, by lesson (not by date).
//
// When the learner starts lesson n, the recall block reviews the cards of
// lessons n-1, n-3 and n-7. Lessons below 1 do not exist and are skipped, and a
// lesson with no cards simply contributes nothing.
//
// Order (deterministic): most recent lesson first (n-1, then n-3, then n-7).
// Inside a lesson, cards whose LAST review was wrong go first, then the rest;
// ties are broken by card id. `progress` is used only for that: a card with no
// progress entry or no reviews counts as not failed. `ctx.now` is ignored,
// because lesson-based review does not depend on dates.
//
// Pure: no `$`, no I/O, does not mutate its inputs.
export const PIMSLEUR_OFFSETS = [1, 3, 7];
function failedLast(p) {
    const last = p?.reviews[p.reviews.length - 1];
    return last !== undefined && !last.isCorrect;
}
export function dueCards(cards, progress, ctx) {
    const failed = new Set(progress.filter(failedLast).map(p => p.cardId));
    const seen = new Set();
    const result = [];
    for (const offset of PIMSLEUR_OFFSETS) {
        const lesson = ctx.currentLesson - offset;
        if (lesson < 1)
            continue;
        const inLesson = cards
            .filter(c => c.lesson === lesson)
            .sort((a, b) => {
            const fa = failed.has(a.id) ? 0 : 1;
            const fb = failed.has(b.id) ? 0 : 1;
            return fa - fb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        });
        for (const card of inLesson) {
            if (seen.has(card.id))
                continue;
            seen.add(card.id);
            result.push(card);
        }
    }
    return result;
}
export const pimsleur = { id: 'pimsleur', dueCards };
