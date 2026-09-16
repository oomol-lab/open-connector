/**
 * Creates or publishes the GitHub release for a tag, idempotently, through the
 * `gh` CLI (which reads `GH_TOKEN` and `GH_REPO`).
 *
 *   node scripts/release/github-release.ts ensure-draft
 *   node scripts/release/github-release.ts publish
 *
 * `ensure-draft` leaves a draft release for `RELEASE_TAG` targeting
 * `TARGET_SHA` in place: it reuses a matching draft, replaces a draft that
 * targets another commit (drafts own no tag, so this is safe), and accepts an
 * already published release whose tag points at `TARGET_SHA`. The tag itself
 * is created by GitHub when `publish` flips the draft to a published release,
 * so nothing is visible to users until every asset is attached.
 */

import { spawnSync } from "node:child_process";

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface ExistingRelease {
  isDraft: boolean;
  targetCommitish: string;
}

function gh(args: readonly string[]): CommandResult {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function ghOrThrow(args: readonly string[]): string {
  const result = gh(args);
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed (exit ${result.status}):\n${result.stderr}${result.stdout}`);
  }
  return result.stdout;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required.`);
  return value;
}

function findRelease(tag: string): ExistingRelease | undefined {
  const result = gh(["release", "view", tag, "--json", "isDraft,targetCommitish"]);
  if (result.status === 0) return JSON.parse(result.stdout) as ExistingRelease;
  if (result.stderr.includes("release not found")) return undefined;
  throw new Error(`gh release view ${tag} failed:\n${result.stderr}`);
}

function tagCommit(tag: string): string {
  return ghOrThrow(["api", `repos/{owner}/{repo}/commits/${encodeURIComponent(tag)}`, "--jq", ".sha"]).trim();
}

function ensureDraft(): void {
  const tag = requiredEnv("RELEASE_TAG");
  const target = requiredEnv("TARGET_SHA");
  const previousTag = process.env.PREVIOUS_TAG ?? "";
  const existing = findRelease(tag);

  if (existing !== undefined && !existing.isDraft) {
    const commit = tagCommit(tag);
    if (commit !== target) {
      throw new Error(`Release ${tag} is already published from ${commit}, not from ${target}.`);
    }
    console.log(`Release ${tag} is already published from ${target}; nothing to do.`);
    return;
  }

  if (existing !== undefined) {
    if (existing.targetCommitish === target) {
      console.log(`Reusing draft release ${tag} targeting ${target}.`);
      return;
    }
    console.log(`Draft release ${tag} targets ${existing.targetCommitish}; replacing it with a draft for ${target}.`);
    ghOrThrow(["release", "delete", tag, "--yes"]);
  }

  const args = ["release", "create", tag, "--draft", "--target", target, "--title", tag, "--generate-notes"];
  if (previousTag !== "") args.push("--notes-start-tag", previousTag);
  ghOrThrow(args);
  console.log(`Created draft release ${tag} targeting ${target}.`);
}

function publish(): void {
  const tag = requiredEnv("RELEASE_TAG");
  const target = requiredEnv("TARGET_SHA");
  const existing = findRelease(tag);
  if (existing === undefined) throw new Error(`Release ${tag} does not exist; run ensure-draft first.`);

  // The assets were built from TARGET_SHA. Re-check the release still points
  // there: the draft could have been edited while the artifact jobs ran, and
  // publishing it would tag a commit the assets do not belong to.
  const commit = existing.isDraft ? existing.targetCommitish : tagCommit(tag);
  if (commit !== target) {
    throw new Error(
      `Release ${tag} ${existing.isDraft ? "targets" : "is published from"} ${commit}, not ${target}; refusing to publish.`,
    );
  }
  if (!existing.isDraft) {
    console.log(`Release ${tag} is already published.`);
  }
  // Publishing creates the tag at the draft's target commit. `--latest` is
  // idempotent and keeps `releases/latest/download/...` pointing here.
  ghOrThrow(["release", "edit", tag, "--draft=false", "--latest"]);
  console.log(`Published release ${tag}.`);
}

const command = process.argv[2];
switch (command) {
  case "ensure-draft":
    ensureDraft();
    break;
  case "publish":
    publish();
    break;
  default:
    throw new Error(`Usage: github-release.ts <ensure-draft|publish> (got "${command ?? ""}")`);
}
