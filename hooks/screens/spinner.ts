import { microLesson, spinnerSuffix } from '../../src/microcards'
import type { Viewport } from '../../src/split'
import { isLessonVisible } from '../../src/wait-machine'
import { currentSetup } from '../engine'
import type { Engine } from '../engine'
import { noteViewport } from '../runtime'
import type { Runtime } from '../runtime'

// One micro-lesson per turn in the Spinner's suffix: no pane, any terminal. The suffix
// to draw, or null when the Spinner is left as it is.
export async function spinnerSuffixFor(rt: Runtime, engine: Engine, e: { surface: string; viewport?: Viewport }): Promise<string | null> {
  noteViewport(rt, e)
  const state = await engine.wait.read()
  if (!isLessonVisible(state) || state.turnId === null) return null

  // Nothing to teach until the setup says which languages and level.
  const setup = await currentSetup(engine)
  if (setup === null) return null

  // The learner's own mistake when there is one; the built-in cards otherwise.
  const card = await engine.spinnerCard.read()
  const line = card.turnId === state.turnId && card.text !== null ? card.text : microLesson(setup.targetLanguage, setup.nativeLanguage, state.turnId)
  return spinnerSuffix(line)
}
