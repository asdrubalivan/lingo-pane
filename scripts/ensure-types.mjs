// The engine writes `.claude-plugin/types` (the plugin API's declarations) when
// it loads a mod, and git ignores them. This loads the mod once with an empty
// HOME, so no credentials, settings or model call are involved, and checks the
// files appeared. It does nothing when they are already there (`--force` redoes
// them, e.g. after a Claude Code update).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const declarations = '.claude-plugin/types/claude-code/index.d.ts'

if (existsSync(declarations) && !process.argv.includes('--force')) process.exit(0)

const home = mkdtempSync(join(tmpdir(), 'lingo-pane-home-'))
try {
  spawnSync('claude', ['--plugin-dir', '.', '-p', 'types'], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    stdio: 'ignore',
    timeout: 60_000,
  })
} finally {
  rmSync(home, { recursive: true, force: true })
}

if (!existsSync(declarations)) {
  console.error(`Could not generate ${declarations}. Run "npm install" first, then see "Contributing" in README.md.`)
  process.exit(1)
}
console.log(`Wrote ${declarations}`)
