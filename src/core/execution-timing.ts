import { AsyncLocalStorage } from "node:async_hooks";

type ExecutionPhase =
  | "authMs"
  | "policyMs"
  | "schemaMs"
  | "credentialMs"
  | "oauthRefreshMs"
  | "saasDiscoveryMs"
  | "executorLoadMs"
  | "providerMs"
  | "auditMs";

/** Elapsed work in one request or direct invocation; nested phases may overlap. */
export interface ExecutionTimings {
  requestId: string;
  totalMs: number;
  phases: Partial<Record<ExecutionPhase, number>>;
}

interface TimingScope {
  requestId: string;
  startedAt: number;
  phases: ExecutionTimings["phases"];
}

const scopes = new AsyncLocalStorage<TimingScope>();

/** Nested runners share the request's clock and correlation ID. */
export function withExecutionTimings<T>(work: () => T): T {
  if (scopes.getStore()) return work();
  return scopes.run({ requestId: crypto.randomUUID(), startedAt: performance.now(), phases: {} }, work);
}

/** Snapshot completed phases without allowing later work to mutate a log entry. */
export function getExecutionTimings(): ExecutionTimings | undefined {
  const scope = scopes.getStore();
  return scope
    ? { requestId: scope.requestId, totalMs: performance.now() - scope.startedAt, phases: { ...scope.phases } }
    : undefined;
}

export async function measureExecutionPhase<T>(phase: ExecutionPhase, work: () => Promise<T>): Promise<T> {
  const scope = scopes.getStore();
  if (!scope) return work();
  const startedAt = performance.now();
  try {
    return await work();
  } finally {
    scope.phases[phase] = (scope.phases[phase] ?? 0) + performance.now() - startedAt;
  }
}

export function measureExecutionPhaseSync<T>(phase: ExecutionPhase, work: () => T): T {
  const scope = scopes.getStore();
  if (!scope) return work();
  const startedAt = performance.now();
  try {
    return work();
  } finally {
    scope.phases[phase] = (scope.phases[phase] ?? 0) + performance.now() - startedAt;
  }
}
