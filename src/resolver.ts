// The one place that knows which implementations exist. The saved setup holds a
// choice (an id) per axis; this turns the choices into the implementations the
// core calls, and the core imports nothing concrete. A new implementation is
// registered here and offered in `STRATEGY_AXES` (setup.ts), which refuses what
// is not registered.

import { localActivityLog } from './activities'
import { localStore } from './content/local-store'
import { socratic } from './correction/socratic'
import { pimsleur } from './review/pimsleur'
import { DEFAULT_STRATEGIES } from './setup'
import { activityEntry, progressOf } from './storage'
import type { Entry, Whole } from './storage'
import type { ContentPack, CorrectionStyle, ContentStore, ActivityLog, ReviewAlgorithm, Strategies } from './strategies'
import type { LingoActivityLog, LingoProgress, LingoSetup, LingoStrategyChoices } from '../types'

/** What is registered, per axis, by the id the setup saves. */
export const REGISTRY = {
  correctionStyle: { [socratic.id]: socratic } as Readonly<Record<string, CorrectionStyle>>,
  reviewAlgorithm: { [pimsleur.id]: pimsleur } as Readonly<Record<string, ReviewAlgorithm>>,
  contentStore: { [localStore.id]: localStore } as Readonly<Record<string, ContentStore>>,
  activityLog: { [localActivityLog.id]: localActivityLog } as Readonly<Record<string, ActivityLog>>,
}

/** The implementations for the saved choices; null when a choice is not built. */
export function resolveStrategies(choices: LingoStrategyChoices): Strategies | null {
  const correctionStyle = REGISTRY.correctionStyle[choices.correctionStyle]
  const reviewAlgorithm = REGISTRY.reviewAlgorithm[choices.reviewAlgorithm]
  const contentStore = REGISTRY.contentStore[choices.contentStore]
  const activityLog = REGISTRY.activityLog[choices.activityLog]
  if (correctionStyle === undefined || reviewAlgorithm === undefined || contentStore === undefined || activityLog === undefined) {
    return null
  }
  return { correctionStyle, reviewAlgorithm, contentStore, activityLog }
}

/**
 * What is in force for a learner: the implementations, the pack of their language pair, and
 * where the activity log and the pack's progress live in the store.
 */
export type ActiveStrategies = Strategies & {
  pack: ContentPack
  activityEntry: Whole<LingoActivityLog>
  progressEntry: Entry<LingoProgress>
}

// Setup validation refuses a choice that is not built, so a saved setup always resolves, and
// the tests keep the catalogue and this registry equal. The fallback below is for a setup that
// is not there yet (and, should the two ever drift, one that names something unregistered).
const DEFAULTS =
  resolveStrategies(DEFAULT_STRATEGIES) ??
  (() => {
    throw new Error('the default strategies are not registered')
  })()

/** The strategies in force: the saved setup's, or the defaults while the setup is pending. */
export function strategiesFor(setup: LingoSetup | null): ActiveStrategies {
  const strategies = (setup === null ? null : resolveStrategies(setup.strategies)) ?? DEFAULTS
  const pair = setup === null ? { target: '', native: '' } : { target: setup.targetLanguage, native: setup.nativeLanguage }
  const pack = strategies.contentStore.pack(pair)
  return {
    ...strategies,
    pack,
    activityEntry: activityEntry(strategies.activityLog),
    progressEntry: progressOf(pack.cards.map(c => c.id)),
  }
}
