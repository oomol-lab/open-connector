import { spawnSync } from "node:child_process";

// The generated provider registries are gitignored, so a branch switch without a reinstall can leave ones built by
// another branch's generator. Refresh them before any test file imports them, the way postinstall and start do.
export default function setup(): void {
  const result = spawnSync(process.execPath, ["scripts/ensure-generated.ts"], {
    cwd: import.meta.dirname,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`scripts/ensure-generated.ts exited with ${result.status ?? result.signal}`);
  }
}
