import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

const context: ExecutionContext = {
  async getCredential() {
    return {
      authType: "api_key",
      apiKey: "test-key",
      values: { apiKey: "test-key" },
      profile: { accountId: "test", displayName: "Test", grantedScopes: [] },
      metadata: {},
    };
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("API Route", () => {
  it("validates credentials with an authenticated model lookup without inference", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ id: "model-a" }, { id: 42 }, {}] }));
    const result = await credentialValidators.apiKey!({ apiKey: "test-key", values: {} }, { fetcher });
    expect(result?.metadata?.availableModels).toEqual(["model-a"]);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://global.api-route.com/v1/models");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
  });

  it.each([401, 403])("maps validation HTTP %i to a credential field error", async (status) => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "test-key", values: {} },
        { fetcher: async () => Response.json({ error: { message: "Invalid key" } }, { status }) },
      ),
    ).rejects.toMatchObject({ status: 400, message: "Invalid key" });
  });

  it.each([{}, { data: null }, { data: "invalid" }])("rejects malformed successful model lists", async (payload) => {
    await expect(
      credentialValidators.apiKey!({ apiKey: "test-key", values: {} }, { fetcher: async () => Response.json(payload) }),
    ).rejects.toMatchObject({ status: 502, message: "API Route returned a malformed model list" });
  });

  it("forwards model IDs and tool options without modifying the chat payload", async () => {
    const input = {
      model: "model-from-key",
      messages: [{ role: "user", content: "Hello" }],
      tools: [{ type: "function", function: { name: "lookup" } }],
      stream: false,
    };
    const output = { id: "chat-1", choices: [{ message: { role: "assistant", content: "Hi" } }] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(output));
    vi.stubGlobal("fetch", fetcher);
    await expect(executors["api_route.create_chat_completion"]!(input, context)).resolves.toEqual({ ok: true, output });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://global.api-route.com/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it("rejects streaming before making an inference request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const result = await executors["api_route.create_chat_completion"]!({ stream: true }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, "authorization_failed"],
    [403, "authorization_failed"],
    [429, "rate_limited"],
  ])("preserves execution HTTP %i as %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("Upstream error", { status })));
    await expect(executors["api_route.list_models"]!({}, context)).resolves.toMatchObject({
      ok: false,
      error: { code, message: "Upstream error" },
    });
  });

  it("maps an interrupted response to a timeout error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(credentialValidators.apiKey!({ apiKey: "test-key", values: {} }, { fetcher })).rejects.toMatchObject({
      status: 504,
    });
  });

  it("rejects invalid JSON in a successful response", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "test-key", values: {} },
        { fetcher: async () => new Response("not JSON") },
      ),
    ).rejects.toMatchObject({ status: 502, message: "API Route returned invalid JSON" });
  });
});
