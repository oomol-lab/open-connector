/**
 * Computes the version for a manual release run and writes it to
 * `$GITHUB_OUTPUT` (`version`, `tag_name`, `previous_tag`, `resumed`).
 *
 * Inputs come from the environment: `EXPECTED_VERSION` (optional `X.Y.Z`),
 * `VERSION_BUMP` (`patch` | `minor` | `major`) and `GITHUB_SHA` (the release
 * commit). Requires a checkout with all tags fetched.
 */

import { spawnSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { computeReleaseVersion, formatGitHubOutput, parseTagRefs, readVersionBump } from "./release-version.ts";

function listTagRefs(): string {
  const result = spawnSync(
    "git",
    ["for-each-ref", "refs/tags/v*", "--format=%(refname:strip=2) %(objectname) %(*objectname)"],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Failed to list git tags.");
  return result.stdout;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required.`);
  return value;
}

const release = computeReleaseVersion({
  expectedVersion: process.env.EXPECTED_VERSION ?? "",
  versionBump: readVersionBump(process.env.VERSION_BUMP ?? "patch"),
  tags: parseTagRefs(listTagRefs()),
  headCommit: requiredEnv("GITHUB_SHA"),
});

const output = formatGitHubOutput(release);
const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput === undefined || githubOutput === "") {
  process.stdout.write(output);
} else {
  await appendFile(githubOutput, output, "utf8");
}

console.log(
  release.resumed
    ? `::notice::Resuming release ${release.tagName}; it already points at ${process.env.GITHUB_SHA}.`
    : `Releasing ${release.tagName}${release.previousTag === "" ? "" : ` (previous ${release.previousTag})`}.`,
);
