import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// The echo of the draft: the pane's fields show one row, so a line longer than the field can
// show is drawn again, wrapped, under it. It lives in `$.state` only: the store, which keeps
// what the learner has done and never what they type, must come out the same.

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'B1',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const WIDE = { columns: 139, rows: 50, isFullscreen: true }
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// A pane at 40 % of a 139-column terminal, where the demo take was recorded.
const paneProps = (bodyColumns: number) =>
  ({
    title: 'lingo-pane',
    isFocused: true,
    bodyColumns,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  }) as const

const LONG = 'I like cook pasta, and I am agree that the weather is very good today'
const SHORT = 'I like pasta.'

type On = Parameters<typeof mock.store>[0]

const world = (on: On, options: { setup?: Record<string, unknown>; store?: Record<string, unknown> } = {}) => {
  const entries = new Map<string, unknown>(Object.entries({ setup: options.setup ?? SAVED, ...options.store }))
  const script: string[] = []
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('model.complete', () => ({
    value: { isAnswered: true as const, text: script.length > 0 ? (script.shift() as string) : 'FIX: none\nTUTOR: Tell me more.', usage: USAGE },
  }))
  let isUp = false
  on('ui.open', () => {
    isUp = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    isUp = false
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: isUp ? [{ id: 'lingo', title: 'lingo-pane', isShown: true, isFocused: true, isPlaced: true }] : [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ ref: 0, result: {}, text: '' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  return { entries, script }
}

type Dollar = Engine

const openWithCommand = ($: Dollar) =>
  $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 139 } })

const mountPane = ($: Dollar, bodyColumns = 54) =>
  $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', viewport: WIDE, props: paneProps(bodyColumns) })

// What a person typing does: a run of edits, one per key.
type Mounted = Awaited<ReturnType<typeof mountPane>>
const type = async (pane: Mounted, key: string, text: string) => {
  for (let at = 1; at <= text.length; at += 1) await pane.input({ key, text: text.slice(0, at), kind: 'change' })
}
const echoOf = (pane: Mounted, text: string) => pane.find({ type: 'Text', text: new RegExp(`^typing +${text}$`) })

test('a conversation reply longer than the field can show is drawn whole, wrapped, under the field', async ($, on) => {
  world(on)
  await openWithCommand($)
  const pane = await mountPane($)

  await type(pane, 'reply', LONG)

  const echo = await echoOf(pane, LONG)
  expect(echo).toBeDefined()
  expect(echo?.props).toMatchObject({ wrap: 'wrap' })
  await pane.unmount()
})

test('a line that fits in the field is not repeated, and an empty field adds no row', async ($, on) => {
  world(on)
  await openWithCommand($)
  const pane = await mountPane($)

  await type(pane, 'reply', SHORT)
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()

  await pane.input({ key: 'reply', text: '', kind: 'change' })
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.unmount()
})

test('the same line fits a wide pane and is repeated in a narrow one', async ($, on) => {
  world(on)
  await openWithCommand($)
  const line = 'I like pasta a lot, really.'

  const wide = await mountPane($, 98)
  await type(wide, 'reply', line)
  expect(await wide.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await wide.unmount()

  const narrow = await mountPane($, 30)
  await narrow.input({ key: 'reply', text: line, kind: 'change' })
  expect(await echoOf(narrow, line)).toBeDefined()
  await narrow.unmount()
})

test('the echo goes away when the line is cut back to what fits', async ($, on) => {
  world(on)
  await openWithCommand($)
  const pane = await mountPane($)

  await type(pane, 'reply', LONG)
  expect(await echoOf(pane, LONG)).toBeDefined()
  await pane.input({ key: 'reply', text: SHORT, kind: 'change' })
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.unmount()
})

test('sending the line clears the echo', async ($, on) => {
  world(on)
  await openWithCommand($)
  const pane = await mountPane($)

  await type(pane, 'reply', LONG)
  expect(await echoOf(pane, LONG)).toBeDefined()
  await pane.input({ key: 'reply', text: LONG })

  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  // The line itself is in the conversation now, once.
  expect(await pane.find({ type: 'Text', text: /^you +I like cook pasta/ })).toBeDefined()
  await pane.unmount()
})

// The log after a conversation and a role-play: the tutor suggests a reading next.
const READING_NEXT = { version: 1, units: 2, lastDoneAt: { conversation: 'b', roleplay: 'c' }, done: { conversation: 1, roleplay: 1 }, recent: [] }
const READING = [
  'TITLE: A chess club',
  'TEXT: Ana goes to a chess club every Tuesday. The club is in an old library near her house.',
  'Q1: When does Ana go to the club? :: Tuesday',
  'Q2: Where is the club? :: an old library',
  'Q3: What game does she play? :: chess',
].join('\n')

test('a reading answer longer than the field is drawn whole, and goes when the answer is sent', async ($, on) => {
  const { script } = world(on, { store: { activity: READING_NEXT } })
  script.push(READING)
  await openWithCommand($)
  const pane = await mountPane($)

  await type(pane, 'reading-answer', LONG)
  expect(await echoOf(pane, LONG)).toBeDefined()

  await pane.input({ key: 'reading-answer', text: LONG })
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.unmount()
})

test('a role-play reply longer than the field is drawn whole, and goes when it is sent', async ($, on) => {
  const AFTER_CONVERSATION = { version: 1, units: 1, lastDoneAt: { conversation: '2026-10-02T09:00:00.000Z' }, done: { conversation: 1 }, recent: [] }
  world(on, { store: { activity: AFTER_CONVERSATION } })
  await openWithCommand($)
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /role-play · B1/ })).toBeDefined()

  await type(pane, 'reply', LONG)
  expect(await echoOf(pane, LONG)).toBeDefined()

  await pane.input({ key: 'reply', text: LONG })
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.unmount()
})

