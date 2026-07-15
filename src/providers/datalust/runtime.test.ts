import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";
import type { DatalustContext } from "./runtime.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";
import { datalustActionHandlers, normalizeDatalustBaseUrl, seqAcceptHeader, seqApiKeyHeader } from "./runtime.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

const apiKey = "seq-test-key";
const baseUrl = "https://seq.example.com";

afterEach(() => {
  vi.unstubAllGlobals();
  setPrivateNetworkAccessAllowed(false);
});

describe("Datalust runtime", () => {
  it("normalizes public Seq root URLs and keeps unsafe targets blocked", () => {
    expect(normalizeDatalustBaseUrl(`${baseUrl}/`)).toBe(baseUrl);

    expect(() => normalizeDatalustBaseUrl("https://127.0.0.1", true)).toThrow("baseUrl");
    expect(() => normalizeDatalustBaseUrl("http://seq.example.com")).toThrow("HTTPS");
    expect(() => normalizeDatalustBaseUrl("https://seq.example.com/api")).toThrow("root URL");
  });

  it("threads the deployment private-network opt-in through credential validation", async () => {
    const privateBaseUrl = "https://192.168.1.20";
    const denied = createFetcher([Response.json({ Events: [] })]);

    await expect(
      credentialValidators.apiKey!({ apiKey, values: { baseUrl: privateBaseUrl } }, { fetcher: denied.fetcher }),
    ).rejects.toThrow("baseUrl");
    expect(denied.requests).toEqual([]);

    setPrivateNetworkAccessAllowed(true);
    const allowed = createFetcher([Response.json({ Events: [] })]);
    await expect(
      credentialValidators.apiKey!({ apiKey, values: { baseUrl: privateBaseUrl } }, { fetcher: allowed.fetcher }),
    ).resolves.toMatchObject({ metadata: { baseUrl: privateBaseUrl } });
    expect(allowed.requests.map((request) => request.url)).toEqual(["https://192.168.1.20/api/events/signal?count=1"]);
  });

  it("validates credentials and strips the Seq API key on cross-origin redirects", async () => {
    const { fetcher, requests } = createFetcher([
      new Response(null, { status: 302, headers: { location: "https://cdn.example.net/validation" } }),
      Response.json({ Events: [] }),
    ]);

    await expect(credentialValidators.apiKey!({ apiKey, values: { baseUrl } }, { fetcher })).resolves.toEqual({
      profile: {
        accountId: "datalust:seq.example.com",
        displayName: "Seq seq.example.com",
      },
      grantedScopes: [],
      metadata: {
        baseUrl,
        validationEndpoint: "/api/events/signal?count=1",
      },
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://seq.example.com/api/events/signal?count=1",
      "https://cdn.example.net/validation",
    ]);
    expect(requestHeaders(requests[0]).get(seqApiKeyHeader)).toBe(apiKey);
    expect(requestHeaders(requests[0]).get("accept")).toBe(seqAcceptHeader);
    expect(requestHeaders(requests[1]).has(seqApiKeyHeader)).toBe(false);
  });

  it("executes actions through the guarded provider fetch", async () => {
    const requests = stubGlobalFetch([
      new Response(null, { status: 307, headers: { location: "https://cdn.example.net/events/event-1" } }),
      Response.json({ Id: "event-1", Timestamp: "2026-07-14T06:00:00Z", Properties: [] }),
    ]);

    await expect(executors["datalust.get_event"]!({ eventId: "event-1" }, executionContext())).resolves.toEqual({
      ok: true,
      output: {
        event: expect.objectContaining({
          id: "event-1",
          timestamp: "2026-07-14T06:00:00Z",
          properties: [],
        }),
      },
    });

    expect(requestHeaders(requests[0]).get(seqApiKeyHeader)).toBe(apiKey);
    expect(requestHeaders(requests[1]).has(seqApiKeyHeader)).toBe(false);
    expect(requests.map((request) => request.url)).toEqual([
      "https://seq.example.com/api/events/event-1",
      "https://cdn.example.net/events/event-1",
    ]);
  });

  it("proxies through the guarded provider fetch", async () => {
    const requests = stubGlobalFetch([
      new Response(null, { status: 307, headers: { location: "https://cdn.example.net/events/event-1" } }),
      Response.json({ Id: "event-1" }),
    ]);

    await expect(proxy({ method: "GET", endpoint: "/api/events/event-1" }, executionContext())).resolves.toMatchObject({
      ok: true,
      response: { data: { Id: "event-1" } },
    });

    expect(requestHeaders(requests[0]).get(seqApiKeyHeader)).toBe(apiKey);
    expect(requestHeaders(requests[1]).has(seqApiKeyHeader)).toBe(false);
    expect(requests.map((request) => request.url)).toEqual([
      "https://seq.example.com/api/events/event-1",
      "https://cdn.example.net/events/event-1",
    ]);
  });

  it("encodes single and batch events with the documented CLEF media types", async () => {
    const single = createFetcher([new Response(null, { status: 201 })]);
    await datalustActionHandlers.ingest_event(
      {
        timestamp: "2026-07-14T06:00:00Z",
        message: "Order accepted",
        properties: { OrderId: 42 },
      },
      contextFor(single.fetcher),
    );

    expect(requestHeaders(single.requests[0]).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(single.requests[0]?.init?.body))).toEqual({
      "@t": "2026-07-14T06:00:00Z",
      "@m": "Order accepted",
      OrderId: 42,
    });

    const batch = createFetcher([new Response(null, { status: 201 })]);
    await datalustActionHandlers.ingest_events(
      {
        events: [
          { timestamp: "2026-07-14T06:00:00Z", messageTemplate: "Order {OrderId}", properties: { OrderId: 42 } },
          { timestamp: "2026-07-14T06:01:00Z", level: "Warning" },
        ],
      },
      contextFor(batch.fetcher),
    );

    expect(requestHeaders(batch.requests[0]).get("content-type")).toBe("application/vnd.serilog.clef");
    expect(
      String(batch.requests[0]?.init?.body)
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      { "@t": "2026-07-14T06:00:00Z", "@mt": "Order {OrderId}", OrderId: 42 },
      { "@t": "2026-07-14T06:01:00Z", "@l": "Warning" },
    ]);
  });

  it("preserves server template fields during partial signal updates", async () => {
    const { fetcher, requests } = createFetcher([
      Response.json({
        Id: "signal/1",
        Title: "Original",
        Description: "Keep me",
        Filters: [{ Filter: "Application = 'api'" }],
        Columns: [{ Expression: "@Timestamp" }],
        ServerDefault: true,
      }),
      new Response(null, { status: 204 }),
    ]);

    await expect(
      datalustActionHandlers.update_signal(
        { signalId: "signal/1", title: "Updated", description: null },
        contextFor(fetcher),
      ),
    ).resolves.toEqual({ updated: true, status: 204 });

    expect(requests.map((request) => request.url)).toEqual([
      "https://seq.example.com/api/signals/signal%2F1",
      "https://seq.example.com/api/signals/signal%2F1",
    ]);
    expect(requests.map((request) => request.init?.method)).toEqual(["GET", "PUT"]);
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      Id: "signal/1",
      Title: "Updated",
      Description: null,
      Filters: [{ Filter: "Application = 'api'" }],
      Columns: [{ Expression: "@Timestamp" }],
      ServerDefault: true,
    });
  });
});

function contextFor(fetcher: typeof fetch): DatalustContext {
  return { apiKey, baseUrl, fetcher };
}

function executionContext(): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "api_key",
    apiKey,
    values: { baseUrl },
    profile: { accountId: "datalust:test", displayName: "Seq test", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

function createFetcher(responses: Response[]): { fetcher: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push(snapshotRequest(input, init));
    const response = responses.shift();
    if (!response) throw new Error("unexpected extra request");
    return response;
  };
  return { fetcher, requests };
}

function stubGlobalFetch(responses: Response[]): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push(snapshotRequest(input, init));
    const response = responses.shift();
    if (!response) throw new Error("unexpected extra request");
    return response;
  });
  return requests;
}

function snapshotRequest(input: RequestInfo | URL, init?: RequestInit): RecordedRequest {
  return {
    url: input instanceof Request ? input.url : String(input),
    init: init ? { ...init, headers: new Headers(init.headers) } : undefined,
  };
}

function requestHeaders(request: RecordedRequest | undefined): Headers {
  return new Headers(request?.init?.headers);
}
