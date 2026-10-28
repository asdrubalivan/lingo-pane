#!/usr/bin/env bash
# Opens the mod in a real Claude Code session, the way docs/manual-checklist.md
# asks: the pinned Claude Code (not a global one), loaded with --plugin-dir, in
# tmux. Anything after the options goes to `claude` as is.
#
#   scripts/lingo.sh              start (or re-attach to) the tmux session `lingo-pane`
#   scripts/lingo.sh --no-tmux    run in this terminal
#   scripts/lingo.sh --kill       close the tmux session and exit
#   scripts/lingo.sh --clean      fresh HOME: empty plugin store, no credentials
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
session="lingo-pane"
use_tmux=1
clean=0
args=()

for arg in "$@"; do
  case "$arg" in
    --no-tmux) use_tmux=0 ;;
    --clean) clean=1 ;;
    --kill) tmux kill-session -t "$session" 2>/dev/null && echo "closed $session" || echo "no $session session"; exit 0 ;;
    *) args+=("$arg") ;;
  esac
done

cd "$root"

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$node_major" -lt 22 ]; then
  echo "Node 22 or newer is needed (found $(node --version 2>/dev/null || echo none))." >&2
  exit 1
fi

pinned="$(node -p "require('./package.json').devDependencies['@anthropic-ai/claude-code']")"
installed="$(node_modules/.bin/claude --version 2>/dev/null | awk '{print $1}' || true)"
if [ "$installed" != "$pinned" ]; then
  echo "Installing the pinned Claude Code ($pinned; found ${installed:-none})..."
  npm ci
fi

cmd=(npm exec --prefix "$root" -- claude --plugin-dir "$root" ${args[@]+"${args[@]}"})
if [ "$clean" -eq 1 ]; then
  home="$(mktemp -d)"
  echo "Clean slate: HOME=$home (the tutor needs a login in there)."
  cmd=(env "HOME=$home" "${cmd[@]}")
fi

if [ "$use_tmux" -eq 0 ] || [ -n "${TMUX:-}" ]; then
  exec "${cmd[@]}"
fi

command -v tmux >/dev/null || { echo "tmux is not installed (brew install tmux), or use --no-tmux." >&2; exit 1; }

if ! tmux has-session -t "$session" 2>/dev/null; then
  tmux new-session -d -s "$session" -c "$root" "$(printf '%q ' "${cmd[@]}")"
fi

cols="$(tput cols 2>/dev/null || echo 0)"
[ "$cols" -gt 144 ] || echo "Note: the checklist wants more than 144 columns (this terminal has $cols); the split needs 110 at least." >&2

exec tmux attach-session -t "$session"
