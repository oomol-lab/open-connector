/**
 * Publishes one packed tarball to npm, idempotently.
 *
 *   node scripts/release/publish-npm.ts dist/release/<name>-<version>.tgz
 *
 * A version that is already on the registry is skipped, a publish that fails
 * but leaves the version visible is treated as success, and transient registry
 * errors are retried. Everything else fails the run so it can be re-run.
 * Authentication is npm trusted publishing: npm exchanges the GitHub Actions
 * OIDC token itself when the job has `id-token: write`, and records provenance
 * on its own, so no token and no `--provenance` flag are passed here.
 */

import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

interface CommandResult {
  status: number;
  output: string;
}

interface PackageMetadata {
  name: string;
  version: string;
}

const developmentVersion = "0.0.0-development";
const publishAttempts = 3;
const retryDelayMs = 15_000;
const transientErrorFragments = [
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "socket hang up",
  "429",
  "500",
  "502",
  "503",
  "504",
  "TLOG_CREATE_ENTRY_ERROR",
  "rekor.sigstore.dev",
];

function run(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
}

function readPackageMetadata(tarball: string): PackageMetadata {
  const result = run("tar", ["-xOzf", tarball, "package/package.json"]);
  if (result.status !== 0) throw new Error(`Cannot read package.json from ${tarball}:\n${result.output}`);
  const manifest = JSON.parse(result.output) as Partial<PackageMetadata>;
  if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new Error(`${tarball} has no package name or version.`);
  }
  if (manifest.version === developmentVersion) {
    throw new Error(
      `${tarball} still carries the ${developmentVersion} placeholder; set the release version before packing.`,
    );
  }
  return { name: manifest.name, version: manifest.version };
}

function isTransient(output: string): boolean {
  return transientErrorFragments.some((fragment) => output.includes(fragment));
}

async function versionExists(spec: string): Promise<boolean> {
  for (let attempt = 1; ; attempt += 1) {
    const result = run("npm", ["view", spec, "version", "--json"]);
    // A missing version of an existing package prints nothing and exits 0; a
    // missing package exits with E404.
    if (result.status === 0) return result.output.trim() !== "" && result.output.trim() !== "[]";
    if (result.output.includes("E404")) return false;
    if (attempt >= publishAttempts || !isTransient(result.output)) {
      throw new Error(`npm view ${spec} failed:\n${result.output}`);
    }
    console.log(`Transient npm error; retrying npm view ${spec} in ${(retryDelayMs * attempt) / 1000}s.`);
    await sleep(retryDelayMs * attempt);
  }
}

const tarball = process.argv[2];
if (tarball === undefined || tarball === "") throw new Error("Usage: publish-npm.ts <tarball>");

const metadata = readPackageMetadata(tarball);
const spec = `${metadata.name}@${metadata.version}`;

if (await versionExists(spec)) {
  console.log(`Skipping ${spec}: already on the registry.`);
} else {
  for (let attempt = 1; ; attempt += 1) {
    const result = run("npm", ["publish", tarball, "--access", "public"]);
    process.stdout.write(result.output);
    if (result.status === 0) {
      console.log(`Published ${spec}.`);
      break;
    }
    if (await versionExists(spec)) {
      console.log(`npm publish failed but ${spec} is now on the registry; treating it as published.`);
      break;
    }
    if (attempt >= publishAttempts || !isTransient(result.output)) {
      throw new Error(`Failed to publish ${spec} after ${attempt} attempt(s).`);
    }
    console.log(`Transient npm error; retrying ${spec} in ${(retryDelayMs * attempt) / 1000}s.`);
    await sleep(retryDelayMs * attempt);
  }
}
