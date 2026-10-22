// The engine writes `.claude-plugin/types` (the plugin API's declarations) when
// it loads a mod, and git ignores them. This loads the mod once with an empty
// HOME, so no credentials, settings or model call are involved, and checks the
// files appeared. It does nothing when they are already there and were written
// by the pinned Claude Code (`--force` redoes them regardless).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const declarations = join(root, '.claude-plugin/types/claude-code/index.d.ts')
const pinned = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies['@anthropic-ai/claude-code']

// The first line of the file names the Claude Code version that wrote it.
const writtenBy = () => (existsSync(declarations) ? readFileSync(declarations, 'utf8').match(/^\/\/ Written by Claude Code (\d+\.\d+\.\d+)\./)?.[1] : undefined)

if (writtenBy() === pinned && !process.argv.includes('--force')) process.exit(0)

const home = mkdtempSync(join(tmpdir(), 'lingo-pane-home-'))
let run
try {
  run = spawnSync('claude', ['--plugin-dir', root, '-p', 'types'], {
    cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
    timeout: 60_000,
  })
} finally {
  rmSync(home, { recursive: true, force: true })
}

if (writtenBy() !== pinned) {
  console.error(`Could not write the plugin API types for Claude Code ${pinned} (found: ${writtenBy() ?? 'none'}).`)
  if (run.error) console.error(`claude: ${run.error.message} (run "npm ci" first, and use "npm run", so the pinned binary is on the PATH)`)
  else console.error(`claude exited with ${run.status}:\n${(run.stderr || run.stdout || '').trim().slice(-500)}`)
  process.exit(1)
}
console.log(`Wrote the plugin API types for Claude Code ${pinned}`)
