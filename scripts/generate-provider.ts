import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { assertProviderId } from "../src/core/provider-id.ts";

const [provider, ...generatorArguments] = process.argv.slice(2);
if (!provider) {
  throw new Error("Usage: npm run generate:provider -- <provider> [...generator arguments]");
}

assertProviderId(provider, "provider generator id");
const generatorPath = join(process.cwd(), "src/providers", provider, "generate.ts");
if (!(await isFile(generatorPath))) {
  throw new Error(`Provider does not define a generator: ${provider}`);
}

const result = spawnSync(process.execPath, [generatorPath, ...generatorArguments], {
  cwd: process.cwd(),
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
