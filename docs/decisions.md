# lingo-pane — design decisions

Status: **design phase, no code yet.** Decisions taken on 2026-10-02. Background on the mod platform: the research note `claude-code-mods.md` (kept in the author's private notes; the facts used here are listed under "Platform constraints" below).

## What it is

A public Claude Code **mod** (plugin with function hooks, Claude Code ≥ 2.1.287) that teaches a language **live** inside the terminal.

- Plugin = repo = marketplace name: `lingo-pane`. Main command: `/lingo`.
- READMEs in English (default), Spanish and French.
- Standalone: it works without any external course repo or the `/teach` skill. The author's own workflow (Markdown lessons + Anki-style CSV flashcards + Pimsleur n-1/n-3/n-7 recall + Socratic correction + a daily review log) is just one adapter among others.
- Languages only. Native and target language are configurable (`userConfig`). The author uses Ukrainian; the public demo uses English.

## Experience

A mix of two surfaces:

1. **Conversational tutor + live lesson pane** (`/lingo` opens a pane with the current exercise, vocabulary and progress).
2. **Micro-lessons in the band above the prompt / spinner** while Claude is busy with the user's normal work.

## Who teaches

The **mod itself** makes its own `$.model` calls from the pane. The user's working session is not hijacked.

- `$.model.complete` uses the session's own credentials, so it runs on the user's **existing Claude subscription**; no API keys, nothing to configure. (Platform doc: "uses the user's plan/API key".)
- Cost is real: it consumes the user's usage limits. The README must say so. Calls use `effort: 'low'` and a `maxTokens` cap.

## Strategy pattern

The core orchestrates a session and talks only to four interfaces:

| Strategy | Example implementations |
| --- | --- |
| Content store | the author's lesson layout, plain JSON/Markdown folder, Anki, Obsidian |
| Review algorithm | Pimsleur-style (n-1, n-3, n-7), SM-2, FSRS, Leitner |
| Correction style | Socratic (hints before answers), direct, progressive hints |
| Activity log | Markdown log, JSON, none |

Plugging in:

- **v0:** strategies live inside the plugin and are picked with a `userConfig` option (a selector in `/config`).
- **Designed for later:** other plugins ship strategies and depend on `lingo-pane` through `dependencies`, using the type contract that a mod can publish for the `$` nouns it adds. v0 interfaces are written so that this works without changing the core.

## Platform constraints that shape the design

- Only the terminal and the Desktop Code tab draw UI; VS Code, `claude -p` and cloud sessions run hooks without showing anything.
- Must work inside the **herdr** terminal multiplexer. Checked 2026-10-02 by the author with the skeleton: `/lingo` opens the pane as an inline box above the prompt (with a close button) in a narrow terminal that appears to be inside herdr. Images are still untested there.
- A pane opened by the mod itself needs ≥ 144 columns; a pane opened by something the user did (a command or a button) is placed at any width. So the lesson pane opens from `/lingo`, not from a timer.
- `$.audio.speak` uses the system voice (macOS `say`); no microphone or speech recognition in the API.
- Progress persists in `$.store` (4 MiB, shared between sessions, not atomic: one key per item, re-read before writing). UI state lives in `$.state`, which resets on `/clear`, `/resume` and `/branch`.
- The mod runs outside the sandbox and sees every prompt and tool call: the README must state what it reads, what it stores and where it sends data.
- The mod API is early access and may change: pin a minimum Claude Code version.

## Requirement: lessons generated from the learner's history

Added by the author on 2026-10-02 ("important"): the mod must have a mode that **generates new lessons based on what the learner has already done**.

- Input: the activity log and per-card progress (what was studied, what was failed, which lessons and topics were covered), plus the configured languages and level.
- Output: new cards or a new lesson, written back through the content store so it behaves like any other lesson (and is reviewed by the review algorithm).
- Decided 2026-10-02: a fifth strategy, **lesson generator**, next to the four existing ones, with a model-backed implementation using `$.model` (the learner's own subscription; see "Who teaches") and room for others (rule-based, an external generator).
- This makes recording history a core feature, not an extra: the activity log and `$.store` progress must be rich enough to drive generation.
- Risk to design for: a model can produce wrong grammar or vocabulary. Generated material has to be marked as generated, stay inside the learner's level and known vocabulary, and the tutor should say when it is not sure.

## Setup

Decided 2026-10-02: the mod has a guided setup.

- **Covers:** native language, target language and level; choosing the strategy for each axis (defaults: socratic correction, Pimsleur review, local JSON store and log); where the learner's material and activity log live (creating the initial structure if missing). An **optional** placement test with the tutor calibrates the level and seeds the history that feeds generated lessons.
- **When:** opens automatically the first time `/lingo` runs with no configuration, and again on demand with `/lingo setup`.
- **It must announce itself.** Added 2026-10-02 ("if setup is needed it has to tell you"): while setup is pending, the mod does not wait for the learner to discover `/lingo`. On `session.start` it shows a toast, and a one-line band above the prompt (with a button and hotkey, and a "later" that hides it for the session) stays until setup is done. Other features (spinner micro-lessons) stay quiet until then, because without languages and level there is nothing to teach. Proposed, to confirm when it is built.
- **Where:** a stepped wizard in the `/lingo` pane with Inputs and Buttons. Only the optional placement test uses the model.

Implemented (2026-10-02, branch `feat/setup`):

- **Subcommands:** `/lingo` parses `args` (`src/command.ts`, pure). No args opens the pane, and a second `/lingo` closes it if it is up and drawn; `setup` always opens the wizard (never toggles); any other word answers `{ text }` listing the subcommands that exist.
- **Where the choices live:** one `$.store` key, `setup`: `{ version: 1, targetLanguage, nativeLanguage, level, strategies: { contentStore, reviewAlgorithm, correctionStyle, activityLog }, completedAt }`. "Pending" means the key is missing or does not parse (`parseSetup` in `src/setup.ts`: wrong version, unknown or not-yet-built strategy id, bad level, corrupt JSON). `userConfig` is only the default the wizard starts from (a re-run starts from the saved setup); once saved, the Spinner reads its languages from the setup, not from `userConfig`.
- **Wizard** (`src/setup.ts` holds the pure step machine, the strategy catalogue and the validation; the pane is in `hooks/register.tsx`): languages (Inputs prefilled), level (A1-C2 buttons), optional placement test (only "Skip" and the text "placement test: coming later"; not built), strategies per axis (only implemented ones are buttons, the rest are dim "coming later"), summary and confirm. Back / Next / Skip. Step and drafts live in `$.state` (`setupWizard`, contract in `types/index.d.ts`) and are written only from handlers.
- **Announcing:** `session.start` toasts once when setup is pending; an `AbovePrompt` line with "Start setup" (hotkey `2`) and "Later" (hotkey `3`, hides it for the session) stays until setup is saved; it shares the hook with the width-fallback button. While pending, the Spinner shows no micro-lesson.
- **/clear, /resume, /branch:** the saved setup is mirrored in `$.state` (`setupCache`) so the band and Spinner redraw when it changes, but the store is the source of truth: when the mirror is empty (state was reset) the render hooks read `$.store`. `classic.SessionStart` with a `source` other than `startup`/`compact` reloads the mirror and repeats the toast, because "Later" was forgotten with the state.
- **Not verified in a real session:** how the wizard, the band and the toast actually look; that a pane opened with `focus: true` really gets the keyboard for the Inputs; and that `/clear` resets `$.state` exactly as documented (tests cover the store fallback, not a real reset). Hotkeys `2`/`3` are a choice (`1` is the width-fallback button).

## Waiting-state trigger (learned from the Doom mod)

Study of `jarrodwatts/intermission` (a mod that shows a multiplayer Doom pane while Claude is busy), 2026-10-02. What we reuse; we do **not** reuse its native engine, shared memory, images or downloaded binary.

- **Busy detection:** `turn.start` plus a short delay (2 s there) opens the pane; `turn.complete` starts a short countdown (3 s there) and closes it. Permission asks (`tool.check` returning ask) and `AskUserQuestion` calls retire the pane so it never covers a prompt.
- **Spinner text:** rewriting the `Spinner`'s `suffix` in a `ui.render` hook shows one micro-lesson (a word or phrase) per turn in any terminal, with no pane at all.
- **Width fallback:** a pane the mod opens itself needs enough columns; when it is not placed, a button in the band above the prompt (with a hotkey) offers it instead.
- **Keys:** a `Client` with `onKey` lets the learner answer cards with a single key.

Build order: the trigger (this section) first, then strategies plug into it.

Implemented (2026-10-02, branch `feat/wait-trigger`):

- State machine in `src/wait-machine.ts` (pure), wired in `hooks/register.tsx`; UI state in `$.state` (contract in `types/index.d.ts`). Timers are module variables, so a hot reload drops them.
- Event names checked against the 2.1.287 declarations: `turn.start` (no `agentId`: a subagent's run raises none), `turn.complete` (`agentId` present for subagents, `isAborted`), `tool.check` (`decision: 'ask'`, and `tool_use_id` set on a real call), `tool.call` with `tool === 'AskUserQuestion'`, `ui.close` (`origin.kind`).
- Micro-lesson: `Spinner` `suffix` rewritten once per turn from `src/microcards.ts` (8 embedded English -> Spanish cards). Any other pair shows "no built-in cards ...".
- Width fallback: opt-in through the `openPaneWhileWaiting` option (off by default, since a pane opened by a timer contradicts "the lesson pane opens from `/lingo`"). When on and the pane is not placed, an `AbovePrompt` button (hotkey `1`) opens it; a press is an asked open, placed at any width.
- Not verified in a real session: how the Spinner and the band actually look, and the order of `tool.check` / `tool.call` around a permission dialog (the resume after an ask relies on the next `tool.call`).

## Still open

- Lesson generator: how generated lessons are persisted and validated.
- Setup: the placement test with the tutor (the step exists and says "coming later"); where learner material and the activity log live beyond "local in `$.store`" (no file locations are asked yet); how the strategy choices reach the core once the strategies are wired to the pane.
- Exact shape of the strategy interfaces (now five with the lesson generator). Still open, but Pimsleur per lesson forced two additions: `Card.lesson` and `ReviewAlgorithm.dueCards` taking `{ now, currentLesson }` instead of just `now`.
- Audio: system voice only, or bundled assets.
- Data model of a lesson/exercise and of progress in `$.store`.
- Whether to also seek listing in Anthropic's directory (unconfirmed that mods are accepted).
