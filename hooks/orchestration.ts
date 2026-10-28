
import {
  UNIT_REPLIES,
  askedForHelp,
  newUnit,
  summaryText,
  withHelp,
  withLearnerLine,
  withTutorTurn,
  withoutTutor,
} from '../src/conversation'
import { LABELS } from '../src/labels'
import { MAX_WOVEN, dueMistakes, isFormCard } from '../src/mistakes'
import { READING_MAX_TOKENS, answerReading, parseReading, readingPrompt, readingSystem, showReadingAnswer } from '../src/reading'
import { strategiesFor } from '../src/resolver'
import { generatedOpeningPrompt, parseScenario, pickScenario } from '../src/roleplay'
import { MISTAKES, commitUnit, keepMistakes, load } from '../src/storage'
import type { FinishedUnit, UnitMistakes } from '../src/storage'
import { helpPrompt, openingPrompt, parseHelp, parseTutorTurn, replyPrompt, tutorSystem } from '../src/tutor'
import { isClaudeWorking, isKeptOpen } from '../src/wait-machine'
import type { LingoActivity, LingoLesson, LingoReading, LingoSetup, LingoUnit, LingoUnitSummary } from '../types'
import { activeStrategies, closeSplit, focusKey, nowIso, refreshPaneData } from './engine'
import type { Engine } from './engine'
import { isReviewRunning, startReview } from './review-session'
import { AVAILABLE_ACTIVITIES } from './state'
import { callTutor, sessionMaterial, tutorContext, whyNothing } from './tutor-call'

// The async steps of a lesson: open a unit, reply, ask for help, answer a
// question, finish. Each takes the engine and the validated setup; none draws.

// A change to the unit on screen, only if it is still the same unit.
async function updateUnit(engine: Engine, id: string, change: (unit: LingoUnit) => LingoUnit) {
  await engine.lesson.update(l => (l.unit === null || l.unit.id !== id ? l : { ...l, unit: change(l.unit) }))
}

// A new micro-unit of conversation or role-play: the tutor opens it. A role-play
// takes the next scenario of the learner's level, or one the tutor makes up from
// their interests in the same call.
async function openTalkUnit(engine: Engine, setup: LingoSetup, activity: LingoUnit['activity']) {
  // The tutor weaves in a couple of the mistakes due at this unit.
  const strategies = strategiesFor(setup)
  const log = await load(engine.store, strategies.activityEntry)
  const due = dueMistakes(await load(engine.store, MISTAKES), strategies.activityLog.nextUnit(log), strategies.reviewAlgorithm).filter(isFormCard)
  const woven = due.slice(0, MAX_WOVEN).map(c => ({ id: c.id, wrong: c.wrong, right: c.right }))
  const pick = activity === 'roleplay' ? pickScenario(setup.level, setup.interests, log.done.roleplay ?? 0) : null
  const scenario = pick?.kind === 'fixed' ? pick.scenario : null
  const unit = newUnit(`${activity}-${await engine.clock.now()}`, activity, scenario, woven)
  await engine.lesson.update(l => ({ ...l, activity, unit, isMenuOpen: false }))
  await focusKey(engine, 'reply')
  const ctx = tutorContext(setup, unit, await sessionMaterial(engine, setup))
  const isMadeUp = pick?.kind === 'generated'
  const reply = await callTutor(engine, setup, tutorSystem(ctx), isMadeUp ? generatedOpeningPrompt(ctx) : openingPrompt(ctx))
  const turn = reply.isAnswered ? parseTutorTurn(reply.text) : null
  const madeUp = isMadeUp && reply.isAnswered ? parseScenario(reply.text) : null
  await updateUnit(engine, unit.id, u => {
    if (u.pending !== 'opening') return u
    const opened = turn === null ? withoutTutor(u, LABELS.tutorSilentOpening(whyNothing(reply))) : withTutorTurn(u, turn)
    return madeUp === null ? opened : { ...opened, scenario: madeUp }
  })
}

