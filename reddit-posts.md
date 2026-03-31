# Reddit Launch Posts

> Post order: 0-5 on Day 1 (spread across a few hours), 6 on Saturday, 7-8 on Day 3+
> Attach `demo.gif` to every post that allows images.
> NEVER copy-paste the same text across subreddits. Each is tailored.

---

## 0. r/ClaudeCode (Flair: Showcase) — Post FIRST

**Title:**
```
Slack kept mangling my Claude output. Built a skill that fixes formatting for good.
```

**Body:**
```
Got frustrated with Slack breaking Claude's Markdown output. Built a skill to fix it.

What it does: You ask Claude to write a Slack message. It generates Markdown, the skill converts it to rich HTML, a browser page opens. You Cmd+A, Cmd+C, paste in Slack. Bold, tables, code blocks, checklists all preserved.

Also converts to Slack mrkdwn for webhook/API sends.

Non-obvious thing I found while building this: Slack's compose box accepts rich HTML from browser clipboard. Tables and nested lists (things Slack's own mrkdwn doesn't support) work via copy-paste. But only via real Cmd+C, not programmatic clipboard APIs.

Install:
claude plugin marketplace add karanb192/slack-message-formatter
claude plugin install slack-message-formatter@slack-message-formatter

Or symlink into .claude/skills/:
ln -s path/to/slack-message-formatter .claude/skills/slack-message-formatter

172 tests. Zero deps. Single file.

GitHub: https://github.com/karanb192/slack-message-formatter

Built this after testing the most popular existing converters and finding 13 failures across tables, checkboxes, and escaping. Happy to answer questions about the approach or the Slack paste quirks I found.
```

---

## 1. r/ClaudeAI (668K) — Flair: Built with Claude

**Title:**
```
Claude's Markdown looks broken in Slack. This skill fixes it completely.
```

**Body:**
```
Every time Claude generates a message for Slack, the formatting breaks. **bold** shows as asterisks, [links](url) show raw, tables are hopeless.

Slack uses "mrkdwn", which looks like Markdown but isn't. So I built a skill that handles the conversion properly.

How it works:
1. You ask Claude to write a Slack message
2. It generates Markdown (what it's good at)
3. The skill converts it to rich HTML and opens a browser preview
4. Cmd+A, Cmd+C, Cmd+V into Slack. Formatting preserved.

The trick nobody talks about: Slack's compose box accepts rich HTML from browser clipboard. So tables, nested lists, checklists (things mrkdwn doesn't even support) work via copy-paste.

Also has a webhook path for sending via API (proper mrkdwn with *bold*, _italic_, <url|text>).

172 tests. Zero dependencies. Single file.

GitHub: https://github.com/karanb192/slack-message-formatter

Install:
claude plugin marketplace add karanb192/slack-message-formatter
claude plugin install slack-message-formatter@slack-message-formatter

I tested the popular existing converters first and found 13 hard failures. Broken tables, stripped checkboxes, unescaped script tags. That's what pushed me to build this.

Happy to answer questions about the approach.
```

---

## 2. r/SideProject (667K) — No flair needed

**Title:**
```
Slack destroys formatted messages when you paste. I built a free tool that fixes it.
```

**Body:**
```
If you've ever written a nice formatted message and pasted it into Slack only to see it turn into garbage, that's what pushed me to build this.

Slack doesn't use Markdown. It uses its own thing called "mrkdwn" where bold is *single asterisk*, links are <url|text>, and tables just... don't exist.

I built a free open-source tool that takes standard Markdown and converts it two ways:

1. Rich HTML you can copy-paste from a browser into Slack (formatting preserved)
2. Slack mrkdwn for bots and webhooks

What actually works when you paste:
- Bold, italic, strikethrough, links
- Code blocks
- Bullet and numbered lists
- Tables (as monospace blocks, since Slack can't handle HTML tables mixed with other content)
- Task lists with checkboxes
- Blockquotes
- @mentions and #channels

172 tests. Zero dependencies.

https://github.com/karanb192/slack-message-formatter

Would love feedback from anyone who deals with Slack formatting regularly.
```

---

## 3. r/ChatGPTCoding (367K) — Comment in Weekly Self Promotion Thread

**Body:**
```
Built a Claude Code skill that properly formats messages for Slack.

Problem: AI outputs Markdown, Slack uses "mrkdwn" (different syntax). Bold, links, tables all break.

Solution: Skill converts Markdown to rich HTML (copy-paste into Slack) and to mrkdwn (for API/webhooks). Opens a browser preview, you copy, paste into Slack, done.

The non-obvious part: Slack's compose box accepts rich HTML from browser clipboard. So tables and checklists work even though Slack's native format doesn't support them.

172 tests, zero deps, MIT licensed.

https://github.com/karanb192/slack-message-formatter

Works as a Claude Code skill or standalone CLI.
```

---

## 4. r/opensource (339K) — Flair: Promotional

**Title:**
```
slack-message-formatter: Markdown to Slack converter with rich HTML copy-paste [JavaScript, MIT, 172 tests]
```

**Body:**
```
Sharing an open-source tool I built. Looking for feedback.

What it does: Converts standard Markdown to two Slack-compatible formats:
1. Rich HTML (copy from browser, paste into Slack, formatting preserved)
2. Slack mrkdwn (send via webhook/API)

Why I built it: The existing tools only do text-to-text mrkdwn conversion. But mrkdwn doesn't support tables, task lists, or headings. And you can't paste mrkdwn into Slack's compose box because it's a WYSIWYG editor that ignores it.

The key insight: Slack's editor accepts rich HTML from browser clipboard. Copy-pasting formatted HTML preserves tables, nested lists, checkboxes. Things mrkdwn can't do.

Tech:
- Single JavaScript file, zero external dependencies
- 172 automated tests
- MIT licensed
- Works as a Claude Code skill or standalone via CLI

Repo: https://github.com/karanb192/slack-message-formatter

Contributions welcome, especially around edge cases. The test suite is easy to extend.
```

