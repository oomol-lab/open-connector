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
  setDefaultGuardedFetchDnsLookup(null);
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
});

describe("fal_ai.queue_get_status", () => {
  it("prefers the explicit statusUrl over reconstructing a path from modelId", async () => {
    const calls = stubFetch(() =>
      Response.json({ status: "COMPLETED", response_url: null, queue_position: null, logs: [] }),
    );

    await executors["fal_ai.queue_get_status"]!(
      {
        modelId: "fal-ai/flux/schnell",
        requestId: "req-1",
        statusUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
      },
      context,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/flux/requests/req-1/status");
  });

  it("falls back to a per-segment encoded path when no explicit URL is given", async () => {
    const calls = stubFetch(() =>
      Response.json({ status: "COMPLETED", response_url: null, queue_position: null, logs: [] }),
    );

    await executors["fal_ai.queue_get_status"]!({ modelId: "fal-ai/fast-sdxl", requestId: "req-1" }, context);

    expect(calls).toHaveLength(1);
    // The path must keep literal slashes between segments, not collapse the
    // whole model id into a single %2F-escaped segment fal will not route.
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/fast-sdxl/requests/req-1/status");
  });

  it("rejects a statusUrl that does not point at fal's queue host", async () => {
    const calls = stubFetch(() => Response.json({}));

    const result = await executors["fal_ai.queue_get_status"]!(
      { modelId: "fal-ai/flux/schnell", requestId: "req-1", statusUrl: "https://evil.example.com/steal" },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must be an https://queue.fal.run URL") },
    });
    expect(calls).toHaveLength(0);
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
        modelId: "fal-ai/flux/schnell",
        requestId: "req-1",
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
  it("PUTs to the explicit cancelUrl when provided", async () => {
    const calls = stubFetch(() => Response.json({ status: "CANCELLATION_REQUESTED" }));

    const result = await executors["fal_ai.cancel_queue_request"]!(
      {
        modelId: "fal-ai/flux/schnell",
        requestId: "req-1",
        cancelUrl: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel",
      },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { status: "CANCELLATION_REQUESTED" } });
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/flux/requests/req-1/cancel");
  });
});
