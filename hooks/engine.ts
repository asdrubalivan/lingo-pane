import type { EngineInterface, PluginState } from 'claude-code'

import { NO_DRAFT } from '../src/draft'
import { ACTIVITY, MISTAKES, SETUP, load, tryLoad } from '../src/storage'
import type { Store } from '../src/storage'
import type { WaitEvent } from '../src/wait-machine'
import { transition } from '../src/wait-machine'
import type { LingoSetup } from '../types'
import { NO_PANE_VALUES, PACK_PROGRESS, PANE } from './state'
import type { PaneValues } from './state'

// The engine, as the rest of the mod sees it.
//
// The engine reads what a hooks module does with `$` off that file's source: `$` is never
// handed to a function in another file, and `$.state` takes references written in the file
// itself. So `register.tsx` is the one place that spells `$`, and it builds this port from it
// (closures that call `$.noun.event(...)` literally, and a cell per state atom). Everything else takes
// the port, which also lets it run against a fake.

/** One value in `$.state`: the atom's reads and writes, without the atom. */
type Cell<T> = {
  read: () => Promise<T>
  update: (change: (value: T) => T) => Promise<T>
}

type Mod = PluginState['lingo-pane']

export type Engine = {
  store: Store
  clock: Pick<EngineInterface['clock'], 'now' | 'after' | 'every'>
  ui: Pick<EngineInterface['ui'], 'open' | 'close' | 'panes' | 'focus' | 'toast' | 'invalidate' | 'resolve'>
  model: Pick<EngineInterface['model'], 'complete'>
  command: Pick<EngineInterface['command'], 'register'>
  // The waiting-state trigger and the split's standing.
  wait: Cell<Mod['wait']>
  // Guided setup: the saved setup lives in the store (the source of truth); `setupCache`
  // mirrors it so the band and the Spinner redraw when it changes, and `$.state` resets
  // on /clear, hence the fallback to the store whenever the mirror is not loaded.
  setupWizard: Cell<Mod['setupWizard']>
  setupCache: Cell<Mod['setupCache']>
  setupBand: Cell<Mod['setupBand']>
  // What the pane needs of the store, mirrored so the redraw every second while Claude
  // works reads no storage. Loaded when the pane opens and after each write.
  paneData: Cell<Mod['paneData']>
  // Where the learner is in the review right now (progress lives in the store).
  practice: Cell<Mod['practice']>
  // The lesson in the split: the activity on screen and its micro-unit.
  lesson: Cell<Mod['lesson']>
  // The Spinner's micro-card for the turn, worked out once when the turn's delay ends.
  spinnerCard: Cell<Mod['spinnerCard']>
  // The contextual mode's material (opt-in): the last prompt and Claude's last reply.
  workContext: Cell<Mod['workContext']>
  // What the learner has typed in the field on screen, for the echo. Screen state only, never stored.
  draft: Cell<Mod['draft']>
}

export const nowIso = async (engine: Engine) => new Date(await engine.clock.now()).toISOString()

// Moving the ring is never worth failing a press over: a pane drawn without the keyboard denies it.
export async function focusKey(engine: Engine, key: string) {
  await engine.ui.focus({ requestId: PANE, key }).catch(() => undefined)
}

// The setup in force: the mirror once loaded, the store otherwise.
export async function currentSetup(engine: Engine): Promise<LingoSetup | null> {
  const cache = await engine.setupCache.read()
  return cache.isLoaded ? cache.setup : load(engine.store, SETUP)
}

// The saved setup, read from the store into the mirror (a missing or unreadable one is pending).
export async function loadSetupMirror(engine: Engine): Promise<LingoSetup | null> {
  const setup = await load(engine.store, SETUP)
  await engine.setupCache.update(() => ({ isLoaded: true, setup }))
  return setup
}

// The three values as the store holds them; null when it failed to give any of
// them, so a store that is down is never taken for an empty one.
export async function loadPaneValues(engine: Engine): Promise<PaneValues | null> {
  const log = await tryLoad(engine.store, ACTIVITY)
  const progress = await tryLoad(engine.store, PACK_PROGRESS)
  const mistakes = await tryLoad(engine.store, MISTAKES)
  return log === null || progress === null || mistakes === null ? null : { log, progress, mistakes }
}

// The number of the refresh that began last. Handlers of different events overlap, so a refresh
// that began before a write can end after the refresh that write asked for.
let latestRefresh = 0

// Reads the three values again into the mirror: after a write (our own or one a
// refresh finds from another session) and when the pane opens. When the store
// fails the mirror stays as it was (not loaded, if it never was).
export async function refreshPaneData(engine: Engine) {
  const ticket = ++latestRefresh
  const values = await loadPaneValues(engine)
  // A refresh that began earlier and ends later than another has read older values: it is dropped.
  if (values !== null && ticket === latestRefresh) await engine.paneData.update(() => ({ isLoaded: true, ...values }))
}

// What the pane draws: the mirror once loaded. Not loaded (state reset by /clear,
// not yet reloaded), the store is read, and nothing is mirrored: drawing is pure,
// the engine denies a state write while a pane renders. The next `classic.SessionStart`
// (it follows /clear, /resume and /branch) reloads the mirror. A store that fails
// draws as if the values were empty.
export async function currentPaneData(engine: Engine): Promise<PaneValues> {
  const mirror = await engine.paneData.read()
  return mirror.isLoaded ? mirror : ((await loadPaneValues(engine)) ?? NO_PANE_VALUES)
}

export async function dispatchWait(engine: Engine, event: WaitEvent) {
  const state = await engine.wait.update(s => transition(s, event))
  // The split closed, or paused without a field: whatever was typed went with it.
  if (event.type === 'pane-closed' || state.phase === 'paused') await clearDraft(engine)
  return state
}

export async function closeSplit(engine: Engine) {
  await engine.ui.close({ id: PANE })
  await dispatchWait(engine, { type: 'pane-closed' })
}

// A field that is sent, or no longer on screen, leaves nothing to echo.
export async function clearDraft(engine: Engine) {
  if ((await engine.draft.read()).text !== '') await engine.draft.update(() => NO_DRAFT)
}

// What a field's typing leaves in the draft: its own text, in place of any other field's.
export function keepDraft(engine: Engine, field: string, text: string) {
  return engine.draft.update(() => ({ field, text }))
}

// Any key typed in the split's field or any press there: the split is in use.
export async function touch(engine: Engine) {
  const state = await engine.wait.read()
  if (state.pane === 'open' && !state.isTouched) await dispatchWait(engine, { type: 'touched' })
}
