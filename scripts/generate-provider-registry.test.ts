import type { ProviderDefinition } from "../src/core/types.ts";
import type { ExecutorModules } from "../src/providers/provider-loader.ts";
import type { ProviderSource } from "./provider-source.ts";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCustomProviders } from "../src/server/custom-providers.ts";
import { generateProviderRegistries } from "./generate-provider-registry.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const sources: ProviderSource[] = [
  providerSource("17track"),
  providerSource("alpha"),
  providerSource("bravo", { nodeOnly: true }),
  providerSource("charlie"),
];

describe("generateProviderRegistries", () => {
  it("writes every provider into both registries when no allowlist is set", async () => {
    const outputDir = await fixture();

    await generateProviderRegistries(sources, { outputDir, allowlist: undefined });

    expect(await readFile(join(outputDir, "registry.generated.ts"), "utf8")).toBe(
      [
        'import type { ExecutorModule } from "./provider-loader.ts";',
        "",
        "/** Generated lazy imports for provider executors. Do not hand-edit. */",
        "export const executorModules: Record<string, () => Promise<ExecutorModule>> = {",
        '  "17track": (): Promise<ExecutorModule> => import("./17track/executors.ts"),',
        '  alpha: (): Promise<ExecutorModule> => import("./alpha/executors.ts"),',
        '  bravo: (): Promise<ExecutorModule> => import("./bravo/executors.ts"),',
        '  charlie: (): Promise<ExecutorModule> => import("./charlie/executors.ts"),',
        "};",
        "",
      ].join("\n"),
    );
    expect(await readFile(join(outputDir, "registry.cloudflare.generated.ts"), "utf8")).toBe(
      [
        'import type { ExecutorModule } from "./provider-loader.ts";',
        "",
        "/** Generated lazy imports for provider executors. Do not hand-edit. */",
        "export const executorModules: Record<string, () => Promise<ExecutorModule>> = {",
        '  "17track": (): Promise<ExecutorModule> => import("./17track/executors.ts"),',
        '  alpha: (): Promise<ExecutorModule> => import("./alpha/executors.ts"),',
        '  charlie: (): Promise<ExecutorModule> => import("./charlie/executors.ts"),',
        "};",
        "",
        "/** Bundled providers that are left out of this registry. Do not hand-edit. */",
        "export const excludedServices: readonly string[] = [",
        '  "bravo",',
        "];",
        "",
      ].join("\n"),
    );
  });

  it("keeps only allowlisted providers in the Workers registry and reserves every other bundled id", async () => {
    const outputDir = await fixture();
    const unfiltered = await fixture();
    await generateProviderRegistries(sources, { outputDir: unfiltered, allowlist: undefined });

    await generateProviderRegistries(sources, { outputDir, allowlist: ["charlie"] });

    const registry = await importCloudflareRegistry(outputDir);
    expect(Object.keys(registry.executorModules)).toEqual(["charlie"]);
    expect(registry.excludedServices).toEqual(["17track", "alpha", "bravo"]);
    // The Node registry and the action contracts still cover every bundled provider.
    for (const filename of ["registry.generated.ts", "action-contracts.generated.ts"]) {
      expect(await readFile(join(outputDir, filename), "utf8")).toBe(
        await readFile(join(unfiltered, filename), "utf8"),
      );
    }

    // createCloudflareWorker reserves both lists, so a custom provider cannot take a left-out bundled id.
    const bundledServices = [...Object.keys(registry.executorModules), ...registry.excludedServices];
    for (const service of ["alpha", "bravo"]) {
      expect(() =>
        registerCustomProviders({
          bundledModules: registry.executorModules,
          bundledServices,
          customProviders: [{ definition: customDefinition(service), load: async () => ({ executors: {} }) }],
        }),
      ).toThrow(`Provider service already registered: ${service}`);
    }
  });

  it("refuses an allowlist naming an unknown provider", async () => {
    const outputDir = await fixture();

    await expect(generateProviderRegistries(sources, { outputDir, allowlist: ["alpah", "charlie"] })).rejects.toThrow(
      "OPENCONNECTOR_PROVIDERS lists unknown providers: alpah (did you mean alpha?)",
    );
  });

  it("refuses an allowlist naming a Node-only provider", async () => {
    const outputDir = await fixture();

    await expect(generateProviderRegistries(sources, { outputDir, allowlist: ["alpha", "bravo"] })).rejects.toThrow(
      "OPENCONNECTOR_PROVIDERS lists Node-only providers that cannot run on Cloudflare Workers: bravo",
    );
  });
});

interface CloudflareRegistry {
  executorModules: ExecutorModules;
  excludedServices: readonly string[];
}

async function importCloudflareRegistry(outputDir: string): Promise<CloudflareRegistry> {
  return (await import(pathToFileURL(join(outputDir, "registry.cloudflare.generated.ts")).href)) as CloudflareRegistry;
}

function providerSource(service: string, options: { nodeOnly?: boolean } = {}): ProviderSource {
  return {
    definition: { ...customDefinition(service), actions: [{ name: "list" }] } as unknown as ProviderDefinition,
    nodeOnly: options.nodeOnly ?? false,
    service,
  };
}

function customDefinition(service: string): ProviderDefinition {
  return {
    service,
    displayName: service,
    categories: ["Developer Tools"],
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions: [],
  };
}

async function fixture(): Promise<string> {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const directory = await mkdtemp(join(tmpdir(), "open-connector-registry-"));
  temporaryDirectories.push(directory);
  return directory;
}
