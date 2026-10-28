# One take of the real mod: Claude works, the split opens, the learner answers in it.
# Run from the repo root, with the demo config dir logged in and seeded:
#   DEMO_CONFIG_DIR=<dir> vhs demo/capture/session.tape
# The model's wording varies: if a Wait times out, run it again.

Output "demo/capture/out/session.mp4"

Set Shell "bash"
Set FontSize 15
Set Width 1280
Set Height 720
Set Padding 12
Set Framerate 30
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"

Hide
Type "demo/capture/launch.sh"
Enter
Wait+Screen@60s /auto mode on/
Sleep 1s
Show

Type "Read src/sanitize.ts, src/storage.ts, src/tutor.ts, src/conversation.ts and src/split.ts, then name the five riskiest spots."
Sleep 600ms
Enter

# The split opens by itself two seconds into the turn.
Wait+Screen@40s /tutor  \S/
Sleep 2500ms

# No Screenshot in the take: it blurs the page and the split gives the keys back
# to the prompt. Stills come from the video (ffmpeg).
# Short lines on purpose: the reply field is one row and cuts a longer sentence
# with an ellipsis (about 38 characters wide here), see the ticket about it.
Type "I like cook pasta"
Sleep 600ms
Enter
Sleep 5s

Type "I like cooking pasta"
Sleep 600ms
Enter
Sleep 7s
