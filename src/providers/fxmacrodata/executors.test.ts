import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { fxmacrodataActions } from "./actions.ts";
import { executors, proxy } from "./executors.ts";

function contextWithKey(apiKey?: string): ExecutionContext {
  const credential: ResolvedCredential = apiKey
    ? {
        authType: "api_key",
        apiKey,
        values: { apiKey },
        profile: { accountId: "api_key", displayName: "FXMacroData API Key", grantedScopes: [] },
        metadata: {},
      }
    : { authType: "no_auth" };
  return { getCredential: async () => credential };
}

/** Upstream that echoes whatever key it was sent back in its error body. */
function echoingUpstream(): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const key = new Headers(init?.headers).get("x-api-key") ?? "none";
    return Response.json({ detail: `Key ${key} is not active.`, key }, { status: 403 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FXMacroData proxy", () => {
  it.each(["proxy-key-123", 'proxy-"quoted-key', "proxy-\\backslash-key"])(
    "removes key %j from an upstream error message and details",
    async (apiKey) => {
      echoingUpstream();

      const result = await proxy({ method: "GET", endpoint: "/v1/cot/eur" }, contextWithKey(apiKey));

      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(JSON.stringify(apiKey).slice(1, -1));
      expect(JSON.stringify(result)).toContain("Key [REDACTED] is not active.");
    },
  );

  it("keeps each concurrent request's key separate", async () => {
    const fetch = echoingUpstream();

    const results = await Promise.all([
      proxy({ method: "GET", endpoint: "/v1/cot/eur" }, contextWithKey("first-key-aaa")),
      proxy({ method: "GET", endpoint: "/v1/cot/gbp" }, contextWithKey("second-key-bbb")),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
    for (const result of results) {
      expect(JSON.stringify(result)).not.toMatch(/first-key-aaa|second-key-bbb/);
    }
  });

  it("sends no key header and leaves keyless errors unchanged", async () => {
    const fetch = echoingUpstream();

    const result = await proxy({ method: "GET", endpoint: "/v1/cot/eur" }, contextWithKey());

    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("x-api-key")).toBeNull();
    expect(JSON.stringify(result)).toContain("Key none is not active.");
  });
});

describe("FXMacroData history actions", () => {
  const cases = [
    {
      name: "get_announcements",
      input: { currency: "usd", indicator: "inflation" },
      executor: executors["fxmacrodata.get_announcements"],
    },
    { name: "get_forex", input: { base: "eur", quote: "usd" }, executor: executors["fxmacrodata.get_forex"] },
    { name: "get_cot", input: { currency: "eur" }, executor: executors["fxmacrodata.get_cot"] },
  ];

  it.each(cases)(
    "accepts the upstream limit and rejects oversized requests for $name",
    async ({ name, input, executor }) => {
      const fetch = vi.fn(async () => Response.json({ data: [] }));
      vi.stubGlobal("fetch", fetch);
      const action = fxmacrodataActions.find((action) => action.name === name)!;

      const accepted = await executeAction(action, executor, { ...input, limit: 100 }, contextWithKey());
      expect(accepted.ok).toBe(true);

      const rejected = await executeAction(action, executor, { ...input, limit: 101 }, contextWithKey());
      expect(rejected).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each(cases)("reads the next page returned by $name", async ({ name, input, executor }) => {
    const offsets: number[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset"));
      offsets.push(offset);
      return Response.json({
        data: [{ date: offset === 0 ? "2026-09-30" : "2026-08-31" }],
        pagination: {
          limit: 1,
          offset,
          returned_count: 1,
          total_count: 2,
          has_more: offset === 0,
          next_offset: offset === 0 ? 1 : null,
        },
      });
    });
    const action = fxmacrodataActions.find((action) => action.name === name)!;

    const first = await executeAction(action, executor, { ...input, limit: 1 }, contextWithKey());
    expect(first).toMatchObject({ ok: true, output: { pagination: { has_more: true, next_offset: 1 } } });
    const offset = (first.output as { pagination: { next_offset: number } }).pagination.next_offset;
    const second = await executeAction(action, executor, { ...input, limit: 1, offset }, contextWithKey());

    expect(second).toMatchObject({
      ok: true,
      output: { data: [{ date: "2026-08-31" }], pagination: { has_more: false, next_offset: null } },
    });
    expect(offsets).toEqual([0, 1]);
  });
});
