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

describe("ProviderLoader proxy executors (T-Z)", () => {
  it("loads explicit Tanium proxy executors with session tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tanium");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/",
        method: "POST",
        body: { query: "{ __typename }" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("tanium-token", {
            gatewayUrl: "https://example.taniumcloud.com/plugin/products/gateway/graphql",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://example.taniumcloud.com/plugin/products/gateway/graphql");
    expect((init.headers as Headers).get("session")).toBe("tanium-token");
    expect(init.body).toBe(JSON.stringify({ query: "{ __typename }" }));
  });

  it("loads explicit Tapfiliate proxy executors with X-Api-Key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tapfiliate");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/programs/",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("tapfiliate-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.tapfiliate.com/1.6/programs/");
    expect((init.headers as Headers).get("x-api-key")).toBe("tapfiliate-key");
  });

  it("loads explicit Teamcamp proxy executors with apiKey headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("teamcamp");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/project",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("teamcamp-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.teamcamp.app/v1.0/project");
    expect((init.headers as Headers).get("apiKey")).toBe("teamcamp-key");
  });

  it("loads explicit Tencent Docs proxy executors with OpenAPI headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tencent_docs");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/openapi/drive/v2/files",
        method: "GET",
      },
      {
        getCredential: async () => oauthCredential("tencent-token", { clientId: "client-1", openID: "open-1" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://docs.qq.com/openapi/drive/v2/files");
    expect((init.headers as Headers).get("access-token")).toBe("tencent-token");
    expect((init.headers as Headers).get("client-id")).toBe("client-1");
    expect((init.headers as Headers).get("open-id")).toBe("open-1");
  });

  it("loads explicit Tencent Maps proxy executors with key query strings", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tencent_maps");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/ws/geocoder/v1",
        method: "GET",
        query: { address: "Shenzhen" },
      },
      {
        getCredential: async () => apiKeyCredential("tencent-map-key"),
      },
    );

    const [url] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://apis.map.qq.com/ws/geocoder/v1?address=Shenzhen&key=tencent-map-key");
  });

  it("loads explicit TextRazor proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("textrazor");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/account/",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("textrazor-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.textrazor.com/account/");
    expect((init.headers as Headers).get("x-textrazor-key")).toBe("textrazor-key");
  });

  it("loads explicit TiDB proxy executors with digest credentials", async () => {
    const fetcher = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 401,
          headers: {
            "www-authenticate": 'Digest realm="tidb", nonce="nonce-1", qop="auth"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    const proxy = await new ProviderLoader().loadProxyExecutor("tidb");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/iam/apikeys",
        method: "GET",
        query: { pageSize: 1 },
      },
      {
        getCredential: async () => customCredential({ publicKey: "tidb-public", privateKey: "tidb-private" }),
      },
    );

    const [initialUrl, initialInit] = fetcher.mock.calls[0] as [URL, RequestInit];
    const [authorizedUrl, authorizedInit] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(initialUrl.toString()).toBe("https://iam.tidbapi.com/v1beta1/apikeys?pageSize=1");
    expect((initialInit.headers as Headers).get("authorization")).toBeNull();
    expect(authorizedUrl.toString()).toBe("https://iam.tidbapi.com/v1beta1/apikeys?pageSize=1");
    expect((authorizedInit.headers as Headers).get("authorization")).toContain('Digest username="tidb-public"');
  });

  it("loads explicit Timelink proxy executors with bearer tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("timelink");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/clients",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("timelink-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.timelink.io/api/v1/clients");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer timelink-token");
  });

  it("loads explicit TinyPNG proxy executors with api basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tinypng");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/shrink",
        method: "POST",
        body: "",
      },
      {
        getCredential: async () => apiKeyCredential("tinypng-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.tinify.com/shrink");
    expect((init.headers as Headers).get("authorization")).toBe(
      `Basic ${Buffer.from("api:tinypng-key").toString("base64")}`,
    );
  });

  it("loads explicit Tisane proxy executors with subscription key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tisane");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/languages",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("tisane-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.tisane.ai/languages");
    expect((init.headers as Headers).get("ocp-apim-subscription-key")).toBe("tisane-key");
  });

  it("loads explicit Toggl proxy executors with api_token basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("toggl");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("toggl-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.track.toggl.com/api/v9/me");
    expect((init.headers as Headers).get("authorization")).toBe(
      `Basic ${Buffer.from("toggl-token:api_token").toString("base64")}`,
    );
  });

  it("loads explicit Tomba proxy executors with key and secret headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tomba");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("tomba-key", { apiSecret: "tomba-secret" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.tomba.io/v1/me");
    expect((init.headers as Headers).get("x-tomba-key")).toBe("tomba-key");
    expect((init.headers as Headers).get("x-tomba-secret")).toBe("tomba-secret");
  });

  it("loads explicit TomTom proxy executors with key query strings", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tomtom");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/search/2/geocode/Amsterdam.json",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("tomtom-key"),
      },
    );

    const [url] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.tomtom.com/search/2/geocode/Amsterdam.json?limit=1&key=tomtom-key");
  });

  it("loads explicit Trello proxy executors with key and token query strings", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("trello");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/members/me",
        method: "GET",
      },
      {
        getCredential: async () => customCredential({ apiKey: "trello-key", apiToken: "trello-token" }),
      },
    );

    const [url] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.trello.com/1/members/me?key=trello-key&token=trello-token");
  });

  it("loads explicit Tushare proxy executors with tokens in JSON bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("tushare");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/",
        method: "POST",
        body: { api_name: "trade_cal", params: {} },
      },
      {
        getCredential: async () => apiKeyCredential("tushare-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.tushare.pro/");
    expect(init.body).toBe(JSON.stringify({ api_name: "trade_cal", params: {}, token: "tushare-token" }));
  });

  it("loads explicit Twelve Data proxy executors with apikey authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("twelve_data");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/price",
        method: "GET",
        query: { symbol: "AAPL" },
      },
      {
        getCredential: async () => apiKeyCredential("twelve-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.twelvedata.com/price?symbol=AAPL");
    expect((init.headers as Headers).get("authorization")).toBe("apikey twelve-key");
  });

  it("loads explicit Twilio proxy executors with account basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("twilio");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/Accounts/AC123.json",
        method: "GET",
      },
      {
        getCredential: async () => customCredential({ accountSid: "AC123", authToken: "twilio-token" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123.json");
    expect((init.headers as Headers).get("authorization")).toBe(
      `Basic ${Buffer.from("AC123:twilio-token").toString("base64")}`,
    );
  });

  it("loads explicit Twitter proxy executors with bearer tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("twitter");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/me",
        method: "GET",
      },
      {
        getCredential: async () => oauthCredential("twitter-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.x.com/2/users/me");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer twitter-token");
  });

  it("loads explicit Typeform proxy executors with bearer tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("typeform");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("typeform-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.typeform.com/me");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer typeform-token");
  });

  it("loads explicit Unipile proxy executors with DSN base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("unipile");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/accounts",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("unipile-key", { dsn: "https://api1.unipile.com:12345/root" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api1.unipile.com:12345/api/v1/accounts");
    expect((init.headers as Headers).get("x-api-key")).toBe("unipile-key");
  });

  it("loads explicit Unsplash proxy executors with Client-ID authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("unsplash");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/photos",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("unsplash-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.unsplash.com/photos");
    expect((init.headers as Headers).get("authorization")).toBe("Client-ID unsplash-key");
  });

  it("loads explicit Uploadcare proxy executors with signed authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("uploadcare");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/project/",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("uploadcare-secret", { publicKey: "uploadcare-public" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.uploadcare.com/project/");
    expect((init.headers as Headers).get("authorization")).toEqual(
      expect.stringMatching(/^Uploadcare uploadcare-public:/),
    );
    expect((init.headers as Headers).get("date")).toEqual(expect.any(String));
  });

  it("loads explicit Upsales proxy executors with token query params", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("upsales");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/self",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("upsales-key"),
      },
    );

    const [url] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://integration.upsales.com/api/v2/self?token=upsales-key");
  });

  it("loads explicit UptimeRobot proxy executors with API keys in form bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("uptimerobot");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/getMonitors",
        method: "POST",
        body: { search: "api" },
      },
      {
        getCredential: async () => apiKeyCredential("uptimerobot-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.uptimerobot.com/v2/getMonitors");
    expect((init.headers as Headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    expect((init.body as URLSearchParams).get("api_key")).toBe("uptimerobot-key");
    expect((init.body as URLSearchParams).get("format")).toBe("json");
    expect((init.body as URLSearchParams).get("search")).toBe("api");
  });

  it("loads explicit Userlist proxy executors with Push authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("userlist");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users",
        method: "POST",
        body: { identifier: "user-1" },
      },
      {
        getCredential: async () => apiKeyCredential("userlist-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://push.userlist.com/users");
    expect((init.headers as Headers).get("authorization")).toBe("Push userlist-key");
  });

  it("loads explicit Viggle proxy executors with bearer authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("viggle");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/credits",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("viggle-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://apis.viggle.ai/api/credits");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer viggle-key");
  });

  it("loads explicit VTEX proxy executors with account host and app token headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("vtex");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/catalog_system/pvt/brand/list",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("vtex-app-key", {
            accountName: "store",
            appToken: "vtex-app-token",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://store.vtexcommercestable.com.br/api/catalog_system/pvt/brand/list");
    expect((init.headers as Headers).get("x-vtex-api-appkey")).toBe("vtex-app-key");
    expect((init.headers as Headers).get("x-vtex-api-apptoken")).toBe("vtex-app-token");
  });

  it("loads explicit WakaTime proxy executors with API key basic authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("wakatime");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/current",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("wakatime-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://wakatime.com/api/v1/users/current");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("wakatime-key")}`);
  });

  it("loads explicit Weatherbit proxy executors with key query strings", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("weatherbit");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2.0/current",
        method: "GET",
        query: { city: "Raleigh" },
      },
      {
        getCredential: async () => apiKeyCredential("weatherbit-key"),
      },
    );

    const [url] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.weatherbit.io/v2.0/current?city=Raleigh&key=weatherbit-key");
  });

  it("loads explicit Jam proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("wejam_ai");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/data-exports/users",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("jam-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.wejam.ai/api/v1/data-exports/users");
    expect((init.headers as Headers).get("x-api-key")).toBe("jam-key");
  });

  it("loads explicit WooCommerce proxy executors with store Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("woocommerce");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/products",
        method: "GET",
      },
      {
        getCredential: async () =>
          customCredential({
            storeUrl: "https://shop.example.com",
            consumerKey: "wc-key",
            consumerSecret: "wc-secret",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://shop.example.com/wp-json/wc/v3/products");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("wc-key:wc-secret")}`);
  });

  it("loads explicit WordPress proxy executors with site Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("wordpress");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/posts",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("wp-password", {
            siteUrl: "https://blog.example.com/wp-json/wp/v2",
            username: "editor",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://blog.example.com/wp-json/wp/v2/posts");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("editor:wp-password")}`);
  });

  it("loads explicit Workable proxy executors with subdomain bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("workable");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/jobs",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("workable-token", { subdomain: "Acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.workable.com/spi/v3/jobs");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer workable-token");
  });

  it("loads explicit Zendesk proxy executors with API token and OAuth auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("zendesk");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/users/me.json",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("zendesk-token", {
            email: "agent@example.com",
            subdomain: "Acme",
          }),
      },
    );

    await proxy?.(
      {
        endpoint: "/api/v2/tickets.json",
        method: "GET",
      },
      {
        getCredential: async () => oauthCredential("zendesk-oauth", { subdomain: "acme" }),
      },
    );

    const [apiUrl, apiInit] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(apiUrl.toString()).toBe("https://acme.zendesk.com/api/v2/users/me.json");
    expect((apiInit.headers as Headers).get("authorization")).toBe(
      `Basic ${btoa("agent@example.com/token:zendesk-token")}`,
    );

    const [oauthUrl, oauthInit] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(oauthUrl.toString()).toBe("https://acme.zendesk.com/api/v2/tickets.json");
    expect((oauthInit.headers as Headers).get("authorization")).toBe("Bearer zendesk-oauth");
  });

  it("loads explicit Zorus proxy executors with impersonation authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("zorus");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/customers/search",
        method: "POST",
        body: { page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("zorus-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://developer.zorustech.com/api/customers/search");
    expect((init.headers as Headers).get("authorization")).toBe("Impersonation zorus-token");
    expect((init.headers as Headers).get("zorus-api-version")).toBe("1.0");
  });

  it("loads explicit Zyte API proxy executors with API key Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("zyte_api");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/extract",
        method: "POST",
        body: { url: "https://example.com", browserHtml: true },
      },
      {
        getCredential: async () => apiKeyCredential("zyte-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.zyte.com/v1/extract");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("zyte-key:")}`);
  });
});
