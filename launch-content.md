# Launch Content — slack-message-formatter

---

## 1. awesome-claude-code Issue Form (29K stars)

**Copy-paste these into:** https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

---

**Display Name:**
```
slack-message-formatter
```

**Category:**
```
Agent Skills
```

**Sub-Category:**
```
General
```

**Primary Link:**
```
https://github.com/karanb192/slack-message-formatter
```

**Author Name:**
```
karanb192
```

**Author Link:**
```
https://github.com/karanb192
```

**License:**
```
MIT
```

**Description:**
```
Converts standard Markdown into two Slack-ready formats: rich HTML that preserves bold, italic, tables, code blocks, and task lists when pasted into Slack's compose box, and Slack mrkdwn for webhooks and API messages. Ships as a single self-contained skill with 172 tests and zero dependencies. Claude generates Markdown naturally, the skill handles the rest — preview opens in the browser, user copies and pastes.
```

**Validate Claims:**
```
Install the skill and ask Claude to write any Slack message (a deployment announcement, sprint summary, or incident report). It will generate the Markdown, convert it, and open a browser page. Copy from that page (Cmd+A, Cmd+C) and paste into any Slack channel — all formatting including tables, bold, code blocks, task lists, and blockquotes will carry over perfectly.
```

**Specific Task(s):**
```
Ask Claude to write a deployment announcement with a metrics table, task checklist, code snippet, and blockquote — then paste the result into Slack and verify everything renders correctly.
```

**Specific Prompt(s):**
```
Write a Slack message for #engineering announcing that payment-api v2.4.1 is deployed to production. Include: a summary, a before/after metrics table (latency, error rate, throughput), a task list of post-deploy checks (some done, some pending), a code snippet showing the rollback command, and a blockquote with a note for the oncall. Format for Slack.
```

**Additional Comments:**
```
This skill was built after testing 154 edge cases against slackify-markdown (the most popular converter at 207K weekly npm downloads) and finding 13 hard failures including broken tables, stripped task lists, and unescaped <script> tags. The key discovery during development: Slack's WYSIWYG paste handler accepts rich HTML from browser clipboard, which means tables and nested lists work via copy-paste even though Slack's native mrkdwn format doesn't support them. No other skill or tool combines both the HTML copy-paste path and the mrkdwn API path in one package.
```

---

## 2. Reddit Posts

### Post A: r/ClaudeAI

**Title:**
```
I built a Claude Code skill that formats messages for Slack perfectly — tables, code blocks, task lists all survive the paste
```

**Body:**
```
I got tired of Claude's Markdown looking broken in Slack. **bold** doesn't work, [links](url) show as raw text, tables are a mess. Slack uses its own format called "mrkdwn" which is similar but different enough to break everything.

So I built a Claude Code skill that handles this. You just say "write a deployment announcement for Slack" and it:

1. Generates the content in Markdown (Claude's native format)
2. Converts it to rich HTML
3. Opens a browser preview
4. You Cmd+A, Cmd+C, Cmd+V into Slack — formatting preserved

The key discovery: Slack's compose box accepts rich HTML from browser clipboard. So tables, nested lists, task lists — things that Slack's own mrkdwn format doesn't even support — all work via copy-paste.

It also has a webhook path for sending directly via API (converts to proper mrkdwn with `*bold*`, `_italic_`, `<url|text>` etc.)

**What it handles:**
- Bold, italic, strikethrough, inline code
- Tables (as aligned code blocks — Slack breaks HTML tables in mixed content)
- Task lists with ✅/⬜ emoji
- Code blocks (strips language hints)
- Blockquotes, nested lists, headings → bold
- Slack mentions (<@U123>, <#C123>, <!here>) pass through
- 150+ emoji shortcodes → Unicode

172 tests. Zero dependencies. Single file.

GitHub: https://github.com/karanb192/slack-message-formatter

Install:
```
claude plugin marketplace add karanb192/slack-message-formatter
claude plugin install slack-message-formatter@slack-message-formatter
```

Or just copy the skill folder into your .claude/skills/ directory.

Built this after testing slackify-markdown (207K weekly downloads) and finding 13 hard failures — broken tables, stripped checkboxes, unescaped script tags. Figured the community needed something that actually works 100%.
```

