import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderLoader } from "./provider-loader.ts";
import {
  stubProviderFetch,
  apiKeyCredential,
  customCredential,
  oauthCredential,
} from "./provider-proxy-loader.test-helpers.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProviderLoader proxy executors (N-S)", () => {
  it("loads explicit Payhip proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("payhip");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/coupons",
        method: "GET",
        query: { page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("payhip-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://payhip.com/api/v2/coupons?page=1");
    expect((init.headers as Headers).get("payhip-api-key")).toBe("payhip-key");
  });

  it("loads explicit Pendo proxy executors with regional integration key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("pendo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/page",
        method: "GET",
        query: { appId: "app-1" },
      },
      {
        getCredential: async () => apiKeyCredential("pendo-key", { region: "eu" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.eu.pendo.io/api/v1/page?appId=app-1");
    expect((init.headers as Headers).get("x-pendo-integration-key")).toBe("pendo-key");
  });

  it("loads explicit Perdoo proxy executors with Bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("perdoo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/",
        method: "POST",
        body: { query: "{ me { id } }" },
      },
      {
        getCredential: async () => apiKeyCredential("perdoo-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://eu.perdoo.com/graphql/");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer perdoo-token");
    expect(init.body).toBe(JSON.stringify({ query: "{ me { id } }" }));
  });

  it("loads explicit PhantomBuster proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("phantombuster");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/agents/fetch",
        method: "GET",
        query: { id: "agent-1" },
      },
      {
        getCredential: async () => apiKeyCredential("phantom-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.phantombuster.com/api/v2/agents/fetch?id=agent-1");
    expect((init.headers as Headers).get("x-phantombuster-key")).toBe("phantom-key");
  });

  it("loads explicit Pipedrive proxy executors with API token headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("pipedrive");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/persons",
        method: "GET",
        query: { limit: 20 },
      },
      {
        getCredential: async () => apiKeyCredential("pipedrive-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.pipedrive.com/api/v2/persons?limit=20");
    expect((init.headers as Headers).get("x-api-token")).toBe("pipedrive-token");
  });

  it("loads explicit Plausible Analytics proxy executors with configured base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("plausible_analytics");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/query",
        method: "POST",
        body: { site_id: "example.com", metrics: ["visitors"], date_range: "7d" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("plausible-key", {
            baseUrl: "https://plausible.example.com/root",
            siteId: "example.com",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://plausible.example.com/root/api/v2/query");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer plausible-key");
  });

  it("loads explicit Process Street proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("process_street");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/workflows",
        method: "GET",
        query: { name: "Onboarding" },
      },
      {
        getCredential: async () => apiKeyCredential("process-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://public-api.process.st/api/v1.1/workflows?name=Onboarding");
    expect((init.headers as Headers).get("x-api-key")).toBe("process-key");
  });

  it("loads explicit Prospeo proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("prospeo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/account-information",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("prospeo-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.prospeo.io/account-information");
    expect((init.headers as Headers).get("x-key")).toBe("prospeo-key");
  });

  it("loads explicit ProxiedMail proxy executors with token headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("proxiedmail");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/proxy-bindings",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("proxiedmail-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://proxiedmail.com/api/v1/proxy-bindings");
    expect((init.headers as Headers).get("token")).toBe("proxiedmail-token");
  });

  it("loads explicit PRTG Classic proxy executors with API token query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("prtg_classic");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/table.json",
        method: "GET",
        query: { content: "sensors" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("prtg-token", {
            apiBaseUrl: "https://prtg.example.com/root/api",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://prtg.example.com/root/api/table.json?content=sensors&apitoken=prtg-token");
    expect((init.headers as Headers).get("authorization")).toBeNull();
  });

  it("loads explicit Pushover proxy executors with token form parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("pushover");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/messages.json",
        method: "POST",
        body: { user: "user-key", message: "hello" },
      },
      {
        getCredential: async () => apiKeyCredential("pushover-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.pushover.net/1/messages.json");
    expect((init.headers as Headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toBe("user=user-key&message=hello&token=pushover-token");
  });

  it("loads explicit Qianfan proxy executors with Bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("qianfan");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/models",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("qianfan-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://qianfan.baidubce.com/v2/models");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer qianfan-key");
  });

  it("loads explicit Qianfan proxy executors for video generation endpoints", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("qianfan");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/video/generations",
        method: "POST",
        body: { model: "video-model", prompt: "ocean" },
      },
      {
        getCredential: async () => apiKeyCredential("qianfan-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://qianfan.baidubce.com/video/generations");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer qianfan-key");
    expect(init.body).toBe(JSON.stringify({ model: "video-model", prompt: "ocean" }));
  });

  it("loads explicit Quaderno proxy executors with account Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("quaderno");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/contacts",
        method: "GET",
        query: { q: "Ada" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("quaderno-key", {
            accountUrl: "https://acme.quadernoapp.com/api",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.quadernoapp.com/api/contacts?q=Ada");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("quaderno-key:x")}`);
  });

  it("loads explicit Quentn proxy executors with system Bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("quentn");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () =>
          apiKeyCredential("quentn-key", {
            systemId: "My-System",
            serverId: "Server",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://my-system.server.quentn.com/public/api/V1/users?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer quentn-key");
  });

  it("loads explicit Quickbase proxy executors with realm headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("quickbase");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/apps",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("quickbase-token", {
            realmHostname: "Example.Quickbase.com",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.quickbase.com/v1/apps");
    expect((init.headers as Headers).get("authorization")).toBe("QB-USER-TOKEN quickbase-token");
    expect((init.headers as Headers).get("qb-realm-hostname")).toBe("example.quickbase.com");
  });

  it("loads explicit Razorpay proxy executors with key pair Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("razorpay");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/orders",
        method: "GET",
        query: { count: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("razorpay-secret", { keyId: "razorpay-key" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.razorpay.com/v1/orders?count=1");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("razorpay-key:razorpay-secret")}`);
  });

  it("loads explicit Recall.ai proxy executors with regional token auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("recallai");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/bot/",
        method: "GET",
        query: { page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("recall-key", { region: "eu-central-1" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://eu-central-1.recall.ai/api/v1/bot/?page=1");
    expect((init.headers as Headers).get("authorization")).toBe("Token recall-key");
  });

  it("loads explicit Recurly proxy executors with API key Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("recurly");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/accounts",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("recurly-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://v3.recurly.com/accounts?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("recurly-key:")}`);
  });

  it("loads explicit Refiner proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("refiner");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/account",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("refiner-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.refiner.io/v1/account");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer refiner-key");
  });

  it("loads explicit Replicate proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("replicate");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/models",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("replicate-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.replicate.com/v1/models");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer replicate-token");
  });

  it("loads explicit Ringover proxy executors with regional raw authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("ringover");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/teams",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("ringover-key", { region: "us" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://public-api-us.ringover.com/v2/teams");
    expect((init.headers as Headers).get("authorization")).toBe("ringover-key");
  });

  it("loads explicit Roam SCIM proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("roam_scim");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/Users",
        method: "GET",
        query: { count: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("roam-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.ro.am/scim/v2/Users?count=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer roam-token");
  });

  it("loads explicit Rocket.Chat proxy executors with workspace auth headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("rocket_chat");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/chat.postMessage",
        method: "POST",
        body: { roomId: "GENERAL", text: "hello" },
      },
      {
        getCredential: async () =>
          customCredential({
            baseUrl: "https://chat.example.com/team/api/v1",
            userId: "user-1",
            authToken: "rocket-token",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://chat.example.com/team/api/v1/chat.postMessage");
    expect((init.headers as Headers).get("x-auth-token")).toBe("rocket-token");
    expect((init.headers as Headers).get("x-user-id")).toBe("user-1");
    expect(init.body).toBe(JSON.stringify({ roomId: "GENERAL", text: "hello" }));
  });

  it("loads explicit Rosette Text Analytics proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("rosette_text_analytics");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/entities",
        method: "POST",
        body: { content: "Ada Lovelace wrote notes." },
      },
      {
        getCredential: async () => apiKeyCredential("rosette-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://analytics.babelstreet.com/rest/v1/entities");
    expect((init.headers as Headers).get("x-babelstreetapi-key")).toBe("rosette-key");
    expect(init.body).toBe(JSON.stringify({ content: "Ada Lovelace wrote notes." }));
  });

  it("loads explicit Sage HR proxy executors with domain API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("sage_hr");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/employees",
        method: "GET",
        query: { page: 2 },
      },
      {
        getCredential: async () => apiKeyCredential("sage-hr-key", { domain: "Acme.sage.hr" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.sage.hr/api/employees?page=2");
    expect((init.headers as Headers).get("x-auth-token")).toBe("sage-hr-key");
  });

  it("loads explicit Sage Sales Management proxy executors with login session keys", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/login") ? { token: "sage-session-key" } : { data: [] }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const proxy = await new ProviderLoader().loadProxyExecutor("sage_sales_management");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/accounts",
        method: "GET",
        query: { count: 1 },
      },
      {
        getCredential: async () =>
          customCredential({
            publicApiKey: "public-key",
            privateApiKey: "private-key",
          }),
      },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.forcemanager.com/api/v4/accounts?count=1");
    expect((init.headers as Headers).get("x-session-key")).toBe("sage-session-key");
  });

  it("loads explicit Salesmate proxy executors with workspace access headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("salesmate");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/apis/company/v4",
        method: "POST",
        body: { name: "Acme" },
      },
      {
        getCredential: async () => apiKeyCredential("salesmate-token", { linkName: "Example" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://example.salesmate.io/apis/company/v4");
    expect((init.headers as Headers).get("accessToken")).toBe("salesmate-token");
    expect((init.headers as Headers).get("x-linkname")).toBe("example.salesmate.io");
    expect(init.body).toBe(JSON.stringify({ name: "Acme" }));
  });

  it("loads explicit ScrapingAnt proxy executors with API key query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("scrapingant");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/usage",
        method: "GET",
        query: { include: "plan" },
      },
      {
        getCredential: async () => apiKeyCredential("scrapingant-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.scrapingant.com/v2/usage?include=plan&x-api-key=scrapingant-key");
    expect((init.headers as Headers).get("authorization")).toBeNull();
  });

  it("loads explicit SearchApi proxy executors with API key query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("search_api");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/search",
        method: "GET",
        query: { engine: "google", q: "oomol" },
      },
      {
        getCredential: async () => apiKeyCredential("searchapi-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://www.searchapi.io/api/v1/search?engine=google&q=oomol&api_key=searchapi-key");
    expect((init.headers as Headers).get("authorization")).toBeNull();
  });

  it("loads explicit Segment proxy executors with write keys in JSON bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("segment");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/track",
        method: "POST",
        body: { userId: "user-1", event: "Signed Up" },
      },
      {
        getCredential: async () => apiKeyCredential("segment-write-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.segment.io/v1/track");
    expect(init.body).toBe(JSON.stringify({ userId: "user-1", event: "Signed Up", writeKey: "segment-write-key" }));
    expect((init.headers as Headers).get("authorization")).toBeNull();
  });

  it("loads explicit Sendbird proxy executors with application API token headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("sendbird");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users",
        method: "GET",
        query: { limit: 10 },
      },
      {
        getCredential: async () => apiKeyCredential("sendbird-token", { applicationId: "app-123" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api-app-123.sendbird.com/v3/users?limit=10");
    expect((init.headers as Headers).get("api-token")).toBe("sendbird-token");
  });

  it("loads explicit Sendspark proxy executors with workspace and user API headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("sendspark");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/workspaces/workspace-1/dynamics",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("sendspark-workspace-key", { userApiSecret: "user-secret" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api-gw.sendspark.com/v1/workspaces/workspace-1/dynamics?limit=1");
    expect((init.headers as Headers).get("x-api-key")).toBe("sendspark-workspace-key");
    expect((init.headers as Headers).get("x-api-secret")).toBe("user-secret");
  });

  it("loads explicit Sentry proxy executors with OAuth bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("sentry");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/organizations/acme/projects/",
        method: "GET",
        query: { cursor: "abc" },
      },
      {
        getCredential: async () => oauthCredential("sentry-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://sentry.io/api/0/organizations/acme/projects/?cursor=abc");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer sentry-token");
  });

  it("loads explicit ShipBob proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("ship_bob");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/channel",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("shipbob-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.shipbob.com/2026-01/channel");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer shipbob-token");
  });

  it("loads explicit Shipday proxy executors with raw Basic authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("shipday");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/carriers",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("shipday-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.shipday.com/carriers");
    expect((init.headers as Headers).get("authorization")).toBe("Basic shipday-key");
  });

  it("loads explicit Shippo proxy executors with token and version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("shippo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/addresses/",
        method: "GET",
        query: { page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("shippo-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.goshippo.com/addresses/?page=1");
    expect((init.headers as Headers).get("authorization")).toBe("ShippoToken shippo-token");
    expect((init.headers as Headers).get("shippo-api-version")).toBe("2018-02-08");
  });

  it("loads explicit Shopify REST Admin proxy executors with shop access tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("shopify");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/shop.json",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("shopify-token", {
            shopDomain: "https://acme.myshopify.com/admin",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.myshopify.com/admin/api/2026-04/shop.json");
    expect((init.headers as Headers).get("x-shopify-access-token")).toBe("shopify-token");
  });

  it("loads explicit Shopify Admin proxy executors with shop access tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("shopify_admin");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/graphql.json",
        method: "POST",
        body: { query: "{ shop { name } }" },
      },
      {
        getCredential: async () => apiKeyCredential("shopify-admin-token", { shopDomain: "acme.myshopify.com" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.myshopify.com/admin/api/2026-04/graphql.json");
    expect((init.headers as Headers).get("x-shopify-access-token")).toBe("shopify-admin-token");
    expect(init.body).toBe(JSON.stringify({ query: "{ shop { name } }" }));
  });

  it("loads explicit Shopify Partner proxy executors with organization access tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("shopify_partner");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/graphql.json",
        method: "POST",
        body: { query: "{ __typename }" },
      },
      {
        getCredential: async () => apiKeyCredential("partner-token", { organizationId: "1234567" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://partners.shopify.com/1234567/api/2026-07/graphql.json");
    expect((init.headers as Headers).get("x-shopify-access-token")).toBe("partner-token");
    expect(init.body).toBe(JSON.stringify({ query: "{ __typename }" }));
  });

  it("loads explicit Shopify Storefront proxy executors with storefront access tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("shopify_storefront");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/graphql.json",
        method: "POST",
        body: { query: "{ shop { name } }" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("storefront-token", {
            shopDomain: "https://acme.myshopify.com/products",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.myshopify.com/api/2026-04/graphql.json");
    expect((init.headers as Headers).get("x-shopify-storefront-access-token")).toBe("storefront-token");
    expect(init.body).toBe(JSON.stringify({ query: "{ shop { name } }" }));
  });

  it("loads explicit Simple Analytics proxy executors with API key and user headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("simple_analytics");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/websites",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("simple-key", { userId: "simple-user" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://simpleanalytics.com/api/websites");
    expect((init.headers as Headers).get("api-key")).toBe("simple-key");
    expect((init.headers as Headers).get("user-id")).toBe("simple-user");
  });

  it("loads explicit Skio proxy executors with API authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("skio");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/orders",
        method: "GET",
        query: { first: 10 },
      },
      {
        getCredential: async () => apiKeyCredential("skio-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.skio.com/public-rest-api-http/orders?first=10");
    expect((init.headers as Headers).get("authorization")).toBe("API skio-key");
  });

  it("loads explicit SMS Alert proxy executors with API keys in query strings", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("sms_alert");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/creditstatus.json",
        method: "GET",
        query: { route: "transactional" },
      },
      {
        getCredential: async () => apiKeyCredential("sms-alert-key"),
      },
    );

    const [url] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://www.smsalert.co.in/api/creditstatus.json?route=transactional&apikey=sms-alert-key",
    );
  });

  it("loads explicit SmugMug proxy executors with API keys in query strings", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("smugmug");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/user/apidemo",
        method: "GET",
        query: { _verbosity: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("smugmug-key"),
      },
    );

    const [url] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.smugmug.com/api/v2/user/apidemo?_verbosity=1&APIKey=smugmug-key");
  });

  it("loads explicit Snipe-IT proxy executors with instance URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("snipe_it");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/hardware",
        method: "GET",
        query: { limit: 25 },
      },
      {
        getCredential: async () => apiKeyCredential("snipe-token", { instanceUrl: "assets.example.com/api/v1/" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://assets.example.com/api/v1/hardware?limit=25");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer snipe-token");
  });

  it("loads explicit Solcast proxy executors with bearer API keys", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("solcast");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/data/forecast/radiation_and_weather",
        method: "GET",
        query: { latitude: -33.8567, longitude: 151.2152 },
      },
      {
        getCredential: async () => apiKeyCredential("solcast-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://api.solcast.com.au/data/forecast/radiation_and_weather?latitude=-33.8567&longitude=151.2152",
    );
    expect((init.headers as Headers).get("authorization")).toBe("Bearer solcast-key");
  });

  it("loads explicit Spotify proxy executors with OAuth bearer tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("spotify");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/me",
        method: "GET",
      },
      {
        getCredential: async () => oauthCredential("spotify-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.spotify.com/v1/me");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer spotify-token");
  });

  it("loads explicit Cert Spotter proxy executors with CT search routing", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("sslmate_cert_spotter_api");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/ct-search/issuances",
        method: "GET",
        query: { domain: "example.com" },
      },
      {
        getCredential: async () => apiKeyCredential("cert-spotter-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.certspotter.com/v1/issuances?domain=example.com");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer cert-spotter-key");
  });

  it("loads explicit StackAI proxy executors with flow credentials", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("stack_ai");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/metadata",
        method: "GET",
        query: { run_id: "run-1" },
      },
      {
        getCredential: async () =>
          customCredential({ apiKey: "stack-key", organizationId: "org_123", flowId: "flow_456" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://stack-inference.com/inference/v0/run/org_123/flow_456/metadata?run_id=run-1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer stack-key");
  });

  it("loads explicit Statuspage proxy executors with OAuth API tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("statuspage");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/pages",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("statuspage-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.statuspage.io/v1/pages");
    expect((init.headers as Headers).get("authorization")).toBe("OAuth statuspage-token");
  });

  it("loads explicit StatusPal proxy executors with authorization API keys", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("statuspal");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/hello",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("statuspal-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://statuspal.io/api/v2/hello");
    expect((init.headers as Headers).get("authorization")).toBe("statuspal-key");
  });

  it("loads explicit Storyblok proxy executors with regional token query strings", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("storyblok");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/stories",
        method: "GET",
        query: { version: "draft" },
      },
      {
        getCredential: async () => apiKeyCredential("storyblok-token", { region: "us" }),
      },
    );

    const [url] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api-us.storyblok.com/v2/cdn/stories?version=draft&token=storyblok-token");
  });

  it("loads explicit Streak proxy executors with basic API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("streak");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("streak-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.streak.com/api/v1/users/me");
    expect((init.headers as Headers).get("authorization")).toBe("Basic c3RyZWFrLWtleTo=");
  });

  it("loads explicit SupportBee proxy executors with company subdomains", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("supportbee");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/tickets",
        method: "GET",
        query: { page: 2 },
      },
      {
        getCredential: async () => apiKeyCredential("supportbee-token", { company: "Acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.supportbee.com/tickets?page=2");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer supportbee-token");
  });

  it("loads explicit SwaggerHub proxy executors with raw authorization keys", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("swaggerhub");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/apis",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("swaggerhub-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.swaggerhub.com/apis?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("swaggerhub-key");
  });

  it("loads explicit Namely proxy executors with company bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("namely");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/profiles/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("namely-token", { company: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.namely.com/api/v1/profiles/me");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer namely-token");
  });

  it("loads explicit NetHunt proxy executors with email Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("nethunt");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/triggers/auth-test",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("nethunt-key", { email: "ada@example.com" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://nethunt.com/api/v1/zapier/triggers/auth-test");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("ada@example.com:nethunt-key")}`);
  });

  it("loads explicit NetSuite proxy executors with OAuth 1 auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("netsuite");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/services/rest/record/v1/metadata-catalog",
        method: "GET",
      },
      {
        getCredential: async () =>
          customCredential({
            accountId: "ACME_123",
            consumerKey: "consumer-key",
            consumerSecret: "consumer-secret",
            tokenId: "token-id",
            tokenSecret: "token-secret",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme-123.suitetalk.api.netsuite.com/services/rest/record/v1/metadata-catalog");
    const authorization = (init.headers as Headers).get("authorization");
    expect(authorization).toContain('OAuth realm="ACME_123"');
    expect(authorization).toContain('oauth_consumer_key="consumer-key"');
    expect(authorization).toContain('oauth_token="token-id"');
  });

  it("loads explicit noCRM.io proxy executors with subdomain API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("nocrm_io");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/teams",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("nocrm-key", { subdomain: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.nocrm.io/api/v2/teams");
    expect((init.headers as Headers).get("x-api-key")).toBe("nocrm-key");
  });

  it("loads explicit Northbeam proxy executors with client id headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("northbeam");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/exports/metrics",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("northbeam-key", { clientId: "northbeam-client" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.northbeam.io/v1/exports/metrics");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("northbeam-key");
    expect(headers.get("data-client-id")).toBe("northbeam-client");
  });

  it("loads explicit Notion proxy executors with Notion version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("notion");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("notion-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.notion.com/v1/users/me");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer notion-key");
    expect(headers.get("notion-version")).toBe("2026-03-11");
  });

  it("loads explicit Nylas proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("nylas");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/grants",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("nylas-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.us.nylas.com/v3/grants?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer nylas-key");
  });

  it("loads explicit Octave proxy executors with api_key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("octave");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/api-key/validate",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("octave-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.octavehq.com/api/v2/api-key/validate");
    expect((init.headers as Headers).get("api_key")).toBe("octave-key");
  });

  it("loads explicit OKSign proxy executors with account authorization headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("oksign");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/services/rest/v1/credits/retrieve",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("oksign-account", {
            authorizationToken: "oksign-auth",
            organizationalToken: "oksign-org",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://www.oksign.be/services/rest/v1/credits/retrieve");
    expect((init.headers as Headers).get("x-oksign-authorization")).toBe("oksign-account;oksign-auth;oksign-org");
  });

  it("loads explicit OnePageCRM proxy executors with user Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("one_page_crm");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/contacts",
        method: "GET",
        query: { page: 1 },
      },
      {
        getCredential: async () => customCredential({ userId: "user-1", apiKey: "one-key" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.onepagecrm.com/api/v3/contacts?page=1");
    expect((init.headers as Headers).get("authorization")).toBe("Basic dXNlci0xOm9uZS1rZXk=");
  });

  it("loads explicit OpenHands proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("open_hands");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/app-conversations/search",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("openhands-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.all-hands.dev/api/v1/app-conversations/search?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer openhands-key");
  });

  it("loads explicit Opsgenie proxy executors with regional GenieKey auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("opsgenie");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2/account",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("opsgenie-key", { environment: "eu" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.eu.opsgenie.com/v2/account");
    expect((init.headers as Headers).get("authorization")).toBe("GenieKey opsgenie-key");
  });

  it("loads explicit PandaDoc proxy executors with API-Key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("pandadoc");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/public/v1/templates",
        method: "GET",
        query: { page: 1, count: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("pandadoc-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.pandadoc.com/public/v1/templates?page=1&count=1");
    expect((init.headers as Headers).get("authorization")).toBe("API-Key pandadoc-key");
  });

  it("loads explicit PartnerStack proxy executors with vendor Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("partnerstack");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2/customers",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("partner-secret", { publicKey: "partner-public" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.partnerstack.com/api/v2/customers?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Basic cGFydG5lci1wdWJsaWM6cGFydG5lci1zZWNyZXQ=");
  });
});
