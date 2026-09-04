import type { CatalogStore, ProviderSummaryDefinition } from "./catalog-store.ts";
import type { JsonSchema, ProviderDefinition } from "./core/types.ts";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultLazySchemaCacheFiles } from "./catalog-lazy-schemas.ts";
import { createCatalogStore, loadCatalog, resolveExecutableActionIds } from "./catalog-store.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("catalog store", () => {
  it("preserves optional provider descriptions without defaulting missing ones", () => {
    const providers: ProviderDefinition[] = [
      {
        service: "described",
        displayName: "Described",
        description: "A provider-level summary.",
        categories: ["Developer Tools"],
        authTypes: ["no_auth"],
        auth: [{ type: "no_auth" }],
        actions: [],
      },
      {
        service: "plain",
        displayName: "Plain",
        categories: ["Developer Tools"],
        authTypes: ["no_auth"],
        auth: [{ type: "no_auth" }],
        actions: [],
      },
    ];

    const catalog = createCatalogStore(providers);

    expect(catalog.providers.find((provider) => provider.service === "described")?.description).toBe(
      "A provider-level summary.",
    );
    expect(catalog.providers.find((provider) => provider.service === "plain")).not.toHaveProperty("description");
  });

  it("builds provider summaries that drop action schemas but keep metadata", () => {
    const providers: ProviderDefinition[] = [
      {
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
            description: "Ping the service.",
            requiredScopes: ["read"],
            providerPermissions: [],
            inputSchema: { type: "object", properties: { message: { type: "string" } } },
            outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
          },
        ],
      },
    ];

    const catalog = createCatalogStore(providers, { executableActionIds: ["example.ping"] });
    const [summary] = JSON.parse(catalog.providerSummariesJson) as ProviderSummaryDefinition[];
    const summarizedAction = summary?.actions[0];

    expect(summarizedAction).not.toHaveProperty("inputSchema");
    expect(summarizedAction).not.toHaveProperty("outputSchema");
    expect(summarizedAction?.id).toBe("example.ping");
    expect(summarizedAction?.requiredScopes).toEqual(["read"]);
    expect(summarizedAction?.execution.locallyExecutable).toBe(true);
    expect(summary?.execution.actionCount).toBe(1);
    expect(summary?.scenario).toBe("developer");
    // The full catalog still carries schemas for /api/actions/:actionId.
    expect(catalog.actionsById.get("example.ping")?.inputSchema).toEqual({
      type: "object",
      properties: { message: { type: "string" } },
    });
  });

  it("resolves every action from executable services alongside explicit action ids", () => {
    const providers = [providerFixture("example", ["ping", "pong"]), providerFixture("remote", ["ping"])];

    const catalog = createCatalogStore(providers, {
      executableActionIds: resolveExecutableActionIds(providers, {
        executableServices: ["example"],
        executableActionIds: ["remote.ping"],
      }),
    });

    expect(catalog.executableActionIds).toEqual(new Set(["example.ping", "example.pong", "remote.ping"]));
    expect(catalog.actionsById.get("example.pong")?.execution.locallyExecutable).toBe(true);
  });
});

