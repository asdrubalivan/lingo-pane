import type { Register } from 'claude-code'

const PANE = 'lingo'

export const register: Register = (on, options) => {
  const target = String(options.targetLanguage)
  const native = String(options.nativeLanguage)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lingo',
      description: 'Open the live language lesson pane',
    })

    return next(e)
  })

  on('command.run', { command: 'lingo' }, async $ => {
    await $.ui.open({ id: PANE, title: 'lingo-pane' })

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text bold>lingo-pane</Text>
        <Text>
          Learning {target} from {native}.
        </Text>
        <Text dimColor>Skeleton only: lessons are not built yet.</Text>
      </Box>
    )
  })
}
