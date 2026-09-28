import type { ProviderDefinition } from "../core/types.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";
import type { IMarketplaceStore, ProviderPreference, StoredMarketplaceConfig } from "./marketplace-service.ts";

import { describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { MarketplaceService } from "./marketplace-service.ts";

const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: [],
  authTypes: ["api_key"],
  auth: [{ type: "api_key" }],
  actions: [
    {
      id: "example.run",
      service: "example",
      name: "run",
      description: "Run an example.",
      operationType: "write",
      requiredScopes: [],
      providerPermissions: [],
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
  ],
};

describe("MarketplaceService", () => {
  it.each([
    { failure: new TypeError("terminated"), status: 502, message: "Marketplace request failed: terminated" },
    { failure: new DOMException("Timed out", "TimeoutError"), status: 504, message: "Marketplace request timed out." },
    { failure: new DOMException("Aborted", "AbortError"), status: 504, message: "Marketplace request timed out." },
  ])("maps discovery body failures to HTTP $status", async ({ failure, status, message }) => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (reads++ === 0) controller.enqueue(new TextEncoder().encode('{"version":'));
        else controller.error(failure);
      },
    });
    const store = new MemoryMarketplaceStore();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    const service = new MarketplaceService({
      catalog: createCatalogStore([provider]),
      store,
      secretCodec: reversibleCodec,
      fetcher,
    });
    await expect(service.configure({ apiKey: "secret" })).rejects.toMatchObject({
      code: "marketplace_unavailable",
      status,
      message,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await store.getConfig()).toBeUndefined();
    expect(service.getState().configured).toBe(false);
  });

  it("preserves the discovery size-limit error and cancels the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));
      },
      cancel,
    });
    const service = new MarketplaceService({
      catalog: createCatalogStore([provider]),
      store: new MemoryMarketplaceStore(),
      secretCodec: reversibleCodec,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
    });
    await expect(service.configure({ apiKey: "secret" })).rejects.toMatchObject({
      code: "invalid_marketplace_discovery",
      status: 400,
      message: "Marketplace discovery exceeds 4 MiB.",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each(["discovery", "validation"])("reports %s network failures as Marketplace errors", async (stage) => {
    const fetcher = vi.fn<typeof fetch>();
    if (stage === "validation") {
      fetcher.mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          id: "test",
          name: "Test Marketplace",
          pricing: "metered",
          validate: "/validate",
          endpoint: "/actions",
          actions: ["example.run"],
        }),
      );
    }
    fetcher.mockRejectedValueOnce(new Error("request URL must not resolve to private or reserved IP addresses"));
    const store = new MemoryMarketplaceStore();
    const service = new MarketplaceService({
      catalog: createCatalogStore([provider]),
      store,
      secretCodec: reversibleCodec,
      fetcher,
    });
    await expect(service.configure({ apiKey: "secret" })).rejects.toMatchObject({
      code: "marketplace_unavailable",
      status: 502,
      message: "Marketplace request failed: request URL must not resolve to private or reserved IP addresses",
    });
    expect(await store.getConfig()).toBeUndefined();
    expect(service.getState().configured).toBe(false);
  });

  it("reports network timeouts as gateway timeouts", async () => {
    const service = new MarketplaceService({
      catalog: createCatalogStore([provider]),
      store: new MemoryMarketplaceStore(),
      secretCodec: reversibleCodec,
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    });
    await expect(service.configure({ apiKey: "secret" })).rejects.toMatchObject({
      code: "marketplace_unavailable",
      status: 504,
      message: "Marketplace request timed out.",
    });
  });
  it("keeps the current source on failed replacement and hides old preferences after a successful switch", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/validate") return new Response(null, { status: 204 });
      if (url.hostname === "broken.example") throw new Error("offline");
      return jsonResponse({
        version: 1,
        id: url.hostname,
        name: url.hostname,
        pricing: "metered",
        validate: "/validate",
        endpoint: "/actions",
        actions: url.hostname === "first.example" ? ["example.run"] : ["remote.only"],
      });
    });
    const store = new MemoryMarketplaceStore();
    const service = new MarketplaceService({
      catalog: createCatalogStore([provider]),
      store,
      secretCodec: reversibleCodec,
      fetcher,
    });
    await service.configure({ discoveryUrl: "https://first.example/discovery", apiKey: "first-key" });
    const count = fetcher.mock.calls.length;
    await expect(service.configure({ discoveryUrl: "https://other.example/discovery" })).rejects.toThrow("new apiKey");
    expect(fetcher).toHaveBeenCalledTimes(count);
    await expect(
      service.configure({ discoveryUrl: "https://broken.example/discovery", apiKey: "new-key" }),
    ).rejects.toThrow("offline");
    expect(service.getState().discoveryUrl).toBe("https://first.example/discovery");
    expect(await service.listProviderPreferences()).toHaveLength(1);
    await service.configure({ discoveryUrl: "https://other.example/discovery", apiKey: "new-key" });
    expect(await service.listProviderPreferences()).toEqual([]);
    expect(await store.listProviderPreferences()).toHaveLength(1);
    await service.remove();
    expect(await service.listProviderPreferences()).toEqual([]);
    expect(service.getState().configured).toBe(false);
  });

  it("validates discovery and derives only locally compatible actions", async () => {
    const store = new MemoryMarketplaceStore();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          id: "test",
          name: "Test Marketplace",
          pricing: "metered",
          validate: "/validate",
          endpoint: "/actions",
          actions: ["example.run", "remote.only"],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const service = new MarketplaceService({
      catalog: createCatalogStore([provider]),
      store,
      secretCodec: reversibleCodec,
      fetcher,
    });

    await expect(
      service.configure({ discoveryUrl: "https://marketplace.example/discovery", apiKey: "secret" }),
    ).resolves.toMatchObject({
      status: "available",
      compatibleActionCount: 1,
      compatibleProviderCount: 1,
    });
    expect(service.supportsAction("example.run")).toBe(true);
    expect(service.supportsAction("remote.only")).toBe(false);
    expect(await service.listProviderPreferences()).toMatchObject([{ service: "example", enabled: true }]);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL("https://marketplace.example/validate"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the connector available when startup validation rejects the API key", async () => {
    const store = new MemoryMarketplaceStore();
    await store.setConfig({
      discoveryUrl: "https://marketplace.example/discovery",
      apiKeyEncrypted: await reversibleCodec.encode("secret"),
      enabled: true,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          id: "test",
          name: "Test Marketplace",
          pricing: "free",
          validate: "/validate",
          endpoint: "/actions",
          actions: ["example.run"],
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 401 }));
    const service = new MarketplaceService({
      catalog: createCatalogStore([provider]),
      store,
      secretCodec: reversibleCodec,
      fetcher,
    });

    await service.initialize();

    expect(service.getState()).toMatchObject({ status: "auth_error", configured: true, enabled: true });
    expect(service.getSnapshot()).toBeUndefined();
  });

  it("allows plaintext API key storage when encryption is not configured", async () => {
    const store = new MemoryMarketplaceStore();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          id: "test",
          name: "Test Marketplace",
          pricing: "free",
          validate: "/validate",
          endpoint: "/actions",
          actions: ["example.run"],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const service = new MarketplaceService({
      catalog: createCatalogStore([provider]),
      store,
      secretCodec: plaintextCodec,
      fetcher,
    });

    await service.configure({ discoveryUrl: "https://marketplace.example/discovery", apiKey: "local-key" });

    await expect(store.getConfig()).resolves.toMatchObject({ apiKeyEncrypted: "local-key" });
  });
});

const reversibleCodec: ISecretCodec = {
  encrypted: true,
  async encode(value) {
    return `encoded:${value}`;
  },
  async decode(value) {
    return value.slice("encoded:".length);
  },
};

const plaintextCodec: ISecretCodec = {
  encrypted: false,
  async encode(value) {
    return value;
  },
  async decode(value) {
    return value;
  },
};

class MemoryMarketplaceStore implements IMarketplaceStore {
  private config?: StoredMarketplaceConfig;
  private readonly preferences = new Map<string, ProviderPreference>();

  async getConfig(): Promise<StoredMarketplaceConfig | undefined> {
    return this.config;
  }
  async setConfig(config: StoredMarketplaceConfig): Promise<void> {
    this.config = config;
  }
  async deleteConfig(): Promise<void> {
    this.config = undefined;
  }
  async listProviderPreferences(): Promise<ProviderPreference[]> {
    return [...this.preferences.values()];
  }
  async setProviderPreference(preference: ProviderPreference): Promise<void> {
    this.preferences.set(preference.service, preference);
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
