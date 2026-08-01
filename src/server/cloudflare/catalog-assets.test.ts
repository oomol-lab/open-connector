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

  // The store sorts providers, so chunk order is not observable; what must be pinned is that every
  // chunk the index lists is fetched and merged, not just the first one.
  it("merges providers from every chunk the index lists", async () => {
    const catalog = await loadCatalogFromAssets(
      memoryAssets({
        "/catalog/index.json": { version: 1, providerCount: 3, chunks: ["apps-0000.json", "apps-0001.json"] },
        "/catalog/apps-0000.json": [provider],
        "/catalog/apps-0001.json": [
          { ...provider, service: "zulu", actions: [] },
          { ...provider, service: "aardvark", actions: [] },
        ],
      }),
    );

    expect(catalog.providers.map((entry) => entry.service)).toEqual(["aardvark", "example", "zulu"]);
  });

  it("falls back to the legacy catalog asset when the index is missing", async () => {
    const catalog = await loadCatalogFromAssets(
      memoryAssets({
        "/catalog/apps.json": [provider],
      }),
    );

    expect(catalog.providers[0]?.service).toBe("example");
  });

  it("falls back to the legacy catalog asset when a missing index resolves to the SPA shell", async () => {
    const catalog = await loadCatalogFromAssets(
      memoryAssets(
        {
          "/catalog/apps.json": [provider],
        },
        "spa-shell",
      ),
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

  it("fails when a missing index chunk resolves to the SPA shell", async () => {
    await expect(
      loadCatalogFromAssets(
        memoryAssets(
          {
            "/catalog/index.json": { version: 1, providerCount: 1, chunks: ["apps-0000.json"] },
          },
          "spa-shell",
        ),
      ),
    ).rejects.toThrow(
      "Cloudflare asset catalog request failed: /catalog/apps-0000.json returned content type text/html; charset=utf-8 instead of JSON",
    );
  });

  it("fails when the assets binding reports a server error", async () => {
    await expect(
      loadCatalogFromAssets(memoryAssets({ "/catalog/index.json": new Response("boom", { status: 500 }) })),
    ).rejects.toThrow("Cloudflare asset catalog request failed: /catalog/index.json returned 500");
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

  it("rejects a catalog asset that is not valid JSON", async () => {
    await expect(
      loadCatalogFromAssets(
        memoryAssets({
          "/catalog/index.json": new Response("{", { headers: { "content-type": "application/json" } }),
        }),
      ),
    ).rejects.toThrow("Cloudflare asset catalog contains invalid JSON: /catalog/index.json");
  });

  it("names both the index and the legacy catalog when neither is present", async () => {
    await expect(loadCatalogFromAssets(memoryAssets({}))).rejects.toThrow(
      "Cloudflare asset catalog request failed: /catalog/index.json returned 404, and /catalog/apps.json returned 404",
    );
  });

  it("names both the index and the legacy catalog when both resolve to the SPA shell", async () => {
    await expect(loadCatalogFromAssets(memoryAssets({}, "spa-shell"))).rejects.toThrow(
      "Cloudflare asset catalog request failed: /catalog/index.json returned content type text/html; charset=utf-8 instead of JSON, and /catalog/apps.json returned content type text/html; charset=utf-8 instead of JSON",
    );
  });
});

/**
 * How the assets binding answers a path it does not have.
 *
 * `not_found_handling: "single-page-application"` serves `index.html` with status 200 for binding
 * fetches too, so `"spa-shell"` is what the deployed worker actually sees.
 */
type MissingAssetBehavior = "404" | "spa-shell";

function memoryAssets(files: Record<string, unknown>, missing: MissingAssetBehavior = "404"): AssetsBinding {
  return {
    async fetch(request) {
      expect(request.headers.get("accept")).toBe("application/json");
      const pathname = new URL(request.url).pathname;
      if (!(pathname in files)) {
        return missing === "spa-shell"
          ? new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html; charset=utf-8" } })
          : new Response("not found", { status: 404 });
      }

      const file = files[pathname];
      return file instanceof Response ? file : Response.json(file);
    },
  };
}
