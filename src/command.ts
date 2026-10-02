// What `/lingo` was asked to do, parsed from the text after the command name.
// Pure: hooks/register.tsx turns the result into panes and answers.

export type LingoSubcommand =
  | { kind: 'open' }
  | { kind: 'setup' }
  | { kind: 'unknown'; name: string }

/** The subcommands that exist, as `[name, what it does]`, for the help text. */
export const SUBCOMMANDS: readonly (readonly [string, string])[] = [
  ['(none)', 'open or close the lesson pane'],
  ['setup', 'open the guided setup (languages, level, strategies)'],
]

/**
 * `args` is everything after `/lingo` as typed ("" when nothing). Only the
 * first word counts, case-insensitively; words after a known subcommand are
 * ignored rather than refused.
 */
export function parseLingoArgs(args: string): LingoSubcommand {
  const first = args.trim().split(/\s+/)[0] ?? ''
  if (first === '') return { kind: 'open' }
  const name = first.toLowerCase()
  if (name === 'setup') return { kind: 'setup' }
  return { kind: 'unknown', name: first }
}

/** The answer to a subcommand that does not exist: lists the ones that do. */
export function unknownSubcommandText(name: string): string {
  const lines = SUBCOMMANDS.map(([sub, what]) => `  /lingo ${sub === '(none)' ? '' : sub}`.trimEnd() + `  ${what}`)
  return [`lingo-pane: unknown subcommand "${name}". Available:`, ...lines].join('\n')
}
