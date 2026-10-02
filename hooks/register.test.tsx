import { expect, mock, test } from 'claude-code/testing'

const SAVED = {
  version: 1,
  targetLanguage: 'English',
  nativeLanguage: 'Spanish',
  level: 'B1',
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-02T10:00:00.000Z',
}

test('once set up, the lesson pane greets with the saved languages and level', async ($, on) => {
  mock.store(on, { setup: SAVED })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'lingo-pane',
      surface,
      component: 'Pane',
      requestId: 'lingo',
      viewport: { columns: 100, rows: 30 },
      props: {
        title: 'lingo-pane',
        isFocused: true,
        bodyColumns: 98,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 28 },
        view: {},
      },
    })
    expect(await ui.find({ type: 'Text', text: /Learning English from Spanish, level B1/ })).toBeDefined()
    expect(await ui.find({ key: 'native-0' })).toBeUndefined()
    await ui.unmount()
  }
})
