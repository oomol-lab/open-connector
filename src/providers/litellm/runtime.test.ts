import { describe, expect, it } from "vitest";
import {
  litellmActionHandlers,
  normalizeLitellmBaseUrl,
  readLitellmError,
  validateLitellmCredential,
} from "./runtime.ts";

interface RecordedRequest {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
}

function recordingFetcher(response: () => Response): { fetcher: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return response();
  };
  return { fetcher, requests };
}

function litellmContext(fetcher: typeof fetch) {
  return { apiKey: "sk-virtual", baseUrl: "https://litellm.example.com", fetcher };
}

const litellmErrorBody = (type: string, message: string, code: string) => ({
  error: { message, type, param: null, code },
});

describe("LiteLLM base URL", () => {
  it("reduces a pasted /v1 URL to the proxy root and drops query and hash", () => {
    expect(normalizeLitellmBaseUrl("https://litellm.example.com/v1/?team=a#x", false)).toBe(
      "https://litellm.example.com",
    );
    expect(normalizeLitellmBaseUrl("https://litellm.example.com///", false)).toBe("https://litellm.example.com");
  });

  it("keeps a server root path prefix", () => {
    expect(normalizeLitellmBaseUrl("https://gateway.example.com/litellm/v1", false)).toBe(
      "https://gateway.example.com/litellm",
    );
  });

  it("rejects embedded credentials and loopback targets", () => {
    expect(() => normalizeLitellmBaseUrl("https://user:secret@litellm.example.com", false)).toThrow(
      "baseUrl must not include credentials",
    );
    expect(() => normalizeLitellmBaseUrl("http://127.0.0.1:4000", true)).toThrow();
  });

  it("accepts a private-network proxy only when the deployment allows it", () => {
    expect(() => normalizeLitellmBaseUrl("http://10.0.0.5:4000", false)).toThrow();
    expect(normalizeLitellmBaseUrl("http://10.0.0.5:4000/v1", true)).toBe("http://10.0.0.5:4000");
  });
});