describe("loadCatalog", () => {
  it("keeps schemas as plain data properties by default", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping", "pong"])]);

    const catalog = await loadCatalog(catalogDir);
    const action = catalog.actionsById.get("example.ping")!;
    const descriptor = Object.getOwnPropertyDescriptor(action, "inputSchema")!;

    expect(descriptor.get).toBeUndefined();
    expect(descriptor.value).toEqual(schemaFor("ping", 1));
  });

  it("reads lazy schemas from disk on access, so a change to an uncached file is picked up", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping"])]);

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true });
    const action = catalog.actionsById.get("example.ping")!;
    expect(Object.getOwnPropertyDescriptor(action, "inputSchema")?.get).toBeTypeOf("function");
    // The link back to the catalog file must stay invisible to key iteration and to spread copies.
    const [schemaSource] = Object.getOwnPropertySymbols(action);
    expect(Object.getOwnPropertyDescriptor(action, schemaSource!)?.enumerable).toBe(false);
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 2));

    expect(action.inputSchema).toEqual(schemaFor("ping", 2));
    expect(action.outputSchema).toEqual({ type: "object", properties: { ok: { type: "boolean" } } });
    expect(Object.getOwnPropertySymbols({ ...action })).toEqual([]);
  });

  it("re-reads a lazy schema file only after the cache evicts it", async () => {
    const catalogDir = await writeCatalogDir([
      providerFixture("example", ["ping"]),
      providerFixture("remote", ["ping"]),
    ]);

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true, lazySchemaCacheFiles: 1 });
    const example = catalog.actionsById.get("example.ping")!;
    const remote = catalog.actionsById.get("remote.ping")!;

    expect(example.inputSchema).toEqual(schemaFor("ping", 1));
    // Caching "remote" evicts "example", so the next access re-reads the edited file.
    expect(remote.inputSchema).toEqual(schemaFor("ping", 1));
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 2));
    expect(example.inputSchema).toEqual(schemaFor("ping", 2));

    // "example" is cached again, so a further edit stays invisible until it is evicted.
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 3));
    expect(example.inputSchema).toEqual(schemaFor("ping", 2));
    expect(remote.inputSchema).toEqual(schemaFor("ping", 1));
    expect(example.inputSchema).toEqual(schemaFor("ping", 3));
  });

  it("keeps a file cached when a hit refreshes its recency", async () => {
    const catalogDir = await writeCatalogDir([
      providerFixture("example", ["ping"]),
      providerFixture("remote", ["ping"]),
      providerFixture("third", ["ping"]),
    ]);

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true, lazySchemaCacheFiles: 2 });
    const example = catalog.actionsById.get("example.ping")!;
    const remote = catalog.actionsById.get("remote.ping")!;
    const third = catalog.actionsById.get("third.ping")!;

    expect(example.inputSchema).toEqual(schemaFor("ping", 1));
    expect(remote.inputSchema).toEqual(schemaFor("ping", 1));
    // Re-reading "example" makes it the most recent, so caching "third" must evict "remote".
    expect(example.inputSchema).toEqual(schemaFor("ping", 1));
    expect(third.inputSchema).toEqual(schemaFor("ping", 1));
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 2));
    await writeProviderFile(catalogDir, providerFixture("remote", ["ping"], 2));

    // Staleness is the only way to observe which file the cache kept: "example" is still cached and
    // answers from the parse it already has, while the evicted "remote" re-reads the edited file.
    expect(example.inputSchema).toEqual(schemaFor("ping", 1));
    expect(remote.inputSchema).toEqual(schemaFor("ping", 2));
  });

  it("caches the default number of provider files when no cache size is given", async () => {
    const services = Array.from({ length: defaultLazySchemaCacheFiles + 1 }, (_, index) => `service${index}`);
    const catalogDir = await writeCatalogDir(services.map((service) => providerFixture(service, ["ping"])));

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true });
    const actionFor = (service: string) => catalog.actionsById.get(`${service}.ping`)!;
    // One file more than the cache holds, read oldest first, so only the first service is evicted.
    for (const service of services) {
      expect(actionFor(service).inputSchema).toEqual(schemaFor("ping", 1));
    }
    await writeProviderFile(catalogDir, providerFixture(services[0]!, ["ping"], 2));
    await writeProviderFile(catalogDir, providerFixture(services[1]!, ["ping"], 2));

    // The second service is checked first because re-reading the evicted first file would cache it
    // again and push the second one out in turn.
    expect(actionFor(services[1]!).inputSchema).toEqual(schemaFor("ping", 1));
    expect(actionFor(services[0]!).inputSchema).toEqual(schemaFor("ping", 2));
  });

  it("rejects a lazy schema cache size that is not a positive integer", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping"])]);

    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(loadCatalog(catalogDir, { lazySchemas: true, lazySchemaCacheFiles: value })).rejects.toThrow(
        "lazySchemaCacheFiles must be a positive integer",
      );
    }
  });

  it("reports the action and file when a lazy schema file no longer contains the action", async () => {
    const catalogDir = await writeCatalogDir([
      providerFixture("example", ["ping"]),
      providerFixture("remote", ["ping"]),
    ]);

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true, lazySchemaCacheFiles: 1 });
    const example = catalog.actionsById.get("example.ping")!;
    expect(example.inputSchema).toEqual(schemaFor("ping", 1));
    expect(catalog.actionsById.get("remote.ping")!.inputSchema).toEqual(schemaFor("ping", 1));
    await writeProviderFile(catalogDir, providerFixture("example", ["pong"]));

    expect(() => example.inputSchema).toThrow(
      `Catalog action example.ping is missing from ${join(catalogDir, "example.json")}`,
    );
  });

  it("serializes a lazily loaded catalog exactly like an eagerly loaded one", async () => {
    const catalogDir = await writeCatalogDir([
      providerFixture("example", ["ping", "pong"]),
      providerFixture("remote", ["ping"]),
    ]);

    const eager = await loadCatalog(catalogDir, { executableServices: ["example"] });
    const lazy = await loadCatalog(catalogDir, { executableServices: ["example"], lazySchemas: true });

    expect(lazy.providerSummariesJson).toBe(eager.providerSummariesJson);
    expect(lazy.providerSummariesEtag).toBe(eager.providerSummariesEtag);
    expect(JSON.stringify(lazy.actions)).toBe(JSON.stringify(eager.actions));
    expect([...lazy.actionsById.keys()]).toEqual([...eager.actionsById.keys()]);
    expect(JSON.stringify([...lazy.actionsById.values()])).toBe(JSON.stringify([...eager.actionsById.values()]));
    expect(actionKeys(lazy)).toEqual(actionKeys(eager));
    expect(actionKeys(lazy)[0]).toEqual([
      "id",
      "service",
      "name",
      "description",
      "requiredScopes",
      "providerPermissions",
      "inputSchema",
      "outputSchema",
      "followUpActions",
      "asyncLifecycle",
      "execution",
    ]);
    for (const summaries of [eager.providerSummariesJson, lazy.providerSummariesJson]) {
      expect(summaries).not.toContain("inputSchema");
      expect(summaries).not.toContain("outputSchema");
    }
  });

  it("builds provider summaries without reading any lazy schema", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping"])]);

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true });
    await rm(catalogDir, { recursive: true, force: true });

    const [summary] = JSON.parse(catalog.providerSummariesJson) as ProviderSummaryDefinition[];
    expect(summary?.actions[0]?.id).toBe("example.ping");
    // Nothing was cached during store construction, so the first schema access has to hit the
    // deleted file.
    expect(() => catalog.actionsById.get("example.ping")!.inputSchema).toThrow();
  });
});

