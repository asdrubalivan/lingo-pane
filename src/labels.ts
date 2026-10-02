// Every label the mod draws, in English, in one table so it can be translated
// later. Catalogue entries (strategy options, tutor models, themes) keep their
// labels next to their ids; prompts sent to the model are not labels.

export const LABELS = {
  modName: 'lingo-pane',

  // --- Setup ------------------------------------------------------------------
  setupTitle: 'lingo-pane setup',
  setupStep: (n: number, of: number) => `Step ${n} of ${of}`,
  setupHintTyping: 'Type, Enter keeps the text, Tab moves to the next field or button.',
  setupHintLevel: 'Tab moves between buttons and Enter presses, or type the digit shown.',
  setupHintButtons: 'Tab moves between buttons and Enter presses.',
  setupLanguagesAsk: 'Which languages? The explanations are in your native language.',
  setupNative: 'Native language: ',
  setupTarget: 'Target language: ',
  setupNativePlaceholder: 'e.g. Spanish',
  setupTargetPlaceholder: 'e.g. English',
  setupLevelAsk: (target: string) => `Your level in ${target} (CEFR):`,
  setupLevelNone: 'None picked yet.',
  setupLevelPicked: (level: string) => `Picked: ${level}`,
  setupInterestsAsk: 'What do you like to talk about? Role-play scenarios are made from it.',
  setupInterestsNote: 'Optional, comma-separated, up to 5.',
  setupInterests: 'Interests: ',
  setupInterestsPlaceholder: 'e.g. chess, cooking, startups',
  setupPlacementTitle: 'Placement test (optional)',
  setupPlacementLater: 'placement test: coming later',
  setupStrategiesAsk: 'How should it work? Defaults are fine; "coming later" ones are not built yet.',
  setupComingLater: (label: string) => `${label} (coming later)`,
  setupPreferencesAsk: 'How the lesson looks and who teaches. Defaults are fine.',
  setupShareTitle: 'Split width while Claude works (share of the terminal)',
  setupShare: (share: number) => `${share} %`,
  setupTutorTitle: 'Tutor model',
  setupTutorNote: 'Every tutor reply uses your Claude plan.',
  setupThemeTitle: 'Theme',
  setupSummary: 'Summary',
  setupSummaryLanguages: (target: string, native: string, level: string) => `${target} from ${native}, level ${level}`,
  setupSummaryInterests: (interests: readonly string[]) =>
    `Interests: ${interests.length === 0 ? '(none)' : interests.join(', ')}`,
  setupSummaryLook: (share: number, tutor: string, theme: string) => `Split ${share} % · tutor ${tutor} · theme ${theme}`,
  setupSaved: 'lingo-pane: setup saved',
  setupPendingToast: 'lingo-pane: setup pending. Run /lingo setup (or press 2 in the band above the prompt).',
  setupNeedsInput: 'Setup needs a terminal or the desktop app.',
  learning: (target: string, native: string) => `Learning ${target} from ${native}.`,

  back: 'Back',
  next: 'Next',
  skip: 'Skip',
  confirm: 'Confirm',

  // --- Band above the prompt -----------------------------------------------------
  bandSetupPending: 'lingo-pane: setup pending. ',
  bandStartSetup: 'Start setup',
  bandLater: 'Later',
  bandOpenLesson: 'open lesson',

  // --- Theme command -------------------------------------------------------------
  themeSet: (label: string) => `lingo-pane: theme set to ${label}.`,
  themeNeedsSetup: 'lingo-pane: finish the setup first (/lingo setup).',
} as const
