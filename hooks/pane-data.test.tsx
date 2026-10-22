import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { DEMO_CARDS } from '../src/content/demo-english-a1'
import { savedMistakes, savedProgress } from '../src/memory-store'
import type { LingoPaneData } from '../types'

// The pane redraws from `$.state` alone: what it needs of the store (the activity
// log; progress and mistakes for the review) is mirrored when the pane opens and
// after every write, so the redraw every second while Claude works reads no
// storage and is never stale. After /clear, /resume and /branch the mirror is
// rebuilt from the store.

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
  activity: { version: 1, units: 1, lastDoneAt: { conversation: '2026-10-01T10:00:00.000Z' }, done: { conversation: 1 }, recent: [] },
  mistakes: { version: 1, cards: [GO_CARD] },
}

const READING = [
  'TITLE: A chess club',
  'TEXT: Ana goes to a chess club every Tuesday.',
  'Q1: When does Ana go to the club? :: Tuesday',
  'Q2: Where is the club? :: an old library',
].join('\n')

type On = Parameters<typeof mock.store>[0]
type Dollar = Engine

// The engine beneath the plugin: a store the test reads, writes behind the pane's
// back (another session) and whose reads it counts, and a tutor from a script.
const world = (on: On, store: Record<string, unknown> = {}) => {
  const entries = new Map<string, unknown>(Object.entries({ setup: SAVED, ...store }))
  const script: string[] = []
  const reads = { count: 0 }
  const failing = { get: new Set<string>() }
  on('store.get', (_$, e) => {
    reads.count += 1
    if (failing.get.has(e.key)) throw new Error(`cannot read ${e.key}`)
    return { value: entries.get(e.key) }
  })
  on('store.set', (_$, e) => {
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('model.complete', () => ({
    value: { isAnswered: true as const, text: script.shift() ?? 'FIX: none\nTUTOR: Tell me more.', usage: USAGE },
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('classic.SessionStart', () => ({}))
  return { entries, script, reads, failing }
}

// The session starts (the setup is mirrored), then the person types /lingo.
const openWithCommand = async ($: Dollar) => {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  return $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
}

const mountPane = ($: Dollar) =>
  $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', viewport: WIDE, props: PANE })

type Pane = Awaited<ReturnType<typeof mountPane>>

// The test's `$` has no `$.state`: the mirror is watched through the events that
// carry it, and `reset` makes the next reads answer as /clear leaves it (never written).
const watchMirror = (on: On) => {
  let held: LingoPaneData | undefined
  let isReset = false
  on('state.set', { plugin: 'lingo-pane', key: 'paneData' }, (_$, e, next) => {
    held = e.value as LingoPaneData
    isReset = false
    return next(e)
  })
  on('state.get', { plugin: 'lingo-pane', key: 'paneData' }, (_$, e, next) => (isReset ? { value: { value: undefined, version: 0 } } : next(e)))
  return {
    held: () => held,
    reset: () => {
      isReset = true
    },
  }
}

// The mirror holds what the store holds, value for value.
const expectMirrorOf = async (held: LingoPaneData | undefined, entries: Map<string, unknown>) => {
  expect(held?.isLoaded).toBe(true)
  expect(held?.log).toMatchObject((entries.get('activity') ?? { units: 0 }) as object)
  expect(held?.mistakes).toMatchObject(await savedMistakes(entries))
  expect(held?.progress).toMatchObject(await savedProgress(entries, DEMO_CARDS.map(c => c.id)))
}

const toActivity = async (pane: Pane, activity: 'conversation' | 'roleplay' | 'reading' | 'review') => {
  await pane.press({ key: 'switch' })
  await pane.press({ key: `switch-${activity}` })
}

const finishConversation = async (pane: Pane) => {
  for (const line of ['I went to the park.', 'It was fun.', 'Yes.']) await pane.input({ key: 'reply', text: line })
}

for (const activity of ['conversation', 'roleplay', 'review'] as const) {
  test(`the redraw every second reads no store while Claude works: ${activity}`, async ($, on) => {
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const { reads } = world(on, ONE_UNIT_DONE)
    await openWithCommand($)
    const pane = await mountPane($)
    if (activity !== 'conversation') await toActivity(pane, activity)
    await $.turn.start({ text: 'build it', turnId: 't1' })

    // Once per turn, when its delay ends, the Spinner's card is picked (a read, outside any drawing).
    await clock.advance(2000)
    reads.count = 0
    await clock.advance(5000)
    // It did redraw (the elapsed time moved), and not one read came with it.
    expect(await pane.find({ type: 'Text', text: /Claude working · 7s/ })).toBeDefined()
    expect(reads.count).toBe(0)
    await pane.unmount()
  })
}

test('the mirror is loaded when the pane opens, with what the store held before', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries } = world(on, ONE_UNIT_DONE)
  const watch = watchMirror(on)
  await openWithCommand($)
  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()?.mistakes.cards.map(c => c.id)).toEqual(['mistake-go'])
})

test('a store that fails when the mirror is refreshed leaves it as it was, not empty', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, failing } = world(on, ONE_UNIT_DONE)
  const watch = watchMirror(on)
  await openWithCommand($)
  const pane = await mountPane($)
  const loaded = watch.held()
  expect(loaded?.log.units).toBe(1)

  failing.get.add('activity')
  await $.classic.SessionStart({ source: 'resume' })
  expect(watch.held()).toBe(loaded)

  failing.get.clear()
  await $.classic.SessionStart({ source: 'resume' })
  await expectMirrorOf(watch.held(), entries)
  await pane.unmount()
})

