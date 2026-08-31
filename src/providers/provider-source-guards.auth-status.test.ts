import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runtimeErrorCodes } from "../server/api/runtime-api.ts";

const providersDirectory = fileURLToPath(new URL(".", import.meta.url));

/**
 * Matches the upstream-status test that governs a credential failure branch,
 * either as an explicit comparison or as a status list membership check.
 */
const authStatusTestPattern = /status\s*===?\s*40[13]|\b40[13]\b[^\n]*\.includes/u;

/** Matches a branch that tests for a genuine upstream 409 conflict. */
const conflictStatusTestPattern = /===\s*409/u;

interface AuthConflictHit {
  file: string;
  line: number;
  source: string;
}

function listProviderSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProviderSourceFiles(path));
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

/**
 * Report every `ProviderRequestError(409, ...)` raised from a branch that tests
 * an upstream 401/403. `toProviderExecutionError` has no 409 case, so those
 * become `invalid_input` / HTTP 400 instead of `authorization_failed` / 403.
 * A window that also tests for 409 is a genuine upstream conflict and is kept.
 */
function findAuthConflictErrors(): AuthConflictHit[] {
  const hits: AuthConflictHit[] = [];
  for (const file of listProviderSourceFiles(providersDirectory)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("ProviderRequestError(409")) {
        return;
      }
      const window = lines.slice(Math.max(0, index - 4), index + 1).join("\n");
      if (!authStatusTestPattern.test(window) || conflictStatusTestPattern.test(window)) {
        return;
      }
      hits.push({
        file: relative(providersDirectory, file),
        line: index + 1,
        source: line.trim(),
      });
    });
  }
  return hits;
}

interface ErrorCodeArgumentHit {
  file: string;
  line: number;
  code: string;
}

function skipStringLiteral(source: string, startIndex: number): number {
  const quote = source[startIndex];
  let index = startIndex + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) {
      return index + 1;
    }
    index += 1;
  }
  return source.length;
}

function findClosingParenthesis(source: string, openIndex: number): number {
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '"' || character === "'" || character === "`") {
      index = skipStringLiteral(source, index);
      continue;
    }
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
    index += 1;
  }
  return -1;
}

function splitTopLevelArguments(source: string): string[] {
  const argumentSources: string[] = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '"' || character === "'" || character === "`") {
      index = skipStringLiteral(source, index);
      continue;
    }
    if (character === "(" || character === "[" || character === "{") {
      depth += 1;
    } else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      argumentSources.push(source.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  argumentSources.push(source.slice(start));
  return argumentSources;
}

const comparisonOperatorPattern = /[=!]==?$/u;

/**
 * Read the codes a fourth-argument expression can evaluate to. A ternary such
 * as `phase === "validate" ? "invalid_input" : "authorization_failed"` carries
 * the phase literal too, so literals that sit on either side of a comparison
 * operator are conditions rather than codes.
 */
function readCodeLiterals(argumentSource: string): string[] {
  const codes: string[] = [];
  for (const literal of argumentSource.matchAll(/"([^"\\]*)"/gu)) {
    const before = argumentSource.slice(0, literal.index).trimEnd();
    const after = argumentSource.slice(literal.index + literal[0].length).trimStart();
    if (comparisonOperatorPattern.test(before) || after.startsWith("==") || after.startsWith("!=")) {
      continue;
    }
    codes.push(literal[1]!);
  }
  return codes;
}

interface CallSite {
  index: number;
  argumentSources: string[];
}

function findCallSites(source: string, calleePattern: RegExp): CallSite[] {
  const sites: CallSite[] = [];
  let match = calleePattern.exec(source);
  while (match) {
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = findClosingParenthesis(source, openIndex);
    if (closeIndex !== -1) {
      sites.push({
        index: match.index,
        argumentSources: splitTopLevelArguments(source.slice(openIndex + 1, closeIndex)),
      });
    }
    match = calleePattern.exec(source);
  }
  return sites;
}

const identifierPattern = /^[A-Za-z_$][\w$]*$/u;

interface EnclosingCallable {
  name: string;
  parameterNames: string[];
}

