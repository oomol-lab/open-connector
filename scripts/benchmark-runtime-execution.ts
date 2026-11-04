/** Run with `node scripts/benchmark-runtime-execution.ts`; timings are not CI assertions. */
import type { ExecutionTimings } from "../src/core/execution-timing.ts";
import type { ActionDefinition, ActionExecutor, ProviderDefinition, RuntimeLogger } from "../src/core/types.ts";

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { createCatalogStore } from "../src/catalog-store.ts";
import { createProviderFetch } from "../src/providers/provider-runtime.ts";
import { createConnectApp } from "../src/server/connect-app.ts";
import { AesGcmSecretCodec } from "../src/server/secrets/secret-codec.ts";
import { RuntimeTokenService } from "../src/server/storage/runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "../src/server/storage/sqlite/runtime-store.ts";

interface BenchmarkInput {
  outcome: "success" | "failure";
}

type Scenario = "success" | "failure" | "invalid_input" | "cancelled" | "unauthorized";

const iterations = 200;
const warmup = 20;
const connectionCount = 1000;
const upstreamDelayMs = 2;
const origin = "https://connector-benchmark.example";
const action: ActionDefinition = {
  id: "benchmark.request",
  service: "benchmark",
  name: "request",
  description: "Exercise the runtime with a simulated upstream.",
  operationType: "read",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: {
    type: "object",
    required: ["outcome"],
    properties: { outcome: { enum: ["success", "failure"] } },
    additionalProperties: false,
  },
  outputSchema: { type: "object" },
};
const provider: ProviderDefinition = {
  service: "benchmark",
  displayName: "Benchmark",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [{ type: "api_key" }],
  actions: [action],
};

