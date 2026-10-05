# lingo-pane

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md)

A [Claude Code](https://claude.com/claude-code) mod that teaches you a language **live**, right in your terminal: a lesson pane, micro-lessons while Claude works, and a tutor that corrects you the way you prefer.

> **Status: early, private.** It works end to end in the terminal but is still being tried out. Design and what is built: [`docs/decisions.md`](docs/decisions.md).

## What it does

- While Claude works, a **split** opens beside the transcript (fullscreen terminals from 110 columns; 40 % of the width by default) with a short lesson: a **conversation**, a **role-play** or a **reading** with the tutor, in micro-units of three replies. On narrower terminals a `1: open lesson` button above the prompt opens it instead.
- The tutor corrects you the socratic way (it points at the mistake and lets you try again); **Enter on an empty line** asks for help. Your mistakes become flashcards, reviewed Pimsleur-style and shown in the spinner line.
- `/lingo` opens or closes it by hand, `/lingo setup` runs the guided setup (languages, level, interests, split width, tutor model, theme), `/lingo theme <name>` switches colors.
- Everything that varies between learners is a **strategy** you can swap: where your content lives, how reviews are scheduled, how you are corrected and how your activity is logged.

## Requirements

- Claude Code 2.1.287 or later (mods are early access).
- Terminal. Planned to work inside [herdr](https://github.com/herdrdev/herdr).
- A Claude subscription. The tutor makes its own model calls with your session's credentials, so no API key is needed, but it **uses your plan's limits**.

## Privacy

Mods run outside the sandbox and can see your prompts and tool calls. What `lingo-pane` does with that:

- **Reads:** when a turn starts and ends, whether a tool call needs your permission, and the terminal's size, to open and close the split at the right time. It does not keep your prompts or Claude's replies, unless you turn on the option below.
- **Stores** (in Claude Code's plugin store on your machine): your setup, your progress in the built-in pack, the cards made from your mistakes and a short log of finished units.
- **Sends to Claude** (with your session's credentials, on your plan): the tutor's requests, which hold your languages, level and interests, your lines in the lesson and the mistakes due for review. With the optional **"material from your own session"** setting on (off by default), also short excerpts of your last prompt and of Claude's last reply, with anything that looks like a key, a password or an email address removed first.
- **`🔊 listen`** says the phrase on screen with your system's own voice for the language (`say` on macOS), so it stays on your machine. With no voice for that language it copies a Google Translate link instead: the phrase **goes to Google** only if you open that link.

Nothing else leaves your machine.
