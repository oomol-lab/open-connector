import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy, resolveBrowserUseProxyTarget } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "browser-use-key",
  values: {},
  profile: { accountId: "browser-use:test", displayName: "Browser Use test", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Browser Use proxy API routing", () => {
  it.each([
    ["GET", "/browsers"],
    ["POST", "/browsers"],
    ["GET", "/browsers/browser-id"],
    ["PATCH", "/browsers/browser-id"],
    ["GET", "/browsers/browser-id/downloads"],
    ["GET", "/profiles"],
    ["POST", "/profiles"],
    ["GET", "/profiles/profile-id"],
    ["PATCH", "/profiles/profile-id"],
    ["DELETE", "/profiles/profile-id"],
    ["POST", "/workspaces"],
    ["GET", "/workspaces/workspace-id"],
    ["PATCH", "/workspaces/workspace-id"],
    ["DELETE", "/workspaces/workspace-id"],
    ["GET", "/workspaces/workspace-id/size"],
    ["GET", "/workspaces/workspace-id/files"],
    ["DELETE", "/workspaces/workspace-id/files"],
    ["POST", "/workspaces/workspace-id/files/upload"],
  ])("routes %s %s through V4", (method, endpoint) => {
    expect(resolveBrowserUseProxyTarget(method, endpoint)).toEqual({ apiVersion: "v4", endpoint });
  });

  it.each([
    ["GET", "/sessions"],
    ["POST", "/sessions"],
    ["GET", "/sessions/session-id"],
    ["GET", "/sessions/session-id/messages"],
    ["POST", "/sessions/session-id/stop"],
    ["GET", "/billing/account"],
    ["GET", "/workspaces"],
    ["POST", "/x402/balance"],
    ["DELETE", "/browsers"],
  ])("keeps %s %s on V3", (method, endpoint) => {
    expect(resolveBrowserUseProxyTarget(method, endpoint)).toEqual({ apiVersion: "v3", endpoint });
  });

  it("honors explicit version prefixes and preserves inline query strings", () => {
    expect(resolveBrowserUseProxyTarget("POST", "/api/v3/browsers?legacy=true")).toEqual({
      apiVersion: "v3",
      endpoint: "/browsers?legacy=true",
    });
    expect(resolveBrowserUseProxyTarget("GET", "/api/v4/sessions?status=active")).toEqual({
      apiVersion: "v4",
      endpoint: "/sessions?status=active",
    });
  });

  it("sends routed requests to the selected upstream API version", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);

    await expect(proxy({ method: "POST", endpoint: "/browsers", body: {} }, context)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      proxy({ method: "POST", endpoint: "/sessions", body: { task: "test" } }, context),
    ).resolves.toMatchObject({ ok: true });
    await expect(proxy({ method: "GET", endpoint: "/api/v3/browsers" }, context)).resolves.toMatchObject({
      ok: true,
    });

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.browser-use.com/api/v4/browsers",
      "https://api.browser-use.com/api/v3/sessions",
      "https://api.browser-use.com/api/v3/browsers",
    ]);
  });
});
