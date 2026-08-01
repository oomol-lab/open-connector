import type { AssetsBinding } from "../src/server/cloudflare/cloudflare-bindings.ts";

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

function providerDefinition(service: string): Record<string, unknown> {
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
