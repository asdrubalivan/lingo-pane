import { strategiesFor } from '../src/resolver'
import { MISTAKES } from '../src/storage'
import type { LingoActivity, LingoPaneData } from '../types'

// The atoms themselves are declared in `register.tsx`: the engine reads the state a hooks
// module uses off that file's source, so `$.state` only takes references written there.
// What is shared here is what does not touch `$`.

export const PANE = 'lingo'
export const PANE_TITLE = 'lingo-pane'

// What the pane needs of the store: the activity log, and the progress and mistakes for the review.
export type PaneValues = Omit<LingoPaneData, 'isLoaded'>
const PENDING = strategiesFor(null)
export const NO_PANE_VALUES: PaneValues = {
  log: PENDING.activityEntry.empty,
  progress: PENDING.progressEntry.empty,
  mistakes: MISTAKES.empty,
}

// What the `switch ▸` menu offers.
export const AVAILABLE_ACTIVITIES: readonly LingoActivity[] = ['conversation', 'roleplay', 'reading', 'review']