function readParameterNames(source: string, openIndex: number): string[] {
  const closeIndex = findClosingParenthesis(source, openIndex);
  if (closeIndex === -1) {
    return [];
  }
  return splitTopLevelArguments(source.slice(openIndex + 1, closeIndex)).map(
    (parameter) => /^[A-Za-z_$][\w$]*/u.exec(parameter.trim())?.[0] ?? "",
  );
}

function findEnclosingCallable(source: string, index: number): EnclosingCallable | undefined {
  const head = source.slice(0, index);
  const functionStart = head.lastIndexOf("function ");
  const constructorStart = head.lastIndexOf("constructor(");
  if (constructorStart > functionStart) {
    const className = /class\s+([A-Za-z_$][\w$]*)\s+extends\s+ProviderRequestError/gu;
    let owner: string | undefined;
    for (const match of head.matchAll(className)) {
      owner = match[1];
    }
    return owner === undefined
      ? undefined
      : { name: owner, parameterNames: readParameterNames(source, constructorStart + "constructor".length) };
  }
  if (functionStart === -1) {
    return undefined;
  }
  const declaration = /^function\s+([A-Za-z_$][\w$]*)\s*\(/u.exec(source.slice(functionStart));
  if (!declaration) {
    return undefined;
  }
  return {
    name: declaration[1]!,
    parameterNames: readParameterNames(source, functionStart + declaration[0].length - 1),
  };
}

/**
 * Find the provider-local helpers and `ProviderRequestError` subclasses that
 * forward one of their own parameters into the code argument, so their callers
 * are held to the same rule as a direct construction.
 */
function findCodeArgumentIndexes(sources: string[]): Map<string, Set<number>> {
  const indexesByCallee = new Map<string, Set<number>>([["ProviderRequestError", new Set([3])]]);
  for (const source of sources) {
    for (const site of findCallSites(source, /(?:new ProviderRequestError|super)\(/gu)) {
      const codeArgument = site.argumentSources[3]?.trim();
      if (codeArgument === undefined || !identifierPattern.test(codeArgument)) {
        continue;
      }
      const owner = findEnclosingCallable(source, site.index);
      const argumentIndex = owner?.parameterNames.indexOf(codeArgument) ?? -1;
      if (!owner || argumentIndex === -1) {
        continue;
      }
      const indexes = indexesByCallee.get(owner.name) ?? new Set<number>();
      indexes.add(argumentIndex);
      indexesByCallee.set(owner.name, indexes);
    }
  }
  return indexesByCallee;
}

/**
 * Report every string literal a provider puts in the `ProviderRequestError`
 * code argument that the runtime routes do not know, directly or through one
 * of those wrappers. That argument sets `error.code` verbatim and the routes
 * derive the HTTP status from the code alone, so an undocumented code turns
 * what the status would have answered into HTTP 400.
 */
function findUndocumentedErrorCodes(): ErrorCodeArgumentHit[] {
  const documented = new Set(runtimeErrorCodes);
  const files = listProviderSourceFiles(providersDirectory);
  const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const indexesByCallee = findCodeArgumentIndexes([...sources.values()]);
  const hits: ErrorCodeArgumentHit[] = [];
  for (const [file, source] of sources) {
    for (const [callee, indexes] of indexesByCallee) {
      for (const site of findCallSites(source, new RegExp(`\\b${callee}\\(`, "gu"))) {
        for (const argumentIndex of indexes) {
          const codeArgument = site.argumentSources[argumentIndex];
          for (const code of codeArgument === undefined ? [] : readCodeLiterals(codeArgument)) {
            if (!documented.has(code)) {
              hits.push({
                file: relative(providersDirectory, file),
                line: source.slice(0, site.index).split("\n").length,
                code,
              });
            }
          }
        }
      }
    }
  }
  return hits;
}

describe("provider auth-failure status guard", () => {
  it("never maps an upstream 401 or 403 to a provider 409", () => {
    expect(findAuthConflictErrors()).toEqual([]);
  });

  it("only puts documented runtime error codes on the wire", () => {
    expect(findUndocumentedErrorCodes()).toEqual([]);
  });
});