// A reading: the tutor writes a short text at the learner's level and 2-3 questions.
async function openReading(engine: Engine, setup: LingoSetup) {
  const id = `reading-${await engine.clock.now()}`
  const waiting: LingoReading = {
    id,
    title: '',
    text: '',
    questions: [],
    index: 0,
    misses: 0,
    isPending: true,
    notice: null,
    summary: null,
  }
  await engine.lesson.update((l): LingoLesson => ({ ...l, activity: 'reading', reading: waiting, isMenuOpen: false }))
  const ctx = tutorContext(setup, null, await sessionMaterial(engine, setup))
  const reply = await callTutor(engine, setup, readingSystem(ctx), readingPrompt(ctx), READING_MAX_TOKENS)
  const written = reply.isAnswered ? parseReading(id, reply.text) : null
  await engine.lesson.update((l): LingoLesson =>
    l.reading === null || l.reading.id !== id
      ? l
      : { ...l, reading: written ?? { ...l.reading, isPending: false, notice: LABELS.readingSilent(whyNothing(reply)) } },
  )
  if (written !== null) await focusKey(engine, 'reading-answer')
}

// The learner's answer to the question on screen; an empty Enter shows it and makes it a card.
export async function answerQuestion(engine: Engine, value: string) {
  const before = (await engine.lesson.read()).reading
  const question = before?.questions[before.index]
  if (before === null || question === undefined || before.summary !== null || before.isPending) return
  const isShown = value.trim() === ''
  const after = isShown ? showReadingAnswer(before) : answerReading(before, value)
  await engine.lesson.update((l): LingoLesson => (l.reading?.id === before.id ? { ...l, reading: after } : l))
  if (isShown) {
    const card = { wrong: '', right: question.answer, note: before.title, sentence: question.question }
    await keepCards(engine, { corrections: [card], woven: [], lines: [] })
    await refreshPaneData(engine)
  }
  // Its cards were kept as the answers were shown: only the log is left to record.
  if (after.summary !== null) {
    await finishActivity(engine, { id: after.id, activity: 'reading', summary: after.summary, corrections: [], woven: [], lines: [] })
  }
}

export async function startActivity(engine: Engine, setup: LingoSetup, activity: LingoActivity) {
  if (activity === 'review') return startReview(engine, strategiesFor(setup))
  if (activity === 'reading') return openReading(engine, setup)
  // A talk unit left half done for another one closes here: its mistakes are kept.
  const left = (await engine.lesson.read()).unit
  if (left !== null && left.summary === null) {
    await keepCards(engine, left)
    await refreshPaneData(engine)
  }
  return openTalkUnit(engine, setup, activity)
}

// The split opens straight into the unfinished activity, or into the suggested one.
export async function ensureLesson(engine: Engine, setup: LingoSetup) {
  const current = await engine.lesson.read()
  if (current.activity === 'review') {
    if (isReviewRunning(await engine.practice.read())) return
  } else if (current.activity === 'reading') {
    const reading = current.reading
    if (reading !== null && reading.summary === null && !(reading.isPending && reading.text === '')) return
  } else if (current.unit !== null && current.unit.summary === null) {
    // A call lost with a reload leaves the unit waiting forever: give it back.
    if (current.unit.pending !== null && current.unit.lines.length === 0) {
      return openTalkUnit(engine, setup, current.unit.activity)
    }
    return
  }
  const strategies = strategiesFor(setup)
  const log = await load(engine.store, strategies.activityEntry)
  return startActivity(engine, setup, strategies.activityLog.suggest(log, AVAILABLE_ACTIVITIES))
}

// The summary of the activity on screen when its unit is over; null while one runs.
export function finishedSummary(current: LingoLesson): { activity: LingoActivity; summary: LingoUnitSummary } | null {
  if (current.activity === 'reading') {
    return current.reading?.summary == null ? null : { activity: 'reading', summary: current.reading.summary }
  }
  if (current.activity === 'review' || current.unit === null || current.unit.summary === null) return null
  return { activity: current.unit.activity, summary: current.unit.summary }
}

