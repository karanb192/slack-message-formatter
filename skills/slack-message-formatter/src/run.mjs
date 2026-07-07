#!/usr/bin/env node

/**
 * CLI runner for slack-message-formatter skill.
 *
 * Usage:
 *   echo "**bold**" | node run.mjs preview
 *   echo "**bold**" | node run.mjs send
 *   echo "**bold**" | node run.mjs html
 *   echo "**bold**" | node run.mjs mrkdwn
 */

// Since this is a skill bundled as plain JS (not a compiled TS project),
// we inline the converters here for zero-dependency operation.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { platform, tmpdir } from "os";

// =============================================================
// Read stdin
// =============================================================

function readStdin() {
  try {
    // fd 0 instead of /dev/stdin — works on Windows too
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

// =============================================================
// Inline HTML converter
// =============================================================

function escapeHtml(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function convertToHTML(md) {
  // Parse into typed blocks, then join with spacing rules — see the join at
  // the bottom of this function.
  const blocks = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    if (line.match(/^```/)) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].match(/^```/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(["pre", `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`]);
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (headingMatch) {
      blocks.push(["text", `<b>${inlineToHTML(headingMatch[2])}</b>`]);
      i++;
      continue;
    }

    // HR
    if (line.match(/^(?:---+|\*\*\*+|___+)\s*$/)) {
      // Same unicode divider as the mrkdwn path — a real <hr> does not
      // survive Slack's paste handler (it turns into stray empty lines)
      blocks.push(["text", "━".repeat(30)]);
      i++;
      continue;
    }

    // Table
    if (line.match(/^\|/) && i + 1 < lines.length && lines[i + 1].match(/^\|[\s:|-]+\|/)) {
      const headerCells = parseTableRow(line);
      const alignLine = lines[i + 1];
      const aligns = parseTableAlign(alignLine);
      i += 2; // skip header and separator

      const bodyRows = [];
      while (i < lines.length && lines[i].match(/^\|/)) {
        bodyRows.push(parseTableRow(lines[i]));
        i++;
      }

      const alignAttr = (idx) => {
        const a = aligns[idx];
        return a ? ` style="text-align:${a}"` : "";
      };

      // Tables as code blocks — HTML <table> doesn't survive Slack paste
      // when mixed with other rich content (bold, lists, blockquotes).
      const colWidths = headerCells.map((h, j) => {
        const allCells = [h, ...bodyRows.map(r => (r[j] || ""))];
        return Math.max(...allCells.map(c => c.length));
      });
      const pad = (s, w) => s + " ".repeat(Math.max(0, w - s.length));
      let tableText = headerCells.map((h, j) => pad(h, colWidths[j])).join(" | ") + "\n";
      tableText += colWidths.map(w => "-".repeat(Math.max(w, 3))).join("-|-") + "\n";
      for (const row of bodyRows) {
        tableText += row.map((c, j) => pad(c || "", colWidths[j])).join(" | ") + "\n";
      }
      blocks.push(["pre", `<pre><code>${escapeHtml(tableText.trimEnd())}</code></pre>`]);
      continue;
    }

    // Blockquote
    if (line.match(/^>\s?/)) {
      const quoteLines = [];
      while (i < lines.length && lines[i].match(/^>\s?/)) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(["block", `<blockquote>${inlineToHTML(quoteLines.join("\n"))}</blockquote>`]);
      continue;
    }

    // Task list — handle before regular list to avoid wrapping in <li>
    if (line.match(/^\s*[-*+]\s+\[[ x]\]\s+/)) {
      const taskLines = [];
      while (i < lines.length && lines[i].match(/^\s*[-*+]\s+\[[ x]\]\s+/)) {
        const tm = lines[i].match(/^\s*[-*+]\s+\[( |x)\]\s+(.*)/);
        if (tm) {
          const emoji = tm[1] === "x" ? "&#x2705;" : "&#x1F532;";
          taskLines.push(`${emoji} ${inlineToHTML(tm[2])}`);
        }
        i++;
      }
      blocks.push(["tasks", taskLines.join("<br>\n")]);
      if (i < lines.length && !lines[i].trim()) i++;
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*+]\s+/)) {
      blocks.push(["list", parseHTMLList(lines, i, false).trimEnd()]);
      while (i < lines.length && (lines[i].match(/^\s*[-*+]\s+/) || lines[i].match(/^\s+\S/))) i++;
      // Skip trailing blank
      if (i < lines.length && !lines[i].trim()) i++;
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+[.)]\s+/)) {
      blocks.push(["list", parseHTMLList(lines, i, true).trimEnd()]);
      while (i < lines.length && (lines[i].match(/^\s*\d+[.)]\s+/) || lines[i].match(/^\s+\S/))) i++;
      if (i < lines.length && !lines[i].trim()) i++;
      continue;
    }

    // HTML comment — strip
    if (line.match(/^<!--/)) {
      while (i < lines.length && !lines[i].match(/-->/)) i++;
      i++;
      continue;
    }

    // Paragraph
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].match(/^(#{1,6}\s|```|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\|.*\||\s*---|\s*\*\*\*|\s*___)/)) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(["text", inlineToHTML(paraLines.join("\n"))]);
  }

  // Join blocks: lists, task lists, and code blocks attach tightly to the
  // text that introduces them; every other block boundary gets exactly one
  // blank line. A closing block tag (</ul>, </blockquote>, …) already starts
  // a new line, so one <br> after it renders as one blank line — both in the
  // browser and in Slack's paste handler (verified). Inline-ending blocks
  // (paragraphs, headings, task lines) need <br><br> for the same gap. No
  // trailing breaks after the last block — Slack pastes them as empty lines.
  let result = "";
  for (let k = 0; k < blocks.length; k++) {
    const [type, html] = blocks[k];
    result += html;
    if (k < blocks.length - 1) {
      const next = blocks[k + 1][0];
      const attached = type === "text" && (next === "list" || next === "tasks" || next === "pre");
      if (attached) {
        result += "\n";
      } else {
        const endsBlock = /(?:<\/(?:ul|ol|pre|blockquote)>|<hr>)$/.test(html);
        result += endsBlock ? "<br>\n" : "<br><br>\n";
      }
    }
  }
  return result;
}

