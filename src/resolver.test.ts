import { expect, test } from 'claude-code/testing'

import { DEMO_PACK_ID } from './content/demo-english-a1'
import { REGISTRY, resolveStrategies, strategiesFor } from './resolver'
import { DEFAULT_STRATEGIES, STRATEGY_AXES, buildSetup, draftFromConfig } from './setup'
import type { LingoSetup, LingoStrategyChoices } from '../types'

const setupFor = (target: string, native: string): LingoSetup => {
  const setup = buildSetup({ ...draftFromConfig(native, target), level: 'B1' }, '2026-10-02T10:00:00.000Z')
  if (setup === null) throw new Error('the fixture setup is not valid')
  return setup
}

test('the saved choices become the implementations that do the work', () => {
  const strategies = resolveStrategies(DEFAULT_STRATEGIES)
  expect(strategies?.correctionStyle.id).toBe('socratic')
  expect(strategies?.reviewAlgorithm.id).toBe('pimsleur')
  expect(strategies?.contentStore.id).toBe('local')
  expect(strategies?.activityLog.id).toBe('local')
})

test('a choice nobody built resolves to nothing', () => {
  for (const axis of Object.keys(DEFAULT_STRATEGIES) as (keyof LingoStrategyChoices)[]) {
    expect(resolveStrategies({ ...DEFAULT_STRATEGIES, [axis]: 'not-a-strategy' })).toBeNull()
  }
})

test('an option the setup offers as built resolves, and one it does not offer as built does not', () => {
  for (const info of STRATEGY_AXES) {
    for (const option of info.options) {
      const resolved = resolveStrategies({ ...DEFAULT_STRATEGIES, [info.axis]: option.id }) !== null
      expect(resolved, `${info.axis}: ${option.id}`).toBe(option.isImplemented)
    }
  }
})

test('everything registered is offered as built in the setup, so setup validation cannot refuse a working choice', () => {
  for (const info of STRATEGY_AXES) {
    const built = info.options.filter(o => o.isImplemented).map(o => o.id)
    expect(Object.keys(REGISTRY[info.axis]).sort(), info.axis).toEqual(built.sort())
  }
})

test('a saved setup that names something unregistered still gets working strategies: the defaults', () => {
  const forged: LingoSetup = { ...setupFor('English', 'Spanish'), strategies: { ...DEFAULT_STRATEGIES, reviewAlgorithm: 'fsrs' } }
  expect(strategiesFor(forged).reviewAlgorithm.id).toBe('pimsleur')
})

test('the pack follows the learner\'s language pair, not a pair written in the pane', () => {
  const english = strategiesFor(setupFor('English', 'Spanish'))
  expect(english.pack.id).toBe(DEMO_PACK_ID)
  expect(english.pack.isForPair).toBe(true)
  const ukrainian = strategiesFor(setupFor('Ukrainian', 'English'))
  expect(ukrainian.pack.id).toBe(DEMO_PACK_ID)
  expect(ukrainian.pack.isForPair).toBe(false)
})

test('before the setup is done the defaults are in force', () => {
  const pending = strategiesFor(null)
  expect(pending.correctionStyle.id).toBe('socratic')
  expect(pending.activityLog.id).toBe('local')
  expect(pending.pack.isForPair).toBe(false)
})