// The mistakes of a unit that is not logged, kept as cards; the learner is told when the store would not take them.
async function keepCards(engine: Engine, unit: UnitMistakes) {
  const { activityLog } = await activeStrategies(engine)
  if (!(await keepMistakes(engine.store, unit, await nowIso(engine), activityLog))) engine.ui.toast(`${LABELS.modName}: ${LABELS.cardsNotSaved}`)
}

// A finished unit of any activity: recorded once (log and mistakes together); with
// Claude idle, a split in use closes and says how it went, else the next activity is one press away.
// What the store would not take is marked on the unit's summary, so the toast, the pane and the
// toast when the turn ends all say so instead of claiming it was saved.
async function finishActivity(engine: Engine, unit: FinishedUnit) {
  const { activityLog } = await activeStrategies(engine)
  const committed = await commitUnit(engine.store, unit, await nowIso(engine), activityLog)
  await refreshPaneData(engine)
  // Already recorded (a repeated event): the learner has been told.
  if (committed !== null && !committed.isRecorded) return
  const notSaved = committed === null ? 'unit' : committed.areMistakesKept ? undefined : 'cards'
  const summary: LingoUnitSummary = notSaved === undefined ? unit.summary : { ...unit.summary, notSaved }
  if (notSaved !== undefined) await markNotSaved(engine, unit.id, summary)
  const state = await engine.wait.read()
  if (!isClaudeWorking(state) && isKeptOpen(state)) {
    await closeSplit(engine)
    engine.ui.toast(`${LABELS.modName}: ${summaryText(summary, unit.activity)}`)
    return
  }
  if (notSaved !== undefined) engine.ui.toast(`${LABELS.modName}: ${summaryText(summary, unit.activity)}`)
  await focusKey(engine, 'next-unit')
}

// The summary of the unit or reading on screen, with what the store would not take.
function markNotSaved(engine: Engine, id: string, summary: LingoUnitSummary) {
  return engine.lesson.update((l): LingoLesson => {
    if (l.unit?.id === id) return { ...l, unit: { ...l.unit, summary } }
    if (l.reading?.id === id) return { ...l, reading: { ...l.reading, summary } }
    return l
  })
}

// A finished talk unit: its mistakes become cards, numbered by it.
async function finishUnit(engine: Engine, unit: LingoUnit) {
  if (unit.summary === null) return
  await finishActivity(engine, { ...unit, summary: unit.summary })
}

// The learner's line: shown at once, then the tutor's answer.
export async function sendReply(engine: Engine, setup: LingoSetup, text: string) {
  const before = (await engine.lesson.read()).unit
  if (before === null) return
  const asked = withLearnerLine(before, text)
  if (asked === before) return
  await updateUnit(engine, before.id, () => asked)
  const ctx = tutorContext(setup, asked, await sessionMaterial(engine, setup))
  const reply = await callTutor(engine, setup, tutorSystem(ctx), replyPrompt(ctx, asked, asked.replies >= UNIT_REPLIES))
  const turn = reply.isAnswered ? parseTutorTurn(reply.text) : null
  await updateUnit(engine, before.id, u =>
    u.pending !== 'reply' ? u : turn === null ? withoutTutor(u, LABELS.tutorSilentReply(whyNothing(reply))) : withTutorTurn(u, turn),
  )
  const after = (await engine.lesson.read()).unit
  if (after !== null && after.id === before.id && after.summary !== null) await finishUnit(engine, after)
}

// An empty Enter: a scaffold, never the answer.
export async function sendHelp(engine: Engine, setup: LingoSetup) {
  const before = (await engine.lesson.read()).unit
  if (before === null) return
  const asked = askedForHelp(before)
  if (asked === before) return
  await updateUnit(engine, before.id, () => asked)
  const ctx = tutorContext(setup, asked, await sessionMaterial(engine, setup))
  const reply = await callTutor(engine, setup, tutorSystem(ctx), helpPrompt(ctx, asked))
  const text = reply.isAnswered ? parseHelp(reply.text) : null
  await updateUnit(engine, before.id, u => (u.pending !== 'help' ? u : text === null ? withoutTutor(u, LABELS.tutorSilentHelp(whyNothing(reply))) : withHelp(u, text)))
}
