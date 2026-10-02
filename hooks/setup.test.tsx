import { expect, mock, test } from 'claude-code/testing'

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'A2',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const PANE_PROPS = {
  title: 'lingo-pane',
  isFocused: true,
  bodyColumns: 98,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 28 },
  view: {},
} as const

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 6,
  bodyColumns: 100,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 5 },
  view: {},
} as const

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'requesting' } as const

type On = Parameters<typeof mock.store>[0]

// A store in memory the test can also read and write (the test's `$` has no
// `$.store`), as the engine keeps it: JSON in, JSON out.
const memoryStore = (on: On, initial: Record<string, unknown> = {}) => {
  const entries = new Map<string, unknown>(Object.entries(initial))
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    entries.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...entries.keys()] }))
  return entries
}

// The engine beneath the plugin for what the setup touches besides the store.
const engineBeneath = (on: On, options: { opensItself?: boolean } = {}) => {
  const toasts: string[] = []
  const opens: { id: string; title?: string; focus?: true }[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  if (options.opensItself !== true) {
    on('ui.open', (_$, e) => {
      opens.push(e)
      return { value: { isPlaced: true } }
    })
  }
  on('command.register', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, (_$, e) => {
    const { Box } = _$.ui.resolve(e)
    return <Box />
  })
  return { toasts, opens }
}

for (const surface of ['terminal', 'desktop'] as const) {
test(`the setup pane walks the wizard on ${surface} and saves the choices in the store`, async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const entries = memoryStore(on)
  const { toasts } = engineBeneath(on)

  {
    const pane = await $.ui.mount({
      plugin: 'lingo-pane',
      surface,
      component: 'Pane',
      requestId: 'lingo',
      viewport: { columns: 100, rows: 30 },
      props: PANE_PROPS,
    })
    const band = await $.ui.mount({
      plugin: 'lingo-pane',
      surface,
      component: 'AbovePrompt',
      requestId: 'band',
      viewport: { columns: 100, rows: 30 },
      props: BAND_PROPS,
    })
    // Pending: the band reminds, and the pane shows the wizard, not the greeting.
    expect(await band.find({ key: 'setup-start' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /Learning/ })).toBeUndefined()

    // (a) languages, prefilled from userConfig (Spanish / English).
    expect((await pane.find({ key: 'native-0' }))?.text).toBe('Spanish')
    expect((await pane.find({ key: 'target-0' }))?.text).toBe('English')
    await pane.input({ key: 'target-0', text: 'Ukrainian' })
    expect((await pane.find({ key: 'target-1' }))?.text).toBe('Ukrainian')
    await pane.press({ key: 'next' })

    // (b) level: no Next until a button is pressed.
    expect(await pane.find({ key: 'next' })).toBeUndefined()
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
      expect(await pane.find({ key: `level-${level}` })).toBeDefined()
    }
    await pane.press({ key: 'level-B1' })
    await pane.press({ key: 'next' })

    // Optional placement test: only a Skip, and the "coming later" note.
    expect(await pane.find({ type: 'Text', text: 'placement test: coming later' })).toBeDefined()
    expect(await pane.find({ key: 'next' })).toBeUndefined()
    await pane.press({ key: 'skip' })

    // (c) strategies: the ones that exist are buttons, the rest "coming later".
    expect(await pane.find({ key: 'correctionStyle-socratic' })).toBeDefined()
    expect(await pane.find({ key: 'correctionStyle-direct' })).toBeUndefined()
    expect(await pane.find({ type: 'Text', text: /Direct \(coming later\)/ })).toBeDefined()
    await pane.press({ key: 'next' })

    // (d) summary, then confirm.
    expect(await pane.find({ type: 'Text', text: /Ukrainian from Spanish, level B1/ })).toBeDefined()
    expect(entries.get('setup')).toBeUndefined()
    await pane.press({ key: 'confirm' })

    expect(entries.get('setup')).toMatchObject({
      version: 1,
      targetLanguage: 'Ukrainian',
      nativeLanguage: 'Spanish',
      level: 'B1',
      strategies: SAVED.strategies,
      completedAt: '2026-10-02T12:00:00.000Z',
    })
    expect(toasts.at(-1)).toMatch(/setup saved/)

    // Done: the pane greets, and the band is gone without anything else changing.
    expect(await pane.find({ type: 'Text', text: /Learning Ukrainian from Spanish, level B1/ })).toBeDefined()
    expect(await band.find({ key: 'setup-start' })).toBeUndefined()
    await pane.unmount()
    await band.unmount()
  }
})
}

test('back goes one step and keeps what was typed', async ($, on) => {
  memoryStore(on)
  engineBeneath(on)
  const pane = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'lingo',
    viewport: { columns: 100, rows: 30 },
    props: PANE_PROPS,
  })
  await pane.input({ key: 'native-0', text: 'Portuguese', kind: 'change' })
  await pane.press({ key: 'next' })
  await pane.press({ key: 'back' })
  expect((await pane.find({ key: 'native-0' }))?.text).toBe('Portuguese')
  // The same language twice cannot go on.
  await pane.input({ key: 'target-0', text: 'portuguese', kind: 'change' })
  expect(await pane.find({ key: 'next' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: /must differ/ })).toBeDefined()
  await pane.unmount()
})

test('"Later" hides the band for the session; the setup stays pending', async ($, on) => {
  const entries = memoryStore(on)
  engineBeneath(on)
  const band = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'AbovePrompt',
    requestId: 'band',
    props: BAND_PROPS,
  })
  expect(await band.find({ key: 'setup-start' })).toBeDefined()
  await band.press({ key: 'setup-later' })
  expect(await band.find({ key: 'setup-start' })).toBeUndefined()
  expect(entries.get('setup')).toBeUndefined()
  await band.unmount()
})

