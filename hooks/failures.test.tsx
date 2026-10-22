import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// When the model gives no text the learner is told why: a plan or rate limit,
// a service error, an empty reply or an abort each have their own message, on
// the card each activity already shows for a silent tutor.

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'B1',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const WIDE = { columns: 200, rows: 50, isFullscreen: true }
const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const PANE = { title: 'lingo-pane', isFocused: true, bodyColumns: 78, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

// The log after one conversation: the tutor suggests a role-play next.
const AFTER_CONVERSATION = { version: 1, units: 1, lastDoneAt: { conversation: '2026-10-02T09:00:00.000Z' }, done: { conversation: 1 }, recent: [] }

const ANSWER = { isAnswered: true as const, text: 'FIX: none\nTUTOR: Hi!', usage: USAGE }
const FAILURES = [
  { name: 'a rate limit', failure: { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit', usage: USAGE }, message: /plan or rate limit/ },
  { name: 'a service error', failure: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE }, message: /service had an error \(529\)/ },
  { name: 'a refused sign-in', failure: { isAnswered: false, reason: 'api-error', status: 401, error: 'authentication_failed', usage: USAGE }, message: /could not sign you in/ },
  { name: 'an empty reply', failure: { isAnswered: false, reason: 'empty-reply', usage: USAGE }, message: /empty reply/ },
  { name: 'an abort', failure: { isAnswered: false, reason: 'aborted', usage: USAGE }, message: /cancelled or took too long/ },
] as const

type On = Parameters<typeof mock.store>[0]
type Dollar = Engine
type Result = typeof ANSWER | (typeof FAILURES)[number]['failure']

// The engine beneath the plugin: a store, and a model that answers from a script.
const world = (on: On, options: { store?: Record<string, unknown> } = {}) => {
  const entries = new Map<string, unknown>(Object.entries({ setup: SAVED, ...options.store }))
  const script: Result[] = []
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('model.complete', () => ({ value: script.shift() ?? ANSWER }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  return { script }
}

const openWithCommand = ($: Dollar) =>
  $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

const mountPane = ($: Dollar) =>
  $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', viewport: WIDE, props: PANE })

for (const { name, failure, message } of FAILURES) {
  test(`${name}: the conversation says why it opened silent`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const { script } = world(on)
    script.push(failure)
    await openWithCommand($)
    const pane = await mountPane($)
    expect(await pane.find({ type: 'Text', text: message })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /try again or pick another activity/ })).toBeDefined()
    await pane.unmount()
  })

  test(`${name}: a reply says why and gives the learner their line back`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const { script } = world(on)
    script.push(ANSWER, failure)
    await openWithCommand($)
    const pane = await mountPane($)
    await pane.input({ key: 'reply', text: 'Hello there' })
    expect(await pane.find({ type: 'Text', text: message })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /send it again/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /you +Hello there/ })).toBeUndefined()
    await pane.unmount()
  })

  test(`${name}: a scaffold request says why`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const { script } = world(on)
    script.push(ANSWER, failure)
    await openWithCommand($)
    const pane = await mountPane($)
    await pane.input({ key: 'reply', text: '' })
    expect(await pane.find({ type: 'Text', text: message })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /Try Enter on the empty field again/ })).toBeDefined()
    await pane.unmount()
  })

  test(`${name}: a role-play says why it opened silent`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const { script } = world(on, { store: { activity: AFTER_CONVERSATION } })
    script.push(failure)
    await openWithCommand($)
    const pane = await mountPane($)
    expect(await pane.find({ type: 'Text', text: /role-play · B1/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: message })).toBeDefined()
    await pane.unmount()
  })

  test(`${name}: a reading says why no text was written`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const { script } = world(on)
    script.push(ANSWER, failure)
    await openWithCommand($)
    const pane = await mountPane($)
    await pane.press({ key: 'switch' })
    await pane.press({ key: 'switch-reading' })
    expect(await pane.find({ type: 'Text', text: message })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /text was not written/ })).toBeDefined()
    expect(await pane.find({ key: 'next-unit' })).toBeDefined()
    await pane.unmount()
  })

  test(`${name}: the review hint says why and the lesson goes on`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const { script } = world(on)
    script.push(ANSWER, failure)
    await openWithCommand($)
    const pane = await mountPane($)
    await pane.press({ key: 'switch' })
    await pane.press({ key: 'switch-review' })
    await pane.input({ key: 'answer-0', text: 'bye' })
    await pane.press({ key: 'tutor' })
    expect(await pane.find({ type: 'Text', text: message })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /Use the hint above or try again/ })).toBeDefined()
    expect(await pane.find({ key: 'answer-0' })).toBeDefined()
    await pane.unmount()
  })
}

test('an answer the lesson cannot read keeps the plain message', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { script } = world(on)
  script.push({ isAnswered: true, text: '   ', usage: USAGE })
  await openWithCommand($)
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /did not answer in a way the lesson could use/ })).toBeDefined()
  await pane.unmount()
})
