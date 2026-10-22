import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compareReadmes, headingsOf } from './check-readmes.mjs'

test('headings are read with their level, skipping fenced code', () => {
  const text = ['# Title', '', 'text', '## Two', '```sh', '# a comment, not a heading', '```', '### Three ###', '#hashtag'].join('\n')
  assert.deepEqual(headingsOf(text), [
    { level: 1, text: 'Title' },
    { level: 2, text: 'Two' },
    { level: 3, text: 'Three' },
  ])
})

test('translated headings with the same structure agree', () => {
  const english = '# x\n## What it does\n## Privacy\n### Reads\n'
  const spanish = '# x\n## Qué hace\n## Privacidad\n### Lee\n'
  assert.deepEqual(compareReadmes({ 'README.md': english, 'README.es.md': spanish }), [])
})

test('a missing, extra or re-levelled heading is reported against the first file', () => {
  const base = '# x\n## One\n## Two\n'
  const problems = compareReadmes({
    'README.md': base,
    'README.es.md': '# x\n## Uno\n',
    'README.fr.md': '# x\n## Un\n### Deux\n',
  })
  assert.equal(problems.length, 2)
  assert.match(problems[0], /README\.es\.md/)
  assert.match(problems[0], /Two/)
  assert.match(problems[1], /README\.fr\.md/)
  assert.match(problems[1], /Deux/)
})

test('an extra heading at the end is reported too', () => {
  const problems = compareReadmes({ 'README.md': '# x\n', 'README.es.md': '# x\n## Más\n' })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /Más/)
})
