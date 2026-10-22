import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { savedMistakes } from '../src/memory-store'

// The store behind the pane: a unit closes in one step (mistakes and log on the
// same unit number), and a store that is corrupt, foreign or failing never
// breaks the pane.

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

type On = Parameters<typeof mock.store>[0]
type Dollar = Engine

// A store the test reads, writes behind the pane's back (another session) and
// can make fail on a key; a tutor that makes one mistake in the second turn.
const world = (on: On, store: Record<string, unknown> = {}) => {
  const entries = new Map<string, unknown>(Object.entries({ setup: SAVED, ...store }))
  const failing = { get: new Set<string>(), set: new Set<string>() }
  const script = ['FIX: none\nTUTOR: Where are you from?', 'FIX: am => come :: verbo\nTUTOR: Try am again.']
  const toasts: string[] = []
  let requests = 0
  on('store.get', (_$, e) => {
    if (failing.get.has(e.key)) throw new Error(`cannot read ${e.key}`)
    return { value: entries.get(e.key) }
  })
  on('store.set', (_$, e) => {
    if (failing.set.has(e.key)) throw new Error(`cannot write ${e.key}`)
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('model.complete', () => {
    requests += 1
    return { value: { isAnswered: true as const, text: script.shift() ?? 'FIX: none\nTUTOR: Tell me more.', usage: USAGE } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  return { entries, failing, toasts, requests: () => requests }
}

const openWithCommand = ($: Dollar) =>
  $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

const mountPane = ($: Dollar) =>
  $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', viewport: WIDE, props: PANE })

const finishUnit = async (pane: Awaited<ReturnType<typeof mountPane>>) => {
  await pane.input({ key: 'reply', text: 'I am from Caracas' })
  await pane.input({ key: 'reply', text: 'I come from Caracas' })
  await pane.input({ key: 'reply', text: 'It is warm' })
}

test('the mistakes and the log agree on the unit number, even when another session logged a unit meanwhile', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries } = world(on)
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.input({ key: 'reply', text: 'I am from Caracas' })
  // Another terminal finishes four units while this one is mid-unit.
  entries.set('activity', { version: 1, units: 4, lastDoneAt: { reading: '2026-10-02T11:00:00.000Z' }, done: { reading: 4 }, recent: [] })
  await pane.input({ key: 'reply', text: 'I come from Caracas' })
  await pane.input({ key: 'reply', text: 'It is warm' })

  expect(entries.get('activity')).toMatchObject({ units: 5, done: { reading: 4, conversation: 1 } })
  expect((await savedMistakes(entries)).cards.map(c => c.unit)).toEqual([5])
  await pane.unmount()
})

test('a corrupt or foreign-version log and mistakes start over instead of breaking the pane', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, requests } = world(on, { activity: 'garbage', mistakes: { version: 9, cards: [{ id: 'x' }] }, progress: [1, 2] })
  await openWithCommand($)
  expect(requests()).toBe(1)
  const pane = await mountPane($)
  await finishUnit(pane)
  expect(entries.get('activity')).toMatchObject({ version: 1, units: 1 })
  expect((await savedMistakes(entries)).cards.map(c => c.unit)).toEqual([1])
  await pane.unmount()
})

test('a store that cannot be read still opens the conversation', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { failing, requests } = world(on)
  failing.get.add('activity')
  failing.get.add('mistakes.index')
  await openWithCommand($)
  expect(requests()).toBe(1)
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /tutor +Where are you from\?/ })).toBeDefined()
  await pane.unmount()
})

test('a store that cannot be written does not break the unit: it closes and says how it went', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, failing, toasts } = world(on)
  failing.set.add('activity')
  failing.set.add('mistakes.index')
  await openWithCommand($)
  const pane = await mountPane($)
  await finishUnit(pane)
  expect(toasts.at(-1)).toBe('lingo-pane: ✓ 3 sentences, 1 correction saved')
  expect(entries.has('activity')).toBe(false)
  expect(entries.has('mistakes.index')).toBe(false)
  await pane.unmount()
})

test('a store that cannot move the old layout leaves it alone, the unit still closes, and the move happens later', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const old = { version: 1, cards: [{ id: 'mistake-old', wrong: 'is', right: 'are', note: 'plural', sentence: 'They is here.', unit: 1, createdAt: '2026-10-01T10:00:00.000Z', reviews: [] }] }
  const { entries, failing, toasts } = world(on, { mistakes: old })
  failing.get.add('mistakes')
  await openWithCommand($)
  const pane = await mountPane($)
  await finishUnit(pane)
  expect(toasts.at(-1)).toBe('lingo-pane: ✓ 3 sentences, 1 correction saved')
  expect(entries.get('mistakes')).toEqual(old)
  expect(entries.has('storage.layout')).toBe(false)
  expect(entries.has('mistakes.index')).toBe(false)
  await pane.unmount()

  failing.get.clear()
  expect((await savedMistakes(entries)).cards.map(c => c.id)).toEqual(['mistake-old'])
  expect(entries.get('mistakes')).toEqual(old)
})