---

### Post B: r/Slack

**Title:**
```
I built a free tool that lets you write messages in Markdown and paste them into Slack with full formatting — tables, code blocks, checklists all work
```

**Body:**
```
If you've ever tried to paste formatted text into Slack and had it come out as a mess — this is for you.

**The problem:** Slack uses its own formatting syntax (mrkdwn), not standard Markdown. So **bold** doesn't work, [links](url) show literally, and tables? Forget about it.

**The solution:** I built a converter that takes Markdown and turns it into rich HTML. You open the result in your browser, Cmd+A, Cmd+C, then Cmd+V into Slack. Everything survives — bold, italic, links, code blocks, blockquotes, even tables.

**Why this works:** Slack's compose box is a WYSIWYG editor that accepts rich clipboard content from browsers. So when you copy formatted text from a web page, Slack keeps the formatting. The tool generates exactly the right HTML for Slack to accept.

**What works:**
- ✅ Bold, italic, strikethrough
- ✅ Links (clickable)
- ✅ Code blocks
- ✅ Bullet and numbered lists
- ✅ Tables (as monospace text blocks)
- ✅ Task lists with checkboxes
- ✅ Blockquotes
- ✅ @mentions and #channels

**Also has a webhook mode** — if you want to send messages programmatically (bots, CI/CD notifications), it converts to Slack's mrkdwn format and sends via webhook.

Free and open source: https://github.com/karanb192/slack-message-formatter

Works as a Claude Code skill (AI generates the message + formats it), or standalone via command line.
```

---

### Post C: r/SideProject

**Title:**
```
Built a Markdown → Slack formatter that actually handles tables and task lists (172 tests, zero deps)
```

**Body:**
```
**What I built:** A tool that converts standard Markdown into Slack-ready output. Two modes:
1. Rich HTML → copy from browser → paste into Slack (formatting preserved)
2. Slack mrkdwn → send via webhook/API

**Why:** Every existing tool (slackify-markdown, md-to-slack, etc.) only does text-to-text mrkdwn conversion. But mrkdwn doesn't support tables, task lists, or headings. And you can't paste mrkdwn into Slack's compose box — it's a WYSIWYG editor.

**The insight:** Slack's compose box accepts rich HTML from browser clipboard. So copy-pasting formatted HTML from a browser preserves tables, nested lists, checkboxes — things mrkdwn can't do.

**No one had built this.** I checked:
- 3 existing Claude Code skills (mrkdwn only, no preview)
- 7 conversion libraries across JS, Python, Ruby, Rust (text-to-text only)
- 8 web converters (no rich clipboard)
- Reddit threads confirming "no preview tool" as a pain point

**Tech:** Zero dependencies, single JavaScript file, 172 tests. Works as a Claude Code/Codex skill or standalone CLI.

GitHub: https://github.com/karanb192/slack-message-formatter

Would love feedback from anyone who formats messages for Slack regularly.
```

---

### Post D: r/webdev / r/programming (shorter, technical)

**Title:**
```
TIL Slack's compose box accepts rich HTML from browser clipboard — built a Markdown → Slack formatter around this
```

**Body:**
```
Slack's compose box is a WYSIWYG editor. When you paste text copied from a browser, it preserves:
- Bold, italic, strikethrough
- Links (clickable)
- Tables
- Lists (including nested)
- Code blocks
- Blockquotes

But Slack's own "mrkdwn" format doesn't support tables, headings, or task lists. And programmatic clipboard (Clipboard API, execCommand, osascript) doesn't preserve tables reliably either.

Only **manual browser copy** (Cmd+C from a rendered page) works for everything.

Built a tool around this: takes Markdown → generates clean HTML → opens in browser → you copy-paste into Slack.

Also outputs Slack mrkdwn for API/webhook use.

172 tests, zero deps, MIT licensed: https://github.com/karanb192/slack-message-formatter

The interesting technical finding: `<table>` HTML survives Slack paste when it's the only content, but breaks when mixed with other block elements (bold text, lists, blockquotes). Tables need to be code blocks in mixed-content messages.
```
