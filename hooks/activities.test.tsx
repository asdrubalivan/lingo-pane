import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// Role-play (the fixed A1-C2 list, and scenarios the tutor makes up from the
// learner's interests) and reading (a short text and 2-3 questions; an empty
// Enter shows the answer and makes a card).

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'B1',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const WIDE = { columns: 200, rows: 50, isFullscreen: true }
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const PANE = { title: 'lingo-pane', isFocused: true, bodyColumns: 78, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

// The log after one conversation: the tutor suggests a role-play next.
const AFTER_CONVERSATION = { version: 1, units: 1, lastDoneAt: { conversation: '2026-10-02T09:00:00.000Z' }, done: { conversation: 1 }, recent: [] }

const READING = [
  'TITLE: A chess club',
  'TEXT: Ana goes to a chess club every Tuesday. The club is in an old library near her house.',
  'Q1: When does Ana go to the club? :: Tuesday',
  'Q2: Where is the club? :: an old library',
  'Q3: What game does she play? :: chess',
].join('\n')

type On = Parameters<typeof mock.store>[0]
type Dollar = Engine
type Request = { system?: string; prompt: string; maxTokens?: number }

const world = (on: On, options: { setup?: Record<string, unknown>; store?: Record<string, unknown> } = {}) => {
  const entries = new Map<string, unknown>(Object.entries({ setup: options.setup ?? SAVED, ...options.store }))
  const requests: Request[] = []
  const script: (string | null)[] = []
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('model.complete', (_$, e) => {
    requests.push({ ...e })
    const text = script.length > 0 ? script.shift() : 'FIX: none\nTUTOR: Tell me more.'
    return { value: text == null ? { isAnswered: false as const, reason: 'aborted' as const, usage: USAGE } : { isAnswered: true as const, text, usage: USAGE } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  return { entries, requests, script }
}

const openWithCommand = ($: Dollar) =>
  $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

const mountPane = ($: Dollar) =>
  $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', viewport: WIDE, props: PANE })

test('after a conversation the split opens into a role-play from the fixed list; the tutor plays its part', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { requests } = world(on, { store: { activity: AFTER_CONVERSATION } })
  await openWithCommand($)
  // B1, no interests: the first scenario of the level.
  expect(requests[0]?.system).toContain('role-play: "Job interview basic"')
  expect(requests[0]?.system).toContain('You play: Interviewer')

  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /role-play · B1/ })).toBeDefined()
  expect((await pane.find({ type: 'Text', text: 'Job interview basic' }))?.props.color).toBe('#b39ddb')
  expect(await pane.find({ type: 'Text', text: /You: / })).toBeDefined()
  expect(await pane.find({ key: 'reply' })).toBeDefined()
  await pane.unmount()
})

test('with interests, every other role-play is made up by the tutor and marked as made up', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { requests, script } = world(on, {
    setup: { ...SAVED, interests: ['chess'] },
    store: { activity: { ...AFTER_CONVERSATION, done: { conversation: 1, roleplay: 1 }, lastDoneAt: { conversation: 'b', roleplay: 'a' } } },
  })
  // Reading was never done, so it comes first; then role-play is asked for by hand.
  script.push(READING, 'SCENARIO: Chess club :: You join a chess club. :: The club secretary. :: A new member.\nFIX: none\nTUTOR: Welcome! Do you play often?')
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-roleplay' })

  expect(requests[1]?.prompt).toContain('Make up a short role-play')
  expect(requests[1]?.prompt).toContain('chess')
  expect(await pane.find({ type: 'Text', text: 'Chess club (made up from your interests)' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /You join a chess club\. You: A new member\./ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /tutor +Welcome! Do you play often\?/ })).toBeDefined()
  await pane.unmount()
})

test('leaving a role-play half done for a conversation keeps its mistakes as cards', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, script } = world(on, { store: { activity: AFTER_CONVERSATION } })
  script.push('FIX: none\nTUTOR: Tell me about yourself.', 'FIX: since three years => for three years :: duración\nTUTOR: Try since three years again.')
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.input({ key: 'reply', text: 'I work here since three years.' })
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-conversation' })

  const saved = entries.get('mistakes') as { cards: Record<string, unknown>[] }
  expect(saved.cards).toEqual([expect.objectContaining({ wrong: 'since three years', right: 'for three years', unit: 2 })])
  expect(await pane.find({ type: 'Text', text: /conversation · B1/ })).toBeDefined()
  await pane.unmount()
})

test('a reading: the text, one question at a time; an empty Enter shows the answer and makes a card', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, requests, script } = world(on, {
    store: { activity: { ...AFTER_CONVERSATION, done: { conversation: 1, roleplay: 1 }, lastDoneAt: { conversation: 'b', roleplay: 'c' } } },
  })
  script.push(READING)
  await openWithCommand($)
  expect(requests[0]?.prompt).toContain('80-120 words in English')
  expect(requests[0]?.maxTokens).toBe(700)

  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /reading · B1/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Ana goes to a chess club every Tuesday/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Written by the tutor for your level/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Q1 of 3: When does Ana go to the club?' })).toBeDefined()

  await pane.input({ key: 'reading-answer', text: 'Monday' })
  expect(await pane.find({ type: 'Text', text: /Not quite/ })).toBeDefined()
  await pane.input({ key: 'reading-answer', text: 'on Tuesday' })
  expect(await pane.find({ type: 'Text', text: /Q2 of 3/ })).toBeDefined()

  await pane.input({ key: 'reading-answer', text: '' })
  const cards = (entries.get('mistakes') as { cards: Record<string, unknown>[] }).cards
  expect(cards).toEqual([expect.objectContaining({ wrong: '', right: 'an old library', sentence: 'Where is the club?', note: 'A chess club', unit: 2 })])
  expect(await pane.find({ type: 'Text', text: /· Q2 Where is the club\? an old library/ })).toBeDefined()

  await pane.input({ key: 'reading-answer', text: 'Chess.' })
  expect(await pane.find({ type: 'Text', text: '✓ 3 questions, 1 card saved' })).toBeDefined()
  expect(entries.get('activity')).toMatchObject({ units: 2, done: { reading: 1 } })
  expect(await pane.find({ key: 'next-unit' })).toBeDefined()
  await pane.unmount()
})

test('a reading the tutor did not write says so and offers to go on', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { script } = world(on)
  script.push('FIX: none\nTUTOR: Hi!', null)
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-reading' })
  expect(await pane.find({ type: 'Text', text: /did not write the text/ })).toBeDefined()
  expect(await pane.find({ key: 'next-unit' })).toBeDefined()
  expect(await pane.find({ key: 'reading-answer' })).toBeUndefined()
  await pane.unmount()
})