function parseTableRow(line) {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
}

function parseTableAlign(line) {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => {
    c = c.trim();
    if (c.startsWith(":") && c.endsWith(":")) return "center";
    if (c.endsWith(":")) return "right";
    if (c.startsWith(":")) return "left";
    return null;
  });
}

// Slack's paste handler trims the whitespace-only spans that Chromium's copy
// serializer emits around inline elements inside <li> — "with <b>bold</b> and"
// pastes as "withboldand". A &#160; survives the transform and Slack
// normalizes it back to a regular space in the composer.
function protectListItemSpaces(html) {
  return html
    .replace(/ (<(?:b|i|s|code|a)\b)/g, "&#160;$1")
    .replace(/(<\/(?:b|i|s|code|a)>) /g, "$1&#160;");
}

function parseHTMLList(lines, startIdx, ordered) {
  const marker = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
  const tag = ordered ? "ol" : "ul";
  let html = `<${tag}>\n`;
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) break;

    const m = line.match(marker);
    if (!m) {
      // Continuation or sub-item — skip for now
      i++;
      continue;
    }

    let content = line.replace(marker, "");

    // Task list item inside a regular list — emit without <li> to avoid double bullet
    const taskMatch = content.match(/^\[( |x)\]\s+(.*)/);
    if (taskMatch) {
      const emoji = taskMatch[1] === "x" ? "&#x2705;" : "&#x1F532;";
      html += `${emoji} ${inlineToHTML(taskMatch[2])}<br>\n`;
      i++;
      continue;
    }

    // Check for nested list
    i++;
    const subLines = [];
    while (i < lines.length && lines[i].match(/^\s{2,}/) && !lines[i].match(/^[^\s]/)) {
      subLines.push(lines[i]);
      i++;
    }

    if (subLines.length > 0 && subLines.some(l => l.match(/^\s+[-*+]\s+/) || l.match(/^\s+\d+[.)]\s+/))) {
      const subOrdered = subLines.some(l => l.match(/^\s+\d+[.)]\s+/));
      const dedented = subLines.map(l => l.replace(/^\s{2,4}/, ""));
      html += `<li>${protectListItemSpaces(inlineToHTML(content))}\n${parseHTMLList(dedented, 0, subOrdered)}</li>\n`;
    } else {
      // Plain continuation lines belong to this item — dropping them loses
      // content. Join with a space (Markdown soft-wrap semantics): a <br>
      // inside <li> makes Slack flatten the whole list to plain paragraphs.
      const extra = subLines.map(l => l.trim()).filter(Boolean);
      if (extra.length) content += " " + extra.join(" ");
      html += `<li>${protectListItemSpaces(inlineToHTML(content))}</li>\n`;
    }
  }

  html += `</${tag}>\n`;
  return html;
}

