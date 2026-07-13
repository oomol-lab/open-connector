import { describe, expect, it, vi } from "vitest";
import {
  createDokployContext,
  dokployActionHandlers,
  normalizeDokployApiBaseUrl,
  validateDokployCredential,
} from "./runtime.ts";

function context(fetcher: typeof fetch) {
  return createDokployContext({ baseUrl: "https://dokploy.example.com" }, "dokploy-key", fetcher);
}

describe("Dokploy runtime", () => {
  it("normalizes the instance URL and rejects private targets", () => {
    expect(normalizeDokployApiBaseUrl("https://dokploy.example.com/")).toBe("https://dokploy.example.com/api");
    expect(normalizeDokployApiBaseUrl("https://dokploy.example.com/api/")).toBe("https://dokploy.example.com/api");
    expect(() => normalizeDokployApiBaseUrl("http://127.0.0.1:3000")).toThrow(
      "baseUrl must not target private or reserved IP addresses",
    );
  });

  it("validates credentials with an authenticated project search", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ items: [], total: 0 }),
    );

    await expect(
      validateDokployCredential({ baseUrl: "https://dokploy.example.com" }, "dokploy-key", fetcher),
    ).resolves.toMatchObject({
      profile: {
        accountId: "dokploy:dokploy.example.com",
        displayName: "Dokploy dokploy.example.com",
      },
      metadata: {
        apiBaseUrl: "https://dokploy.example.com/api",
        validationEndpoint: "/project.search",
      },
    });

    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://dokploy.example.com/api/project.search?limit=1&offset=0");
    expect(init.headers).toMatchObject({ "x-api-key": "dokploy-key", "user-agent": "oomol-connect/0.1" });
  });

  it("maps application search filters to Dokploy query parameters", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ items: [{ applicationId: "app-1" }], total: 1 }),
    );

    await expect(
      dokployActionHandlers.search_applications(
        { query: "api", projectId: "project-1", limit: 10, offset: 20 },
        context(fetcher),
      ),
    ).resolves.toEqual({ applications: [{ applicationId: "app-1" }], total: 1 });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/application.search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "api",
      projectId: "project-1",
      limit: "10",
      offset: "20",
    });
  });

  it("sends deployment requests without undefined optional fields", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => Response.json(null),
    );

    await expect(
      dokployActionHandlers.deploy_application({ applicationId: "app-1", title: "Release" }, context(fetcher)),
    ).resolves.toEqual({ accepted: true });

    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://dokploy.example.com/api/application.deploy");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ applicationId: "app-1", title: "Release" });
  });

  it("maps invalid credentials to a connection validation error", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ message: "Invalid API key" }, { status: 401 }),
    );

    await expect(
      validateDokployCredential({ baseUrl: "https://dokploy.example.com" }, "bad-key", fetcher),
    ).rejects.toMatchObject({ status: 400, message: "Invalid API key" });
  });
});
