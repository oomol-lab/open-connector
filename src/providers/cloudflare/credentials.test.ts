import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, expect, it, vi } from "vitest";
import { credentialValidators, executors, proxy } from "./executors.ts";

const values = { apiKey: "global-key", email: "owner@example.com", accountId: "account", zoneId: "zone" };
const credential: ResolvedCredential = {
  authType: "custom_credential",
  values,
  metadata: {},
  profile: { accountId: "user", displayName: "Owner", grantedScopes: [] },
};
const context: ExecutionContext = { getCredential: async () => credential };
afterEach(() => vi.unstubAllGlobals());

it("validates Global API Key credentials through /user with email and no Bearer header", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    expect(String(url)).toBe("https://api.cloudflare.com/client/v4/user");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-auth-key")).toBe(values.apiKey);
    expect(headers.get("x-auth-email")).toBe(values.email);
    expect(headers.has("authorization")).toBe(false);
    return Response.json({ success: true, result: { id: "user", email: values.email } });
  };
  await expect(credentialValidators.customCredential!({ values }, { fetcher })).resolves.toMatchObject({
    profile: { accountId: "user" },
  });
});

it("keeps cfut User API Tokens usable without an email in the custom credential form", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    expect(String(url)).toContain("/user/tokens/verify");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer cfut_token");
    expect(headers.has("x-auth-key")).toBe(false);
    return Response.json({ success: true, result: { id: "token", status: "active" } });
  };
  await expect(
    credentialValidators.customCredential!({ values: { apiKey: "cfut_token" } }, { fetcher }),
  ).resolves.toMatchObject({ profile: { accountId: "token" } });
});

it.each([
  { action: "list_routing_rules", input: {}, path: "/zones/zone/email/routing/rules", result: [] },
  {
    action: "list_routing_rules",
    input: { accountId: "other" },
    path: "/accounts/other/email/routing/rules",
    result: [],
  },
  { action: "list_routing_rules", input: { zoneId: "other" }, path: "/zones/other/email/routing/rules", result: [] },
  {
    action: "create_routing_rule",
    input: { actions: [{ type: "drop" }], matchers: [{ type: "all" }] },
    path: "/zones/zone/email/routing/rules",
    result: { id: "rule" },
  },
  {
    action: "delete_routing_rule",
    input: { ruleId: "rule" },
    path: "/zones/zone/email/routing/rules/rule",
    result: {},
  },
  { action: "list_destination_addresses", input: {}, path: "/accounts/account/email/routing/addresses", result: [] },
])(
  "preserves default scopes and Global API Key headers for $action at $path",
  async ({ action, input, path, result }) => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(String(url)).pathname).toBe(`/client/v4${path}`);
      const headers = new Headers(init?.headers);
      expect(headers.get("x-auth-key")).toBe(values.apiKey);
      expect(headers.get("x-auth-email")).toBe(values.email);
      expect(headers.has("authorization")).toBe(false);
      return Response.json({ success: true, result });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(executors[`cloudflare.${action}`]!(input, context)).resolves.toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("uses Global API Key headers in proxy requests and removes caller auth headers", async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    expect(headers.get("x-auth-key")).toBe(values.apiKey);
    expect(headers.get("x-auth-email")).toBe(values.email);
    expect(headers.has("authorization")).toBe(false);
    return Response.json({ success: true, result: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    proxy(
      {
        method: "GET",
        endpoint: "/zones/zone/email/routing/rules",
        headers: { "x-auth-key": "untrusted", "authorization": "Bearer untrusted" },
      },
      context,
    ),
  ).resolves.toMatchObject({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(["api_key", "oauth2"] as const)("preserves Bearer proxy authentication for %s", async (authType) => {
  const bearer: ResolvedCredential =
    authType === "api_key"
      ? {
          authType,
          apiKey: "api-token",
          values: {},
          metadata: {},
          profile: { accountId: "user", displayName: "User", grantedScopes: [] },
        }
      : {
          authType,
          accessToken: "oauth-token",
          tokenType: "Bearer",
          metadata: {},
          profile: { accountId: "user", displayName: "User", grantedScopes: [] },
        };
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(authType === "api_key" ? "Bearer api-token" : "Bearer oauth-token");
    expect(headers.has("x-auth-key")).toBe(false);
    expect(headers.has("x-auth-email")).toBe(false);
    return Response.json({ success: true, result: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    proxy(
      { method: "GET", endpoint: "/zones", headers: { "x-auth-email": "untrusted", "x-auth-key": "untrusted" } },
      { getCredential: async () => bearer },
    ),
  ).resolves.toMatchObject({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects a Global API Key without email before making a request", async () => {
  const fetcher = vi.fn();
  await expect(
    credentialValidators.customCredential!({ values: { apiKey: "global-key" } }, { fetcher }),
  ).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  { action: "list_accounts", input: {} },
  { action: "list_zones", input: {} },
  { action: "list_workers", input: {} },
  { action: "list_buckets", input: {} },
  { action: "list_kv_keys", input: { namespaceId: "namespace" } },
  { action: "list_pages_projects", input: {} },
  { action: "get_markdown", input: { url: "https://example.com" } },
])(
  "sends Global API Key authentication for $action and preserves upstream rejection details",
  async ({ action, input }) => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-auth-key")).toBe(values.apiKey);
      expect(headers.get("x-auth-email")).toBe(values.email);
      expect(headers.has("authorization")).toBe(false);
      return Response.json(
        { success: false, errors: [{ code: 10000, message: "Permission denied for this resource" }] },
        { status: 403 },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await executors[`cloudflare.${action}`]!(input, context);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "provider_error",
        message: "10000: Permission denied for this resource",
        details: { status: 403 },
      },
    });
  },
);

it("validates account API tokens from the custom credential form without an Email Routing gate", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    expect(String(url)).toBe("https://api.cloudflare.com/client/v4/accounts/account/tokens/verify");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer cfat_token");
    return Response.json({ success: true, result: { id: "token", status: "active" } });
  };
  await expect(
    credentialValidators.customCredential!({ values: { apiKey: "cfat_token", accountId: "account" } }, { fetcher }),
  ).resolves.toMatchObject({ profile: { accountId: "token" } });
});

it("can derive R2 signatures from a user token regardless of the credential form", async () => {
  const token: ResolvedCredential = {
    ...credential,
    values: { ...values, apiKey: "cfut_token" },
    metadata: { tokenId: "token-id" },
  };
  await expect(
    executors["cloudflare.generate_presigned_url"]!(
      { bucketName: "bucket", objectKey: "file.txt", method: "GET" },
      { getCredential: async () => token },
    ),
  ).resolves.toMatchObject({ ok: true });
});
