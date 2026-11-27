import type { ProviderDefinition } from "../src/core/types.ts";
import type { ProviderSource } from "./provider-source.ts";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateProviderRegistries } from "./generate-provider-registry.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const sources: ProviderSource[] = ["alpha", "charlie"].map((service) => ({
  definition: { service, actions: [] } as unknown as ProviderDefinition,
  nodeOnly: false,
  service,
}));

describe("generateProviderRegistries allowlist source (review)", () => {
  it("reads OPENCONNECTOR_PROVIDERS when the caller passes no allowlist option", async () => {
    vi.stubEnv("OPENCONNECTOR_PROVIDERS", " charlie ");
    const outputDir = await fixture();

    await generateProviderRegistries(sources, { outputDir });

    const registry = await readFile(join(outputDir, "registry.cloudflare.generated.ts"), "utf8");
    expect(registry).toContain("// Built with OPENCONNECTOR_PROVIDERS=charlie. Do not hand-edit.");
    expect(registry).toContain('import("./charlie/executors.ts")');
    expect(registry).not.toContain('import("./alpha/executors.ts")');
  });

  it("keeps every provider when the caller passes allowlist: undefined, even with OPENCONNECTOR_PROVIDERS set", async () => {
    vi.stubEnv("OPENCONNECTOR_PROVIDERS", "charlie");
    const outputDir = await fixture();

    await generateProviderRegistries(sources, { outputDir, allowlist: undefined });

    const registry = await readFile(join(outputDir, "registry.cloudflare.generated.ts"), "utf8");
    expect(registry).not.toContain("Built with");
    expect(registry).toContain('import("./alpha/executors.ts")');
    expect(registry).toContain('import("./charlie/executors.ts")');
  });
});

async function fixture(): Promise<string> {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const directory = await mkdtemp(join(tmpdir(), "open-connector-registry-review-"));
  temporaryDirectories.push(directory);
  return directory;
}
