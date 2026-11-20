import { beforeEach, describe, expect, it, vi } from "vitest";
import { granolaMcpActionHandlers } from "./runtime-mcp.ts";

const client = vi.hoisted(() => ({
  callTool: vi.fn(),
}));

vi.mock("../mcp-client.ts", () => ({
  withMcpClient: async (_options: unknown, run: (value: typeof client) => Promise<unknown>) => run(client),
}));

beforeEach(() => {
  client.callTool.mockReset();
});

function meetingXml(fields: string) {
  return {
    content: [
      {
        type: "text",
        text: `<meetings_data count="1"><meeting id="m1" title="Standup"${fields}</meeting></meetings_data>`,
      },
    ],
  };
}

const context = { accessToken: "token", fetcher: fetch };

describe("granola MCP meeting actions", () => {
  it.each([
    { name: "list_meetings", run: granolaMcpActionHandlers.list_meetings },
    { name: "get_meetings", run: granolaMcpActionHandlers.get_meetings },
  ])("accepts current timestamps and empty summaries in $name", async ({ run }) => {
    client.callTool.mockResolvedValue(
      meetingXml(
        ' meeting_at="2026-11-18T18:37:16+00:00"><summary status="empty">No summary. This note is empty.</summary>',
      ),
    );
    await expect(run({ meeting_ids: ["m1"] }, context)).resolves.toEqual({
      meetings: [{ id: "m1", title: "Standup", date: "2026-11-18T18:37:16+00:00", attendees: "", summary: "" }],
    });
  });
});

describe("granola MCP get_note", () => {
  it("keeps the meeting date and participants the record already carries", async () => {
    client.callTool.mockResolvedValue(
      meetingXml(' date="2026-09-25"><known_participants>Alice, Bob</known_participants><summary>Notes</summary>'),
    );
    await expect(granolaMcpActionHandlers.get_note({ note_id: "m1" }, context)).resolves.toEqual({
      note: {
        id: "m1",
        title: "Standup",
        summary_markdown: "Notes",
        transcript: undefined,
        date: "2026-09-25",
        participants: "Alice, Bob",
      },
    });
  });

  it("leaves participants undefined when Granola sends none", async () => {
    client.callTool.mockResolvedValue(meetingXml(' date="2026-09-25"><summary>Notes</summary>'));
    await expect(granolaMcpActionHandlers.get_note({ note_id: "m1" }, context)).resolves.toEqual({
      note: { id: "m1", title: "Standup", summary_markdown: "Notes", date: "2026-09-25" },
    });
  });
});
