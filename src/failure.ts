// Why a model call came back without text, as one short sentence for the
// learner. Pure: `$.model.complete` never rejects, it resolves with a reason,
// and the callers in hooks/register.tsx pass that result here.

import type { ModelCompleteResult } from 'claude-code'

import { LABELS } from './labels'

/** The arms of `ModelCompleteResult` that carry a reason instead of text. */
export type ModelFailure = Extract<ModelCompleteResult, { isAnswered: false }>

/** The reason as a sentence; the callers append what the learner can do next. */
export function failureReason(failure: ModelFailure): string {
  if (failure.reason === 'empty-reply') return LABELS.failureEmpty
  if (failure.reason === 'aborted') return LABELS.failureAborted
  switch (failure.error) {
    case 'rate_limit':
    case 'billing_error':
      return LABELS.failureLimit
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
    case 'account_on_hold':
    case 'verification_required':
    case 'cloud_credential_error':
      return LABELS.failureSignIn
    default:
      return LABELS.failureService(failure.status)
  }
}
