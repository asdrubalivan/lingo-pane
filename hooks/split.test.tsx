import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// The docked split: opens by itself 2 s into a turn (fullscreen, wide enough),
// asks for the keyboard and its share of the width, and closes by the rules in
// docs/decisions.md ("Lesson UI": untouched goes with the turn; touched or asked
// stays until the next prompt, the end of a micro-unit with Claude idle, or a hand).

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'A1',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const WIDE = { columns: 200, rows: 50, isFullscreen: true }
const MAIN_SCREEN = { columns: 100, rows: 30, isFullscreen: false }

const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 6,
  bodyColumns: 100,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 5 },
  view: {},
} as const

const PANE = (isFocused: boolean) =>
  ({
    title: 'lingo-pane',
    isFocused,
    bodyColumns: 78,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  }) as const

type On = Parameters<typeof mock.store>[0]
type Dollar = Engine

// The engine beneath the plugin: panes that open (placed or not), close and list.
const engine = (on: On, options: { isPlaced?: boolean; setup?: unknown } = {}) => {
  const opens: Record<string, unknown>[] = []
  const closes: string[] = []
  const registered: Record<string, unknown>[] = []
  let isUp = false
  mock.store(on, options.setup === null ? {} : { setup: options.setup ?? SAVED })
  on('ui.open', (_$, e) => {
    opens.push({ ...e })
    isUp = true
    return { value: options.isPlaced === false ? { isPlaced: false, reason: 'narrow' } : { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    closes.push(e.id)
    isUp = false
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: isUp ? [{ id: 'lingo', title: 'lingo-pane', isShown: true, isFocused: true, isPlaced: options.isPlaced !== false }] : [],
  }))
  on('command.register', (_$, e) => {
    registered.push({ ...e })
    return { value: { command: e.name } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('tool.check', () => ({ decision: 'ask' }))
  // The tutor, beneath the plugin: the split opens straight into a conversation.
  on('model.complete', () => ({
    value: { isAnswered: true as const, text: 'FIX: none\nTUTOR: Hello! What are you working on?', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  }))
  on('tool.call', () => ({ ref: 0, result: {}, text: '' }))
  on('ui.render', { component: 'AbovePrompt' }, (_$, e) => {
    const { Box } = _$.ui.resolve(e)
    return <Box />
  })
  return { opens, closes, registered }
}

// Draws the band once with a viewport, so the mod knows the terminal's size.
const seeTerminal = async ($: Dollar, viewport: typeof WIDE | typeof MAIN_SCREEN) => {
  const band = await $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', viewport, props: BAND })
  return band
}

const mountPane = ($: Dollar, isFocused = true) =>
  $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', viewport: WIDE, props: PANE(isFocused) })

const complete = (turnId: string, isAborted = false) => ({ answer: '', durationMs: 1, isAborted, turnId, reason: 'answer' as const })

test('in fullscreen the split opens by itself 2 s into a turn, asking for the keys and its share of the width', async ($, on) => {
  const clock = mock.clock(on)
  const { opens } = engine(on)
  await (await seeTerminal($, WIDE)).unmount()

  await $.turn.start({ text: 'refactor it', turnId: 't1' })
  await clock.advance(1900)
  expect(opens.length).toBe(0)
  await clock.advance(100)
  // 40 % of 200 columns docked; 40 % of 50 rows if it ever seats inline.
  expect(opens).toEqual([{ id: 'lingo', title: 'lingo-pane', focus: true, columns: 80, rows: 20 }])
})

test('the share comes from the setup', async ($, on) => {
  const clock = mock.clock(on)
  const { opens } = engine(on, { setup: { ...SAVED, splitShare: 50 } })
  await (await seeTerminal($, WIDE)).unmount()
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  expect(opens[0]).toMatchObject({ columns: 100 })
})

test('untouched, it goes when the turn completes (after the short countdown); an aborted turn closes it at once', async ($, on) => {
  const clock = mock.clock(on)
  const { closes } = engine(on)
  await (await seeTerminal($, WIDE)).unmount()

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  await $.turn.complete(complete('t1'))
  expect(closes).toEqual([])
  await clock.advance(3000)
  expect(closes).toEqual(['lingo'])

  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(2000)
  await $.turn.complete(complete('t2', true))
  expect(closes).toEqual(['lingo', 'lingo'])
})

test('touched, it stays after the turn and closes when the learner submits the next prompt', async ($, on) => {
  const clock = mock.clock(on)
  const { closes } = engine(on)
  await (await seeTerminal($, WIDE)).unmount()

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  // Getting the focus is not touching: drawing it focused changes nothing. A key typed in its field is.
  const pane = await mountPane($)
  expect(await pane.find({ key: 'reply' })).toBeDefined()
  await pane.input({ key: 'reply', text: 'I', kind: 'change' })
  await $.turn.complete(complete('t1'))
  await clock.advance(5000)
  expect(closes).toEqual([])

  await $.prompt.submit({ text: 'next task', wait: false, origin: { kind: 'composer' } })
  expect(closes).toEqual(['lingo'])
  await pane.unmount()
})

test('/lingo is immediate; a split it opens stays after the turn; a second /lingo closes it', async ($, on) => {
  const clock = mock.clock(on)
  const { opens, closes, registered } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(registered[0]).toMatchObject({ name: 'lingo', immediate: true })

  await (await seeTerminal($, WIDE)).unmount()
  await $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 150 } })
  // The width the command reports wins over the last one drawn.
  expect(opens[0]).toEqual({ id: 'lingo', title: 'lingo-pane', focus: true, columns: 60, rows: 20 })

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  // Already open: nothing opens twice.
  expect(opens.length).toBe(1)
  await $.turn.complete(complete('t1'))
  await clock.advance(5000)
  expect(closes).toEqual([])

  await $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 150 } })
  expect(closes).toEqual(['lingo'])
})

