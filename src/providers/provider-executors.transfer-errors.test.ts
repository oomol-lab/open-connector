import type { ExecutionContext } from "../core/types.ts";

import { beforeEach, expect, it, vi } from "vitest";
import { executors } from "./pdfcraft/executors.ts";

const mocks = vi.hoisted(() => ({ call: vi.fn(), fetch: vi.fn() }));
vi.mock("./mcp-tools.ts", () => ({ callMcpTool: mocks.call }));
vi.mock("./provider-runtime.ts", async (original) => ({
  ...(await original<object>()),
  providerFetch: mocks.fetch,
}));
const uuid = "019a71b9-a000-7000-8000-000000000001";
const context: ExecutionContext = {
  getCredential: async () => ({
    authType: "api_key",
    apiKey: "test-key",
    values: {},
    profile: { accountId: "test-account", displayName: "Test account", grantedScopes: [] },
    metadata: {},
  }),
};
const input = {
  fileUrl: "https://8.8.8.8/source.pdf",
  input_format: "pdf",
  parameters: { output_format: "markdown" },
};

beforeEach(() => {
  mocks.call.mockReset();
  mocks.fetch.mockReset();
  mocks.call.mockImplementation(async ({ toolName }) =>
    toolName === "create_transform" ? { data: { uuid } } : { data: { put_url: "https://1.1.1.1/upload", headers: {} } },
  );
});

it.each([401, 403])("reports source HTTP %s as invalid input without blaming provider credentials", async (status) => {
  mocks.fetch.mockResolvedValue(new Response(null, { status }));
  await expect(executors["pdfcraft.submit_transform"]!(input, context)).resolves.toMatchObject({
    ok: false,
    error: { code: "invalid_input", details: { status }, message: `Source download failed with HTTP ${status}` },
  });
  expect(mocks.call).not.toHaveBeenCalled();
});

it.each([401, 403])("reports signed upload HTTP %s as a provider failure and keeps task recovery", async (status) => {
  mocks.fetch.mockResolvedValueOnce(new Response("source")).mockResolvedValueOnce(new Response(null, { status }));
  await expect(executors["pdfcraft.submit_transform"]!(input, context)).resolves.toMatchObject({
    ok: false,
    error: {
      code: "provider_error",
      details: { status },
      message: expect.stringContaining(`PDFCraft task ${uuid}: PDFCraft upload failed with HTTP ${status}`),
    },
  });
  expect(mocks.call).toHaveBeenCalledTimes(2);
});