async function benchmark(directory: string, scenario: Scenario, concurrency: number): Promise<void> {
  const calls: Record<string, number> = {
    tokenExistence: 0,
    tokenLookup: 0,
    tokenLastUseWrite: 0,
    connectionRead: 0,
    credentialDecode: 0,
    policyRead: 0,
    auditAdd: 0,
    executorLoad: 0,
    upstream: 0,
  };
  const baseCodec = new AesGcmSecretCodec("benchmark-only-key");
  const secretCodec = {
    encrypted: true,
    encode: baseCodec.encode.bind(baseCodec),
    decode(value: string): Promise<string> {
      calls.credentialDecode++;
      return baseCodec.decode(value);
    },
  };
  const database = new SqliteRuntimeDatabase(join(directory, `${scenario}-${concurrency}.sqlite`), { secretCodec });
  try {
    const credential = {
      authType: "api_key" as const,
      apiKey: "benchmark-only-secret",
      values: {},
      profile: { accountId: "benchmark", displayName: "Benchmark", grantedScopes: [] },
      metadata: {},
    };
    const selected = await database.connectionStore.set(provider.service, "default", credential);
    await Promise.all(
      Array.from({ length: connectionCount - 1 }, (_, index) =>
        database.connectionStore.set(provider.service, `account-${index}`, credential),
      ),
    );
    const token = await new RuntimeTokenService(database.runtimeTokenStore).createToken("benchmark", {
      allowedActions: [action.id],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [selected.id],
    });
    const hasAny = database.runtimeTokenStore.hasAny.bind(database.runtimeTokenStore);
    database.runtimeTokenStore.hasAny = async () => {
      calls.tokenExistence++;
      return hasAny();
    };
    const findByHash = database.runtimeTokenStore.findByHash.bind(database.runtimeTokenStore);
    database.runtimeTokenStore.findByHash = async (hash) => {
      calls.tokenLookup++;
      return findByHash(hash);
    };
    const markUsed = database.runtimeTokenStore.markUsed.bind(database.runtimeTokenStore);
    database.runtimeTokenStore.markUsed = async (id, at) => {
      calls.tokenLastUseWrite++;
      return markUsed(id, at);
    };
    const getById = database.connectionStore.getById.bind(database.connectionStore);
    database.connectionStore.getById = async (id) => {
      calls.connectionRead++;
      return getById(id);
    };
    const getPolicy = database.runtimePolicyStore.get.bind(database.runtimePolicyStore);
    database.runtimePolicyStore.get = async () => {
      calls.policyRead++;
      return getPolicy();
    };
    const addAudit = database.runLogStore.add.bind(database.runLogStore);
    database.runLogStore.add = async (run) => {
      calls.auditAdd++;
      return addAudit(run);
    };

    const samples: ExecutionTimings[] = [];
    const logger: RuntimeLogger = {
      info(fields, message) {
        if (message === "runtime request completed") samples.push(fields.timings as ExecutionTimings);
      },
      warn() {},
      error() {},
    };
    const upstream = Object.assign(
      async (...[url, init]: Parameters<typeof fetch>): Promise<Response> => {
        assert([`${origin}/success`, `${origin}/failure`].includes(String(url)));
        calls.upstream++;
        await setTimeout(upstreamDelayMs, undefined, { signal: init?.signal ?? undefined });
        return Response.json({ value: "fixture" }, { status: String(url).endsWith("/failure") ? 503 : 200 });
      },
      {
        preconnect() {
          throw new Error("Unexpected transport warm-up.");
        },
      },
    );
    const fetcher = createProviderFetch({
      skipDnsValidation: true,
      fetch: upstream,
    });
    const executor: ActionExecutor = async (input, context) => {
      const resolved = await context.getCredential(provider.service);
      assert.equal(resolved?.authType, "api_key");
      const response = await fetcher(`${origin}/${(input as BenchmarkInput).outcome}`, { signal: context.signal });
      return response.ok
        ? { ok: true, output: await response.json() }
        : { ok: false, error: { code: "provider_error", message: "Simulated upstream failure." } };
    };
    const unexpectedFileOperation = async (): Promise<never> => {
      throw new Error("Unexpected file operation.");
    };
    const { app } = await createConnectApp({
      catalog: createCatalogStore([provider], { executableActionIds: [action.id] }),
      providerLoader: {
        loadActionExecutor: async () => {
          calls.executorLoad++;
          return executor;
        },
        loadProxyExecutor: async () => undefined,
        loadCredentialValidators: async () => undefined,
      },
      runtimeDatabase: database,
      transitFiles: {
        maxBytes: 1024,
        create: unexpectedFileOperation,
        read: unexpectedFileOperation,
        delete: unexpectedFileOperation,
        response: unexpectedFileOperation,
        cleanupExpired: unexpectedFileOperation,
      },
      secretCodec,
      publicOrigin: origin,
      requireRuntimeAuth: true,
      logger,
    });
    const expectedStatus = { success: 200, failure: 500, invalid_input: 400, cancelled: 400, unauthorized: 401 }[
      scenario
    ];
    const run = async (count: number): Promise<number[]> => {
      let next = 0;
      const workers = await Promise.all(
        Array.from({ length: Math.min(concurrency, count) }, async () => {
          const durations: number[] = [];
          while (next < count) {
            next++;
            const controller = new AbortController();
            if (scenario === "cancelled") controller.abort();
            const request = new Request(`${origin}/v1/actions/${action.id}`, {
              method: "POST",
              headers: {
                authorization: `Bearer ${scenario === "unauthorized" ? "oct_invalid" : token.token}`,
                "content-type": "application/json",
                "x-oo-connector-app-id": selected.id,
              },
              body: JSON.stringify({
                input: scenario === "invalid_input" ? {} : { outcome: scenario === "failure" ? "failure" : "success" },
              }),
              signal: controller.signal,
            });
            const startedAt = performance.now();
            const response = await app.fetch(request);
            assert.equal(response.status, expectedStatus);
            await response.arrayBuffer();
            durations.push(performance.now() - startedAt);
          }
          return durations;
        }),
      );
      return workers.flat();
    };
    await run(warmup);
    const before = { ...calls };
    samples.length = 0;
    const durations = (await run(iterations)).sort((left, right) => left - right);
    assert.equal(samples.length, iterations);
    const measuredCalls = Object.fromEntries(
      Object.entries(calls).map(([name, value]) => [name, value - before[name]!]),
    );
    assert.equal(measuredCalls.tokenExistence, 0);
    assert.equal(measuredCalls.upstream, scenario === "success" || scenario === "failure" ? iterations : 0);
    assert.equal(measuredCalls.connectionRead, measuredCalls.upstream * 2);
    assert.equal(measuredCalls.credentialDecode, measuredCalls.upstream * 2);
    const phaseTotals = samples.reduce((totals, sample) => {
      Object.entries(sample.phases).forEach(([phase, ms]) => totals.set(phase, (totals.get(phase) ?? 0) + ms));
      return totals;
    }, new Map<string, number>());
    const round = (value: number): number => Math.round(value * 1000) / 1000;
    console.log(
      JSON.stringify({
        scenario,
        concurrency,
        iterations,
        warmup,
        connectionCount,
        upstreamDelayMs,
        node: process.version,
        storage: "sqlite-file",
        encrypted: true,
        latencyMs: {
          p50: round(durations[Math.ceil(iterations * 0.5) - 1]!),
          p95: round(durations[Math.ceil(iterations * 0.95) - 1]!),
        },
        handlerMeanMs: round(samples.reduce((total, sample) => total + sample.totalMs, 0) / iterations),
        phaseMeanMs: Object.fromEntries([...phaseTotals].map(([phase, total]) => [phase, round(total / iterations)])),
        calls: measuredCalls,
      }),
    );
  } finally {
    database.close();
  }
}

const directory = await mkdtemp(join(tmpdir(), "connector-execution-benchmark-"));
try {
  for (const concurrency of [1, 10]) {
    for (const scenario of ["success", "failure", "invalid_input", "cancelled", "unauthorized"] as Scenario[]) {
      await benchmark(directory, scenario, concurrency);
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
