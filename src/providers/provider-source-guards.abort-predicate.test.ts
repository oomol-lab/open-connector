import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `AbortSignal.timeout()` aborts with a `TimeoutError`, never an `AbortError`,
// so a timeout branch that recognizes only `AbortError` is dead and the provider
// reports its own budget expiry as a generic upstream failure. The shared
// `isAbortLikeError` in provider-runtime.ts accepts both names. This guard fails
// when a provider grows an `AbortError`-only check again, which the
// private-to-OSS sync has repeatedly done. Both a named predicate (declared as a
// function or as an arrow constant, in the same file or a sibling of the same
// provider directory) and an inline `error.name === "AbortError"` test count. A
// check disjoined with the timeout signal's own `.aborted` flag stays reachable
// and is therefore allowed.

const providersDir = fileURLToPath(new URL(".", import.meta.url));
const repoDir = fileURLToPath(new URL("../..", import.meta.url));
const abortNameComparison = /name\s*===\s*"AbortError"/;
const predicateDeclaration =
  /(?:function\s+([A-Za-z_$][\w$]*)\s*\(|const\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*(?:async\s+)?[(<])/g;
const requestHelperBody = /\b(?:await|fetch|throw)\b/;
const declarationWindowChars = 2000;
const predicateBodyChars = 500;
const conditionWindowLines = 3;

interface PredicateBody {
  text: string;
  end: number;
}

interface AbortChecks {
  names: string[];
  coveredLines: Set<number>;
}

interface ProviderSource {
  path: string;
  source: string;
  checks: AbortChecks;
}

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

/** Read the body of the declaration starting at index 0 of `declaration`, either a block or a concise arrow. */
function readBody(declaration: string): PredicateBody | undefined {
  let parens = 0;
  for (let index = 0; index < declaration.length; index += 1) {
    const char = declaration[index];
    if (char === "(") {
      parens += 1;
    } else if (char === ")") {
      parens -= 1;
    } else if (parens > 0) {
      continue;
    } else if (char === "{") {
      let braces = 0;
      for (let end = index; end < declaration.length; end += 1) {
        if (declaration[end] === "{") {
          braces += 1;
        } else if (declaration[end] === "}") {
          braces -= 1;
          if (braces === 0) {
            return { text: declaration.slice(index, end + 1), end: end + 1 };
          }
        }
      }
      return undefined;
    } else if (char === "=" && declaration[index + 1] === ">") {
      const rest = declaration.slice(index + 2);
      if (rest.trimStart().startsWith("{")) {
        continue;
      }
      const semicolon = rest.indexOf(";");
      return semicolon < 0 ? undefined : { text: rest.slice(0, semicolon), end: index + 2 + semicolon };
    } else if (char === ";") {
      return undefined;
    }
  }
  return undefined;
}

/** Collect the file's `AbortError`-only predicate names and the lines that any abort predicate body occupies. */
function abortChecks(source: string): AbortChecks {
  const names: string[] = [];
  const coveredLines = new Set<number>();
  if (!source.includes('"AbortError"')) {
    return { names, coveredLines };
  }
  for (const match of source.matchAll(predicateDeclaration)) {
    const name = match[1] ?? match[2];
    const body = readBody(source.slice(match.index, match.index + declarationWindowChars));
    if (name === undefined || body === undefined || !abortNameComparison.test(body.text)) {
      continue;
    }
    if (body.text.length > predicateBodyChars || requestHelperBody.test(body.text)) {
      // A request helper that tests the name inline, not a predicate to resolve by name.
      continue;
    }
    const first = source.slice(0, match.index).split("\n").length - 1;
    const last = first + source.slice(match.index, match.index + body.end).split("\n").length - 1;
    for (let line = first; line <= last; line += 1) {
      coveredLines.add(line);
    }
    if (!body.text.includes('"TimeoutError"')) {
      names.push(name);
    }
  }
  return { names, coveredLines };
}

/** Join the lines around `index` that make up the enclosing condition, so a wrapped disjunction is read as one. */
function enclosingCondition(lines: string[], index: number): string {
  let first = index;
  while (first > 0 && index - first < conditionWindowLines && !/\bif\s*\(/.test(lines[first] as string)) {
    first -= 1;
  }
  let last = index;
  while (last < lines.length - 1 && last - index < conditionWindowLines && !/\)\s*\{/.test(lines[last] as string)) {
    last += 1;
  }
  return lines.slice(first, last + 1).join("\n");
}

function findDeadTimeoutGuards(file: ProviderSource, names: string[]): string[] {
  if (names.length === 0 && !file.source.includes('"AbortError"')) {
    return [];
  }
  const calls = names.map((name) => new RegExp(`\\b${name}\\s*\\(`));
  const lines = file.source.split("\n");
  const dead: string[] = [];
  lines.forEach((line, index) => {
    if (file.checks.coveredLines.has(index)) {
      return;
    }
    const callsPredicate = calls.some((call) => call.test(line));
    if (!callsPredicate && !abortNameComparison.test(line)) {
      return;
    }
    const condition = enclosingCondition(lines, index);
    if (!callsPredicate && condition.includes('"TimeoutError"')) {
      return;
    }
    if (condition.includes("||") && condition.includes(".aborted")) {
      return;
    }
    dead.push(`${relative(repoDir, file.path)}:${index + 1}`);
  });
  return dead;
}

/** Group the provider sources by provider directory, so a predicate imported from a sibling file is still resolved. */
function groupByProvider(files: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const key = relative(providersDir, file).split(/[\\/]/)[0] as string;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [file]);
    } else {
      group.push(file);
    }
  }
  return [...groups.values()];
}

describe("provider abort predicates", () => {
  it("never guards a timeout branch on AbortError alone", () => {
    const dead: string[] = [];
    for (const group of groupByProvider(listSourceFiles(providersDir))) {
      const sources = group.map((path) => ({ path, source: readFileSync(path, "utf8") }));
      if (!sources.some((entry) => entry.source.includes("AbortSignal.timeout"))) {
        continue;
      }
      const files: ProviderSource[] = sources.map((entry) => ({ ...entry, checks: abortChecks(entry.source) }));
      const names = [...new Set(files.flatMap((file) => file.checks.names))];
      dead.push(...files.flatMap((file) => findDeadTimeoutGuards(file, names)));
    }

    expect(
      dead,
      "these timeout guards match AbortError only, so AbortSignal.timeout never reaches them; call isAbortLikeError from provider-runtime.ts instead",
    ).toEqual([]);
  });
});
