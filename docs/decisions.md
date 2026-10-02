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
- Must work inside the **herdr** terminal multiplexer (not verified yet; test panes and images there).
- A pane opened by the mod itself needs ≥ 144 columns; a pane opened by something the user did (a command or a button) is placed at any width. So the lesson pane opens from `/lingo`, not from a timer.
- `$.audio.speak` uses the system voice (macOS `say`); no microphone or speech recognition in the API.
- Progress persists in `$.store` (4 MiB, shared between sessions, not atomic: one key per item, re-read before writing). UI state lives in `$.state`, which resets on `/clear`, `/resume` and `/branch`.
- The mod runs outside the sandbox and sees every prompt and tool call: the README must state what it reads, what it stores and where it sends data.
- The mod API is early access and may change: pin a minimum Claude Code version.

## Still open

- Exact shape of the four strategy interfaces.
- Audio: system voice only, or bundled assets.
- Data model of a lesson/exercise and of progress in `$.store`.
- Whether to also seek listing in Anthropic's directory (unconfirmed that mods are accepted).
- License.
