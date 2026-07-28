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

// Monospace display width — table padding must count terminal columns, not
// UTF-16 code units, or emoji/CJK cells shift the pipes. Graphemes (ZWJ
// sequences, VS16, combining marks) count once; wide if emoji-presentation
// or in an East Asian Wide/Fullwidth range. Slack's font gives emoji a
// non-integer advance, so emoji alignment stays approximate — width 2 is
// strictly closer than .length and exact for CJK in true monospace.
const GRAPHEME_SEGMENTER = new Intl.Segmenter();

function isWideCodePoint(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||   // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0xa4cf) ||   // CJK radicals … Yi
    (cp >= 0xac00 && cp <= 0xd7a3) ||   // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) ||   // CJK compatibility ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) ||   // CJK compatibility forms
    (cp >= 0xff00 && cp <= 0xff60) ||   // Fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||   // Fullwidth signs
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji blocks
    (cp >= 0x20000 && cp <= 0x3fffd)    // CJK extensions B+
  );
}

function displayWidth(s) {
  let w = 0;
  for (const { segment: g } of GRAPHEME_SEGMENTER.segment(s)) {
    const wide =
      /\p{Emoji_Presentation}/u.test(g) || // ✅ ❌ 🚀 — emoji by default
      g.includes("\uFE0F") ||         // ⚠️ — VS16 forces emoji look
      isWideCodePoint(g.codePointAt(0));
    w += wide ? 2 : 1;
  }
  return w;
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
      // survive Slack's paste handler (it turns into stray empty lines).
      // Own type: a divider is a separator, not intro text, so a following
      // list/tasks/pre must not attach tightly to it.
      blocks.push(["hr", "━".repeat(30)]);
      i++;
      continue;
    }

    // Table — the separator must be a full-line GFM delimiter row (every cell
    // only `:?-+:?`), otherwise a data row starting with a dash-only or empty
    // cell would be consumed as the separator and silently dropped.
    if (line.match(/^\|/) && i + 1 < lines.length && lines[i + 1].match(/^\|(?:\s*:?-+:?\s*\|)+\s*$/)) {
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
        return Math.max(3, ...allCells.map(displayWidth));
      });
      const pad = (s, w) => s + " ".repeat(Math.max(0, w - displayWidth(s)));
      let tableText = headerCells.map((h, j) => pad(h, colWidths[j])).join(" | ") + "\n";
      tableText += colWidths.map(w => "-".repeat(w)).join("-|-") + "\n";
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
    if (line.match(/^\s*[-*+]\s+\[[ xX]\]\s+/)) {
      const taskLines = [];
      while (i < lines.length && lines[i].match(/^\s*[-*+]\s+\[[ xX]\]\s+/)) {
        const tm = lines[i].match(/^\s*[-*+]\s+\[( |[xX])\]\s+(.*)/);
        if (tm) {
          const emoji = tm[1].toLowerCase() === "x" ? "&#x2705;" : "&#x1F532;";
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

    // HTML comment — strip through the close marker, keeping any trailing text
    if (line.match(/^<!--/)) {
      while (i < lines.length && !lines[i].match(/-->/)) i++;
      if (i < lines.length) {
        const rest = lines[i].replace(/^[\s\S]*?-->\s*/, "");
        if (rest.trim()) { lines[i] = rest; continue; }
      }
      i++;
      continue;
    }

    // Paragraph
    const paraLines = [line];
    i++;
    // Only "1."/"1)" may interrupt a paragraph (CommonMark) — protects
    // wrapped prose like "founded in\n2024. It was..." from becoming a list.
    while (i < lines.length && lines[i].trim() && !lines[i].match(/^(#{1,6}\s|```|>\s?|\s*[-*+]\s|\s*1[.)]\s|\|.*\||(?:---+|\*\*\*+|___+)\s*$)/)) {
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
  // GFM: \| is the only way to put a literal pipe in a cell. Mask escaped
  // pipes before splitting (a trailing \| must not be eaten as the row-closing
  // delimiter), then restore them as literal pipes per cell. \x00 is safe as
  // a sentinel — control bytes are stripped from input at entry.
  const masked = line.replace(/\\\|/g, "\x00");
  return masked.replace(/^\|/, "").replace(/\|$/, "")
    .split("|")
    .map(c => c.trim().replace(/\x00/g, "|"));
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

function parseHTMLList(lines, startIdx, ordered, nested = false) {
  const marker = ordered ? /^\s*(\d+)[.)]\s+/ : /^\s*[-*+]\s+/;
  // Opposite-type marker at this level (indent 0 in the dedented recursion
  // frame) — deeper ones are consumed into subLines before the loop sees them.
  const sibling = ordered ? /^[-*+]\s+/ : /^\d+[.)]\s+/;
  const tag = ordered ? "ol" : "ul";
  // CommonMark: the first item's number sets the list start. Sibling flips
  // (line below) recurse with startIdx on their own first marker, so each
  // <ol> gets its own start.
  const first = ordered ? lines[startIdx].match(marker) : null;
  const startNum = first ? parseInt(first[1], 10) : 1;
  let html = startNum !== 1 ? `<${tag} start="${startNum}">\n` : `<${tag}>\n`;
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) break;

    const m = line.match(marker);
    if (!m) {
      // In a recursion, an opposite-type item at this level starts a sibling
      // list — close this tag and parse the rest as the other type. Top-level
      // calls must leave it alone: the outer block parser stops its advance
      // there and would emit the sibling list a second time.
      if (nested && line.match(sibling)) {
        return html + `</${tag}>\n` + parseHTMLList(lines, i, !ordered, true);
      }
      // Indented continuation/sub-item — skip; anything else ends the list
      // here, exactly where the outer advance loop stops, so the interrupting
      // line and the items after it are parsed once by the outer parser.
      if (line.match(/^\s+\S/)) {
        i++;
        continue;
      }
      break;
    }

    let content = line.replace(marker, "");

    // Task list item inside a regular list — emit without <li> to avoid double bullet
    const taskMatch = content.match(/^\[( |[xX])\]\s+(.*)/);
    if (taskMatch) {
      const emoji = taskMatch[1].toLowerCase() === "x" ? "&#x2705;" : "&#x1F532;";
      html += `${emoji} ${inlineToHTML(taskMatch[2])}<br>\n`;
      i++;
      continue;
    }

    // Check for nested list. Also collect one-space-indented lines unless
    // they are sibling markers — the outer advance loop consumes any
    // /^\s+\S/ line, so a continuation not captured here is dropped.
    i++;
    const subLines = [];
    while (i < lines.length &&
           (lines[i].match(/^\s{2,}/) ||
            (lines[i].match(/^\s\S/) && !lines[i].match(marker)))) {
      subLines.push(lines[i]);
      i++;
    }

    if (subLines.length > 0 && subLines.some(l => l.match(/^\s+[-*+]\s+/) || l.match(/^\s+\d+[.)]\s+/))) {
      // Strip only the block's common indent so relative indentation survives:
      // a greedy per-line strip flattens third levels and orphans sub-item
      // continuation lines in the recursive parse.
      const indent = Math.min(...subLines.map(l => l.match(/^\s*/)[0].length));
      const dedented = subLines.map(l => l.slice(indent));
      // The sublist's type comes from its first marker line — an ordered
      // grandchild must not flip an unordered level to <ol> (its items would
      // then never match the marker and the recursion would drop them).
      const firstMarker = dedented.find(l => l.match(/^\s*[-*+]\s+/) || l.match(/^\s*\d+[.)]\s+/));
      const subOrdered = /^\s*\d+[.)]\s+/.test(firstMarker);
      html += `<li>${protectListItemSpaces(inlineToHTML(content))}\n${parseHTMLList(dedented, 0, subOrdered, true)}</li>\n`;
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

  // Inline code — extract to opaque placeholders first (same scheme as the
  // mrkdwn path) so none of the emoji/link/bold/italic/token regexes below can
  // touch code content. Replacing in place isn't enough: the italic regexes
  // don't skip <code> tags, so a span like ` * ` would pair its asterisk with
  // a later *italic* delimiter in the paragraph. Extraction runs on the RAW
  // text, before the entity-passthrough escape below: per CommonMark, entity
  // references aren't recognized in code spans, so `&amp;` must stay the
  // literal five characters (escapeHtml escapes every & unconditionally,
  // matching the fenced-block path). Both syntaxes trim inner padding — stray
  // spaces inside the pill leak into the pasted Slack code span — but a
  // whitespace-only span keeps its content instead of collapsing to an empty pill.
  const codeSpans = [];
  // ?? m: defensive — sentinel bytes are stripped from input in main, but an
  // unmatched index must never coerce "undefined" into the page.
  const expandCodeSpans = (t) => t.replace(/\x00IC(\d+)\x00/g, (m, i) => codeSpans[+i] ?? m);
  const saveCodeSpan = (c) => {
    // A single-backtick pair can capture an already-extracted ``span`` (e.g.
    // `a ``b`` c`). Escape first (escapeHtml never touches \x00 placeholder
    // bytes), then expand — expanding before escaping would double-escape the
    // inner span's <code> tags. Expansion must happen now: the one-pass
    // restore below never rescans replacement text, so a nested placeholder
    // would leak raw \x00 bytes into the page.
    c = expandCodeSpans(escapeHtml(c));
    codeSpans.push(`<code>${c.trim() || c}</code>`);
    return `\x00IC${codeSpans.length - 1}\x00`;
  };
  text = text.replace(/``([^`]+)``/g, (_, c) => saveCodeSpan(c));
  text = text.replace(/`([^`\n]+?)`/g, (_, c) => saveCodeSpan(c));

  // Escape HTML — the ampersand lookahead passes pre-escaped entities in
  // prose through unchanged (no double-escape). Code spans are already in
  // placeholders, so the passthrough can't leak entity decoding into pills.
  text = text.replace(/&(?!amp;|lt;|gt;|quot;|apos;|nbsp;|#x[0-9a-f]+;|#\d+;)/gi, "&amp;");
  text = text.replace(/</g, "&lt;");
  text = text.replace(/>/g, "&gt;");

  // Angle-bracket autolinks <https://…>/<mailto:…> and the Slack-labeled form
  // <url|label> — same token set the mrkdwn path protects — become real
  // anchors; pasted <a href> links land in Slack as links, unlike mention
  // tokens below. Extract to placeholders (after code spans, so `<url>` in
  // code stays literal) and restore after the emphasis passes so a URL with
  // `__`/`_segment_` can't be mangled or pair delimiters across the line.
  // Matches the escaped form: the < > became &lt;/&gt; above.
  const autolinks = [];
  text = text.replace(/&lt;((?:https?|mailto):[^\s]+?)(?:\|([^\n]+?))?&gt;/g, (_, url, label) => {
    autolinks.push(`<a href="${url}">${label || url}</a>`);
    return `\x00AL${autolinks.length - 1}\x00`;
  });

  // Backslash escapes (CommonMark): \* \_ \~ \` \\ suppress formatting and
  // render the bare character. Extract to placeholders so the emphasis
  // passes below can't pair an escaped delimiter (the \_ lookbehind treats a
  // backslash as a word boundary); restored as bare literals near the end.
  // Runs after code-span extraction so backslashes inside `code` stay verbatim.
  const escapes = [];
  text = text.replace(/\\([\\*_~`])/g, (_, ch) => {
    escapes.push(ch);
    return `\x00BS${escapes.length - 1}\x00`;
  });

  // Convert emoji shortcodes to Unicode BEFORE italic processing
  // (shortcodes like :white_check_mark: have underscores that would trigger italic)
  text = text.replace(/:[\w+-]+:/g, (match) =>
    EMOJI_MAP[match] || match.replace(/_/g, "\x02")); // protect underscores in unknown emoji

  // Images / links (URL allows one level of balanced parens, e.g. Wikipedia
  // URLs). Emit the destination as an opaque placeholder — same scheme as code
  // spans — so the bold/italic passes below can't rewrite `__init__.py` or
  // `/_draft_/` inside the quoted href (or pair `__` across two hrefs). Link
  // *text* stays in place so [**bold**](url) still gets emphasis.
  const hrefs = [];
  const saveHref = (u) => {
    hrefs.push(u);
    return `\x00LH${hrefs.length - 1}\x00`;
  };
  // Linked image [![alt](img)](target) — the badge pattern — first, in one
  // pass: the image pass alone would emit an <a> the link pass then re-wraps
  // (nested <a> is invalid; browsers split it and drop the outer target).
  // The outer target is the link the user intended; the image URL is dropped,
  // consistent with the image-as-link convention below.
  // Empty alt (![](url)) would make an invisible <a></a> that copies as
  // nothing — fall back to the URL as the visible text. The href placeholder
  // doubles as the text so the emphasis passes can't rewrite it either.
  text = text.replace(/\[!\[([^\]]*)\]\((?:[^()\s]|\([^()\s]*\))+(?:\s+"[^"]*")?\)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g,
    (_, t, u) => { const p = saveHref(u); return `<a href="${p}">${t.trim() ? t : p}</a>`; });
  text = text.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g,
    (_, t, u) => { const p = saveHref(u); return `<a href="${p}">${t.trim() ? t : p}</a>`; });
  text = text.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g,
    (_, t, u) => `<a href="${saveHref(u)}">${t}</a>`);

  // Bold + Italic — non-space content edges so space-flanked delimiters
  // (e.g. the exponent operator in "2 ** 8") stay literal, per CommonMark
  text = text.replace(/\*\*\*([^\s*](?:.*?[^\s*])?)\*\*\*/gs, "<b><i>$1</i></b>");

  // Bold
  text = text.replace(/\*\*([^\s*](?:.*?[^\s*])?)\*\*/gs, "<b>$1</b>");
  text = text.replace(/__([^\s_](?:.*?[^\s_])?)__/gs, "<b>$1</b>");

  // Strikethrough
  text = text.replace(/~~([^\s~](?:.*?[^\s~])?)~~/gs, "<s>$1</s>");

  // Italic (*text*)
  text = text.replace(/(?<!\*)\*([^\s*](?:.*?[^\s*])?)\*(?!\*)/gs, "<i>$1</i>");
  // Italic (_text_) — require word boundary so snake_case_names aren't mangled
  text = text.replace(/(?<![a-zA-Z0-9])_([^\s_](?:.*?[^\s_])?)_(?![a-zA-Z0-9])/gs, "<i>$1</i>");

  // Restore hrefs now that the emphasis passes are done — before the \x02
  // restore so protected underscores from unknown shortcodes in a URL still
  // get unwound. ?? m: defensive, same as expandCodeSpans.
  text = text.replace(/\x00LH(\d+)\x00/g, (m, i) => hrefs[+i] ?? m);

  // Restore autolinks as ready-made anchors. ?? m: defensive, same as
  // expandCodeSpans.
  text = text.replace(/\x00AL(\d+)\x00/g, (m, i) => autolinks[+i] ?? m);

  // Slack tokens (<@U...>, <#C...>, <!here>) only resolve via the API path —
  // pasted HTML never becomes a real mention. Render them as visible @/# text
  // so the paste doesn't contain raw <@U...> noise; the user still has to
  // re-type the mention in Slack for it to notify anyone. Tokens inside
  // inline code are left as-is (code content sits in placeholders here).
  text = text.replace(/&lt;([@#!][^&\s]+)&gt;/g, (m, token) => {
    const [id, label] = token.slice(1).split("|");
    if (token.startsWith("@")) return `@${label || id}`;
    if (token.startsWith("#")) return `#${label || id}`;
    if (["here", "channel", "everyone"].includes(id)) return `@${id}`;
    return m; // unknown <!...> token — leave escaped
  });

  // Restore protected underscores in unknown emoji shortcodes
  text = text.replace(/\x02/g, "_");

  // Restore escaped characters as bare literals — after every formatting
  // pass, so a once-escaped delimiter can never pair. ?? m: defensive,
  // same as expandCodeSpans.
  text = text.replace(/\x00BS(\d+)\x00/g, (m, i) => escapes[+i] ?? m);

  // Newlines within paragraphs
  text = text.replace(/\n/g, "<br>\n");

  // Restore inline code spans last — after the newline pass, so a rare
  // multi-line ``span`` keeps its raw newline instead of gaining a <br>
  // (a <br> inside <li> makes Slack flatten the whole list on paste).
  text = expandCodeSpans(text);

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

  // Extract inline code — trim inner padding to match the HTML path (stray
  // spaces render inside Slack's code span); a whitespace-only span keeps its
  // content so it doesn't collapse to a literal ``.
  const inlineCodes = [];
  result = result.replace(/`([^`\n]+?)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push("`" + (code.trim() || code) + "`");
    return `\x00IC${idx}\x00`;
  });

  // Tables → code blocks (keep separator for visual structure). The trailing
  // \n* swallows authored blank lines after the table — the stored block plus
  // the placeholder's \n already supply exactly one blank line before what
  // follows, so an unswallowed blank would double the gap.
  result = result.replace(
    /(\|.+\|[^\S\n]*\n)(\|(?:[^\S\n]*:?-+:?[^\S\n]*\|)+[^\S\n]*\n)((?:\|.+\|[^\S\n]*\n?)*)\n*/g,
    (_, header, sep, body) => {
      const idx = codeBlocks.length;
      codeBlocks.push("```\n" + (header + sep + body).trim() + "\n```\n");
      return `\x00CB${idx}\x00\n`;
    }
  );

  // HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  // Backslash escapes (CommonMark): \* \_ \~ \` \\ suppress formatting and
  // render the bare character — mirrors the HTML path. Runs after code and
  // table extraction so backslashes inside code stay verbatim; restored as
  // bare literals just before the placeholder-splice loop.
  const escapes = [];
  result = result.replace(/\\([\\*_~`])/g, (_, ch) => {
    escapes.push(ch);
    return `\x00BS${escapes.length - 1}\x00`;
  });

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

  // HR — [^\S\n] (not \s) so the match can't swallow the newline and the
  // blank line after the divider
  result = result.replace(/^(?:---+|\*\*\*+|___+)[^\S\n]*$/gm, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Emphasis runs before link conversion on this path, so shield `](url)`
  // destinations first — otherwise `__init__.py` in a URL becomes `*init*.py`
  // (or two URLs with `__` pair across links). Only the URL is replaced; the
  // `](`/`)` frame and any title stay so the link regexes below still match.
  const linkUrls = [];
  result = result.replace(
    /(\]\()((?:[^()\s]|\([^()\s]*\))+)((?:\s+"[^"]*")?\))/g,
    (_, pre, url, post) => {
      const idx = linkUrls.length;
      linkUrls.push(url);
      return `${pre}\x00LU${idx}\x00${post}`;
    }
  );

  // Order matters here. We use placeholders to avoid conflicts.
  // 1. Bold+italic (***) first
  // 2. Bold (**) — use placeholder \x01 for the single * that Slack uses
  // 3. Italic (*) — convert to _
  // 4. Then replace placeholders

  // Bold + Italic — non-space content edges so space-flanked delimiters
  // (e.g. the exponent operator in "2 ** 8") stay literal, per CommonMark
  result = result.replace(/\*\*\*([^\s*](?:.*?[^\s*])?)\*\*\*/gs, "_\x01$1\x01_");

  // Bold — use placeholder \x01 instead of * to avoid italic regex matching it
  result = result.replace(/\*\*([^\s*](?:.*?[^\s*])?)\*\*/gs, "\x01$1\x01");
  result = result.replace(/__([^\s_](?:.*?[^\s_])?)__/gs, "\x01$1\x01");

  // Strikethrough
  result = result.replace(/~~([^\s~](?:.*?[^\s~])?)~~/gs, "~$1~");

  // Italic (*text* → _text_)
  result = result.replace(/(?<!\x01)\*([^\s*](?:.*?[^\s*])?)\*(?!\x01)/gs, "_$1_");

  // Now replace bold placeholders with actual *
  result = result.replace(/\x01/g, "*");

  // Linked image [![alt](img)](target) — the badge pattern — first, in one
  // pass: otherwise the link pass re-wraps the image's <img|alt> in a second,
  // invalid nested <...|...>. Keep the outer (user-intended) target; the
  // image URL is dropped, consistent with the image-as-link pass below.
  // Empty alt (![](url)) would emit <url|> — an empty label Slack renders as
  // nothing — so fall back to the bare <url> autolink form.
  result = result.replace(/\[!\[([^\]]*)\]\((?:[^()\s]|\([^()\s]*\))+(?:\s+"[^"]*")?\)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g,
    (_, t, u) => t.trim() ? `<${u}|${t}>` : `<${u}>`);

  // Images → links (URL allows one level of balanced parens, e.g. Wikipedia URLs)
  result = result.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g,
    (_, t, u) => t.trim() ? `<${u}|${t}>` : `<${u}>`);

  // Links (URL allows one level of balanced parens, e.g. Wikipedia URLs)
  result = result.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g, "<$2|$1>");

  // Restore URLs here (not in the final placeholder loop) so a stray
  // `](url)` with no link text, and the `&`-escape / list passes below, see
  // the same in-place URL text they always did. Function callback so `$`
  // sequences in a URL aren't treated as replacement patterns.
  result = result.replace(/\x00LU(\d+)\x00/g, (m, i) => linkUrls[+i] ?? m);

  // Task lists
  result = result.replace(/^(\s*)[-*+]\s+\[[xX]\]\s+/gm, "$1:white_check_mark: ");
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
          !isList(ls[k - 2]) && !ls[k - 2].startsWith(">") && !ls[k - 2].includes("\x00") &&
          !/^━+$/.test(ls[k - 2])) {
        ls.splice(k - 1, 1);
      }
    }
    result = ls.join("\n");
  }

  // Escape &
  result = result.replace(/&(?!amp;|lt;|gt;)/g, "&amp;");

  // Restore escaped characters as bare literals — after every formatting
  // pass, so a once-escaped delimiter can never pair. Slack mrkdwn has no
  // escape syntax of its own, so the bare character is the closest fidelity.
  // ?? m: defensive, same as the other placeholder restores.
  result = result.replace(/\x00BS(\d+)\x00/g, (m, i) => escapes[+i] ?? m);

  // Saved entries nest in both directions — a table's code block embeds the
  // inline-code placeholders of its cells, and an inline span can capture a
  // fence's placeholder once the multi-line fence collapses to one line — so
  // no single-pass order works. Restore in passes until no placeholder
  // remains; each pass splices one nesting level in. The pass cap only guards
  // against crafted NUL-byte lookalikes in the input cycling forever (real
  // nesting is at most a few levels). Always replace via a function callback:
  // bare string replacement would interpret $&, $', $1… inside restored code
  // content as replacement patterns and corrupt it.
  const PLACEHOLDER = /\x00(?:ST|CB|IC)\d+\x00/;
  for (let passes = 0; passes < 8 && PLACEHOLDER.test(result); passes++) {
    slackTokens.forEach((token, idx) => {
      result = result.replace(`\x00ST${idx}\x00`, () => token);
    });
    codeBlocks.forEach((block, idx) => {
      result = result.replace(`\x00CB${idx}\x00`, () => block);
    });
    inlineCodes.forEach((code, idx) => {
      result = result.replace(`\x00IC${idx}\x00`, () => code);
    });
  }

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
code{background:#f0f0f0;padding:2px 5px;margin:0 2px;border-radius:3px;font-family:'SF Mono',Monaco,Menlo,monospace;font-size:13px;color:#c7254e}
pre code{background:none;padding:0;margin:0;color:inherit}
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
.mc code{background:#1a1d21;border:1px solid #2c2d30;border-radius:3px;padding:1px 4px;margin:0 2px;font-family:'SF Mono',Monaco,Menlo,monospace;font-size:12px;color:#e06c75}
.mc pre{background:#1a1d21;border:1px solid #2c2d30;border-radius:4px;padding:12px;margin:8px 0;overflow-x:auto}
.mc pre code{background:none;border:none;padding:0;margin:0;font-size:13px;color:#d1d2d3}
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

// \x00-\x02 are internal placeholder sentinels (code spans, Slack tokens,
// bold, underscore protection) — strip them from input so crafted control
// bytes can't spoof a placeholder and duplicate or corrupt restored content.
// They're invalid in Markdown text anyway.
markdown = markdown.replace(/[\x00-\x02]/g, "");

// Normalize CRLF/CR to LF once at input — every downstream regex assumes \n
// line endings (`.` and non-`m` `$` don't match past \r), so a stray \r
// silently breaks heading detection and table cell splitting on the HTML path.
markdown = markdown.replace(/\r\n?/g, "\n");

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
    // SLACK_FORMATTER_NO_OPEN suppresses the browser (tests/CI generate pages headlessly).
    if (process.env.SLACK_FORMATTER_NO_OPEN) {
      console.log(`✅ Copy page generated (browser open suppressed).`);
    } else {
      const openCmd = platform() === "darwin" ? "open" : platform() === "linux" ? "xdg-open" : 'start ""';
      exec(`${openCmd} "${copyPath}"`);
      console.log(`✅ Copy page opened in browser.`);
    }
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
