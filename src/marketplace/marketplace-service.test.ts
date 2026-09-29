import type { ProviderDefinition } from "../core/types.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";
import type { IMarketplaceStore, ProviderPreference, StoredMarketplaceConfig } from "./marketplace-service.ts";

import { describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { setDefaultGuardedFetchDnsLookup } from "../core/guarded-fetch.ts";
import { setEgressTrustedHosts } from "../core/request.ts";
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
  it.each(["http", "https"])(
    "preserves %s discovery, validation and execution for trusted VPN hosts",
    async (protocol) => {
      setEgressTrustedHosts(["marketplace.example"]);
      setDefaultGuardedFetchDnsLookup(async () => [{ address: "10.0.0.2", family: 4 }]);
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/validate") return new Response(null, { status: 204 });
        if (url.pathname === "/actions/example.run") return jsonResponse({ success: true, data: { ok: true } });
        return jsonResponse({
          version: 1,
          id: "vpn",
          name: "VPN",
          pricing: "free",
          validate: "/validate",
          endpoint: "/actions",
          actions: ["example.run"],
        });
      });
      const service = new MarketplaceService({
        catalog: createCatalogStore([provider]),
        store: new MemoryMarketplaceStore(),
        secretCodec: reversibleCodec,
        fetcher,
      });
      try {
        await service.configure({ discoveryUrl: `${protocol}://marketplace.example/discovery`, apiKey: "secret" });
        expect(await service.execute("example.run", {})).toEqual({ ok: true, output: { ok: true } });
        expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
          `${protocol}://marketplace.example/discovery`,
          `${protocol}://marketplace.example/validate`,
          `${protocol}://marketplace.example/actions/example.run`,
        ]);
      } finally {
        setEgressTrustedHosts([]);
        setDefaultGuardedFetchDnsLookup(null);
      }
    },
  );

  it.each([
    { failure: new TypeError("terminated"), status: 502, message: "Marketplace discovery could not be read." },
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
      message: `Marketplace ${stage} request failed.`,
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
    ).rejects.toThrow("Marketplace discovery request failed.");
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
  it("keeps action output above the discovery limit intact", async () => {
    const output = { content: "a".repeat(4 * 1024 * 1024 + 1) };
    const service = await configuredService(jsonResponse({ success: true, data: output }));
    await expect(service.execute("example.run", {})).resolves.toEqual({ ok: true, output });
  });

  it("preserves structured business errors including retry hints", async () => {
    const service = await configuredService(
      new Response(
        JSON.stringify({
          success: false,
          errorCode: "rate_limit_exceeded",
          message: "Slow down",
          data: { retryAfterSeconds: 12 },
        }),
        { status: 429 },
      ),
    );
    await expect(service.execute("example.run", {})).resolves.toEqual({
      ok: false,
      error: { code: "rate_limit_exceeded", message: "Slow down", details: { retryAfterSeconds: 12 } },
    });
  });

  it("does not expose plain unauthorized bodies or malformed envelopes", async () => {
    const service = await configuredService(new Response("Unauthorized secret-token", { status: 401 }));
    await expect(service.execute("example.run", {})).resolves.toEqual({
      ok: false,
      error: { code: "marketplace_unavailable", message: "Marketplace action response is not valid JSON." },
    });
    const malformed = await configuredService(jsonResponse({ success: true }));
    await expect(malformed.execute("example.run", {})).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
  });

  it("rejects action redirects even when their body looks successful", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      status: 307,
      headers: { location: "https://attacker.example" },
    });
    const service = await configuredService(response);
    await expect(service.execute("example.run", {})).resolves.toMatchObject({
      ok: false,
      error: { code: "marketplace_unavailable" },
    });
    expect(cancel).toHaveBeenCalledOnce();
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

async function configuredService(response: Response): Promise<MarketplaceService> {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      jsonResponse({
        version: 1,
        id: "test",
        name: "Test",
        pricing: "free",
        validate: "/validate",
        endpoint: "/actions",
        actions: ["example.run"],
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(response);
  const service = new MarketplaceService({
    catalog: createCatalogStore([provider]),
    store: new MemoryMarketplaceStore(),
    secretCodec: reversibleCodec,
    fetcher,
  });
  await service.configure({ discoveryUrl: "https://marketplace.example/discovery", apiKey: "secret" });
  return service;
}
