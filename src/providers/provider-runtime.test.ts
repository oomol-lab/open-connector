import type { ExecutionContext, ResolvedCredential } from "../core/types.ts";
import type { ProviderActionHandlers, ProviderActionSources } from "./provider-runtime.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateNetworkAccessAllowed, setPrivateNetworkAccessAllowed } from "../core/request.ts";
import {
  createProviderTimeout,
  createProviderProxyUrl,
  defineOAuthProviderExecutors,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  isAbortSignalError,
  mapProviderActionSources,
  providerFetch,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  readProviderJson,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  toProviderExecutionError,
} from "./provider-runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  setPrivateNetworkAccessAllowed(false);
});

describe("ProviderRequestError", () => {
  it("keeps provider error codes on the shared request error", () => {
    const error = new ProviderRequestError(429, "Provider quota exhausted", { retryAfter: 30 }, "rate_limited");

    expect(error).toMatchObject({
      status: 429,
      message: "Provider quota exhausted",
      details: { retryAfter: 30 },
      code: "rate_limited",
    });
  });
});

describe("toProviderExecutionError", () => {
  it("prefers an explicit provider error code over status inference", () => {
    expect(
      toProviderExecutionError(
        new ProviderRequestError(409, "Still processing", undefined, "request_in_progress"),
        "failed",
      ),
    ).toMatchObject({
      error: { code: "request_in_progress" },
    });
  });

  it("maps unknown exceptions to a generic internal error", () => {
    expect(toProviderExecutionError(new Error("secret provider response"), "Provider request failed.")).toEqual({
      ok: false,
      error: {
        code: "internal_error",
        message: "Provider request failed.",
      },
    });
  });
});

describe("readProviderJson", () => {
  it("includes bounded non-ok response text in provider errors", async () => {
    await expect(readProviderJson(new Response('{"error":"nope"}', { status: 400 }), "provider")).rejects.toMatchObject(
      {
        status: 400,
        message: '{"error":"nope"}',
      },
    );
  });

  it("does not read unbounded non-ok response bodies", async () => {
    await expect(
      readProviderJson(new Response("x".repeat(65 * 1024), { status: 500 }), "provider"),
    ).rejects.toMatchObject({
      status: 500,
      message: "provider request failed",
    });
  });
});

describe("defineProviderExecutors", () => {
  it("uses a provider-specific error mapper when configured", async () => {
    const executors = defineProviderExecutors({
      service: "test_service",
      handlers: {
        async probe() {
          throw new Error("provider-specific failure");
        },
      },
      createContext: () => ({}),
      mapError: () => ({
        ok: false,
        error: {
          code: "rate_limited",
          message: "provider quota exhausted",
        },
      }),
    });

    await expect(executors["test_service.probe"]!({}, executionContext)).resolves.toEqual({
      ok: false,
      error: {
        code: "rate_limited",
        message: "provider quota exhausted",
      },
    });
  });

  it("passes provider-owned OAuth secret state to handlers", async () => {
    const executors = defineOAuthProviderExecutors("test_service", {
      async probe(_input, context) {
        return context.providerSecret;
      },
    });
    const context: ExecutionContext = {
      getCredential: async () => ({
        authType: "oauth2",
        accessToken: "access-token",
        tokenType: "Bearer",
        providerSecret: { userGrant: { accessToken: "user-access" } },
        profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
        metadata: {},
      }),
    };

    await expect(executors["test_service.probe"]!({}, context)).resolves.toMatchObject({
      ok: true,
      output: { userGrant: { accessToken: "user-access" } },
    });
  });
});

describe("provider action contracts", () => {
  it("maps every configured action to a handler", async () => {
    const sources: ProviderActionSources<"mqtt", number> = {
      publish_message: 1,
      receive_messages: 2,
    };
    const handlers: ProviderActionHandlers<"mqtt", () => Promise<number>> = mapProviderActionSources(
      "mqtt",
      sources,
      (_name, value) => async () => value,
    );

    await expect(handlers.publish_message()).resolves.toBe(1);
    await expect(handlers.receive_messages()).resolves.toBe(2);
  });
});

