import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeRuntimeActionResult } from "../../server/api/runtime-api.ts";
import { executors, gmailActionHandlers, proxy } from "./executors.ts";

afterEach(() => vi.unstubAllGlobals());

const credentialContext: ExecutionContext = {
  getCredential: async () => ({
    authType: "oauth2",
    accessToken: "secret-token",
    tokenType: "Bearer",
    metadata: {},
    profile: { accountId: "me", displayName: "Test", grantedScopes: [] },
  }),
};

describe.each(["action", "proxy"])("Gmail %s errors", (path) => {
  it.each([
    { status: 403, reason: "rateLimitExceeded", code: "rate_limited" },
    { status: 403, reason: "userRateLimitExceeded", code: "rate_limited" },
    { status: 403, reason: "dailyLimitExceeded", code: "rate_limited" },
    { status: 403, reason: "quotaExceeded", code: "rate_limited" },
    { status: 403, reason: "domainPolicy", code: "authorization_failed" },
    { status: 403, reason: "insufficientPermissions", code: "authorization_failed" },
    { status: 401, reason: "authError", code: "authorization_failed" },
    { status: 401, reason: "rateLimitExceeded", code: "authorization_failed" },
    { status: 429, reason: "userRateLimitExceeded", code: "rate_limited" },
    { status: 503, reason: "backendError", code: "provider_error" },
  ])("classifies HTTP $status / $reason", async ({ status, reason, code }) => {
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { error: { code: 999, message: "Request rejected", errors: [{ reason }], credentials: "secret-token" } },
        { status },
      ),
    );
    const result =
      path === "action"
        ? await executors["gmail.get_profile"]!({}, credentialContext)
        : await proxy({ method: "GET", endpoint: "/users/me/profile" }, credentialContext);
    expect(result).toMatchObject({
      ok: false,
      error: { code, details: { status } },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it.each([
    "secret raw error body",
    "null",
    JSON.stringify({ error: "secret raw string" }),
    JSON.stringify({ error: { errors: [{ reason: "secret-unrecognized-reason" }] } }),
    JSON.stringify({ error: { message: "rateLimitExceeded appears only in prose", errors: [] } }),
    "x".repeat(65 * 1024),
  ])("does not infer quotas from malformed or unrecognized payloads %#", async (body) => {
    vi.stubGlobal("fetch", async () => new Response(body, { status: 403 }));
    const result =
      path === "action"
        ? await executors["gmail.get_profile"]!({}, credentialContext)
        : await proxy({ method: "GET", endpoint: "/users/me/profile" }, credentialContext);
    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed", details: { status: 403 } } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("Gmail quota failures on the runtime action route", () => {
  it("answers HTTP 429 while data.status keeps the upstream 403", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { error: { code: 403, message: "User-rate limit exceeded.", errors: [{ reason: "userRateLimitExceeded" }] } },
        { status: 403 },
      ),
    );
    const result = await executors["gmail.get_profile"]!({}, credentialContext);
    expect(
      serializeRuntimeActionResult({
        actionId: "gmail.get_profile",
        executionId: "execution-1",
        auditPersisted: false,
        result,
      }),
    ).toMatchObject({
      status: 429,
      body: { success: false, errorCode: "rate_limited", message: "User-rate limit exceeded.", data: { status: 403 } },
    });
  });
});

describe.each(["action", "proxy"])("Gmail %s rate limit details", (path) => {
  it("preserves Retry-After through the action error envelope", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { error: { code: 429, message: "Too many requests", errors: [{ reason: "rateLimitExceeded" }] } },
        { status: 429, headers: { "Retry-After": "73" } },
      ),
    );
    const result =
      path === "action"
        ? await executors["gmail.get_profile"]!({}, credentialContext)
        : await proxy({ method: "GET", endpoint: "/users/me/profile" }, credentialContext);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429, details: { retryAfterSeconds: 73 } } },
    });
  });
});

function actionContext(fetcher: typeof fetch) {
  return {
    userId: "me",
    accessToken: "gmail-token",
    fetcher,
  };
}

describe("Gmail list actions", () => {
  it("returns an empty filter list for a successful empty response", async () => {
    await expect(
      gmailActionHandlers.list_filters(
        {},
        actionContext(async () => new Response(null, { status: 200 })),
      ),
    ).resolves.toEqual({ filters: [] });
  });

  it("returns an empty forwarding-address list for a successful empty response", async () => {
    await expect(
      gmailActionHandlers.list_forwarding_addresses(
        {},
        actionContext(async () => new Response(null, { status: 200 })),
      ),
    ).resolves.toEqual({ forwardingAddresses: [] });
  });

  it("maps a malformed successful response to a provider response error", async () => {
    await expect(
      gmailActionHandlers.list_filters(
        {},
        actionContext(async () => new Response("not-json", { status: 200 })),
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: "gmail filters list response must be valid JSON",
    });
  });
});
