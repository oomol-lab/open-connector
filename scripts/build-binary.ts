import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Build the single-file server executables with Bun.
//
// Usage: `bun scripts/build-binary.ts [target-name ...]` (normally through `npm run build:binary`, which
// regenerates the catalog and builds the web console first). No arguments builds every target.

interface BinaryTarget {
  /** Suffix of the output file: `dist/open-connector-<name>` (Bun appends `.exe` for Windows targets). */
  name: string;
  target: Bun.Build.CompileTarget;
}

const rootDir = resolve(import.meta.dirname, "..");
const bunVersionFile = join(rootDir, ".bun-version");
const targets: BinaryTarget[] = [
  { name: "linux-x64", target: "bun-linux-x64" },
  { name: "linux-arm64", target: "bun-linux-arm64" },
  { name: "darwin-x64", target: "bun-darwin-x64" },
  { name: "darwin-arm64", target: "bun-darwin-arm64" },
  { name: "windows-x64", target: "bun-windows-x64" },
  { name: "windows-arm64", target: "bun-windows-arm64" },
];

assertPinnedBunVersion();
assertBuildInputs();
for (const target of selectTargets(process.argv.slice(2))) {
  await buildTarget(target);
}

/** `.bun-version` is the single owner of the pinned Bun version; CI installs it and local builds must match it. */
function assertPinnedBunVersion(): void {
  const pinnedVersion = readFileSync(bunVersionFile, "utf8").trim();
  if (Bun.version !== pinnedVersion) {
    fail(
      `Bun ${Bun.version} is running but .bun-version pins ${pinnedVersion}. Install it with: curl -fsSL https://bun.sh/install | bash -s "bun-v${pinnedVersion}"`,
    );
  }
}

/** The embedded directories are generated; refuse to build a binary that would ship an empty catalog or console. */
function assertBuildInputs(): void {
  const problems: string[] = [];
  if (listFiles(join(rootDir, "catalog/apps"), ".json").length === 0) {
    problems.push("catalog/apps contains no .json files");
  }
  if (listFiles(join(rootDir, "migrations"), ".sql").length === 0) {
    problems.push("migrations contains no .sql files");
  }
  if (listFiles(join(rootDir, "migrations/postgresql"), ".sql").length === 0) {
    problems.push("migrations/postgresql contains no .sql files");
  }
  if (!existsSync(join(rootDir, "dist/web/index.html"))) {
    problems.push("dist/web/index.html is missing");
  }
  if (problems.length > 0) {
    fail(
      `Build inputs are missing:\n  - ${problems.join("\n  - ")}\nRun "npm run build:binary" so the catalog and the web console are generated before the binary is built.`,
    );
  }
}

function listFiles(directory: string, extension: string): string[] {
  try {
    return readdirSync(directory).filter((name) => name.endsWith(extension));
  } catch {
    return [];
  }
}

function selectTargets(names: string[]): BinaryTarget[] {
  if (names.length === 0) {
    return targets;
  }

  return names.map((name) => {
    const target = targets.find((candidate) => candidate.name === name);
    if (!target) {
      fail(`Unknown target "${name}". Valid targets: ${targets.map((candidate) => candidate.name).join(", ")}.`);
    }

    return target;
  });
}

async function buildTarget(binaryTarget: BinaryTarget): Promise<void> {
  const outfile = join(rootDir, "dist", `open-connector-${binaryTarget.name}`);
  // Bun appends .exe to Windows outputs; clear both spellings so an earlier build can never be mistaken for this one.
  rmSync(outfile, { force: true });
  rmSync(`${outfile}.exe`, { force: true });

  const result = await runBunBuild(binaryTarget.target, outfile);
  const [artifact] = result.outputs;
  if (!artifact) {
    fail(`Bun.build produced no output for ${binaryTarget.name}.`);
  }

  if (binaryTarget.target.startsWith("bun-darwin-")) {
    signDarwinBinary(artifact.path);
  }

  const sizeMiB = statSync(artifact.path).size / (1024 * 1024);
  console.log(`built ${relative(rootDir, artifact.path)} (${sizeMiB.toFixed(1)} MiB)`);
}

async function runBunBuild(target: Bun.Build.CompileTarget, outfile: string): Promise<Bun.BuildOutput> {
  let result: Bun.BuildOutput;
  try {
    result = await Bun.build({
      entrypoints: [join(rootDir, "src/server/index.ts")],
      target: "bun",
      format: "esm",
      // ali-oss depends on urllib, which lazily `require("proxy-agent")`, an optional peer dependency that is not
      // installed here. The bundler cannot resolve it, so it stays a runtime require that is never reached.
      external: ["proxy-agent"],
      // Bun inlines `process.env.NODE_ENV` at compile time ("development" unless defined). src/server/logger.ts then
      // loads the pino-pretty worker transport, which cannot run inside a standalone executable. Every other
      // environment variable is still read at runtime.
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      compile: {
        target,
        outfile,
        // Each directory is embedded under its basename next to the bundle: migrations/, apps/ and web/.
        // catalog/apps rather than catalog/: an interrupted `npm run generate:catalog` leaves catalog/.apps-<pid>-<ts>
        // temp directories behind, and they must never end up inside a release.
        assets: [join(rootDir, "migrations"), join(rootDir, "catalog/apps"), join(rootDir, "dist/web")],
        // `node src/server/index.ts` reads neither .env nor bunfig.toml; keep the binary's configuration surface the same.
        autoloadDotenv: false,
        autoloadBunfig: false,
      },
    });
  } catch (error) {
    // Bun.build rejects with an AggregateError whose `errors` hold the BuildMessage / ResolveMessage entries.
    if (error instanceof AggregateError) {
      for (const message of error.errors) {
        console.error(describeBuildMessage(message));
      }
      fail(`Bundling ${target} failed.`);
    }

    throw error;
  }

  for (const message of result.logs) {
    console.error(describeBuildMessage(message));
  }
  if (!result.success) {
    fail(`Bundling ${target} failed.`);
  }

  return result;
}

function describeBuildMessage(message: unknown): string {
  if (message instanceof BuildMessage || message instanceof ResolveMessage) {
    const position = message.position;
    const location = position ? ` (${position.file}:${position.line}:${position.column})` : "";
    return `${message.level}: ${message.message}${location}`;
  }

  return String(message);
}

/**
 * Bun 1.4.0 writes an ad-hoc signature whose last page hash is wrong (oven-sh/bun#39837, fixed upstream but
 * unreleased). macOS 27 refuses to start such a binary (SIGKILL at exec), so re-sign it in place. codesign only
 * exists on macOS; darwin outputs built elsewhere are re-signed on the macOS smoke runner instead.
 */
function signDarwinBinary(output: string): void {
  const displayPath = relative(rootDir, output);
  if (process.platform !== "darwin") {
    console.warn(
      `warning: ${displayPath} still carries Bun's invalid ad-hoc signature because codesign is only available on macOS; run "codesign --force --sign - ${displayPath}" on macOS 27 or later before executing it.`,
    );
    return;
  }

  const result = spawnSync("codesign", ["--force", "--sign", "-", output], { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(
      `codesign failed for ${displayPath} (${result.signal ? `signal ${result.signal}` : `exit code ${result.status}`}).`,
    );
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
