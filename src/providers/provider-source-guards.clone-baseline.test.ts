import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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
  /** Matched against whole provider files, so a pattern may span lines. */
  pattern: RegExp;
  /** The owner's own module, whose declaration is not a clone of itself. */
  ownerFile?: string;
}

interface CloneMatch {
  file: string;
  line: number;
  text: string;
}

/** Clone class id -> provider file -> number of copies that file holds. */
type CloneCounts = Record<string, Record<string, number>>;

const providersDir = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = join(providersDir, "..", "..");
const baselinePath = join(providersDir, "clone-baseline.json");
const providerRuntimeFile = "src/providers/provider-runtime.ts";
const maxReportedFiles = 25;
const maxReportedMatchesPerFile = 5;

/**
 * The clone classes named by the private port skill's pre-commit grep, kept in
 * the same order. Deliberate deviations from that grep:
 *
 * - The proxy pattern counts every `proxy` declaration that is NOT the wanted
 *   `defineProviderProxy` form, rather than the whole class, which grows with
 *   every new provider. A hand-written proxy in any spelling counts: `async`,
 *   plain arrow, or a call to a provider-local proxy factory.
 * - The action-name bookkeeping the skill describes in prose is matched as
 *   `type *ActionName` / `const *ActionByName`.
 * - The cast class is matched by body, not by signature: a `(value: unknown)`
 *   helper is a clone only when its body is a rename of a `src/core/cast.ts`
 *   reader, and provider-meaning normalizers share the signature.
 * - The error-factory pattern matches the factory body a provider declares for
 *   itself. An inline `(message) => new ProviderRequestError(400, message)`
 *   passed as a `createError` argument is not counted, because the shared
 *   runtime writes it that way too.
 *
 * A class whose shared owner lives inside `src/providers` skips that owner
 * file, so the counts are provider-local copies and a zero-tolerance class
 * reads as zero.
 */