---

## 5. r/devtools (895) — No flair needed

**Title:**
```
Markdown to Slack formatter. Rich HTML copy-paste + mrkdwn API output.
```

**Body:**
```
Open-source CLI tool + Claude Code skill that converts Markdown to Slack-ready output.

Two modes:
- preview: opens browser with formatted HTML, copy-paste into Slack
- send: converts to mrkdwn, sends via webhook

Handles tables (as code blocks), task lists (emoji checkboxes), code blocks, blockquotes, nested lists, @mentions.

172 tests, zero deps, single file.

echo '**bold** and *italic*' | node run.mjs html
> <b>bold</b> and <i>italic</i>

echo '**bold** and *italic*' | node run.mjs mrkdwn
> *bold* and _italic_

https://github.com/karanb192/slack-message-formatter
```

---

## 6. r/webdev (3.2M) — Flair: Showoff Saturday (REQUIRED, Saturday only)

**Title:**
```
Showoff Saturday: Markdown to Slack copy-paste converter. Tables, code blocks, checklists all survive.
```

**Body:**
```
Made a small tool that solves a specific annoyance: formatting messages for Slack.

Slack uses "mrkdwn" (not Markdown). Bold is *single asterisk*, links are <url|text>, tables don't exist. So anything formatted in Markdown looks broken when you share it in Slack.

This tool converts Markdown to clean HTML. You open the output in a browser, copy it, paste into Slack. Formatting carries over. Bold, italic, links, code blocks, lists, blockquotes, even tables (as monospace blocks since Slack's editor can't handle HTML tables in mixed content).

Also outputs Slack mrkdwn for API/webhook use.

Zero deps. Single JS file. 172 tests.

https://github.com/karanb192/slack-message-formatter

Found an interesting quirk while building this: Slack's compose box is a WYSIWYG editor that accepts rich clipboard content from browsers, but NOT from programmatic clipboard APIs (Clipboard API, execCommand, osascript all fail for tables). Only real browser Cmd+C works.
```

---

## 7. r/artificial (1.2M) — Flair: Discussion

**Title:**
```
What I learned building a Claude Code skill. Slack formatting as a case study.
```

**Body:**
```
I recently built a Claude Code skill for formatting Slack messages and wanted to share some findings about the skill development process.

The problem: Claude outputs Markdown, Slack uses "mrkdwn" (a different format). Everything breaks when you try to share AI-generated content in Slack.

What I learned building the skill:

1. Let the LLM do what it's good at. I tried having Claude generate mrkdwn directly, it kept making syntax mistakes. Better approach: Claude generates Markdown (its native format), then deterministic code converts it. LLM handles content, code handles syntax.

2. The clipboard trick nobody documented. Slack's compose box accepts rich HTML from browser clipboard. So tables and checklists (things mrkdwn doesn't support) work if you copy-paste from a browser. But only via real Cmd+C. Programmatic clipboard (JS Clipboard API, osascript) breaks table formatting.

3. 172 tests for a "simple" converter. Markdown to Slack has more edge cases than you'd expect. snake_case turning italic, code blocks inside blockquotes, emoji shortcodes, nested lists. Every edge case is a bug report waiting to happen.

The skill is open source if anyone's curious: https://github.com/karanb192/slack-message-formatter

Interested in hearing from others building Claude Code skills. What patterns have you found that work well?
```

---

## 8. r/Slack (34K) — No flair needed

**Title:**
```
Free tool to paste formatted messages into Slack. Bold, tables, code blocks, checklists all work.
```

**Body:**
```
Made a small open-source tool that solves the "paste formatted text into Slack" problem.

You write your message in Markdown (or any text editor), run it through the tool, it opens a clean web page. Copy from that page, paste into Slack. Formatting carries over.

What works:
- Bold, italic, strikethrough
- Links (clickable)
- Code blocks
- Numbered and bullet lists
- Tables (as monospace text)
- Checklists
- Blockquotes
- @mentions and #channels

Why this works: Slack's message box is a rich text editor. When you copy formatted text from a browser, Slack keeps the formatting. The tool generates the right HTML for this to work.

Free, no account needed: https://github.com/karanb192/slack-message-formatter

Works from command line or as a Claude Code skill. Happy to answer questions.
```

---

## Posting Rules Summary

| # | Subreddit | Day | Flair | Key rule |
|---|-----------|-----|-------|----------|
| 0 | r/ClaudeCode | 1 | Showcase | Most targeted audience |
| 1 | r/ClaudeAI | 1 | Built with Claude | Full showcase OK |
| 2 | r/SideProject | 1 | None | Don't lead with AI |
| 3 | r/ChatGPTCoding | 1 | Community | Self-promo thread ONLY |
| 4 | r/opensource | 1-2 | Promotional | Must use Promotional flair |
| 5 | r/devtools | 1-2 | None | Tiny sub, low risk |
| 6 | r/webdev | Saturday | Showoff Saturday | ONLY on Saturday with flair |
| 7 | r/artificial | 3+ | Discussion | Frame as learnings, not promo |
| 8 | r/Slack | 3+ | None | NO AI mention in title |

**DO NOT post to:** r/coding (bans "I made" + "AI slop"), r/productivity (anti-AI crackdown), r/programming (requires blog post format), r/learnprogramming (wrong audience)

**Universal:** Disclose authorship. Don't multi-post same day. Reply to every comment. Don't copy-paste across subs.
