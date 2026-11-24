import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors, proxy } from "./executors.ts";

const demoApiUrl = "https://demo.trading212.com/api/v0";
const liveApiUrl = "https://live.trading212.com/api/v0";
const basicKeyPair = `Basic ${Buffer.from("test-key:test-secret").toString("base64")}`;

interface CapturedRequest {
  method: string;
  url: string;
  authorization: string | null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Trading 212 actions", () => {
  it("reads the chosen environment with the key pair and follows nextPagePath on its own", async () => {
    const nextPagePath = "/api/v0/equity/history/orders?limit=2&ticker=AAPL_US_EQ&cursor=1760346100000";
    const requests = stubResponses([
      Response.json({ id: 1001, currency: "GBP", totalValue: 250.5 }),
      Response.json({ items: [{ order: { id: 11 } }, { order: { id: 10 } }], nextPagePath }),
      Response.json({ items: [{ order: { id: 9 } }], nextPagePath: null }),
    ]);

    const account = await executors["trading_212.get_account_summary"]!({}, contextWithKey("demo"));
    const firstPage = await executors["trading_212.list_historical_orders"]!(
      { ticker: "AAPL_US_EQ", limit: 2 },
      contextWithKey("demo"),
    );
    const lastPage = await executors["trading_212.list_historical_orders"]!({ nextPagePath }, contextWithKey("demo"));

    expect(account).toMatchObject({ ok: true, output: { account: { id: 1001, currency: "GBP" } } });
    expect(firstPage).toMatchObject({
      ok: true,
      output: { orders: [{ order: { id: 11 } }, { order: { id: 10 } }], nextPagePath },
    });
    expect(lastPage).toMatchObject({ ok: true, output: { orders: [{ order: { id: 9 } }], nextPagePath: null } });
    expect(requests).toEqual([
      { method: "GET", url: `${demoApiUrl}/equity/account/summary`, authorization: basicKeyPair },
      {
        method: "GET",
        url: `${demoApiUrl}/equity/history/orders?ticker=AAPL_US_EQ&limit=2`,
        authorization: basicKeyPair,
      },
      { method: "GET", url: `https://demo.trading212.com${nextPagePath}`, authorization: basicKeyPair },
    ]);
  });

  it("refuses a nextPagePath for another endpoint or host, or sent with filters, without calling Trading 212", async () => {
    const requests = stubResponses([]);
    const ownPath = "/api/v0/equity/history/dividends?limit=20&cursor=1";

    const results = await Promise.all([
      executors["trading_212.list_dividends"]!({ nextPagePath: "/api/v0/equity/orders" }, contextWithKey("demo")),
      executors["trading_212.list_dividends"]!(
        { nextPagePath: "https://example.com/api/v0/equity/history/dividends?cursor=1" },
        contextWithKey("demo"),
      ),
      executors["trading_212.list_dividends"]!(
        { nextPagePath: "/api/v0/equity/history/dividends/../../orders?cursor=1" },
        contextWithKey("demo"),
      ),
      executors["trading_212.list_dividends"]!({ nextPagePath: ownPath, ticker: "AAPL_US_EQ" }, contextWithKey("demo")),
    ]);

    expect(results.map((result) => result.error?.message)).toEqual([
      "nextPagePath must be the nextPagePath this action returned.",
      "nextPagePath must be the nextPagePath this action returned.",
      "nextPagePath must be the nextPagePath this action returned.",
      "nextPagePath already carries the filters and the limit of its page; send it on its own.",
    ]);
    expect(results.every((result) => result.error?.code === "invalid_input")).toBe(true);
    expect(requests).toEqual([]);
  });

