import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "test-fal-key",
  values: { apiKey: "test-fal-key" },
  profile: { accountId: "api_key", displayName: "fal.ai API Key", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

function stubFetch(handler: (request: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return handler(request);
  });
  setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
  return calls;
}

describe("fal_ai.submit_queue_request", () => {
  it("submits the model input to the full model path and returns the queue URLs fal reports", async () => {
    const calls = stubFetch(() =>
      Response.json({
        status: "IN_QUEUE",
        request_id: "req-1",
        queue_position: 0,
        status_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
        response_url: "https://queue.fal.run/fal-ai/flux/requests/req-1",
        cancel_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel",
      }),
    );

    const result = await executors["fal_ai.submit_queue_request"]!(
      { modelId: "fal-ai/flux/schnell", input: { prompt: "a small red cube" } },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        requestId: "req-1",
        status: "IN_QUEUE",
        queuePosition: 0,
        statusUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
        responseUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1",
        cancelUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel",
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/flux/schnell");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers.get("authorization")).toBe("Key test-fal-key");
    expect(await calls[0]!.json()).toEqual({ prompt: "a small red cube" });
  });

  it("forwards webhookUrl as an encoded fal_webhook query parameter", async () => {
    const calls = stubFetch(() =>
      Response.json({
        status: "IN_QUEUE",
        request_id: "req-1",
        status_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
        response_url: "https://queue.fal.run/fal-ai/flux/requests/req-1",
        cancel_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel",
      }),
    );

    await executors["fal_ai.submit_queue_request"]!(
      {
        modelId: "fal-ai/flux/schnell",
        input: { prompt: "a small red cube" },
        webhookUrl: "https://hooks.example.com/fal?token=abc",
      },
      context,
    );

    expect(calls[0]!.url).toBe(
      "https://queue.fal.run/fal-ai/flux/schnell?fal_webhook=https%3A%2F%2Fhooks.example.com%2Ffal%3Ftoken%3Dabc",
    );
    expect(await calls[0]!.json()).toEqual({ prompt: "a small red cube" });
  });

  it("rejects a null submission body with a provider error instead of throwing a TypeError", async () => {
    stubFetch(() => Response.json(null));

    const result = await executors["fal_ai.submit_queue_request"]!(
      { modelId: "fal-ai/flux/schnell", input: { prompt: "a small red cube" } },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_error", details: { status: 502 } },
    });
  });

  it("rejects a submission response with a non-string request_id instead of returning it as-is", async () => {
    stubFetch(() =>
      Response.json({
        status: "IN_QUEUE",
        request_id: 12345,
        status_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
        response_url: "https://queue.fal.run/fal-ai/flux/requests/req-1",
        cancel_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel",
      }),
    );

    const result = await executors["fal_ai.submit_queue_request"]!(
      { modelId: "fal-ai/flux/schnell", input: { prompt: "a small red cube" } },
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining("request_id") } });
  });
});

describe("fal_ai.queue_get_status", () => {
  it("uses the statusUrl returned by submit_queue_request", async () => {
    const calls = stubFetch(() =>
      Response.json({ status: "COMPLETED", response_url: null, queue_position: null, logs: [] }),
    );

    await executors["fal_ai.queue_get_status"]!(
      {
        statusUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
      },
      context,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/flux/requests/req-1/status");
  });

  it("requires statusUrl", async () => {
    const calls = stubFetch(() => Response.json({}));

    const result = await executors["fal_ai.queue_get_status"]!({}, context);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: expect.stringContaining("statusUrl"),
      },
    });
    expect(calls).toHaveLength(0);
  });

  it("accepts the statusUrl without unrelated identifiers", async () => {
    const calls = stubFetch(() =>
      Response.json({ status: "IN_PROGRESS", response_url: null, queue_position: null, logs: [] }),
    );

    const result = await executors["fal_ai.queue_get_status"]!(
      { statusUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/status" },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { status: "IN_PROGRESS" } });
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/flux/requests/req-1/status");
  });

  it("rejects a non-object status body with a provider error", async () => {
    stubFetch(() => Response.json([]));

    const result = await executors["fal_ai.queue_get_status"]!(
      { statusUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/status" },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_error", details: { status: 502 } },
    });
  });

  it("rejects a statusUrl that does not point at fal's queue host", async () => {
    const calls = stubFetch(() => Response.json({}));

    const result = await executors["fal_ai.queue_get_status"]!(
      { statusUrl: "https://evil.example.com/steal" },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must be an https://queue.fal.run URL") },
    });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["a plaintext scheme", "http://queue.fal.run/fal-ai/flux/requests/req-1/status"],
    ["a lookalike host suffix", "https://queue.fal.run.evil.com/fal-ai/flux/requests/req-1/status"],
    ["embedded userinfo credentials", "https://user:pass@queue.fal.run/fal-ai/flux/requests/req-1/status"],
    ["a non-default port", "https://queue.fal.run:8443/fal-ai/flux/requests/req-1/status"],
  ])("rejects a statusUrl with %s", async (_label, statusUrl) => {
    const calls = stubFetch(() => Response.json({}));

    const result = await executors["fal_ai.queue_get_status"]!({ statusUrl }, context);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: expect.stringContaining("must be an https://queue.fal.run URL"),
      },
    });
    expect(calls).toHaveLength(0);
  });
});

describe("fal_ai.queue_get_status_stream", () => {
  it("appends /stream to the pathname and keeps the statusUrl's query string intact", async () => {
    const calls = stubFetch(
      () =>
        new Response('data: {"status":"COMPLETED"}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
    );

    await executors["fal_ai.queue_get_status_stream"]!(
      {
        statusUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/status?logs=1",
      },
      context,
    );

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/fal-ai/flux/requests/req-1/status/stream");
    expect(url.search).toBe("?logs=1");
  });
});

describe("fal_ai.get_queue_request_result", () => {
  it("returns fal's raw, model-specific result payload directly instead of an empty envelope", async () => {
    const rawResult = {
      images: [{ url: "https://v3b.fal.media/files/b/example.jpg", width: 1024, height: 768 }],
      seed: 42,
    };
    const calls = stubFetch(() => Response.json(rawResult));

    const result = await executors["fal_ai.get_queue_request_result"]!(
      {
        responseUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1",
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      output: { status: "COMPLETED", response: rawResult },
    });
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/flux/requests/req-1");
  });
});

describe("fal_ai.cancel_queue_request", () => {
  it("PUTs to the cancelUrl returned by submit_queue_request", async () => {
    const calls = stubFetch(() => Response.json({ status: "CANCELLATION_REQUESTED" }));

    const result = await executors["fal_ai.cancel_queue_request"]!(
      {
        cancelUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel",
      },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { status: "CANCELLATION_REQUESTED" } });
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/flux/requests/req-1/cancel");
  });

  it("accepts a 202 cancellation acknowledgement with an empty body", async () => {
    stubFetch(() => new Response(null, { status: 202 }));

    const result = await executors["fal_ai.cancel_queue_request"]!(
      { cancelUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel" },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { status: "" } });
  });

  it("surfaces fal's status-only cancellation error body as the error message", async () => {
    stubFetch(() => Response.json({ status: "ALREADY_COMPLETED" }, { status: 400 }));

    const result = await executors["fal_ai.cancel_queue_request"]!(
      { cancelUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel" },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: expect.stringContaining("ALREADY_COMPLETED") },
    });
  });
});