describe("LiteLLM runtime", () => {
  it("posts chat completions to the proxy with the virtual key and without undefined fields", async () => {
    const { fetcher, requests } = recordingFetcher(() =>
      Response.json({ id: "chatcmpl-1", choices: [{ message: { role: "assistant", content: "4" } }] }),
    );

    const result = await litellmActionHandlers.create_chat_completion(
      { model: "gpt-4.1-mini", messages: [{ role: "user", content: "2+2?" }], temperature: undefined },
      litellmContext(fetcher),
    );

    expect(requests).toEqual([
      {
        url: "https://litellm.example.com/v1/chat/completions",
        method: "POST",
        authorization: "Bearer sk-virtual",
        body: { model: "gpt-4.1-mini", messages: [{ role: "user", content: "2+2?" }] },
      },
    ]);
    expect(result).toMatchObject({ choices: [{ message: { content: "4" } }] });
  });

  it("routes Anthropic-format messages and embeddings to their proxy endpoints", async () => {
    const { fetcher, requests } = recordingFetcher(() => Response.json({}));

    await litellmActionHandlers.create_message(
      { model: "gemini-2.5-flash", max_tokens: 64, messages: [{ role: "user", content: "hi" }] },
      litellmContext(fetcher),
    );
    await litellmActionHandlers.create_embedding(
      { model: "text-embedding-3-small", input: ["a", "b"] },
      litellmContext(fetcher),
    );

    expect(requests.map((request) => request.url)).toEqual([
      "https://litellm.example.com/v1/messages",
      "https://litellm.example.com/v1/embeddings",
    ]);
  });

  it("rejects streaming before calling the proxy", async () => {
    const { fetcher, requests } = recordingFetcher(() => Response.json({}));

    await expect(
      litellmActionHandlers.create_chat_completion(
        { model: "gpt-4.1-mini", messages: [{ role: "user", content: "hi" }], stream: true },
        litellmContext(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "stream=true is not supported by connector actions" });
    expect(requests).toHaveLength(0);
  });

  // Older LiteLLM releases answer an exhausted budget with 400, newer ones with 422.
  it.each([400, 422])("reports an exhausted LiteLLM budget (HTTP %i) as insufficient credit", async (status) => {
    const { fetcher } = recordingFetcher(() =>
      Response.json(
        litellmErrorBody(
          "budget_exceeded",
          "Budget has been exceeded! Current cost: 5.2, Max budget: 5.0",
          String(status),
        ),
        { status },
      ),
    );

    await expect(
      litellmActionHandlers.create_chat_completion(
        { model: "gpt-4.1-mini", messages: [{ role: "user", content: "hi" }] },
        litellmContext(fetcher),
      ),
    ).rejects.toMatchObject({
      status: 402,
      code: "insufficient_credit",
      message: "Budget has been exceeded! Current cost: 5.2, Max budget: 5.0",
      details: { status, type: "budget_exceeded", code: String(status) },
    });
  });

  it("maps a rejected key to an authorization failure during execution and a field error during validation", async () => {
    const unauthorized = (): Response =>
      Response.json(
        litellmErrorBody("token_not_found_in_db", "Authentication Error, Invalid proxy server token", "401"),
        {
          status: 401,
        },
      );

    await expect(readLitellmError(unauthorized(), "execute")).resolves.toMatchObject({ status: 401 });
    await expect(readLitellmError(unauthorized(), "validate")).resolves.toMatchObject({
      status: 400,
      message: "Authentication Error, Invalid proxy server token",
    });
  });

  it("keeps the retry hint on rate limits and marks upstream failures as provider errors", async () => {
    const rateLimited = new Response(
      JSON.stringify(litellmErrorBody("throttling_error", "No deployments available", "429")),
      {
        status: 429,
        headers: { "retry-after": "12" },
      },
    );
    await expect(readLitellmError(rateLimited, "execute")).resolves.toMatchObject({
      status: 429,
      details: { retryAfterSeconds: 12 },
    });

    await expect(
      readLitellmError(new Response("upstream exploded", { status: 503 }), "execute"),
    ).resolves.toMatchObject({
      status: 503,
      code: "provider_error",
      message: "upstream exploded",
    });
  });

  it("normalizes model info, filters by model name, and never returns deployment params", async () => {
    const { fetcher, requests } = recordingFetcher(() =>
      Response.json({
        data: [
          {
            model_name: "gpt-4.1-mini",
            litellm_params: { model: "azure/gpt-4.1-mini", api_base: "https://internal.example.com" },
            model_info: {
              id: "deploy-1",
              litellm_provider: "azure",
              mode: "chat",
              max_input_tokens: 1047576,
              max_output_tokens: 32768,
              input_cost_per_token: 4e-7,
              output_cost_per_token: 1.6e-6,
              supports_function_calling: true,
              supports_vision: true,
            },
          },
          { model_name: "text-embedding-3-small", model_info: { mode: "embedding" } },
          { litellm_params: { model: "orphan" } },
        ],
      }),
    );

    const all = await litellmActionHandlers.get_model_info({}, litellmContext(fetcher));
    const filtered = await litellmActionHandlers.get_model_info({ model: "gpt-4.1-mini" }, litellmContext(fetcher));

    expect(requests[0]?.url).toBe("https://litellm.example.com/model/info");
    expect(all).toMatchObject({ models: [{ modelName: "gpt-4.1-mini" }, { modelName: "text-embedding-3-small" }] });
    expect(filtered).toEqual({
      models: [
        {
          modelName: "gpt-4.1-mini",
          modelId: "deploy-1",
          provider: "azure",
          mode: "chat",
          maxInputTokens: 1047576,
          maxOutputTokens: 32768,
          inputCostPerToken: 4e-7,
          outputCostPerToken: 1.6e-6,
          supportsFunctionCalling: true,
          supportsVision: true,
          supportsReasoning: null,
          supportsResponseSchema: null,
        },
      ],
    });
  });

  it("returns key budget data with the remaining budget and without the echoed key", async () => {
    const { fetcher } = recordingFetcher(() =>
      Response.json({
        key: "sk-virtual",
        info: {
          key_alias: "research-agent",
          key_name: "sk-...tual",
          status: "active",
          spend: 3.25,
          max_budget: 10,
          budget_duration: "30d",
          budget_reset_at: "2026-11-01T00:00:00Z",
          models: ["gpt-4.1-mini"],
          tpm_limit: 100000,
          rpm_limit: null,
          team_id: "team-1",
          blocked: null,
        },
      }),
    );

    const result = await litellmActionHandlers.get_key_info({}, litellmContext(fetcher));

    expect(result).toEqual({
      keyAlias: "research-agent",
      keyName: "sk-...tual",
      status: "active",
      spend: 3.25,
      maxBudget: 10,
      remainingBudget: 6.75,
      budgetDuration: "30d",
      budgetResetAt: "2026-11-01T00:00:00Z",
      models: ["gpt-4.1-mini"],
      tpmLimit: 100000,
      rpmLimit: null,
      teamId: "team-1",
      userId: null,
      expires: null,
      blocked: null,
    });
    expect(JSON.stringify(result)).not.toContain("sk-virtual");
  });

  it("explains that the master key has no key record", async () => {
    const { fetcher } = recordingFetcher(() =>
      Response.json(litellmErrorBody("not_found_error", "Key not found in database", "404"), { status: 404 }),
    );

    await expect(litellmActionHandlers.get_key_info({}, litellmContext(fetcher))).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Connect a LiteLLM virtual key"),
    });
  });

  it("points at the base URL, not the key, when the /key/info route itself is missing", async () => {
    const { fetcher } = recordingFetcher(() => Response.json({ detail: "Not Found" }, { status: 404 }));

    const rejection = litellmActionHandlers.get_key_info({}, litellmContext(fetcher));
    await expect(rejection).rejects.toMatchObject({
      status: 400,
      message: "LiteLLM returned 404 for /key/info (Not Found). Check that baseUrl points at the LiteLLM proxy root.",
    });
    await expect(rejection).rejects.not.toMatchObject({ message: expect.stringContaining("master key") });
  });

  it("passes non-404 key info failures through unchanged", async () => {
    const { fetcher } = recordingFetcher(() =>
      Response.json(litellmErrorBody("auth_error", "You are not allowed to access this key's info", "403"), {
        status: 403,
      }),
    );

    await expect(litellmActionHandlers.get_key_info({}, litellmContext(fetcher))).rejects.toMatchObject({
      status: 403,
      message: "You are not allowed to access this key's info",
    });
  });

  it("validates a key against /v1/models and records the proxy and its models", async () => {
    const { fetcher, requests } = recordingFetcher(() =>
      Response.json({ object: "list", data: [{ id: "gpt-4.1-mini" }, { id: "gemini-2.5-flash" }, {}] }),
    );

    const result = await validateLitellmCredential(
      { baseUrl: "https://litellm.example.com/v1/" },
      "sk-virtual",
      fetcher,
    );

    expect(requests[0]).toMatchObject({
      url: "https://litellm.example.com/v1/models",
      authorization: "Bearer sk-virtual",
    });
    expect(result).toEqual({
      profile: { accountId: "litellm:litellm.example.com", displayName: "LiteLLM litellm.example.com" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://litellm.example.com",
        validationEndpoint: "/v1/models",
        availableModels: ["gpt-4.1-mini", "gemini-2.5-flash"],
      },
    });
  });
});