  it("puts exact ticker, symbol or ISIN matches of the instrument list first and counts every match", async () => {
    stubResponses([
      Response.json([
        { ticker: "APLE_US_EQ", shortName: "APLE", name: "Apple Hospitality REIT", type: "STOCK", currencyCode: "USD" },
        { ticker: "AAPL_US_EQ", shortName: "AAPL", name: "Apple Inc", type: "STOCK", currencyCode: "USD" },
        { ticker: "APPL_ETF_EQ", shortName: "APPL", name: "Applied Example ETF", type: "ETF", currencyCode: "EUR" },
        { ticker: "MSFT_US_EQ", shortName: "MSFT", name: "Microsoft", type: "STOCK", currencyCode: "USD" },
      ]),
      Response.json([
        { ticker: "APLE_US_EQ", shortName: "APLE", name: "Apple Hospitality REIT", type: "STOCK", currencyCode: "USD" },
        { ticker: "AAPL_US_EQ", shortName: "AAPL", name: "Apple Inc", type: "STOCK", currencyCode: "USD" },
        { ticker: "APPL_ETF_EQ", shortName: "APPL", name: "Applied Example ETF", type: "ETF", currencyCode: "EUR" },
      ]),
    ]);

    const bySymbol = await executors["trading_212.search_instruments"]!(
      { query: "aapl", limit: 5 },
      contextWithKey("demo"),
    );
    const byName = await executors["trading_212.search_instruments"]!(
      { query: "apple", type: "STOCK", currency: "usd", limit: 1 },
      contextWithKey("demo"),
    );

    expect(bySymbol).toMatchObject({ ok: true, output: { instruments: [{ ticker: "AAPL_US_EQ" }], totalMatches: 1 } });
    expect(byName).toMatchObject({ ok: true, output: { instruments: [{ ticker: "APLE_US_EQ" }], totalMatches: 2 } });
  });

  it("asks to reconnect only for a rejected key and keeps the rate limit pacing hint", async () => {
    stubResponses([
      new Response("Bad API key", { status: 401 }),
      new Response("Scope( portfolio ) missing for API key", { status: 403 }),
      new Response("Timed-out", { status: 408 }),
      new Response("Limited: 1 / 5s", { status: 429, headers: { "retry-after": "5" } }),
    ]);

    const rejectedKey = await executors["trading_212.list_pending_orders"]!({}, contextWithKey("live"));
    const missingPermission = await executors["trading_212.list_positions"]!({}, contextWithKey("live"));
    const timedOut = await executors["trading_212.list_exchanges"]!({}, contextWithKey("live"));
    const limited = await executors["trading_212.get_account_summary"]!({}, contextWithKey("live"));

    expect(rejectedKey).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
    expect(missingPermission).toMatchObject({
      ok: false,
      error: { code: "provider_error", details: { status: 403, details: "Scope( portfolio ) missing for API key" } },
    });
    expect(timedOut).toMatchObject({ ok: false, error: { code: "provider_error", details: { status: 504 } } });
    expect(limited).toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429, details: { retryAfterSeconds: 5 } } },
    });
  });

  it.each([
    ["1760000050", undefined, 50],
    ["1759999999", undefined, 0],
    ["1760000050", "5", 5],
    ["1760000050", "invalid", 50],
    ["invalid", undefined, undefined],
    ["", undefined, undefined],
    ["1760000050.5", undefined, undefined],
    ["-1", undefined, undefined],
    ["9007199254740992", undefined, undefined],
  ])("reads quota reset %s with retry header %s", async (reset, retryAfter, expected) => {
    vi.spyOn(Date, "now").mockReturnValue(1760000000250);
    const headers = new Headers({ "x-ratelimit-reset": reset });
    if (retryAfter !== undefined) {
      headers.set("Retry-After", retryAfter);
    }
    stubResponses([Response.json({ message: "Limited" }, { status: 429, headers })]);
    const result = await executors["trading_212.get_account_summary"]!({}, contextWithKey("live"));
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "rate_limited",
        details: {
          status: 429,
          details: { message: "Limited" },
        },
      },
    });
    expect(result.error?.details).toEqual({
      status: 429,
      details: { message: "Limited", retryAfterSeconds: expected },
    });
  });

  it("reports an empty or non-list body as a provider error instead of an empty account", async () => {
    stubResponses([
      new Response("", { status: 200 }),
      Response.json({ items: [] }),
      Response.json(null),
      Response.json({ exchanges: [] }),
    ]);

    const results = [
      await executors["trading_212.list_positions"]!({}, contextWithKey("demo")),
      await executors["trading_212.list_pending_orders"]!({}, contextWithKey("demo")),
      await executors["trading_212.search_instruments"]!({ query: "AAPL" }, contextWithKey("demo")),
      await executors["trading_212.list_exchanges"]!({}, contextWithKey("demo")),
    ];

    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: "provider_error", details: { status: 502 } } });
    }
  });
});

