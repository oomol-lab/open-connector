import { describe, expect, it, vi } from "vitest";

interface GrafanaFetchMock {
  fetcher: typeof fetch;
  urls: string[];
}

function createGrafanaFetchMock(handler: (url: URL) => Response): GrafanaFetchMock {
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url.toString());
    return handler(url);
  }) as typeof fetch;
  return { fetcher, urls };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Grafana App Platform API version discovery", () => {
  it("prefers v1 and caches a successfully discovered version", async () => {
    vi.resetModules();
    const { grafanaActionHandlers } = await import("./runtime.ts");
    let discoveryRequests = 0;
    const mock = createGrafanaFetchMock((url) => {
      if (url.pathname === "/apis/folder.grafana.app") {
        discoveryRequests += 1;
        return jsonResponse({
          versions: [{ version: "v0alpha1" }, { version: "v1beta1" }, { version: "v1" }],
        });
      }
      return jsonResponse({ items: [], metadata: {} });
    });
    const context = {
      baseUrl: "https://grafana-v1.example",
      apiKey: "test-token",
      fetcher: mock.fetcher,
    };

    await grafanaActionHandlers.list_folders({}, context);
    await grafanaActionHandlers.list_folders({}, context);

    expect(discoveryRequests).toBe(1);
    expect(mock.urls).toEqual([
      "https://grafana-v1.example/apis/folder.grafana.app",
      "https://grafana-v1.example/apis/folder.grafana.app/v1/namespaces/default/folders",
      "https://grafana-v1.example/apis/folder.grafana.app/v1/namespaces/default/folders",
    ]);
  });

  it("retries discovery after a failure instead of caching the v1 fallback", async () => {
    vi.resetModules();
    const { grafanaActionHandlers } = await import("./runtime.ts");
    let discoveryRequests = 0;
    const mock = createGrafanaFetchMock((url) => {
      if (url.pathname === "/apis/folder.grafana.app") {
        discoveryRequests += 1;
        if (discoveryRequests === 1) {
          return jsonResponse({ message: "temporary failure" }, 500);
        }
        return jsonResponse({ versions: [{ version: "v1beta1" }] });
      }
      if (url.pathname.includes("/v1beta1/")) {
        return jsonResponse({ items: [], metadata: {} });
      }
      return jsonResponse({ message: "unsupported version" }, 404);
    });
    const context = {
      baseUrl: "https://grafana-v1beta1.example",
      apiKey: "test-token",
      fetcher: mock.fetcher,
    };

    await expect(grafanaActionHandlers.list_folders({}, context)).rejects.toThrow("unsupported version");
    await expect(grafanaActionHandlers.list_folders({}, context)).resolves.toMatchObject({ folders: [] });

    expect(discoveryRequests).toBe(2);
    expect(mock.urls).toEqual([
      "https://grafana-v1beta1.example/apis/folder.grafana.app",
      "https://grafana-v1beta1.example/apis/folder.grafana.app/v1/namespaces/default/folders",
      "https://grafana-v1beta1.example/apis/folder.grafana.app",
      "https://grafana-v1beta1.example/apis/folder.grafana.app/v1beta1/namespaces/default/folders",
    ]);
  });
});
