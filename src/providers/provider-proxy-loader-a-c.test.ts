import type { ExecutionContext } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderLoader } from "./provider-loader.ts";
import {
  stubProviderFetch,
  apiKeyCredential,
  customCredential,
  coinbasePrivateKey,
} from "./provider-proxy-loader.test-helpers.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProviderLoader proxy executors (A-C)", () => {
  it("loads explicit Alibaba Cloud OSS proxy executors with signed bucket requests", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("aliyun_oss");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/photos/cat.txt",
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body: "hello",
      },
      {
        getCredential: async () =>
          customCredential({
            accessKeyId: "LTAI123",
            accessKeySecret: "oss-secret",
            endpoint: "oss-cn-hangzhou.aliyuncs.com",
            bucket: "demo-bucket",
            securityToken: "sts-token",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://demo-bucket.oss-cn-hangzhou.aliyuncs.com/photos/cat.txt");
    expect(init.body).toBe("hello");

    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toMatch(/^OSS LTAI123:/);
    expect(headers.get("content-type")).toBe("text/plain");
    expect(headers.get("x-oss-date")).toMatch(/GMT$/);
    expect(headers.get("x-oss-security-token")).toBe("sts-token");
  });

  it("loads explicit Alibaba Cloud STS proxy executors with signed RPC bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("aliyun_sts");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/",
        method: "POST",
        body: {
          RoleArn: "acs:ram::1234567890123456:role/demo",
          RoleSessionName: "demo-session",
        },
      },
      {
        getCredential: async () =>
          customCredential({
            accessKeyId: "LTAI123",
            accessKeySecret: "sts-secret",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://sts.aliyuncs.com/");
    expect((init.headers as Headers).get("content-type")).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(String(init.body));
    expect(params.get("AccessKeyId")).toBe("LTAI123");
    expect(params.get("Action")).toBe("AssumeRole");
    expect(params.get("RoleArn")).toBe("acs:ram::1234567890123456:role/demo");
    expect(params.get("RoleSessionName")).toBe("demo-session");
    expect(params.get("Signature")).toEqual(expect.any(String));
  });

  it("loads explicit AWS S3 proxy executors with SigV4 signed bucket requests", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("aws_s3");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/photos/cat.txt",
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body: "hello",
      },
      {
        getCredential: async () =>
          customCredential({
            accessKeyId: "AKIA123",
            secretAccessKey: "aws-secret",
            region: "us-east-1",
            bucket: "demo-bucket",
            sessionToken: "session-token",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://demo-bucket.s3.us-east-1.amazonaws.com/photos/cat.txt");
    expect(init.body).toBe("hello");

    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA123\//);
    expect(headers.get("content-type")).toBe("text/plain");
    expect(headers.get("x-amz-content-sha256")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers.get("x-amz-security-token")).toBe("session-token");
  });

  it("loads explicit AWS STS proxy executors with SigV4 signed RPC bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("aws_sts");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/",
        method: "POST",
        body: {
          RoleArn: "arn:aws:iam::123456789012:role/demo",
          RoleSessionName: "demo-session",
        },
      },
      {
        getCredential: async () =>
          customCredential({
            accessKeyId: "AKIA123",
            secretAccessKey: "aws-secret",
            sessionToken: "source-session-token",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://sts.ap-southeast-1.amazonaws.com/");
    expect((init.headers as Headers).get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA123\//);
    expect((init.headers as Headers).get("content-type")).toBe("application/x-www-form-urlencoded; charset=utf-8");
    expect((init.headers as Headers).get("x-amz-security-token")).toBe("source-session-token");

    const params = new URLSearchParams(String(init.body));
    expect(params.get("Action")).toBe("AssumeRole");
    expect(params.get("Version")).toBe("2011-06-15");
    expect(params.get("RoleArn")).toBe("arn:aws:iam::123456789012:role/demo");
    expect(params.get("RoleSessionName")).toBe("demo-session");
  });

  it("loads explicit Cloudflare R2 proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("cloudflare_r2");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/accounts/account-id/r2/buckets",
        method: "GET",
        query: { per_page: 1 },
      },
      {
        getCredential: async () => customCredential({ apiKey: "cloudflare-token", accountId: "account-id" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.cloudflare.com/client/v4/accounts/account-id/r2/buckets?per_page=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer cloudflare-token");
  });

  it("loads explicit Coinbase proxy executors with CDP JWT auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("coinbase");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v3/brokerage/accounts",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () =>
          apiKeyCredential(coinbasePrivateKey(), {
            keyName: "organizations/org-id/apiKeys/key-id",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.coinbase.com/api/v3/brokerage/accounts?limit=1");

    const authorization = (init.headers as Headers).get("authorization") ?? "";
    expect(authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
    const [, token] = authorization.split(" ");
    const [, payload] = token!.split(".");
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"))).toMatchObject({
      iss: "cdp",
      sub: "organizations/org-id/apiKeys/key-id",
      uri: "GET api.coinbase.com/api/v3/brokerage/accounts?limit=1",
    });
  });

  it("loads explicit AppDrag proxy executors with API keys in JSON bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("appdrag");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/folder/run",
        method: "POST",
        body: { name: "Ada" },
      },
      {
        getCredential: async () => apiKeyCredential("appdrag-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://appdrag.com/api/folder/run");
    expect(init.body).toBe(JSON.stringify({ name: "Ada", APIKey: "appdrag-key" }));
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
  });

  it("loads explicit AppDrag proxy executors with API keys in GET query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("appdrag");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/dev/api/folder/run",
        method: "GET",
        query: { name: "Ada" },
      },
      {
        getCredential: async () => apiKeyCredential("appdrag-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://appdrag.com/dev/api/folder/run?name=Ada&APIKey=appdrag-key");
    expect(init.body).toBeUndefined();
  });

  it("loads explicit Auth0 Management proxy executors with tenant base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("auth0_management");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users",
        method: "GET",
        query: { page: 0, per_page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("auth0-token", { domain: "example.auth0.com" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://example.auth0.com/api/v2/users?page=0&per_page=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer auth0-token");
  });

  it.each(["blaze_meter_functional", "blaze_meter_performance", "blaze_meter_service_virtualization"])(
    "loads explicit %s proxy executors with BlazeMeter Basic auth",
    async (service) => {
      const fetcher = stubProviderFetch();
      const proxy = await new ProviderLoader().loadProxyExecutor(service);

      expect(proxy).toEqual(expect.any(Function));

      await proxy?.(
        {
          endpoint: "/user",
          method: "GET",
          query: { workspaceId: 42 },
        },
        {
          getCredential: async () => apiKeyCredential("bm-secret", { apiKeyId: "bm-id" }),
        },
      );

      const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe("https://a.blazemeter.com/api/v4/user?workspaceId=42");
      expect((init.headers as Headers).get("authorization")).toBe("Basic Ym0taWQ6Ym0tc2VjcmV0");
    },
  );

  it("loads explicit Bluesky proxy executors with AT Protocol session bearer auth", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/xrpc/com.atproto.server.createSession") {
        expect(init?.body).toBe(JSON.stringify({ identifier: "alice.bsky.social", password: "app-password" }));
        return new Response(
          JSON.stringify({
            accessJwt: "access-jwt",
            refreshJwt: "refresh-jwt",
            handle: "alice.bsky.social",
            did: "did:plc:alice",
          }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ displayName: "Alice" }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const proxy = await new ProviderLoader().loadProxyExecutor("bluesky");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/xrpc/app.bsky.actor.getProfile",
        method: "GET",
        query: { actor: "alice.bsky.social" },
      },
      {
        getCredential: async () => apiKeyCredential("app-password", { handle: "alice.bsky.social" }),
      },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]![0])).toBe(
      "https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=alice.bsky.social",
    );
    expect((fetcher.mock.calls[1]![1]!.headers as Headers).get("authorization")).toBe("Bearer access-jwt");
  });

  it("loads explicit BTCPay Server proxy executors with instance token auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("btcpay_server");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/stores",
        method: "GET",
        query: { includeArchived: false },
      },
      {
        getCredential: async () =>
          apiKeyCredential("btcpay-token", { baseUrl: "https://btcpay.example.com/root/api/v1" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://btcpay.example.com/root/api/v1/stores?includeArchived=false");
    expect((init.headers as Headers).get("authorization")).toBe("token btcpay-token");
  });

  it("loads explicit Confluence proxy executors with site Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("confluence");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/spaces",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () =>
          apiKeyCredential("conf-token", {
            baseUrl: "https://acme.atlassian.net/wiki/api/v2",
            email: "user@example.com",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.atlassian.net/wiki/api/v2/spaces?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Basic dXNlckBleGFtcGxlLmNvbTpjb25mLXRva2Vu");
  });

  it("loads explicit Botsonic proxy executors with bot key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("botsonic");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/business/bot-faq/all",
        method: "GET",
        query: { page: 1, size: 5 },
      },
      {
        getCredential: async () => apiKeyCredential("botsonic-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.botsonic.ai/v1/business/bot-faq/all?page=1&size=5");
    expect((init.headers as Headers).get("x-bot-key")).toBe("botsonic-token");
  });

  it("loads explicit Cloudflare Browser Rendering proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("cloudflare_browser_rendering");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/accounts/account-1/browser-rendering/markdown",
        method: "POST",
        body: { url: "https://example.com" },
      },
      {
        getCredential: async () => apiKeyCredential("cloudflare-token", { accountId: "account-1" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.cloudflare.com/client/v4/accounts/account-1/browser-rendering/markdown");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer cloudflare-token");
  });

  it("loads explicit Contentstack Content Delivery proxy executors with stack headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("contentstack_content_delivery");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/content_types",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () =>
          apiKeyCredential("stack-api-key", {
            branch: "main",
            deliveryToken: "delivery-token",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://cdn.contentstack.io/v3/content_types?limit=1");
    const headers = init.headers as Headers;
    expect(headers.get("api_key")).toBe("stack-api-key");
    expect(headers.get("access_token")).toBe("delivery-token");
    expect(headers.get("branch")).toBe("main");
  });

  it("loads explicit Contentstack Content Management proxy executors with management headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("contentstack_content_management");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/content_types/blog/entries",
        method: "POST",
        body: { entry: { title: "Draft" } },
      },
      {
        getCredential: async () =>
          apiKeyCredential("management-token", {
            branch: "main",
            stackApiKey: "stack-api-key",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.contentstack.io/v3/content_types/blog/entries");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("management-token");
    expect(headers.get("api_key")).toBe("stack-api-key");
    expect(headers.get("branch")).toBe("main");
    expect(init.body).toBe(JSON.stringify({ entry: { title: "Draft" } }));
  });

  it("loads explicit Adobe Commerce proxy executors with store-scoped base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("adobe_commerce");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/products",
        method: "GET",
        query: { fields: "items[sku]" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("adobe-token", {
            baseUrl: "https://shop.example.com",
            storeCode: "default",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://shop.example.com/rest/default/V1/products?fields=items%5Bsku%5D");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer adobe-token");
  });

  it("loads explicit Algolia proxy executors with application headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("algolia");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/1/indexes",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("algolia-key", { applicationId: "APPID123" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://appid123.algolia.net/1/indexes");
    expect(Object.fromEntries((init.headers as Headers).entries())).toMatchObject({
      "x-algolia-api-key": "algolia-key",
      "x-algolia-application-id": "APPID123",
    });
  });

  it("loads explicit Alpaca proxy executors for trading and data API bases", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("alpaca");
    const context: ExecutionContext = {
      getCredential: async () =>
        apiKeyCredential("alpaca-secret", {
          apiKeyId: "alpaca-id",
          environment: "paper",
        }),
    };

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.({ endpoint: "/v2/account", method: "GET" }, context);
    await proxy?.({ endpoint: "/v1/corporate-actions", method: "GET" }, context);

    expect((fetcher.mock.calls[0]![0] as URL).toString()).toBe("https://paper-api.alpaca.markets/v2/account");
    expect((fetcher.mock.calls[1]![0] as URL).toString()).toBe("https://data.alpaca.markets/v1/corporate-actions");
    const headers = fetcher.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get("apca-api-key-id")).toBe("alpaca-id");
    expect(headers.get("apca-api-secret-key")).toBe("alpaca-secret");
  });

  it("loads explicit AMap proxy executors with key query authentication", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("amap");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v3/weather/weatherInfo",
        method: "GET",
        query: { city: "110000" },
      },
      {
        getCredential: async () => apiKeyCredential("amap-key"),
      },
    );

    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.toString()).toBe("https://restapi.amap.com/v3/weather/weatherInfo?city=110000&key=amap-key");
  });

  it("loads explicit Ashby proxy executors with Basic API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("ashby");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/apiKey.info",
        method: "POST",
        body: {},
      },
      {
        getCredential: async () => apiKeyCredential("ashby-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.ashbyhq.com/apiKey.info");
    expect((init.headers as Headers).get("authorization")).toBe("Basic YXNoYnkta2V5Og==");
  });

  it("loads explicit Agora proxy executors with customer Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("agora");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/dev/v1/projects",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("agora-secret", { customerId: "agora-cid" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.agora.io/dev/v1/projects");
    expect((init.headers as Headers).get("authorization")).toBe("Basic YWdvcmEtY2lkOmFnb3JhLXNlY3JldA==");
  });

  it("loads explicit AlgoDocs proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("algo_docs");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("algodocs-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.algodocs.com/v1/me");
    expect((init.headers as Headers).get("x-api-key")).toBe("algodocs-key");
  });

  it("loads explicit Autotask proxy executors with zone-scoped headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("autotask");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/Companies/query",
        method: "POST",
        body: { filter: [{ op: "exist", field: "id" }] },
      },
      {
        getCredential: async () =>
          apiKeyCredential("apiuser@example.com", {
            secret: "autotask-secret",
            integrationCode: "tracking-code",
            apiBaseUrl: "https://webservices3.autotask.net/atservicesrest",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://webservices3.autotask.net/atservicesrest/v1.0/Companies/query");
    const headers = init.headers as Headers;
    expect(headers.get("username")).toBe("apiuser@example.com");
    expect(headers.get("secret")).toBe("autotask-secret");
    expect(headers.get("apiintegrationcode")).toBe("tracking-code");
  });

  it("loads explicit BambooHR proxy executors with company Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("bamboohr");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/employees",
        method: "GET",
        query: { fields: "firstName" },
      },
      {
        getCredential: async () => apiKeyCredential("bamboo-key", { companyDomain: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.bamboohr.com/api/v1/employees?fields=firstName");
    expect((init.headers as Headers).get("authorization")).toBe("Basic YmFtYm9vLWtleTp4");
  });

  it("loads explicit Bark proxy executors with device keys in push bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("bark");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/push",
        method: "POST",
        body: { title: "Hello" },
      },
      {
        getCredential: async () => apiKeyCredential("bark-device-key", { baseUrl: "https://bark.example.com/api" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://bark.example.com/api/push");
    expect(JSON.parse(String(init.body))).toMatchObject({
      device_key: "bark-device-key",
      title: "Hello",
    });
  });

  it("loads explicit BaseLinker proxy executors with API token headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("baselinker");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/connector.php",
        method: "POST",
        body: "method=getOrderStatusList&parameters=%7B%7D",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      },
      {
        getCredential: async () => apiKeyCredential("baselinker-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.baselinker.com/connector.php");
    expect((init.headers as Headers).get("x-bltoken")).toBe("baselinker-token");
  });

  it("loads explicit Beehiiv proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("beehiiv");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/publications",
        method: "GET",
        query: { limit: "1" },
      },
      {
        getCredential: async () => apiKeyCredential("beehiiv-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.beehiiv.com/v2/publications?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer beehiiv-key");
  });

  it("loads explicit Beeminder proxy executors with auth token query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("beeminder");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/me.json",
        method: "GET",
        query: { skinny: "true" },
      },
      {
        getCredential: async () => apiKeyCredential("beeminder-token"),
      },
    );

    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.toString()).toBe(
      "https://www.beeminder.com/api/v1/users/me.json?skinny=true&auth_token=beeminder-token",
    );
  });

  it("loads explicit Benchmark Email proxy executors with token and JSON output query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("benchmark_email");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/",
        method: "GET",
        query: { method: "clientGetPlanInfo" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("benchmark-token", {
            baseUrl: "https://api.benchmarkemail.com/1.0",
          }),
      },
    );

    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.toString()).toBe(
      "https://api.benchmarkemail.com/1.0/?method=clientGetPlanInfo&token=benchmark-token&output=json",
    );
  });

  it("loads explicit Best Buy proxy executors with API key and JSON format query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("bestbuy");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/products(sku=12345)",
        method: "GET",
        query: { show: "sku,name" },
      },
      {
        getCredential: async () => apiKeyCredential("bestbuy-key"),
      },
    );

    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.toString()).toBe(
      "https://api.bestbuy.com/v1/products(sku=12345)?show=sku%2Cname&apiKey=bestbuy-key&format=json",
    );
  });

  it("loads explicit BidSketch proxy executors with token authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("bidsketch");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/clients.json",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("bidsketch-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://bidsketch.com/api/v1/clients.json");
    expect((init.headers as Headers).get("authorization")).toBe('Token token="bidsketch-token"');
  });

  it("loads explicit BigCommerce proxy executors with store-scoped base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("big_commerce");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/catalog/products",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("bigcommerce-token", { storeHash: "store123" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.bigcommerce.com/stores/store123/v3/catalog/products");
    expect((init.headers as Headers).get("x-auth-token")).toBe("bigcommerce-token");
  });

  it("loads explicit BigMailer proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("bigmailer");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/brands",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("bigmailer-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.bigmailer.io/v1/brands");
    expect((init.headers as Headers).get("x-api-key")).toBe("bigmailer-key");
  });

  it("loads explicit Bird proxy executors with access key authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("bird");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/workspaces",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("bird-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.bird.com/workspaces");
    expect((init.headers as Headers).get("authorization")).toBe("AccessKey bird-key");
  });

  it("loads explicit Bitquery proxy executors with bearer authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("bitquery");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/graphql",
        method: "POST",
        body: { query: "{ EVM { Blocks { Block { Number } } } }" },
      },
      {
        getCredential: async () => apiKeyCredential("bitquery-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://streaming.bitquery.io/graphql");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer bitquery-token");
  });

  it("loads explicit Booqable proxy executors with company-scoped base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("booqable");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/companies/current",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("booqable-token", { companySlug: "acme-rentals" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme-rentals.booqable.com/api/4/companies/current");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer booqable-token");
  });

  it("loads explicit Bugsnag proxy executors with token authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("bugsnag");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/user",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("bugsnag-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.bugsnag.com/user");
    expect((init.headers as Headers).get("authorization")).toBe("token bugsnag-token");
  });

  it("loads explicit Buildium proxy executors with client id and secret headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("buildium");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/rentals",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("buildium-secret", { clientId: "buildium-client" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.buildium.com/v1/rentals");
    const headers = init.headers as Headers;
    expect(headers.get("x-buildium-client-id")).toBe("buildium-client");
    expect(headers.get("x-buildium-client-secret")).toBe("buildium-secret");
  });

  it("loads explicit Calendly proxy executors with bearer credentials", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("calendly");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("calendly-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.calendly.com/users/me");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer calendly-token");
  });

  it("loads explicit CallRail proxy executors with token authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("callrail");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v3/a.json",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("callrail-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.callrail.com/v3/a.json");
    expect((init.headers as Headers).get("authorization")).toBe('Token token="callrail-key"');
  });

  it("loads explicit Chargebee proxy executors with site-scoped Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("chargebee");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/customers",
        method: "GET",
        query: { limit: "1" },
      },
      {
        getCredential: async () => apiKeyCredential("chargebee-key", { site: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.chargebee.com/api/v2/customers?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Basic Y2hhcmdlYmVlLWtleTo=");
  });

  it("loads explicit ChaserHQ proxy executors with API key Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("chaserhq");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/organisation",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("chaser-key", { apiSecret: "chaser-secret" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://openapi.chaserhq.com/v1/organisation");
    expect((init.headers as Headers).get("authorization")).toBe("Basic Y2hhc2VyLWtleTpjaGFzZXItc2VjcmV0");
  });

  it("loads explicit Cin7 Core proxy executors with account and application headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("cin7_core");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("cin7-application-key", { accountId: "cin7-account" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://inventory.dearsystems.com/ExternalApi/v2/me");
    const headers = init.headers as Headers;
    expect(headers.get("api-auth-accountid")).toBe("cin7-account");
    expect(headers.get("api-auth-applicationkey")).toBe("cin7-application-key");
  });

  it("loads explicit ClickSend proxy executors with username Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("clicksend");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/account",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("clicksend-key", { username: "clicksend-user" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://rest.clicksend.com/v3/account");
    expect((init.headers as Headers).get("authorization")).toBe("Basic Y2xpY2tzZW5kLXVzZXI6Y2xpY2tzZW5kLWtleQ==");
  });

  it("loads explicit ClickUp proxy executors with personal token authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("clickup");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/user",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("clickup-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.clickup.com/api/v2/user");
    expect((init.headers as Headers).get("authorization")).toBe("clickup-token");
  });

  it("loads explicit Cloudinary proxy executors with cloud-scoped Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("cloudinary");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/resources/image/upload",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("cloudinary-key", {
            apiSecret: "cloudinary-secret",
            cloudName: "demo",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.cloudinary.com/v1_1/demo/resources/image/upload");
    expect((init.headers as Headers).get("authorization")).toBe("Basic Y2xvdWRpbmFyeS1rZXk6Y2xvdWRpbmFyeS1zZWNyZXQ=");
  });

  it("loads explicit Canny proxy executors with API keys in JSON bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("canny");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/posts/list",
        method: "POST",
        body: { boardID: "board_1" },
      },
      {
        getCredential: async () => apiKeyCredential("canny-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://canny.io/api/v1/posts/list");
    expect(JSON.parse(String(init.body))).toMatchObject({
      apiKey: "canny-key",
      boardID: "board_1",
    });
  });

  it("loads explicit Certn proxy executors with region base URLs and Api-Key authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("certn");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/public/cases/",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("certn-key", { region: "sandbox" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.sandbox.certn.co/api/public/cases/");
    expect((init.headers as Headers).get("authorization")).toBe("Api-Key certn-key");
  });

  it("loads explicit Conductor proxy executors with token authorization", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("conductor");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2/entities/websites",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("conductor-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.cm.conductor.com/v2/entities/websites");
    expect((init.headers as Headers).get("authorization")).toBe("token conductor-token");
  });

  it("loads explicit Crisp proxy executors with token Basic auth and tier headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("crisp");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/website/site_1",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("crisp-key", {
            tokenIdentifier: "crisp-id",
            websiteId: "site_1",
            tokenTier: "plugin",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.crisp.chat/v1/website/site_1");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Basic Y3Jpc3AtaWQ6Y3Jpc3Ata2V5");
    expect(headers.get("x-crisp-tier")).toBe("plugin");
  });

  it("loads explicit Cronitor proxy executors with Basic auth and API version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("cronitor");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/monitors",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("cronitor-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://cronitor.io/api/monitors");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Basic Y3Jvbml0b3Ita2V5Og==");
    expect(headers.get("cronitor-version")).toBe("2025-11-28");
  });

  it("loads explicit Customer.io proxy executors with region base URLs and Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("customerio");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/customers/customer_1",
        method: "PUT",
        body: { email: "test@example.com" },
      },
      {
        getCredential: async () =>
          customCredential({
            siteId: "cio-site",
            apiKey: "cio-key",
            region: "eu",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://track-eu.customer.io/api/v1/customers/customer_1");
    expect((init.headers as Headers).get("authorization")).toBe("Basic Y2lvLXNpdGU6Y2lvLWtleQ==");
  });

  it("loads explicit ClickHouse proxy executors with custom Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("clickhouse");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/",
        method: "POST",
        body: "SELECT 1",
      },
      {
        getCredential: async () =>
          customCredential({
            baseUrl: "https://clickhouse.example.com:8443",
            username: "default",
            password: "clickhouse-pass",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://clickhouse.example.com:8443/");
    expect((init.headers as Headers).get("authorization")).toBe("Basic ZGVmYXVsdDpjbGlja2hvdXNlLXBhc3M=");
  });
});
