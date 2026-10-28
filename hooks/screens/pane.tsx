import type { MatchedHook } from 'claude-code'

import { LABELS } from '../../src/labels'
import { claudeStateLine } from '../../src/split'
import { currentSetup } from '../engine'
import type { Engine } from '../engine'
import { noteViewport } from '../runtime'
import type { Runtime } from '../runtime'
import { PANE } from '../state'
import type { PaneContext } from './context'
import { drawLesson } from './lesson'
import { drawWizard } from './wizard'

type PaneRender = MatchedHook<'ui.render', { readonly component: 'Pane'; readonly requestId: typeof PANE }>

// The split: the wizard while setup is pending (or being redone), else the lesson.
export async function drawPane(rt: Runtime, engine: Engine, e: Parameters<PaneRender>[1]) {
  noteViewport(rt, e)
  const setup = await currentSetup(engine)
  const wizard = await engine.setupWizard.read()
  const state = await engine.wait.read()

  if (e.surface === 'mobile') {
    // The mobile app draws no Input yet, so the wizard cannot run there.
    const { Box, Text } = engine.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text bold>{LABELS.modName}</Text>
        <Text dimColor>
          {setup === null ? LABELS.setupNeedsInput : LABELS.learning(setup.targetLanguage, setup.nativeLanguage)}
        </Text>
      </Box>
    )
  }

  const ui = engine.ui.resolve(e)
  const { Box, Text } = ui

  // On top of the split: whether the keys are here (Esc hands them back and the
  // split stays), and what Claude is doing.
  const isFocused = e.props.isFocused
  const top = (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold={isFocused} dimColor={!isFocused}>
        {isFocused ? LABELS.keysHere : LABELS.keysAway}
      </Text>
      <Text dimColor>{claudeStateLine(state, state.startedAt === null ? 0 : await engine.clock.now())}</Text>
    </Box>
  )
  const pane: PaneContext = { engine, rt, ui, isFocused, top, columns: e.props.bodyColumns, draft: await engine.draft.read() }

  // A permission ask or a question: the split waits, dimmed and with no field,
  // so a key meant for the dialog never lands in it.
  if (state.phase === 'paused') {
    return (
      <Box flexDirection="column">
        {top}
        <Text dimColor>{LABELS.waitingForYou}</Text>
      </Box>
    )
  }

  if (setup === null || wizard.isOpen) {
    return (
      <Box flexDirection="column">
        {top}
        {drawWizard(pane, setup, wizard)}
      </Box>
    )
  }

  return drawLesson(pane, setup)
}
