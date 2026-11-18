import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "dist/package");
await rm(output, { recursive: true, force: true });
const compiled = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.package.json"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) throw new Error("Runtime package compilation failed.");

const assets = join(output, "assets/open-connector");
await mkdir(join(assets, "catalog"), { recursive: true });
await cp(join(root, "catalog/apps"), join(assets, "catalog/apps"), { recursive: true });
await cp(join(root, "catalog/apps-index.json"), join(assets, "catalog/apps-index.json"));
await cp(join(root, "migrations"), join(assets, "migrations"), { recursive: true });
await cp(join(root, "LICENSE.txt"), join(output, "LICENSE.txt"));
await cp(join(root, "LICENSE-APACHE-2.0.txt"), join(output, "LICENSE-APACHE-2.0.txt"));
await cp(join(root, "NOTICE.md"), join(output, "NOTICE.md"));
await cp(join(root, "docs/headless.md"), join(output, "README.md"));
const source = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await writeFile(
  join(output, "package.json"),
  JSON.stringify(
    {
      name: source.name,
      version: source.version,
      description: "Embeddable Open Connector runtime for Node.js and Bun.",
      license: source.license,
      type: "module",
      exports: {
        ".": { types: "./src/server/connector-runtime.d.ts", import: "./src/server/connector-runtime.js" },
        "./build": { types: "./src/server/connector-build.d.ts", import: "./src/server/connector-build.js" },
        // Authoring helpers for providers registered through the `customProviders` option.
        "./provider-definition": {
          types: "./src/core/provider-definition.d.ts",
          import: "./src/core/provider-definition.js",
        },
        "./json-schema": { types: "./src/core/json-schema.d.ts", import: "./src/core/json-schema.js" },
        "./provider-runtime": {
          types: "./src/providers/provider-runtime.d.ts",
          import: "./src/providers/provider-runtime.js",
        },
        "./provider-executors": {
          types: "./src/providers/provider-executors.d.ts",
          import: "./src/providers/provider-executors.js",
        },
        "./provider-proxy": {
          types: "./src/providers/provider-proxy.d.ts",
          import: "./src/providers/provider-proxy.js",
        },
        "./types": { types: "./src/core/types.d.ts", import: "./src/core/types.js" },
        "./request": { types: "./src/core/request.d.ts", import: "./src/core/request.js" },
      },
      dependencies: source.dependencies,
      engines: source.engines,
      keywords: ["connector", "oauth", "mcp", "agents", "integrations"],
      homepage: "https://github.com/oomol-lab/open-connector#readme",
      bugs: { url: "https://github.com/oomol-lab/open-connector/issues" },
      repository: { type: "git", url: "git+https://github.com/oomol-lab/open-connector.git" },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Built headless package in dist/package. Run npm pack ./dist/package --pack-destination dist to create an installable tarball.",
);
