import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const rootDir = process.cwd();
const generatedPaths = [
  join(process.cwd(), "src/providers/registry.generated.ts"),
  join(process.cwd(), "src/providers/registry.cloudflare.generated.ts"),
  join(process.cwd(), "src/providers/action-contracts.generated.ts"),
];
const catalogDir = join(process.cwd(), "catalog/apps");
const sourcePaths = [
  join(rootDir, "src/core"),
  join(rootDir, "src/providers"),
  join(rootDir, "scripts/generate-catalog.ts"),
  join(rootDir, "scripts/generate-provider-registry.ts"),
  join(rootDir, "scripts/provider-source.ts"),
];
const generatedPathSet = new Set(generatedPaths);

const sourceMtimeMs = await newestMtimeMs(sourcePaths);

const [generatedFilesPresent, catalogFresh] = await Promise.all([
  Promise.all(generatedPaths.map((path) => isFile(path))),
  isFreshCatalog(sourceMtimeMs),
]);
// A fresh catalog proves all generated provider files were produced from the same source set.
if (!catalogFresh) {
  runNodeScript("scripts/generate-catalog.ts");
} else if (generatedFilesPresent.some((present) => !present)) {
  runNodeScript("scripts/generate-provider-registry.ts");
}

function runNodeScript(script: string): void {
  const result = spawnSync("node", [script], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

async function isFreshCatalog(sourceMtimeMs: number): Promise<boolean> {
  try {
    const [entries, services] = await Promise.all([
      readdir(catalogDir, { withFileTypes: true }),
      readProviderServices(),
    ]);
    const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    if (jsonFiles.length === 0) {
      return false;
    }

    const catalogServices = jsonFiles
      .map((entry) => entry.name.slice(0, -".json".length))
      .sort((a, b) => a.localeCompare(b));
    if (
      catalogServices.length !== services.length ||
      catalogServices.some((service, index) => service !== services[index])
    ) {
      return false;
    }

    const mtimes = await Promise.all(
      jsonFiles.map(async (entry) => (await stat(join(catalogDir, entry.name))).mtimeMs),
    );
    return Math.min(...mtimes) >= sourceMtimeMs;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

async function readProviderServices(): Promise<string[]> {
  const entries = await readdir(join(rootDir, "src/providers"), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function newestMtimeMs(paths: string[]): Promise<number> {
  const mtimes = await Promise.all(paths.map((path) => newestPathMtimeMs(path)));
  return Math.max(...mtimes);
}

async function newestPathMtimeMs(path: string): Promise<number> {
  if (generatedPathSet.has(path)) {
    return 0;
  }

  let stats;
  try {
    stats = await stat(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return 0;
    }

    throw error;
  }

  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  const entries = await readdir(path, { withFileTypes: true });
  const childMtimes = await Promise.all(entries.map((entry) => newestPathMtimeMs(join(path, entry.name))));
  return Math.max(stats.mtimeMs, ...childMtimes);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
