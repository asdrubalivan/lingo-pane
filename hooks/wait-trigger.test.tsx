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

test('a pending permission ask retires the lesson until a tool runs again', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { setup: savedSetup() })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ ref: 0, result: {}, text: '' }))
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

  // A query (no tool_use_id) is not a real ask and leaves the lesson alone.
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
  expect(await draw()).toMatch(/ · /)

  // The engine deciding a real call: the ask would put a dialog on screen.
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'call-1' } as never)
  expect(await draw()).toBe('Sauteing…')

  await $.tool.call({ tool: 'Bash', command: 'ls' })
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

const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 6,
  bodyColumns: 100,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 5 },
  view: {},
} as const

test(
  'a pane that is not placed on a narrow terminal is offered as a button above the prompt',
  { options: { openPaneWhileWaiting: true } },
  async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on, { setup: savedSetup() })
    const opens: boolean[] = []
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('ui.panes', () => ({ value: [] }))
    on('ui.close', () => ({ value: undefined }))
    // The first open is the mod's own, on a timer: it does not fit. The press is asked: it does.
    on('ui.open', () => {
      opens.push(true)
      return { value: opens.length === 1 ? { isPlaced: false, reason: 'narrow' } : { isPlaced: true } }
    })
    on('ui.render', { component: 'AbovePrompt' }, async (_$, e) => {
      const { Box } = _$.ui.resolve(e)
      return <Box />
    })
    const mountBand = () =>
      $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: BAND })

    await $.turn.start({ text: 'build it', turnId: 'turn-1' })
    const before = await mountBand()
    expect(await before.find({ key: 'open-lingo' })).toBeUndefined()
    await before.unmount()

    await clock.advance(2000)
    const band = await mountBand()
    expect(await band.find({ key: 'open-lingo' })).toBeDefined()
    await band.press({ key: 'open-lingo' })
    expect(opens.length).toBe(2)

    // Taken: the offer is gone.
    await band.redraw()
    expect(await band.find({ key: 'open-lingo' })).toBeUndefined()
    await band.unmount()
  },
)
