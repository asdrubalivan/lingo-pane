
import { DEMO_CARDS, DEMO_LESSON_COUNT } from '../src/content/demo-english-a1'
import { socratic } from '../src/correction/socratic'
import { LABELS } from '../src/labels'
import {
  IDLE_PRACTICE,
  advanceLesson,
  afterAnswer,
  buildQueue,
  isCorrectAnswer,
  isFinished,
  leaksAnswer,
  nextCard,
  recordAttempt,
  reveal,
  startPractice,
  tutorPrompt,
} from '../src/lesson'
import type { LessonQueue } from '../src/lesson'
import { dueMistakes, mistakeAsCard, recordMistakeReview } from '../src/mistakes'
import { MISTAKES, load, modify } from '../src/storage'
import { nextUnit } from '../src/activities'
import { parseHelp } from '../src/tutor'
import type { LingoLesson, LingoPractice, LingoSetup, LingoTutorState } from '../types'
import { focusKey, loadPaneValues, nowIso, refreshPaneData, touch } from './engine'
import type { Engine } from './engine'
import { NO_PANE_VALUES, PACK_PROGRESS } from './state'
import type { PaneValues } from './state'
import { whyNothing } from './tutor-call'

// The review: the built-in pack's Pimsleur queue and the learner's own mistakes,
// card by card. These are the steps the review screen's buttons and field take.

// The review's tutor hint (the flashcard practice kept from the first lesson).
const HINT_TIMEOUT_MS = 20000

// The review: the mistakes due at the next unit first, then the built-in pack's Pimsleur lesson.
export function reviewQueueOf(data: PaneValues, now: Date): LessonQueue {
  const due = dueMistakes(data.mistakes, nextUnit(data.log)).map(c => c.id)
  const pack = isFinished(data.progress, DEMO_LESSON_COUNT)
    ? { recall: [], fresh: [] }
    : buildQueue(DEMO_CARDS, data.progress, now)
  return { recall: [...due, ...pack.recall], fresh: pack.fresh }
}

// From the store, for a handler that is about to start a session. The pane draws it from the mirror.
export async function reviewQueue(engine: Engine): Promise<LessonQueue> {
  return reviewQueueOf((await loadPaneValues(engine)) ?? NO_PANE_VALUES, new Date(await engine.clock.now()))
}

// The cards of a review as the pane drew them: the learner's mistakes, else the built-in pack.
// A snapshot of the mirror the screen read, so a press acts on what the learner saw.
export function cardLookup(mistakes: PaneValues['mistakes']) {
  const mistakeOf = (id: string | undefined) => mistakes.cards.find(c => c.id === id)
  const cardOf = (id: string | undefined) => {
    const mistake = mistakeOf(id)
    return mistake === undefined ? DEMO_CARDS.find(c => c.id === id) : mistakeAsCard(mistake)
  }
  return { mistakeOf, cardOf }
}
export type CardLookup = ReturnType<typeof cardLookup>

// The review: the built-in pack's Pimsleur queue, started at once (zero clicks).
export async function startReview(engine: Engine) {
  await engine.lesson.update((l): LingoLesson => ({ ...l, activity: 'review', isMenuOpen: false }))
  if (isReviewRunning(await engine.practice.read())) return
  const queue = await reviewQueue(engine)
  if (queue.recall.length + queue.fresh.length === 0) return
  const latest = await load(engine.store, PACK_PROGRESS)
  await engine.practice.update(() => startPractice(queue, latest.currentLesson))
  await focusKey(engine, 'answer-0')
}

// Whether a review is under way: started and not done.
export function isReviewRunning(session: LingoPractice): boolean {
  return session.lesson !== null && session.status !== 'done'
}

// The review's start button.
export async function beginReview(engine: Engine) {
  await touch(engine)
  const latest = await load(engine.store, PACK_PROGRESS)
  const queue = await reviewQueue(engine)
  await engine.practice.update(() => startPractice(queue, latest.currentLesson))
  await focusKey(engine, 'answer-0')
}

