import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

describe("provider auth-failure status guard", () => {
  it("never maps an upstream 401 or 403 to a provider 409", () => {
    expect(findAuthConflictErrors()).toEqual([]);
  });
});
