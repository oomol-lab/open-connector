import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";
import { normalizeNeonAiGatewayBaseUrl } from "./runtime.ts";

interface CapturedRequest {
  url: string;
  method: string;
  authorization: string | null;
  anthropicVersion: string | null;
  imageOptIn: string | null;
  body: unknown;
}

const gatewayHost = "https://br-cool-moon-123-api.ai.c-2.us-east-2.aws.neon.tech";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "nt_live_test",
  values: { apiKey: "nt_live_test", baseUrl: `${gatewayHost}/v1` },
  profile: { accountId: "neon_ai_gateway:test", displayName: "Neon AI Gateway test", grantedScopes: [] },
  metadata: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Neon AI Gateway base URL", () => {
  it("reduces SDK base URLs to the branch host", () => {
    for (const suffix of ["", "/", "/v1", "/openai/v1", "/anthropic", "/v1?x=1#y"]) {
      expect(normalizeNeonAiGatewayBaseUrl(`${gatewayHost}${suffix}`)).toBe(gatewayHost);
    }
  });

  it("only accepts HTTPS hosts under neon.tech", () => {
    expect(() => normalizeNeonAiGatewayBaseUrl("https://gateway.example.com")).toThrow(/Neon AI Gateway host/u);
    expect(() => normalizeNeonAiGatewayBaseUrl("https://evil.neon.tech.example.com")).toThrow(/Neon AI Gateway host/u);
    expect(() => normalizeNeonAiGatewayBaseUrl("http://br-x-api.ai.c-2.us-east-2.aws.neon.tech")).toThrow(
      /Neon AI Gateway host/u,
    );
    expect(() => normalizeNeonAiGatewayBaseUrl("https://user:pass@br-x-api.ai.c-2.us-east-2.aws.neon.tech")).toThrow(
      /credentials/u,
    );
  });
});

