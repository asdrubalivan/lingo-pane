import { expect, test } from 'claude-code/testing'

import { DEMO_PACK_ID } from './content/demo-english-a1'
import { resolveStrategies, strategiesFor } from './resolver'
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

test('exactly the options the setup offers as built resolve; the rest are refused there and here', () => {
  for (const info of STRATEGY_AXES) {
    for (const option of info.options) {
      const resolved = resolveStrategies({ ...DEFAULT_STRATEGIES, [info.axis]: option.id }) !== null
      expect({ axis: info.axis, id: option.id, resolved }).toEqual({ axis: info.axis, id: option.id, resolved: option.isImplemented })
    }
  }
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