const EMOJI_MAP = {
  ":+1:":"👍",":thumbsup:":"👍",":thumbsdown:":"👎",":-1:":"👎",
  ":heart:":"❤️",":broken_heart:":"💔",":fire:":"🔥",":star:":"⭐",":star2:":"🌟",
  ":tada:":"🎉",":party_popper:":"🎉",":rocket:":"🚀",":eyes:":"👀",
  ":wave:":"👋",":raised_hands:":"🙌",":clap:":"👏",":muscle:":"💪",
  ":pray:":"🙏",":handshake:":"🤝",":ok_hand:":"👌",":point_right:":"👉",
  ":point_left:":"👈",":point_up:":"☝️",":point_down:":"👇",
  ":smile:":"😄",":grinning:":"😀",":laughing:":"😆",":sweat_smile:":"😅",
  ":joy:":"😂",":wink:":"😉",":blush:":"😊",":thinking_face:":"🤔",":thinking:":"🤔",
  ":grimacing:":"😬",":sob:":"😭",":cry:":"😢",":angry:":"😠",":rage:":"🤬",
  ":skull:":"💀",":ghost:":"👻",":robot_face:":"🤖",":alien:":"👽",
  ":100:":"💯",":boom:":"💥",":sparkles:":"✨",":zap:":"⚡",":rainbow:":"🌈",
  ":sunny:":"☀️",":cloud:":"☁️",":umbrella:":"☂️",":snowflake:":"❄️",
  ":trophy:":"🏆",":medal:":"🏅",":crown:":"👑",":gem:":"💎",":moneybag:":"💰",
  ":gift:":"🎁",":balloon:":"🎈",":confetti_ball:":"🎊",
  ":check:":"✅",":white_check_mark:":"✅",":heavy_check_mark:":"✔️",
  ":x:":"❌",":no_entry:":"⛔",":warning:":"⚠️",":exclamation:":"❗",":question:":"❓",
  ":black_square_button:":"⬜",":white_square_button:":"⬜",
  ":red_circle:":"🔴",":green_circle:":"🟢",":blue_circle:":"🔵",":yellow_circle:":"🟡",
  ":arrow_right:":"➡️",":arrow_left:":"⬅️",":arrow_up:":"⬆️",":arrow_down:":"⬇️",
  ":link:":"🔗",":lock:":"🔒",":unlock:":"🔓",":key:":"🔑",
  ":bulb:":"💡",":gear:":"⚙️",":wrench:":"🔧",":hammer:":"🔨",":shield:":"🛡️",
  ":bug:":"🐛",":art:":"🎨",":memo:":"📝",":clipboard:":"📋",":calendar:":"📅",
  ":chart_with_upwards_trend:":"📈",":chart_with_downwards_trend:":"📉",
  ":bell:":"🔔",":no_bell:":"🔕",":loudspeaker:":"📢",":mega:":"📣",
  ":email:":"📧",":envelope:":"✉️",":package:":"📦",":truck:":"🚚",
  ":hourglass:":"⏳",":stopwatch:":"⏱️",":clock:":"🕐",":alarm_clock:":"⏰",
  ":coffee:":"☕",":pizza:":"🍕",":beer:":"🍺",":wine_glass:":"🍷",":champagne:":"🍾",
  ":dog:":"🐕",":cat:":"🐈",":penguin:":"🐧",":snake:":"🐍",":turtle:":"🐢",
  ":whale:":"🐋",":octopus:":"🐙",":butterfly:":"🦋",":unicorn:":"🦄",
  ":earth_americas:":"🌎",":earth_africa:":"🌍",":earth_asia:":"🌏",
  ":us:":"🇺🇸",":jp:":"🇯🇵",":gb:":"🇬🇧",":de:":"🇩🇪",":fr:":"🇫🇷",":in:":"🇮🇳",
  ":construction:":"🚧",":rotating_light:":"🚨",":no_entry_sign:":"🚫",
  ":heavy_plus_sign:":"➕",":heavy_minus_sign:":"➖",":heavy_division_sign:":"➗",
  ":infinity:":"♾️",":recycle:":"♻️",":white_flag:":"🏳️",":checkered_flag:":"🏁",
  ":dart:":"🎯",":video_game:":"🎮",":headphones:":"🎧",":microphone:":"🎤",
  ":camera:":"📷",":computer:":"💻",":iphone:":"📱",":desktop_computer:":"🖥️",
  ":keyboard:":"⌨️",":printer:":"🖨️",":floppy_disk:":"💾",":cd:":"💿",
  ":satellite:":"📡",":tv:":"📺",":radio:":"📻",":battery:":"🔋",":electric_plug:":"🔌",
  ":mag:":"🔍",":mag_right:":"🔎",":microscope:":"🔬",":telescope:":"🔭",
  ":book:":"📖",":books:":"📚",":bookmark:":"🔖",":label:":"🏷️",
  ":paperclip:":"📎",":pushpin:":"📌",":pen:":"🖊️",":pencil2:":"✏️",
  ":scissors:":"✂️",":wastebasket:":"🗑️",":file_folder:":"📁",":open_file_folder:":"📂",
};

