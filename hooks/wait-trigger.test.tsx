import { expect, mock, test } from 'claude-code/testing'

// A finished setup: the mod stays quiet until there is one (see setup.test.tsx).
const savedSetup = (targetLanguage = 'English') => ({
  version: 1,
  targetLanguage,
  nativeLanguage: 'Spanish',
  level: 'A1',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
})

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'requesting' } as const

test('the spinner carries one micro-lesson after the delay, then drops it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { setup: savedSetup() })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  // Stands for the engine beneath the plugin: draws the Spinner line from the
  // props the plugin left, so the suffix it rewrote is what is read back.
  on('ui.render', { component: 'Spinner' }, async (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
  })

  const draw = async () => {
    const ui = await $.ui.mount({
      plugin: 'lingo-pane',
      surface: 'terminal',
      component: 'Spinner',
      requestId: 'main',
      props: SPINNER,
    })
    const line = (await ui.find({ type: 'Text' }))?.text
    await ui.unmount()
    return line
  }

  await $.turn.start({ text: 'hello', turnId: 'turn-1' })
  expect(await draw()).toBe('Sauteing…')

  await clock.advance(2000)
  const shown = await draw()
  expect(shown).toMatch(/^Sauteing… · .+ = .+/)
  // One card per turn: drawing again shows the same one.
  expect(await draw()).toBe(shown)

  // A subagent finishing is not the main turn finishing.
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'sub', agentId: 'a1', reason: 'answer' })
  await clock.advance(5000)
  expect(await draw()).toBe(shown)

  // The main turn completing starts the short countdown, then the lesson goes.
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'turn-1', reason: 'answer' })
  await clock.advance(2900)
  expect(await draw()).toBe(shown)
  await clock.advance(200)
  expect(await draw()).toBe('Sauteing…')
})

test('a permission dialog retires the lesson until its call has run; an ask settled without one does not', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { setup: savedSetup() })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('classic.PermissionRequest', () => ({}))
  // The engine beneath runs a call as core does: the check comes inside the
  // call, and an ask goes to the mode's decider, which is either the dialog
  // (PermissionRequest) or, in auto mode, the classifier with no dialog at all.
  let hasDialog = false
  const during: (string | undefined)[] = []
  on('tool.call', async () => {
    await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'call-1' } as never)
    if (hasDialog) await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } })
    during.push(await draw())
    return { ref: 0, result: {}, text: '' }
  })
  on('ui.render', { component: 'Spinner' }, async (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
  })
  const draw = async () => {
    const ui = await $.ui.mount({
      plugin: 'lingo-pane',
      surface: 'terminal',
      component: 'Spinner',
      requestId: 'main',
      props: SPINNER,
    })
    const line = (await ui.find({ type: 'Text' }))?.text
    await ui.unmount()
    return line
  }

  await $.turn.start({ text: 'edit it', turnId: 'turn-1' })
  await clock.advance(2000)
  expect(await draw()).toMatch(/ · /)

  // Auto mode: the classifier settles the ask and nobody is asked anything.
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(during[0]).toMatch(/ · /)
  expect(await draw()).toMatch(/ · /)

  // A dialog on screen: the lesson steps aside until the call has run.
  hasDialog = true
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(during[1]).toBe('Sauteing…')
  expect(await draw()).toMatch(/ · /)
})

test(
  'a target language without built-in cards says so instead of inventing one',
  async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { setup: savedSetup('Ukrainian') })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'Spinner' }, async (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
  })
  await $.turn.start({ text: 'hola', turnId: 'turn-1' })
  await clock.advance(2000)
  const ui = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'main',
    props: SPINNER,
  })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('Sauteing… · no built-in cards for Ukrainian yet')
  await ui.unmount()
  },
)