test('a mirror that could not be loaded is tried again every second while Claude works, and then reads nothing', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, reads, failing } = world(on, ONE_UNIT_DONE)
  const watch = watchMirror(on)
  failing.get.add('activity')
  await openWithCommand($)
  const pane = await mountPane($)
  expect(watch.held()).toBeUndefined()

  await $.turn.start({ text: 'build it', turnId: 't1' })
  failing.get.clear()
  await clock.advance(1000)
  await expectMirrorOf(watch.held(), entries)

  await clock.advance(1000)
  reads.count = 0
  await clock.advance(3000)
  expect(reads.count).toBe(0)
  await pane.unmount()
})

test('a store that cannot be read when the pane draws shows nothing and breaks nothing, and the next refresh recovers', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, failing } = world(on, ONE_UNIT_DONE)
  const watch = watchMirror(on)
  await openWithCommand($)
  const pane = await mountPane($)
  const loaded = watch.held()

  // State reset (as /clear leaves it) and a store that fails: the pane draws, the mirror is not touched.
  failing.get.add('mistakes.index')
  watch.reset()
  await pane.redraw()
  expect(watch.held()).toBe(loaded)

  failing.get.clear()
  await $.classic.SessionStart({ source: 'resume' })
  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()).not.toBe(loaded)
  await pane.unmount()
})

test('a closed unit refreshes the mirror: the button offers the activity after the one just done', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries } = world(on)
  const watch = watchMirror(on)
  await openWithCommand($)
  const pane = await mountPane($)
  expect(watch.held()?.log.units).toBe(0)
  await finishConversation(pane)

  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()?.log.units).toBe(1)
  expect((await pane.find({ key: 'next-unit' }))?.props.label).toBe('next: role-play ▸')
  await pane.unmount()
})

test('answering a review card refreshes the mirror: a mistake card, then a card of the pack', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries } = world(on, ONE_UNIT_DONE)
  const watch = watchMirror(on)
  await openWithCommand($)
  const pane = await mountPane($)
  await toActivity(pane, 'review')

  await pane.input({ key: 'answer-0', text: 'Went' })
  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()?.mistakes.cards[0]?.reviews.map(r => r.isCorrect)).toEqual([true])

  await pane.press({ key: 'next' })
  const first = DEMO_CARDS.find(c => c.lesson === 1)
  await pane.input({ key: 'answer-1', text: first?.answer ?? '' })
  await expectMirrorOf(watch.held(), entries)
  expect(Object.keys(watch.held()?.progress.cards ?? {})).toEqual([first?.id])
  await pane.unmount()
})

