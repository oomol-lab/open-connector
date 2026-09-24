import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Cloudflare Workers' fetch only implements `redirect: "follow"` and
// `redirect: "manual"`; `redirect: "error"` throws `TypeError: Invalid redirect
// value` before any request is sent, so a provider that asks for it fails every
// call on Workers while passing on Node. Provider code that must not follow a
// redirect passes `redirect: "manual"` instead and rejects the 3xx through its
// `!response.ok` check (the MCP SDK and `defineProviderProxy` already do). This
// guard fails when a provider source file asks for the "error" mode again, in
// an object literal or an assignment, with any quote style; comment lines that
// name the mode to explain avoiding it are not requests and are skipped.

const providersDir = fileURLToPath(new URL(".", import.meta.url));
const repoDir = fileURLToPath(new URL("../..", import.meta.url));
const errorRedirectMode = /\bredirect\s*[:=]\s*(["'`])error\1/;
// Hundreds of provider source files exist today; a floor well under that fails
// loudly if the directory layout moves and the scan quietly covers nothing.
const minimumScannedFiles = 100;

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

// A comment may name the mode to explain why a call site avoids it.
function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

describe("provider redirect mode guard", () => {
  it("recognizes the error redirect mode in its common spellings", () => {
    expect(errorRedirectMode.test('{ redirect: "error" }')).toBe(true);
    expect(errorRedirectMode.test("{ redirect: 'error' }")).toBe(true);
    expect(errorRedirectMode.test('init.redirect = "error";')).toBe(true);
    expect(errorRedirectMode.test('{ redirect: "manual" }')).toBe(false);
    expect(errorRedirectMode.test('{ redirect: "follow" }')).toBe(false);
  });

  it("keeps provider requests off the redirect mode Cloudflare Workers does not implement", () => {
    const files = listSourceFiles(providersDir);
    expect(files.length).toBeGreaterThanOrEqual(minimumScannedFiles);

    const offenders = files.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          errorRedirectMode.test(line) && !isCommentLine(line)
            ? [`${relative(repoDir, path)}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );

    expect(offenders).toEqual([]);
  });
});
