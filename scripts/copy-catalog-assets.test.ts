import type { ProviderDefinition } from "../src/core/types.ts";
import type { AssetsBinding } from "../src/server/cloudflare/cloudflare-bindings.ts";

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCatalogStore, resolveExecutableActionIds } from "../src/catalog-store.ts";
import { loadCatalogFromAssets } from "../src/server/cloudflare/catalog-assets.ts";
import { copyCatalogAssets } from "./copy-catalog-assets.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("copyCatalogAssets", () => {
  it("writes deterministic, size-bounded chunks in provider filename order", async () => {
    const { sourceDir, targetDir } = await fixture();
    await writeFile(join(sourceDir, "zulu.json"), JSON.stringify({ service: "zulu", label: "中中" }));
    await writeFile(join(sourceDir, "alpha.json"), JSON.stringify({ service: "alpha", label: "中中" }));

    const index = await copyCatalogAssets({ sourceDir, targetDir, maxChunkBytes: 45 });

    expect(index).toEqual({
      version: 1,
      providerCount: 2,
      chunks: ["apps-0000.json", "apps-0001.json"],
    });
    expect(JSON.parse(await readFile(join(targetDir, "index.json"), "utf8"))).toEqual(index);
    expect(JSON.parse(await readFile(join(targetDir, "apps-0000.json"), "utf8"))).toEqual([
      { service: "alpha", label: "中中" },
    ]);
    expect(JSON.parse(await readFile(join(targetDir, "apps-0001.json"), "utf8"))).toEqual([
      { service: "zulu", label: "中中" },
    ]);
    for (const chunk of index.chunks) {
      expect(Buffer.byteLength(await readFile(join(targetDir, chunk), "utf8"))).toBeLessThanOrEqual(45);
    }
    expect((await readdir(targetDir)).sort()).toEqual(["apps-0000.json", "apps-0001.json", "index.json"]);
  });

  // Production chunks hold ~170 providers each, so the greedy fill and its separator accounting —
  // not the one-provider-per-chunk degenerate case above — are what the byte cap actually rests on.
  it("packs as many providers into a chunk as the byte cap allows", async () => {
    const { sourceDir, targetDir } = await fixture();
    // Each provider serializes to 9 bytes, so three of them plus two commas and `[`, `]`, `\n`
    // fill a 32-byte chunk exactly and the fourth must start the next one.
    for (const s of ["a", "b", "c", "d"]) {
      await writeFile(join(sourceDir, `${s}.json`), JSON.stringify({ s }));
    }

    const index = await copyCatalogAssets({ sourceDir, targetDir, maxChunkBytes: 32 });

    expect(index.chunks).toEqual(["apps-0000.json", "apps-0001.json"]);
    expect(await readFile(join(targetDir, "apps-0000.json"), "utf8")).toBe('[{"s":"a"},{"s":"b"},{"s":"c"}]\n');
    expect(await readFile(join(targetDir, "apps-0001.json"), "utf8")).toBe('[{"s":"d"}]\n');
    expect(Buffer.byteLength(await readFile(join(targetDir, "apps-0000.json"), "utf8"))).toBe(32);
  });

  it("replaces chunks left behind by an earlier build", async () => {
    const { sourceDir, targetDir } = await fixture();
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, "apps-0007.json"), "[]\n");
    await writeFile(join(targetDir, "apps.json"), "[]\n");
    await writeFile(join(sourceDir, "alpha.json"), JSON.stringify({ service: "alpha" }));

    await copyCatalogAssets({ sourceDir, targetDir });

    expect((await readdir(targetDir)).sort()).toEqual(["apps-0000.json", "index.json"]);
  });

  it("accounts for UTF-8 bytes when rejecting an oversized provider", async () => {
    const { sourceDir, targetDir } = await fixture();
    await writeFile(join(sourceDir, "unicode.json"), JSON.stringify({ label: "中中" }));

    await expect(copyCatalogAssets({ sourceDir, targetDir, maxChunkBytes: 19 })).rejects.toThrow(
      "unicode.json requires 21 bytes",
    );
  });

  it("includes the provider filename when JSON parsing fails", async () => {
    const { sourceDir, targetDir } = await fixture();
    await writeFile(join(sourceDir, "broken-provider.json"), "{invalid");

    await expect(copyCatalogAssets({ sourceDir, targetDir })).rejects.toMatchObject({
      message: "Failed to parse catalog provider file: broken-provider.json",
      cause: expect.any(SyntaxError),
    });
  });

  it("prepares the same runtime catalog, schema data, summary bytes, and ETag at build time", async () => {
    const { sourceDir, targetDir } = await fixture();
    const definitions: ProviderDefinition[] = ["zulu", "alpha"].map((service) => ({
      ...providerDefinition(service),
      actions: [
        {
          id: `${service}.ping`,
          service,
          name: "ping",
          description: "Ping 中.",
          operationType: "read",
          requiredScopes: [],
          providerPermissions: [],
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
          outputSchema: { type: "string" },
        },
      ],
    }));
    for (const provider of definitions) {
      await writeFile(join(sourceDir, `${provider.service}.json`), JSON.stringify(provider));
    }
    const options = { executableServices: ["alpha"] };
    const expected = createCatalogStore(definitions, {
      executableActionIds: resolveExecutableActionIds(definitions, options),
    });
    const index = await copyCatalogAssets({ sourceDir, targetDir, prepareRuntime: options });
    const backing = directoryAssets(targetDir);
    let schemaRequests = 0;
    let failSchema = true;
    const actual = await loadCatalogFromAssets(
      {
        async fetch(request) {
          if (new URL(request.url).pathname.includes("/schemas-")) {
            schemaRequests++;
            if (failSchema) return new Response("unavailable", { status: 503 });
          }
          return backing.fetch(request);
        },
      },
      options,
    );
    expect(index.prepared).toBeDefined();
    expect(schemaRequests).toBe(0);
    expect(actual.actionsById.get("alpha.ping")).not.toHaveProperty("inputSchema");
    expect(await actual.getAction("missing.ping")).toBeUndefined();
    expect(schemaRequests).toBe(0);
    const failed = await Promise.allSettled([actual.getAction("alpha.ping"), actual.getAction("zulu.ping")]);
    expect(failed.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(schemaRequests).toBe(1);
    expect(actual.actionsById.get("alpha.ping")).not.toHaveProperty("inputSchema");
    failSchema = false;
    const definitionsRead = await Promise.all([actual.getAction("alpha.ping"), actual.getAction("zulu.ping")]);
    expect(schemaRequests).toBe(2);
    expect(definitionsRead).toEqual(
      await Promise.all([expected.getAction("alpha.ping"), expected.getAction("zulu.ping")]),
    );
    expect(await actual.getAction("alpha.ping")).toBe(definitionsRead[0]);
    expect(schemaRequests).toBe(2);
    expect(actual.actionsById.get("alpha.ping")).not.toHaveProperty("inputSchema");
    const { getAction: _actualReader, ...loaded } = actual;
    const { getAction: _expectedReader, ...expectedMetadata } = expected;
    expect(loaded).toEqual(expectedMetadata);
    expect(actual.actionsById.get("alpha.ping")).toBe(actual.providers[0]?.actions[0]);
    expect(actual.actionsById.get("zulu.ping")?.execution.locallyExecutable).toBe(false);
    await expect(loadCatalogFromAssets(directoryAssets(targetDir), { executableServices: ["zulu"] })).rejects.toThrow(
      "does not match the Worker executor registry",
    );
    await rm(join(targetDir, "provider-summaries.json"));
    await expect(loadCatalogFromAssets(directoryAssets(targetDir), options)).rejects.toThrow(
      "returned content type text/html",
    );
  });

  it("loads only the requested schema chunk and retries invalid chunks without changing metadata", async () => {
    const { sourceDir, targetDir } = await fixture();
    for (const service of ["alpha", "zulu"]) {
      await writeFile(
        join(sourceDir, `${service}.json`),
        JSON.stringify({
          ...providerDefinition(service),
          actions: [
            {
              id: `${service}.ping`,
              service,
              name: "ping",
              description: "Ping",
              operationType: "read",
              requiredScopes: [],
              providerPermissions: [],
              inputSchema: { type: "object", description: "x".repeat(1200) },
              outputSchema: {},
            },
          ],
        }),
      );
    }
    const index = await copyCatalogAssets({ sourceDir, targetDir, maxChunkBytes: 2000, prepareRuntime: {} });
    expect(index.prepared?.schemaChunks).toHaveLength(2);
    const backing = directoryAssets(targetDir);
    const requests: string[] = [];
    const catalog = await loadCatalogFromAssets({
      async fetch(request) {
        requests.push(new URL(request.url).pathname);
        return backing.fetch(request);
      },
    });
    const schemaFile = join(targetDir, index.prepared!.schemaChunks[0]!.file);
    const valid = await readFile(schemaFile, "utf8");
    const invalid = JSON.parse(valid);
    invalid[0].actions[0].id = "wrong.action";
    await writeFile(schemaFile, JSON.stringify(invalid));
    await expect(catalog.getAction("alpha.ping")).rejects.toThrow("Invalid action schema chunk");
    expect(catalog.actionsById.get("alpha.ping")).not.toHaveProperty("inputSchema");
    await writeFile(schemaFile, valid);
    expect(await catalog.getAction("alpha.ping")).toMatchObject({ inputSchema: { type: "object" } });
    expect(requests.filter((path) => path.includes("/schemas-"))).toEqual([
      "/catalog/schemas-0000.json",
      "/catalog/schemas-0000.json",
    ]);
    expect(await catalog.getAction("zulu.ping")).toMatchObject({ inputSchema: { type: "object" } });
    expect(requests.at(-1)).toBe("/catalog/schemas-0001.json");
    expect(
      catalog.providers.flatMap((provider) => provider.actions).every((action) => !("inputSchema" in action)),
    ).toBe(true);
  });

  it("writes an empty index for an empty catalog", async () => {
    const { sourceDir, targetDir } = await fixture();

    const index = await copyCatalogAssets({ sourceDir, targetDir });

    expect(index).toEqual({ version: 1, providerCount: 0, chunks: [] });
    expect(await readdir(targetDir)).toEqual(["index.json"]);
  });

  // The index shape and the `apps-NNNN.json` naming are declared once here and once in the worker
  // loader, so nothing but this round trip stops the two ends of the asset contract from drifting.
  it("produces an asset layout the Cloudflare worker loader can read back", async () => {
    const { sourceDir, targetDir } = await fixture();
    for (const service of ["alpha", "zulu"]) {
      await writeFile(join(sourceDir, `${service}.json`), JSON.stringify(providerDefinition(service)));
    }

    const index = await copyCatalogAssets({ sourceDir, targetDir, maxChunkBytes: 256 });
    const catalog = await loadCatalogFromAssets(directoryAssets(targetDir));

    expect(index.chunks.length).toBeGreaterThan(1);
    expect(catalog.providers.map((entry) => entry.service)).toEqual(["alpha", "zulu"]);
  });
});

/** Serve a directory the way the Cloudflare assets binding does, including its SPA miss behaviour. */
function directoryAssets(directory: string): AssetsBinding {
  return {
    async fetch(request) {
      const name = new URL(request.url).pathname.replace("/catalog/", "");
      try {
        return new Response(await readFile(join(directory, name), "utf8"), {
          headers: { "content-type": "application/json" },
        });
      } catch {
        return new Response("<!doctype html><html></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    },
  };
}

function providerDefinition(service: string): ProviderDefinition {
  return {
    service,
    displayName: service,
    categories: ["Developer Tools"],
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions: [],
  };
}

async function fixture(): Promise<{ sourceDir: string; targetDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "open-connector-catalog-"));
  temporaryDirectories.push(root);
  const sourceDir = join(root, "source");
  const targetDir = join(root, "target");
  await mkdir(sourceDir);
  return { sourceDir, targetDir };
}
