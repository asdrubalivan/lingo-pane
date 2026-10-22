import { expect, test } from 'claude-code/testing'

import type { ModelApiError } from 'claude-code'

import { failureReason } from './failure'
import type { ModelFailure } from './failure'

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const apiError = (error: ModelApiError, status: number | null = null): ModelFailure => ({
  isAnswered: false,
  reason: 'api-error',
  status,
  error,
  usage: USAGE,
})

test('a plan or rate limit is named as such', () => {
  expect(failureReason(apiError('rate_limit', 429))).toMatch(/plan or rate limit/)
  expect(failureReason(apiError('billing_error', 402))).toMatch(/plan or rate limit/)
})

test('a service error says the service failed, with the status when there is one', () => {
  expect(failureReason(apiError('overloaded', 529))).toMatch(/service.*529/)
  expect(failureReason(apiError('server_error', 500))).toMatch(/service.*500/)
  expect(failureReason(apiError('unknown'))).toMatch(/service/)
  expect(failureReason(apiError('unknown'))).not.toMatch(/null|\(/)
})

test('a sign-in problem tells the learner to log in again', () => {
  expect(failureReason(apiError('authentication_failed', 401))).toMatch(/sign you in/)
})

test('an empty reply and an abort each have their own message', () => {
  const empty = failureReason({ isAnswered: false, reason: 'empty-reply', usage: USAGE })
  const aborted = failureReason({ isAnswered: false, reason: 'aborted', usage: USAGE })
  expect(empty).toMatch(/empty/)
  expect(aborted).toMatch(/cancelled|too long/)
  expect(new Set([empty, aborted, failureReason(apiError('rate_limit', 429)), failureReason(apiError('server_error', 500))]).size).toBe(4)
})