// Every attempt is recorded: a mistake card's in the mistakes, a pack card's in the progress.
async function record(engine: Engine, lookup: CardLookup, cardId: string, isCorrect: boolean) {
  const at = await nowIso(engine)
  const saved =
    lookup.mistakeOf(cardId) !== undefined
      ? await modify(engine.store, MISTAKES, latest => recordMistakeReview(latest, cardId, at, isCorrect))
      : await modify(engine.store, PACK_PROGRESS, latest => recordAttempt(latest, cardId, at, isCorrect))
  if (saved === null) engine.ui.toast(`${LABELS.modName}: ${LABELS.progressNotSaved}`)
  await refreshPaneData(engine)
}

async function showAnswer(engine: Engine, lookup: CardLookup) {
  const latest = await engine.practice.read()
  const current = lookup.cardOf(latest.queue[latest.index])
  if (latest.status !== 'asking' || current === undefined) return
  // Giving up on a card never tried counts as a miss.
  if (latest.misses === 0) await record(engine, lookup, current.id, false)
  await engine.practice.update(s => reveal(s))
  await focusKey(engine, 'next')
}

// The answer typed in the review's field; an empty Enter shows the answer (a miss).
export async function submitAnswer(engine: Engine, lookup: CardLookup, value: string) {
  await touch(engine)
  if (value.trim() === '') return showAnswer(engine, lookup)
  const latest = await engine.practice.read()
  const current = lookup.cardOf(latest.queue[latest.index])
  if (latest.status !== 'asking' || current === undefined) return
  const isCorrect = isCorrectAnswer(value, current.answer)
  await record(engine, lookup, current.id, isCorrect)
  await engine.practice.update(s => afterAnswer(s, isCorrect, current.answer, value.trim()))
  if (isCorrect) await focusKey(engine, 'next')
}

// The next card, or the end of the lesson being studied.
export async function advanceCard(engine: Engine) {
  await touch(engine)
  const latest = await engine.practice.read()
  if (latest.status !== 'correct' && latest.status !== 'revealed') return
  const advanced = nextCard(latest)
  if (advanced.status === 'done') {
    // Finishing the lesson being studied moves the learner on, once.
    const moved = await modify(engine.store, PACK_PROGRESS, stored =>
      latest.lesson === stored.currentLesson ? advanceLesson(stored, DEMO_LESSON_COUNT) : stored,
    )
    if (moved === null) engine.ui.toast(`${LABELS.modName}: ${LABELS.progressNotSaved}`)
    await refreshPaneData(engine)
  }
  await engine.practice.update(() => advanced)
  // The button that was pressed holds the ring: hand it to the new field.
  await focusKey(engine, advanced.status === 'asking' ? `answer-${advanced.index}` : 'continue')
}

// A scaffold from the tutor for the card on screen; never the answer.
export async function askTutorHint(engine: Engine, setup: LingoSetup, lookup: CardLookup) {
  await touch(engine)
  const latest = await engine.practice.read()
  const current = lookup.cardOf(latest.queue[latest.index])
  if (latest.status !== 'asking' || current === undefined || latest.tutor.kind === 'loading') return
  await engine.practice.update((s): LingoPractice => ({ ...s, tutor: { kind: 'loading' } }))

  const reply = await engine.model.complete({
    model: 'haiku',
    system: socratic.instruction({ targetLanguage: setup.targetLanguage, nativeLanguage: setup.nativeLanguage }),
    prompt: tutorPrompt(current, latest.lastAnswer ?? '(nothing yet)', setup.targetLanguage, setup.nativeLanguage),
    effort: 'low',
    maxTokens: 200,
    timeoutMs: HINT_TIMEOUT_MS,
  })

  // The learner may have moved on while the model thought: drop the reply.
  const after = await engine.practice.read()
  if (after.index !== latest.index || after.status !== 'asking') return
  const hint = reply.isAnswered ? parseHelp(reply.text) : null
  const tutor: LingoTutorState =
    hint === null
      ? { kind: 'unavailable', text: LABELS.hintUnavailable(whyNothing(reply)) }
      : leaksAnswer(hint, current.answer)
        ? { kind: 'unavailable', text: LABELS.hintLeaked }
        : { kind: 'answered', text: hint }
  await engine.practice.update(s => ({ ...s, tutor }))
}

// The end of a review: back to the start screen of the activity.
export async function leaveReview(engine: Engine) {
  await touch(engine)
  await engine.practice.update(() => IDLE_PRACTICE)
}
