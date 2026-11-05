import type { Definition, PhrasingContent, RootContent } from "mdast";

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

interface NoteInline {
  type: "text" | "link";
  text?: string;
  styles?: Record<string, boolean>;
  href?: string;
  content?: NoteInline[];
}
interface NoteBlock {
  id: string;
  type: string;
  props?: Record<string, string | number | boolean>;
  content?:
    | NoteInline[]
    | {
        type: "tableContent";
        headerRows: number;
        rows: { cells: { type: "tableCell"; props: Record<string, string>; content: NoteInline[] }[] }[];
      };
  children: NoteBlock[];
}
interface MarkdownConversion {
  content: { type: "blocknote"; blocks: NoteBlock[] };
  warnings: string[];
}

// Pure conversion without URL fetching; stable block IDs make save retries deterministic.
export function markdownToBlockNote(markdown: string): MarkdownConversion {
  if (markdown.length > 200_000 || markdown.includes("\0"))
    throw new Error("Markdown must be at most 200000 characters and contain no NUL characters");
  const root = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const definitions = new Map<string, Definition>();
  const stack: { node: RootContent | typeof root; depth: number }[] = [{ node: root, depth: 0 }];
  let nodeCount = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++nodeCount > 10_000 || depth > 24) throw new Error("Markdown is too complex or deeply nested");
    if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node);
    if ("children" in node)
      for (const child of [...node.children].reverse()) stack.push({ node: child, depth: depth + 1 });
  }
  const warnings = new Set<string>();
  let serial = 0;
  const block = (
    type: string,
    content?: NoteBlock["content"],
    props?: NoteBlock["props"],
    children: NoteBlock[] = [],
  ): NoteBlock => ({ id: `md-${++serial}`, type, content, props, children });
  const source = (node: RootContent) =>
    markdown.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);
  const text = (value: string, styles: Record<string, boolean> = {}): NoteInline => ({
    type: "text",
    text: value,
    styles,
  });
  function safeURL(value: string, image = false): boolean {
    try {
      const url = new URL(value);
      return (
        ((url.protocol === "https:" || url.protocol === "http:") && !!url.hostname && !url.username && !url.password) ||
        (!image && url.protocol === "mailto:")
      );
    } catch {
      return false;
    }
  }
  function inline(nodes: PhrasingContent[], styles: Record<string, boolean> = {}, insideLink = false): NoteInline[] {
    return nodes.flatMap((node): NoteInline[] => {
      switch (node.type) {
        case "text":
          return [text(node.value, styles)];
        case "break":
          return [text("\n", styles)];
        case "inlineCode":
          return [text(node.value, { ...styles, code: true })];
        case "strong":
          return inline(node.children, { ...styles, bold: true }, insideLink);
        case "emphasis":
          return inline(node.children, { ...styles, italic: true }, insideLink);
        case "delete":
          return inline(node.children, { ...styles, strike: true }, insideLink);
        case "link":
        case "linkReference": {
          const url = node.type === "link" ? node.url : definitions.get(node.identifier)?.url;
          if (!url || !safeURL(url) || insideLink) {
            warnings.add("unsupported_link_preserved_as_text");
            return [text(source(node), styles)];
          }
          return [{ type: "link", href: url, content: inline(node.children, styles, true) }];
        }
        case "image":
        case "imageReference": {
          const url = node.type === "image" ? node.url : definitions.get(node.identifier)?.url;
          if (url && safeURL(url, true) && !insideLink) {
            warnings.add("inline_image_converted_to_link");
            return [{ type: "link", href: url, content: [text(node.alt || url, styles)] }];
          }
          warnings.add("unsupported_image_preserved_as_text");
          return [text(source(node), styles)];
        }
        case "html":
          warnings.add("html_preserved_as_text");
          return [text(node.value, styles)];
        default:
          warnings.add("unsupported_syntax_preserved_as_text");
          return [text(source(node), styles)];
      }
    });
  }
  function blocks(nodes: RootContent[]): NoteBlock[] {
    return nodes.flatMap((node): NoteBlock[] => {
      switch (node.type) {
        case "definition":
          return [];
        case "paragraph": {
          const image = node.children.length === 1 ? node.children[0] : undefined;
          if (image?.type === "image" || image?.type === "imageReference") {
            const definition = image.type === "imageReference" ? definitions.get(image.identifier) : image;
            if (definition && safeURL(definition.url, true)) {
              if (
                new TextEncoder().encode(definition.url).byteLength > 10000 ||
                new TextEncoder().encode(image.alt ?? "").byteLength > 10000 ||
                new TextEncoder().encode(definition.title ?? "").byteLength > 10000
              )
                throw new Error("Markdown image properties are too long");
              return [
                block("image", undefined, {
                  url: definition.url,
                  name: image.alt ?? "",
                  caption: definition.title ?? image.alt ?? "",
                }),
              ];
            }
          }
          return [block("paragraph", inline(node.children))];
        }
        case "heading":
          return [block("heading", inline(node.children), { level: node.depth })];
        case "thematicBreak":
          return [block("divider")];
        case "code": {
          const language = node.lang ?? "text";
          if (new TextEncoder().encode(language).byteLength > 100) throw new Error("Code language is too long");
          if (node.meta) warnings.add("code_fence_metadata_omitted");
          return [block("codeBlock", [text(node.value)], { language })];
        }
        case "html":
          warnings.add("html_preserved_as_text");
          return [block("paragraph", [text(node.value)])];
        case "blockquote": {
          const children = blocks(node.children);
          const first = children[0]?.type === "paragraph" ? children.shift() : undefined;
          return [block("quote", first?.content ?? [], undefined, children)];
        }
        case "list": {
          const start = node.start ?? 1;
          if (node.ordered && (start < -1000000 || start + node.children.length > 1000000))
            throw new Error("Ordered list numbering is out of range");
          return node.children.map((item, index) => {
            const children = blocks(item.children);
            const first = children[0]?.type === "paragraph" ? children.shift() : undefined;
            const type =
              item.checked !== null && item.checked !== undefined
                ? "checkListItem"
                : node.ordered
                  ? "numberedListItem"
                  : "bulletListItem";
            const props: NoteBlock["props"] =
              type === "checkListItem"
                ? { checked: item.checked! }
                : node.ordered
                  ? { start: start + index }
                  : undefined;
            return block(type, first?.content ?? [], props, children);
          });
        }
        case "table": {
          if (node.children.length > 1000 || node.children.some((row) => row.children.length > 100))
            throw new Error("Markdown table exceeds 1000 rows or 100 columns");
          return [
            block("table", {
              type: "tableContent",
              headerRows: 1,
              rows: node.children.map((row) => ({
                cells: row.children.map((cell, index) => ({
                  type: "tableCell",
                  props: { textAlignment: node.align?.[index] ?? "left" },
                  content: inline(cell.children),
                })),
              })),
            }),
          ];
        }
        default:
          warnings.add("unsupported_syntax_preserved_as_text");
          return [block("paragraph", [text(source(node))])];
      }
    });
  }
  const result: MarkdownConversion = {
    content: { type: "blocknote", blocks: blocks(root.children) },
    warnings: [...warnings],
  };
  if (new TextEncoder().encode(JSON.stringify(result.content)).byteLength > 1_048_576)
    throw new Error("Converted BlockNote document exceeds 1 MiB");
  return result;
}
