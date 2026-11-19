import type { CloudflareContext } from "./shared/context.ts";

import { expect, it, vi } from "vitest";
import { handlers as emailHandlers } from "./email-routing/runtime.ts";
import { handlers as kvHandlers } from "./kv/runtime.ts";
import { requestCloudflareAccounts } from "./shared/accounts.ts";
import { cloudflareResponseError } from "./shared/errors.ts";

function context(fetcher: typeof fetch): CloudflareContext {
  return {
    authType: "api_key",
    accessToken: "token",
    authHeaders: { authorization: "Bearer token" },
    accountId: "account",
    metadata: {},
    fetcher,
  };
}

it.each(["get_kv_value", "put_kv_value", "delete_kv_value"])("preserves whitespace in %s keys", async (action) => {
  let requested = "";
  const fetcher: typeof fetch = async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ success: true, result: {} }));
  };
  await kvHandlers[action]!({ namespaceId: "namespace", key: " a ", value: "content" }, context(fetcher));
  expect(new URL(requested).pathname).toBe(
    "/client/v4/accounts/account/storage/kv/namespaces/namespace/values/%20a%20",
  );
});

it("preserves an exact KV prefix", async () => {
  let requested = "";
  const fetcher: typeof fetch = async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ success: true, result: [] }));
  };
  await kvHandlers.list_kv_keys!({ namespaceId: "namespace", prefix: " " }, context(fetcher));
  expect(new URL(requested).searchParams.get("prefix")).toBe(" ");
});

it("rejects a blank routing zone without discovering an account", async () => {
  const fetcher = vi.fn();
  await expect(emailHandlers.list_routing_rules!({ zoneId: " " }, context(fetcher))).rejects.toMatchObject({
    status: 400,
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it("retains Retry-After on rate limits", () => {
  const error = cloudflareResponseError(
    new Response(null, { status: 429, headers: { "Retry-After": "60" } }),
    {},
    "execute",
  );
  expect(error).toMatchObject({ status: 429, details: { retryAfterSeconds: 60 } });
});

it("bounds account discovery through response body consumption", async () => {
  vi.useFakeTimers();
  try {
    const fetcher: typeof fetch = async (_url, init) => {
      const response = new Response();
      response.text = () =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        });
      return response;
    };
    const assertion = expect(
      requestCloudflareAccounts({ authorization: "Bearer token" }, fetcher, undefined),
    ).rejects.toMatchObject({
      status: 504,
    });
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});

it.each([false, true])("keeps Pages cache updates optional while preserving cancellation (%s)", async (cancel) => {
  const { zipSync } = await import("fflate");
  const { CloudflareClient } = await import("./shared/action-client.ts");
  const { deployPagesSite } = await import("./pages/upload.ts");
  const archive = zipSync({ "index.html": new TextEncoder().encode("hello") });
  const controller = new AbortController();
  let deployed = false;
  const failure = new Error("cache unavailable");
  const fetcher: typeof fetch = async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    const headers = new Headers(init?.headers);
    if (pathname === "/site.zip") {
      expect(headers.has("x-auth-key")).toBe(false);
      expect(headers.has("authorization")).toBe(false);
      return new Response(archive);
    }
    if (pathname.includes("/pages/assets/")) {
      expect(headers.get("authorization")).toBe("Bearer jwt");
      expect(headers.has("x-auth-key")).toBe(false);
    } else {
      expect(headers.get("x-auth-key")).toBe("global-key");
      expect(headers.get("x-auth-email")).toBe("owner@example.com");
      expect(headers.has("authorization")).toBe(false);
    }
    if (pathname.endsWith("/upsert-hashes")) {
      if (cancel) controller.abort(failure);
      throw failure;
    }
    let result: unknown = {};
    if (pathname.endsWith("/upload-token")) result = { jwt: "jwt" };
    if (pathname.endsWith("/check-missing")) result = [];
    if (pathname.endsWith("/deployments")) {
      deployed = true;
      result = { id: "deployment", url: "https://site.pages.dev" };
    }
    return new Response(JSON.stringify({ success: true, result }));
  };
  const client = new CloudflareClient(
    { accountId: "account", projectName: "site", archiveUrl: "https://example.com/site.zip" },
    { "x-auth-key": "global-key", "x-auth-email": "owner@example.com" },
    fetcher,
    controller.signal,
  );
  if (cancel) await expect(deployPagesSite(client)).rejects.toBe(failure);
  else await expect(deployPagesSite(client)).resolves.toMatchObject({ deploymentId: "deployment" });
  expect(deployed).toBe(!cancel);
});
