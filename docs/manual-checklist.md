# Manual verification checklist

What `claude plugin test .` cannot show: the engine's real behaviour (`/clear`, focus, the dock), the paint, and the model's real replies. Run it by hand before a release and after changing the pane, the setup or anything that touches `$.state` or focus. It is versioned with the code: change an item in the same commit as the behaviour it covers.

Where an item fails, fix the code or the note that says otherwise in `decisions.md`, and add a line to the log at the end.

## Before you start

- Node 22 or newer and tmux. From the repo root: `npm run lingo` (or `scripts/lingo.sh`) runs `npm ci` if the pinned Claude Code is missing, then `claude --plugin-dir .` in a tmux session `lingo-pane` (the pinned Claude Code, not a global one). Options: `--no-tmux`, `--kill`, `--clean` (fresh HOME, for the clean slate below).
- Fullscreen layout, a terminal wider than 144 columns. Items marked *narrow* use one under 110 columns.
- A clean slate for the first run: an empty plugin store (a fresh `HOME`, or remove the `lingo-pane` keys), so `/lingo setup` starts from nothing. For the built-in pack use English as the target language and Spanish as the native one.
- Anything the tutor says needs a logged-in session: it is a real model call on your plan.

## 1. A real `/clear`

The saved setup lives in `$.store`; the screen state (`$.state`: the activity, the wizard, the excerpts, "Later") is meant to reset on `/clear`, `/resume` and `/branch`. The tests cover the store fallback, not a real reset.

1. Setup pending (no setup saved): the toast and the band `2: Start setup · 3: Later` show. Press `3` (Later): the band goes away.
2. Run `/clear`. Expected: the toast shows again and the band is back, because "Later" was forgotten with the state.
3. Run `/lingo setup` and confirm it (a conversation opens). In the conversation, send one reply, then run `/clear`. Expected: the setup is still there (no toast, no band, the Spinner still shows a card in your target language), and `/lingo` opens the suggested activity from the start, not the half-done conversation.
4. Repeat the clear with `/resume` and `/branch` (a new session from the same transcript). Expected: the same as step 3.
5. With "Material from your own session" on, send a prompt, wait for the reply, `/clear`, then open a conversation. Expected: the tutor has no topic from before the clear.

## 2. The "Lesson N done" screen

Review with the built-in pack (`switch ▸`, then `4`; `Start lesson`).

1. Answer the five cards of lesson 1 (a correct answer, a miss with its hint, `Show answer`, `Next`). Expected after the last card: `Lesson 1 done` in the learner color, a `Continue` button holding the focus, and no "Demo finished" line.
2. Press `Continue` (or Enter). Expected: back to `Lesson 2 of 6: x to recall, y new.` and `Start lesson`.
3. Close the split mid-lesson with `/lingo` and open it again: the lesson resumes at the same card (closing never resets the activity).

## 3. The "demo finished" screen

1. Play lessons 2 to 6 the same way (`Show answer` then `Next` is quickest). Expected after lesson 6: `Lesson 6 done` and under it `Demo finished: that was the last lesson.`
2. `Continue`. Expected: `Demo finished: all 6 lessons are done. Come back to review, or wait for the lesson generator.` with no `Start lesson` button when there is nothing to recall and no mistakes saved; with mistakes saved, `Your mistakes: n to review.` and the button.
3. With a language pair other than English to Spanish, the review screen says the built-in pack is English to Spanish ("used for now").

## 4. Input focus

1. Open the split (item 5 of section 5, or `/lingo`). Expected: `● keys here`, and the cursor in the reply field without a click.
2. Type a reply and press Enter. Expected: the field is cleared and focused again for the next one; after the tutor answers, the ring is on the field again, not on a button.
3. `switch ▸` (Tab, Enter), then a digit. Expected: the new activity opens with its own field focused (conversation, role-play: reply; reading: answer; review: the card's answer).
4. Review: after `Next` the next card's field is focused; at the end of a lesson `Continue` holds the focus.
5. Esc: the keys go back to the prompt and the split reads `○ Ctrl+X Tab to come back`. Type in the prompt (nothing goes to the split). Ctrl+X Tab: the keys come back to the field.
6. While Claude shows a permission dialog with the split open: the split shows `Claude needs you` with no field. Note which one held the keyboard, and whether a key meant for the dialog went anywhere else.
7. A focused field eats letter hotkeys: with the cursor in a field, `1`/`2`/`3` type characters; Tab to a button first and they work.

## 5. The split and the pane (moved from the old tmux test)

1. `/lingo setup`: interests, preferences (the three theme previews and the "material from your own session" switch); Confirm opens a conversation at once.
2. Ask Claude something that takes over 2 s: the split opens by itself on the right at about 40 %, with `● keys here`, the Claude line counting seconds, and the tutor's opening line within a few seconds. Note the latency.
3. Type nothing and let the turn end: the split goes about 3 s later.
4. Next turn: type in the field. Reply with a mistake: the wrong words show in the error color, the right form does not. Enter on the empty field: a scaffold, not the answer.
5. Let the turn end while typing: the split stays (`✓ Claude done`).
6. Finish the three replies with Claude idle: the split closes and the summary comes as a toast. With Claude working: the summary stays with `next: role-play ▸` holding the ring.
7. `switch ▸`, then a digit: role-play (scene line), reading (text, questions, an empty Enter that shows the answer), review (your mistakes first, wrong words marked).
8. Submit a new prompt with a split in use: it closes. `/lingo` twice: opens, closes. `/lingo theme tropico` and `/lingo theme pastel`: colors change.
9. *Narrow* terminal or the main screen: nothing opens by itself; `1: open lesson` above the prompt opens it inline, about 40 % tall.
10. A light terminal theme, if at hand: repeat 2 and 7 there and note what is hard to read.
11. Press `🔊 listen` (a click: a Link is not a Tab stop) and check that Google Translate opens with the phrase.
12. The dock: it takes the asked width (40 % by default) and a width you drag wins.
13. A long line in a field (#21): with the split at 40 % of a wide terminal, type a sentence of about 70 characters in the conversation's reply field. Expected: the cursor stays inside the field's border (it does not run over the `listen / switch` row), and under the field a `typing …` row shows the whole sentence, wrapped, growing as you type. Delete back to a short line: the row goes. Send it: the row goes and the sentence is in the conversation. Repeat in a reading answer, a review answer and the setup wizard's fields (languages, interests). A short line must not be repeated, and an empty field shows no extra row. `/clear` or close the split while typing: no `typing …` row comes back when the field does.

## Log

One line per run: date, lingo-pane commit, Claude Code version, sections run, what failed.

| Date | Commit | Claude Code | Sections | Result |
| --- | --- | --- | --- | --- |
| 2026-10-02 | `feat/first-lesson` branch, before `fb1fa35` | 2.1.287 | partial, by hand in tmux | first lesson started, hint, focus moves to the next card; "Lesson N done", demo finished and a real `/clear` not seen |