test('a review answer longer than the field is drawn whole, and goes when the answer is sent', async ($, on) => {
  world(on)
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-review' })

  await type(pane, 'answer-0', LONG)
  expect(await echoOf(pane, LONG)).toBeDefined()

  await pane.input({ key: 'answer-0', text: LONG })
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.unmount()
})

test('a new activity starts with no draft left over from the old one', async ($, on) => {
  world(on)
  await openWithCommand($)
  const pane = await mountPane($)

  await type(pane, 'reply', LONG)
  expect(await echoOf(pane, LONG)).toBeDefined()

  // The field is gone while the menu is open and in the other activity; it comes back empty.
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-review' })
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-conversation' })
  expect(await pane.find({ key: 'reply' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.unmount()
})

test('a permission ask takes the field away, and the field comes back empty with no echo', async ($, on) => {
  world(on)
  await openWithCommand($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const pane = await mountPane($)

  await type(pane, 'reply', LONG)
  expect(await echoOf(pane, LONG)).toBeDefined()

  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 'call-1' } as never)
  await pane.redraw()
  expect(await pane.find({ key: 'reply' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: /Claude needs you/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', command: 'rm x' })
  await pane.redraw()
  expect(await pane.find({ key: 'reply' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.unmount()
})

// A language is capped at 40 characters by the wizard: this one still outgrows the field.
const LONG_LANGUAGE = 'Brazilian Portuguese from the south'
const LONG_INTERESTS = 'cooking pasta, chess, hiking with friends, jazz and old movies'

test('the wizard shows the whole language or interests being typed, and nothing for a short one', async ($, on) => {
  const { entries } = world(on, { setup: undefined })
  entries.delete('setup')
  const pane = await mountPane($)

  // Prefilled and short: no echo.
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await type(pane, 'native-0', LONG_LANGUAGE)
  expect(await echoOf(pane, LONG_LANGUAGE)).toBeDefined()
  await pane.input({ key: 'native-0', text: 'Portuguese', kind: 'change' })
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()

  await pane.input({ key: 'target-0', text: LONG_LANGUAGE, kind: 'change' })
  expect(await echoOf(pane, LONG_LANGUAGE)).toBeDefined()
  await pane.input({ key: 'target-0', text: 'English', kind: 'change' })

  await pane.press({ key: 'next' })
  await pane.press({ key: 'level-B1' })
  await pane.press({ key: 'next' })
  await type(pane, 'interests-0', LONG_INTERESTS)
  expect(await echoOf(pane, LONG_INTERESTS)).toBeDefined()
  await pane.unmount()
})

test('in the wizard, Enter keeps the text in the field, so its echo stays with it', async ($, on) => {
  const { entries } = world(on)
  entries.delete('setup')
  const pane = await mountPane($)

  await pane.input({ key: 'native-0', text: LONG_LANGUAGE })
  // Drawn again with its text (the key moved on): the field and its echo agree.
  expect((await pane.find({ key: 'native-1' }))?.text).toBe(LONG_LANGUAGE)
  expect(await echoOf(pane, LONG_LANGUAGE)).toBeDefined()
  await pane.unmount()
})

test('redoing the setup over a lesson leaves no draft behind when the lesson comes back', async ($, on) => {
  world(on)
  await openWithCommand($)
  const pane = await mountPane($)
  await type(pane, 'reply', LONG)
  expect(await echoOf(pane, LONG)).toBeDefined()

  await $.command.run({ command: 'lingo', args: 'setup', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 139 } })
  expect(await pane.find({ type: 'Text', text: /lingo-pane setup/ })).toBeDefined()
  for (const key of ['next', 'next', 'next', 'skip', 'next', 'next', 'confirm']) await pane.press({ key })

  // The same unfinished conversation, its field empty again.
  expect(await pane.find({ key: 'reply' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^typing/ })).toBeUndefined()
  await pane.unmount()
})

test('the draft is never written to the store: typing and sending leave only what is stored today', async ($, on) => {
  const { entries } = world(on)
  await openWithCommand($)
  const pane = await mountPane($)
  const before = JSON.stringify([...entries])

  await type(pane, 'reply', LONG)
  expect(JSON.stringify([...entries])).toBe(before)

  await pane.input({ key: 'reply', text: LONG })
  expect(JSON.stringify([...entries])).not.toContain('cook pasta')
  expect(JSON.stringify([...entries])).toBe(before)
  await pane.unmount()
})
