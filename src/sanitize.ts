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
