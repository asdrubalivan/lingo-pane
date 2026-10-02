import { expect, test } from 'claude-code/testing'

import { scenariosFor } from './content/roleplay-scenarios'
import { generatedOpeningPrompt, parseScenario, pickScenario } from './roleplay'
import type { TutorContext } from './tutor'

test('without interests the fixed list of the level rotates, wrapping around', () => {
  const b1 = scenariosFor('B1')
  expect(pickScenario('B1', [], 0)).toEqual({ kind: 'fixed', scenario: expect.objectContaining({ id: b1[0]?.id }) })
  expect(pickScenario('B1', [], 1)).toEqual({ kind: 'fixed', scenario: expect.objectContaining({ id: b1[1]?.id }) })
  expect(pickScenario('B1', [], b1.length)).toEqual({ kind: 'fixed', scenario: expect.objectContaining({ id: b1[0]?.id }) })
  const pick = pickScenario('A1', [], 0)
  expect(pick.kind === 'fixed' && Object.keys(pick.scenario)).toEqual(['id', 'title', 'situation', 'tutorRole', 'learnerRole'])
})

test('with interests every other role-play is made up; the fixed ones still rotate', () => {
  const a2 = scenariosFor('A2')
  expect(pickScenario('A2', ['chess'], 0)).toEqual({ kind: 'fixed', scenario: expect.objectContaining({ id: a2[0]?.id }) })
  expect(pickScenario('A2', ['chess'], 1)).toEqual({ kind: 'generated' })
  expect(pickScenario('A2', ['chess'], 2)).toEqual({ kind: 'fixed', scenario: expect.objectContaining({ id: a2[1]?.id }) })
  expect(pickScenario('A2', ['chess'], 3)).toEqual({ kind: 'generated' })
})

test('a made-up role-play asks for the setting first, around the interests', () => {
  const ctx: TutorContext = {
    targetLanguage: 'English', nativeLanguage: 'Spanish', level: 'A2', interests: ['chess', 'jazz'],
    activity: 'roleplay', scenario: null, weave: [], workContext: null,
  }
  const prompt = generatedOpeningPrompt(ctx)
  expect(prompt).toContain('chess, jazz')
  expect(prompt).toContain('SCENARIO: <title')
  expect(prompt).toContain('TUTOR:')
})

test('the made-up setting is read from its line; an incomplete one is nothing', () => {
  expect(parseScenario('SCENARIO: Chess club :: You join a club. :: The club secretary. :: A new member.\nFIX: none\nTUTOR: Hi!')).toEqual({
    id: null, title: 'Chess club', situation: 'You join a club.', tutorRole: 'The club secretary.', learnerRole: 'A new member.',
  })
  expect(parseScenario('**SCENARIO:** A :: B :: C :: D')?.title).toBe('A')
  expect(parseScenario('SCENARIO: A :: B :: C')).toBeNull()
  expect(parseScenario('SCENARIO: A ::  :: C :: D')).toBeNull()
  expect(parseScenario('TUTOR: Hi!')).toBeNull()
})
