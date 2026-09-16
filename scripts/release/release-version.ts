/**
 * Release version computation for the manual release workflow.
 *
 * `package.json` stays at `0.0.0-development`; the git tags are the only owner
 * of released versions. A release either bumps the latest stable `vX.Y.Z` tag
 * or uses an explicitly requested version, and a run whose tag already points
 * at the release commit resumes that version instead of failing, so a
 * re-dispatched release stays idempotent.
 */

export type VersionBump = "patch" | "minor" | "major";

/** A `v*` tag together with the commit it points at (annotated tags peeled). */
export interface TagRef {
  name: string;
  commit: string;
}

export interface ComputeReleaseVersionInput {
  /** `X.Y.Z` or `vX.Y.Z`; empty to bump `previousTag` instead. */
  expectedVersion: string;
  versionBump: VersionBump;
  tags: readonly TagRef[];
  /** The commit the release is built from (`GITHUB_SHA`). */
  headCommit: string;
}

export interface ReleaseVersion {
  version: string;
  tagName: string;
  /** Latest stable tag before this release, or "" for the first release. */
  previousTag: string;
  /** True when `tagName` already exists at `headCommit` and the run resumes it. */
  resumed: boolean;
}

function isNumericSegment(segment: string): boolean {
  return /^(0|[1-9]\d*)$/.test(segment);
}

/** Accepts exactly `X.Y.Z` with numeric segments; prereleases and build metadata are not releasable here. */
export function isStableSemver(version: string): boolean {
  const segments = version.split(".");
  return segments.length === 3 && segments.every(isNumericSegment);
}

function parseStableTag(tag: string): number[] | undefined {
  if (!tag.startsWith("v")) return undefined;
  const version = tag.slice(1);
  return isStableSemver(version) ? version.split(".").map(Number) : undefined;
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/** Stable `vX.Y.Z` tags, newest first, by numeric version rather than by the order git listed them. */
export function sortStableTags(tags: readonly TagRef[]): TagRef[] {
  return tags
    .map((tag) => ({ tag, parsed: parseStableTag(tag.name) }))
    .filter((entry): entry is { tag: TagRef; parsed: number[] } => entry.parsed !== undefined)
    .sort((a, b) => compareVersions(b.parsed, a.parsed))
    .map((entry) => entry.tag);
}

export function normalizeExpectedVersion(expectedVersion: string): string {
  const version = expectedVersion.trim().replace(/^v/, "");
  if (!isStableSemver(version)) {
    throw new Error(`Expected version must use the X.Y.Z format, got "${expectedVersion}".`);
  }
  return version;
}

export function bumpVersion(version: string, versionBump: VersionBump): string {
  if (!isStableSemver(version)) throw new Error(`Invalid stable version: ${version}`);
  const [major, minor, patch] = version.split(".").map(Number);
  switch (versionBump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

export function readVersionBump(value: string | undefined): VersionBump {
  if (value === "major" || value === "minor" || value === "patch") return value;
  throw new Error(`Unsupported version bump: "${value ?? ""}".`);
}

export function computeReleaseVersion(input: ComputeReleaseVersionInput): ReleaseVersion {
  const stableTags = sortStableTags(input.tags);
  const latest = stableTags[0];

  if (input.expectedVersion.trim() !== "") {
    const version = normalizeExpectedVersion(input.expectedVersion);
    const tagName = `v${version}`;
    const existing = stableTags.find((tag) => tag.name === tagName);
    if (existing !== undefined && existing.commit !== input.headCommit) {
      throw new Error(
        `Tag ${tagName} already exists at ${existing.commit}, not at the release commit ${input.headCommit}. Pick another version.`,
      );
    }
    const previous = stableTags.find((tag) => tag.name !== tagName);
    return { version, tagName, previousTag: previous?.name ?? "", resumed: existing !== undefined };
  }

  // Auto-bump. The latest tag already sitting on the release commit means
  // this commit was released; re-running the workflow resumes that release
  // rather than minting a second version for the same code.
  if (latest !== undefined && latest.commit === input.headCommit) {
    return {
      version: latest.name.slice(1),
      tagName: latest.name,
      previousTag: stableTags[1]?.name ?? "",
      resumed: true,
    };
  }

  const version = bumpVersion(latest === undefined ? "0.0.0" : latest.name.slice(1), input.versionBump);
  return { version, tagName: `v${version}`, previousTag: latest?.name ?? "", resumed: false };
}

/** Parses `git for-each-ref --format='%(refname:strip=2) %(objectname) %(*objectname)'` output. */
export function parseTagRefs(output: string): TagRef[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const [name, objectName, peeled] = line.split(/\s+/);
      // Annotated tags peel to the tagged commit; lightweight tags have no peel.
      return { name, commit: peeled === undefined || peeled === "" ? objectName : peeled };
    });
}

export function formatGitHubOutput(result: ReleaseVersion): string {
  return [
    `version=${result.version}`,
    `tag_name=${result.tagName}`,
    `previous_tag=${result.previousTag}`,
    `resumed=${result.resumed}`,
    "",
  ].join("\n");
}
