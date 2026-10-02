import { expect, mock, test } from 'claude-code/testing'

// The conversation in micro-units: the split opens straight into it (zero
// clicks), the tutor opens, the learner replies, a mistake is pointed at (the
// wrong words in the error color, the right form kept for the cards), an empty
// Enter asks for a scaffold, and after three replies the unit closes.

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'B1',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const WIDE = { columns: 200, rows: 50, isFullscreen: true }
const USAGE = { input_tokens: 1, output_tokens: 1 }

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
type Request = { model: string; system?: string; prompt: string; effort?: string; maxTokens?: number; timeoutMs?: number }

// The engine beneath the plugin: a store the test reads, panes, toasts, and a
// tutor that answers from a script (then "Tell me more.").
const world = (on: On, options: { setup?: Record<string, unknown>; store?: Record<string, unknown> } = {}) => {
  const entries = new Map<string, unknown>(Object.entries({ setup: options.setup ?? SAVED, ...options.store }))
  const requests: Request[] = []
  const script: (string | null)[] = []
  const opens: Record<string, unknown>[] = []
  const closes: string[] = []
  const toasts: string[] = []
  let isUp = false
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
  on('ui.open', (_$, e) => {
    opens.push({ ...e })
    isUp = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    closes.push(e.id)
    isUp = false
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: isUp ? [{ id: 'lingo', title: 'lingo-pane', isShown: true, isFocused: true, isPlaced: true }] : [] }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  return { entries, requests, script, opens, closes, toasts }
}

type Dollar = Parameters<Parameters<typeof test>[1]>[0]

// The person types /lingo: the split opens and the tutor opens the unit.
const openWithCommand = ($: Dollar) =>
  $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

const mountPane = ($: Dollar, isFocused = true) =>
  $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', viewport: WIDE, props: PANE(isFocused) })

test('the split opens straight into a conversation: the tutor opens on the setup model, low effort, capped', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { requests, script } = world(on)
  script.push('FIX: none\nTUTOR: Hi! What did you do last weekend?')
  await openWithCommand($)

  expect(requests.length).toBe(1)
  expect(requests[0]).toMatchObject({ model: 'sonnet', effort: 'low', maxTokens: 300, timeoutMs: 30000 })
  expect(requests[0]?.system).toContain('CEFR B1')
  expect(requests[0]?.system).toContain('do not give the correct answer first')

  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /conversation · B1/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /tutor +Hi! What did you do last weekend\?/ })).toBeDefined()
  const field = await pane.find({ key: 'reply' })
  expect(field?.props).toMatchObject({ submitLabel: 'reply', autoFocus: true })
  // 🔊 listen: Google Translate with the tutor's line.
  const listen = await pane.find({ type: 'Link' })
  expect(String(listen?.props.href)).toContain('https://translate.google.com/?sl=en&tl=es&text=Hi!%20What%20did')
  expect(await pane.find({ key: 'switch' })).toBeDefined()
  await pane.unmount()
})

test('a mistake is pointed at in the error color; the right form stays hidden for the learner to try', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { requests, script } = world(on)
  script.push('FIX: none\nTUTOR: What did you do last weekend?', 'FIX: go => went :: pasado\nTUTOR: Nice! When was it? Try go again.')
  await openWithCommand($)
  const pane = await mountPane($)

  await pane.input({ key: 'reply', text: 'I go to the beach with my family.' })
  expect(requests[1]?.prompt).toContain('Learner: I go to the beach with my family.')
  expect(await pane.find({ type: 'Text', text: /you +I go to the beach/ })).toBeDefined()
  const marked = await pane.find({ type: 'Text', text: /^go$/ })
  expect(marked?.props).toMatchObject({ color: '#ef9a9a', underline: true })
  expect(await pane.find({ type: 'Text', text: /went/ })).toBeUndefined()
  // The field is still there for the retry.
  expect(await pane.find({ key: 'reply' })).toBeDefined()
  await pane.unmount()
})

test('an empty Enter asks the tutor for a scaffold, never the answer', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { requests, script } = world(on)
  script.push('FIX: none\nTUTOR: What did you do last weekend?', 'Prueba: "Last weekend I ___ to ..."')
  await openWithCommand($)
  const pane = await mountPane($)

  await pane.input({ key: 'reply', text: '' })
  expect(requests[1]?.prompt).toContain('Never write a full answer')
  expect(await pane.find({ type: 'Text', text: /help +Prueba: "Last weekend I ___ to \.\.\."/ })).toBeDefined()
  // No reply was counted.
  expect(await pane.find({ type: 'Text', text: /^you/ })).toBeUndefined()
  await pane.unmount()
})

test('after three replies the unit closes; with Claude idle a split in use closes and toasts how it went', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, script, closes, toasts } = world(on)
  script.push('FIX: none\nTUTOR: Hi! Where are you from?', 'FIX: am => come :: verbo\nTUTOR: Try am again.')
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.input({ key: 'reply', text: 'I am from Caracas' })
  await pane.input({ key: 'reply', text: 'I come from Caracas' })
  expect(closes).toEqual([])
  await pane.input({ key: 'reply', text: 'It is warm' })

  expect(closes).toEqual(['lingo'])
  expect(toasts.at(-1)).toBe('lingo-pane: ✓ 3 sentences, 1 correction saved')
  expect(entries.get('activity')).toMatchObject({ version: 1, units: 1, recent: [{ activity: 'conversation', sentences: 3, corrections: 1 }] })
  await pane.unmount()
})

