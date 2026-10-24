import type { ProviderDefinition, ProviderExecutors, ExecutionContext } from "../src/core/types.ts";

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";

const run = promisify(execFile);
const script = resolve("scripts/create-provider.ts");
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it("generates a runnable provider and refuses to overwrite it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "connect-scaffold-"));
  directories.push(directory);
  const providers = join(directory, "src/providers");
  await mkdir(providers, { recursive: true });
  await run(process.execPath, [script, "scaffold_fixture", "Fixture", "https://api.example.com/data"], {
    cwd: directory,
  });
  await symlink(resolve("src/core"), join(directory, "src/core"));
  await symlink(resolve("src/providers/provider-runtime.ts"), join(providers, "provider-runtime.ts"));
  const { provider } = (await import(join(providers, "scaffold_fixture/definition.ts"))) as {
    provider: ProviderDefinition;
  };
  const { executors } = (await import(join(providers, "scaffold_fixture/executors.ts"))) as {
    executors: ProviderExecutors;
  };
  const fetcher = vi.fn(async (_input: Parameters<typeof fetch>[0]) => Response.json({ value: 42 }));
  vi.stubGlobal("fetch", fetcher);
  const result = await executors[provider.actions[0]!.id as `${string}.${string}`]!({}, {
    signal: new AbortController().signal,
  } as ExecutionContext);
  expect(result).toEqual({ ok: true, output: { data: { value: 42 } } });
  expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.example.com/data");
  const before = await readFile(join(providers, "scaffold_fixture/definition.ts"), "utf8");
  await expect(
    run(process.execPath, [script, "scaffold_fixture", "Replacement", "https://api.example.com/other"], {
      cwd: directory,
    }),
  ).rejects.toThrow("EEXIST");
  expect(await readFile(join(providers, "scaffold_fixture/definition.ts"), "utf8")).toBe(before);
});

it("rejects unsafe endpoints and traversal before creating files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "connect-scaffold-"));
  directories.push(directory);
  for (const args of [
    ["../escape", "Fixture", "https://api.example.com"],
    ["fixture", "Fixture", "http://127.0.0.1"],
  ]) {
    await expect(run(process.execPath, [script, ...args], { cwd: directory })).rejects.toThrow();
  }
});
