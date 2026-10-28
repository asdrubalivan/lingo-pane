// The contextual mode (opt-in in the setup): short excerpts of the learner's
// own session, their last prompt and Claude's last reply, become topic ideas
// for the tutor. Off, nothing is kept. On, what is kept is cut short and
// anything that looks like a secret is redacted, and the text is neutralised
// (it can come from a web page or a file, so it is untrusted), before it
// reaches `$.state` and from there the tutor's model call. Pure.

import { neutralizeProtocolMarkers } from './sanitize'
import type { LingoWorkContext } from '../types'

/** What the prompts put around the excerpt; the excerpt itself can never hold it. */
export const EXCERPT_DELIMITER = '"""'

export const MAX_PROMPT_EXCERPT = 300
export const MAX_ANSWER_EXCERPT = 500

export const NO_CONTEXT: LingoWorkContext = { prompt: null, answer: null }

// Things that look like credentials or personal data, replaced before keeping.
const REDACTIONS: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted key]'],
  // Credentials inside a URL (`user:pass@host`, `token@host`) go before the email pattern.
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[redacted]@'],
  [/\bBearer\s+[\w.~+/=-]{8,}/gi, 'Bearer [redacted]'],
  // A JWT (its header starts `eyJ`), or any token of three or more long dotted parts.
  [/\beyJ[\w-]{5,}\.[\w-]{2,}\.[\w-]*|\b[\w-]{16,}(?:\.[\w-]{16,}){2,}/g, '[redacted]'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]'],
  [/\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{8,}/g, '[redacted]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{8,}/g, '[redacted]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted]'],
  [/\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '[redacted]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  // A long unbroken run of key-like characters (a token, a hash), padding `=` included, but not a rule of `-` or `=`.
  [/(?<![A-Za-z0-9+/_=-])(?=[=_-]*[A-Za-z0-9+/])[A-Za-z0-9+/_=-]{32,}(?![A-Za-z0-9+/_=-])/g, '[redacted]'],
]

// Any run of the delimiter's character that long or longer, whatever follows it.
const DELIMITER_RUN = new RegExp(`${EXCERPT_DELIMITER.charAt(0)}{${EXCERPT_DELIMITER.length},}`, 'g')

/**
 * The text with what looks like a secret replaced, the prompt delimiter and the
 * labels that can forge a correction or a scenario (`FIX:`, `TUTOR:`,
 * `SCENARIO:`) defused so it can neither close its block nor forge a reply,
 * whitespace collapsed, and cut to `max`.
 */
export function excerpt(text: string, max: number): string | null {
  let clean = text
  for (const [pattern, replacement] of REDACTIONS) clean = clean.replace(pattern, replacement)
  clean = neutralizeProtocolMarkers(clean.replace(DELIMITER_RUN, EXCERPT_DELIMITER.charAt(0)))
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
