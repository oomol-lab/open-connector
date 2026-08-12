import { describe, expect, it } from "vitest";
import { markdownToProse, proseToMarkdown } from "./prose.ts";

const doc = (content: unknown[]): unknown => ({ type: "doc", content });

describe("markdownToProse", () => {
  it("groups consecutive list lines into one list block", () => {
    expect(markdownToProse("- one\n- two\n\n1. first\n2. second")).toEqual([
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "second" }] }] },
        ],
      },
    ]);
  });

  it("keeps markdown syntax inside a fenced code block as literal text", () => {
    expect(markdownToProse("```ts\n# not a heading\n- not a list\n```")).toEqual([
      {
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [{ type: "text", text: "# not a heading\n- not a list" }],
      },
    ]);
  });

  it("closes an unterminated code fence at the end of the content", () => {
    expect(markdownToProse("```\nstill code")).toEqual([
      { type: "codeBlock", attrs: { language: "" }, content: [{ type: "text", text: "still code" }] },
    ]);
  });

  it("reads a task list checkbox as its checked state", () => {
    expect(markdownToProse("- [x] done\n- [ ] pending")).toEqual([
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }],
          },
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [{ type: "paragraph", content: [{ type: "text", text: "pending" }] }],
          },
        ],
      },
    ]);
  });

  it("treats a rule as a rule rather than a bullet", () => {
    expect(markdownToProse("---")).toEqual([{ type: "horizontalRule" }]);
  });
});

describe("proseToMarkdown", () => {
  it("wraps text in the markdown for each mymind inline mark", () => {
    expect(
      proseToMarkdown(
        doc([
          {
            type: "paragraph",
            content: [
              { type: "text", text: "bold", marks: [{ type: "bold" }] },
              { type: "text", text: " plain " },
              { type: "text", text: "marked", marks: [{ type: "highlight" }, { type: "italic" }] },
            ],
          },
        ]),
      ),
    ).toBe("**bold** plain *==marked==*");
  });

  it("numbers an ordered list from the start mymind recorded", () => {
    expect(
      proseToMarkdown(
        doc([
          {
            type: "orderedList",
            attrs: { start: 3 },
            content: [
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "third" }] }] },
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "fourth" }] }] },
            ],
          },
        ]),
      ),
    ).toBe("3. third\n4. fourth");
  });

  it("skips empty and unrecognised blocks instead of leaving gaps", () => {
    expect(
      proseToMarkdown(
        doc([
          { type: "paragraph", content: [{ type: "text", text: "before" }] },
          { type: "paragraph" },
          { type: "someFutureBlock", content: [{ type: "text", text: "ignored" }] },
          { type: "paragraph", content: [{ type: "text", text: "after" }] },
        ]),
      ),
    ).toBe("before\n\nafter");
  });

  it("returns nothing for a card that has no prose", () => {
    expect(proseToMarkdown(undefined)).toBe("");
    expect(proseToMarkdown({ type: "doc" })).toBe("");
  });

  it("round-trips the block types mymind notes are written in", () => {
    const markdown = [
      "# Title",
      "",
      "A plain paragraph.",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "- [x] done",
      "- [ ] pending",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "---",
    ].join("\n");

    expect(proseToMarkdown(doc(markdownToProse(markdown)))).toBe(markdown);
  });
});
