// Role-play: which scenario comes next and how a made-up one is read back.
// Scenarios rotate through the fixed list for the learner's level; when the
// learner gave interests in the setup, every other role-play is one the tutor
// makes up from them (in the same call that opens it), marked as made up.
// Pure: hooks/register.tsx makes the call.

import { scenariosFor } from './content/roleplay-scenarios'
import type { RoleplayScenario } from './content/roleplay-scenarios'
import type { TutorContext } from './tutor'
import type { LingoLevel, LingoScenario } from '../types'

export type ScenarioPick = { kind: 'fixed'; scenario: LingoScenario } | { kind: 'generated' }

export const asScenario = (s: RoleplayScenario): LingoScenario => ({
  id: s.id,
  title: s.title,
  situation: s.situation,
  tutorRole: s.tutorRole,
  learnerRole: s.learnerRole,
})

/** The `done`-th role-play's setting: the fixed list in order, every other one made up when there are interests. */
export function pickScenario(level: LingoLevel, interests: readonly string[], done: number): ScenarioPick {
  const hasInterests = interests.length > 0
  if (hasInterests && done % 2 === 1) return { kind: 'generated' }
  const list = scenariosFor(level)
  const turn = hasInterests ? Math.floor(done / 2) : done
  const scenario = list[turn % Math.max(1, list.length)]
  return scenario === undefined ? { kind: 'generated' } : { kind: 'fixed', scenario: asScenario(scenario) }
}

/** The opening of a made-up role-play: the setting first, then the first line in role. */
export function generatedOpeningPrompt(ctx: TutorContext): string {
  return [
    `Make up a short role-play for a CEFR ${ctx.level} learner of ${ctx.targetLanguage}, set around one of their interests: ${ctx.interests.join(', ')}.`,
    'Give it in this exact format, then open it in your role with one short line and one question:',
    'SCENARIO: <title, a few words> :: <the situation, one sentence> :: <who you play> :: <who the learner plays>',
    'FIX: none',
    `TUTOR: <your opening line in ${ctx.targetLanguage}>`,
    'Write the SCENARIO line in English: it is shown in the interface.',
  ].join('\n')
}

/** The SCENARIO line of a made-up role-play, or null when it is not there or incomplete. */
export function parseScenario(text: string): LingoScenario | null {
  const line = text.split('\n').find(l => /^\s*\**\s*SCENARIO\s*\**\s*:/i.test(l))
  if (line === undefined) return null
  const parts = line
    .replace(/^\s*\**\s*SCENARIO\s*\**\s*:\s*\**\s*/i, '')
    .split('::')
    .map(p => p.trim())
  const [title, situation, tutorRole, learnerRole] = parts
  if (parts.length < 4 || [title, situation, tutorRole, learnerRole].some(p => p === undefined || p === '')) return null
  return { id: null, title: title!, situation: situation!, tutorRole: tutorRole!, learnerRole: learnerRole! }
}
