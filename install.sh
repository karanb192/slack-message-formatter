#!/bin/bash
# Install slack-message-formatter skill
#
# Claude Code (recommended):
#   claude plugin marketplace add karanb192/slack-message-formatter
#   claude plugin install slack-message-formatter@slack-message-formatter
#
# Manual install (Claude Code or Codex):
#   curl -sSL https://raw.githubusercontent.com/karanb192/slack-message-formatter/main/install.sh | bash
#   curl -sSL ... | bash -s codex         # Codex global
#   curl -sSL ... | bash -s project       # current project only

set -e

REPO="https://github.com/karanb192/slack-message-formatter.git"
TMP=$(mktemp -d)
TARGET="${1:-claude}"

echo "Installing slack-message-formatter..."

git clone --depth 1 --quiet "$REPO" "$TMP"

case "$TARGET" in
  codex)
    CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
    DEST="$CODEX_DIR/skills/slack-message-formatter"
    mkdir -p "$CODEX_DIR/skills"
    ;;
  project)
    # Detect tool: check for .claude/ or .codex/ in current dir
    if [ -d ".codex" ]; then
      DEST=".codex/skills/slack-message-formatter"
      mkdir -p .codex/skills
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
if echo "$DEST" | grep -q codex; then
  echo "Restart Codex to load the skill."
else
  echo "Restart Claude Code or run /reload-plugins to load the skill."
fi
echo "Usage: ask to 'format a Slack message' or run /slack-message-formatter"
