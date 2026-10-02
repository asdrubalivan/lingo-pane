// The contextual mode (opt-in in the setup): short excerpts of the learner's
// own session, their last prompt and Claude's last reply, become topic ideas
// for the tutor. Off, nothing is kept. On, what is kept is cut short and
// anything that looks like a secret is redacted before it reaches `$.state`,
// and from there the tutor's model call. Pure.

import type { LingoWorkContext } from '../types'

export const MAX_PROMPT_EXCERPT = 300
export const MAX_ANSWER_EXCERPT = 500

export const NO_CONTEXT: LingoWorkContext = { prompt: null, answer: null }

// Things that look like credentials or personal data, replaced before keeping.
const REDACTIONS: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted key]'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]'],
  [/\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{8,}/g, '[redacted]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{8,}/g, '[redacted]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted]'],
  [/\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '[redacted]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  // A long unbroken run of key-like characters (a token, a hash).
  [/\b[A-Za-z0-9+/_=-]{32,}\b/g, '[redacted]'],
]

/** The text with what looks like a secret replaced, whitespace collapsed, and cut to `max`. */
export function excerpt(text: string, max: number): string | null {
  let clean = text
  for (const [pattern, replacement] of REDACTIONS) clean = clean.replace(pattern, replacement)
  clean = clean.replace(/\s+/g, ' ').trim()
  if (clean === '') return null
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** What the tutor reads of the session, or null when there is nothing. */
export function contextForTutor(context: LingoWorkContext): string | null {
  const parts = [
    context.prompt === null ? null : `The learner asked Claude: ${context.prompt}`,
    context.answer === null ? null : `Claude replied: ${context.answer}`,
  ].filter((p): p is string => p !== null)
  return parts.length === 0 ? null : parts.join('\n')
}
