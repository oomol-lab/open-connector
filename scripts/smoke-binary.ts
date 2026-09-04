import type { ChildProcess } from "node:child_process";

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// Start a built single-file executable against a fresh data directory and check that its embedded catalog,
// web console, migrations, provider executor chunks, lazily loaded MCP and docs modules, exit on a port conflict
// and shutdown path work.
//
// Usage: `node scripts/smoke-binary.ts <path-to-binary>`. Set OOMOL_CONNECT_DATABASE_URL to run the PostgreSQL
// mode and OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS to a value the server reads as true (1, true, yes or on) to run the
// lazy catalog mode, which also proves that the embedded catalog index was found and used at startup; every other
// OOMOL_CONNECT_* variable is removed from the server's environment. Uses only Node built-ins so the smoke runners
// need no `npm ci`.

interface ProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface ServerProcessOptions {
  binaryPath: string;
  dataDir: string;
  port: number;
  databaseUrl: string | undefined;
}

const healthTimeoutMs = 60_000;
const healthPollIntervalMs = 500;
const requestTimeoutMs = 10_000;
const shutdownTimeoutMs = 10_000;

/** The server binary with its captured output and exit state. */
class ServerProcess {
  private readonly child: ChildProcess;
  private readonly stdoutChunks: Buffer[] = [];
  private readonly stderrChunks: Buffer[] = [];
  private readonly closed: Promise<void>;
  private exitState: ProcessExit | undefined;
  private spawnError: Error | undefined;

  constructor(options: ServerProcessOptions) {
    this.child = spawn(options.binaryPath, [], {
      cwd: options.dataDir,
      env: buildServerEnvironment(options),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child.stdout?.on("data", (chunk: Buffer) => this.stdoutChunks.push(chunk));
    this.child.stderr?.on("data", (chunk: Buffer) => this.stderrChunks.push(chunk));
    this.closed = new Promise((resolveClosed) => {
      this.child.once("error", (error) => {
        this.spawnError = error;
        this.exitState ??= { code: null, signal: null };
        resolveClosed();
      });
      this.child.once("close", (code, signal) => {
        this.exitState = { code, signal };
        resolveClosed();
      });
    });
  }

  get exit(): ProcessExit | undefined {
    return this.exitState;
  }

  get stdout(): string {
    return Buffer.concat(this.stdoutChunks).toString("utf8");
  }

  get stderr(): string {
    return Buffer.concat(this.stderrChunks).toString("utf8");
  }

  describeExit(): string {
    if (this.spawnError) {
      return `spawn failed: ${this.spawnError.message}`;
    }
    if (!this.exitState) {
      return "still running";
    }

    return this.exitState.signal ? `signal ${this.exitState.signal}` : `exit code ${this.exitState.code}`;
  }

  kill(signal: NodeJS.Signals): void {
    this.child.kill(signal);
  }

  /** Resolve with the exit state, or undefined when the process is still running after the timeout. */
  async waitForExit(timeoutMs: number): Promise<ProcessExit | undefined> {
    await Promise.race([this.closed, sleep(timeoutMs, undefined, { ref: false })]);
    return this.exitState;
  }

  /** Terminate a process that is still running; no-op after it exited. */
  async forceStop(): Promise<void> {
    if (this.exitState) {
      return;
    }

    this.kill("SIGKILL");
    await this.waitForExit(shutdownTimeoutMs);
  }
}

const binaryPath = await resolveBinaryPath(process.argv[2]);
const databaseUrl = process.env.OOMOL_CONNECT_DATABASE_URL?.trim() || undefined;
const mode = databaseUrl ? "postgresql" : "sqlite";
const lazyCatalogSchemas = isTruthyEnv(process.env.OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS);
const startedAt = performance.now();
// Probe the port before creating the data directory so a probe failure cannot leak the temp directory.
const port = await findFreePort();
const dataDir = await mkdtemp(join(tmpdir(), "open-connector-smoke-"));
const baseUrl = `http://127.0.0.1:${port}`;
const server = new ServerProcess({ binaryPath, dataDir, port, databaseUrl });

try {
  await waitForHealth(server, baseUrl);
  const readyAt = performance.now();
  const indexHtml = await checkConsoleIndex(baseUrl);
  await checkConsoleAssets(baseUrl, indexHtml);
  await checkProviders(baseUrl);
  await checkActionSchema(baseUrl);
  if (lazyCatalogSchemas) {
    checkCatalogIndexUsed(server);
  }
  await checkApps(baseUrl);
  await checkProviderExecutor(baseUrl);
  await checkMcp(baseUrl);
  await checkDocs(baseUrl);
  await checkDatabaseBackend(server, dataDir, databaseUrl);
  await checkPortConflictExit(binaryPath, port, databaseUrl);
  await checkGracefulShutdown(server);
  await removeDataDir(dataDir);
  console.log(
    `PASS ${binaryPath} mode=${mode} startup=${formatMs(readyAt - startedAt)} total=${formatMs(performance.now() - startedAt)}`,
  );
} catch (error) {
  console.error(`FAIL ${binaryPath}: ${error instanceof Error ? error.message : String(error)}`);
  printServerLogs(server);
  process.exitCode = 1;
} finally {
  await server.forceStop();
  await removeDataDir(dataDir).catch(() => undefined);
}

/** Resolve the binary before spawning: spawn resolves relative paths against the child's cwd, which is the data dir. */
async function resolveBinaryPath(argument: string | undefined): Promise<string> {
  if (!argument) {
    console.error("Usage: node scripts/smoke-binary.ts <path-to-binary>");
    process.exit(1);
  }

  const resolved = resolve(argument);
  try {
    await access(resolved);
  } catch {
    console.error(`Binary not found: ${resolved}`);
    process.exit(1);
  }

  return resolved;
}

/** process.env without OOMOL_CONNECT_* so the caller's shell cannot leak configuration into the server under test. */
function buildServerEnvironment(options: ServerProcessOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.toUpperCase().startsWith("OOMOL_CONNECT_")) {
      env[key] = value;
    }
  }

