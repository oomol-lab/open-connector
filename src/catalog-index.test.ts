import type { ProviderDefinition } from "./core/types.ts";

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { catalogIndexFileName, createCatalogIndex, readCatalogIndex } from "./catalog-index.ts";
import { loadCatalog } from "./catalog-store.ts";
import { executorModules } from "./providers/registry.generated.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("createCatalogIndex", () => {
  it("keeps every action key in file order with null schemas", () => {
    const provider = providerFixture("example", ["ping", "pong"]);

    const index = createCatalogIndex([{ file: "example.json", bytes: 123, provider }]);

    expect(index.version).toBe(1);
    expect(index.providers).toHaveLength(1);
    const [entry] = index.providers;
    expect(entry?.file).toBe("example.json");
    expect(entry?.bytes).toBe(123);
    expect(Object.keys(entry!.provider)).toEqual(Object.keys(provider));
    for (const [position, action] of entry!.provider.actions.entries()) {
      expect(Object.keys(action)).toEqual(Object.keys(provider.actions[position]!));
      expect(action.inputSchema).toBeNull();
      expect(action.outputSchema).toBeNull();
      expect(action.followUpActions).toEqual(provider.actions[position]!.followUpActions);
      expect(action.asyncLifecycle).toEqual(provider.actions[position]!.asyncLifecycle);
    }
    // The source provider is copied, not mutated.
    expect(provider.actions[0]!.inputSchema).toEqual({ type: "object", properties: { ping: { type: "string" } } });
  });
});

describe("readCatalogIndex", () => {
  it("returns every provider with the path of the file that owns its schemas", async () => {
    const providers = [providerFixture("example", ["ping"]), providerFixture("remote", ["ping"])];
    const { catalogDir, indexFile } = await writeIndexedCatalog(providers);

    const indexed = await readCatalogIndex({ indexFile, catalogDir, fileNames: ["example.json", "remote.json"] });

    expect(indexed.map((entry) => entry.filePath)).toEqual([
      join(catalogDir, "example.json"),
      join(catalogDir, "remote.json"),
    ]);
    expect(indexed[0]?.provider.actions[0]?.inputSchema).toBeNull();
    expect(indexed[0]?.provider.actions[0]?.id).toBe("example.ping");
  });

  it("rejects an index that does not describe the directory", async () => {
    const providers = [providerFixture("example", ["ping"]), providerFixture("remote", ["ping"])];
    const { catalogDir, indexFile } = await writeIndexedCatalog(providers);

    // A provider file the index does not list.
    await expect(
      readCatalogIndex({ indexFile, catalogDir, fileNames: ["example.json", "remote.json", "third.json"] }),
    ).rejects.toThrow(/not indexed: third\.json; no longer present: none.*run npm run generate:catalog/);
    // A listed provider file that is gone.
    await expect(readCatalogIndex({ indexFile, catalogDir, fileNames: ["example.json"] })).rejects.toThrow(
      /not indexed: none; no longer present: remote\.json.*run npm run generate:catalog/,
    );
    // A listed provider file whose size changed after the index was written.
    await writeProviderFile(catalogDir, providerFixture("remote", ["ping", "pong"]));
    await expect(
      readCatalogIndex({ indexFile, catalogDir, fileNames: ["example.json", "remote.json"] }),
    ).rejects.toThrow(/was written for a different remote\.json \(\d+ bytes, now \d+\); run npm run generate:catalog/);
  });

  it("rejects an unknown version and an index that is not JSON", async () => {
    const { catalogDir, indexFile } = await writeIndexedCatalog([providerFixture("example", ["ping"])]);

    await writeFile(indexFile, JSON.stringify({ version: 2, providers: [] }));
    await expect(readCatalogIndex({ indexFile, catalogDir, fileNames: ["example.json"] })).rejects.toThrow(
      `Catalog index ${indexFile} is not a version 1 index; run npm run generate:catalog`,
    );
    await writeFile(indexFile, JSON.stringify({ version: 1, providers: [{ file: "example.json" }] }));
    await expect(readCatalogIndex({ indexFile, catalogDir, fileNames: ["example.json"] })).rejects.toThrow(
      "is not a version 1 index; run npm run generate:catalog",
    );
    // An interrupted write leaves a truncated file behind; the fix must be named rather than a bare SyntaxError.
    await writeFile(indexFile, '{"version":1,"providers":[');
    await expect(readCatalogIndex({ indexFile, catalogDir, fileNames: ["example.json"] })).rejects.toThrow(
      `Catalog index ${indexFile} is not valid JSON; run npm run generate:catalog`,
    );
  });
});