describe("Neon AI Gateway actions", () => {
  it("routes each dialect to its gateway path with the branch token", async () => {
    const requests = stubResponses(Array.from({ length: 5 }, () => Response.json({ ok: true })));

    await execute("create_chat_completion", { model: "gpt-5-mini", messages: [{ role: "user", content: "hi" }] });
    await execute("create_response", { model: "gpt-5-mini", input: "hi" });
    await execute("create_message", {
      model: "claude-haiku-4-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "hi" }],
    });
    await execute("create_embedding", { model: "bge-large-en", input: "hi" });
    await execute("list_models", {});

    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      `POST ${gatewayHost}/v1/chat/completions`,
      `POST ${gatewayHost}/openai/v1/responses`,
      `POST ${gatewayHost}/anthropic/v1/messages`,
      `POST ${gatewayHost}/v1/embeddings`,
      `GET ${gatewayHost}/v1/models`,
    ]);
    expect(requests.every(({ authorization }) => authorization === "Bearer nt_live_test")).toBe(true);
    expect(requests[2]?.anthropicVersion).toBe("2023-06-01");
    expect(requests[0]?.anthropicVersion).toBeNull();
    expect(requests[1]?.body).toEqual({ model: "gpt-5-mini", input: "hi" });
  });

  it("puts the Gemini model in the path and keeps it out of the body", async () => {
    const requests = stubResponses([Response.json({ candidates: [] })]);

    await execute("generate_content", {
      model: "gemini-3-flash",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    });

    expect(requests[0]).toMatchObject({
      method: "POST",
      url: `${gatewayHost}/gemini/v1beta/models/gemini-3-flash:generateContent`,
      authorization: "Bearer nt_live_test",
    });
    expect(requests[0]?.body).toEqual({
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    });
  });

  it("rejects a Gemini model that would change the request path", async () => {
    const requests = stubResponses([]);

    const result = await execute("generate_content", {
      model: "../v1/models",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(requests).toHaveLength(0);
  });

  it("sends decisions to System One and opts Jev into image assets only when assets are present", async () => {
    const requests = stubResponses(Array.from({ length: 3 }, () => Response.json({ answers: {} })));
    const questions = { refund: { type: "noul", instructions: "Is this a refund request?" } };
    const assets = { "img-1": { type: "image", format: "png", data_base64: "iVBORw0KGgo=" } };

    await execute("evaluate", { model: "typesafeai-jev-1-14-0", state: "I was charged twice.", questions });
    await execute("evaluate", { model: "typesafeai-jev-1-14-0", state: { photo: "img-1" }, questions, assets });
    await execute("evaluate", { model: "openjev-qwen35-4b", state: { photo: "img-1" }, questions, assets });

    expect(requests.map(({ url }) => url)).toEqual(Array(3).fill(`${gatewayHost}/typesafe/v1/systemone`));
    expect(requests.map(({ imageOptIn }) => imageOptIn)).toEqual([null, "true", null]);
  });

  it("reads the flat quota envelope and keeps 429 with Retry-After", async () => {
    stubResponses([
      Response.json(
        { error_code: "REQUEST_LIMIT_EXCEEDED", message: "You've reached your AI Gateway daily spend limit." },
        { status: 429, headers: { "retry-after": "30" } },
      ),
    ]);

    const result = await execute("list_models", {});

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "rate_limited",
        message: "You've reached your AI Gateway daily spend limit.",
        details: { status: 429, details: { code: "REQUEST_LIMIT_EXCEEDED", retryAfterSeconds: 30 } },
      },
    });
  });

  it("keeps the status of an oversized request", async () => {
    stubResponses([Response.json({ error: { message: "request body too large" } }, { status: 413 })]);

    const result = await execute("create_embedding", { model: "bge-large-en", input: "hi" });

    expect(result).toMatchObject({ ok: false, error: { details: { status: 413 } } });
  });

  it("rejects streaming before any request", async () => {
    const requests = stubResponses([]);

    const result = await execute("create_chat_completion", {
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(requests).toHaveLength(0);
  });

  it("reports missing AI Gateway credits as insufficient credit", async () => {
    stubResponses([
      Response.json({ error: { message: "AI Gateway credits required", code: "credits_required" } }, { status: 403 }),
    ]);

    const result = await execute("list_models", {});

    expect(result).toMatchObject({
      ok: false,
      error: { code: "insufficient_credit", message: "AI Gateway credits required" },
    });
  });

  it("keeps a plain 403 as a provider error", async () => {
    stubResponses([Response.json({ message: "credential not authorized for this branch" }, { status: 403 })]);

    const result = await execute("list_models", {});

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "credential not authorized for this branch" },
    });
  });
});

describe("Neon AI Gateway credential validation", () => {
  it("records the branch host and available models", async () => {
    stubResponses([
      Response.json({
        object: "list",
        data: [
          { id: "gpt-5-mini", enabled: true },
          { id: "claude-haiku-4-5", enabled: true },
          { id: "gpt-5-5-pro", enabled: false },
        ],
      }),
    ]);

    const result = await credentialValidators.apiKey!(
      { apiKey: "nt_live_test", values: { apiKey: "nt_live_test", baseUrl: `${gatewayHost}/anthropic` } },
      { fetcher: fetch },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "neon_ai_gateway:br-cool-moon-123-api.ai.c-2.us-east-2.aws.neon.tech",
        displayName: "Neon AI Gateway br-cool-moon-123",
      },
      metadata: {
        apiBaseUrl: gatewayHost,
        branchId: "br-cool-moon-123",
        availableModels: ["gpt-5-mini", "claude-haiku-4-5"],
      },
    });
  });
});

async function execute(action: string, input: Record<string, unknown>) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("neon_ai_gateway");
      return credential;
    },
  };
  return executors[`neon_ai_gateway.${action}`]!(input, context);
}

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const text = await request.text();
    requests.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("authorization"),
      anthropicVersion: request.headers.get("anthropic-version"),
      imageOptIn: request.headers.get("typesafe-danger-zone-images"),
      body: text ? JSON.parse(text) : undefined,
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Neon AI Gateway request to ${request.url}`);
    }
    return response;
  });
  return requests;
}
