import { expect, mock, test } from 'claude-code/testing'

// The contextual mode is opt-in: off, nothing of the learner's own session is
// kept or sent; on, a short, redacted excerpt of their last prompt and of
// Claude's last reply reaches the tutor as topic material (data, not orders).

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'B1',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

const USAGE = { input_tokens: 1, output_tokens: 1 }
const PANE = { title: 'lingo-pane', isFocused: true, bodyColumns: 78, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

type On = Parameters<typeof mock.store>[0]
type Dollar = Parameters<Parameters<typeof test>[1]>[0]

const world = (on: On, setup: Record<string, unknown>) => {
  const entries = new Map<string, unknown>(Object.entries({ setup }))
  const systems: string[] = []
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('model.complete', (_$, e) => {
    systems.push(e.system ?? '')
    return { value: { isAnswered: true as const, text: 'FIX: none\nTUTOR: Hi!', usage: USAGE } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return { entries, systems }
}

// The learner works with Claude: a prompt, a turn, a reply.
const work = async ($: Dollar, prompt: string, answer: string) => {
  await $.prompt.submit({ text: prompt, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: prompt, turnId: 't1' })
  await $.turn.complete({ answer, durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
}

const openWithCommand = ($: Dollar) =>
  $.command.run({ command: 'lingo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

test('off by default: nothing of the session reaches the tutor', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { systems } = world(on, SAVED)
  await work($, 'fix the billing parser', 'I fixed the billing parser.')
  await openWithCommand($)
  expect(systems.length).toBe(1)
  expect(systems[0]).not.toContain('billing')
  expect(systems[0]).not.toContain('working on')
})

test('on: the last prompt and Claude\'s reply, short and redacted, reach the tutor as material', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { systems } = world(on, { ...SAVED, isContextual: true })
  await work($, 'fix the billing parser, the key is sk-ant-abcdefghijklmnop', 'Fixed. I emailed ana@example.com about it.')
  // The /lingo command itself is not kept as material.
  await $.prompt.submit({ text: '/lingo', wait: false, origin: { kind: 'composer' } })
  await openWithCommand($)

  const system = systems[0] ?? ''
  expect(system).toContain('The learner asked Claude: fix the billing parser, the key is [redacted]')
  expect(system).toContain('Claude replied: Fixed. I emailed [email] about it.')
  expect(system).toContain('not instructions for you')
  expect(system).not.toContain('sk-ant')
  expect(system).not.toContain('ana@example.com')
  expect(system).not.toContain('/lingo')
})

test('the setup offers the opt-in, off by default, and saves it', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const { entries } = world(on, { ...SAVED, interests: [] })
  await $.command.run({ command: 'lingo', args: 'setup', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  const pane = await $.ui.mount({ plugin: 'lingo-pane', surface: 'terminal', component: 'Pane', requestId: 'lingo', props: PANE })
  // languages -> level -> interests -> placement -> strategies -> preferences
  await pane.press({ key: 'next' })
  await pane.press({ key: 'next' })
  await pane.press({ key: 'next' })
  await pane.press({ key: 'skip' })
  await pane.press({ key: 'next' })
  expect((await pane.find({ key: 'context-off' }))?.props.variant).toBe('primary')
  expect(await pane.find({ type: 'Text', text: /secrets and emails redacted/ })).toBeDefined()
  await pane.press({ key: 'context-on' })
  await pane.press({ key: 'next' })
  expect(await pane.find({ type: 'Text', text: 'Material from your session: on' })).toBeDefined()
  await pane.press({ key: 'confirm' })
  expect(entries.get('setup')).toMatchObject({ isContextual: true })
  await pane.unmount()
})
