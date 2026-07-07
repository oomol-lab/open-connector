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

describe("ProviderLoader proxy executors (H-M)", () => {
  it("loads explicit Habitica proxy executors with user headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("habitica");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/user",
        method: "GET",
        query: { userFields: "profile" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("habitica-key", {
            userId: "habitica-user",
            xClient: "client-id-app",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://habitica.com/api/v3/user?userFields=profile");
    const headers = init.headers as Headers;
    expect(headers.get("x-api-key")).toBe("habitica-key");
    expect(headers.get("x-api-user")).toBe("habitica-user");
    expect(headers.get("x-client")).toBe("client-id-app");
  });

  it("loads explicit HelloLeads proxy executors with web form keys in query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("helloleads");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/index.php/api/event/eventAutoFormFields",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("helloleads-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.helloleads.io/index.php/api/event/eventAutoFormFields?key=helloleads-key");
    expect(init.body).toBeUndefined();
  });

  it("loads explicit Help Scout Docs proxy executors with Basic API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("helpscout_docs");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/sites",
        method: "GET",
        query: { page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("helpscout-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://docsapi.helpscout.net/v1/sites?page=1");
    expect((init.headers as Headers).get("authorization")).toBe("Basic aGVscHNjb3V0LWtleTpY");
  });

  it("loads explicit Higgsfield AI proxy executors with key secret auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("higgsfield_ai");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/requests/request-1/status",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("higgsfield-key", { apiSecret: "higgsfield-secret" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://platform.higgsfield.ai/requests/request-1/status");
    expect((init.headers as Headers).get("authorization")).toBe("Key higgsfield-key:higgsfield-secret");
  });

  it("loads explicit Hookdeck proxy executors with versioned bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("hookdeck");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/sources",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("hookdeck-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.hookdeck.com/2025-07-01/sources?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer hookdeck-key");
  });

  it("loads explicit HTML/CSS to Image proxy executors with user Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("htmlcsstoimage");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/usage",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("hcti-key", { userId: "hcti-user" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://hcti.io/v1/usage");
    expect((init.headers as Headers).get("authorization")).toBe("Basic aGN0aS11c2VyOmhjdGkta2V5");
  });

  it("loads explicit ImageKit proxy executors with Basic API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("imagekit");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/files",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("imagekit-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.imagekit.io/v1/files?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Basic aW1hZ2VraXQta2V5Og==");
  });

  it("loads explicit IPQualityScore proxy executors with API keys in path segments", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("ipqualityscore");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/json/ip/8.8.8.8",
        method: "GET",
        query: { strictness: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("ipqs-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://www.ipqualityscore.com/api/json/ip/ipqs-key/8.8.8.8?strictness=1");
    expect(init.body).toBeUndefined();
  });

  it("loads explicit Ipregistry proxy executors with ApiKey auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("ipregistry");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/8.8.8.8",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("ipregistry-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.ipregistry.co/8.8.8.8");
    expect((init.headers as Headers).get("authorization")).toBe("ApiKey ipregistry-key");
  });

  it("loads explicit IMA proxy executors with custom client headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("ima");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/openapi/note/v1/list_notebook",
        method: "POST",
        body: { cursor: "0", limit: 1 },
      },
      {
        getCredential: async () =>
          customCredential({
            clientId: "ima-client",
            apiKey: "ima-key",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://ima.qq.com/openapi/note/v1/list_notebook");
    const headers = init.headers as Headers;
    expect(headers.get("ima-openapi-clientid")).toBe("ima-client");
    expect(headers.get("ima-openapi-apikey")).toBe("ima-key");
    expect(init.body).toBe(JSON.stringify({ cursor: "0", limit: 1 }));
  });

  it("loads explicit IPinfo proxy executors with lite API bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("ipinfo_io");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/lite/8.8.8.8",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("ipinfo-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.ipinfo.io/lite/8.8.8.8");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer ipinfo-token");
  });

  it("loads explicit IQAir AirVisual proxy executors with API keys in query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("iqair_airvisual");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/countries",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("iqair-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.airvisual.com/v2/countries?key=iqair-key");
    expect(init.body).toBeUndefined();
  });

  it("loads explicit IT Glue proxy executors with regional API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("it_glue");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users",
        method: "GET",
        query: { "page[size]": 1 },
      },
      {
        getCredential: async () => apiKeyCredential("itglue-key", { region: "eu" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.eu.itglue.com/users?page%5Bsize%5D=1");
    expect((init.headers as Headers).get("x-api-key")).toBe("itglue-key");
  });

  it("loads explicit Jimeng AI proxy executors with Volcengine signed requests", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("jimeng_ai");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/",
        method: "POST",
        query: {
          Action: "CVSync2AsyncSubmitTask",
          Version: "2022-08-31",
        },
        body: {
          req_key: "jimeng_t2i_v40",
          prompt: "Draw a mountain",
        },
      },
      {
        getCredential: async () =>
          customCredential({
            accessKeyId: "jimeng-ak",
            secretAccessKey: "jimeng-sk",
            sessionToken: "jimeng-session",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://visual.volcengineapi.com/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31");
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-security-token")).toBe("jimeng-session");
    expect(headers.get("authorization")).toContain("Credential=jimeng-ak/");
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=content-type;host;x-content-sha256;x-date;x-security-token",
    );
    expect(init.body).toBe(JSON.stringify({ req_key: "jimeng_t2i_v40", prompt: "Draw a mountain" }));
  });

  it("loads explicit Jin10 proxy executors with MCP bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("jin10");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/mcp",
        method: "POST",
        body: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        },
      },
      {
        getCredential: async () => apiKeyCredential("jin10-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://mcp.jin10.com/mcp");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer jin10-key");
  });

  it("loads explicit Jira proxy executors with OAuth cloud site base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("jira");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/project/search",
        method: "GET",
        query: { maxResults: 1 },
      },
      {
        getCredential: async () => ({
          ...oauthCredential("jira-token"),
          metadata: { cloudId: "cloud-1" },
        }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/project/search?maxResults=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer jira-token");
  });

  it("loads explicit Jotform proxy executors with APIKEY headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("jotform");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/user",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("jotform-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.jotform.com/user");
    expect((init.headers as Headers).get("apikey")).toBe("jotform-key");
  });

  it("loads explicit JSONBin proxy executors with master key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("jsonbin");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/b",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("jsonbin-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.jsonbin.io/v3/b");
    expect((init.headers as Headers).get("x-master-key")).toBe("jsonbin-key");
  });

  it("loads explicit JumpCloud proxy executors with regional org headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("jumpcloud");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/systemusers",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("jumpcloud-key", { region: "eu", orgId: "org-1" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://console.eu.jumpcloud.com/api/systemusers?limit=1");
    const headers = init.headers as Headers;
    expect(headers.get("x-api-key")).toBe("jumpcloud-key");
    expect(headers.get("x-org-id")).toBe("org-1");
  });

  it("loads explicit Keeper SCIM proxy executors with node bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("keeper_scim");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/Users",
        method: "GET",
        query: { count: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("keeper-token", { region: "eu", nodeId: "node-1" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://keepersecurity.eu/api/rest/scim/v2/node-1/Users?count=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer keeper-token");
  });

  it("loads explicit Kintone proxy executors with subdomain bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("kintone");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/users.json",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("kintone-token", { subdomain: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.kintone.com/v1/users.json");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer kintone-token");
  });

  it("loads explicit Klaviyo proxy executors with API revision headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("klaviyo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/profiles/",
        method: "GET",
        query: { "page[size]": 1 },
      },
      {
        getCredential: async () => apiKeyCredential("klaviyo-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://a.klaviyo.com/api/profiles/?page%5Bsize%5D=1");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Klaviyo-API-Key klaviyo-key");
    expect(headers.get("revision")).toBe("2026-04-15");
  });

  it("loads explicit Kommo proxy executors with account bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("kommo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v4/leads",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("kommo-token", { subdomain: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.kommo.com/api/v4/leads");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer kommo-token");
  });

  it("loads explicit Leexi proxy executors with key pair Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("leexi");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users",
        method: "GET",
        query: { page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("leexi-secret", { keyId: "leexi-id" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://public-api.leexi.ai/v1/users?page=1");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("leexi-id:leexi-secret")}`);
  });

  it("loads explicit lemlist proxy executors with password-only Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("lemlist");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/team",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("lemlist-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.lemlist.com/api/team");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa(":lemlist-key")}`);
  });

  it("loads explicit Lessonspace proxy executors with organisation auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("lessonspace");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/hello/",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("lessonspace-key", { organisationId: "org-1" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.thelessonspace.com/v2/hello/");
    expect((init.headers as Headers).get("authorization")).toBe("Organisation lessonspace-key");
  });

  it("loads explicit Lever proxy executors with username-only Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("lever");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/postings",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("lever-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.lever.co/v1/postings?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("lever-key:")}`);
  });

  it("loads explicit Linear proxy executors with raw API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("linear");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/graphql",
        method: "POST",
        body: { query: "{ viewer { id } }" },
      },
      {
        getCredential: async () => apiKeyCredential("linear-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.linear.app/graphql");
    expect((init.headers as Headers).get("authorization")).toBe("linear-key");
  });

  it("loads explicit Linear proxy executors with OAuth bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("linear");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/graphql",
        method: "POST",
        body: { query: "{ viewer { id } }" },
      },
      {
        getCredential: async () => oauthCredential("linear-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.linear.app/graphql");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer linear-token");
  });

  it("loads explicit Linguapop proxy executors with API keys in JSON bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("linguapop");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/actions/sendInvitation",
        method: "POST",
        body: { email: "ada@example.com" },
      },
      {
        getCredential: async () => apiKeyCredential("linguapop-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.linguapop.eu/api/actions/sendInvitation");
    expect(init.body).toBe(JSON.stringify({ email: "ada@example.com", apiKey: "linguapop-key" }));
  });

  it("loads explicit LinkedIn proxy executors with REST version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("linkedin");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/rest/posts",
        method: "POST",
        body: { commentary: "hello" },
      },
      {
        getCredential: async () => oauthCredential("linkedin-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.linkedin.com/rest/posts");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer linkedin-token");
    expect(headers.get("linkedin-version")).toBe("202605");
    expect(headers.get("x-restli-protocol-version")).toBe("2.0.0");
  });

  it("loads explicit Loops proxy executors with API v1 bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("loops");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/contacts/create",
        method: "POST",
        body: { email: "ada@example.com" },
      },
      {
        getCredential: async () => apiKeyCredential("loops-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.loops.so/api/v1/contacts/create");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer loops-key");
  });

  it("loads explicit Mailchimp proxy executors with data-center Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("mailchimp");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/lists",
        method: "GET",
        query: { count: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("mailchimp-key-us20"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://us20.api.mailchimp.com/3.0/lists?count=1");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("connect:mailchimp-key-us20")}`);
  });

  it("loads explicit Mailgun proxy executors with regional Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("mailgun");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v4/domains",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("mailgun-key", { apiBaseUrl: "https://api.eu.mailgun.net" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.eu.mailgun.net/v4/domains?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("api:mailgun-key")}`);
  });

  it("loads explicit Mailjet proxy executors with key secret Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("mailjet");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/contact",
        method: "GET",
        query: { Limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("mailjet-key", { apiSecret: "mailjet-secret" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.mailjet.com/v3/REST/contact?Limit=1");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("mailjet-key:mailjet-secret")}`);
  });

  it("loads explicit Mailosaur proxy executors with api user Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("mailosaur");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/servers",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("mailosaur-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://mailosaur.com/api/servers");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("api:mailosaur-key")}`);
  });

  it("loads explicit Manatal proxy executors with Token auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("manatal");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/",
        method: "GET",
        query: { page_size: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("manatal-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.manatal.com/open/v3/users/?page_size=1");
    expect((init.headers as Headers).get("authorization")).toBe("Token manatal-key");
  });

  it("loads explicit Mattermost proxy executors with instance bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("mattermost");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/me",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("mattermost-token", { instanceUrl: "https://chat.example.com/root" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://chat.example.com/root/api/v4/users/me");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer mattermost-token");
  });

  it("loads explicit MeetGeek proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("meet_geek");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/meetings",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("meetgeek-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.meetgeek.ai/v1/meetings?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer meetgeek-key");
  });

  it("loads explicit Meta proxy executors with Graph API bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("meta");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/me",
        method: "GET",
        query: { fields: "id,name" },
      },
      {
        getCredential: async () => apiKeyCredential("meta-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://graph.facebook.com/v25.0/me?fields=id%2Cname");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer meta-token");
  });

  it("loads explicit Metabase proxy executors with instance API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("metabase");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/database",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("metabase-key", { instanceUrl: "https://metabase.example.com/root" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://metabase.example.com/root/api/database");
    expect((init.headers as Headers).get("x-api-key")).toBe("metabase-key");
  });

  it("loads explicit Mixpanel proxy executors with service account Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("mixpanel");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/query/cohorts/list",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("mixpanel-secret", {
            projectId: "123",
            serviceAccountUsername: "mixpanel-service",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://mixpanel.com/api/query/cohorts/list");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${btoa("mixpanel-service:mixpanel-secret")}`);
  });

  it("loads explicit monday proxy executors with raw token auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("monday");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2",
        method: "POST",
        body: { query: "{ me { id } }" },
      },
      {
        getCredential: async () => apiKeyCredential("monday-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.monday.com/v2");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("monday-token");
    expect(headers.get("api-version")).toBe("2026-04");
  });

  it("loads explicit MongoDB Atlas proxy executors with Digest auth", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (!(init?.headers as Headers | undefined)?.get("authorization")) {
        return new Response(null, {
          status: 401,
          headers: {
            "www-authenticate": 'Digest realm="atlas", nonce="nonce-1", qop="auth"',
          },
        });
      }
      return new Response(JSON.stringify({ results: [] }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const proxy = await new ProviderLoader().loadProxyExecutor("mongo_db_atlas_administration");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/groups",
        method: "GET",
        query: { itemsPerPage: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("atlas-public", { privateKey: "atlas-private" }),
      },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(url.toString()).toBe("https://cloud.mongodb.com/api/atlas/v2/groups?itemsPerPage=1");
    const authorization = (init.headers as Headers).get("authorization");
    expect(authorization).toContain('Digest username="atlas-public"');
    expect(authorization).toContain('realm="atlas"');
  });

  it("loads explicit Mopinion proxy executors with signed auth tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("mopinion");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/account",
        method: "GET",
      },
      {
        getCredential: async () =>
          customCredential({
            publicKey: "mopinion-public",
            signatureToken: "mopinion-signature",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.mopinion.com/account");
    const headers = init.headers as Headers;
    expect(headers.get("version")).toBe("3.0.0");
    expect(headers.get("x-auth-token")).toEqual(expect.any(String));
  });
});