  env.PORT = String(options.port);
  env.HOST = "127.0.0.1";
  env.OOMOL_CONNECT_DATA_DIR = options.dataDir;
  if (options.databaseUrl) {
    env.OOMOL_CONNECT_DATABASE_URL = options.databaseUrl;
  }
  // Forwarded verbatim on purpose: it is what makes a smoke run read action schemas from the embedded catalog on
  // demand, and the server applies its own reading of the value.
  const lazyCatalogSchemasValue = process.env.OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS;
  if (lazyCatalogSchemasValue !== undefined) {
    env.OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS = lazyCatalogSchemasValue;
  }

  return env;
}

/**
 * Whether the server reads an OOMOL_CONNECT_* value as true. Mirrors parseBooleanEnv in src/server/index.ts token
 * for token (1, true, yes, on; trimmed, case-insensitive). It is a copy rather than an import because this script
 * must stay free of src imports so the smoke runners can run it with nothing but Node.
 */
function isTruthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not determine a free port."));
        return;
      }

      const { port: freePort } = address;
      probe.close((error) => (error ? reject(error) : resolvePort(freePort)));
    });
  });
}

async function waitForHealth(server: ServerProcess, baseUrl: string): Promise<void> {
  const deadline = Date.now() + healthTimeoutMs;
  while (Date.now() < deadline) {
    if (server.exit) {
      throw new Error(`server exited before /health responded (${server.describeExit()})`);
    }
    if (await isHealthy(baseUrl)) {
      return;
    }

    await sleep(healthPollIntervalMs);
  }

  throw new Error(`/health did not respond within ${healthTimeoutMs} ms`);
}

async function isHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(healthPollIntervalMs * 4) });
    await response.text();
    return response.status === 200;
  } catch {
    return false;
  }
}

