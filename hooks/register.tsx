import { atom, read, update } from 'claude-code'
import type { EngineInterface, ResolveInput, Register } from 'claude-code'

import { NO_CONTEXT } from '../src/context'
import { IDLE_LESSON } from '../src/conversation'
import { NO_DRAFT } from '../src/draft'
import { IDLE_PRACTICE } from '../src/lesson'
import { CLOSED_WIZARD } from '../src/setup'
import { INITIAL_WAIT } from '../src/wait-machine'
import type { Engine } from './engine'
import {
  isQuestion,
  lingoCommand,
  paneClosed,
  promptSubmitted,
  questionAsked,
  sessionRestarted,
  sessionStarted,
  toolChecked,
  toolRunning,
  turnCompleted,
  turnStarted,
} from './lifecycle'
import { createRuntime } from './runtime'
import { drawBand } from './screens/band'
import { drawPane } from './screens/pane'
import { spinnerSuffixFor } from './screens/spinner'
import { NO_PANE_VALUES } from './state'
import type { PANE } from './state'

// The split's id, written here because the engine lists a matcher by the literals of this file.
const PANE_ID = 'lingo' satisfies typeof PANE

// The state the mod keeps in `$.state` (contract: types/index.d.ts). The engine reads the
// state a hooks module uses off this file's source, so every atom is declared here and
// `engineOf` hands the rest of the mod a cell per atom.
const wait = atom({ plugin: 'lingo-pane', key: 'wait' } as const, INITIAL_WAIT)
const setupWizard = atom({ plugin: 'lingo-pane', key: 'setupWizard' } as const, CLOSED_WIZARD)
const setupCache = atom({ plugin: 'lingo-pane', key: 'setupCache' } as const, { isLoaded: false, setup: null })
const setupBand = atom({ plugin: 'lingo-pane', key: 'setupBand' } as const, { isHidden: false })
const paneData = atom({ plugin: 'lingo-pane', key: 'paneData' } as const, { isLoaded: false, ...NO_PANE_VALUES })
const practice = atom({ plugin: 'lingo-pane', key: 'practice' } as const, IDLE_PRACTICE)
const lesson = atom({ plugin: 'lingo-pane', key: 'lesson' } as const, IDLE_LESSON)
const spinnerCard = atom({ plugin: 'lingo-pane', key: 'spinnerCard' } as const, { turnId: null, text: null })
const workContext = atom({ plugin: 'lingo-pane', key: 'workContext' } as const, NO_CONTEXT)
const draft = atom({ plugin: 'lingo-pane', key: 'draft' } as const, NO_DRAFT)

// `$` is never handed to a function of another file, and `$.noun.event(...)` is spelled where
// it is called: this is the engine as the rest of the mod gets it.
const engineOf = ($: EngineInterface): Engine => ({
  store: {
    get: key => $.store.get(key),
    set: (key, value) => $.store.set(key, value),
    delete: key => $.store.delete(key),
  },
  clock: {
    now: () => $.clock.now(),
    after: (ms, run) => $.clock.after(ms, run),
    every: (ms, run) => $.clock.every(ms, run),
  },
  ui: {
    open: args => $.ui.open(args),
    close: args => $.ui.close(args),
    panes: () => $.ui.panes(),
    focus: args => $.ui.focus(args),
    toast: (...args) => $.ui.toast(...args),
    invalidate: (...args) => $.ui.invalidate(...args),
    resolve: <E extends ResolveInput>(e: E) => $.ui.resolve(e),
  },
  model: { complete: request => $.model.complete(request) },
  command: { register: spec => $.command.register(spec) },
  wait: { read: () => read($, wait), update: change => update($, wait, change) },
  setupWizard: { read: () => read($, setupWizard), update: change => update($, setupWizard, change) },
  setupCache: { read: () => read($, setupCache), update: change => update($, setupCache, change) },
  setupBand: { read: () => read($, setupBand), update: change => update($, setupBand, change) },
  paneData: { read: () => read($, paneData), update: change => update($, paneData, change) },
  practice: { read: () => read($, practice), update: change => update($, practice, change) },
  lesson: { read: () => read($, lesson), update: change => update($, lesson, change) },
  spinnerCard: { read: () => read($, spinnerCard), update: change => update($, spinnerCard, change) },
  workContext: { read: () => read($, workContext), update: change => update($, workContext, change) },
  draft: { read: () => read($, draft), update: change => update($, draft, change) },
})

// What runs on each event is in `lifecycle.ts`, the async steps of a lesson in
// `orchestration.ts` and `review-session.ts`, and what is drawn in `screens/`.
export const register: Register = (on, options) => {
  const rt = createRuntime(options)

  on('session.start', async ($, e, next) => {
    await sessionStarted(engineOf($))
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    await sessionRestarted(engineOf($), e)
    return next(e)
  })

  on('command.run', { command: 'lingo' }, ($, e) => lingoCommand(rt, engineOf($), e))

  // Busy detection.
  on('turn.start', async ($, e, next) => {
    await turnStarted(rt, engineOf($), e)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await turnCompleted(rt, engineOf($), e)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await promptSubmitted(engineOf($), e)
    return next(e)
  })

  // Do not cover what the person must answer.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    await toolChecked(rt, engineOf($), e, verdict)
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    if (!isQuestion(e)) {
      await toolRunning(engineOf($))
      return next(e)
    }
    await questionAsked(rt, engineOf($))
    // The call resolves once the question has been answered.
    const answered = await next(e)
    await toolRunning(engineOf($))
    return answered
  })

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    await paneClosed(engineOf($))
    return next(e)
  })

  // What is drawn.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const suffix = await spinnerSuffixFor(rt, engineOf($), e)
    return suffix === null ? next(e) : next({ ...e, props: { ...e.props, suffix } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const band = await drawBand(rt, engineOf($), e)
    return band === null ? next(e) : band
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e) => drawPane(rt, engineOf($), e))
}
