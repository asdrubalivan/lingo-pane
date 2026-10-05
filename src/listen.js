// `🔊 listen`: a link to Google Translate with the phrase, which reads it aloud
// there. The phrase leaves the machine only when the learner presses the link
// (the README says so). Pure: builds the URL.
/** ISO 639-1 codes of the languages people are likely to type in the setup. */
const CODES = {
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
};
/** The code for a language name as typed, or null when it is not known. */
export function languageCode(language) {
    return CODES[language.trim().toLowerCase()] ?? null;
}
/** The longest phrase put in the link (a Link's href is capped at 2048 characters). */
export const MAX_LISTEN_LENGTH = 300;
/** The Google Translate page that says `phrase`; `auto` where a language is not known. */
export function listenUrl(phrase, targetLanguage, nativeLanguage) {
    const source = languageCode(targetLanguage) ?? 'auto';
    const target = languageCode(nativeLanguage) ?? 'en';
    const text = encodeURIComponent(phrase.trim().slice(0, MAX_LISTEN_LENGTH));
    // Spelled as `new URL(href).href`, which is how a Link's href must be written.
    return new URL(`https://translate.google.com/?sl=${source}&tl=${target}&text=${text}&op=translate`).href;
}