describe("Trading 212 proxy", () => {
  it.each([301, 302, 303, 307, 308])("does not follow HTTP %i to an unchecked path", async (status) => {
    const requests = stubResponses([
      new Response("redirect body must not be exposed", {
        status,
        headers: { location: `${liveApiUrl}/equity/history/exports` },
      }),
      Response.json([]),
    ]);

    const result = await proxy({ method: "GET", endpoint: "/api/v0/equity/account/summary" }, contextWithKey("live"));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_error", message: `provider request failed with HTTP ${status}` },
    });
    expect(requests).toEqual([
      { method: "GET", url: `${liveApiUrl}/equity/account/summary`, authorization: basicKeyPair },
    ]);
  });

  it("sends only GET requests for the read paths of the chosen environment", async () => {
    const requests = stubResponses([Response.json([]), Response.json({ items: [], nextPagePath: null })]);

    const pies = await proxy({ method: "GET", endpoint: "/api/v0/equity/pies" }, contextWithKey("live"));
    const history = await proxy(
      { method: "GET", endpoint: "/api/v0/equity/history/orders?limit=1" },
      contextWithKey("live"),
    );
    const writes = await Promise.all(
      ["POST", "post", "PUT", "PATCH", "DELETE", "HEAD"].map((method) =>
        proxy(
          { method, endpoint: "/api/v0/equity/orders/market", body: { ticker: "AAPL_US_EQ", quantity: 1 } },
          contextWithKey("live"),
        ),
      ),
    );
    const notRead = await Promise.all(
      [
        "/api/v0/equity/history/exports",
        "/api/v0/equity/history/exports?limit=1",
        "/api/v0/equity/history/exports#x",
        "/api/v0/equity/history/%65xports",
        "/api/v0/other",
        "/legal",
      ].map((endpoint) => proxy({ method: "GET", endpoint }, contextWithKey("live"))),
    );

    expect([pies, history]).toMatchObject([{ ok: true }, { ok: true }]);
    for (const refused of writes) {
      expect(refused).toMatchObject({
        ok: false,
        error: { code: "invalid_input", message: "Trading 212 proxy only supports GET requests." },
      });
    }
    for (const refused of notRead) {
      expect(refused).toMatchObject({
        ok: false,
        error: { code: "invalid_input", message: "endpoint is not supported for this provider" },
      });
    }
    expect(requests).toEqual([
      { method: "GET", url: `${liveApiUrl}/equity/pies`, authorization: basicKeyPair },
      { method: "GET", url: `${liveApiUrl}/equity/history/orders?limit=1`, authorization: basicKeyPair },
    ]);
  });
});

describe("Trading 212 credential validation", () => {
  it("names the account and reports a rejected key or an unknown environment as a form error", async () => {
    const requests = stubResponses([
      Response.json({ id: 1001, currency: "GBP" }),
      new Response("Bad API key", { status: 401 }),
    ]);
    const options = { fetcher: fetch };

    const valid = await credentialValidators.apiKey!(keyInput("demo"), options);
    const rejected = credentialValidators.apiKey!(keyInput("live"), options);
    const unknownEnvironment = credentialValidators.apiKey!(keyInput("paper"), options);

    expect(valid).toEqual({ profile: { accountId: "demo:1001", displayName: "Trading 212 Demo account 1001" } });
    await expect(rejected).rejects.toMatchObject({ status: 400 });
    await expect(unknownEnvironment).rejects.toMatchObject({
      status: 400,
      message: "environment must be demo or live.",
    });
    expect(requests.map((request) => request.url)).toEqual([
      `${demoApiUrl}/equity/account/summary`,
      `${liveApiUrl}/equity/account/summary`,
    ]);
  });
});

function keyInput(environment: string): { apiKey: string; values: Record<string, string> } {
  return { apiKey: "test-secret", values: { apiKey: "test-secret", apiKeyId: "test-key", environment } };
}

function contextWithKey(environment: string): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "api_key",
    ...keyInput(environment),
    profile: { accountId: `${environment}:1001`, displayName: "Trading 212 account", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({ method: request.method, url: request.url, authorization: request.headers.get("authorization") });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Trading 212 request to ${request.url}`);
    }
    return response;
  });
  return requests;
}