function inlineToHTML(text) {
  // Strip HTML comments before escaping
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Escape HTML
  text = text.replace(/&(?!amp;|lt;|gt;|quot;|apos;|nbsp;|#x[0-9a-f]+;|#\d+;)/gi, "&amp;");
  text = text.replace(/</g, "&lt;");
  text = text.replace(/>/g, "&gt;");

  // Inline code — extract first so emoji/formatting don't touch code content.
  // Content is already HTML-escaped above; escaping again would render
  // `<div>` as the literal text "&lt;div&gt;" in Slack.
  text = text.replace(/``([^`]+)``/g, (_, c) => `<code>${c.trim()}</code>`);
  text = text.replace(/`([^`\n]+?)`/g, (_, c) => `<code>${c}</code>`);

  // Convert emoji shortcodes to Unicode BEFORE italic processing
  // (shortcodes like :white_check_mark: have underscores that would trigger italic)
  // Only convert outside of <code> tags
  text = text.replace(/((?:<code>[\s\S]*?<\/code>)|:[\w+-]+:)/g, (match) => {
    if (match.startsWith("<code>")) return match; // don't touch code content
    return EMOJI_MAP[match] || match.replace(/_/g, "\x02"); // protect underscores in unknown emoji
  });

  // Images
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>');

  // Bold + Italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/gs, "<b><i>$1</i></b>");

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>");
  text = text.replace(/__(.+?)__/gs, "<b>$1</b>");

  // Strikethrough
  text = text.replace(/~~(.+?)~~/gs, "<s>$1</s>");

  // Italic (*text*)
  text = text.replace(/(?<!\*)\*([^\s*](?:.*?[^\s*])?)\*(?!\*)/gs, "<i>$1</i>");
  // Italic (_text_) — require word boundary so snake_case_names aren't mangled
  text = text.replace(/(?<![a-zA-Z0-9])_([^\s_](?:.*?[^\s_])?)_(?![a-zA-Z0-9])/gs, "<i>$1</i>");

  // Slack tokens (<@U...>, <#C...>, <!here>) only resolve via the API path —
  // pasted HTML never becomes a real mention. Render them as visible @/# text
  // so the paste doesn't contain raw <@U...> noise; the user still has to
  // re-type the mention in Slack for it to notify anyone. Tokens inside
  // inline code are left as-is.
  text = text.replace(/(<code>[\s\S]*?<\/code>)|&lt;([@#!][^&\s]+)&gt;/g, (m, code, token) => {
    if (code) return code;
    const [id, label] = token.slice(1).split("|");
    if (token.startsWith("@")) return `@${label || id}`;
    if (token.startsWith("#")) return `#${label || id}`;
    if (["here", "channel", "everyone"].includes(id)) return `@${id}`;
    return m; // unknown <!...> token — leave escaped
  });

  // Restore protected underscores in unknown emoji shortcodes
  text = text.replace(/\x02/g, "_");

  // Newlines within paragraphs
  text = text.replace(/\n/g, "<br>\n");

  return text;
}

// =============================================================
// Inline mrkdwn converter
// =============================================================

function convertToMrkdwn(md) {
  let result = md.trim();

  // Extract and preserve code blocks
  const codeBlocks = [];
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push("```\n" + code + "```");
    return `\x00CB${idx}\x00`;
  });

  // Extract inline code
  const inlineCodes = [];
  result = result.replace(/`([^`\n]+?)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push("`" + code + "`");
    return `\x00IC${idx}\x00`;
  });

  // Tables → code blocks (keep separator for visual structure)
  result = result.replace(
    /(\|.+\|\s*\n)(\|[\s:|-]+\|\s*\n)((?:\|.+\|\s*\n?)*)/g,
    (_, header, sep, body) => {
      const idx = codeBlocks.length;
      codeBlocks.push("```\n" + (header + sep + body).trim() + "\n```\n");
      return `\x00CB${idx}\x00\n`;
    }
  );

  // HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  // Slack's API parses <...> as control sequences (mentions, links, dates),
  // so literal < and > in text must be escaped — but intentional Slack tokens
  // (<@U...>, <#C...>, <!here>, <!subteam^...>) and raw <url> autolinks must
  // pass through untouched. Protect tokens, escape the rest, then restore.
  const slackTokens = [];
  result = result.replace(
    /<(?:[@#][A-Z0-9]+(?:\|[^>\n]+)?|!(?:here|channel|everyone)|!(?:subteam\^|date\^)[^>\n]+|(?:https?|mailto):[^>\s]+(?:\|[^>\n]+)?)>/g,
    (m) => {
      const idx = slackTokens.length;
      slackTokens.push(m);
      return `\x00ST${idx}\x00`;
    }
  );
  result = result.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Un-escape blockquote markers at line start — that > is mrkdwn syntax
  result = result.replace(/^(\s*)&gt;(\s?)/gm, "$1>$2");

  // Headings → bold (use placeholder to avoid italic regex matching)
  result = result.replace(/^#{1,6}\s+(.+?)(?:\s+#+)?$/gm, "\x01$1\x01");

  // HR
  result = result.replace(/^(?:---+|\*\*\*+|___+)\s*$/gm, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Order matters here. We use placeholders to avoid conflicts.
  // 1. Bold+italic (***) first
  // 2. Bold (**) — use placeholder \x01 for the single * that Slack uses
  // 3. Italic (*) — convert to _
  // 4. Then replace placeholders

  // Bold + Italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/gs, "_\x01$1\x01_");

  // Bold — use placeholder \x01 instead of * to avoid italic regex matching it
  result = result.replace(/\*\*(.+?)\*\*/gs, "\x01$1\x01");
  result = result.replace(/__(.+?)__/gs, "\x01$1\x01");

  // Strikethrough
  result = result.replace(/~~(.+?)~~/gs, "~$1~");

  // Italic (*text* → _text_)
  result = result.replace(/(?<!\x01)\*([^\s*](?:.*?[^\s*])?)\*(?!\x01)/gs, "_$1_");

  // Now replace bold placeholders with actual *
  result = result.replace(/\x01/g, "*");

  // Images → links
  result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, "<$2|$1>");

  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, "<$2|$1>");

  // Task lists
  result = result.replace(/^(\s*)[-*+]\s+\[x\]\s+/gm, "$1:white_check_mark: ");
  result = result.replace(/^(\s*)[-*+]\s+\[ \]\s+/gm, "$1:black_square_button: ");

  // Unordered list bullets
  result = result.replace(/^(\s*)[-*+]\s+/gm, "$1• ");

  // A list attaches tightly to the text line that introduces it — drop the
  // blank line between an intro line and its first bullet/task. Blank lines
  // between two list groups, or after quotes/code blocks, stay.
  {
    const ls = result.split("\n");
    const isList = (l) => /^\s*(?:•|\d+[.)]\s|:white_check_mark:|:black_square_button:)/.test(l);
    for (let k = ls.length - 1; k >= 2; k--) {
      if (isList(ls[k]) && !ls[k - 1].trim() && ls[k - 2].trim() &&
          !isList(ls[k - 2]) && !ls[k - 2].startsWith(">") && !ls[k - 2].includes("\x00")) {
        ls.splice(k - 1, 1);
      }
    }
    result = ls.join("\n");
  }

  // Escape &
  result = result.replace(/&(?!amp;|lt;|gt;)/g, "&amp;");

  // Restore Slack tokens
  slackTokens.forEach((token, idx) => {
    result = result.replace(`\x00ST${idx}\x00`, token);
  });

  // Restore inline codes
  inlineCodes.forEach((code, idx) => {
    result = result.replace(`\x00IC${idx}\x00`, code);
  });

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    result = result.replace(`\x00CB${idx}\x00`, block);
  });

  return result.trim();
}

// =============================================================
// Jira key auto-linking (issue #10)
// =============================================================

// Common acronyms that match the Jira key pattern but are never tickets.
const JIRA_KEY_DENYLIST = new Set([
  "UTF", "SHA", "MD", "ISO", "RFC", "CVE", "AES", "RSA",
  "TLS", "SSL", "HTTP", "HTTPS", "COVID", "IEEE", "ECMA",
]);

/**
 * Turn bare Jira keys (DEVOPS-14389, ENG-129313) into Markdown links to
 * `<baseUrl>/browse/<KEY>`. Runs on the raw Markdown before conversion, so
 * both the HTML and mrkdwn paths get clickable links. Keys inside code
 * spans/blocks, existing links, or URLs are left untouched.
 */
function autoLinkJiraKeys(md, baseUrl) {
  const base = baseUrl.replace(/\/+$/, "");
  const saved = [];
  const save = (m) => {
    saved.push(m);
    return `\x00J${saved.length - 1}\x00`;
  };

  let result = md
    // Code blocks and inline code
    .replace(/```[\s\S]*?(?:```|$)|``[^`]+``|`[^`\n]+`/g, save)
    // Existing Markdown links/images — don't double-link keys in text or URL
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, save)
    // Bare URLs
    .replace(/https?:\/\/[^\s<>)]+/g, save);

  result = result.replace(/(?<![\w/-])([A-Z][A-Z0-9_]+-\d+)(?![\w-])/g, (m, key) => {
    if (JIRA_KEY_DENYLIST.has(key.split("-")[0])) return m;
    return `[${key}](${base}/browse/${key})`;
  });

  return result.replace(/\x00J(\d+)\x00/g, (_, i) => saved[+i]);
}

