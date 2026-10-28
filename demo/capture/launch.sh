#!/usr/bin/env bash
# Starts the mod in a clean Claude Code session meant to be recorded (vhs, tmux).
#
# - DEMO_CONFIG_DIR is a throwaway Claude config dir: its own login, an empty
#   plugin store, so /lingo setup starts from nothing and your real store is
#   never touched. Log in once in it (it asks on first launch).
# - The variables a parent Claude Code session exports are dropped, or the
#   recorded session turns its transcript off and shows a warning.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

for name in $(compgen -e); do
  case "$name" in CLAUDE*|ANTHROPIC_*) unset "$name" ;; esac
done

# No "Update installed" toast mid-take, and links as real hyperlinks (OSC 8) so
# `🔊 listen` is a short label and not the whole translate URL.
export DISABLE_AUTOUPDATER=1
export FORCE_HYPERLINK=1

# The header prints the working directory; leave it out so the take does not
# show where it was recorded. Set after the loop above, which drops CLAUDE*.
export CLAUDE_CODE_HIDE_CWD=1

export CLAUDE_CONFIG_DIR="${DEMO_CONFIG_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/lingo-pane-demo-claude}"
mkdir -p "$CLAUDE_CONFIG_DIR"

cd "$repo"
exec npm exec -- claude --plugin-dir .
