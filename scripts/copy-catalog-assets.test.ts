import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

  it("accounts for UTF-8 bytes when rejecting an oversized provider", async () => {
    const { sourceDir, targetDir } = await fixture();
    await writeFile(join(sourceDir, "unicode.json"), JSON.stringify({ label: "中中" }));

    await expect(copyCatalogAssets({ sourceDir, targetDir, maxChunkBytes: 19 })).rejects.toThrow(
      "unicode.json requires 21 bytes",
    );
  });

  it("writes an empty index for an empty catalog", async () => {
    const { sourceDir, targetDir } = await fixture();

    const index = await copyCatalogAssets({ sourceDir, targetDir });

    expect(index).toEqual({ version: 1, providerCount: 0, chunks: [] });
    expect(await readdir(targetDir)).toEqual(["index.json"]);
  });
});

async function fixture(): Promise<{ sourceDir: string; targetDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "open-connector-catalog-"));
  temporaryDirectories.push(root);
  const sourceDir = join(root, "source");
  const targetDir = join(root, "target");
  await mkdir(sourceDir);
  return { sourceDir, targetDir };
}
