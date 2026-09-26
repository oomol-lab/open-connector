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

  it("omits participants when Granola sends none", async () => {
    client.callTool.mockResolvedValue(meetingXml(' date="2026-09-25"><summary>Notes</summary>'));
    const result = (await granolaMcpActionHandlers.get_note({ note_id: "m1" }, context)) as { note: object };
    expect(result.note).toMatchObject({ date: "2026-09-25" });
    expect(result.note).not.toHaveProperty("participants");
  });
});