// =============================================================
// Preview page generator
// =============================================================

function generateCopyPage(markdown) {
  const html = convertToHTML(markdown);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Copy for Slack</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1d1c1d;padding:20px;max-width:700px;margin:0 auto}
table{border-collapse:collapse;border:1px solid #ccc;margin:8px 0}
th,td{border:1px solid #ccc;padding:6px 12px}
th{font-weight:700;background:#f8f9fa}
pre{background:#f4f4f4;padding:10px;border-radius:4px;font-family:'SF Mono',Monaco,Menlo,monospace;font-size:13px;overflow-x:auto}
code{background:#f0f0f0;padding:2px 5px;border-radius:3px;font-family:'SF Mono',Monaco,Menlo,monospace;font-size:13px;color:#c7254e}
pre code{background:none;padding:0;color:inherit}
blockquote{border-left:4px solid #ddd;padding:4px 12px;margin:8px 0;color:#555}
a{color:#1264a3;text-decoration:none}
ul,ol{padding-left:24px;margin:4px 0}li{margin:2px 0}
hr{border:none;border-top:1px solid #ddd;margin:12px 0}
</style></head>
<body>
<div id="content">${html}</div>
</body></html>`;
}

function generatePreviewPage(markdown, copyPagePath) {
  const html = convertToHTML(markdown);
  const mrkdwn = convertToMrkdwn(markdown);
  const escapedMrkdwn = mrkdwn.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Slack Message Preview</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1d21;color:#d1d2d3;min-height:100vh}
.container{max-width:800px;margin:0 auto;padding:20px}
.top-bar{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #2c2d30;margin-bottom:20px}
.top-bar h1{font-size:16px;font-weight:700;color:#e8e8e8}
.btn-group{display:flex;gap:8px}
.btn{padding:8px 16px;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.btn-primary{background:#007a5a;color:#fff}.btn-primary:hover{background:#148567}.btn-primary.copied{background:#2eb67d}
.btn-secondary{background:#2c2d30;color:#d1d2d3;border:1px solid #3c3d40}.btn-secondary:hover{background:#3c3d40}
.message-wrapper{background:#222529;border-radius:8px;border:1px solid #2c2d30;overflow:hidden}
.channel-bar{padding:10px 16px;border-bottom:1px solid #2c2d30;font-size:13px;color:#9a9b9e}.channel-bar span{color:#e8e8e8;font-weight:700}
.message{display:flex;padding:16px;gap:12px}
.avatar{width:36px;height:36px;border-radius:4px;background:#4a154b;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.message-body{flex:1;min-width:0}
.message-header{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
.username{font-weight:700;font-size:15px;color:#e8e8e8}
.app-badge{background:#3c3d40;color:#9a9b9e;font-size:10px;padding:1px 4px;border-radius:3px;font-weight:600}
.timestamp{font-size:12px;color:#616061}
.mc{font-size:15px;line-height:1.46668;color:#d1d2d3;word-wrap:break-word}
.mc b{color:#e8e8e8}.mc i{font-style:italic}.mc s{text-decoration:line-through;color:#9a9b9e}
.mc a{color:#1d9bd1;text-decoration:none}.mc a:hover{text-decoration:underline}
.mc code{background:#1a1d21;border:1px solid #2c2d30;border-radius:3px;padding:1px 4px;font-family:'SF Mono',Monaco,Menlo,monospace;font-size:12px;color:#e06c75}
.mc pre{background:#1a1d21;border:1px solid #2c2d30;border-radius:4px;padding:12px;margin:8px 0;overflow-x:auto}
.mc pre code{background:none;border:none;padding:0;font-size:13px;color:#d1d2d3}
.mc blockquote{border-left:4px solid #4a154b;padding:4px 12px;margin:4px 0;color:#9a9b9e}
.mc ul,.mc ol{padding-left:24px;margin:4px 0}.mc li{margin:2px 0}
.mc .mc table{border-collapse:collapse;margin:8px 0;font-size:14px}
.mc th,.mc td{border:1px solid #3c3d40;padding:6px 12px}
.mc th{background:#2c2d30;font-weight:700;color:#e8e8e8}
.mc hr{border:none;border-top:1px solid #3c3d40;margin:12px 0}
.mrkdwn-section{margin-top:20px;background:#222529;border-radius:8px;border:1px solid #2c2d30;overflow:hidden}
.mrkdwn-header{padding:10px 16px;border-bottom:1px solid #2c2d30;font-size:13px;color:#9a9b9e;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none}
.mrkdwn-header:hover{background:#2c2d30}
.mrkdwn-body{display:none;padding:16px}.mrkdwn-body.open{display:block}
.mrkdwn-body pre{background:#1a1d21;border:1px solid #2c2d30;border-radius:4px;padding:12px;font-family:'SF Mono',Monaco,Menlo,monospace;font-size:13px;color:#d1d2d3;white-space:pre-wrap;word-wrap:break-word}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(100px);background:#007a5a;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;transition:transform .3s ease;z-index:1000}
.toast.show{transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>
<div class="container">
<div class="top-bar"><h1>Slack Message Preview</h1>
<div class="btn-group"><button class="btn btn-primary" id="copy-btn" data-copy-page="${copyPagePath}" onclick="copyForSlack()">Copy for Slack</button>
<button class="btn btn-secondary" onclick="copyMrkdwn()">Copy mrkdwn</button></div></div>
<div class="message-wrapper">
<div class="channel-bar"># <span>general</span></div>
<div class="message"><div class="avatar">🤖</div>
<div class="message-body"><div class="message-header">
<span class="username">Message Preview</span>
<span class="timestamp">${timeStr}</span></div>
<div class="mc" id="mc">${html}</div></div></div></div>
<div class="mrkdwn-section">
<div class="mrkdwn-header" onclick="toggleMrkdwn()"><span>mrkdwn (for API / webhook)</span><span id="mt">▸</span></div>
<div class="mrkdwn-body" id="mb"><pre id="mrkdwn-text">${escapedMrkdwn}</pre>
<button class="btn btn-secondary" onclick="copyMrkdwn()" style="margin-top:8px">Copy mrkdwn</button></div></div></div>
<div class="toast" id="toast"></div>
<script>
function copyForSlack(){
// Open the clean copy page (white background, same as test-paste.html)
// The copy page path is stored as a data attribute on the button
const copyPage=document.getElementById('copy-btn').dataset.copyPage;
window.open(copyPage,'_blank');
}
function copyMrkdwn(){navigator.clipboard.writeText(document.getElementById('mrkdwn-text').innerText).then(()=>showToast('mrkdwn copied!'))}
function toggleMrkdwn(){const b=document.getElementById('mb');const t=document.getElementById('mt');b.classList.toggle('open');t.textContent=b.classList.contains('open')?'▾':'▸'}
function showToast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)}
</script>
</body></html>`;
}

// =============================================================
// Send via webhook
// =============================================================

// Uses fetch instead of shelling out to curl: curl without --fail exits 0 on
// HTTP 4xx/5xx, so failures used to be reported as success — and interpolating
// the payload into a shell string was an injection hazard.
async function sendWebhook(mrkdwn, webhookUrl) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: mrkdwn }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      return { ok: false, error: `HTTP ${res.status}${body ? `: ${body}` : ""}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.cause?.message || e.message };
  }
}

// =============================================================
// Main
// =============================================================

const command = process.argv[2] || "preview";
let markdown = readStdin().trim();

// Opt-in Jira auto-linking: set JIRA_BASE_URL (e.g. https://yoursite.atlassian.net)
// to turn bare ticket keys into clickable links on every output path.
if (markdown && process.env.JIRA_BASE_URL) {
  markdown = autoLinkJiraKeys(markdown, process.env.JIRA_BASE_URL);
}

if (!markdown) {
  console.error("Error: No input. Pipe Markdown via stdin.");
  console.error("Usage: echo '**bold**' | node run.mjs preview");
  process.exit(1);
}

const PREVIEW_DIR = process.env.SLACK_FORMATTER_PREVIEW_DIR || "/tmp/slack-formatter";

switch (command) {
  case "preview": {
    if (!existsSync(PREVIEW_DIR)) mkdirSync(PREVIEW_DIR, { recursive: true });

    // Prune previews older than 7 days — nothing ever cleaned this dir up
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    for (const f of readdirSync(PREVIEW_DIR)) {
      if (!/^(copy|preview)-.*\.html$/.test(f)) continue;
      const p = join(PREVIEW_DIR, f);
      try {
        if (Date.now() - statSync(p).mtimeMs > MAX_AGE_MS) unlinkSync(p);
      } catch {}
    }

    // Second+millisecond resolution — minute-only timestamps made runs in the
    // same minute silently overwrite each other's preview files
    const ts = new Date().toISOString().replace(/T/, "-").replace(/[:.]/g, "").slice(0, 21);
    const copyPath = join(PREVIEW_DIR, `copy-${ts}.html`);
    const previewPath = join(PREVIEW_DIR, `preview-${ts}.html`);

    // Generate clean copy page (white bg, same as test-paste.html)
    writeFileSync(copyPath, generateCopyPage(markdown), "utf-8");

    // Generate dark preview page (links to copy page)
    writeFileSync(previewPath, generatePreviewPage(markdown, copyPath), "utf-8");

    // Open the COPY page directly — user selects content, Cmd+C, paste in Slack.
    // Windows `start` treats the first quoted arg as a window title, hence "".
    const openCmd = platform() === "darwin" ? "open" : platform() === "linux" ? "xdg-open" : 'start ""';
    exec(`${openCmd} "${copyPath}"`);

    console.log(`✅ Copy page opened in browser.`);
    console.log(`   Select the content, Cmd+C, then Cmd+V in Slack.`);
    console.log(`   Copy page: ${copyPath}`);
    console.log(`   Preview:   ${previewPath}`);
    break;
  }

  case "send": {
    // SLACK_WEBHOOK_URL is the documented name; CCH_SLA_WEBHOOK kept for back-compat
    const webhook = process.env.SLACK_WEBHOOK_URL || process.env.CCH_SLA_WEBHOOK;
    if (!webhook) {
      console.error("Error: SLACK_WEBHOOK_URL environment variable not set.");
      process.exit(1);
    }
    const mrkdwn = convertToMrkdwn(markdown);
    const result = await sendWebhook(mrkdwn, webhook);
    if (result.ok) {
      console.log("✅ Message sent to Slack.");
    } else {
      console.error(`❌ Failed to send message: ${result.error}`);
      process.exit(1);
    }
    break;
  }

  case "html": {
    console.log(convertToHTML(markdown));
    break;
  }

  case "mrkdwn": {
    console.log(convertToMrkdwn(markdown));
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    console.error("Usage: echo 'markdown' | node run.mjs [preview|send|html|mrkdwn]");
    process.exit(1);
}
