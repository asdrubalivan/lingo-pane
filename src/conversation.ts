// A micro-unit of conversation or role-play as pure logic: the tutor opens,
// the learner replies, the tutor answers (pointing at a mistake if there is
// one), and after a few replies the unit closes with a summary. No `$`, no I/O;
// inputs are never mutated. hooks/register.tsx makes the model calls.

import type { LingoCorrection, LingoLesson, LingoScenario, LingoUnit, LingoUnitSummary } from '../types'

/** Learner replies per micro-unit (the design says 2-4 exchanges). */
export const UNIT_REPLIES = 3
/** A learner's line is cut here: the store and the prompt stay small. */
export const MAX_REPLY_LENGTH = 400
/** Lines a tutor reply may add to the screen. */
export const MAX_TUTOR_LENGTH = 600

export const IDLE_LESSON: LingoLesson = { activity: 'conversation', unit: null, isMenuOpen: false }

export function newUnit(
  id: string,
  activity: LingoUnit['activity'],
  scenario: LingoScenario | null = null,
  woven: LingoUnit['woven'] = [],
): LingoUnit {
  return {
    id,
    activity,
    lines: [],
    replies: 0,
    corrections: [],
    pending: 'opening',
    notice: null,
    summary: null,
    scenario,
    woven,
  }
}

/** The unit is waiting for the learner (not for the tutor, and not over). */
export const isAwaitingLearner = (unit: LingoUnit): boolean => unit.pending === null && unit.summary === null

/** The learner sent a line: it shows at once and the tutor is asked. Ignored while the tutor thinks. */
export function withLearnerLine(unit: LingoUnit, text: string): LingoUnit {
  const line = text.trim().slice(0, MAX_REPLY_LENGTH)
  if (line === '' || !isAwaitingLearner(unit)) return unit
  return {
    ...unit,
    lines: [...unit.lines, { who: 'you', text: line }],
    replies: unit.replies + 1,
    pending: 'reply',
    notice: null,
  }
}

/** An empty Enter: the learner asks for help. Ignored while the tutor thinks. */
export function askedForHelp(unit: LingoUnit): LingoUnit {
  return isAwaitingLearner(unit) ? { ...unit, pending: 'help', notice: null } : unit
}

export type TutorTurn = { tutor: string; fix: Omit<LingoCorrection, 'sentence'> | null }

/**
 * The tutor answered: its line, and the mistake it points at (the correction
 * is kept for the cards; on screen only the wrong words are marked, so the
 * learner can try again before seeing the right form). After the last reply
 * the unit closes.
 */
export function withTutorTurn(unit: LingoUnit, turn: TutorTurn): LingoUnit {
  const lastYou = [...unit.lines].reverse().find(l => l.who === 'you')
  const isReply = unit.pending === 'reply'
  const fix = isReply && turn.fix !== null && lastYou !== undefined ? { ...turn.fix, sentence: lastYou.text } : null
  const lines = [...unit.lines, { who: 'tutor' as const, text: turn.tutor.slice(0, MAX_TUTOR_LENGTH), mark: fix?.wrong ?? null }]
  const corrections = fix === null ? unit.corrections : [...unit.corrections, fix]
  const next: LingoUnit = { ...unit, lines, corrections, pending: null, notice: null }
  return isReply && unit.replies >= UNIT_REPLIES ? { ...next, summary: summarize(next) } : next
}

/** The scaffold for an empty Enter arrived. */
export function withHelp(unit: LingoUnit, text: string): LingoUnit {
  if (unit.pending !== 'help') return unit
  return { ...unit, lines: [...unit.lines, { who: 'help', text: text.slice(0, MAX_TUTOR_LENGTH) }], pending: null }
}

/**
 * The tutor did not answer. An unanswered opening or help leaves a note; an
 * unanswered reply takes the learner's line back (it is still theirs to resend).
 */
export function withoutTutor(unit: LingoUnit, notice: string): LingoUnit {
  if (unit.pending === 'reply') {
    const index = unit.lines.map(l => l.who).lastIndexOf('you')
    return {
      ...unit,
      lines: index === -1 ? unit.lines : unit.lines.filter((_, i) => i !== index),
      replies: Math.max(0, unit.replies - 1),
      pending: null,
      notice,
    }
  }
  return { ...unit, pending: null, notice }
}

export function summarize(unit: LingoUnit): LingoUnitSummary {
  return { sentences: unit.replies, corrections: unit.corrections.length }
}

/** `✓ 3 sentences, 1 correction saved`. */
export function summaryText(summary: LingoUnitSummary): string {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  return `✓ ${plural(summary.sentences, 'sentence')}, ${plural(summary.corrections, 'correction')} saved`
}

/**
 * The tutor's line split around the marked words, for drawing them in the
 * error color: `[["Try ", false], ["go", true], [" again.", false]]`.
 */
export function markedParts(text: string, mark: string | null): [string, boolean][] {
  if (mark === null || mark.trim() === '') return [[text, false]]
  const at = text.toLowerCase().indexOf(mark.toLowerCase())
  if (at === -1) return [[text, false]]
  const parts: [string, boolean][] = [
    [text.slice(0, at), false],
    [text.slice(at, at + mark.length), true],
    [text.slice(at + mark.length), false],
  ]
  return parts.filter(([part]) => part !== '')
}
