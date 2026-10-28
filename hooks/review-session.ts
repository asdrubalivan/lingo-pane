
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
import type { ActiveStrategies } from '../src/resolver'
import { MISTAKES, load, modify } from '../src/storage'
import { parseHelp } from '../src/tutor'
import type { LingoLesson, LingoPractice, LingoSetup, LingoTutorState } from '../types'
import { focusKey, loadPaneValues, nowIso, refreshPaneData, touch } from './engine'
import type { Engine } from './engine'
import { NO_PANE_VALUES } from './state'
import type { PaneValues } from './state'
import { whyNothing } from './tutor-call'

// The review: the mistakes due and the pack's lesson of the language pair (recalled by the
// review algorithm in force), card by card. These are the steps the review screen's buttons and field take.

// The review's tutor hint (the flashcard practice kept from the first lesson).
const HINT_TIMEOUT_MS = 20000

// The review: the mistakes due at the next unit first, then the pack's lesson.
export function reviewQueueOf(data: PaneValues, now: Date, strategies: ActiveStrategies): LessonQueue {
  const { activityLog, pack, reviewAlgorithm } = strategies
  const due = dueMistakes(data.mistakes, activityLog.nextUnit(data.log), reviewAlgorithm).map(c => c.id)
  const lessons = isFinished(data.progress, pack.lessonCount)
    ? { recall: [], fresh: [] }
    : buildQueue(pack.cards, data.progress, now, reviewAlgorithm)
  return { recall: [...due, ...lessons.recall], fresh: lessons.fresh }
}

// From the store, for a handler that is about to start a session. The pane draws it from the mirror.
async function reviewQueue(engine: Engine, strategies: ActiveStrategies): Promise<LessonQueue> {
  return reviewQueueOf((await loadPaneValues(engine, strategies)) ?? NO_PANE_VALUES, new Date(await engine.clock.now()), strategies)
}

// The cards of a review as the pane drew them: the learner's mistakes, else the pack's.
// A snapshot of the mirror the screen read, so a press acts on what the learner saw.
export function cardLookup(mistakes: PaneValues['mistakes'], strategies: ActiveStrategies) {
  const mistakeOf = (id: string | undefined) => mistakes.cards.find(c => c.id === id)
  const cardOf = (id: string | undefined) => {
    const mistake = mistakeOf(id)
    return mistake === undefined ? strategies.pack.cards.find(c => c.id === id) : mistakeAsCard(mistake)
  }
  return { mistakeOf, cardOf, strategies }
}
export type CardLookup = ReturnType<typeof cardLookup>

// The review, started at once (zero clicks).
export async function startReview(engine: Engine, strategies: ActiveStrategies) {
  await engine.lesson.update((l): LingoLesson => ({ ...l, activity: 'review', isMenuOpen: false }))
  if (isReviewRunning(await engine.practice.read())) return
  const queue = await reviewQueue(engine, strategies)
  if (queue.recall.length + queue.fresh.length === 0) return
  const latest = await load(engine.store, strategies.progressEntry)
  await engine.practice.update(() => startPractice(queue, latest.currentLesson))
  await focusKey(engine, 'answer-0')
}

// Whether a review is under way: started and not done.
export function isReviewRunning(session: LingoPractice): boolean {
  return session.lesson !== null && session.status !== 'done'
}

// The review's start button.
export async function beginReview(engine: Engine, strategies: ActiveStrategies) {
  await touch(engine)
  const latest = await load(engine.store, strategies.progressEntry)
  const queue = await reviewQueue(engine, strategies)
  await engine.practice.update(() => startPractice(queue, latest.currentLesson))
  await focusKey(engine, 'answer-0')
}

// Every attempt is recorded: a mistake card's in the mistakes, a pack card's in the progress.
async function record(engine: Engine, lookup: CardLookup, cardId: string, isCorrect: boolean) {
  const at = await nowIso(engine)
  const saved =
    lookup.mistakeOf(cardId) !== undefined
      ? await modify(engine.store, MISTAKES, latest => recordMistakeReview(latest, cardId, at, isCorrect))
      : await modify(engine.store, lookup.strategies.progressEntry, latest => recordAttempt(latest, cardId, at, isCorrect))
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
export async function advanceCard(engine: Engine, strategies: ActiveStrategies) {
  await touch(engine)
  const latest = await engine.practice.read()
  if (latest.status !== 'correct' && latest.status !== 'revealed') return
  const advanced = nextCard(latest)
  if (advanced.status === 'done') {
    // Finishing the lesson being studied moves the learner on, once.
    const moved = await modify(engine.store, strategies.progressEntry, stored =>
      latest.lesson === stored.currentLesson ? advanceLesson(stored, strategies.pack.lessonCount) : stored,
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
    system: lookup.strategies.correctionStyle.instruction({ targetLanguage: setup.targetLanguage, nativeLanguage: setup.nativeLanguage }),
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
