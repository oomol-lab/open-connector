import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const baseUrl = "https://listmonk.example.org";

interface RecordedRequest {
  method: string;
  url: string;
  authorization: string | null;
  body: unknown;
}

function credential(values: Record<string, string> = {}): Extract<ResolvedCredential, { authType: "api_key" }> {
  return {
    authType: "api_key",
    apiKey: "secret-token",
    values: { baseUrl, apiUser: "api-bot", ...values },
    profile: { accountId: "listmonk:test", displayName: "Listmonk test", grantedScopes: [] },
    metadata: {},
  };
}

function executionContext(values?: Record<string, string>): ExecutionContext {
  const resolved = credential(values);
  return { getCredential: async () => resolved };
}

function mockListmonk(respond: (request: RecordedRequest) => Response): {
  requests: RecordedRequest[];
  fetch: ReturnType<typeof vi.fn>;
} {
  const requests: RecordedRequest[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      url: String(input),
      authorization: headers.get("authorization"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    return respond(request);
  });
  vi.stubGlobal("fetch", fetch);
  return { requests, fetch };
}

const draftCampaign = {
  id: 7,
  name: "October update",
  subject: "Watch party",
  status: "draft",
  from_email: "Club <news@example.org>",
  content_type: "richtext",
  body: "<p>Hello</p>",
  altbody: null,
  messenger: "email",
  headers: [],
  template_id: 1,
  send_at: null,
  lists: [
    { id: 3, name: "Members" },
    { id: 5, name: "Friends" },
  ],
  media: [{ id: 11, filename: "flyer.png" }],
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);

  vi.unstubAllGlobals();
});

