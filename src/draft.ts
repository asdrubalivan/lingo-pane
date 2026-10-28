// The echo of what the learner is typing. The engine's text field is one row with no wrapping
// and no scroll: past its width it cuts the text, so a long line cannot be checked before it is
// sent. The pane draws a copy of the draft, wrapped, under the field once the line no longer
// fits. Pure: the screens ask here whether the line fits and draw the echo themselves.

/** What the draft holds when nothing is being typed. */
export const NO_DRAFT = { field: '', text: '' }

/** The columns a bordered field spends on its round border and its padding. */
const BOX_COLUMNS = 4
/** The gap and the `⏎ ` the engine draws before the submit label while the field has focus. */
const SUBMIT_COLUMNS = 3
/** The cursor, and a few columns of slack for the scrollbar and for the label's own spacing. */
const SLACK_COLUMNS = 5

/** Terminal columns a character takes: East Asian wide and fullwidth forms take two. */
function columnsOf(char: string): number {
  const code = char.codePointAt(0) ?? 0
  const isWide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  return isWide ? 2 : 1
}

/** The terminal columns a text takes on one row. */
export function textColumns(text: string): number {
  let total = 0
  for (const char of text) total += columnsOf(char)
  return total
}

export type FieldShape = {
  /** The pane's body width, as the render event gives it. */
  columns: number
  /** Text drawn before the field. */
  label?: string
  /** What Enter does, drawn beside the field while it has focus (the engine's default is `submit`). */
  submitLabel?: string
  /** Whether the field sits inside a round border (the reply and the answers do, the wizard's do not). */
  isBoxed: boolean
}

/** How many columns of typed text the field shows before it cuts the line. Never negative. */
export function fieldRoom({ columns, label = '', submitLabel = 'submit', isBoxed }: FieldShape): number {
  const taken = (isBoxed ? BOX_COLUMNS : 0) + SUBMIT_COLUMNS + textColumns(submitLabel) + textColumns(label) + SLACK_COLUMNS
  return Math.max(0, columns - taken)
}

/** Whether the line is longer than the field can show, so the field cuts it and the echo is due. */
export function needsEcho(text: string, room: number): boolean {
  return text !== '' && textColumns(text) > room
}
