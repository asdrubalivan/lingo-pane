import { expect, test } from 'claude-code/testing'

test('the lesson pane greets with the configured languages', async $ => {
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
    expect(await ui.find({ type: 'Text', text: /Learning English from Spanish/ })).toBeDefined()
    await ui.unmount()
  }
})
