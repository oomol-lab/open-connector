import { describe, expect, it } from "vitest";
import { parseGranolaMeetings } from "./mcp-response.ts";

const occurredAt = "2026-11-18T18:37:16+00:00";
const markdown = "    indented code\n\nKeep **Markdown** & code `a < b`.";

function meetings(fields: string): string {
  return `<meetings_data count="1"><meeting id="m1" title="Standup" ${fields}</meeting></meetings_data>`;
}

describe("Granola MCP meeting responses", () => {
  it("uses the current occurrence timestamp and preserves Markdown", () => {
    expect(
      parseGranolaMeetings(
        meetings(
          `meeting_at="${occurredAt}" created_at="2026-11-17T12:00:00Z" updated_at="2026-11-19T10:00:00Z"><known_participants>Alice, Bob</known_participants><summary><![CDATA[${markdown}]]></summary>`,
        ),
      ),
    ).toEqual([{ id: "m1", title: "Standup", date: occurredAt, attendees: "Alice, Bob", summary: markdown }]);
  });

  it("prefers meeting_at over the legacy date and leaves an absent summary undefined", () => {
    expect(parseGranolaMeetings(meetings(`meeting_at="${occurredAt}" date="Nov 18">`))).toEqual([
      { id: "m1", title: "Standup", date: occurredAt, attendees: "", summary: undefined },
    ]);
  });

  it.each([
    '<summary status="empty">No summary. This note is empty: it has no notes and no AI summary has been generated for it.</summary>',
    '<summary status="empty" />',
    "<summary />",
  ])("normalizes explicitly empty summaries without importing notices (%#)", (summary) => {
    expect(parseGranolaMeetings(meetings(`date="Nov 18, 2026 6:37 PM GMT">${summary}`))).toEqual([
      { id: "m1", title: "Standup", date: "Nov 18, 2026 6:37 PM GMT", attendees: "", summary: "" },
    ]);
  });

  it.each([
    'created_at="2026-11-17T12:00:00Z" updated_at="2026-11-19T10:00:00Z">',
    `meeting_at="${occurredAt}"><summary status="not_included">Access denied</summary>`,
    `meeting_at="${occurredAt}"><summary><error>Unavailable</error></summary>`,
  ])("rejects missing occurrence timestamps and inaccessible or malformed summaries (%#)", (fields) => {
    expect(() => parseGranolaMeetings(meetings(fields))).toThrow();
  });

  it.each([
    '<meetings_data count="2"><meeting id="m1" title="Standup" date="Nov 18" /></meetings_data>',
    '<meetings_data has_more="true" />',
    '<meetings_data next_cursor="next" />',
    '<meetings_data count="2"><meeting id="m1" title="Standup" date="Nov 18" /><meeting id="m1" title="Duplicate" date="Nov 18" /></meetings_data>',
  ])("rejects incomplete listings and duplicate identities (%#)", (text) => {
    expect(() => parseGranolaMeetings(text)).toThrow();
  });
});
