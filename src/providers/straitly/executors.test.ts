import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { credentialValidators, executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "test-key",
  values: {},
  profile: { accountId: "straitly", displayName: "Straitly", grantedScopes: [] },
  metadata: {},
};
const context: ExecutionContext = { getCredential: async () => credential };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setDefaultGuardedFetchDnsLookup(null);
});

describe("Straitly", () => {
  it("validates the API key against /v1/key", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url.toString()).toBe("https://api.straitly.ai/v1/key");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
      return Response.json({ ok: true, key_id: "key_123" });
    });
    await expect(credentialValidators.apiKey!({ apiKey: "test-key", values: {} }, { fetcher })).resolves.toEqual({
      profile: { displayName: "Straitly API Key" },
      metadata: { validationEndpoint: "/key" },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("times out a stalled key-validation request", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
        }),
    );
    const result = credentialValidators.apiKey!({ apiKey: "test-key", values: {} }, { fetcher });
    const assertion = expect(result).rejects.toMatchObject({
      status: 504,
      message: "Straitly API request timed out",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a rejected API key as a connection field error", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "invalid-key", values: {} },
        { fetcher: async () => Response.json({ error: { message: "Invalid API key." } }, { status: 401 }) },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lists models via GET /v1/models", async () => {
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    const output = { data: [{ id: "deepseek/deepseek-v4-1-flash-1017" }, { id: "claude-sonnet-5-5" }] };
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url.toString()).toBe("https://api.straitly.ai/v1/models");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
      return Response.json(output);
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(executors["straitly.list_models"]!({}, context)).resolves.toEqual({
      ok: true,
      output,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("passes the selected model and optional parameters to chat completions", async () => {
    const model = "deepseek/deepseek-v4-1-flash-1017";
    const options = {
      temperature: 0.5,
      max_tokens: 100,
      top_p: 0.9,
      stop: ["END"],
      seed: 42,
      tools: [{ type: "function", function: { name: "lookup" } }],
      tool_choice: "auto",
      response_format: { type: "json_object" },
    };
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    const messages = [{ role: "user", content: "Hello" }];
    const output = { id: "chatcmpl-1", model, choices: [{ message: { role: "assistant", content: "Hello" } }] };
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url.toString()).toBe("https://api.straitly.ai/v1/chat/completions");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
      expect(JSON.parse(String(init?.body))).toEqual({ messages, model, ...options, stream: false });
      return Response.json(output);
    });
    vi.stubGlobal("fetch", fetcher);
    const input = { messages, model, ...options };

    await expect(executors["straitly.create_chat_completion"]!(input, context)).resolves.toEqual({
      ok: true,
      output,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects stream=true in create_chat_completion", async () => {
    await expect(
      executors["straitly.create_chat_completion"]!(
        { model: "claude-sonnet-5-5", messages: [{ role: "user", content: "Hello" }], stream: true },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        message: "stream=true is not supported by connector actions",
        details: { status: 400, details: undefined },
      },
    });
  });

  it("preserves HTTP 401 on chat execution as provider_error", async () => {
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal("fetch", async () => Response.json({ error: { message: "Unauthorized" } }, { status: 401 }));
    await expect(
      executors["straitly.create_chat_completion"]!(
        { model: "claude-sonnet-5-5", messages: [{ role: "user", content: "Hello" }] },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "provider_error",
        message: "Straitly API request failed with HTTP 401",
        details: { status: 401, details: { error: { message: "Unauthorized" } } },
      },
    });
  });
});
