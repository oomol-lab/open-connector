import { beforeEach, expect, it, vi } from "vitest";
import { callMcpTool, listMcpTools } from "./mcp-tools.ts";

const client = vi.hoisted(() => ({
  request: vi.fn(),
  callTool: vi.fn(),
}));

vi.mock("./mcp-client.ts", () => ({
  withMcpClient: async (_options: unknown, run: (value: typeof client) => Promise<unknown>) => run(client),
}));

beforeEach(() => {
  client.request.mockReset();
  client.callTool.mockReset();
});

it("collects paginated tools and keeps annotations only when requested", async () => {
  client.request
    .mockResolvedValueOnce({
      tools: [{ name: "first", description: "First tool", inputSchema: { type: "object" } }],
      nextCursor: "page-2",
    })
    .mockResolvedValueOnce({
      tools: [
        {
          name: "second",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
        },
      ],
    });

  await expect(
    listMcpTools({ endpoint: "https://example.com/mcp", service: "Example" }, { includeAnnotations: true }),
  ).resolves.toEqual([
    {
      name: "first",
      description: "First tool",
      annotations: undefined,
      inputSchema: { type: "object" },
    },
    {
      name: "second",
      description: undefined,
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object" },
    },
  ]);
  expect(client.request).toHaveBeenNthCalledWith(
    2,
    { method: "tools/list", params: { cursor: "page-2" } },
    expect.any(Object),
  );
});

it("rejects a repeated tools/list cursor", async () => {
  client.request
    .mockResolvedValueOnce({ tools: [], nextCursor: "same" })
    .mockResolvedValueOnce({ tools: [], nextCursor: "same" });

  await expect(listMcpTools({ endpoint: "https://example.com/mcp", service: "Example" })).rejects.toMatchObject({
    status: 502,
    message: "Example MCP tools/list returned a repeated cursor",
  });
});

it("returns structured tool content", async () => {
  client.callTool.mockResolvedValue({
    content: [{ type: "text", text: "fallback" }],
    structuredContent: { records: [1, 2] },
  });

  await expect(
    callMcpTool({
      endpoint: "https://example.com/mcp",
      service: "Example",
      toolName: "query",
      arguments: { query: "revenue" },
    }),
  ).resolves.toEqual({ records: [1, 2] });
});

it("maps MCP invalid-params tool results to invalid_input", async () => {
  client.callTool.mockResolvedValue({
    content: [{ type: "text", text: "MCP error -32602: missing query" }],
    isError: true,
  });

  await expect(
    callMcpTool({
      endpoint: "https://example.com/mcp",
      service: "Example",
      toolName: "query",
      arguments: {},
    }),
  ).rejects.toMatchObject({
    status: 400,
    code: "invalid_input",
    message: "Example MCP tool query rejected the input: MCP error -32602: missing query",
  });
});

it("returns declared output schemas only when requested", async () => {
  const tool = {
    name: "read",
    inputSchema: { type: "object" },
    outputSchema: { type: "object", properties: { value: { type: "string" } } },
  };
  client.request.mockResolvedValue({ tools: [tool] });
  const options = { endpoint: "https://example.com/mcp", service: "Example" };
  expect((await listMcpTools(options))[0]?.outputSchema).toBeUndefined();
  expect((await listMcpTools(options, { includeOutputSchema: true }))[0]?.outputSchema).toEqual(tool.outputSchema);
});