test('showing a review answer counts as a miss and refreshes the mirror', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries } = world(on, ONE_UNIT_DONE)
  const watch = watchMirror(on)
  await openWithCommand($)
  const pane = await mountPane($)
  await toActivity(pane, 'review')

  await pane.input({ key: 'answer-0', text: '' })
  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()?.mistakes.cards[0]?.reviews.map(r => r.isCorrect)).toEqual([false])
  await pane.unmount()
})

test('finishing the review lesson refreshes the mirror: the intro is lesson 2 at once', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries } = world(on)
  const watch = watchMirror(on)
  await openWithCommand($)
  const pane = await mountPane($)
  await toActivity(pane, 'review')
  for (const [at, card] of DEMO_CARDS.filter(c => c.lesson === 1).entries()) {
    await pane.input({ key: `answer-${at}`, text: card.answer })
    await pane.press({ key: 'next' })
  }

  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()?.progress.currentLesson).toBe(2)
  await pane.press({ key: 'continue' })
  expect(await pane.find({ type: 'Text', text: /Lesson 2 of 6: 5 to recall, 5 new/ })).toBeDefined()
  await pane.unmount()
})

test('a reading answer shown as a card refreshes the mirror, and so does the unit it ends', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, script } = world(on, ONE_UNIT_DONE)
  const watch = watchMirror(on)
  script.push('FIX: none\nTUTOR: Hello.', READING)
  await openWithCommand($)
  const pane = await mountPane($)
  await toActivity(pane, 'reading')

  await pane.input({ key: 'reading-answer', text: '' })
  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()?.mistakes.cards.map(c => c.sentence)).toContain('When does Ana go to the club?')

  await pane.input({ key: 'reading-answer', text: 'an old library' })
  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()?.log.units).toBe(2)
  await pane.unmount()
})

test('leaving a unit half done for another keeps its mistakes, and the mirror has them', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries, script } = world(on)
  const watch = watchMirror(on)
  script.push('FIX: none\nTUTOR: Where are you from?', 'FIX: am => come :: verbo\nTUTOR: Try am again.')
  await openWithCommand($)
  const pane = await mountPane($)
  await pane.input({ key: 'reply', text: 'I am from Caracas' })
  await toActivity(pane, 'roleplay')

  await expectMirrorOf(watch.held(), entries)
  expect(watch.held()?.mistakes.cards.map(c => c.wrong)).toEqual(['am'])
  await pane.unmount()
})

for (const [source, command] of [['clear', '/clear'], ['resume', '/resume'], ['fork', '/branch']] as const) {
  test(`after ${command} the pane still draws from the store, and the mirror is rebuilt`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const { entries, reads } = world(on)
    const watch = watchMirror(on)
    await openWithCommand($)
    const pane = await mountPane($)
    await finishConversation(pane)
    expect((await pane.find({ key: 'next-unit' }))?.props.label).toBe('next: role-play ▸')

    // Another session did a role-play meanwhile; this one's state is reset.
    entries.set('activity', {
      version: 1,
      units: 2,
      lastDoneAt: { conversation: '2026-10-02T12:00:00.000Z', roleplay: '2026-10-02T12:01:00.000Z' },
      done: { conversation: 1, roleplay: 1 },
      recent: [],
    })
    watch.reset()
    await pane.redraw()
    // Nothing mirrored: the store is read, as before.
    expect((await pane.find({ key: 'next-unit' }))?.props.label).toBe('next: reading ▸')

    await $.classic.SessionStart({ source })
    await expectMirrorOf(watch.held(), entries)
    reads.count = 0
    await pane.redraw()
    expect((await pane.find({ key: 'next-unit' }))?.props.label).toBe('next: reading ▸')
    expect(reads.count).toBe(0)
    await pane.unmount()
  })
}
