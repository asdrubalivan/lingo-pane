// The three READMEs are translations of each other and are kept in step by
// hand. This compares their heading structure (how many headings, at which
// level, in which order; the wording is translated, so it is not compared) and
// exits non-zero when a translation has drifted from README.md.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = ['README.md', 'README.es.md', 'README.fr.md']

// ATX headings only, and not the `# comments` inside fenced code.
export function headingsOf(markdown) {
  const headings = []
  let fence = null
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    const heading = !fence && line.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/)
    if (heading) headings.push({ level: heading[1].length, text: heading[2] })
  }
  return headings
}

const show = (heading) => (heading ? `${'#'.repeat(heading.level)} ${heading.text}` : 'nothing')

// `texts` maps a file name to its content; the first one is the reference.
// Returns one message per heading position where a later file disagrees.
export function compareReadmes(texts) {
  const [[reference, base], ...others] = Object.entries(texts)
  const expected = headingsOf(base)
  const problems = []
  for (const [name, text] of others) {
    const found = headingsOf(text)
    for (let i = 0; i < Math.max(expected.length, found.length); i++) {
      if (expected[i]?.level === found[i]?.level) continue
      problems.push(`${name}, heading ${i + 1}: has ${show(found[i])}, ${reference} has ${show(expected[i])}`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = compareReadmes(Object.fromEntries(files.map((name) => [name, readFileSync(join(root, name), 'utf8')])))
  if (problems.length) {
    console.error(`The READMEs differ in structure:\n${problems.map((problem) => `  ${problem}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`The ${files.length} READMEs have the same headings`)
}