const cloneClasses: CloneClass[] = [
  {
    id: "local-abort-predicate",
    owner: "isAbortLikeError in src/providers/provider-runtime.ts",
    ownerFile: providerRuntimeFile,
    pattern: /\b(?:function|const) isAbortLikeError\b/,
  },
  {
    id: "local-request-timeout-constant",
    owner: "the 30 s default of createProviderTimeout in src/providers/provider-runtime.ts",
    ownerFile: providerRuntimeFile,
    pattern: /= 30_000/,
  },
  {
    id: "local-provider-error-factory",
    owner: "providerInputError / providerResponseError in src/providers/provider-runtime.ts",
    ownerFile: providerRuntimeFile,
    pattern: /return new ProviderRequestError\((?:400|502), message\)/,
  },
  {
    id: "local-api-key-action-input",
    owner: "ApiKeyActionRequest in src/providers/provider-runtime.ts",
    ownerFile: providerRuntimeFile,
    pattern: /interface ApiKeyProviderActionInput\b/,
  },
  {
    id: "hand-written-proxy",
    owner: "defineProviderProxy in src/providers/provider-runtime.ts",
    ownerFile: providerRuntimeFile,
    pattern: /export const proxy: ProviderProxyExecutor =(?!\s*defineProviderProxy\b)/,
  },
  {
    id: "local-crypto-encoding-helper",
    owner:
      "sha256Hex / hmacHex / encodeRfc3986 / canonicalizeSearchParams / buildCanonicalHeaders, which src/core/aws-sigv4.ts exports for any provider, not only AWS ones",
    pattern: /\bfunction (?:sha256Hex|hmacHex|encodeRfc3986|canonicalizeSearchParams|buildCanonicalHeaders)\b/,
  },
  {
    id: "local-cast-reader-body",
    owner:
      "the readers in src/core/cast.ts: optionalRawString, optionalString, optionalRecord / recordOrEmpty, looseArray",
    pattern:
      /return typeof \w+ === "string" \? \w+ : undefined;|function \w+\(\w+: unknown\)[^\n{]*\{\s*if \(typeof \w+ !== "string"\) \{\s*return undefined;\s*\}\s*return \w+;\s*\}|typeof \w+ === "object" && \w+ !== null && !Array\.isArray\(\w+\)|return Array\.isArray\(\w+\) \? \w+ : \[\];/,
  },
  {
    id: "local-action-name-union",
    owner:
      "the plain string action name every provider runtime already receives, or the generated ProviderActionName map for typed callers",
    ownerFile: providerRuntimeFile,
    pattern: /^[^\S\n]*(?:export )?type \w+ActionName\b/,
  },
  {
    id: "local-action-by-name-map",
    owner: "the generated registry and ProviderLoader, which already index actions by name",
    pattern: /^[^\S\n]*(?:export )?const \w+ActionByName\b/,
  },
];

const matchesById = scanCloneClasses();
const currentCounts = countMatches(matchesById);
if (process.env.UPDATE_CLONE_BASELINE === "1") {
  writeBaseline(ratchetBaseline(readBaseline(), currentCounts));
}
const baseline = readBaseline();

describe("provider clone-class ratchet", () => {
  it("keeps every provider file at or below its committed clone count", () => {
    const reintroduced = cloneClasses.flatMap((cloneClass) => {
      const grown = Object.entries(currentCounts[cloneClass.id])
        .filter(([file, count]) => count > (baseline[cloneClass.id]?.[file] ?? 0))
        .sort(([left], [right]) => left.localeCompare(right));
      if (grown.length === 0) {
        return [];
      }

      const detail = grown
        .slice(0, maxReportedFiles)
        .map(([file, count]) => {
          const before = baseline[cloneClass.id]?.[file] ?? 0;
          return `  ${file}: ${before} -> ${count}\n${formatMatches(matchesById[cloneClass.id].filter((match) => match.file === file))}`;
        })
        .join("\n");
      const truncated =
        grown.length > maxReportedFiles ? `\n  ... and ${grown.length - maxReportedFiles} more files` : "";
      return [
        `Clone re-introduced. ${cloneClass.id} grew in ${grown.length} file(s).\nThe shared owner is ${cloneClass.owner}; call it instead of re-declaring the fact. If this copy is genuinely justified, raise the file's entry in src/providers/clone-baseline.json in the same change and say why in the pull request.\n${detail}${truncated}`,
      ];
    });

    expect(reintroduced.join("\n\n")).toBe("");
  });

  it("keeps the committed baseline at the current clone count so the ratchet only moves down", () => {
    const stale = cloneClasses.flatMap((cloneClass) => {
      const shrunk = Object.entries(baseline[cloneClass.id] ?? {})
        .filter(([file, count]) => count > (currentCounts[cloneClass.id][file] ?? 0))
        .sort(([left], [right]) => left.localeCompare(right));
      if (shrunk.length === 0) {
        return [];
      }

      const detail = shrunk
        .slice(0, maxReportedFiles)
        .map(([file, count]) => `  ${file}: ${count} -> ${currentCounts[cloneClass.id][file] ?? 0}`)
        .join("\n");
      const truncated =
        shrunk.length > maxReportedFiles ? `\n  ... and ${shrunk.length - maxReportedFiles} more files` : "";
      return [
        `Stale baseline. ${cloneClass.id} shrank in ${shrunk.length} file(s), so lower the entries in src/providers/clone-baseline.json in the same change that removed the copies: run \`UPDATE_CLONE_BASELINE=1 npx vitest run src/providers/provider-source-guards.clone-baseline.test.ts\` and commit the result. Lowering an entry that another change already lowered is expected; the counts are per file so a merge cannot hide it.\n${detail}${truncated}`,
      ];
    });

    expect(stale.join("\n\n")).toBe("");
  });

  it("baselines exactly the clone classes it scans for", () => {
    expect(Object.keys(baseline).sort()).toEqual(cloneClasses.map((cloneClass) => cloneClass.id).sort());
  });
});

function readBaseline(): CloneCounts {
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8")) as { counts: CloneCounts };
  return parsed.counts;
}

/**
 * Write the ratchet baseline back, keeping classes in scan order and files in
 * path order so the committed file has one stable form.
 */
function writeBaseline(counts: CloneCounts): void {
  const ordered: CloneCounts = {};
  for (const cloneClass of cloneClasses) {
    const files = counts[cloneClass.id] ?? {};
    ordered[cloneClass.id] = Object.fromEntries(
      Object.entries(files)
        .filter(([, count]) => count > 0)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  const document = {
    $comment:
      'Ratchet baseline for provider-source-guards.clone-baseline.test.ts: clone class -> provider file -> how many provider-local copies of the shared owner that file holds. The shared owner\'s own declaration is not counted. A count may only go down; regenerate with UPDATE_CLONE_BASELINE=1 npx vitest run src/providers/provider-source-guards.clone-baseline.test.ts, which lowers entries but never raises them. See AGENTS.md "Shared owners providers must not re-clone".',
    counts: ordered,
  };
  writeFileSync(baselinePath, `${JSON.stringify(document, null, 2)}\n`);
}

/**
 * Lower the baseline to the current counts. Growth is left alone on purpose:
 * a new copy has to be removed or deliberately hand-written into the baseline,
 * so the update command can never silence a re-introduction.
 */
function ratchetBaseline(baselineCounts: CloneCounts, counts: CloneCounts): CloneCounts {
  const ratcheted: CloneCounts = {};
  for (const cloneClass of cloneClasses) {
    const files: Record<string, number> = {};
    for (const [file, count] of Object.entries(baselineCounts[cloneClass.id] ?? {})) {
      files[file] = Math.min(count, counts[cloneClass.id][file] ?? 0);
    }

    ratcheted[cloneClass.id] = files;
  }

  return ratcheted;
}

/**
 * Scan committed provider source. Generated registries are ignored because they
 * are gitignored build output, and test files are ignored so that this file's
 * own patterns do not count as clones.
 */
function scanCloneClasses(): Record<string, CloneMatch[]> {
  const matches: Record<string, CloneMatch[]> = {};
  for (const cloneClass of cloneClasses) {
    matches[cloneClass.id] = [];
  }

  for (const path of providerSourceFiles(providersDir)) {
    const file = relative(repositoryRoot, path);
    const text = readFileSync(path, "utf8");
    for (const cloneClass of cloneClasses) {
      if (cloneClass.ownerFile === file) {
        continue;
      }

      const pattern = new RegExp(cloneClass.pattern.source, "gm");
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split("\n").length;
        matches[cloneClass.id].push({ file, line, text: (text.split("\n")[line - 1] ?? "").trim() });
      }
    }
  }

  return matches;
}

function countMatches(matches: Record<string, CloneMatch[]>): CloneCounts {
  const counts: CloneCounts = {};
  for (const cloneClass of cloneClasses) {
    const files: Record<string, number> = {};
    for (const match of matches[cloneClass.id]) {
      files[match.file] = (files[match.file] ?? 0) + 1;
    }

    counts[cloneClass.id] = files;
  }

  return counts;
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
    .slice(0, maxReportedMatchesPerFile)
    .map((match) => `    ${match.file}:${match.line}: ${match.text}`)
    .join("\n");
  return matches.length > maxReportedMatchesPerFile
    ? `${reported}\n    ... and ${matches.length - maxReportedMatchesPerFile} more copies in this file`
    : reported;
}
