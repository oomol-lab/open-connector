import type { ExecutionContext } from "../core/types.ts";

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../core/guarded-fetch.ts";
import { executors as smartHrExecutors, proxy as smartHrProxy } from "./smarthr/executors.ts";
import { proxy as threatfoxProxy } from "./threatfox/executors.ts";
import { proxy as urlhausProxy } from "./urlhaus/executors.ts";

const context: ExecutionContext = {
  getCredential: async () => ({
    authType: "api_key",
    apiKey: "test-token",
    values: { subdomain: "acme", environment: "sandbox" },
    metadata: {},
    profile: { accountId: "test", displayName: "Test", grantedScopes: [] },
  }),
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setDefaultGuardedFetchDnsLookup(null);
});

test("SmartHR proxy uses credential tenant routing and bearer authentication", async () => {
  const fetcher = vi.fn(async () => Response.json({ id: "company" }));
  vi.stubGlobal("fetch", fetcher);
  const result = await smartHrProxy({ method: "GET", endpoint: "/v1/companies" }, context);
  expect(result.ok).toBe(true);
  const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(String(url)).toBe("https://acme.daruma.space/api/v1/companies");
  expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-token");
  const foreign = await smartHrProxy({ method: "GET", endpoint: "https://other.smarthr.jp/api/v1/companies" }, context);
  expect(foreign.ok).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("SmartHR attachment downloads omit tenant credentials and encode the bounded result", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return String(url).includes("files.example.com") ? new Response("photo") : Response.json({ id: "employee" });
    }),
  );
  const result = await smartHrExecutors["smarthr.create_employee"](
    {
      employee: {
        last_name: "Example",
        first_name: "Test",
        profile_image: { fileName: "photo.png", fileUrl: "https://files.example.com/photo.png" },
      },
    },
    context,
  );
  expect(result).toMatchObject({ ok: true, output: { employee: { id: "employee" } } });
  expect(new Headers(calls[0]?.init?.headers).has("authorization")).toBe(false);
  expect(JSON.parse(String(calls[1]?.init?.body)).profile_image).toEqual({
    file_name: "photo.png",
    content: "cGhvdG8=",
  });
});

test("SmartHR rejects a loopback attachment before fetching or writing employee data", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const result = await smartHrExecutors["smarthr.create_employee"](
    {
      employee: {
        profile_image: { fileName: "photo.png", fileUrl: "http://127.0.0.1/photo.png" },
      },
    },
    context,
  );
  expect(result.ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

test("SmartHR rejects attachment bodies above 10 MiB before sending employee data", async () => {
  const fetcher = vi.fn(async () => new Response("x", { headers: { "content-length": String(10 * 1024 * 1024 + 1) } }));
  vi.stubGlobal("fetch", fetcher);
  const result = await smartHrExecutors["smarthr.create_employee"](
    {
      employee: {
        profile_image: { fileName: "photo.png", fileUrl: "https://files.example.com/photo.png" },
      },
    },
    context,
  );
  expect(result.ok).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each([401, 403])(
  "proxy status %i alone does not mark security-provider or SmartHR credentials invalid",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "denied" }, { status })),
    );
    for (const proxy of [smartHrProxy, threatfoxProxy, urlhausProxy]) {
      const result = await proxy({ method: "GET", endpoint: "/" }, context);
      expect(result).toMatchObject({ ok: false, error: { code: "provider_error" } });
    }
  },
);

test("SmartHR explicit invalid-token code requests credential recovery", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ code: 2, type: "unauthorized_token" }, { status: 401 })),
  );
  const result = await smartHrProxy({ method: "GET", endpoint: "/v1/companies" }, context);
  expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
});