describe("generated catalog index", () => {
  const catalogDir = join(process.cwd(), "catalog/apps");
  const indexFile = join(process.cwd(), "catalog", catalogIndexFileName);

  // catalog/ is generated by postinstall, so this runs in CI and after any local `npm run generate:catalog`. It is
  // the byte-identity gate on production data: the index-backed store must be indistinguishable from the eager one.
  it.skipIf(!existsSync(indexFile))("reproduces the generated catalog", async () => {
    const executableServices = Object.keys(executorModules);

    const eager = await loadCatalog(catalogDir, { executableServices });
    const indexed = await loadCatalog(catalogDir, {
      executableServices,
      lazySchemas: true,
      lazySchemaIndexFile: indexFile,
    });

    // Compared as text: `toEqual` on the two 6 MB byte arrays walks every element and exceeds the test timeout.
    expect(new TextDecoder().decode(indexed.providerSummariesJson)).toBe(
      new TextDecoder().decode(eager.providerSummariesJson),
    );
    expect(indexed.providerSummariesEtag).toBe(eager.providerSummariesEtag);
    expect(indexed.executableActionIds).toEqual(eager.executableActionIds);
    expect([...indexed.actionsById.keys()]).toEqual([...eager.actionsById.keys()]);
    expect(indexed.actions.map((action) => Object.keys(action))).toEqual(
      eager.actions.map((action) => Object.keys(action)),
    );
    // One action serialized in full exercises the lazy accessors without reading every provider file back.
    const actionId = "slack.add_reaction";
    expect(JSON.stringify(indexed.actionsById.get(actionId))).toBe(JSON.stringify(eager.actionsById.get(actionId)));
  });
});

interface IndexedCatalogFixture {
  catalogDir: string;
  indexFile: string;
}

/** Write `<tmp>/apps/<service>.json` for every provider and the index that describes them. */
async function writeIndexedCatalog(providers: ProviderDefinition[]): Promise<IndexedCatalogFixture> {
  const root = await mkdtemp(join(tmpdir(), "catalog-index-"));
  temporaryDirectories.push(root);
  const catalogDir = join(root, "apps");
  await mkdir(catalogDir);
  const sources = [];
  for (const provider of providers) {
    const file = `${provider.service}.json`;
    await writeProviderFile(catalogDir, provider);
    sources.push({ file, bytes: (await stat(join(catalogDir, file))).size, provider });
  }
  const indexFile = join(root, catalogIndexFileName);
  await writeFile(indexFile, JSON.stringify(createCatalogIndex(sources)));

  return { catalogDir, indexFile };
}

function writeProviderFile(catalogDir: string, provider: ProviderDefinition): Promise<void> {
  return writeFile(join(catalogDir, `${provider.service}.json`), JSON.stringify(provider));
}

/** Actions keep keys on both sides of the schemas, like generated catalog actions do. */
function providerFixture(service: string, actionNames: string[]): ProviderDefinition {
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
      inputSchema: { type: "object", properties: { [name]: { type: "string" } } },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      followUpActions: [`${service}.${actionNames[0]}`],
      asyncLifecycle: {
        startActionId: `${service}.${actionNames[0]}`,
        statusActionId: `${service}.${name}`,
      },
    })),
  };
}
