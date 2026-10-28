import { fieldRoom, needsEcho } from '../../src/draft'
import type { FieldShape } from '../../src/draft'
import { LABELS } from '../../src/labels'
import type { LingoDraft } from '../../types'
import type { PaneContext } from './context'

type Look = { color?: string; dim?: boolean }

// What the learner has typed in the field called `field`: the draft is kept for one field at a time.
export const draftOf = (draft: LingoDraft, field: string) => (draft.field === field ? draft.text : '')

// The field shows one row and cuts what does not fit: the whole line, wrapped, under it. Drawn
// only while the line is longer than the field can show.
export function drawEcho(
  { ui, columns }: Pick<PaneContext, 'ui' | 'columns'>,
  field: string,
  text: string,
  shape: Omit<FieldShape, 'columns'>,
  look: Look = {},
) {
  const { Text } = ui
  if (!needsEcho(text, fieldRoom({ ...shape, columns }))) return null
  return (
    <Text key={`echo-${field}`} color={look.color} dimColor={look.dim} wrap="wrap">
      <Text bold>{LABELS.typing}</Text>
      {text}
    </Text>
  )
}
