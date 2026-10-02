import { expect, mock, test } from 'claude-code/testing'

// Mistakes become cards: kept when a unit closes (numbered by the unit), woven
// into the conversations where they fall due (Pimsleur by unit), carried by the
// Spinner, and first in `review`.

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'A2',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const WIDE = { columns: 200, rows: 50, isFullscreen: true }
const USAGE = { input_tokens: 1, output_tokens: 1 }
const PANE = { title: 'lingo-pane', isFocused: true, bodyColumns: 78, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'requesting' } as const

// A mistake made in unit 1, and a log that says one unit is done: it is due at unit 2.
const GO_CARD = {
  id: 'mistake-go',
  wrong: 'go',
  right: 'went',
  note: 'pasado simple',
  sentence: 'Yesterday I go to the beach.',
  unit: 1,
  createdAt: '2026-10-01T10:00:00.000Z',
  reviews: [],
}
const ONE_UNIT_DONE = {
  activity: { version: 1, units: 1, lastDoneAt: { conversation: '2026-10-01T10:00:00.000Z' }, recent: [] },
  mistakes: { version: 1, cards: [GO_CARD] },
}

type On = Parameters<typeof mock.store>[0]
type Dollar = Parameters<Parameters<typeof test>[1]>[0]
type Request = { system?: string; prompt: string }

const world = (on: On, store: Record<string, unknown> = {}) => {
  const entries = new Map<string, unknown>(Object.entries({ setup: SAVED, ...store }))
  const requests: Request[] = []
  const script: string[] = []
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('model.complete', (_$, e) => {
    requests.push({ ...e })
    return { value: { isAnswered: true as const, text: script.shift() ?? 'FIX: none\nTUTOR: Tell me more.', usage: USAGE } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'Spinner' }, (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
  })
  return { entries, requests, script }
}

const openWithCommand = ($: Dollar) =>
  $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

const mountPane = ($: Dollar) =>
  $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', viewport: WIDE, props: PANE })

test('a closed unit keeps its corrections as cards, numbered by the unit', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, script } = world(on)
  script.push('FIX: none\nTUTOR: What did you do yesterday?', 'FIX: go => went :: pasado\nTUTOR: Yesterday? Try go again.')
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.input({ key: 'reply', text: 'Yesterday I go to the beach.' })
  // Not before the unit closes.
  expect(entries.get('mistakes')).toBeUndefined()
  await pane.input({ key: 'reply', text: 'Yesterday I went to the beach.' })
  await pane.input({ key: 'reply', text: 'It was sunny.' })

  const saved = entries.get('mistakes') as { cards: Record<string, unknown>[] }
  expect(saved.cards).toEqual([
    expect.objectContaining({ wrong: 'go', right: 'went', note: 'pasado', sentence: 'Yesterday I go to the beach.', unit: 1, reviews: [] }),
  ])
  await pane.unmount()
})

test('a due mistake is woven into the next conversation and counts as reviewed when the learner uses it', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, requests } = world(on, ONE_UNIT_DONE)
  await openWithCommand($)
  expect(requests[0]?.system).toContain('"went" (they once wrote "go")')

  const pane = await mountPane($)
  for (const line of ['I went to the park.', 'It was fun.', 'Yes.']) await pane.input({ key: 'reply', text: line })
  const saved = entries.get('mistakes') as { cards: { id: string; reviews: { isCorrect: boolean }[] }[] }
  expect(saved.cards.find(c => c.id === 'mistake-go')?.reviews.map(r => r.isCorrect)).toEqual([true])
  await pane.unmount()
})

test('the Spinner carries the learner\'s own due mistake', async ($, on) => {
  const clock = mock.clock(on)
  world(on, ONE_UNIT_DONE)
  await $.turn.start({ text: 'build it', turnId: 'turn-1' })
  await clock.advance(2000)
  const ui = await $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Spinner', requestId: 'main', props: SPINNER })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('Sauteing… · go → went')
  await ui.unmount()
})

test('review: due mistakes come first, as the learner\'s own line with the wrong words marked', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries } = world(on, ONE_UNIT_DONE)
  const pane = await mountPane($)
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-review' })

  expect(await pane.find({ type: 'Text', text: /Your mistake - card 1 of 6/ })).toBeDefined()
  expect((await pane.find({ type: 'Text', text: /^go$/ }))?.props).toMatchObject({ color: '#ef9a9a', underline: true })
  await pane.input({ key: 'answer-0', text: 'Went' })
  expect(await pane.find({ type: 'Text', text: 'Correct: went' })).toBeDefined()

  const saved = entries.get('mistakes') as { cards: { reviews: { isCorrect: boolean }[] }[] }
  expect(saved.cards[0]?.reviews.map(r => r.isCorrect)).toEqual([true])
  // The pack's progress does not get the mistake's attempt.
  expect((entries.get('progress') as { cards: Record<string, unknown> } | undefined)?.cards?.['mistake-go']).toBeUndefined()

  // Then the pack's lesson goes on as before.
  await pane.press({ key: 'next' })
  expect(await pane.find({ type: 'Text', text: /Lesson 1 - card 2 of 6 \(new\)/ })).toBeDefined()
  await pane.unmount()
})

test('an empty Enter on a mistake card shows the right words and why', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  world(on, ONE_UNIT_DONE)
  const pane = await mountPane($)
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-review' })
  await pane.input({ key: 'answer-0', text: '' })
  expect(await pane.find({ type: 'Text', text: 'Answer: went' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'pasado simple' })).toBeDefined()
  await pane.unmount()
})