describe("createProviderTimeout", () => {
  it("times out after 30 seconds unless a budget is passed", () => {
    vi.useFakeTimers();
    try {
      const timeout = createProviderTimeout(undefined);
      vi.advanceTimersByTime(29_999);
      expect(timeout.didTimeout()).toBe(false);
      expect(timeout.signal.aborted).toBe(false);
      vi.advanceTimersByTime(1);
      expect(timeout.didTimeout()).toBe(true);
      expect(timeout.signal.aborted).toBe(true);
      timeout.cleanup();

      const custom = createProviderTimeout(undefined, 5);
      vi.advanceTimersByTime(5);
      expect(custom.didTimeout()).toBe(true);
      custom.cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it("inherits an already-aborted parent signal", () => {
    const parent = new AbortController();
    parent.abort(new Error("cancelled"));

    const timeout = createProviderTimeout(parent.signal, 60_000);
    try {
      expect(timeout.signal.aborted).toBe(true);
      expect(timeout.signal.reason).toBe(parent.signal.reason);
      expect(timeout.didTimeout()).toBe(false);
    } finally {
      timeout.cleanup();
    }
  });
});

describe("providerInputError and providerResponseError", () => {
  it("bind the two statuses providers map input and upstream failures to", () => {
    const input = providerInputError("name is required.");
    expect(input).toBeInstanceOf(ProviderRequestError);
    expect(input.status).toBe(400);
    expect(input.message).toBe("name is required.");
    expect(toProviderExecutionError(input, "fallback").error?.code).toBe("invalid_input");

    const response = providerResponseError("payload must be an object");
    expect(response.status).toBe(502);
    expect(response.message).toBe("payload must be an object");
    expect(toProviderExecutionError(response, "fallback").error?.code).toBe("provider_error");
  });
});

describe("requiredInputString and requiredResponseRecord", () => {
  it("bind the shared cast helpers to the 400 and 502 provider errors", () => {
    expect(requiredInputString(" x ", "name")).toBe("x");
    const missing = (() => {
      try {
        requiredInputString("", "name");
      } catch (error) {
        return error;
      }
    })() as ProviderRequestError;
    expect(missing).toBeInstanceOf(ProviderRequestError);
    expect(missing.status).toBe(400);
    expect(missing.message).toBe("name is required.");

    expect(requiredResponseRecord({ id: 1 }, "payload")).toEqual({ id: 1 });
    const malformed = (() => {
      try {
        requiredResponseRecord([], "payload");
      } catch (error) {
        return error;
      }
    })() as ProviderRequestError;
    expect(malformed.status).toBe(502);
    expect(malformed.message).toBe("payload must be an object");
  });
});

describe("isAbortLikeError", () => {
  it("accepts AbortError and the TimeoutError raised by AbortSignal.timeout()", () => {
    expect(isAbortLikeError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortLikeError(new DOMException("timed out", "TimeoutError"))).toBe(true);
    expect(isAbortLikeError(AbortSignal.abort().reason)).toBe(true);
  });

  it("recognizes the reason an AbortSignal.timeout() signal aborts with", async () => {
    const signal = AbortSignal.timeout(1);
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
    expect((signal.reason as Error).name).toBe("TimeoutError");
    expect(isAbortLikeError(signal.reason)).toBe(true);
  });

  it("rejects other errors and non-error values", () => {
    expect(isAbortLikeError(new Error("connection reset"))).toBe(false);
    expect(isAbortLikeError(new TypeError("fetch failed"))).toBe(false);
    expect(isAbortLikeError({ name: "AbortError" })).toBe(false);
    expect(isAbortLikeError(undefined)).toBe(false);
  });
});

describe("runProviderRequest", () => {
  it("returns the request result and passes ProviderRequestError through untouched", async () => {
    await expect(runProviderRequest({ label: "Skio" }, async () => "ok")).resolves.toBe("ok");

    const inner = new ProviderRequestError(404, "not found", { id: 1 });
    await expect(runProviderRequest({ label: "Skio" }, async () => Promise.reject(inner))).rejects.toBe(inner);
  });

  it("maps AbortError, TimeoutError and a fired timeout to 504 with the provider label", async () => {
    for (const reason of [new DOMException("aborted", "AbortError"), new DOMException("timed out", "TimeoutError")]) {
      const error = await runProviderRequest({ label: "Skio" }, async () => Promise.reject(reason)).catch((e) => e);
      expect(error).toBeInstanceOf(ProviderRequestError);
      expect(error.status).toBe(504);
      expect(error.message).toBe("Skio request timed out");
    }

    const timedOut = await runProviderRequest(
      { label: "Skio", timeoutMs: 5 },
      (signal) =>
        new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted by test")))),
    ).catch((e) => e);
    expect(timedOut.status).toBe(504);
    expect(timedOut.message).toBe("Skio request timed out");
  });

  it("maps every other failure to 502 and keeps the Error message", async () => {
    const withMessage = await runProviderRequest({ label: "Skio" }, async () =>
      Promise.reject(new Error("boom")),
    ).catch((e) => e);
    expect(withMessage.status).toBe(502);
    expect(withMessage.message).toBe("Skio request failed: boom");
    expect(withMessage.details).toBeUndefined();

    const nonError = await runProviderRequest({ label: "Skio" }, async () => Promise.reject("boom")).catch((e) => e);
    expect(nonError.status).toBe(502);
    expect(nonError.message).toBe("Skio request failed");
  });

  it("forwards the caller signal and clears the timer", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const seen: AbortSignal[] = [];
      const pending = runProviderRequest({ label: "Skio", signal: controller.signal }, (signal) => {
        seen.push(signal);
        return new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
      });
      expect(vi.getTimerCount()).toBe(1);
      controller.abort();
      const error = await pending.catch((e) => e);
      expect(error.status).toBe(504);
      expect(seen[0]?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps a caller abort with a custom reason to 504", async () => {
    const controller = new AbortController();
    const pending = runProviderRequest({ label: "Skio", signal: controller.signal }, (signal) => {
      return new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    });
    controller.abort(new Error("cancelled by caller"));
    const error = await pending.catch((e) => e);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.status).toBe(504);
    expect(error.message).toBe("Skio request timed out");
  });
});

describe("isAbortSignalError", () => {
  it("accepts both AbortError rejections and the signal's own abort reason", () => {
    expect(isAbortSignalError(AbortSignal.abort(), new DOMException("aborted", "AbortError"))).toBe(true);

    const cancelled = AbortSignal.abort(new Error("cancelled"));
    expect(isAbortSignalError(cancelled, cancelled.reason)).toBe(true);
  });

  it("rejects errors that did not come from the aborted signal", () => {
    const pending = new AbortController().signal;
    expect(isAbortSignalError(pending, new DOMException("aborted", "AbortError"))).toBe(false);
    expect(isAbortSignalError(AbortSignal.abort(new Error("cancelled")), new Error("connection reset"))).toBe(false);
  });
});

describe("createProviderProxyUrl", () => {
  it("rejects endpoints that can escape the provider origin", () => {
    for (const endpoint of [
      "/https://evil.example/steal",
      "/https:///evil.example/",
      "/http://169.254.169.254/latest/meta-data/",
      "/http:/169.254.169.254/",
    ]) {
      expect(() => createProviderProxyUrl("https://api.example.com/v1/", endpoint)).toThrow(
        "endpoint must be a relative path",
      );
    }
  });

  it("joins normal endpoints below an API path prefix", () => {
    expect(createProviderProxyUrl("https://api.example.com/v1/", "/items").toString()).toBe(
      "https://api.example.com/v1/items",
    );
  });

  it("keeps a colon-suffixed literal segment below the base instead of parsing it as a scheme", () => {
    expect(createProviderProxyUrl("https://api.example.com/v1/", "/groups:batchDelete").toString()).toBe(
      "https://api.example.com/v1/groups:batchDelete",
    );
  });

  it("keeps a scheme-like segment with an authority below the base instead of switching origin", () => {
    expect(createProviderProxyUrl("https://api.example.com/v1/", "/custom://evil.example/x").toString()).toBe(
      "https://api.example.com/v1/custom://evil.example/x",
    );
  });
});

const apiKeyCredential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "test-key",
  values: {},
  profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
  metadata: {},
};

const executionContext: ExecutionContext = {
  getCredential: async () => apiKeyCredential,
};

function stubFetchSequence(responses: Response[]): Array<{ url: string; init: RequestInit | undefined }> {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), init });
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected extra request");
    }
    return response;
  });
  return calls;
}

