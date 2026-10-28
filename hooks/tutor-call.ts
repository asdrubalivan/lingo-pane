
import { contextForTutor } from '../src/context'
import { failureReason } from '../src/failure'
import { LABELS } from '../src/labels'
import { TUTOR_MAX_TOKENS, TUTOR_TIMEOUT_MS } from '../src/tutor'
import type { TutorContext } from '../src/tutor'
import type { LingoSetup, LingoUnit } from '../types'
import type { Engine } from './engine'

// What the tutor may read of the learner's session: only with the opt-in.
export async function sessionMaterial(engine: Engine, setup: LingoSetup): Promise<string | null> {
  return setup.isContextual ? contextForTutor(await engine.workContext.read()) : null
}

// What the tutor knows about this learner and this unit.
export function tutorContext(setup: LingoSetup, unit: LingoUnit | null, material: string | null = null): TutorContext {
  return {
    targetLanguage: setup.targetLanguage,
    nativeLanguage: setup.nativeLanguage,
    level: setup.level,
    interests: setup.interests,
    activity: unit?.activity ?? 'conversation',
    scenario: unit?.scenario ?? null,
    weave: unit?.woven ?? [],
    workContext: material,
  }
}

// One call on the learner's own plan, with the model chosen in the setup. The
// platform's result comes back whole: when there is no text, it says why.
export async function callTutor(engine: Engine, setup: LingoSetup, system: string, prompt: string, maxTokens = TUTOR_MAX_TOKENS) {
  return engine.model.complete({
    model: setup.tutorModel,
    system,
    prompt,
    effort: 'low',
    maxTokens,
    timeoutMs: TUTOR_TIMEOUT_MS,
  })
}

// Why a reply gave nothing to use: the platform's reason, or an answer the parser refused.
export function whyNothing(reply: Awaited<ReturnType<typeof callTutor>>): string {
  return reply.isAnswered ? LABELS.failureUnreadable : failureReason(reply)
}
