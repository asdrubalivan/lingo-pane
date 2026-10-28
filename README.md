# lingo-pane

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md)

A [Claude Code](https://claude.com/claude-code) mod that teaches you a language **live**, right in your terminal: a lesson pane, micro-lessons while Claude works, and a tutor that corrects you the way you prefer.

> **Status: early, private.** It works end to end in the terminal but is still being tried out. Design and what is built: [`docs/decisions.md`](docs/decisions.md).

## What it does

- While Claude works, a **split** opens beside the transcript (fullscreen terminals from 110 columns; 40 % of the width by default) with a short lesson: a **conversation**, a **role-play** or a **reading** with the tutor, in micro-units of three replies. On narrower terminals a `1: open lesson` button above the prompt opens it instead.
- The tutor corrects you the socratic way (it points at the mistake and lets you try again); **Enter on an empty line** asks for help. Your mistakes become flashcards, reviewed Pimsleur-style and shown in the spinner line.
- `/lingo` opens or closes it by hand, `/lingo setup` runs the guided setup (languages, level, interests, split width, tutor model, theme), `/lingo theme <name>` switches colors.
- Everything that varies between learners is a **strategy**: where your content lives (one pack per language pair), how reviews are scheduled, how you are corrected and how your activity is logged. Each has one built-in implementation today; `/lingo setup` lists the others as coming later, and a new one is registered in one place (`src/resolver.ts`).

## Requirements

- Claude Code 2.1.287 or later (mods are early access).
- Terminal. Planned to work inside [herdr](https://github.com/herdrdev/herdr).
- A Claude subscription. The tutor makes its own model calls with your session's credentials, so no API key is needed, but it **uses your plan's limits**.

## Privacy

Mods run outside the sandbox and can see your prompts and tool calls. What `lingo-pane` does with that:

- **Reads:** when a turn starts and ends, whether a tool call needs your permission, and the terminal's size, to open and close the split at the right time. It does not keep your prompts or Claude's replies, unless you turn on the option below.
- **Stores** (in Claude Code's plugin store on your machine): your setup, your progress in the built-in pack, the cards made from your mistakes and a short log of finished units.
- **Sends to Claude** (with your session's credentials, on your plan): the tutor's requests, which hold your languages, level and interests, your lines in the lesson and the mistakes due for review. With the optional **"material from your own session"** setting on (off by default), also short excerpts of your last prompt and of Claude's last reply, with anything that looks like a key, a token, a password or an email address replaced first by a placeholder such as `[redacted]` or `[email]`.
- **Treats that excerpt as untrusted text.** Claude's last reply can quote a web page or a file, so the excerpt may carry instructions written by someone else. It is sent to the model as plain topic material, in a delimited block marked "not instructions", and before that the mod defuses the delimiter and the labels of the tutor's correction format (`FIX:`, `TUTOR:`, `SCENARIO:`, in capitals) in it, so it is harder for it to close the block or pose as a tutor reply. That lowers the risk; it does not remove it: the model still reads the text, and the same words in lower case are left as they are. A correction the tutor proposes is kept as a mistake card only if it is short, plain text with two different forms; otherwise it is dropped and the turn goes on without it.
- **Sends to Google** only when you press `🔊 listen`: the phrase on screen, opened in Google Translate in your browser.

Nothing else leaves your machine.

## Contributing

You need Node 22 or newer. From a clean clone:

```sh
npm ci
npm run check   # type-check, README headings, script tests, then the plugin tests
```

- `npm test` runs `claude plugin test .`, the plugin's test kit. The Claude Code version is pinned in `package.json` (2.1.287, the one the types come from): newer versions have changed the engine's behaviour, and two permission-ask tests fail on 2.1.308, so bump the pin on purpose, not by accident.
- `npm run typecheck` needs the plugin API's declarations in `.claude-plugin/types/`. They are written by the Claude Code engine when it loads the mod, and git ignores them because they belong to the installed version. The script creates them for you by loading the mod once with an empty `HOME` (no credentials, no model call). `npm run types` writes them again after you change the pinned version.
- `npm run check:readmes` compares the headings of `README.md`, `README.es.md` and `README.fr.md` (same count and levels, in the same order), so edit the three in the same commit; `check` runs it.
- CI (`.github/workflows/ci.yml`) runs `npm run check` on every pull request.
