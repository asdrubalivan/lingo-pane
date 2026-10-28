import type { MatchedHook } from 'claude-code'

import { LABELS } from '../../src/labels'
import { draftFromConfig, wizardTransition } from '../../src/setup'
import { isOfferVisible } from '../../src/wait-machine'
import { currentSetup, dispatchWait, refreshPaneData } from '../engine'
import type { Engine } from '../engine'
import { ensureLesson } from '../orchestration'
import { noteViewport, openArgs } from '../runtime'
import type { Runtime } from '../runtime'

export type BandRender = MatchedHook<'ui.render', { readonly component: 'AbovePrompt' }>

// The band above the prompt: the setup reminder while setup is pending, and
// "open lesson" while Claude works and the split cannot seat by itself.
// Null when there is nothing to add to the band.
export async function drawBand(rt: Runtime, engine: Engine, e: Parameters<BandRender>[1]) {
  noteViewport(rt, e)
  if (e.props.hasSurvey) return null

  const state = await engine.wait.read()
  const setup = await currentSetup(engine)
  const band = await engine.setupBand.read()
  const isSetupShown = setup === null && !band.isHidden
  const isOfferShown = setup !== null && isOfferVisible(state)
  if (!isSetupShown && !isOfferShown) return null

  const { Box, Button, Text } = engine.ui.resolve(e)

  return (
    <Box flexDirection="column">
      {isSetupShown && (
        <Box columnGap={1}>
          <Text dimColor>{LABELS.bandSetupPending}</Text>
          <Button
            key="setup-start"
            label={LABELS.bandStartSetup}
            hotkey="2"
            plain
            onPress={async () => {
              await engine.setupWizard.update(s => wizardTransition(s, { type: 'open' }, draftFromConfig(rt.config.native, rt.config.target)))
              // Opened by a press, so it is placed at any width.
              const opened = await engine.ui.open(openArgs(rt, setup))
              if (opened.isPlaced) await dispatchWait(engine, { type: 'pane-placed', opener: 'person' })
            }}
          />
          <Button
            key="setup-later"
            label={LABELS.bandLater}
            hotkey="3"
            plain
            onPress={() => engine.setupBand.update(() => ({ isHidden: true }))}
          />
        </Box>
      )}
      {isOfferShown && (
        <Box columnGap={1}>
          <Text dimColor>{LABELS.modName}</Text>
          <Button
            key="open-lingo"
            label={LABELS.bandOpenLesson}
            hotkey="1"
            plain
            onPress={async () => {
              await dispatchWait(engine, { type: 'offer-taken' })
              // Opened by a press: placed at any width, inline when it cannot dock.
              await refreshPaneData(engine)
              const opened = await engine.ui.open(openArgs(rt, setup))
              if (opened.isPlaced) await dispatchWait(engine, { type: 'pane-placed', opener: 'person' })
              if (setup !== null) await ensureLesson(engine, setup)
            }}
          />
        </Box>
      )}
    </Box>
  )
}
