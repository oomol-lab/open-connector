import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { credentialValidators, executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "test-key",
  values: {},
  profile: { accountId: "worldrouter", displayName: "WorldRouter", grantedScopes: [] },
  metadata: {},
};
const context: ExecutionContext = { getCredential: async () => credential };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setDefaultGuardedFetchDnsLookup(null);
});

describe("WorldRouter", () => {
  it("validates the API key with a model-list request", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url.toString()).toBe("https://inference-api.worldrouter.ai/v1/models");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
      return Response.json({ data: [{ id: "gpt-6.2-astra" }] });
    });
    await expect(credentialValidators.apiKey!({ apiKey: "test-key", values: {} }, { fetcher })).resolves.toEqual({
      metadata: { validationEndpoint: "/models" },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("times out a stalled model-list request during credential validation", async () => {
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
      message: "WorldRouter API request timed out",
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
        { fetcher: async () => Response.json({ message: "Invalid API key" }, { status: 401 }) },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("passes the selected model and optional parameters to chat completions", async () => {
    const model = "another-model";
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
    const output = { id: "reply", choices: [{ message: { role: "assistant", content: "Hello" } }] };
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url.toString()).toBe("https://inference-api.worldrouter.ai/v1/chat/completions");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
      expect(JSON.parse(String(init?.body))).toEqual({ messages, model, ...options, stream: false });
      return Response.json(output);
    });
    vi.stubGlobal("fetch", fetcher);
    const input = { messages, model, ...options };

    await expect(executors["worldrouter.create_chat_completion"]!(input, context)).resolves.toEqual({
      ok: true,
      output,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
