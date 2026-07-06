import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ossinsight proxy", () => {
  it("proxies GET requests to the OSSInsight API base URL", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ data: { rows: [] } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "oss_1",
          },
        }),
    );
    vi.stubGlobal("fetch", fetcher);

    const result = await proxy(
      {
        endpoint: "/collections/",
        method: "GET",
        query: { period: "past_24_hours", ignored: { nested: true } },
        headers: { accept: "application/json" },
      },
      createContext(),
    );

    expect(result).toEqual({
      ok: true,
      response: {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "oss_1",
        },
        data: { data: { rows: [] } },
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.ossinsight.io/v1/collections/?period=past_24_hours"),
      expect.objectContaining({
        method: "GET",
        signal: undefined,
      }),
    );
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(Object.fromEntries((init.headers as Headers).entries())).toMatchObject({
      accept: "application/json",
      "user-agent": "oomol-connect/0.1",
    });
  });

  it("rejects non-GET proxy methods", async () => {
    const result = await proxy(
      {
        endpoint: "/collections/",
        method: "POST",
        body: { unsafe: true },
      },
      createContext(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "OSSInsight proxy only supports GET requests.",
      },
    });
  });

  it("maps upstream errors through provider proxy errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 })),
    );

    const result = await proxy(
      {
        endpoint: "/collections/",
        method: "GET",
      },
      createContext(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "rate_limited",
      },
    });
  });
});

function createContext(): ExecutionContext {
  return {
    getCredential: async () => ({ authType: "no_auth" }),
  };
}