test('on the main screen nothing opens by itself: the band offers "1: open lesson", which opens about 40 % tall', async ($, on) => {
  const clock = mock.clock(on)
  const { opens } = engine(on)
  const band = await seeTerminal($, MAIN_SCREEN)
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await band.find({ key: 'open-lingo' })).toBeUndefined()

  await clock.advance(2000)
  expect(opens.length).toBe(0)
  await band.redraw()
  const offer = await band.find({ key: 'open-lingo' })
  expect(offer?.props).toMatchObject({ hotkey: '1', plain: true, label: 'open lesson' })

  await band.press({ key: 'open-lingo' })
  expect(opens).toEqual([{ id: 'lingo', title: 'lingo-pane', focus: true, columns: 40, rows: 12 }])
  expect(await band.find({ key: 'open-lingo' })).toBeUndefined()

  // Opened by the person: it stays after the turn.
  await $.turn.complete(complete('t1'))
  await band.unmount()
})

test('narrower than 110 columns in fullscreen it does not try either', async ($, on) => {
  const clock = mock.clock(on)
  const { opens } = engine(on)
  await (await seeTerminal($, { columns: 109, rows: 40, isFullscreen: true })).unmount()
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  expect(opens.length).toBe(0)
})

test('when the engine does not seat it (under 144 columns unasked), the mod closes it and the band offers it', async ($, on) => {
  const clock = mock.clock(on)
  const { opens, closes } = engine(on, { isPlaced: false })
  const band = await seeTerminal($, { columns: 120, rows: 40, isFullscreen: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  expect(opens.length).toBe(1)
  expect(closes).toEqual(['lingo'])
  await band.redraw()
  expect(await band.find({ key: 'open-lingo' })).toBeDefined()
  await band.unmount()
})

test('nothing opens by itself while the setup is pending', async ($, on) => {
  const clock = mock.clock(on)
  const { opens } = engine(on, { setup: null })
  const band = await seeTerminal($, WIDE)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  expect(opens.length).toBe(0)
  await band.redraw()
  expect(await band.find({ key: 'open-lingo' })).toBeUndefined()
  await band.unmount()
})

test('the split says where the keys are and what Claude is doing', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await (await seeTerminal($, WIDE)).unmount()

  const away = await mountPane($, false)
  expect(await away.find({ type: 'Text', text: '○ Ctrl+X Tab to come back' })).toBeDefined()
  expect(await away.find({ type: 'Text', text: '✓ Claude done' })).toBeDefined()
  await away.unmount()

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(41_000)
  const here = await mountPane($, true)
  expect(await here.find({ type: 'Text', text: /● keys here/ })).toBeDefined()
  expect(await here.find({ type: 'Text', text: '✻ Claude working · 41s' })).toBeDefined()

  await $.turn.complete(complete('t1', true))
  await here.redraw()
  expect(await here.find({ type: 'Text', text: '✓ Claude done' })).toBeDefined()
  await here.unmount()
})

test('a permission ask dims the split and takes its field away; it stays open and comes back after', async ($, on) => {
  const clock = mock.clock(on)
  const { closes } = engine(on)
  await (await seeTerminal($, WIDE)).unmount()
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  const pane = await mountPane($)
  expect(await pane.find({ key: 'reply' })).toBeDefined()

  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 'call-1' } as never)
  await pane.redraw()
  expect(await pane.find({ type: 'Text', text: /Claude needs you/ })).toBeDefined()
  expect(await pane.find({ key: 'reply' })).toBeUndefined()
  expect(closes).toEqual([])

  await $.tool.call({ tool: 'Bash', command: 'rm x' })
  await pane.redraw()
  expect(await pane.find({ key: 'reply' })).toBeDefined()
  await pane.unmount()
})
