# demo

The 30 s demo of lingo-pane: a real take of the mod in a terminal, put together with [Remotion](https://www.remotion.dev).

```
demo/capture/   records the real mod (vhs)        -> capture/out/session.mp4
demo/public/    session.mp4, the take Remotion plays
demo/src/       the composition (captions, outlines, intro, outro)
demo/out/       renders (git ignores them)
```

## Taking screenshots of the mod

The mod is drawn by Claude Code in the terminal, so a "screenshot" is a terminal capture. What was tried, on macOS:

| Way | Verdict |
| --- | --- |
| [`vhs`](https://github.com/charmbracelet/vhs) `Screenshot "x.png"` and `Output "x.mp4"` | **Use this.** It renders the real session (colors, the docked split, hyperlinks) to PNG or video. |
| `tmux capture-pane -p -e` | Plain text with ANSI colors. Good for reading what is on screen and for driving the session (wait for text), not for pictures. |
| The mod's test kit (`claude plugin test .`) | Checks behavior, draws no pixels. |

Things that cost time and are in the scripts now:

- **Log in once in a throwaway config dir** (`DEMO_CONFIG_DIR`). It has its own login (Claude Code keys credentials on the config dir) and an empty plugin store, so your real `lingo-pane` data is never touched.
- **`demo/capture/launch.sh`** drops the `CLAUDE*` variables a parent Claude Code session exports (otherwise the take shows "Transcript saving is off"), turns off the auto-updater toast and sets `FORCE_HYPERLINK=1`, so `🔊 listen` is a short link and not the whole Google Translate URL.
- **`demo/capture/seed-store.mjs`** writes a finished setup into the store, so the take starts on the lesson. Driving the seven-step wizard with Tab is fragile: one stray key and the text goes to Claude's prompt.
- **No `Screenshot` in a take.** It blurs the page and the split gives the keyboard back to the prompt (`○ Ctrl+X Tab to come back`). Take stills from the video: `ffmpeg -ss 12 -i session.mp4 -frames:v 1 still.png`.
- **A permission ask hands the keyboard to the dialog** (`Claude needs you`), so the learner's typing lands in the prompt. The prompt in `session.tape` only uses `Read` on named files. `vhs` records at 25 fps whatever `Framerate` says.
- The split opens 2 s into a turn and closes when the turn ends (if you have not touched it), so the task has to last: about 35 s here.

## Re-recording the take

```sh
export DEMO_CONFIG_DIR=~/.cache/lingo-pane-demo-claude
npm exec -- claude --plugin-dir .      # once, from the repo root, to log in and let the mod create its store; then exit
node demo/capture/seed-store.mjs
vhs demo/capture/session.tape          # from the repo root; run it again if a Wait times out (the model's wording varies)
cp demo/capture/out/session.mp4 demo/public/session.mp4
```

Then move the seconds in `STEPS` (`src/Demo.tsx`) to match the new take: each caption is placed by the second of the take it talks about.

## Rendering

```sh
cd demo
npm ci
npm run dev                                                    # Remotion Studio
npx remotion render LingoPaneDemo out/lingo-pane-demo.mp4      # 1280x720, 30 fps
npx remotion render LingoPaneDemo out/lingo-pane-demo.gif --codec=gif --every-nth-frame=2 --scale=0.75   # 960x540, 15 fps, ~7 MB
```
