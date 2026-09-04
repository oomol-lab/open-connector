import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServerAssets } from "./server-assets.ts";
import { defaultMigrationSource } from "./storage/migration-source.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("resolveServerAssets", () => {
  it("uses the working directory layout of npm start under Node", async () => {
    const cwd = await createTempCwd();
    await mkdir(join(cwd, "dist", "web"), { recursive: true });
    await writeFile(join(cwd, "dist", "web", "index.html"), "<!doctype html>");
    await mkdir(join(cwd, "catalog", "apps"), { recursive: true });
    await writeFile(join(cwd, "catalog", "apps-index.json"), '{"version":1,"providers":[]}\n');

    const assets = await resolveServerAssets();

    expect(assets.catalogDir).toBe(join(cwd, "catalog/apps"));
    expect(assets.catalogIndexFile).toBe(join(cwd, "catalog/apps-index.json"));
    expect(assets.migrations).toBe(defaultMigrationSource);
    expect(assets.staticRoot).toBe(join(cwd, "dist/web"));
    expect(assets.embedded).toBe(false);
  });

  it("reports the console as not built when dist/web/index.html is missing", async () => {
    const cwd = await createTempCwd();
    await mkdir(join(cwd, "dist", "web"), { recursive: true });

    const assets = await resolveServerAssets();

    expect(assets.catalogDir).toBe(join(cwd, "catalog/apps"));
    expect(assets.migrations).toBe(defaultMigrationSource);
    expect(assets.staticRoot).toBeUndefined();
    expect(assets.embedded).toBe(false);
  });

  it("reports no catalog index when catalog/apps-index.json is missing", async () => {
    const cwd = await createTempCwd();
    await mkdir(join(cwd, "catalog", "apps"), { recursive: true });

    const assets = await resolveServerAssets();

    expect(assets.catalogDir).toBe(join(cwd, "catalog/apps"));
    expect(assets.catalogIndexFile).toBeUndefined();
  });

  it("reads the tree embedded next to the module inside a Bun standalone executable", async () => {
    vi.stubGlobal("Bun", { isStandaloneExecutable: true });
    const root = import.meta.dirname;

    const assets = await resolveServerAssets();

    expect(assets.embedded).toBe(true);
    expect(assets.catalogDir).toBe(join(root, "apps"));
    // The directory source touches the filesystem lazily; the ENOENT it raises names the embedded directory.
    expect(assets.migrations).not.toBe(defaultMigrationSource);
    expect(() => assets.migrations.readMigrations("sqlite")).toThrow(join(root, "migrations"));
    // Neither web/index.html nor apps-index.json lives beside this module, so both are reported as absent.
    expect(assets.staticRoot).toBeUndefined();
    expect(assets.catalogIndexFile).toBeUndefined();
  });
});

async function createTempCwd(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "oomol-connect-assets-"));
  tempDirs.push(cwd);
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  return cwd;
}
