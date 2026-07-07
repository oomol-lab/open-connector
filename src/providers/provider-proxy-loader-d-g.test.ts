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

describe("ProviderLoader proxy executors (D-G)", () => {
  it("loads explicit Dropbox proxy executors with OAuth bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("dropbox");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/get_current_account",
        method: "POST",
        body: {},
      },
      {
        getCredential: async () => oauthCredential("dropbox-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.dropboxapi.com/2/users/get_current_account");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer dropbox-token");
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
  });

  it("loads explicit Dropbox proxy executors for content API routes", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("dropbox");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/files/upload",
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "dropbox-api-arg": JSON.stringify({ path: "/hello.txt" }),
        },
        body: "hello",
      },
      {
        getCredential: async () => oauthCredential("dropbox-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://content.dropboxapi.com/2/files/upload");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer dropbox-token");
    expect((init.headers as Headers).get("dropbox-api-arg")).toBe(JSON.stringify({ path: "/hello.txt" }));
    expect(init.body).toBe("hello");
  });

  it("loads explicit Foxit Cloud API proxy executors with signed query auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("fuxin");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/user/stock",
        method: "GET",
      },
      {
        getCredential: async () => customCredential({ clientId: "fuxin-client", secret: "fuxin-secret" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://servicesapi.foxitsoftware.cn/api/user/stock?clientId=fuxin-client&sn=8511ab7656267e178a69af1918e49f81",
    );
    expect((init.headers as Headers).get("user-agent")).toBe("oomol-connect/0.1");
  });

  it("loads explicit Discourse proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("discourse");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/latest.json",
        method: "GET",
        query: { per_page: 10 },
      },
      {
        getCredential: async () =>
          apiKeyCredential("discourse-key", {
            apiUsername: "system",
            baseUrl: "https://forum.example.com",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://forum.example.com/latest.json?per_page=10");
    const headers = init.headers as Headers;
    expect(headers.get("api-key")).toBe("discourse-key");
    expect(headers.get("api-username")).toBe("system");
  });

  it("loads explicit Discord Bot proxy executors with Bot token auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("discordbot");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/applications/@me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("discord-bot-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://discord.com/api/applications/@me");
    expect((init.headers as Headers).get("authorization")).toBe("Bot discord-bot-token");
  });

  it("loads explicit DingTalk Bot proxy executors with webhook access tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("dingtalk_bot");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/robot/send",
        method: "POST",
        body: { msgtype: "text", text: { content: "hello" } },
      },
      {
        getCredential: async () => apiKeyCredential("dingtalk-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://oapi.dingtalk.com/robot/send?access_token=dingtalk-token");
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
  });

  it("loads explicit Docker Hub proxy executors with exchanged bearer tokens", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/v2/auth/token") {
        expect(init?.body).toBe(JSON.stringify({ identifier: "docker-user", secret: "docker-secret" }));
        return new Response(JSON.stringify({ access_token: "docker-access-token" }), {
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ results: [] }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const proxy = await new ProviderLoader().loadProxyExecutor("docker_hub");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2/namespaces/library/repositories",
        method: "GET",
        query: { name: "node" },
      },
      {
        getCredential: async () => apiKeyCredential("docker-user:docker-secret"),
      },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]![0])).toBe(
      "https://hub.docker.com/v2/namespaces/library/repositories?name=node",
    );
    expect((fetcher.mock.calls[1]![1]!.headers as Headers).get("authorization")).toBe("Bearer docker-access-token");
  });

  it("loads explicit Docmosis proxy executors with access keys in JSON bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("docmosis");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/environment/summary",
        method: "POST",
        body: { includeStorage: true },
      },
      {
        getCredential: async () =>
          apiKeyCredential("docmosis-key", {
            apiBaseUrl: "https://us1.dws4.docmosis.com/api",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://us1.dws4.docmosis.com/api/environment/summary");
    expect(init.body).toBe(JSON.stringify({ includeStorage: true, accessKey: "docmosis-key" }));
  });

  it("loads explicit Docparser proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("docparser");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/parsers",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("docparser-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.docparser.com/v1/parsers");
    expect((init.headers as Headers).get("api_key")).toBe("docparser-key");
  });

  it("loads explicit DocRaptor proxy executors with Basic API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("docraptor");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/docs",
        method: "POST",
        body: { doc: { test: true } },
      },
      {
        getCredential: async () => apiKeyCredential("raptor-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://docraptor.com/docs");
    expect((init.headers as Headers).get("authorization")).toBe("Basic cmFwdG9yLWtleTo=");
  });

  it("loads explicit DocsBot AI proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("docsbot_ai");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/teams",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("docsbot-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://docsbot.ai/api/teams");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer docsbot-key");
  });

  it("loads explicit Doppler proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("doppler");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v3/projects",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("doppler-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.doppler.com/v3/projects");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer doppler-token");
  });

  it("loads explicit Docsend2PDF proxy executors without auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("docsend_2_pdf");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/convert",
        method: "POST",
        body: { url: "https://docsend.com/view/example" },
      },
      {
        getCredential: async () => undefined,
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://docsend2pdf.com/api/convert");
    expect((init.headers as Headers).get("authorization")).toBeNull();
  });

  it("loads explicit Drata proxy executors with region bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("drata");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/company",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("drata-key", { region: "eu" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://public-api.eu.drata.com/public/v2/company");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer drata-key");
  });

  it("loads explicit Dropbox Sign proxy executors with Basic API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("dropbox_sign");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/account",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("sign-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.hellosign.com/v3/account");
    expect((init.headers as Headers).get("authorization")).toBe("Basic c2lnbi1rZXk6");
  });

  it("loads explicit Dynatrace proxy executors with environment API token auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("dynatrace");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/problems",
        method: "GET",
        query: { pageSize: 1 },
      },
      {
        getCredential: async () =>
          apiKeyCredential("dynatrace-token", { environmentUrl: "https://abc.live.dynatrace.com/" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://abc.live.dynatrace.com/api/v2/problems?pageSize=1");
    expect((init.headers as Headers).get("authorization")).toBe("Api-Token dynatrace-token");
  });

  it("loads explicit ElevenLabs proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("elevenlabs");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/user",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("elevenlabs-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.elevenlabs.io/v1/user");
    expect((init.headers as Headers).get("xi-api-key")).toBe("elevenlabs-key");
  });

  it("loads explicit Eagle Doc proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("eagle_doc");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/usage/v1/current",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("eagle-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://de.eagle-doc.com/api/usage/v1/current");
    expect((init.headers as Headers).get("api-key")).toBe("eagle-key");
  });

  it("loads explicit Encharge proxy executors with token headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("encharge");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/emails/send",
        method: "POST",
        body: { to: "test@example.com" },
      },
      {
        getCredential: async () => apiKeyCredential("encharge-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.encharge.io/v1/emails/send");
    expect((init.headers as Headers).get("x-encharge-token")).toBe("encharge-token");
  });

  it("loads explicit ERPNext proxy executors with token auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("erpnext");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/method/frappe.auth.get_logged_user",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("erp-key", {
            apiSecret: "erp-secret",
            baseUrl: "https://erp.example.com",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://erp.example.com/api/method/frappe.auth.get_logged_user");
    expect((init.headers as Headers).get("authorization")).toBe("token erp-key:erp-secret");
  });

  it("loads explicit eSignatures.io proxy executors with Basic API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("esignatures_io");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/templates",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("esign-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://esignatures.com/api/templates");
    expect((init.headers as Headers).get("authorization")).toBe("Basic ZXNpZ24ta2V5Og==");
  });

  it("loads explicit ExpoFP proxy executors with tokens in JSON bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("expofp");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/list-events",
        method: "POST",
        body: { include_archived: false },
      },
      {
        getCredential: async () => apiKeyCredential("expofp-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.expofp.com/api/v1/list-events");
    expect(init.body).toBe(JSON.stringify({ include_archived: false, token: "expofp-token" }));
  });

  it("loads explicit Figma proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("figma");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/me",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("figma-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.figma.com/v1/me");
    expect((init.headers as Headers).get("x-figma-token")).toBe("figma-token");
  });

  it("loads explicit Files.com proxy executors with subdomain API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("files_com");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/me.json",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("files-key", { subdomain: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.files.com/api/rest/v1/users/me.json");
    expect((init.headers as Headers).get("x-filesapi-key")).toBe("files-key");
  });

  it("loads explicit Fillout proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("fillout");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/api/forms",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("fillout-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.fillout.com/v1/api/forms");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer fillout-key");
  });

  it("loads explicit Findymail proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("findymail");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/credits",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("findy-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.findymail.com/api/credits");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer findy-key");
  });

  it("loads explicit Firstbase proxy executors with ApiKey auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("firstbase");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/inventory",
        method: "GET",
        query: { page: 1, size: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("firstbase-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://apipub.firstbasehq.com/api/v1/inventory?page=1&size=1");
    expect((init.headers as Headers).get("authorization")).toBe("ApiKey firstbase-key");
  });

  it("loads explicit Databricks proxy executors with workspace bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("databricks");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/2.0/workspace/list",
        method: "GET",
        query: { path: "/" },
      },
      {
        getCredential: async () =>
          apiKeyCredential("databricks-token", { host: "https://dbc-123.cloud.databricks.com" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://dbc-123.cloud.databricks.com/api/2.0/workspace/list?path=%2F");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer databricks-token");
  });

  it("loads explicit Datadog proxy executors with API and application key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("datadog");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/monitor",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("datadog-api-key", {
            applicationKey: "datadog-app-key",
            site: "eu",
            baseUrl: "https://api.datadoghq.eu",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.datadoghq.eu/api/v1/monitor");
    const headers = init.headers as Headers;
    expect(headers.get("dd-api-key")).toBe("datadog-api-key");
    expect(headers.get("dd-application-key")).toBe("datadog-app-key");
  });

  it("loads explicit DataForSEO proxy executors with custom Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("dataforseo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/appendix/user_data",
        method: "GET",
      },
      {
        getCredential: async () =>
          customCredential({
            login: "data-login",
            password: "data-password",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.dataforseo.com/v3/appendix/user_data");
    expect((init.headers as Headers).get("authorization")).toBe("Basic ZGF0YS1sb2dpbjpkYXRhLXBhc3N3b3Jk");
  });

  it("loads explicit Diffbot proxy executors with token query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("diffbot");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v3/article",
        method: "GET",
        query: { url: "https://www.example.com/" },
      },
      {
        getCredential: async () => apiKeyCredential("diffbot-token"),
      },
    );

    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.toString()).toBe(
      "https://api.diffbot.com/v3/article?url=https%3A%2F%2Fwww.example.com%2F&token=diffbot-token",
    );
  });

  it("loads explicit Discord proxy executors with OAuth bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("discord");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/users/@me",
        method: "GET",
      },
      {
        getCredential: async () => oauthCredential("discord-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://discord.com/api/users/@me");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer discord-token");
  });

  it("loads explicit Feishu App Bot proxy executors with tenant access tokens", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/open-apis/auth/v3/tenant_access_token/internal") {
        expect(init?.body).toBe(JSON.stringify({ app_id: "feishu-app-id", app_secret: "feishu-app-secret" }));
        return new Response(
          JSON.stringify({
            code: 0,
            tenant_access_token: "tenant-token",
            expire: 7200,
          }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ code: 0, data: { items: [] } }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const proxy = await new ProviderLoader().loadProxyExecutor("feishu_app_bot");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/im/v1/messages",
        method: "GET",
        query: {
          container_id_type: "chat",
          container_id: "chat-id",
        },
      },
      {
        getCredential: async () =>
          customCredential({
            appId: "feishu-app-id",
            appSecret: "feishu-app-secret",
          }),
      },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]![0])).toBe(
      "https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=chat-id",
    );
    expect((fetcher.mock.calls[1]![1]!.headers as Headers).get("authorization")).toBe("Bearer tenant-token");
  });

  it("loads explicit Feishu Custom Bot proxy executors with signed webhook bodies", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("feishu_custom_bot");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/open-apis/bot/v2/hook",
        method: "POST",
        headers: { "x-request-id": "request-1" },
        body: {
          msg_type: "text",
          content: { text: "hello" },
        },
      },
      {
        getCredential: async () => apiKeyCredential("hook-token", { signingSecret: "feishu-secret" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://open.feishu.cn/open-apis/bot/v2/hook/hook-token");
    expect((init.headers as Headers).get("x-request-id")).toBe("request-1");
    expect(JSON.parse(String(init.body))).toEqual({
      timestamp: "1700000000",
      sign: "OrBzY1Y01Gq+HgJsl+7OfWcMVwc7YocohQm5iiZwjhU=",
      msg_type: "text",
      content: { text: "hello" },
    });
  });

  it("loads explicit flomo proxy executors with incoming webhook URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("flomo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/iwh",
        method: "POST",
        body: { content: "hello flomo" },
      },
      {
        getCredential: async () => apiKeyCredential("https://flomoapp.com/iwh/webhook-token"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://flomoapp.com/iwh/webhook-token");
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ content: "hello flomo" }));
  });

  it("loads explicit flomo proxy executors with MCP bearer tokens", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("flomo");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/mcp",
        method: "POST",
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 },
      },
      {
        getCredential: async () => customCredential({ token: "flomo-mcp-token" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://flomoapp.com/mcp");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer flomo-mcp-token");
    expect(init.body).toBe(JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }));
  });

  it("loads explicit Formsite proxy executors with configured API base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("formsite");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/user123/forms",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () =>
          apiKeyCredential("formsite-token", { apiBaseUrl: "https://fs8.formsite.com/api/v2" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://fs8.formsite.com/api/v2/user123/forms?limit=1");
    expect((init.headers as Headers).get("authorization")).toBe("bearer formsite-token");
  });

  it("loads explicit Foursquare proxy executors with fsq3 auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("foursquare");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v3/places/search",
        method: "GET",
        query: { query: "coffee", near: "New York, NY" },
      },
      {
        getCredential: async () => apiKeyCredential("foursquare-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.foursquare.com/v3/places/search?query=coffee&near=New+York%2C+NY");
    expect((init.headers as Headers).get("authorization")).toBe("fsq3 foursquare-key");
  });

  it("loads explicit FraudLabs Pro proxy executors with API keys in GET query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("fraudlabspro");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/order/result",
        method: "GET",
        query: { id: "order-1" },
      },
      {
        getCredential: async () => apiKeyCredential("fraudlabs-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://api.fraudlabspro.com/v2/order/result?key=fraudlabs-key&format=json&id=order-1",
    );
    expect(init.body).toBeUndefined();
  });

  it("loads explicit FraudLabs Pro proxy executors with API keys in POST bodies", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("fraudlabspro");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/order/screen",
        method: "POST",
        body: { ip: "203.0.113.1" },
      },
      {
        getCredential: async () => apiKeyCredential("fraudlabs-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.fraudlabspro.com/v2/order/screen");
    expect(init.body).toBe(JSON.stringify({ key: "fraudlabs-key", format: "json", ip: "203.0.113.1" }));
  });

  it("loads explicit Freshdesk proxy executors with site Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("freshdesk");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/tickets",
        method: "GET",
        query: { per_page: 10 },
      },
      {
        getCredential: async () => apiKeyCredential("freshdesk-key", { domain: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.freshdesk.com/api/v2/tickets?per_page=10");
    expect((init.headers as Headers).get("authorization")).toBe("Basic ZnJlc2hkZXNrLWtleTpY");
  });

  it("loads explicit Freshservice proxy executors with site Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("freshservice");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v2/tickets",
        method: "GET",
        query: { per_page: 10 },
      },
      {
        getCredential: async () => apiKeyCredential("freshservice-key", { domain: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.freshservice.com/api/v2/tickets?per_page=10");
    expect((init.headers as Headers).get("authorization")).toBe("Basic ZnJlc2hzZXJ2aWNlLWtleTpY");
  });

  it("loads explicit FullEnrich proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("fullenrich");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/account/credits",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("fullenrich-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.fullenrich.com/api/v2/account/credits");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer fullenrich-key");
  });

  it("loads explicit Geoapify proxy executors with API keys in query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("geoapify");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v1/geocode/search",
        method: "GET",
        query: { text: "Berlin" },
      },
      {
        getCredential: async () => apiKeyCredential("geoapify-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.geoapify.com/v1/geocode/search?text=Berlin&apiKey=geoapify-key");
    expect(init.body).toBeUndefined();
  });

  it("loads explicit GetProspect proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("getprospect");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2/email-verifier",
        method: "GET",
        query: { email: "ada@example.com" },
      },
      {
        getCredential: async () => apiKeyCredential("getprospect-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.getprospect.com/v2/email-verifier?email=ada%40example.com");
    expect((init.headers as Headers).get("apiKey")).toBe("getprospect-key");
  });

  it("loads explicit Ghost proxy executors with content API key query parameters", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("ghost");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/posts/",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("ghost-key", { siteUrl: "https://blog.example.com" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://blog.example.com/ghost/api/content/v5.0/posts/?limit=1&key=ghost-key");
    expect(init.body).toBeUndefined();
  });

  it("loads explicit Gitea proxy executors with instance token auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("gitea");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/user",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("gitea-token", { baseUrl: "https://git.example.com/root" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://git.example.com/root/api/v1/user");
    expect((init.headers as Headers).get("authorization")).toBe("token gitea-token");
  });

  it("loads explicit Givebutter proxy executors with bearer auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("givebutter");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/campaigns",
        method: "GET",
        query: { per_page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("givebutter-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.givebutter.com/v1/campaigns?per_page=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer givebutter-key");
  });

  it("loads explicit Gladia proxy executors with API key headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("gladia");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2/pre-recorded",
        method: "GET",
        query: { limit: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("gladia-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.gladia.io/v2/pre-recorded?limit=1");
    expect((init.headers as Headers).get("x-gladia-key")).toBe("gladia-key");
  });

  it("loads explicit Gong proxy executors with custom Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("gong");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/v2/users",
        method: "GET",
      },
      {
        getCredential: async () =>
          customCredential({
            apiBaseUrl: "https://api.gong.io",
            accessKey: "gong-access",
            accessKeySecret: "gong-secret",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.gong.io/v2/users");
    expect((init.headers as Headers).get("authorization")).toBe("Basic Z29uZy1hY2Nlc3M6Z29uZy1zZWNyZXQ=");
  });

  it("loads explicit Gorgias proxy executors with account Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("gorgias");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/customers",
        method: "GET",
      },
      {
        getCredential: async () =>
          apiKeyCredential("gorgias-key", {
            domain: "acme",
            email: "agent@example.com",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.gorgias.com/api/customers");
    expect((init.headers as Headers).get("authorization")).toBe("Basic YWdlbnRAZXhhbXBsZS5jb206Z29yZ2lhcy1rZXk=");
  });

  it("loads explicit Greenhouse proxy executors with Basic API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("greenhouse");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/jobs",
        method: "GET",
        query: { per_page: 1 },
      },
      {
        getCredential: async () => apiKeyCredential("greenhouse-key"),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://harvest.greenhouse.io/v1/jobs?per_page=1");
    expect((init.headers as Headers).get("authorization")).toBe("Basic Z3JlZW5ob3VzZS1rZXk6");
  });

  it("loads explicit Guru proxy executors with username Basic auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("guru");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/api/v1/whoami",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("guru-key", { username: "guru-user" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.getguru.com/api/v1/whoami");
    expect((init.headers as Headers).get("authorization")).toBe("Basic Z3VydS11c2VyOmd1cnUta2V5");
  });

  it("loads explicit Elasticsearch proxy executors with API key auth", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("elasticsearch");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/_cluster/health",
        method: "GET",
        query: { local: true },
      },
      {
        getCredential: async () => apiKeyCredential("elastic-key", { baseUrl: "https://elastic.example.com:9200" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://elastic.example.com:9200/_cluster/health?local=true");
    expect((init.headers as Headers).get("authorization")).toBe("ApiKey elastic-key");
  });

  it("loads explicit Elasticsearch proxy executors with Basic auth custom credentials", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("elasticsearch");

    expect(proxy).toEqual(expect.any(Function));

    await proxy?.(
      {
        endpoint: "/logs/_search",
        method: "POST",
        body: { query: { match_all: {} } },
      },
      {
        getCredential: async () =>
          customCredential({
            baseUrl: "https://elastic.example.com/root",
            username: "elastic",
            password: "elastic-password",
          }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://elastic.example.com/root/logs/_search");
    expect((init.headers as Headers).get("authorization")).toBe("Basic ZWxhc3RpYzplbGFzdGljLXBhc3N3b3Jk");
    expect(init.body).toBe(JSON.stringify({ query: { match_all: {} } }));
  });
});
