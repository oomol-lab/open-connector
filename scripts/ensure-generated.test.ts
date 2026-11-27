import type { ProviderDefinition } from "../src/core/types.ts";
import type { ProviderSource } from "./provider-source.ts";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCloudflareRegistryCurrent } from "./ensure-generated.ts";
import { generateProviderRegistries } from "./generate-provider-registry.ts";

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

describe("isCloudflareRegistryCurrent", () => {
  it("is stale once OPENCONNECTOR_PROVIDERS no longer matches the allowlist the registry was built with", async () => {
    const outputDir = await fixture();
    const registry = join(outputDir, "registry.cloudflare.generated.ts");

    await generateProviderRegistries(sources, { outputDir, allowlist: undefined });
    expect(await isCloudflareRegistryCurrent(registry, undefined)).toBe(true);
    expect(await isCloudflareRegistryCurrent(registry, ["alpha"])).toBe(false);

    await generateProviderRegistries(sources, { outputDir, allowlist: ["alpha"] });
    expect(await isCloudflareRegistryCurrent(registry, ["alpha"])).toBe(true);
    expect(await isCloudflareRegistryCurrent(registry, ["alpha", "bravo"])).toBe(false);
    expect(await isCloudflareRegistryCurrent(registry, undefined)).toBe(false);
  });

  it("is stale when the registry is missing", async () => {
    const outputDir = await fixture();

    expect(await isCloudflareRegistryCurrent(join(outputDir, "registry.cloudflare.generated.ts"), undefined)).toBe(
      false,
    );
  });
});

async function fixture(): Promise<string> {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const directory = await mkdtemp(join(tmpdir(), "open-connector-ensure-generated-"));
  temporaryDirectories.push(directory);
  return directory;
}
