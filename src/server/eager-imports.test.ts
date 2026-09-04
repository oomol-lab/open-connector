import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Packages that only a configured feature or a request path needs. They must stay behind a dynamic import so the
// default startup graph, and therefore resident memory, does not pay for them: connect-server.ts loads the MCP
// module and Scalar on first use, index.ts the S3 backend, node-runtime-database.ts pg, runtime-jwt.ts jose.
// @modelcontextprotocol/client depends on zod and jose, so pinning it statically would pull both back in.
const lazyOnlyPackages = [
  "@modelcontextprotocol/server",
  "@modelcontextprotocol/client",
  "zod",
  "jose",
  "pg",
  "@aws-sdk/client-s3",
  "@scalar/hono-api-reference",
];

// The eager graph is a few dozen first-party files; far fewer means an edge pattern stopped matching and the
// assertion below would pass vacuously.
const minimumEagerFiles = 40;

const importEdgePattern = /^import\s+(?!type\s)[^"']*?from\s+["']([^"']+)["']|^import\s+["']([^"']+)["']/gm;
const reexportEdgePattern = /^export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"']+)["']/gm;

interface EagerGraph {
  files: Set<string>;
  packages: Set<string>;
}

/**
 * First-party modules and bare package specifiers reachable from `entry` through static, non-type `import` and
 * `export ... from` edges. Dynamic `import()` edges are not followed: they are what keeps a module lazy.
 */
function collectEagerGraph(entry: string): EagerGraph {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) {
      continue;
    }
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const specifier of staticSpecifiers(source)) {
      if (specifier.startsWith(".")) {
        queue.push(resolve(dirname(file), specifier));
      } else if (!specifier.startsWith("node:") && !specifier.startsWith("bun:")) {
        packages.add(packageName(specifier));
      }
    }
  }
  return { files, packages };
}

function staticSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(importEdgePattern)) {
    specifiers.push(match[1] ?? match[2]);
  }
  for (const match of source.matchAll(reexportEdgePattern)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function packageName(specifier: string): string {
  const segments = specifier.split("/");
  return segments.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

describe("eager import graph", () => {
  it.each(["index.ts", "cloudflare.ts"])("keeps feature-only packages out of the static graph of %s", (entry) => {
    const graph = collectEagerGraph(resolve(import.meta.dirname, entry));
    expect(graph.files.size).toBeGreaterThan(minimumEagerFiles);
    expect(graph.packages.has("hono")).toBe(true);
    expect([...graph.packages].filter((name) => lazyOnlyPackages.includes(name))).toEqual([]);
  });

  it("follows re-export edges", () => {
    const graph = collectEagerGraph(resolve(import.meta.dirname, "index.ts"));
    // secret-codec.ts reaches secret-codec-core.ts only through `export { ... } from`.
    expect(graph.files.has(resolve(import.meta.dirname, "secrets/secret-codec-core.ts"))).toBe(true);
  });
});
