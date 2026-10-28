import type { Elements } from 'claude-code'

import type { ActiveStrategies } from '../../src/resolver'
import type { ThemeColors } from '../../src/themes'
import type { LingoLesson, LingoSetup } from '../../types'
import type { Runtime } from '../runtime'
import type { Engine } from '../engine'

// The components every screen of the pane draws with, resolved once for the surface.
type Ui = Pick<Elements['terminal'], 'Box' | 'Button' | 'Input' | 'Link' | 'Text'>

// What the pane's screens share while one render goes on.
export type PaneContext = {
  engine: Engine
  rt: Runtime
  ui: Ui
  // Whether the keys are here (Esc hands them back and the split stays).
  isFocused: boolean
  // What sits on top of every screen: whether the keys are here and what Claude is doing.
  top: JSX.Element
}

// The lesson screens: a learner who is set up, the theme's colors, what is on screen.
export type LessonContext = PaneContext & {
  setup: LingoSetup
  // The implementations in force for this learner, and the pack of their language pair.
  strategies: ActiveStrategies
  theme: ThemeColors
  // The keys are elsewhere: the lesson dims.
  dim: boolean
  current: LingoLesson
  // The activity's tag under `top`, and the two buttons most screens end with.
  chip: JSX.Element
  nextButton: JSX.Element
  switchButton: JSX.Element
}
