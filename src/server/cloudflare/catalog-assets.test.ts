import type { AssetsBinding } from "./cloudflare-bindings.ts";

import { describe, expect, it } from "vitest";
import { loadCatalogFromAssets } from "./catalog-assets.ts";

const provider = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions: [
    {
      id: "example.ping",
      service: "example",
      name: "ping",
      description: "Ping Example.",
      requiredScopes: [],
      providerPermissions: [],
      inputSchema: {},
      outputSchema: {},
    },
  ],
};

describe("loadCatalogFromAssets", () => {
  it("loads providers from catalog index chunks", async () => {
    const catalog = await loadCatalogFromAssets(
      memoryAssets({
        "/catalog/index.json": { version: 1, providerCount: 1, chunks: ["apps-0000.json"] },
        "/catalog/apps-0000.json": [provider],
      }),
      { executableServices: ["example"] },
    );

    expect(catalog.providers).toHaveLength(1);
    expect(catalog.providers[0]?.service).toBe("example");
    expect(catalog.actionsById.get("example.ping")?.execution.locallyExecutable).toBe(true);
  });

  it("falls back to the legacy catalog asset when the index is missing", async () => {
    const catalog = await loadCatalogFromAssets(
      memoryAssets({
        "/catalog/apps.json": [provider],
      }),
    );

    expect(catalog.providers[0]?.service).toBe("example");
  });

  it("fails when an index chunk is missing", async () => {
    await expect(
      loadCatalogFromAssets(
        memoryAssets({
          "/catalog/index.json": { version: 1, providerCount: 1, chunks: ["apps-0000.json"] },
        }),
      ),
    ).rejects.toThrow("Cloudflare asset catalog request failed: /catalog/apps-0000.json returned 404");
  });

  it("fails when the loaded provider count does not match the index", async () => {
    await expect(
      loadCatalogFromAssets(
        memoryAssets({
          "/catalog/index.json": { version: 1, providerCount: 2, chunks: ["apps-0000.json"] },
          "/catalog/apps-0000.json": [provider],
        }),
      ),
    ).rejects.toThrow("index declares 2, loaded 1");
  });

  it("rejects invalid index chunk paths", async () => {
    await expect(
      loadCatalogFromAssets(
        memoryAssets({
          "/catalog/index.json": { version: 1, providerCount: 1, chunks: ["../apps.json"] },
        }),
      ),
    ).rejects.toThrow("index contains an invalid chunk name");
  });

  it("rejects unsupported catalog index versions", async () => {
    await expect(
      loadCatalogFromAssets(
        memoryAssets({
          "/catalog/index.json": { version: 2, providerCount: 0, chunks: [] },
        }),
      ),
    ).rejects.toThrow("Unsupported Cloudflare asset catalog index version: 2");
  });

  it("rejects catalog chunks that are not arrays", async () => {
    await expect(
      loadCatalogFromAssets(
        memoryAssets({
          "/catalog/index.json": { version: 1, providerCount: 1, chunks: ["apps-0000.json"] },
          "/catalog/apps-0000.json": provider,
        }),
      ),
    ).rejects.toThrow("Cloudflare asset catalog must be an array: /catalog/apps-0000.json");
  });

  it("fails when both the index and legacy catalog are missing", async () => {
    await expect(loadCatalogFromAssets(memoryAssets({}))).rejects.toThrow(
      "Cloudflare asset catalog request failed: /catalog/apps.json returned 404",
    );
  });
});

function memoryAssets(files: Record<string, unknown>): AssetsBinding {
  return {
    async fetch(request) {
      expect(request.headers.get("accept")).toBe("application/json");
      const pathname = new URL(request.url).pathname;
      if (!(pathname in files)) {
        return new Response("not found", { status: 404 });
      }

      return Response.json(files[pathname]);
    },
  };
}
