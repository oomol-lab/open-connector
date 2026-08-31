import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A generic runtime fact that already has one shared owner in this repository.
 * Providers must call the owner; a provider-local copy, alias, or rename of it
 * is a clone. See AGENTS.md "Shared owners providers must not re-clone".
 */
interface CloneClass {
  /** Key in `clone-baseline.json`. */
  id: string;
  /** The shared owner a matching line should have called instead. */
  owner: string;
  /** Matched line by line against provider source. */
  pattern: RegExp;
}

interface CloneMatch {
  file: string;
  line: number;
  text: string;
}

const providersDir = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = join(providersDir, "..", "..");
const baselinePath = join(providersDir, "clone-baseline.json");
const maxReportedMatches = 25;

/**
 * The clone classes named by the private port skill's pre-commit grep, kept in
 * the same order. Two deliberate deviations from that grep: `export const
 * proxy: ProviderProxyExecutor` is narrowed to the hand-written `= async` form,
 * because the `defineProviderProxy` form is the wanted one and legitimately
 * grows with every new provider; and the action-name bookkeeping the skill
 * describes in prose is matched here as `type *ActionName` / `const
 * *ActionByName`.
 */
const cloneClasses: CloneClass[] = [
  {
    id: "local-abort-predicate",
    owner: "isAbortLikeError in src/providers/provider-runtime.ts",
    pattern: /\b(?:function|const) isAbortLikeError\b/,
  },
  {
    id: "local-request-timeout-constant",
    owner: "the 30 s default of createProviderTimeout in src/providers/provider-runtime.ts",
    pattern: /= 30_000/,
  },
  {
    id: "local-provider-error-factory",
    owner: "providerInputError / providerResponseError in src/providers/provider-runtime.ts",
    pattern: /return new ProviderRequestError\((?:400|502), message\)/,
  },
  {
    id: "local-api-key-action-input",
    owner: "ApiKeyActionRequest in src/providers/provider-runtime.ts",
    pattern: /interface ApiKeyProviderActionInput\b/,
  },
  {
    id: "hand-written-proxy",
    owner: "defineProviderProxy in src/providers/provider-runtime.ts",
    pattern: /export const proxy: ProviderProxyExecutor = async\b/,
  },
  {
    id: "local-aws-sigv4-helper",
    owner: "src/core/aws-sigv4.ts",
    pattern: /\bfunction (?:sha256Hex|hmacHex|encodeRfc3986|canonicalizeSearchParams|buildCanonicalHeaders)\b/,
  },
  {
    id: "local-action-name-union",
    owner: "the plain string action name every provider runtime already receives",
    pattern: /^\s*(?:export )?type \w+ActionName\b/,
  },
  {
    id: "local-action-by-name-map",
    owner: "the generated registry and ProviderLoader, which already index actions by name",
    pattern: /^\s*(?:export )?const \w+ActionByName\b/,
  },
];

const baseline = readBaseline();
const matchesById = scanCloneClasses();

describe("provider clone-class ratchet", () => {
  it("keeps every clone class at or below its committed baseline", () => {
    const reintroduced = cloneClasses
      .filter((cloneClass) => matchesById[cloneClass.id].length > baseline[cloneClass.id])
      .map((cloneClass) => {
        const matches = matchesById[cloneClass.id];
        return `Clone re-introduced. ${cloneClass.id}: copy count ${matches.length} exceeds the baseline ${baseline[cloneClass.id]}. The shared owner is ${cloneClass.owner}; call it instead of re-declaring the fact, or raise the baseline in the same change and say why.\n${formatMatches(matches)}`;
      });

    expect(reintroduced.join("\n\n")).toBe("");
  });

  it("keeps the committed baseline at the current count so the ratchet only moves down", () => {
    const stale = cloneClasses
      .filter((cloneClass) => matchesById[cloneClass.id].length < baseline[cloneClass.id])
      .map(
        (cloneClass) =>
          `Stale baseline. ${cloneClass.id}: copy count ${matchesById[cloneClass.id].length} is below the baseline ${baseline[cloneClass.id]}. The ratchet only moves down, so lower this entry in src/providers/clone-baseline.json in the same change that removed the copies.`,
      );

    expect(stale.join("\n\n")).toBe("");
  });

  it("baselines exactly the clone classes it scans for", () => {
    expect(Object.keys(baseline).sort()).toEqual(cloneClasses.map((cloneClass) => cloneClass.id).sort());
  });
});

function readBaseline(): Record<string, number> {
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8")) as { counts: Record<string, number> };
  return parsed.counts;
}

/**
 * Scan committed provider source line by line. Generated registries are ignored
 * because they are gitignored build output, and test files are ignored so that
 * this file's own patterns do not count as clones.
 */
function scanCloneClasses(): Record<string, CloneMatch[]> {
  const matches: Record<string, CloneMatch[]> = {};
  for (const cloneClass of cloneClasses) {
    matches[cloneClass.id] = [];
  }

  for (const path of providerSourceFiles(providersDir)) {
    const file = relative(repositoryRoot, path);
    const lines = readFileSync(path, "utf8").split("\n");
    for (const [index, text] of lines.entries()) {
      for (const cloneClass of cloneClasses) {
        if (cloneClass.pattern.test(text)) {
          matches[cloneClass.id].push({ file, line: index + 1, text: text.trim() });
        }
      }
    }
  }

  return matches;
}

function providerSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...providerSourceFiles(path));
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".generated.ts")
    ) {
      files.push(path);
    }
  }

  return files;
}

function formatMatches(matches: CloneMatch[]): string {
  const reported = matches
    .slice(0, maxReportedMatches)
    .map((match) => `  ${match.file}:${match.line}: ${match.text}`)
    .join("\n");
  return matches.length > maxReportedMatches
    ? `${reported}\n  ... and ${matches.length - maxReportedMatches} more`
    : reported;
}
