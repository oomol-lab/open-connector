import { expect, it } from "vitest";
import { createMcpDiagnosticFetch, withMcpClient } from "./mcp-client.ts";
import { listMcpTools } from "./mcp-tools.ts";

it.each([401, 403])("preserves HTTP %i diagnostics through the real Streamable HTTP SDK", async (status) => {
  const body = JSON.stringify({ error: "insufficient_scope", error_description: "Missing permission" });
  await expect(
    listMcpTools({
      endpoint: "https://mcp.example/mcp",
      service: "fixture",
      protocolVersion: "modern",
      fetcher: async () => new Response(body, { status }),
    }),
  ).rejects.toMatchObject({
    status,
    code: "provider_error",
    message: `fixture MCP request failed (HTTP ${status}): ${body}`,
  });
});
it("leaves SSE responses available to EventSource", async () => {
  const response = new Response("denied", { status: 403 });
  const fetcher = createMcpDiagnosticFetch(async () => response, "sse", "fixture");
  const result = await fetcher("https://mcp.example/sse");
  expect(result).toBe(response);
  expect(await result.text()).toBe("denied");
});
it("uses the authentication challenge when the HTTP body is empty", async () => {
  await expect(
    createMcpDiagnosticFetch(
      async () => new Response("", { status: 401, headers: { "www-authenticate": "Bearer realm=fixture" } }),
      "streamable_http",
      "fixture",
    )("https://mcp.example"),
  ).rejects.toMatchObject({ message: "fixture MCP request failed (HTTP 401): Bearer realm=fixture" });
});
it("preserves custom client error mapping", async () => {
  const sentinel = new Error("custom policy");
  await expect(
    withMcpClient(
      {
        endpoint: new URL("https://mcp.example/mcp"),
        transport: "streamable_http",
        fetcher: async () => new Response("denied", { status: 403 }),
        mapError: () => sentinel,
      },
      async () => undefined,
    ),
  ).rejects.toBe(sentinel);
});

it.each(["legacy", "modern"] as const)(
  "restores the typed transport error before calling a provider mapper in %s mode",
  async (protocolVersion) => {
    let received: unknown;
    await expect(
      withMcpClient(
        {
          endpoint: new URL("https://mcp.example/mcp"),
          transport: "streamable_http",
          protocolVersion,
          fetcher: createMcpDiagnosticFetch(
            async () => new Response("upstream detail", { status: 403 }),
            "streamable_http",
            "fixture",
          ),
          mapError(error) {
            received = error;
            return error;
          },
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ status: 403, code: "provider_error" });
    expect(received).toMatchObject({ message: "fixture MCP request failed (HTTP 403): upstream detail" });
  },
);

it("keeps an SDK wrapper around an untyped fetch failure", async () => {
  const original = new Error("socket failure");
  let received: unknown;
  await expect(
    withMcpClient(
      {
        endpoint: new URL("https://mcp.example/mcp"),
        transport: "streamable_http",
        protocolVersion: "modern",
        fetcher: async () => {
          throw original;
        },
        mapError(error) {
          received = error;
          return error;
        },
      },
      async () => undefined,
    ),
  ).rejects.toThrow();
  expect(received).not.toBe(original);
});
