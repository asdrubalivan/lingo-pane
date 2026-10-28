import { fieldRoom, needsEcho } from '../../src/draft'
import type { FieldShape } from '../../src/draft'
import { LABELS } from '../../src/labels'
import type { PaneContext } from './context'

type Shape = Omit<FieldShape, 'columns'>
type Look = { color?: string; dim?: boolean }

// The field shows one row and cuts what does not fit: the whole line, wrapped, under it. Drawn
// only while the line is longer than the field can show.
export function drawEcho({ ui, columns }: PaneContext, field: string, text: string, shape: Shape, look: Look = {}) {
  const { Text } = ui
  if (!needsEcho(text, fieldRoom({ ...shape, columns }))) return null
  return (
    <Text key={`echo-${field}`} color={look.color} dimColor={look.dim} wrap="wrap">
      <Text bold>{LABELS.typing}</Text>
      {text}
    </Text>
  )
}

// The echo of what is being typed in the field called `field`: the draft is kept for one field at a time.
export function drawTypedEcho(pane: PaneContext, field: string, shape: Shape, look: Look = {}) {
  return drawEcho(pane, field, pane.typed.field === field ? pane.typed.text : '', shape, look)
}
