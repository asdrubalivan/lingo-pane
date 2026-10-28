// A store in memory for tests, as the engine keeps it (JSON in, JSON out), that
// can fail on a key, remembers what was written, and can be opened over the
// entries a hooks test already holds (to read them through the storage module).

import { MISTAKES, load, progressOf } from './storage'
import type { Store } from './storage'

export function memoryStore(entries: Map<string, unknown> = new Map()) {
  const failing = { get: new Set<string>(), set: new Set<string>(), delete: new Set<string>() }
  const writes: string[] = []
  const store: Store = {
    get: async key => {
      if (failing.get.has(key)) throw new Error(`read ${key}`)
      return entries.get(key)
    },
    set: async (key, value) => {
      if (failing.set.has(key)) throw new Error(`write ${key}`)
      writes.push(key)
      entries.set(key, JSON.parse(JSON.stringify(value)))
    },
    delete: async key => {
      if (failing.delete.has(key)) throw new Error(`delete ${key}`)
      entries.delete(key)
    },
  }
  return { store, entries, failing, writes }
}

/** What the entries of a hooks test hold as mistakes, read the way the pane reads them. */
export const savedMistakes = (entries: Map<string, unknown>) => load(memoryStore(entries).store, MISTAKES)

/** What they hold as progress on the given cards. */
export const savedProgress = (entries: Map<string, unknown>, cardIds: readonly string[]) =>
  load(memoryStore(entries).store, progressOf(cardIds))