describe("provider egress SSRF guard", () => {
  it("does not fetch when a proxy endpoint escapes its provider origin", async () => {
    const calls = stubFetchSequence([]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com/v1/",
      auth: { type: "bearer" },
    });

    const result = await proxy({ method: "GET", endpoint: "/https://evil.example/steal" }, executionContext);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.message).toBe("endpoint must be a relative path");
    expect(calls).toHaveLength(0);
  });

  it("keeps Z-API-style path rewrites on the provider origin", async () => {
    const calls = stubFetchSequence([new Response(JSON.stringify({ ok: true }), { status: 200 })]);
    const origins: string[] = [];
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com/v1/",
      auth: { type: "bearer" },
      customizeRequest({ url }) {
        origins.push(url.origin);
        url.pathname = `/instances/instance/token/token${url.pathname}`;
      },
    });

    await expect(proxy({ method: "GET", endpoint: "/items" }, executionContext)).resolves.toMatchObject({ ok: true });

    expect(origins).toEqual(["https://api.example.com"]);
    expect(calls[0]?.url).toBe("https://api.example.com/instances/instance/token/token/v1/items");
  });

  it("does not fetch when customizeRequest rewrites the URL off the provider origin", async () => {
    const calls = stubFetchSequence([]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com/v1/",
      auth: { type: "bearer" },
      customizeRequest({ url }) {
        url.hostname = "evil.example";
      },
    });

    const result = await proxy({ method: "GET", endpoint: "/items" }, executionContext);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.message).toBe("endpoint must stay on the provider origin");
    expect(calls).toHaveLength(0);
  });

  it("allows customizeRequest to select an exact code-controlled origin", async () => {
    const calls = stubFetchSequence([new Response(JSON.stringify({ ok: true }), { status: 200 })]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com/v1/",
      auth: { type: "bearer" },
      allowedOrigins: ["https://eu.api.example.com"],
      customizeRequest({ url }) {
        url.hostname = "eu.api.example.com";
      },
    });

    const result = await proxy({ method: "GET", endpoint: "/items" }, executionContext);

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe("https://eu.api.example.com/v1/items");
  });

  it("strips the configured proxy API key header from cross-origin redirects", async () => {
    const calls = stubFetchSequence([
      new Response(null, { status: 302, headers: { location: "https://cdn.example.net/items" } }),
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com",
      auth: { type: "api_key_header", name: "X-Provider-Credential" },
    });

    const result = await proxy({ method: "GET", endpoint: "/items" }, executionContext);

    expect(result.ok).toBe(true);
    expect(new Headers(calls[0]?.init?.headers).get("x-provider-credential")).toBe("test-key");
    expect(new Headers(calls[1]?.init?.headers).has("x-provider-credential")).toBe(false);
  });

  it("rejects origin-escaping endpoints even when DNS validation is skipped", async () => {
    const calls = stubFetchSequence([]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com/v1/",
      auth: { type: "bearer" },
      skipDnsValidation: true,
    });

    const result = await proxy({ method: "GET", endpoint: "/https://evil.example/steal" }, executionContext);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.message).toBe("endpoint must be a relative path");
    expect(calls).toHaveLength(0);
  });

  it("blocks proxy responses redirecting to metadata targets", async () => {
    const calls = stubFetchSequence([
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
    ]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com",
      auth: { type: "bearer" },
    });

    const result = await proxy({ method: "GET", endpoint: "/items" }, executionContext);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.message).toContain("redirect location");
    expect(calls).toHaveLength(1);
  });

  it("follows public proxy redirects", async () => {
    const calls = stubFetchSequence([
      new Response(null, { status: 302, headers: { location: "https://cdn.example.net/items" } }),
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }),
    ]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com",
      auth: { type: "bearer" },
    });

    const result = await proxy({ method: "GET", endpoint: "/items" }, executionContext);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.response.data).toEqual({ ok: true });
    expect(calls.map((call) => call.url)).toEqual(["https://api.example.com/items", "https://cdn.example.net/items"]);
  });

  it("gives executor contexts a fetcher that blocks redirects to loopback targets", async () => {
    const calls = stubFetchSequence([
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/admin" } }),
    ]);
    const executors = defineProviderExecutors<{ fetcher: typeof fetch }>({
      service: "test_service",
      handlers: {
        async probe(_input, context) {
          const response = await context.fetcher("https://api.example.com/resource");
          return { status: response.status };
        },
      },
      createContext: (_context, fetcher) => ({ fetcher }),
    });

    const result = await executors["test_service.probe"]!({}, executionContext);

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("redirect location");
    expect(calls).toHaveLength(1);
  });

  it("keeps caller manual-redirect handling intact through providerFetch", async () => {
    const calls = stubFetchSequence([new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } })]);

    const response = await providerFetch("https://api.example.com/report", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(calls).toHaveLength(1);
  });

  it("blocks private targets for executors that do not opt in", async () => {
    const calls = stubFetchSequence([new Response("{}", { status: 200 })]);
    const executors = defineProviderExecutors<{ fetcher: typeof fetch }>({
      service: "test_service",
      handlers: {
        async probe(_input, context) {
          return { status: (await context.fetcher("http://10.0.0.5:8123/api/")).status };
        },
      },
      createContext: (_context, fetcher) => ({ fetcher }),
    });
    setPrivateNetworkAccessAllowed(true);

    const result = await executors["test_service.probe"]!({}, executionContext);

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("must not target private or reserved IP addresses");
    expect(calls).toHaveLength(0);
  });

  it("reaches private targets for opted-in executors once the deployment enables the flag", async () => {
    const calls = stubFetchSequence([new Response("{}", { status: 200 })]);
    const executors = defineProviderExecutors<{ fetcher: typeof fetch }>({
      service: "test_service",
      handlers: {
        async probe(_input, context) {
          return { status: (await context.fetcher("http://10.0.0.5:8123/api/")).status };
        },
      },
      createContext: (_context, fetcher) => ({ fetcher }),
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    setPrivateNetworkAccessAllowed(true);

    const result = await executors["test_service.probe"]!({}, executionContext);

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.url)).toEqual(["http://10.0.0.5:8123/api/"]);
  });

  it("keeps the opt-in gated on the deployment flag and never unblocks loopback", async () => {
    const executors = defineProviderExecutors<{ fetcher: typeof fetch }>({
      service: "test_service",
      handlers: {
        async probe(_input, context) {
          return { status: (await context.fetcher(_input.url as string)).status };
        },
      },
      createContext: (_context, fetcher) => ({ fetcher }),
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });

    const calls = stubFetchSequence([]);
    const disabled = await executors["test_service.probe"]!({ url: "http://10.0.0.5:8123/api/" }, executionContext);
    setPrivateNetworkAccessAllowed(true);
    const loopback = await executors["test_service.probe"]!({ url: "http://127.0.0.1:8123/api/" }, executionContext);

    expect(disabled.ok).toBe(false);
    expect(loopback.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("defineProviderProxy request deadline", () => {
  function stubHangingFetch(): AbortSignal[] {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      if (signal) {
        signals.push(signal);
      }
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    return signals;
  }

  // Headers arrive immediately; the body never enqueues. Erroring the stream on
  // abort mirrors how fetch implementations propagate the request signal into
  // an in-flight body read.
  function stubStalledBodyFetch(): AbortSignal[] {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      if (signal) {
        signals.push(signal);
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(signal.reason));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    return signals;
  }

  const hangingProxy = defineProviderProxy({
    service: "test_service",
    baseUrl: "https://api.example.com",
    auth: { type: "bearer" },
    skipDnsValidation: true,
  });

  it("fails a never-answering upstream at the default 30 second budget instead of hanging", async () => {
    vi.useFakeTimers();
    try {
      const signals = stubHangingFetch();
      const pending = hangingProxy({ method: "GET", endpoint: "/items" }, executionContext);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(29_000);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1_500);
      expect(settled).toBe(true);
      expect(signals[0]?.aborted).toBe(true);
      await expect(pending).resolves.toEqual({
        ok: false,
        error: {
          code: "provider_error",
          message: "test_service request timed out",
          details: { status: 504, details: undefined },
        },
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the same budget to a response whose body stalls after headers arrive", async () => {
    vi.useFakeTimers();
    try {
      const signals = stubStalledBodyFetch();
      const pending = hangingProxy({ method: "GET", endpoint: "/items" }, executionContext);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(29_000);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1_500);
      expect(settled).toBe(true);
      expect(signals[0]?.aborted).toBe(true);
      await expect(pending).resolves.toEqual({
        ok: false,
        error: {
          code: "provider_error",
          message: "test_service request timed out",
          details: { status: 504, details: undefined },
        },
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // Deliberate divergence from runProviderRequest, which reports any abort as "<label> request timed out".
  it("maps a caller abort to internal_error rather than the timeout runProviderRequest would report", async () => {
    vi.useFakeTimers();
    try {
      const signals = stubHangingFetch();
      const controller = new AbortController();
      const pending = hangingProxy(
        { method: "GET", endpoint: "/items" },
        { ...executionContext, signal: controller.signal },
      );
      await vi.advanceTimersByTimeAsync(0);
      // The upstream request runs under the deadline's own signal, not the caller's.
      expect(signals).toHaveLength(1);
      expect(signals[0]).not.toBe(controller.signal);
      controller.abort();

      await expect(pending).resolves.toEqual({
        ok: false,
        error: {
          code: "internal_error",
          message: "provider request failed",
        },
      });
      expect(signals[0]?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the deadline timer once the request completes", async () => {
    vi.useFakeTimers();
    try {
      let answer: ((response: Response) => void) | undefined;
      vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => (answer = resolve)));
      const pending = hangingProxy({ method: "GET", endpoint: "/items" }, executionContext);
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);

      answer?.(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
      await expect(pending).resolves.toMatchObject({ ok: true });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("provider runtime fetch", () => {
  it("maps transport failures to provider errors without exposing the native message", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("getaddrinfo ENOTFOUND secret.internal");
    });
    const executors = defineProviderExecutors<{ fetcher: typeof fetch }>({
      service: "test_service",
      handlers: {
        async probe(_input, context) {
          await context.fetcher("https://api.example.com/resource");
          return {};
        },
      },
      createContext: (_context, fetcher) => ({ fetcher }),
    });

    const result = await executors["test_service.probe"]!({}, executionContext);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "provider_error",
        message: expect.stringContaining("provider network request failed"),
        details: { status: 502 },
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret.internal");
  });

  it("does not forward the provider context as the native fetch receiver", async () => {
    let nativeFetchThis: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(function (this: unknown) {
        nativeFetchThis = this;
        if (this !== undefined) {
          throw new TypeError("Illegal invocation: function called with incorrect `this` reference");
        }
        return Promise.resolve(Response.json({ ok: true }));
      }),
    );
    const executors = defineProviderExecutors<{ fetcher: typeof fetch }>({
      service: "receiver_test",
      handlers: {
        async request(_input, context) {
          const response = await context.fetcher("https://example.com/action");
          return response.json();
        },
      },
      createContext(_context, fetcher) {
        return { fetcher };
      },
    });
    const receiverContext: ExecutionContext = {
      async getCredential() {
        return undefined;
      },
    };

    await expect(executors["receiver_test.request"]!({}, receiverContext)).resolves.toEqual({
      ok: true,
      output: { ok: true },
    });
    expect(nativeFetchThis).toBeUndefined();
  });
});
