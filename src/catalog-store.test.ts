import type { CatalogStore, ProviderSummaryDefinition } from "./catalog-store.ts";
import type { JsonSchema, ProviderDefinition } from "./core/types.ts";

import * as jsonSchema from "@cfworker/json-schema";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogIndexFileName, createCatalogIndex } from "./catalog-index.ts";
import { defaultLazySchemaCacheFiles } from "./catalog-lazy-schemas.ts";
import { createCatalogStore, loadCatalog, resolveExecutableActionIds } from "./catalog-store.ts";
import { validateActionInput } from "./core/validation.ts";

vi.mock("@cfworker/json-schema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cfworker/json-schema")>();
  return { ...actual, Validator: vi.fn(class extends actual.Validator {}) };
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("catalog store", () => {
  it.each([false, true])("reuses compiled validators while definitions are resident (lazy=%s)", async (lazySchemas) => {
    const catalogDir = await writeCatalogDir([
      providerFixture("example", ["ping"]),
      providerFixture("remote", ["ping"]),
    ]);
    const catalog = await loadCatalog(catalogDir, { lazySchemas, lazySchemaCacheFiles: 1 });
    const compiled = vi.mocked(jsonSchema.Validator);
    compiled.mockClear();
    const [first, concurrent] = await Promise.all([
      catalog.getAction("example.ping"),
      catalog.getAction("example.ping"),
    ]);
    if (!first || !concurrent) throw new Error("Missing fixture action");
    expect(concurrent).toBe(first);
    validateActionInput(first, {});
    const repeated = await catalog.getAction(first.id);
    if (!repeated) throw new Error("Missing fixture action");
    expect(repeated).toBe(first);
    validateActionInput(repeated, {});
    expect(compiled).toHaveBeenCalledTimes(1);

    await catalog.getAction("remote.ping");
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 2));
    const reloaded = await catalog.getAction(first.id);
    if (!reloaded) throw new Error("Missing fixture action");
    if (lazySchemas) {
      expect(reloaded).not.toBe(first);
      expect(reloaded.inputSchema).toEqual(schemaFor("ping", 2));
    } else {
      expect(reloaded).toBe(first);
    }
    validateActionInput(reloaded, {});
    expect(compiled).toHaveBeenCalledTimes(lazySchemas ? 2 : 1);
  });

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

  it("builds provider summaries that drop action schemas but keep metadata", async () => {
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
            operationType: "read",
            requiredScopes: ["read"],
            providerPermissions: [],
            inputSchema: { type: "object", properties: { message: { type: "string" } } },
            outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
          },
        ],
      },
    ];

    const catalog = createCatalogStore(providers, { executableActionIds: ["example.ping"] });
    const [summary] = JSON.parse(
      new TextDecoder().decode(catalog.providerSummariesJson),
    ) as ProviderSummaryDefinition[];
    const summarizedAction = summary?.actions[0];

    expect(summarizedAction).not.toHaveProperty("inputSchema");
    expect(summarizedAction).not.toHaveProperty("outputSchema");
    expect(summarizedAction?.id).toBe("example.ping");
    expect(summarizedAction?.requiredScopes).toEqual(["read"]);
    expect(summarizedAction?.execution.locallyExecutable).toBe(true);
    expect(summary?.execution.actionCount).toBe(1);
    expect(summary?.scenario).toBe("developer");
    // The full catalog still carries schemas for /api/actions/:actionId.
    expect((await catalog.getAction("example.ping"))?.inputSchema).toEqual({
      type: "object",
      properties: { message: { type: "string" } },
    });
  });

  it("keeps provider summaries as UTF-8 bytes while the ETag still describes the JSON string", () => {
    const providers: ProviderDefinition[] = [
      {
        service: "example",
        displayName: "示例",
        categories: ["Developer Tools"],
        authTypes: ["no_auth"],
        auth: [{ type: "no_auth" }],
        actions: [],
      },
    ];

    const catalog = createCatalogStore(providers);
    const json = new TextDecoder().decode(catalog.providerSummariesJson);

    expect(catalog.providerSummariesJson).toBeInstanceOf(Uint8Array);
    expect(json).toBe(
      JSON.stringify(catalog.providers.map((provider) => ({ ...provider, setup: [{ type: "no_auth" }] }))),
    );
    // The non-Latin1 display name takes more UTF-8 bytes than UTF-16 code units, so the length
    // field below can only match if the ETag still describes the string.
    expect(catalog.providerSummariesJson.byteLength).toBeGreaterThan(json.length);
    expect(catalog.providerSummariesEtag).toBe(`W/"${json.length.toString(16)}-8947cfda"`);
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
  it("coalesces concurrent schema reads and retries after a failed read", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping", "pong"])]);
    const catalog = await loadCatalog(catalogDir, { lazySchemas: true });
    await writeFile(join(catalogDir, "example.json"), "invalid json");
    await expect(catalog.getAction("example.ping")).rejects.toThrow(SyntaxError);
    await writeProviderFile(catalogDir, providerFixture("example", ["ping", "pong"], 2));
    const [first, second] = await Promise.all([catalog.getAction("example.ping"), catalog.getAction("example.ping")]);
    expect(first?.inputSchema).toBe(second?.inputSchema);
    expect(first?.inputSchema).toEqual(schemaFor("ping", 2));
    expect(await catalog.getAction("missing.action")).toBeUndefined();
  });

  it("copies and serializes metadata without reading the schema files", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping"])]);
    const catalog = await loadCatalog(catalogDir, { lazySchemas: true });
    await rm(catalogDir, { recursive: true });
    const metadata = catalog.actionsById.get("example.ping")!;
    expect(JSON.parse(JSON.stringify({ ...metadata }))).toMatchObject({ id: "example.ping" });
    expect(metadata).not.toHaveProperty("inputSchema");
    await expect(catalog.getAction(metadata.id)).rejects.toThrow();
  });

  it("keeps schemas as plain data properties by default", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping", "pong"])]);

    const catalog = await loadCatalog(catalogDir);
    const action = (await catalog.getAction("example.ping"))!;
    const descriptor = Object.getOwnPropertyDescriptor(action, "inputSchema")!;

    expect(descriptor.get).toBeUndefined();
    expect(descriptor.value).toEqual(schemaFor("ping", 1));
  });

  it("loads every provider file by default when the catalog spans several read batches", async () => {
    // More files than two full read batches (see providerReadBatchSize in catalog-store.ts), so the
    // batched loop has to carry results across batch boundaries and through a partial last batch.
    const providers = Array.from({ length: 9 }, (_, index) =>
      providerFixture(`service${String(index).padStart(2, "0")}`, ["ping", "pong"]),
    );
    const catalogDir = await writeCatalogDir(providers);

    const catalog = await loadCatalog(catalogDir);

    expect(catalog.providers.map((provider) => provider.service)).toEqual(
      providers.map((provider) => provider.service),
    );
    expect(catalog.actions).toHaveLength(18);
    expect((await catalog.getAction("service08.pong"))?.inputSchema).toEqual(schemaFor("pong", 1));
  });

  it("reads lazy schemas from disk on access, so a change to an uncached file is picked up", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping"])]);

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true });
    const action = catalog.actionsById.get("example.ping")!;
    expect(action).not.toHaveProperty("inputSchema");
    expect({ ...action }).toEqual(action);
    expect(JSON.parse(JSON.stringify(action))).toEqual(action);
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 2));

    expect((await catalog.getAction(action.id))!.inputSchema).toEqual(schemaFor("ping", 2));
    expect((await catalog.getAction(action.id))!.outputSchema).toEqual({
      type: "object",
      properties: { ok: { type: "boolean" } },
    });
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

    expect((await catalog.getAction(example.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    // Caching "remote" evicts "example", so the next access re-reads the edited file.
    expect((await catalog.getAction(remote.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 2));
    expect((await catalog.getAction(example.id))!.inputSchema).toEqual(schemaFor("ping", 2));

    // "example" is cached again, so a further edit stays invisible until it is evicted.
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 3));
    expect((await catalog.getAction(example.id))!.inputSchema).toEqual(schemaFor("ping", 2));
    expect((await catalog.getAction(remote.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    expect((await catalog.getAction(example.id))!.inputSchema).toEqual(schemaFor("ping", 3));
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

    expect((await catalog.getAction(example.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    expect((await catalog.getAction(remote.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    // Re-reading "example" makes it the most recent, so caching "third" must evict "remote".
    expect((await catalog.getAction(example.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    expect((await catalog.getAction(third.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    await writeProviderFile(catalogDir, providerFixture("example", ["ping"], 2));
    await writeProviderFile(catalogDir, providerFixture("remote", ["ping"], 2));

    // Staleness is the only way to observe which file the cache kept: "example" is still cached and
    // answers from the parse it already has, while the evicted "remote" re-reads the edited file.
    expect((await catalog.getAction(example.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    expect((await catalog.getAction(remote.id))!.inputSchema).toEqual(schemaFor("ping", 2));
  });

  it("caches the default number of provider files when no cache size is given", async () => {
    const services = Array.from({ length: defaultLazySchemaCacheFiles + 1 }, (_, index) => `service${index}`);
    const catalogDir = await writeCatalogDir(services.map((service) => providerFixture(service, ["ping"])));

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true });
    const actionFor = (service: string) => catalog.getAction(`${service}.ping`);
    // One file more than the cache holds, read oldest first, so only the first service is evicted.
    for (const service of services) {
      expect((await actionFor(service))!.inputSchema).toEqual(schemaFor("ping", 1));
    }
    await writeProviderFile(catalogDir, providerFixture(services[0]!, ["ping"], 2));
    await writeProviderFile(catalogDir, providerFixture(services[1]!, ["ping"], 2));

    // The second service is checked first because re-reading the evicted first file would cache it
    // again and push the second one out in turn.
    expect((await actionFor(services[1]!))!.inputSchema).toEqual(schemaFor("ping", 1));
    expect((await actionFor(services[0]!))!.inputSchema).toEqual(schemaFor("ping", 2));
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
    expect((await catalog.getAction(example.id))!.inputSchema).toEqual(schemaFor("ping", 1));
    expect((await catalog.getAction("remote.ping"))!.inputSchema).toEqual(schemaFor("ping", 1));
    await writeProviderFile(catalogDir, providerFixture("example", ["pong"]));

    await expect(catalog.getAction(example.id)).rejects.toThrow(
      `Catalog action example.ping is missing from ${join(catalogDir, "example.json")}`,
    );
  });

  it("serializes a lazily loaded catalog exactly like an eagerly loaded one", async () => {
    const providers = [providerFixture("example", ["ping", "pong"]), providerFixture("remote", ["ping"])];
    const catalogDir = await writeCatalogDir(providers);
    const lazySchemaIndexFile = await writeCatalogIndex(catalogDir, providers);

    const eager = await loadCatalog(catalogDir, { executableServices: ["example"] });
    const lazy = await loadCatalog(catalogDir, { executableServices: ["example"], lazySchemas: true });
    const indexed = await loadCatalog(catalogDir, {
      executableServices: ["example"],
      lazySchemas: true,
      lazySchemaIndexFile,
    });

    for (const store of [lazy, indexed]) {
      expect(store.providerSummariesJson).toEqual(eager.providerSummariesJson);
      expect(store.providerSummariesEtag).toBe(eager.providerSummariesEtag);
      expect(JSON.stringify(store.actions)).toBe(JSON.stringify(eager.actions));
      expect([...store.actionsById.keys()]).toEqual([...eager.actionsById.keys()]);
      expect(JSON.stringify([...store.actionsById.values()])).toBe(JSON.stringify([...eager.actionsById.values()]));
      expect(await Promise.all(store.actions.map((action) => store.getAction(action.id)))).toEqual(
        await Promise.all(eager.actions.map((action) => eager.getAction(action.id))),
      );
      expect(actionKeys(store)).toEqual(actionKeys(eager));
      expect(actionKeys(store)[0]).toEqual([
        "id",
        "service",
        "name",
        "description",
        "operationType",
        "requiredScopes",
        "providerPermissions",
        "followUpActions",
        "asyncLifecycle",
        "execution",
      ]);
    }
    for (const store of [eager, lazy, indexed]) {
      const summaries = new TextDecoder().decode(store.providerSummariesJson);
      expect(summaries).not.toContain("inputSchema");
      expect(summaries).not.toContain("outputSchema");
    }
  });

  it("builds provider summaries without reading any lazy schema", async () => {
    const catalogDir = await writeCatalogDir([providerFixture("example", ["ping"])]);

    const catalog = await loadCatalog(catalogDir, { lazySchemas: true });
    await rm(catalogDir, { recursive: true, force: true });

    const [summary] = JSON.parse(
      new TextDecoder().decode(catalog.providerSummariesJson),
    ) as ProviderSummaryDefinition[];
    expect(summary?.actions[0]?.id).toBe("example.ping");
    // Nothing was cached during store construction, so the first schema access has to hit the
    // deleted file.
    await expect(catalog.getAction("example.ping")).rejects.toThrow();
  });

  it("reads only the index at startup when one is given", async () => {
    const providers = [providerFixture("example", ["ping"]), providerFixture("remote", ["ping"])];
    const catalogDir = await writeCatalogDir(providers);
    const lazySchemaIndexFile = await writeCatalogIndex(catalogDir, providers);
    const eager = await loadCatalog(catalogDir);
    // Spaces of the same byte length keep the index's size check passing while any read of a provider
    // file, at startup or on schema access, fails to parse.
    await blankProviderFiles(catalogDir);

    await expect(loadCatalog(catalogDir, { lazySchemas: true })).rejects.toThrow(SyntaxError);
    const catalog = await loadCatalog(catalogDir, { lazySchemas: true, lazySchemaIndexFile });

    expect(catalog.providerSummariesJson).toEqual(eager.providerSummariesJson);
    const action = catalog.actionsById.get("example.ping")!;
    expect(action).not.toHaveProperty("inputSchema");
    await expect(catalog.getAction(action.id)).rejects.toThrow(SyntaxError);
  });

  it("refuses an index that no longer describes the catalog files", async () => {
    const providers = [providerFixture("example", ["ping"]), providerFixture("remote", ["ping"])];
    const catalogDir = await writeCatalogDir(providers);
    const lazySchemaIndexFile = await writeCatalogIndex(catalogDir, providers);
    await writeProviderFile(catalogDir, {
      ...providerFixture("remote", ["ping"]),
      description: "A longer description than the index was written for.",
    });

    await expect(loadCatalog(catalogDir, { lazySchemas: true, lazySchemaIndexFile })).rejects.toThrow(
      /remote\.json \(\d+ bytes, now \d+\); run npm run generate:catalog/,
    );
    // Both file-scanning modes keep working: only the index-backed startup refuses a mismatched catalog.
    await expect(loadCatalog(catalogDir, { lazySchemas: true })).resolves.toBeDefined();
    await expect(loadCatalog(catalogDir)).resolves.toBeDefined();
  });
});

function actionKeys(catalog: CatalogStore): string[][] {
  return catalog.actions.map((action) => Object.keys(action));
}

/** Write the providers to `<tmp>/apps/`, the layout the index sits next to, and return that apps directory. */
async function writeCatalogDir(providers: ProviderDefinition[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "catalog-store-"));
  temporaryDirectories.push(root);
  const catalogDir = join(root, "apps");
  await mkdir(catalogDir);
  for (const provider of providers) {
    await writeProviderFile(catalogDir, provider);
  }

  return catalogDir;
}

/** Write the index for the provider files already in `catalogDir` beside it, as the generator lays it out. */
async function writeCatalogIndex(catalogDir: string, providers: ProviderDefinition[]): Promise<string> {
  const sources = await Promise.all(
    providers.map(async (provider) => {
      const file = `${provider.service}.json`;
      return { file, bytes: (await stat(join(catalogDir, file))).size, provider };
    }),
  );
  const indexFile = join(dirname(catalogDir), catalogIndexFileName);
  await writeFile(indexFile, JSON.stringify(createCatalogIndex(sources)));

  return indexFile;
}

function writeProviderFile(catalogDir: string, provider: ProviderDefinition): Promise<void> {
  return writeFile(join(catalogDir, `${provider.service}.json`), JSON.stringify(provider));
}

/** Overwrite every provider file in `catalogDir` with spaces of the same byte length, so only its size survives. */
async function blankProviderFiles(catalogDir: string): Promise<void> {
  for (const name of await readdir(catalogDir)) {
    const filePath = join(catalogDir, name);
    await writeFile(filePath, " ".repeat((await stat(filePath)).size));
  }
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
      operationType: "read",
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
