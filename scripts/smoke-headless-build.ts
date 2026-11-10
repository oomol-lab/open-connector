import type * as ConnectorBuildModule from "../src/server/connector-build.ts";

// Run with Bun after installing the packed headless package into the supplied consumer directory.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const consumer = resolve(process.argv[2]);
const { getConnectorBuildOptions } = (await import(
  import.meta.resolve("@oomol-lab/open-connector/build", join(consumer, "package.json"))
)) as typeof ConnectorBuildModule;
const execution = await mkdtemp(join(tmpdir(), "connector-build-smoke-"));
const entrypoint = join(consumer, "headless-host.mjs");

try {
  await cp(new URL("./fixtures/headless-host.mjs", import.meta.url), entrypoint);
  await assert.rejects(getConnectorBuildOptions({ providers: ["missing-provider"] }), /Unknown provider/);
  await assert.rejects(getConnectorBuildOptions({ providers: ["../github"] }), /provider id/);
  const defaults = await getConnectorBuildOptions();
  const omitted = await getConnectorBuildOptions({});
  assert.deepEqual(omitted.assets, defaults.assets);
  await omitted.dispose();
  const index = JSON.parse(await readFile(join(defaults.assets[0]!, "catalog/apps-index.json"), "utf8"));
  const all = index.providers.map((entry: { provider: { service: string } }) => entry.provider.service).sort();
  await defaults.dispose();
  for (const providers of [undefined, ["github", "github"], []]) {
    const expected = providers === undefined ? all : [...new Set(providers)].sort();
    const prepared = await getConnectorBuildOptions({ providers });
    const outfile = join(execution, "host");
    try {
      const result = await Bun.build({
        entrypoints: [entrypoint],
        target: "bun",
        format: "esm",
        splitting: true,
        plugins: prepared.plugins,
        external: prepared.external,
        compile: { outfile, assets: prepared.assets },
        metafile: true,
      });
      assert.ok(result.success, result.logs.join("\n"));
      assert.ok(result.metafile);
      const bundledProviders = new Set<string>();
      for (const path of Object.keys(result.metafile.inputs)) {
        const match = /\/src\/providers\/([^/]+)\//.exec(path.replaceAll("\\", "/"));
        if (match) bundledProviders.add(match[1]!);
      }
      assert.deepEqual([...bundledProviders].sort(), expected);
    } finally {
      await prepared.dispose();
    }
    if (providers !== undefined) await assert.rejects(readdir(prepared.assets[0]!));
    // Bun 1.4.0 writes an ad-hoc signature that macOS 27 refuses to start (oven-sh/bun#39837); re-sign it in place
    // like scripts/build-binary.ts does so the smoke also runs on a macOS checkout.
    if (process.platform === "darwin") {
      const signed = Bun.spawnSync(["codesign", "--force", "--sign", "-", outfile], { stderr: "inherit" });
      assert.ok(signed.success, `codesign failed with exit code ${signed.exitCode}`);
    }
    const child = Bun.spawn([outfile, JSON.stringify(expected)], {
      cwd: execution,
      stdout: "inherit",
      stderr: "inherit",
    });
    assert.equal(await child.exited, 0);
    await rm(join(execution, "data"), { recursive: true, force: true });
    console.log(`Compiled host passed with ${expected.length} providers.`);
  }
} finally {
  await rm(entrypoint, { force: true });
  await rm(execution, { recursive: true, force: true });
}
