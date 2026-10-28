// The built-in content store: the packs that ship inside the mod, one per
// language pair. The demo pack is the first; a pair with none of its own still
// practises the fallback (the demo), flagged so the pane can say so.

import type { ContentPack, ContentStore, LanguagePair } from '../strategies'
import { DEMO_CARDS, DEMO_LESSON_COUNT, DEMO_PACK_ID, DEMO_PACK_TITLE } from './demo-english-a1'

type Pack = Omit<ContentPack, 'isForPair'>

const DEMO: Pack = { id: DEMO_PACK_ID, title: DEMO_PACK_TITLE, cards: DEMO_CARDS, lessonCount: DEMO_LESSON_COUNT }

const PACKS: readonly { pair: LanguagePair; pack: Pack }[] = [{ pair: { target: 'english', native: 'spanish' }, pack: DEMO }]

const FALLBACK: Pack = DEMO

const key = (name: string) => name.trim().toLowerCase()

export const localStore: ContentStore = {
  id: 'local',
  pack(pair) {
    const found = PACKS.find(p => p.pair.target === key(pair.target) && p.pair.native === key(pair.native))
    return found === undefined ? { ...FALLBACK, isForPair: false } : { ...found.pack, isForPair: true }
  },
}
