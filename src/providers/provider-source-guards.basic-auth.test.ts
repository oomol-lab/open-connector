import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const providersDirectory = fileURLToPath(new URL(".", import.meta.url));
const guardFile = fileURLToPath(import.meta.url);

/**
 * `btoa` is a browser-era Latin-1 encoder: it sends the wrong bytes for an
 * accented credential and throws on anything outside Latin-1. Provider code
 * must build Basic credentials with `basicAuthorizationHeader` instead. These
 * two files base64 a binary string assembled byte by byte, which is Latin-1 by
 * construction and has nothing to do with credentials, so the one call each of
 * them makes is exempt. The exemption is the exact call text rather than the
 * file, so a credential-bearing `btoa` added elsewhere in either file is still
 * reported.
 */
const binaryStringAllowlist = new Map<string, string>([
  ["gitea/runtime.ts", "return btoa(binary);"],
  ["pi_hole/runtime.ts", "return btoa(binary);"],
]);

function listProviderSourceFiles(directory: string, prefix: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listProviderSourceFiles(join(directory, entry.name), relativePath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(relativePath);
    }
  }
  return files;
}

function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let index = source.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = source.indexOf(needle, index + needle.length);
  }
  return count;
}

function readProviderSource(relativePath: string): string {
  return readFileSync(join(providersDirectory, relativePath), "utf8");
}

describe("provider source guards", () => {
  it("keeps btoa out of provider source outside the binary-string allowlist", () => {
    const offenders = listProviderSourceFiles(providersDirectory, "").filter((relativePath) => {
      if (join(providersDirectory, relativePath) === guardFile) {
        return false;
      }
      const source = readProviderSource(relativePath);
      const allowedCall = binaryStringAllowlist.get(relativePath);
      const allowed = allowedCall === undefined ? 0 : countOccurrences(source, allowedCall);
      return countOccurrences(source, "btoa(") > allowed;
    });

    expect(offenders).toEqual([]);
  });

  it("keeps every allowlisted btoa call on its binary-string form", () => {
    const stale = [...binaryStringAllowlist]
      .filter(([relativePath, allowedCall]) => !readProviderSource(relativePath).includes(allowedCall))
      .map(([relativePath]) => relativePath);

    expect(stale).toEqual([]);
  });
});
