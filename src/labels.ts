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

  // --- The split -------------------------------------------------------------------
  keysHere: '● keys here · Esc back to the prompt',
  keysAway: '○ Ctrl+X Tab to come back',
  waitingForYou: 'Claude needs you: answer below. The lesson waits here.',

  // --- The lesson ----------------------------------------------------------------
  tutor: 'tutor  ',
  you: 'you    ',
  help: 'help   ',
  tutorThinking: 'the tutor is thinking…',
  tutorSilentOpening: 'The tutor did not answer. Press "switch ▸" to try again or pick another activity.',
  tutorSilentReply: 'The tutor did not answer; your line is back to you: send it again.',
  tutorSilentHelp: 'The tutor did not answer. Try Enter on the empty field again.',
  replyPlaceholder: (target: string) => `reply in ${target}`,
  replySubmit: 'reply',
  listen: '🔊 listen',
  switchActivity: 'switch ▸',
  talkHint: '⏎ empty = help · Tab = listen and switch',
  talkHintWaiting: 'the tutor is answering; send your next line once it has',
  nextActivity: (label: string) => `next: ${label} ▸`,
  levelHint: (direction: 'up' | 'down', level: string) =>
    direction === 'up'
      ? `Tutor: these went smoothly. You could try ${level}; /lingo setup changes it.`
      : `Tutor: these were hard. ${level} might suit you better for now; /lingo setup changes it.`,
  current: '(current)',
  backToField: 'back',
  menuHint: (count: number) => `press 1-${count} · Tab back`,

  // --- Review (the built-in pack) ---------------------------------------------------
  reviewPackNote: (title: string) => `The built-in pack is ${title}; it is used for now.`,
  reviewDemoFinished: (count: number) => `Demo finished: all ${count} lessons are done. Come back to review, or wait for the lesson generator.`,
  reviewLessonIntro: (lesson: number, count: number, recall: number, fresh: number) =>
    `Lesson ${lesson} of ${count}: ${recall} to recall, ${fresh} new.`,
  reviewStart: 'Start lesson',
  reviewLessonDone: (lesson: number) => `Lesson ${lesson} done`,
  reviewDemoLast: 'Demo finished: that was the last lesson.',
  reviewContinue: 'Continue',
  reviewCardOf: (lesson: number, card: number, of: number, isRecall: boolean) =>
    `Lesson ${lesson} - card ${card} of ${of} (${isRecall ? 'recall' : 'new'})`,
  reviewIn: (target: string) => `In ${target}: `,
  reviewPlaceholder: 'type your answer',
  reviewSubmit: 'answer',
  reviewNotYet: (hint: string) => `Not yet. ${hint}`,
  reviewHintFromTutor: 'Hint from tutor',
  reviewHint: '⏎ empty = show the answer · Tab = hint from tutor, switch',
  reviewCorrect: (answer: string) => `Correct: ${answer}`,
  reviewAnswer: (answer: string) => `Answer: ${answer}`,
  hintUnavailable: 'The tutor is not available right now. Use the hint above or try again.',
  hintLeaked: 'The tutor reply would have given the answer away, so it was dropped. Try again or look at the hint.',

  // --- Band above the prompt -----------------------------------------------------
  bandSetupPending: 'lingo-pane: setup pending. ',
  bandStartSetup: 'Start setup',
  bandLater: 'Later',
  bandOpenLesson: 'open lesson',

  // --- Theme command -------------------------------------------------------------
  themeSet: (label: string) => `lingo-pane: theme set to ${label}.`,
  themeNeedsSetup: 'lingo-pane: finish the setup first (/lingo setup).',
} as const