async function checkConsoleIndex(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(requestTimeoutMs) });
  const body = await response.text();
  assert(response.status === 200, `GET / returned ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.startsWith("text/html"), `GET / content-type is ${contentType || "missing"}`);
  assert(body.includes("<script"), "GET / body contains no <script tag");
  return body;
}

/**
 * The SPA fallback answers any unknown console path with index.html, so GET / proves nothing about asset serving.
 * Fetching the hashed files index.html references proves the embedded static map, including its path separators.
 */
async function checkConsoleAssets(baseUrl: string, indexHtml: string): Promise<void> {
  const assetPaths = collectAssetPaths(indexHtml);
  assert(assetPaths.length > 0, 'GET / references no src="/..." or href="/..." assets');
  for (const assetPath of assetPaths) {
    const response = await fetch(`${baseUrl}${assetPath}`, { signal: AbortSignal.timeout(requestTimeoutMs) });
    const body = await response.arrayBuffer();
    assert(response.status === 200, `GET ${assetPath} returned ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    assert(
      !contentType.startsWith("text/html"),
      `GET ${assetPath} was answered by the SPA fallback (content-type ${contentType || "missing"})`,
    );
    const contentLength = response.headers.get("content-length");
    assert(
      Number(contentLength) > 0 && Number(contentLength) === body.byteLength,
      `GET ${assetPath} Content-Length ${contentLength ?? "missing"} does not match the ${body.byteLength}-byte body`,
    );
  }
}

/** Root-relative `src` and `href` values; protocol-relative `//host/...` URLs are not served by the binary. */
function collectAssetPaths(html: string): string[] {
  const paths = new Set<string>();
  for (const match of html.matchAll(/\b(?:src|href)="(\/[^"]*)"/g)) {
    if (!match[1].startsWith("//")) {
      paths.add(match[1]);
    }
  }

  return [...paths];
}

async function checkProviders(baseUrl: string): Promise<void> {
  const data = await fetchEnvelopeData(baseUrl, "/v1/providers");
  assert(Array.isArray(data), "/v1/providers data is not an array");
  assert(data.length > 1000, `/v1/providers returned ${data.length} providers; expected more than 1000`);
  assert(
    data.some((entry) => isRecord(entry) && entry.service === "slack"),
    "/v1/providers does not include slack",
  );
}

/**
 * With OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS the schemas are read from the embedded catalog file when the action is
 * requested, so one action detail proves that on-demand read; slack is already known to be in /v1/providers.
 */
async function checkActionSchema(baseUrl: string): Promise<void> {
  const actionId = "slack.add_reaction";
  const data = await fetchEnvelopeData(baseUrl, `/v1/actions/${actionId}`);
  assert(isRecord(data), `/v1/actions/${actionId} data is not an object`);
  assert(isRecord(data.inputSchema), `/v1/actions/${actionId} inputSchema is not an object`);
  assert(Object.keys(data.inputSchema).length > 0, `/v1/actions/${actionId} inputSchema is empty`);
}

/**
 * In lazy catalog mode the server reads the embedded catalog index (scripts/build-binary.ts embeds
 * catalog/apps-index.json under its basename) instead of every provider file and reports that in its "catalog
 * loaded" line. The line is what proves the embed name and the resolver name in src/server/server-assets.ts still
 * agree inside a real binary; a missing index only warns and falls back, so /health alone would not catch it.
 */
function checkCatalogIndexUsed(server: ServerProcess): void {
  assert(
    server.stdout.includes('"catalogIndex":true'),
    'server log has no "catalogIndex":true line; lazy catalog mode did not use the embedded catalog index',
  );
}

async function checkApps(baseUrl: string): Promise<void> {
  const data = await fetchEnvelopeData(baseUrl, "/v1/apps");
  assert(Array.isArray(data), "/v1/apps data is not an array");
}

/**
 * Provider executors are separate chunks inside the executable (scripts/build-binary.ts builds with code splitting),
 * so the catalog checks above prove nothing about them. quickchart.build_chart_url is a no_auth action whose executor
 * assembles the URL locally, so one call imports and runs a provider chunk with no credential, no network egress and a
 * fixed answer. A chunk that fails to import surfaces as a 500 internal_error envelope (ActionRunner), never as 200.
 * The URL is checked structurally rather than as a literal so the provider's own serialization details stay its own.
 */
