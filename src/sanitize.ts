// What the model returns is drawn in the terminal and parts of it are stored
// and fed back into later prompts, so every parser passes it through here
// first: control characters and escape sequences out (line breaks kept), then
// a length cap. Pure.

/** A whole model reply is cut here before it is read; each field has a cap of its own. */
export const MAX_MODEL_REPLY = 6000

// Escape sequences, payload included, so a window title or a clipboard write
// leaves nothing behind. Introduced by ESC or by the single-byte C1 form.
const SEQUENCES = new RegExp(
  [
    // OSC (title, clipboard, hyperlinks): up to BEL or ST; an unterminated one stops at the line end.
    '(?:\\u001b\\]|\\u009d)[^\\u0007\\u001b\\u009c\\n]*(?:\\u0007|\\u001b\\\\|\\u009c)?',
    // DCS, SOS, PM and APC: up to ST.
    '(?:\\u001b[PX^_]|[\\u0090\\u0098\\u009e\\u009f])[^\\u001b\\u009c\\n]*(?:\\u001b\\\\|\\u009c)?',
    // CSI (colours, cursor, erase).
    '(?:\\u001b\\[|\\u009b)[0-?]*[ -/]*[@-~]?',
    // Any other escape: ESC, intermediates, one final character.
    '\\u001b[ -/]*[0-~]?',
  ].join('|'),
  'g',
)

// Whatever control character is left: C0 but the line break, DEL, and C1.
const CONTROLS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g

/**
 * The model's text without control characters or escape sequences, cut to
 * `max`. Line breaks stay (a carriage return counts as one) and a tab becomes
 * a space. The text is not trimmed.
 */
export function sanitizeModelText(text: string, max: number): string {
  const clean = text
    .replace(SEQUENCES, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROLS, '')
  if (clean.length <= max) return clean
  // Never end on half of a surrogate pair.
  const cut = /[\ud800-\udbff]/.test(clean.charAt(max - 1)) ? max - 1 : max
  return clean.slice(0, cut)
}

// The labels of the reply formats the mod asks the model for (the tutor turn,
// the made-up scenario, the reading), alone or in bold: `FIX:`, `**TUTOR**:`.
const LABELS = String.raw`FIX|TUTOR|SCENARIO|TITLE|TEXT|Q\d`
// The ones that can forge something that is kept or acted on: a correction (`FIX`,
// `TUTOR`) or a scenario. The reading's (`TITLE`, `TEXT`, `Q1`) are everyday words
// in code and prose; a forged one can shape a reading, whose text is sanitised and
// capped but not checked the way a correction is (docs/decisions.md, Step 5).
const FORGEABLE = String.raw`FIX|TUTOR|SCENARIO`
const MARKER = new RegExp(String.raw`\b(?:${LABELS})\s*\**\s*:`, 'i')
// In capitals only, as the mod's own formats are written: `fix:` and `Fix:` are everyday words (commit
// messages, changelogs). The parsers read any case, so this lowers the risk and does not close it: what
// stops a forged correction is `validCorrection`, and that the excerpt is quoted on one line.
const FORGEABLE_MARKERS = new RegExp(String.raw`\b(${FORGEABLE})\s*\**\s*:`, 'g')

/** The text holds something a reply-format parser would read as a label. */
export const hasProtocolMarker = (text: string): boolean => MARKER.test(text)

/** The text with the labels that can forge a correction or a scenario defused (`FIX:` becomes `FIX -`), so quoting it cannot forge a reply. */
export const neutralizeProtocolMarkers = (text: string): string => text.replace(FORGEABLE_MARKERS, '$1 -')