test('while Claude works the split stays after a unit: the summary and the next activity, one press away', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { closes, requests } = world(on)
  await openWithCommand($)
  await $.turn.start({ text: 'build it', turnId: 't1' })
  await clock.advance(2000)
  const pane = await mountPane($)
  for (const line of ['one', 'two', 'three']) await pane.input({ key: 'reply', text: line })

  expect(closes).toEqual([])
  expect(await pane.find({ type: 'Text', text: '✓ 3 sentences, 0 corrections saved' })).toBeDefined()
  expect(await pane.find({ key: 'reply' })).toBeUndefined()
  // The tutor rotates: a role-play comes next.
  const next = await pane.find({ key: 'next-unit' })
  expect(next?.props).toMatchObject({ label: 'next: role-play ▸', autoFocus: true })
  // The last reply asked the tutor to close the unit.
  expect(requests.at(-1)?.prompt).toContain('close it warmly')

  await pane.press({ key: 'next-unit' })
  expect(await pane.find({ type: 'Text', text: /role-play · B1/ })).toBeDefined()
  expect(await pane.find({ key: 'reply' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /✓ 3 sentences/ })).toBeUndefined()
  await pane.unmount()
})

test('a tutor that does not answer gives the learner their line back', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { script } = world(on)
  script.push('FIX: none\nTUTOR: Hi!', null)
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.input({ key: 'reply', text: 'Hello there' })
  expect(await pane.find({ type: 'Text', text: /send it again/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /you +Hello there/ })).toBeUndefined()
  await pane.unmount()
})

test('with the keys elsewhere the lesson is dimmed; the theme picks the colors', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { script } = world(on, { setup: { ...SAVED, theme: 'pastel' } })
  script.push('FIX: none\nTUTOR: Hi!')
  await openWithCommand($)

  const away = await mountPane($, false)
  expect((await away.find({ type: 'Text', text: /tutor +Hi!/ }))?.props.dimColor).toBe(true)
  await away.unmount()

  const here = await mountPane($, true)
  expect((await here.find({ type: 'Text', text: /tutor +Hi!/ }))?.props.dimColor).toBe(false)
  expect((await here.find({ type: 'Text', text: /^tutor\s*$/ }))?.props.color).toBe('#89dceb')
  expect((await here.find({ type: 'Text', text: /conversation · B1/ }))?.props.backgroundColor).toBe('#cba6f7')
  await here.unmount()
})

test('after five smooth units the tutor suggests the next level; it never changes it', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const recent = Array.from({ length: 4 }, (_, i) => ({ activity: 'conversation', at: `2026-10-0${i + 1}T10:00:00.000Z`, sentences: 3, corrections: 0 }))
  const { entries } = world(on, { store: { activity: { version: 1, units: 4, lastDoneAt: { conversation: '2026-10-01T10:00:00.000Z' }, recent } } })
  await openWithCommand($)
  await $.turn.start({ text: 'build it', turnId: 't1' })
  await clock.advance(2000)
  const pane = await mountPane($)
  for (const line of ['one', 'two', 'three']) await pane.input({ key: 'reply', text: line })
  expect(await pane.find({ type: 'Text', text: /You could try B2/ })).toBeDefined()
  expect(entries.get('setup')).toMatchObject({ level: 'B1' })
  await pane.unmount()
})

test('switch ▸ opens a numbered menu; review starts at once, and the conversation resumes where it was', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { requests, script } = world(on)
  script.push('FIX: none\nTUTOR: Hi! What is your job?')
  await openWithCommand($)
  const pane = await mountPane($)

  await pane.press({ key: 'switch' })
  // The field is gone while the menu is open, so the digits reach the buttons.
  expect(await pane.find({ key: 'reply' })).toBeUndefined()
  expect((await pane.find({ key: 'switch-conversation' }))?.props).toMatchObject({ hotkey: '1', label: 'conversation (current)' })
  expect((await pane.find({ key: 'switch-roleplay' }))?.props).toMatchObject({ hotkey: '2', label: 'role-play' })
  expect((await pane.find({ key: 'switch-reading' }))?.props).toMatchObject({ hotkey: '3' })
  expect((await pane.find({ key: 'switch-review' }))?.props).toMatchObject({ hotkey: '4' })

  await pane.press({ key: 'switch-review' })
  expect(await pane.find({ type: 'Text', text: /review · B1/ })).toBeDefined()
  expect(await pane.find({ key: 'answer-0' })).toBeDefined()

  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-conversation' })
  expect(await pane.find({ type: 'Text', text: /Hi! What is your job\?/ })).toBeDefined()
  expect(requests.length).toBe(1)
  await pane.unmount()
})

test('a unit that ended while Claude worked: the split goes when the turn does, with the summary', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { closes, toasts } = world(on)
  await openWithCommand($)
  await $.turn.start({ text: 'build it', turnId: 't1' })
  await clock.advance(2000)
  const pane = await mountPane($)
  for (const line of ['one', 'two', 'three']) await pane.input({ key: 'reply', text: line })
  expect(closes).toEqual([])

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(closes).toEqual(['lingo'])
  expect(toasts.at(-1)).toBe('lingo-pane: ✓ 3 sentences, 0 corrections saved')
  await pane.unmount()
})

test('a split in use with a unit still running stays when the turn completes', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { closes } = world(on)
  await openWithCommand($)
  await $.turn.start({ text: 'build it', turnId: 't1' })
  await clock.advance(2000)
  const pane = await mountPane($)
  await pane.input({ key: 'reply', text: 'one' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(5000)
  expect(closes).toEqual([])
  // A slash command is not the learner's next prompt.
  await $.prompt.submit({ text: '/lingo theme pastel', wait: false, origin: { kind: 'composer' } })
  expect(closes).toEqual([])
  await $.prompt.submit({ text: 'now the tests', wait: false, origin: { kind: 'composer' } })
  expect(closes).toEqual(['lingo'])
  await pane.unmount()
})
