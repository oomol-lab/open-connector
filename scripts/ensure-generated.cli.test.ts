import type { ProviderDefinition } from "../src/core/types.ts";
import type { ProviderSource } from "./provider-source.ts";

import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCloudflareRegistryCurrent } from "./ensure-generated.ts";
import { generateProviderRegistries } from "./generate-provider-registry.ts";

const script = join(import.meta.dirname, "ensure-generated.ts");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const sources: ProviderSource[] = ["alpha", "bravo"].map((service) => ({
  definition: { service, actions: [] } as unknown as ProviderDefinition,
  nodeOnly: false,
  service,
}));

describe("isCloudflareRegistryCurrent (review)", () => {
  it("is stale when the variable names different providers of the same count", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const outputDir = await temporaryDirectory();
    await generateProviderRegistries(sources, { outputDir, allowlist: ["alpha"] });

    expect(await isCloudflareRegistryCurrent(join(outputDir, "registry.cloudflare.generated.ts"), ["bravo"])).toBe(
      false,
    );
  });
});

// Runs the real script against a fake checkout whose generators only record that they ran.
describe("ensure-generated script (review)", () => {
  const sourceTime = new Date("2020-01-01T00:00:00Z");
  const catalogTime = new Date("2021-01-01T00:00:00Z");

  it("regenerates the registries when OPENCONNECTOR_PROVIDERS changes but the catalog is fresh", async () => {
    const cwd = await fakeCheckout();

    expect(runEnsureGenerated(cwd, undefined)).toBe(0);
    expect(await ran(cwd)).toEqual({ catalog: false, registry: false });

    expect(runEnsureGenerated(cwd, "alpha")).toBe(0);
    expect(await ran(cwd)).toEqual({ catalog: false, registry: true });
  });

  it("treats scripts/provider-allowlist.ts as a generator source", async () => {
    const cwd = await fakeCheckout();
    const later = new Date("2022-01-01T00:00:00Z");
    await utimes(join(cwd, "scripts/provider-allowlist.ts"), later, later);

    expect(runEnsureGenerated(cwd, undefined)).toBe(0);
    expect((await ran(cwd)).catalog).toBe(true);
  });

  async function fakeCheckout(): Promise<string> {
    const cwd = await temporaryDirectory();
    await mkdir(join(cwd, "src/providers/alpha"), { recursive: true });
    await mkdir(join(cwd, "scripts"), { recursive: true });
    await mkdir(join(cwd, "catalog/apps"), { recursive: true });
    for (const name of ["registry.generated.ts", "registry.cloudflare.generated.ts", "action-contracts.generated.ts"]) {
      await writeFile(join(cwd, "src/providers", name), "export {};\n");
    }
    for (const [name, marker] of [
      ["generate-catalog.ts", "ran-catalog"],
      ["generate-provider-registry.ts", "ran-registry"],
    ]) {
      await writeFile(
        join(cwd, "scripts", name),
        `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "");\n`,
      );
    }
    for (const name of ["provider-allowlist.ts", "provider-source.ts"]) {
      await writeFile(join(cwd, "scripts", name), "export {};\n");
    }
    await writeFile(join(cwd, "catalog/apps/alpha.json"), "{}\n");
    await writeFile(join(cwd, "catalog/apps-index.json"), "{}\n");

    for (const path of [
      "scripts/generate-catalog.ts",
      "scripts/generate-provider-registry.ts",
      "scripts/provider-allowlist.ts",
      "scripts/provider-source.ts",
      "src/providers/alpha",
      "src/providers",
    ]) {
      await utimes(join(cwd, path), sourceTime, sourceTime);
    }
    for (const path of ["catalog/apps/alpha.json", "catalog/apps-index.json"]) {
      await utimes(join(cwd, path), catalogTime, catalogTime);
    }
    return cwd;
  }
});

function runEnsureGenerated(cwd: string, allowlist: string | undefined): number | null {
  const env = { ...process.env };
  delete env.OPENCONNECTOR_PROVIDERS;
  if (allowlist !== undefined) {
    env.OPENCONNECTOR_PROVIDERS = allowlist;
  }
  return spawnSync(process.execPath, [script], { cwd, env, encoding: "utf8" }).status;
}

async function ran(cwd: string): Promise<{ catalog: boolean; registry: boolean }> {
  const exists = (path: string) =>
    access(join(cwd, path)).then(
      () => true,
      () => false,
    );
  return { catalog: await exists("ran-catalog"), registry: await exists("ran-registry") };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "open-connector-ensure-generated-review-"));
  temporaryDirectories.push(directory);
  return directory;
}