function actionKeys(catalog: CatalogStore): string[][] {
  return catalog.actions.map((action) => Object.keys(action));
}

async function writeCatalogDir(providers: ProviderDefinition[]): Promise<string> {
  const catalogDir = await mkdtemp(join(tmpdir(), "catalog-store-"));
  temporaryDirectories.push(catalogDir);
  for (const provider of providers) {
    await writeProviderFile(catalogDir, provider);
  }

  return catalogDir;
}

function writeProviderFile(catalogDir: string, provider: ProviderDefinition): Promise<void> {
  return writeFile(join(catalogDir, `${provider.service}.json`), JSON.stringify(provider));
}

/**
 * Generated catalog actions carry `followUpActions` and `asyncLifecycle` after the schemas, so the
 * fixture keeps keys on both sides of them.
 */
function providerFixture(service: string, actionNames: string[], revision = 1): ProviderDefinition {
  return {
    service,
    displayName: service,
    categories: ["Developer Tools"],
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions: actionNames.map((name) => ({
      id: `${service}.${name}`,
      service,
      name,
      description: `${name} action.`,
      requiredScopes: [],
      providerPermissions: [],
      inputSchema: schemaFor(name, revision),
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      followUpActions: [`${service}.${actionNames[0]}`],
      asyncLifecycle: {
        startActionId: `${service}.${actionNames[0]}`,
        statusActionId: `${service}.${name}`,
      },
    })),
  };
}

function schemaFor(name: string, revision: number): JsonSchema {
  return { type: "object", properties: { [`${name}${revision}`]: { type: "string" } } };
}