describe("Listmonk executors", () => {
  it("sends the API-user token header and unwraps the data envelope", async () => {
    const { requests } = mockListmonk(() =>
      Response.json({ data: { results: [{ id: 1, email: "a@example.org" }], total: 1, page: 2, per_page: 10 } }),
    );

    const result = await executors["listmonk.list_subscribers"]!(
      { query: "subscribers.attribs->>'city' = 'Chicago'", listIds: [3, 5], page: 2, perPage: 10 },
      executionContext({ baseUrl: `${baseUrl}/admin/` }),
    );

    expect(result).toEqual({
      ok: true,
      output: { subscribers: [{ id: 1, email: "a@example.org" }], total: 1, page: 2, perPage: 10 },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.authorization).toBe("token api-bot:secret-token");
    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe(`${baseUrl}/api/subscribers`);
    expect(url.searchParams.getAll("list_id")).toEqual(["3", "5"]);
    expect(url.searchParams.get("query")).toBe("subscribers.attribs->>'city' = 'Chicago'");
  });

  it("schedules a draft by storing send_at before switching the status", async () => {
    const sendAt = new Date(Date.now() + 86_400_000).toISOString();
    const { requests } = mockListmonk((request) => {
      if (request.method === "GET") return Response.json({ data: draftCampaign });
      if (request.url.endsWith("/status"))
        return Response.json({ data: { ...draftCampaign, status: "scheduled", send_at: sendAt } });
      return Response.json({ data: { ...draftCampaign, send_at: sendAt } });
    });

    const result = await executors["listmonk.schedule_campaign"]!({ campaignId: 7, sendAt }, executionContext());

    expect(result).toMatchObject({ ok: true, output: { campaign: { status: "scheduled", send_at: sendAt } } });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      "GET /api/campaigns/7",
      "PUT /api/campaigns/7",
      "PUT /api/campaigns/7/status",
    ]);
    // The update must echo the target lists and attachments, which listmonk
    // would otherwise reset.
    expect(requests[1]!.body).toEqual({ lists: [3, 5], media: [11], send_at: sendAt });
    expect(requests[2]!.body).toEqual({ status: "scheduled" });
  });

  it("only moves the send time of an already scheduled campaign", async () => {
    const sendAt = new Date(Date.now() + 86_400_000).toISOString();
    const scheduled = { ...draftCampaign, status: "scheduled" };
    const { requests } = mockListmonk((request) =>
      Response.json({ data: request.method === "GET" ? scheduled : { ...scheduled, send_at: sendAt } }),
    );

    const result = await executors["listmonk.schedule_campaign"]!({ campaignId: 7, sendAt }, executionContext());

    expect(result).toMatchObject({ ok: true, output: { campaign: { status: "scheduled", send_at: sendAt } } });
    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT"]);
  });

  it("rejects a send time without a timezone offset before calling listmonk", async () => {
    const { fetch } = mockListmonk(() => Response.json({ data: draftCampaign }));

    const result = await executors["listmonk.schedule_campaign"]!(
      { campaignId: 7, sendAt: "2099-10-01T09:00:00" },
      executionContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(result.error?.message).toContain("timezone offset");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to schedule a finished campaign", async () => {
    const { requests } = mockListmonk(() => Response.json({ data: { ...draftCampaign, status: "finished" } }));

    const result = await executors["listmonk.schedule_campaign"]!(
      { campaignId: 7, sendAt: new Date(Date.now() + 86_400_000).toISOString() },
      executionContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(requests).toHaveLength(1);
  });

  it("surfaces listmonk error messages with their status", async () => {
    mockListmonk(() => Response.json({ message: "Only paused and draft campaigns can be started." }, { status: 400 }));

    const result = await executors["listmonk.start_campaign"]!({ campaignId: 7 }, executionContext());

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Only paused and draft campaigns can be started.",
        details: { status: 400 },
      },
    });
  });

  it("maps rejected credentials to authorization_failed", async () => {
    mockListmonk(() => Response.json({ message: "invalid API credentials" }, { status: 403 }));

    const result = await executors["listmonk.get_campaign"]!({ campaignId: 7 }, executionContext());

    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
  });

  it("merges partial campaign updates without dropping target lists", async () => {
    const { requests } = mockListmonk((request) =>
      Response.json({ data: request.method === "GET" ? draftCampaign : { ...draftCampaign, subject: "New subject" } }),
    );

    const result = await executors["listmonk.update_campaign"]!(
      { campaignId: 7, subject: "New subject" },
      executionContext(),
    );

    expect(result).toMatchObject({ ok: true, output: { campaign: { subject: "New subject" } } });
    expect(requests[1]!.body).toEqual({ lists: [3, 5], media: [11], subject: "New subject" });
  });

  it("keeps existing list subscriptions when updating a subscriber", async () => {
    const subscriber = {
      id: 4,
      email: "a@example.org",
      name: "A",
      status: "enabled",
      attribs: { city: "Chicago" },
      lists: [{ id: 3, subscription_status: "confirmed" }],
    };
    const { requests } = mockListmonk((request) =>
      Response.json({ data: request.method === "GET" ? subscriber : { ...subscriber, name: "B" } }),
    );

    await executors["listmonk.update_subscriber"]!({ subscriberId: 4, name: "B" }, executionContext());

    expect(requests[1]).toMatchObject({
      method: "PUT",
      body: { email: "a@example.org", name: "B", status: "enabled", lists: [3], attribs: { city: "Chicago" } },
    });
  });

  it("refuses to update a subscriber whose current lists cannot be read", async () => {
    const { requests } = mockListmonk(() =>
      Response.json({ data: { id: 4, email: "a@example.org", name: "A", status: "enabled", attribs: {} } }),
    );

    const result = await executors["listmonk.update_subscriber"]!({ subscriberId: 4, name: "B" }, executionContext());

    // Sending an empty lists array would unsubscribe the subscriber from everything.
    expect(result).toMatchObject({ ok: false, error: { code: "provider_error" } });
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("drops deleted lists and tolerates campaigns without media", async () => {
    const { media: _media, ...withoutMedia } = draftCampaign;
    const current = { ...withoutMedia, lists: [{ id: 3 }, { id: 0 }] };
    const { requests } = mockListmonk(() => Response.json({ data: current }));

    await executors["listmonk.update_campaign"]!({ campaignId: 7, subject: "New subject" }, executionContext());

    expect(requests[1]!.body).toEqual({ lists: [3], media: [], subject: "New subject" });
  });

  it("sends test emails with the stored campaign payload", async () => {
    const { requests } = mockListmonk((request) =>
      Response.json({ data: request.method === "GET" ? draftCampaign : true }),
    );

    const result = await executors["listmonk.send_campaign_test"]!(
      { campaignId: 7, emails: ["tester@example.org"] },
      executionContext(),
    );

    expect(result).toEqual({ ok: true, output: { sent: true } });
    expect(new URL(requests[1]!.url).pathname).toBe("/api/campaigns/7/test");
    expect(requests[1]!.body).toMatchObject({
      name: "October update",
      subject: "Watch party",
      lists: [3, 5],
      body: "<p>Hello</p>",
      subscribers: ["tester@example.org"],
    });
  });

  it("returns the rendered campaign preview HTML", async () => {
    mockListmonk(() => new Response("<h1>Hello</h1>", { headers: { "content-type": "text/html" } }));

    const result = await executors["listmonk.get_campaign_preview"]!({ campaignId: 7 }, executionContext());

    expect(result).toEqual({ ok: true, output: { html: "<h1>Hello</h1>" } });
  });

  it("applies the token header on proxied requests", async () => {
    const { requests } = mockListmonk(() => Response.json({ data: [] }));

    const result = await proxy({ method: "GET", endpoint: "/lists" }, executionContext());

    expect(result.ok).toBe(true);
    expect(requests[0]!.url).toBe(`${baseUrl}/api/lists`);
    expect(requests[0]!.authorization).toBe("token api-bot:secret-token");
  });
});

describe("Listmonk credential validation", () => {
  it("validates against a private instance when the deployment opts in", async () => {
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      const requests: string[] = [];
      const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        requests.push(`${String(url)} ${new Headers(init?.headers).get("authorization")}`);
        return Response.json({ data: { id: 2, username: "api-bot", type: "api" } });
      });

      const result = await credentialValidators.apiKey!(
        { apiKey: "secret-token", values: { baseUrl: "http://10.0.0.8:9000/api", apiUser: "api-bot" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }) },
      );

      expect(requests).toEqual(["http://10.0.0.8:9000/api/profile token api-bot:secret-token"]);
      expect(result).toMatchObject({
        profile: { accountId: "listmonk:http://10.0.0.8:9000:api-bot" },
        metadata: { baseUrl: "http://10.0.0.8:9000" },
      });
    });
  });

  it("rejects a private instance without the deployment opt-in", async () => {
    const fetchMock = vi.fn();

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "secret-token", values: { baseUrl: "http://10.0.0.8:9000", apiUser: "api-bot" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }) },
      ),
    ).rejects.toThrow("baseUrl must not target private or reserved IP addresses");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
