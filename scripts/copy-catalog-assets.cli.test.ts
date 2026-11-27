import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "copy-catalog-assets.ts");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("copy-catalog-assets CLI (review)", () => {
  it("copies only the providers named by OPENCONNECTOR_PROVIDERS", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "open-connector-copy-catalog-review-"));
    temporaryDirectories.push(cwd);
    await mkdir(join(cwd, "catalog/apps"), { recursive: true });
    for (const service of ["alpha", "bravo"]) {
      await writeFile(join(cwd, "catalog/apps", `${service}.json`), JSON.stringify({ service }));
    }

    const result = spawnSync(process.execPath, [script], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, OPENCONNECTOR_PROVIDERS: "alpha" },
    });

    expect(result.status, result.stderr).toBe(0);
    const index = JSON.parse(await readFile(join(cwd, "dist/web/catalog/index.json"), "utf8")) as {
      providerCount: number;
    };
    expect(index.providerCount).toBe(1);
    expect(await readFile(join(cwd, "dist/web/catalog/apps-0000.json"), "utf8")).not.toContain("bravo");
  });
});
