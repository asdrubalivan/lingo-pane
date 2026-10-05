// What `/lingo` was asked to do, parsed from the text after the command name.
// Pure: hooks/register.tsx turns the result into panes and answers.
import { THEMES, parseThemeName } from './themes';
/** The subcommands that exist, as `[name, what it does]`, for the help text. */
export const SUBCOMMANDS = [
    ['(none)', 'open or close the lesson pane'],
    ['setup', 'open the guided setup (languages, level, interests, strategies, look)'],
    ['theme <name>', `switch the color theme (${THEMES.map(t => t.name).join(', ')})`],
];
/**
 * `args` is everything after `/lingo` as typed ("" when nothing). Only the
 * first word counts, case-insensitively; words after a known subcommand are
 * ignored rather than refused, save the theme's name.
 */
export function parseLingoArgs(args) {
    const [first = '', second = ''] = args.trim().split(/\s+/);
    if (first === '')
        return { kind: 'open' };
    const name = first.toLowerCase();
    if (name === 'setup')
        return { kind: 'setup' };
    if (name === 'theme') {
        const theme = parseThemeName(second);
        return theme === null ? { kind: 'bad-theme', name: second } : { kind: 'theme', theme };
    }
    return { kind: 'unknown', name: first };
}
/** The answer to a subcommand that does not exist: lists the ones that do. */
export function unknownSubcommandText(name) {
    const lines = SUBCOMMANDS.map(([sub, what]) => `  /lingo ${sub === '(none)' ? '' : sub}`.trimEnd() + `  ${what}`);
    return [`lingo-pane: unknown subcommand "${name}". Available:`, ...lines].join('\n');
}
/** The answer to `/lingo theme` without a known name: the themes that exist. */
export function badThemeText(name) {
    const list = THEMES.map(t => `${t.name} (${t.label})`).join(', ');
    return name === ''
        ? `lingo-pane: name a theme: /lingo theme <name>. Themes: ${list}.`
        : `lingo-pane: there is no theme "${name}". Themes: ${list}.`;
}
