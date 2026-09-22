#!/bin/bash
# Install slack-message-formatter skill
#
# Claude Code plugin (recommended for Claude Code):
#   claude plugin marketplace add karanb192/slack-message-formatter
#   claude plugin install slack-message-formatter@slack-message-formatter
#
# Codex CLI plugin (recommended for Codex):
#   codex plugin marketplace add karanb192/slack-message-formatter
#   codex plugin add slack-message-formatter@slack-message-formatter
#
# Manual install (Claude Code or Codex):
#   curl -sSL https://raw.githubusercontent.com/karanb192/slack-message-formatter/main/install.sh | bash
#   curl -sSL ... | bash -s codex         # Codex global
#   curl -sSL ... | bash -s project       # current project only

set -e

REPO="https://github.com/karanb192/slack-message-formatter.git"
TMP=$(mktemp -d)
TARGET="${1:-claude}"
AGENT="claude"

echo "Installing slack-message-formatter..."

git clone --depth 1 --quiet "$REPO" "$TMP"

case "$TARGET" in
  codex)
    AGENT="codex"
    CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
    DEST="$CODEX_DIR/skills/slack-message-formatter"
    mkdir -p "$CODEX_DIR/skills"
    ;;
  project)
    if [ -d ".codex" ] || [ -d ".agents/skills" ]; then
      AGENT="codex"
      DEST=".agents/skills/slack-message-formatter"
      mkdir -p .agents/skills
    else
      DEST=".claude/skills/slack-message-formatter"
      mkdir -p .claude/skills
    fi
    ;;
  *)
    # Default: Claude Code global
    DEST="$HOME/.claude/skills/slack-message-formatter"
    mkdir -p "$HOME/.claude/skills"
    ;;
esac

# Remove existing install
rm -rf "$DEST"

# Copy skill files
cp -r "$TMP/skills/slack-message-formatter" "$DEST"

# Clean up
rm -rf "$TMP"

echo "Installed to $DEST"
echo ""
if [ "$AGENT" = "codex" ]; then
  echo "Restart Codex to load the skill."
  echo 'Usage: ask to "format a Slack message" or use $slack-message-formatter'
else
  echo "Restart Claude Code or run /reload-plugins to load the skill."
  echo "Usage: ask to 'format a Slack message' or run /slack-message-formatter"
fi
