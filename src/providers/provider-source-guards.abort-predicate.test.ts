import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `AbortSignal.timeout()` aborts with a `TimeoutError`, so a provider that
 * matches only `"AbortError"` has a dead timeout branch. The shared
 * `isAbortLikeError` accepts both names; this guard fails when a provider grows
 * its own `AbortError`-only predicate again, which the private-to-OSS sync has
 * repeatedly done. A call disjoined with the timeout signal's own `.aborted`
 * flag stays reachable and is therefore allowed.
 */
const providersDir = fileURLToPath(new URL(".", import.meta.url));
const repoDir = fileURLToPath(new URL("../..", import.meta.url));
const functionDeclaration = /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)[^{}]*\{([^{}]*)\}/g;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

function abortOnlyPredicateNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(functionDeclaration)) {
    const body = match[2] ?? "";
    if (body.includes('"AbortError"') && !body.includes('"TimeoutError"')) {
      names.push(match[1] as string);
    }
  }
  return names;
}

function findDeadTimeoutGuards(path: string): string[] {
  const source = readFileSync(path, "utf8");
  if (!source.includes("AbortSignal.timeout")) {
    return [];
  }
  const names = abortOnlyPredicateNames(source);
  if (names.length === 0) {
    return [];
  }
  const dead: string[] = [];
  source.split("\n").forEach((line, index) => {
    if (line.trimStart().startsWith("function ") || /\.aborted\s*\|\|/.test(line)) {
      return;
    }
    if (names.some((name) => line.includes(`${name}(`))) {
      dead.push(`${relative(repoDir, path)}:${index + 1}`);
    }
  });
  return dead;
}

describe("provider abort predicates", () => {
  it("never guards a timeout branch on AbortError alone", () => {
    const dead = listSourceFiles(providersDir).flatMap(findDeadTimeoutGuards);

    expect(dead).toEqual([]);
  });
});
