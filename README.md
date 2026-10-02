# lingo-pane

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md)

A [Claude Code](https://claude.com/claude-code) mod that teaches you a language **live**, right in your terminal: a lesson pane, micro-lessons while Claude works, and a tutor that corrects you the way you prefer.

> **Status: design phase.** There is no code yet. See [`docs/decisions.md`](docs/decisions.md).

## Idea

- `/lingo` opens a live lesson pane.
- Short exercises appear above the prompt while Claude is busy with your normal work.
- Everything that varies between learners is a **strategy** you can swap: where your content lives, how reviews are scheduled, how you are corrected and how your activity is logged.

## Requirements

- Claude Code 2.1.287 or later (mods are early access).
- Terminal. Planned to work inside [herdr](https://github.com/herdrdev/herdr).
- A Claude subscription. The tutor makes its own model calls with your session's credentials, so no API key is needed, but it **uses your plan's limits**.

## Privacy

Mods run outside the sandbox and can see your prompts and tool calls. This section will list exactly what `lingo-pane` reads, stores and sends once the code exists.
