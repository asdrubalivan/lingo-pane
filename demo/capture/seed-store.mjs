// Writes a finished setup into the demo config dir's plugin store, so a recording
// starts on the lesson and not on the seven-step wizard (that one is driven by
// Tab and is easy to knock out of focus, see demo/README.md).
//
// Close the recorded session first: Claude Code rewrites the store file.
// Usage: DEMO_CONFIG_DIR=<dir> node demo/capture/seed-store.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const configDir = process.env.DEMO_CONFIG_DIR
if (!configDir) throw new Error('Set DEMO_CONFIG_DIR to the demo Claude config dir.')

const storeDir = join(configDir, 'plugins', 'store')
const file = readdirSync(storeDir).find(name => /^lingo-pane_.*\.json$/.test(name))
if (!file) throw new Error(`No lingo-pane store in ${storeDir}: start the mod once so it creates it.`)

const path = join(storeDir, file)
const store = JSON.parse(readFileSync(path, 'utf8'))

store.setup = {
  version: 1,
  nativeLanguage: 'Spanish',
  targetLanguage: 'English',
  level: 'B1',
  interests: ['cooking', 'chess', 'startups'],
  strategies: { contentStore: 'local', reviewAlgorithm: 'pimsleur', correctionStyle: 'socratic', activityLog: 'local' },
  completedAt: '2026-10-28T12:00:00.000Z',
}

writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`)
console.log(`Seeded setup in ${path}`)

// A permission ask mid-take makes the split say "Claude needs you" and hand the
// keyboard to the dialog, so the learner's typing lands in the prompt. The take
// only asks Claude for a read-only audit: allow the tools in the demo config dir
// (a throwaway one; never do this in a real one).
const settingsPath = join(configDir, 'settings.json')
let settings = {}
try {
  settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
} catch {}
settings.permissions = { ...settings.permissions, allow: ['Read', 'Glob', 'Grep', 'Bash'] }
writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
console.log(`Allowed read-only tools in ${settingsPath}`)
