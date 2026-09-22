# Slack Message Formatter

A skill for Claude Code and Codex CLI that converts Markdown to Slack-compatible output with two delivery paths:

1. **Copy-paste**: rich HTML that preserves formatting when pasted into Slack's compose box
2. **API/Webhook**: Slack mrkdwn syntax for bots, automation, and CI/CD

## Why?

- Slack uses **mrkdwn** (not Markdown). `**bold**` doesn't work, you need `*bold*`.
- Existing tools handle conversion well, but none combine **generation + preview + copy-paste** in one workflow.
- Programmatic clipboard doesn't preserve tables in Slack. Manual browser copy does.
- This skill gives you both paths: copy-paste for humans, webhook for bots.

Zero runtime dependencies. Requires Node.js 20 or newer. Install with a native plugin or the [skills CLI](https://skills.sh/docs).

![Demo](demo.gif)

## Install

### Claude Code plugin

```bash
claude plugin marketplace add karanb192/slack-message-formatter
claude plugin install slack-message-formatter@slack-message-formatter
```

### Codex CLI plugin (recommended for Codex)

```bash
codex plugin marketplace add karanb192/slack-message-formatter
codex plugin add slack-message-formatter@slack-message-formatter
```

Start a new Codex session, then ask it to format a Slack message. Use a current
Codex CLI with the `codex plugin` commands. If your version lacks them, update
Codex or use the skills CLI below.

### Standalone skill via skills.sh

Install for Codex across your projects with Node.js/npm and Git available:

```bash
npx skills add karanb192/slack-message-formatter --skill slack-message-formatter --agent codex --global
```

Omit `--global` to install into the current project's `.agents/skills` directory.
Choose either this route or the Codex plugin to avoid duplicate skills.

The skill stays in this GitHub repo. [skills.sh lists skills through install
telemetry](https://skills.sh/docs/faq#how-do-i-get-my-skill-listed-on-the-leaderboard),
so no separate package upload is needed. The native plugins and skills CLI all
use `skills/slack-message-formatter/`.

### Manual install (curl)

```bash
# Claude Code global
curl -sSL https://raw.githubusercontent.com/karanb192/slack-message-formatter/main/install.sh | bash

# Codex global
curl -sSL https://raw.githubusercontent.com/karanb192/slack-message-formatter/main/install.sh | bash -s codex

# Current project only (auto-detects Claude Code or Codex)
curl -sSL https://raw.githubusercontent.com/karanb192/slack-message-formatter/main/install.sh | bash -s project
```

### Updating

For the Codex plugin, refresh the marketplace and install the current version,
then start a new session:

```bash
codex plugin marketplace upgrade slack-message-formatter
codex plugin add slack-message-formatter@slack-message-formatter
```

For a skills CLI install, rerun its install command above. For a shell install,
rerun the corresponding `install.sh` command.

For the Claude Code plugin, refresh the marketplace inside Claude Code:

```
/plugin marketplace update slack-message-formatter
/reload-plugins
```

### Uninstall

```bash
# Codex plugin
codex plugin remove slack-message-formatter@slack-message-formatter

# skills CLI global install (omit --global for a project install)
npx skills remove slack-message-formatter --agent codex --global

# Claude Code plugin
claude plugin uninstall slack-message-formatter@slack-message-formatter
```

For a shell install, remove only the `slack-message-formatter` directory at the
path printed by the installer. Codex global shell installs use
`${CODEX_HOME:-$HOME/.codex}/skills/slack-message-formatter`; Claude Code global
shell installs use `~/.claude/skills/slack-message-formatter`.

### Use the skill

In Claude Code or a new Codex session, ask:

- "Write a Slack message announcing our v2.5 release"
- "Format this for Slack"

For explicit invocation, use `$slack-message-formatter` in Codex or
`/slack-message-formatter` in Claude Code.

### Standalone CLI

From a clone of this repo:

```bash
cd skills/slack-message-formatter
echo '**bold** and *italic*' | node src/run.mjs html
# → <b>bold</b> and <i>italic</i>

echo '**bold** and *italic*' | node src/run.mjs mrkdwn
# → *bold* and _italic_

echo '## Announcement' | node src/run.mjs preview
# → Opens browser with Slack-themed preview + copy page
```

## Features

### Copy-Paste Path (Rich HTML)
- Opens a clean HTML page in your browser
- `Cmd+A`, `Cmd+C`, then `Cmd+V` in Slack
- Preserves: bold, italic, strikethrough, links, lists, nested lists, code blocks, blockquotes, headings, task lists, tables (as code blocks), horizontal rules

### API/Webhook Path (mrkdwn)
- Converts to Slack's native mrkdwn format
- Send directly via webhook:
  ```bash
  echo '**hello**' | node src/run.mjs send
  ```
- Requires `SLACK_WEBHOOK_URL` environment variable (`CCH_SLA_WEBHOOK` also works)
- HTTP errors from Slack are reported with status and response body

### Conversion Reference

| Markdown | Slack mrkdwn | HTML (paste) |
|----------|-------------|--------------|
| `**bold**` | `*bold*` | `<b>bold</b>` |
| `*italic*` | `_italic_` | `<i>italic</i>` |
| `~~strike~~` | `~strike~` | `<s>strike</s>` |
| `` `code` `` | `` `code` `` | `<code>code</code>` |
| `[text](url)` | `<url\|text>` | `<a href="url">text</a>` |
| `# Heading` | `*Heading*` | `<b>Heading</b>` |
| `- [x] Done` | `:white_check_mark: Done` | `✅ Done` |
| `- [ ] Todo` | `:black_square_button: Todo` | `⬜ Todo` |
| Tables | Code block | Code block |
| `---` | `━━━━━━━━━━` | `<hr>` |
| `:tada:` | `:tada:` (Slack renders) | `🎉` (Unicode) |

### Commands

| Command | What it does |
|---------|-------------|
| `preview` | Opens browser with copy page + dark preview |
| `send` | Sends via Slack webhook (mrkdwn) |
| `html` | Outputs raw HTML to stdout |
| `mrkdwn` | Outputs raw mrkdwn to stdout |

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `SLACK_FORMATTER_PREVIEW_DIR` | `/tmp/slack-formatter` | Directory for preview HTML files (pruned after 7 days) |
| `SLACK_WEBHOOK_URL` | (none) | Slack webhook URL for `send` command (`CCH_SLA_WEBHOOK` also honored for back-compat) |
| `JIRA_BASE_URL` | (none) | Jira site URL (e.g. `https://yoursite.atlassian.net`). When set, bare ticket keys like `ENG-12345` become clickable links on every output path |

### Jira Auto-linking

Set `JIRA_BASE_URL` and bare Jira keys are turned into links automatically:

```bash
export JIRA_BASE_URL=https://yoursite.atlassian.net
echo 'Fixed DEVOPS-14389' | node src/run.mjs mrkdwn
# → Fixed <https://yoursite.atlassian.net/browse/DEVOPS-14389|DEVOPS-14389>
```

Keys inside code spans, code blocks, existing links, or URLs are left alone,
as are common acronyms that look like keys (`UTF-8`, `SHA-256`, `CVE-…`, etc.).

## How It Works

```
Markdown → Parser → Dual Renderer
                    ├── Rich HTML → Browser → Cmd+C → Slack paste
                    └── mrkdwn   → Webhook → Slack API
```

1. **You write Markdown** (or your agent generates it)
2. **The converter transforms it** deterministically, so the same input always produces the same output
3. **Two outputs**: Rich HTML for copy-paste, mrkdwn for API

Tables are rendered as aligned code blocks because Slack's paste handler breaks HTML `<table>` tags when mixed with other rich content.

## Key Discovery: Slack Paste Limitations

Through extensive testing, we discovered:

- **Programmatic clipboard** (Clipboard API, `execCommand`, `osascript`) **does not reliably preserve formatting** when pasting into Slack
- **Manual browser copy** (`Cmd+A`, `Cmd+C` from a rendered HTML page) **works perfectly** for all formatting including tables
- **HTML tables break** in Slack paste when mixed with other rich content (bold, lists, blockquotes), even with manual copy. Tables must be code blocks.
- **Slack's paste handler trims spaces around inline formatting inside list items**: `<li>with <b>bold</b> and</li>` pastes as "withboldand". The converter emits `&#160;` around inline tags in list items; Slack normalizes it back to a regular space.
- **A `<br>` inside `<li>` makes Slack flatten the whole list** to plain paragraphs. Multi-line list items are joined with spaces (Markdown soft-wrap semantics) so lists stay native.
- **150+ emoji shortcodes** (`:tada:`, `:rocket:`, etc.) are converted to Unicode for browser preview

## Testing

```bash
node test-skill.mjs   # from repo root
node --test test-distribution.mjs
```

Comprehensive test suite with 232+ tests covering:
- Both HTML and mrkdwn output for every feature
- Emoji shortcode conversion (85+ verified individually)
- Nested formatting, edge cases, unclosed markers
- Real-world messages (deployment, incident, meeting notes, code review, sprint summary)
- Special character escaping, Windows line endings

## Known Limitations

- **Bare URLs** (`https://example.com` without link syntax) are not auto-linked. Use `[text](url)` syntax. Slack auto-links bare URLs when sent via API anyway.
- **Relative links** (`[Docs](/path)`) are ignored. Only `http://`, `https://`, and `mailto:` links are converted.
- **Deeply nested parenthesized URLs** like `(a_(b_(c)))` may not parse correctly. Single-level parens (e.g. Wikipedia URLs) work fine.
- **Tables in copy-paste** render as code blocks. Slack's WYSIWYG editor does not reliably accept HTML `<table>` tags when pasted alongside other rich content.
- **`snake_case` text** is safe, underscores inside words are not misinterpreted as italic.

## Acknowledgements

Built on the shoulders of great tools in the Slack formatting ecosystem:

- [slackify-markdown](https://www.npmjs.com/package/slackify-markdown): the most popular Markdown-to-mrkdwn converter (207k weekly downloads). Inspired our mrkdwn conversion approach.
- [sirkitree/slack-markdown-formatter](https://github.com/sirkitree/slack-markdown-formatter): a Claude Code skill that pioneered teaching Claude Slack formatting rules.
- [ccheney/robust-skills](https://github.com/ccheney/robust-skills): comprehensive mrkdwn and Block Kit skills for Claude Code.
- [slackdown.com](https://slackdown.com): web-based converter with HTML copy support.
- [Slack's official docs](https://api.slack.com/reference/surfaces/formatting): the mrkdwn specification.

This tool adds **browser preview + copy-paste + table support** on top of the conversion these tools pioneered.

## License

MIT
