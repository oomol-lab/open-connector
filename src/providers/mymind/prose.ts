import {
  optionalInteger,
  optionalObjectArray,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";

/**
 * A single node of a mymind prose document.
 *
 * mymind stores note bodies, article extracts, and card annotations as a
 * rich-text document tree rather than as markdown, so the provider translates
 * between that tree and the markdown agents read and write.
 */
export interface MyMindProseNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: MyMindProseNode[];
}

/** Markdown wrappers for the inline marks mymind applies to prose text. */
const inlineMarkWrappers: Record<string, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  code: "`",
  highlight: "==",
};

const maxHeadingLevel = 6;

/**
 * Render a mymind prose document as markdown.
 *
 * Blocks mymind may add later are skipped rather than rendered as noise, so an
 * unfamiliar document still yields readable markdown for its known blocks.
 */
export function proseToMarkdown(prose: unknown): string {
  const content = optionalRecord(prose)?.content;
  if (!Array.isArray(content)) {
    return "";
  }

  const blocks: string[] = [];
  for (const node of optionalObjectArray(content, "prose block")) {
    // Empty blocks and blocks mymind may add later render as nothing, and a
    // blank entry between two rendered blocks would read as a gap in the output.
    const block = blockToMarkdown(node);
    if (block) {
      blocks.push(block);
    }
  }
  return blocks.join("\n\n");
}

/**
 * Parse markdown into the prose document body mymind expects when creating a note.
 *
 * Headings, fenced code blocks, horizontal rules, bullet lists, ordered lists,
 * and task lists become their prose equivalents. Inline emphasis is kept as
 * literal text, because mymind's own editor is the source of truth for how a
 * saved document is marked up.
 */
export function markdownToProse(markdown: string): MyMindProseNode[] {
  const blocks: MyMindProseNode[] = [];
  let list: PendingList | undefined;
  let code: PendingCode | undefined;

  const flushList = (): void => {
    if (!list) {
      return;
    }
    blocks.push(
      list.type === "orderedList"
        ? { type: "orderedList", attrs: { start: list.start }, content: list.items }
        : { type: list.type, content: list.items },
    );
    list = undefined;
  };
  const appendItem = (type: string, item: MyMindProseNode, start = 1): void => {
    if (list && list.type !== type) {
      flushList();
    }
    list ??= { type, items: [], start };
    list.items.push(item);
  };

  for (const line of markdown.split("\n")) {
    if (code) {
      if (line.startsWith("```")) {
        blocks.push(codeBlock(code));
        code = undefined;
      } else {
        code.lines.push(line);
      }
      continue;
    }
    if (line.startsWith("```")) {
      flushList();
      code = { language: line.slice(3).trim(), lines: [] };
      continue;
    }
    // A blank line separates markdown blocks; mymind gets the block structure
    // itself, so carrying the separator through as an empty paragraph would only
    // add a visible gap to the saved note.
    if (!line.trim()) {
      continue;
    }

    const task = /^[-*] \[([ xX])\]\s*(.*)$/u.exec(line);
    if (task) {
      appendItem("taskList", {
        type: "taskItem",
        attrs: { checked: task[1] !== " " },
        content: [paragraph(task[2]!)],
      });
      continue;
    }

    if (/^-{3,}$/u.test(line)) {
      flushList();
      blocks.push({ type: "horizontalRule" });
      continue;
    }

    const ordered = /^(\d+)\.\s+(.*)$/u.exec(line);
    if (ordered) {
      appendItem("orderedList", listItem(ordered[2]!), Number(ordered[1]));
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/u.exec(line);
    if (bullet) {
      appendItem("bulletList", listItem(bullet[1]!));
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      flushList();
      blocks.push({
        type: "heading",
        attrs: { level: heading[1]!.length },
        content: [{ type: "text", text: heading[2]! }],
      });
      continue;
    }

    flushList();
    blocks.push(paragraph(line));
  }

  if (code) {
    blocks.push(codeBlock(code));
  }
  flushList();
  return blocks;
}

interface PendingList {
  type: string;
  items: MyMindProseNode[];
  start: number;
}

interface PendingCode {
  language: string;
  lines: string[];
}

function blockToMarkdown(block: Record<string, unknown>): string | undefined {
  const attrs = optionalRecord(block.attrs);
  switch (optionalString(block.type)) {
    case "heading": {
      const level = Math.min(optionalInteger(attrs?.level) ?? 1, maxHeadingLevel);
      return `${"#".repeat(Math.max(level, 1))} ${inlineToMarkdown(block.content)}`;
    }
    case "paragraph":
      return inlineToMarkdown(block.content);
    case "codeBlock":
      return `\`\`\`${optionalString(attrs?.language) ?? ""}\n${plainText(block.content)}\n\`\`\``;
    case "horizontalRule":
      return "---";
    case "bulletList":
      return listToMarkdown(block.content, () => "- ");
    case "orderedList": {
      const start = optionalInteger(attrs?.start) ?? 1;
      return listToMarkdown(block.content, (index) => `${start + index}. `);
    }
    case "taskList":
      return listToMarkdown(
        block.content,
        (_index, item) => `- [${optionalRecord(item.attrs)?.checked === true ? "x" : " "}] `,
      );
    default:
      return undefined;
  }
}

function listToMarkdown(items: unknown, prefix: (index: number, item: Record<string, unknown>) => string): string {
  return optionalObjectArray(items, "prose list item")
    .map((item, index) => `${prefix(index, item)}${listItemText(item)}`)
    .join("\n");
}

function listItemText(item: Record<string, unknown>): string {
  return optionalObjectArray(item.content, "prose list item block")
    .filter((child) => optionalString(child.type) === "paragraph")
    .map((child) => inlineToMarkdown(child.content))
    .join(" ");
}

function inlineToMarkdown(content: unknown): string {
  return optionalObjectArray(content, "prose inline node")
    .map((node) => {
      let text = optionalRawString(node.text) ?? "";
      for (const mark of optionalObjectArray(node.marks, "prose inline mark")) {
        const wrapper = inlineMarkWrappers[optionalString(mark.type) ?? ""];
        if (wrapper) {
          text = `${wrapper}${text}${wrapper}`;
        }
      }
      return text;
    })
    .join("");
}

function plainText(content: unknown): string {
  return optionalObjectArray(content, "prose text node")
    .map((node) => optionalRawString(node.text) ?? "")
    .join("");
}

function paragraph(text: string): MyMindProseNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function listItem(text: string): MyMindProseNode {
  return { type: "listItem", content: [paragraph(text)] };
}

function codeBlock(code: PendingCode): MyMindProseNode {
  return {
    type: "codeBlock",
    attrs: { language: code.language },
    content: [{ type: "text", text: code.lines.join("\n") }],
  };
}
