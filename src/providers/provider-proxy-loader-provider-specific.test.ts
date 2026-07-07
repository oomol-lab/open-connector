import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderLoader } from "./provider-loader.ts";
import { apiKeyCredential, customCredential, stubProviderFetch } from "./provider-proxy-loader.test-helpers.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProviderLoader provider-specific proxy executors", () => {
  it("loads Check proxy executors with the credential environment base URL", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("check");

    await proxy?.(
      {
        endpoint: "/companies",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("check-key", { environment: "production" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.checkhq.com/companies");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer check-key");
  });

  it("bounds Cloudflare R2 proxy error response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => new Response("x".repeat(20 * 1024 * 1024 + 1), { status: 500 })),
    );
    const proxy = await new ProviderLoader().loadProxyExecutor("cloudflare_r2");

    await expect(
      proxy?.(
        {
          endpoint: "/accounts",
          method: "GET",
        },
        {
          getCredential: async () => customCredential({ apiKey: "r2-key", accountId: "account-1" }),
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "proxy error response exceeds 20971520 bytes",
        details: {
          status: 413,
        },
      },
    });
  });

  it("loads CentralStationCRM proxy executors with account-derived base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("central_station_crm");

    await proxy?.(
      {
        endpoint: "/user",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("central-key", { account: "acme" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://acme.centralstationcrm.net/api/user");
    expect((init.headers as Headers).get("x-apikey")).toBe("central-key");
  });

  it("loads n8n proxy executors with instance URL-derived API base URLs", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("n8n");

    await proxy?.(
      {
        endpoint: "/workflows",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("n8n-key", { instanceUrl: "https://demo.app.n8n.cloud" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://demo.app.n8n.cloud/api/v1/workflows");
    expect((init.headers as Headers).get("x-n8n-api-key")).toBe("n8n-key");
  });

  it("loads Precoro proxy executors with email headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("precoro");

    await proxy?.(
      {
        endpoint: "/users",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("precoro-key", { email: "ops@example.com" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.precoro.com/users");
    const headers = init.headers as Headers;
    expect(headers.get("x-auth-token")).toBe("precoro-key");
    expect(headers.get("email")).toBe("ops@example.com");
  });

  it("loads Elevio proxy executors with API key and JWT auth headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("elevio");

    await proxy?.(
      {
        endpoint: "/articles",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("elevio-key", { jwt: "elevio-jwt" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.elev.io/v1/articles");
    const headers = init.headers as Headers;
    expect(headers.get("x-api-key")).toBe("elevio-key");
    expect(headers.get("authorization")).toBe("Bearer elevio-jwt");
  });

  it("loads Knack proxy executors with application id headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("knack");

    await proxy?.(
      {
        endpoint: "/objects",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("knack-key", { appId: "app-123" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.knack.com/v1/objects");
    const headers = init.headers as Headers;
    expect(headers.get("x-knack-rest-api-key")).toBe("knack-key");
    expect(headers.get("x-knack-application-id")).toBe("app-123");
  });

  it("loads Neutrino proxy executors with user id headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("neutrino");

    await proxy?.(
      {
        endpoint: "/email-validate",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("neutrino-key", { userId: "user-123" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://neutrinoapi.net/email-validate");
    const headers = init.headers as Headers;
    expect(headers.get("api-key")).toBe("neutrino-key");
    expect(headers.get("user-id")).toBe("user-123");
  });

  it("loads Nyne.ai proxy executors with API secret headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("nyne_ai");

    await proxy?.(
      {
        endpoint: "/v1/person/enrich",
        method: "POST",
        body: { email: "person@example.com" },
      },
      {
        getCredential: async () => apiKeyCredential("nyne-key", { apiSecret: "nyne-secret" }),
      },
    );

    const [, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("x-api-key")).toBe("nyne-key");
    expect(headers.get("x-api-secret")).toBe("nyne-secret");
  });

  it("loads Productive proxy executors with organization id headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("productive");

    await proxy?.(
      {
        endpoint: "/projects",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("productive-key", { organizationId: "org-123" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.productive.io/api/v2/projects");
    const headers = init.headers as Headers;
    expect(headers.get("x-auth-token")).toBe("productive-key");
    expect(headers.get("x-organization-id")).toBe("org-123");
  });

  it("loads Anthropic proxy executors with API version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("anthropic");

    await proxy?.(
      {
        endpoint: "/v1/models",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("anthropic-key"),
      },
    );

    const [, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("x-api-key")).toBe("anthropic-key");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("loads Anthropic Admin proxy executors with API version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("anthropic_admin");

    await proxy?.(
      {
        endpoint: "/v1/organizations",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("anthropic-admin-key"),
      },
    );

    const [, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("x-api-key")).toBe("anthropic-admin-key");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("loads Teamtailor proxy executors with API version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("teamtailor");

    await proxy?.(
      {
        endpoint: "/v1/jobs",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("teamtailor-key"),
      },
    );

    const [, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Token token=teamtailor-key");
    expect(headers.get("x-api-version")).toBe("20240904");
  });

  it("loads Pinecone proxy executors with API version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("pinecone");

    await proxy?.(
      {
        endpoint: "/indexes",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("pinecone-key"),
      },
    );

    const [, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("api-key")).toBe("pinecone-key");
    expect(headers.get("x-pinecone-api-version")).toBe("2026-04");
  });

  it("loads TalentLMS proxy executors with domain base URLs and API version headers", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("talentlms");

    await proxy?.(
      {
        endpoint: "/users",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("talent-key", { domain: "samples" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://samples.talentlms.com/api/v2/users");
    const headers = init.headers as Headers;
    expect(headers.get("x-api-key")).toBe("talent-key");
    expect(headers.get("x-api-version")).toBe("2025-07-01");
  });

  it("loads Voiceflow proxy executors with realtime API routing", async () => {
    const fetcher = stubProviderFetch();
    const proxy = await new ProviderLoader().loadProxyExecutor("voiceflow");

    await proxy?.(
      {
        endpoint: "/v1alpha1/project/project-123/environments",
        method: "GET",
      },
      {
        getCredential: async () => apiKeyCredential("voiceflow-key", { projectId: "project-123" }),
      },
    );

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://realtime-api.voiceflow.com/v1alpha1/project/project-123/environments");
    expect((init.headers as Headers).get("authorization")).toBe("voiceflow-key");
  });
});
