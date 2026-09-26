import { describe, expect, it } from "vitest";
import {
  decodeNotionToolText,
  parseNotionComments,
  parseNotionPage,
  parseNotionSearch,
  parseNotionSelf,
  parseNotionToolAccess,
} from "./mcp-response.ts";

describe("Notion MCP response readers", () => {
  it("decodes JSON text blocks and keeps prose as text", () => {
    expect(decodeNotionToolText(' {"results":[]} ')).toEqual({ results: [] });
    expect(decodeNotionToolText("[1]")).toEqual([1]);
    expect(decodeNotionToolText("{not json")).toBe("{not json");
    expect(decodeNotionToolText("Here is the page")).toBe("Here is the page");
  });

  it("reads the connected user from the recorded notion-get-users shape", () => {
    const value = { results: [{ type: "person", id: "u-1", name: "Ada", email: "ada@example.com" }], has_more: false };
    expect(parseNotionSelf(value)).toEqual({ type: "person", id: "u-1", name: "Ada", email: "ada@example.com" });
    expect(parseNotionSelf({ results: [{ type: "bot" }, { id: "u-2" }] })).toEqual({ id: "u-2" });
    expect(parseNotionSelf({ results: [] })).toBeUndefined();
    expect(parseNotionSelf("no users")).toBeUndefined();
  });

  it("reads search results with absent fields absent and notices as text", () => {
    const value = {
      results: [
        {
          id: "p-1",
          title: "Roadmap",
          url: "https://www.notion.so/p-1",
          type: "page",
          timestamp: "2026-09-25T10:00:00.000Z",
          path: "Wiki / Roadmap",
        },
        { id: "p-2", properties: { title: { title: [{ plain_text: "Rich " }, { plain_text: "title" }] } } },
        { id: "p-3", last_edited_time: "2026-09-24T00:00:00.000Z" },
        "not a record",
      ],
      notices: ["filters.edited_by_user_ids requires a Business plan", { parameter: "filters.created_date_range" }, 7],
    };
    expect(parseNotionSearch(value)).toEqual({
      results: [
        {
          id: "p-1",
          title: "Roadmap",
          url: "https://www.notion.so/p-1",
          type: "page",
          timestamp: "2026-09-25T10:00:00.000Z",
          path: "Wiki / Roadmap",
        },
        { id: "p-2", title: "Rich title" },
        { id: "p-3", timestamp: "2026-09-24T00:00:00.000Z" },
      ],
      notices: ["filters.edited_by_user_ids requires a Business plan", "filters.created_date_range"],
    });
    expect(parseNotionSearch({ pages: [{ id: "p-4" }], notices: "one sentence" })).toEqual({
      results: [{ id: "p-4" }],
      notices: ["one sentence"],
    });
    expect(parseNotionSearch("no results")).toEqual({ results: [], notices: [] });
  });

  it("reads the page envelope from the text form, unescaping entities and keeping the truncated mark", () => {
    const text = [
      "Here is the result of the fetch:",
      '<page url="https://www.notion.so/p-1" title="Roadmap &amp; plan"><properties>Status: Draft</properties>',
      '<content truncated="true"># Roadmap\n\nQ4 &amp; beyond &lt;soon&gt; &#39;quoted&#x27;</content></page>',
    ].join("\n");
    expect(parseNotionPage(text)).toEqual({
      title: "Roadmap & plan",
      url: "https://www.notion.so/p-1",
      properties: "Status: Draft",
      content: "# Roadmap\n\nQ4 & beyond <soon> 'quoted'",
      truncated: true,
    });
  });

  it("reads the page envelope from the object form and prefers the object's own fields", () => {
    expect(
      parseNotionPage({
        title: "Roadmap",
        url: "https://www.notion.so/p-1",
        page_last_edited_at: "2026-09-25T10:00:00.000Z",
        truncated: false,
        text: '<page url="https://ignored.example" truncated="true"><content>Body</content></page>',
      }),
    ).toEqual({
      title: "Roadmap",
      url: "https://www.notion.so/p-1",
      page_last_edited_at: "2026-09-25T10:00:00.000Z",
      content: "Body",
      truncated: true,
    });
  });

  it("takes an unclosed content block to the end and a bare answer whole", () => {
    expect(parseNotionPage("<page><content>Cut off mid")).toEqual({ content: "Cut off mid", truncated: false });
    expect(parseNotionPage("Just markdown")).toEqual({ content: "Just markdown", truncated: false });
    expect(parseNotionPage({ metadata: {} })).toEqual({ truncated: false });
    expect(parseNotionPage(42)).toEqual({ truncated: false });
  });

  it("flattens structured discussions and reads the XML twin", () => {
    expect(
      parseNotionComments({
        discussions: [
          {
            id: "d-1",
            comments: [
              {
                id: "c-1",
                plain_text: "Looks good",
                created_time: "2026-09-25T11:00:00.000Z",
                created_by: { id: "u-1", name: "Ada" },
              },
              { id: "c-2", text: "Agreed", author_id: "u-2", author: "Bob" },
              { discussion_id: "d-9", body: "" },
            ],
          },
        ],
        comments: [{ id: "c-0", plain_text: "Flat" }],
      }),
    ).toEqual([
      { id: "c-0", plain_text: "Flat" },
      {
        id: "c-1",
        discussion_id: "d-1",
        plain_text: "Looks good",
        created_time: "2026-09-25T11:00:00.000Z",
        created_by: { id: "u-1", name: "Ada" },
      },
      { id: "c-2", discussion_id: "d-1", plain_text: "Agreed", created_by: { id: "u-2", name: "Bob" } },
    ]);
    const xml =
      '<discussion id="d-2"><comment id="c-3" author="Ada" author_id="u-1" created_time="2026-09-24T09:00:00.000Z">Please <b>review</b> &amp; sign</comment></discussion>' +
      '<comment id="c-4" discussion_id="d-3">Outside</comment>';
    const expected = [
      {
        id: "c-3",
        discussion_id: "d-2",
        plain_text: "Please review & sign",
        created_time: "2026-09-24T09:00:00.000Z",
        created_by: { id: "u-1", name: "Ada" },
      },
      { id: "c-4", discussion_id: "d-3", plain_text: "Outside" },
    ];
    expect(parseNotionComments(xml)).toEqual(expected);
    expect(parseNotionComments({ text: xml })).toEqual(expected);
    expect(parseNotionComments({ discussions: [] })).toEqual([]);
    expect(parseNotionComments(null)).toEqual([]);
  });

  it("reads the recorded tool-access report in its list and keyed shapes", () => {
    const recorded = {
      current_tool_access: [
        { tool: "notion-search", status: "restricted", restricted_parameters: ["filters.edited_by_user_ids"] },
        { tool: "notion-fetch", status: "full", restricted_parameters: [] },
        { status: "nameless" },
      ],
    };
    expect(parseNotionToolAccess(recorded)).toEqual([
      { tool: "notion-search", status: "restricted", restricted_parameters: ["filters.edited_by_user_ids"] },
      { tool: "notion-fetch", status: "full", restricted_parameters: [] },
    ]);
    expect(
      parseNotionToolAccess({
        "notion-search": { restricted_parameters: [{ name: "filters.edited_by_user_ids" }, 3] },
        other: "text",
      }),
    ).toEqual([{ tool: "notion-search", restricted_parameters: ["filters.edited_by_user_ids"] }]);
    expect(parseNotionToolAccess("nothing")).toEqual([]);
  });
});
