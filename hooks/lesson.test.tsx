import { expect, mock, test } from 'claude-code/testing'

import { DEMO_CARDS } from '../src/content/demo-english-a1'

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'A1',
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

type On = Parameters<typeof mock.store>[0]

const memoryStore = (on: On, initial: Record<string, unknown>) => {
  const entries = new Map<string, unknown>(Object.entries(initial))
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  return entries
}

const mountPane = ($: Parameters<Parameters<typeof test>[1]>[0], surface: 'terminal' | 'desktop') =>
  $.ui.mount({
    plugin: 'lingo-pane',
    surface,
    component: 'Pane',
    requestId: 'lingo',
    viewport: { columns: 100, rows: 30 },
    props: PANE_PROPS,
  })

const USAGE = { input_tokens: 1, output_tokens: 1 }

// The flashcard practice is the `review` activity now: reached through `switch ▸`,
// and started at once (zero clicks).
const toReview = async (pane: Awaited<ReturnType<typeof mountPane>>) => {
  await pane.press({ key: 'switch' })
  await pane.press({ key: 'switch-review' })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`lesson 1 end to end on ${surface}: a miss with a hint, a correct answer, a reveal, and progress`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
    const entries = memoryStore(on, { setup: SAVED })
    const pane = await mountPane($, surface)
    const [first, second] = DEMO_CARDS.filter(c => c.lesson === 1)

    await toReview(pane)
    expect(await pane.find({ type: 'Text', text: first.prompt })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /card 1 of 5 \(new\)/ })).toBeDefined()

    // Wrong: a deterministic hint, and the same card again.
    await pane.input({ key: 'answer-0', text: 'Helo there' })
    expect(await pane.find({ type: 'Text', text: /Not yet\. Starts with/ })).toBeDefined()
    expect(await pane.find({ key: 'answer-0' })).toBeDefined()
    expect(await pane.find({ key: 'next' })).toBeUndefined()

    // Right (case and punctuation do not matter), then Next.
    await pane.input({ key: 'answer-0', text: `  ${first.answer.toUpperCase()}! ` })
    expect(await pane.find({ type: 'Text', text: /Correct/ })).toBeDefined()
    await pane.press({ key: 'next' })
    expect(await pane.find({ type: 'Text', text: second.prompt })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /card 2 of 5/ })).toBeDefined()

    // An empty Enter shows the answer: counts as a miss, then Next.
    await pane.input({ key: 'answer-1', text: '' })
    expect(await pane.find({ type: 'Text', text: `Answer: ${second.answer}` })).toBeDefined()
    await pane.press({ key: 'next' })

    const progress = entries.get('progress') as { currentLesson: number; cards: Record<string, { reviews: { isCorrect: boolean }[] }> }
    expect(progress.currentLesson).toBe(1)
    expect(progress.cards[first.id].reviews.map(r => r.isCorrect)).toEqual([false, true])
    expect(progress.cards[second.id].reviews.map(r => r.isCorrect)).toEqual([false])
    await pane.unmount()
  })
}

test('finishing the lesson says so and moves to lesson 2, whose recall block is lesson 1', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const entries = memoryStore(on, { setup: SAVED })
  const pane = await mountPane($, 'terminal')
  await toReview(pane)
  for (const card of DEMO_CARDS.filter(c => c.lesson === 1)) {
    await pane.input({ key: `answer-${DEMO_CARDS.filter(c => c.lesson === 1).indexOf(card)}`, text: card.answer })
    await pane.press({ key: 'next' })
  }
  expect(await pane.find({ type: 'Text', text: 'Lesson 1 done' })).toBeDefined()
  expect((entries.get('progress') as { currentLesson: number }).currentLesson).toBe(2)

  await pane.press({ key: 'continue' })
  expect(await pane.find({ type: 'Text', text: /Lesson 2 of 6: 5 to recall, 5 new/ })).toBeDefined()
  await pane.unmount()
})

test('after lesson 6 the pane says the demo is finished', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  memoryStore(on, { setup: SAVED, progress: { version: 1, currentLesson: 7, cards: {} } })
  const pane = await mountPane($, 'terminal')
  await toReview(pane)
  expect(await pane.find({ type: 'Text', text: /Demo finished/ })).toBeDefined()
  expect(await pane.find({ key: 'start' })).toBeUndefined()
  await pane.unmount()
})

test('corrupt progress starts at lesson 1', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  memoryStore(on, { setup: SAVED, progress: { version: 9, currentLesson: 'x' } })
  const pane = await mountPane($, 'terminal')
  await toReview(pane)
  expect(await pane.find({ type: 'Text', text: /Lesson 1 - card 1 of 5/ })).toBeDefined()
  await pane.unmount()
})

test('the tutor hint sends a capped low-effort request and never shows the answer', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  memoryStore(on, { setup: SAVED })
  const [first] = DEMO_CARDS.filter(c => c.lesson === 1)
  const requests: { system?: string; prompt: string; effort?: string; maxTokens?: number; timeoutMs?: number }[] = []
  let reply = { isAnswered: true as const, text: 'Piensa en cómo saludas al llegar.', usage: USAGE }
  on('model.complete', (_$, e) => {
    requests.push(e)
    return { value: reply }
  })

  const pane = await mountPane($, 'terminal')
  await toReview(pane)
  await pane.input({ key: 'answer-0', text: 'bye' })
  await pane.press({ key: 'tutor' })
  expect(requests.length).toBe(1)
  expect(requests[0]).toMatchObject({ effort: 'low', maxTokens: 200 })
  expect(requests[0].timeoutMs).toBeGreaterThan(0)
  expect(requests[0].system).toMatch(/tutor/)
  expect(requests[0].prompt).toContain(first.prompt)
  expect(requests[0].prompt).toContain('"bye"')
  expect(await pane.find({ type: 'Text', text: /tutor +Piensa en cómo saludas/ })).toBeDefined()

  // A reply that leaks the answer is dropped.
  reply = { isAnswered: true, text: `It is ${first.answer}.`, usage: USAGE }
  await pane.press({ key: 'tutor' })
  expect(await pane.find({ type: 'Text', text: /It is/ })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: /give the answer away|given the answer away/ })).toBeDefined()
  await pane.unmount()
})

test('a tutor that does not answer shows a short message and the lesson goes on', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  memoryStore(on, { setup: SAVED })
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: USAGE } }))
  const [first] = DEMO_CARDS.filter(c => c.lesson === 1)

  const pane = await mountPane($, 'terminal')
  await toReview(pane)
  await pane.press({ key: 'tutor' })
  expect(await pane.find({ type: 'Text', text: /tutor is not available/ })).toBeDefined()
  await pane.input({ key: 'answer-0', text: first.answer })
  expect(await pane.find({ type: 'Text', text: /Correct/ })).toBeDefined()
  await pane.unmount()
})
