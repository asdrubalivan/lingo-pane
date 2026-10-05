// `🔊 listen`: the phrase in the system's own voice for the target language
// (`say` on macOS), which keeps it on the machine. With no voice for the
// language, the press copies a Google Translate link that reads it aloud there;
// the phrase leaves the machine only if the learner opens it (the README says
// so). Pure: picks the voice and builds the URL.

/** ISO 639-1 codes of the languages people are likely to type in the setup. */
const CODES: Readonly<Record<string, string>> = {
  english: 'en', inglés: 'en', ingles: 'en', anglais: 'en',
  spanish: 'es', español: 'es', espanol: 'es', espagnol: 'es',
  french: 'fr', francés: 'fr', frances: 'fr', français: 'fr', francais: 'fr',
  german: 'de', alemán: 'de', aleman: 'de', allemand: 'de', deutsch: 'de',
  italian: 'it', italiano: 'it', italien: 'it',
  portuguese: 'pt', portugués: 'pt', portugues: 'pt', português: 'pt',
  ukrainian: 'uk', ucraniano: 'uk', ukrainien: 'uk', українська: 'uk',
  russian: 'ru', ruso: 'ru', russe: 'ru',
  polish: 'pl', polaco: 'pl',
  dutch: 'nl', neerlandés: 'nl',
  japanese: 'ja', japonés: 'ja', japones: 'ja',
  chinese: 'zh-CN', chino: 'zh-CN', mandarin: 'zh-CN',
  korean: 'ko', coreano: 'ko',
  arabic: 'ar', árabe: 'ar', arabe: 'ar',
  turkish: 'tr', turco: 'tr',
  greek: 'el', griego: 'el',
}

/** The code for a language name as typed, or null when it is not known. */
export function languageCode(language: string): string | null {
  return CODES[language.trim().toLowerCase()] ?? null
}

/**
 * A system voice per language code: the names macOS ships (`say -v '?'` lists
 * them). A voice that is not installed makes `$.audio.speak` reject, and the
 * press falls back to the link.
 */
const VOICES: Readonly<Record<string, string>> = {
  en: 'Samantha',
  es: 'Monica',
  fr: 'Thomas',
  de: 'Anna',
  it: 'Alice',
  pt: 'Luciana',
  uk: 'Lesya',
  ru: 'Milena',
  pl: 'Zosia',
  nl: 'Xander',
  ja: 'Kyoko',
  'zh-CN': 'Tingting',
  ko: 'Yuna',
  ar: 'Majed',
  tr: 'Yelda',
  el: 'Melina',
}

/** The system voice for a language name as typed, or null when there is none. */
export function voiceFor(language: string): string | null {
  const code = languageCode(language)
  return code === null ? null : (VOICES[code] ?? null)
}

/** The longest phrase put in the link (a Link's href is capped at 2048 characters). */
export const MAX_LISTEN_LENGTH = 300

/** The Google Translate page that says `phrase`; `auto` where a language is not known. */
export function listenUrl(phrase: string, targetLanguage: string, nativeLanguage: string): string {
  const source = languageCode(targetLanguage) ?? 'auto'
  const target = languageCode(nativeLanguage) ?? 'en'
  const text = encodeURIComponent(phrase.trim().slice(0, MAX_LISTEN_LENGTH))
  // Spelled as `new URL(href).href`, which is how a Link's href must be written.
  return new URL(`https://translate.google.com/?sl=${source}&tl=${target}&text=${text}&op=translate`).href
}