async function checkProviderExecutor(baseUrl: string): Promise<void> {
  const actionId = "quickchart.build_chart_url";
  const chart = { type: "bar" };
  const data = await fetchEnvelopeData(baseUrl, `/v1/actions/${actionId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { chart } }),
  });
  assert(isRecord(data), `POST /v1/actions/${actionId} data is not an object`);
  assert(typeof data.url === "string", `POST /v1/actions/${actionId} url is ${JSON.stringify(data.url)}`);
  const url = new URL(data.url);
  assert.equal(`${url.origin}${url.pathname}`, "https://quickchart.io/chart", `POST /v1/actions/${actionId} url`);
  const chartParameter = url.searchParams.get("chart");
  assert(chartParameter !== null, `POST /v1/actions/${actionId} url has no chart parameter: ${data.url}`);
  assert.deepEqual(JSON.parse(chartParameter), chart, `POST /v1/actions/${actionId} chart parameter`);
}

/**
 * The MCP module (@modelcontextprotocol/server and zod) is imported on the first /mcp request rather than at
 * startup, so /health proves nothing about it. One stateless initialize round trip imports and evaluates that chunk
 * inside the binary; the body is matched as text because the transport may frame the JSON-RPC result as SSE.
 * GET /mcp/tools then reads the tool summaries from the same module.
 */
async function checkMcp(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
    }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const body = await response.text();
  assert(response.status === 200, `POST /mcp initialize returned ${response.status}: ${body.slice(0, 300)}`);
  assert(
    body.includes('"name":"oomol-connect"'),
    `POST /mcp initialize body has no server info: ${body.slice(0, 300)}`,
  );

  const toolsResponse = await fetch(`${baseUrl}/mcp/tools`, { signal: AbortSignal.timeout(requestTimeoutMs) });
  const toolsBody = await toolsResponse.text();
  assert(toolsResponse.status === 200, `GET /mcp/tools returned ${toolsResponse.status}: ${toolsBody.slice(0, 300)}`);
  const payload: unknown = JSON.parse(toolsBody);
  assert(isRecord(payload) && Array.isArray(payload.tools), "GET /mcp/tools did not return a tools array");
  const tools: unknown[] = payload.tools;
  assert(tools.length > 0, "GET /mcp/tools returned an empty tools array");
  const names = tools.map((tool) => (isRecord(tool) && typeof tool.name === "string" ? tool.name : undefined));
  const unnamed = names.indexOf(undefined);
  assert(unnamed === -1, `GET /mcp/tools entry ${unnamed} has no string name: ${toolsBody.slice(0, 300)}`);
  // src/mcp.ts registers more tools than these; only the two that cannot go away are pinned, so adding an MCP tool
  // later does not break the release smoke.
  for (const expected of ["search_actions", "execute_action"]) {
    assert(names.includes(expected), `GET /mcp/tools does not list ${expected}: ${names.join(", ")}`);
  }
}

/** The Scalar API reference package is imported on the first /docs request; one page render proves that chunk. */
async function checkDocs(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/docs`, { signal: AbortSignal.timeout(requestTimeoutMs) });
  const body = await response.text();
  assert(response.status === 200, `GET /docs returned ${response.status}: ${body.slice(0, 300)}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.startsWith("text/html"), `GET /docs content-type is ${contentType || "missing"}`);
  assert(body.includes("OOMOL Connect API Reference"), "GET /docs body does not contain the API reference title");
}

/** Return `data` of a `{ success: true, data }` envelope. */
async function fetchEnvelopeData(baseUrl: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const method = init.method ?? "GET";
  const response = await fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
  const body = await response.text();
  // The body excerpt is what makes a failed provider chunk import (a 500 internal_error envelope) diagnosable.
  assert(response.status === 200, `${method} ${path} returned ${response.status}: ${body.slice(0, 300)}`);
  const payload: unknown = JSON.parse(body);
  assert(isRecord(payload), `${method} ${path} did not return a JSON object`);
  assert(payload.success === true, `${method} ${path} envelope success is ${JSON.stringify(payload.success)}`);
  return payload.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function checkDatabaseBackend(
  server: ServerProcess,
  dataDir: string,
  databaseUrl: string | undefined,
): Promise<void> {
  if (databaseUrl) {
    assert(server.stdout.includes('"backend":"postgresql"'), 'server log has no "backend":"postgresql" line');
    return;
  }

  try {
    await access(join(dataDir, "connect.sqlite"));
  } catch {
    throw new Error(`connect.sqlite was not created in ${dataDir}`);
  }
}

/**
 * A second instance on a port that is already in use must exit instead of hanging. src/server/index.ts finishes
 * evaluating once the server listens; with a top-level await spanning the server's lifetime, Bun printed the listen
 * failure and then waited forever on that promise, so the binary hung on EADDRINUSE while Node exited with code 1.
 * The first server is still listening here, and the second one only reaches the conflict after a full startup of its
 * own, which is why the wait is sized like a startup rather than a shutdown.
 */
async function checkPortConflictExit(binaryPath: string, port: number, databaseUrl: string | undefined): Promise<void> {
  const conflictDataDir = await mkdtemp(join(tmpdir(), "open-connector-smoke-conflict-"));
  const second = new ServerProcess({ binaryPath, dataDir: conflictDataDir, port, databaseUrl });
  try {
    const exit = await second.waitForExit(healthTimeoutMs);
    if (!exit) {
      throw new Error(
        `second instance did not exit within ${healthTimeoutMs} ms on a port conflict\n--- second instance stderr ---\n${second.stderr}`,
      );
    }

    // A spawn failure also reports code null, so requiring exactly 1 still excludes it. The documented contract is
    // exit code 1: Bun's and Node's unhandled 'error' event both end the process with 1, verified on macOS, Linux and
    // Windows, so any other code means the listen failure was not what ended the process.
    assert(
      exit.signal === null && exit.code === 1,
      `second instance on a busy port ended with ${second.describeExit()}; expected exit code 1`,
    );
    // Bun prints "Failed to start server. Is port N in use?" on every platform, Windows included, and Node "listen
    // EADDRINUSE"; without this, a crash for an unrelated reason would pass as the port conflict exit.
    const stderr = second.stderr.trim();
    assert(
      /EADDRINUSE|in use/i.test(stderr),
      `second instance on a busy port exited with code ${exit.code} but its stderr does not mention the port conflict\n--- second instance stderr ---\n${stderr.slice(0, 1000) || "(empty)"}`,
    );
    console.log(`port conflict: second instance exited with code ${exit.code}`);
  } finally {
    await second.forceStop();
    await removeDataDir(conflictDataDir);
  }
}

async function checkGracefulShutdown(server: ServerProcess): Promise<void> {
  server.kill("SIGTERM");
  const exit = await server.waitForExit(shutdownTimeoutMs);
  if (!exit) {
    await server.forceStop();
    throw new Error(`server did not exit within ${shutdownTimeoutMs} ms after SIGTERM`);
  }
  if (exit.code === 0) {
    return;
  }
  // Node's kill() is TerminateProcess on Windows: the SIGTERM handler never runs, so graceful shutdown is not
  // exercised there and the forced termination is the expected outcome.
  if (process.platform === "win32" && exit.code === null && exit.signal === "SIGTERM") {
    return;
  }

  throw new Error(`server exited with ${server.describeExit()} after SIGTERM; expected exit code 0`);
}

/** Windows can report EBUSY for a short while after the process exits; retry instead of failing. */
function removeDataDir(directory: string): Promise<void> {
  return rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function printServerLogs(server: ServerProcess): void {
  console.error(`server ${server.describeExit()}`);
  console.error("--- server stdout ---");
  console.error(server.stdout);
  console.error("--- server stderr ---");
  console.error(server.stderr);
}

function formatMs(value: number): string {
  return `${Math.round(value)}ms`;
}