test('"Start setup" opens the pane asking for the keyboard', async ($, on) => {
  memoryStore(on)
  const { opens } = engineBeneath(on)
  const band = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'AbovePrompt',
    requestId: 'band',
    props: BAND_PROPS,
  })
  await band.press({ key: 'setup-start' })
  expect(opens).toEqual([{ id: 'lingo', title: 'lingo-pane', focus: true }])
  await band.unmount()
})

test('a survey keeps the band to itself', async ($, on) => {
  memoryStore(on)
  engineBeneath(on)
  on('ui.render', { component: 'AbovePrompt' }, (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text>survey</Text>
  })
  const band = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'AbovePrompt',
    requestId: 'band',
    props: { ...BAND_PROPS, hasSurvey: true },
  })
  expect(await band.find({ key: 'setup-start' })).toBeUndefined()
  await band.unmount()
})

test('while setup is pending the spinner shows no micro-lesson, after it the lesson comes back', async ($, on) => {
  const clock = mock.clock(on)
  memoryStore(on)
  engineBeneath(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
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
  await clock.advance(2000)
  expect(await draw()).toBe('Sauteing…')

  // Finish the wizard in the pane (the languages come from userConfig).
  const pane = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'lingo',
    props: PANE_PROPS,
  })
  await pane.press({ key: 'next' })
  await pane.press({ key: 'level-A1' })
  await pane.press({ key: 'next' })
  await pane.press({ key: 'skip' })
  await pane.press({ key: 'next' })
  await pane.press({ key: 'confirm' })
  await pane.unmount()

  expect(await draw()).toMatch(/^Sauteing… · .+ = .+/)
})

test('the saved languages, not userConfig, decide what the spinner teaches', async ($, on) => {
  const clock = mock.clock(on)
  // userConfig is English/Spanish; the saved setup says Ukrainian.
  memoryStore(on, { setup: { ...SAVED, targetLanguage: 'Ukrainian' } })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'Spinner' }, async (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
  })
  await $.turn.start({ text: 'hello', turnId: 'turn-1' })
  await clock.advance(2000)
  const ui = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'main',
    props: SPINNER,
  })
  expect((await ui.find({ type: 'Text' }))?.text).toMatch(/no built-in cards for Ukrainian/)
  await ui.unmount()
})

test('a corrupt or foreign-version stored setup counts as pending', async ($, on) => {
  memoryStore(on, { setup: { ...SAVED, version: 99 } })
  engineBeneath(on)
  const band = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'AbovePrompt',
    requestId: 'band',
    props: BAND_PROPS,
  })
  expect(await band.find({ key: 'setup-start' })).toBeDefined()
  await band.unmount()
})

test('session.start toasts once when setup is pending, never when it is done', async ($, on) => {
  const entries = memoryStore(on)
  const { toasts } = engineBeneath(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/setup pending/)

  entries.set('setup', SAVED)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(toasts.length).toBe(1)
})

test('after /clear the pending setup is announced again, from the store', async ($, on) => {
  const entries = memoryStore(on, { setup: SAVED })
  const { toasts } = engineBeneath(on)
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'startup' })
  await $.classic.SessionStart({ source: 'clear' })
  expect(toasts.length).toBe(0)

  entries.delete('setup')
  await $.classic.SessionStart({ source: 'compact' })
  expect(toasts.length).toBe(0)
  await $.classic.SessionStart({ source: 'clear' })
  expect(toasts.length).toBe(1)
})

test('/lingo subcommands: unknown lists the real ones, setup opens the wizard, a second /lingo closes the pane', async ($, on) => {
  memoryStore(on, { setup: SAVED })
  const { opens } = engineBeneath(on, { opensItself: true })
  let paneUp = false
  const closes: string[] = []
  on('ui.panes', () => ({
    value: paneUp ? [{ id: 'lingo', title: 'lingo-pane', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  on('ui.close', (_$, e) => {
    closes.push(e.id)
    paneUp = false
    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    opens.push(e)
    paneUp = true
    return { value: { isPlaced: true } }
  })

  const unknown = await $.command.run({ command: 'lingo', args: 'frobnicate' })
  expect(unknown.text).toMatch(/unknown subcommand "frobnicate"/)
  expect(unknown.text).toContain('/lingo setup')
  expect(opens.length).toBe(0)

  // Plain /lingo opens it (no keyboard grab: setup is done), the second closes it.
  await $.command.run({ command: 'lingo', args: '' })
  expect(opens).toEqual([{ id: 'lingo', title: 'lingo-pane' }])
  await $.command.run({ command: 'lingo', args: '' })
  expect(closes).toEqual(['lingo'])

  // setup always opens the wizard, even over an open pane, and asks for the keyboard.
  paneUp = true
  await $.command.run({ command: 'lingo', args: 'setup' })
  expect(closes).toEqual(['lingo'])
  expect(opens.at(-1)).toEqual({ id: 'lingo', title: 'lingo-pane', focus: true })

  // The wizard is up, prefilled from what is saved.
  const pane = await $.ui.mount({
    plugin: 'lingo-pane',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'lingo',
    props: PANE_PROPS,
  })
  expect((await pane.find({ key: 'target-0' }))?.text).toBe('English')
  await pane.press({ key: 'next' })
  await pane.press({ key: 'next' })
  await pane.unmount()
})

test('a pending setup makes plain /lingo ask for the keyboard so the wizard can be typed in', async ($, on) => {
  memoryStore(on)
  const { opens } = engineBeneath(on)
  on('ui.panes', () => ({ value: [] }))
  await $.command.run({ command: 'lingo', args: '' })
  expect(opens).toEqual([{ id: 'lingo', title: 'lingo-pane', focus: true }])
})
