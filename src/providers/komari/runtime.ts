import type { CredentialValidationResult } from "../../core/types.ts";
import type { KomariOperation } from "./operations.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { komariOperations } from "./operations.ts";

type KomariRequestPhase = "validate" | "execute";
type KomariActionHandler = (input: Record<string, unknown>, context: KomariActionContext) => Promise<unknown>;

interface KomariRpcError {
  code: number;
  message: string;
}

export interface KomariActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const defaultRequestTimeoutMs = 30_000;
const maxResponseBytes = 10 * 1024 * 1024;
const rpcPath = "api/rpc2";
const rpcErrorStatusByCode = new Map<number, number>([
  [-32602, 400],
  [-32010, 409],
  [-32011, 504],
  [-32021, 409],
  [-32022, 400],
  [-32040, 401],
  [-32041, 403],
  [-32044, 404],
  [-32045, 409],
  [-32050, 501],
  [-32051, 503],
]);
const safeNodeFields = [
  "uuid",
  "name",
  "cpu_name",
  "virtualization",
  "arch",
  "cpu_cores",
  "cpu_physical_cores",
  "os",
  "kernel_version",
  "gpu_name",
  "region",
  "public_remark",
  "mem_total",
  "swap_total",
  "disk_total",
  "weight",
  "group",
  "tags",
  "hidden",
  "traffic_limit",
  "traffic_limit_type",
  "created_at",
  "updated_at",
];
const safeAdminNodeFields = [
  ...safeNodeFields,
  "ipv4",
  "ipv6",
  "remark",
  "version",
  "price",
  "billing_cycle",
  "auto_renewal",
  "currency",
  "expired_at",
];

export const komariActionHandlers: Record<string, KomariActionHandler> = Object.fromEntries(
  komariOperations.map((operation) => [
    operation.name,
    (input: Record<string, unknown>, context: KomariActionContext) => executeKomariOperation(operation, input, context),
  ]),
);

export function createKomariContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  allowPrivateNetwork: boolean,
  signal?: AbortSignal,
): KomariActionContext {
  return {
    apiKey,
    baseUrl: normalizeKomariBaseUrl(values.baseUrl, allowPrivateNetwork),
    fetcher,
    signal,
  };
}

export async function validateKomariCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  allowPrivateNetwork: boolean,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createKomariContext(values, apiKey, fetcher, allowPrivateNetwork, signal);
  const version = normalizeVersion(await requestKomariRpc("public:getVersion", {}, context, "validate"));
  await requestKomariRpc("admin:getDatabaseSize", {}, context, "validate");
  const host = new URL(context.baseUrl).host;
  return {
    profile: {
      accountId: `komari:${host}`,
      displayName: `Komari ${host}`,
    },
    grantedScopes: komariOperations.map((operation) => operation.rpcMethod),
    metadata: {
      baseUrl: context.baseUrl,
      version: version.version,
      rpcPath: `/${rpcPath}`,
    },
  };
}

/** Normalize a Komari instance URL while preserving a reverse-proxy base path. */
export function normalizeKomariBaseUrl(value: unknown, allowPrivateNetwork: boolean): string {
  const instanceUrl = requiredString(value, "baseUrl", credentialError);
  const url = assertPublicHttpUrl(instanceUrl, {
    fieldName: "baseUrl",
    createError: credentialError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) {
    throw credentialError("baseUrl must not include credentials");
  }
  url.hash = "";
  url.search = "";
  let path = url.pathname.replace(/\/+$/u, "");
  if (path.endsWith("/api/rpc2")) {
    path = path.slice(0, -"/api/rpc2".length);
  } else if (path.endsWith("/api")) {
    path = path.slice(0, -"/api".length);
  }
  url.pathname = path || "/";
  return url.toString().replace(/\/$/u, "");
}

async function executeKomariOperation(
  operation: KomariOperation,
  input: Record<string, unknown>,
  context: KomariActionContext,
): Promise<unknown> {
  if (operation.name === "delete_session") {
    return deleteSessionByStableId(input, context);
  }
  const result = await requestKomariRpc(
    operation.rpcMethod,
    prepareOperationParams(operation, input),
    context,
    "execute",
  );
  if (operation.resultMode === "success") {
    return { success: true };
  }
  if (operation.resultMode === "safe_node") {
    const node = safeNode(requiredResultRecord(result, "client"));
    return operation.resultKey ? { [operation.resultKey]: node } : node;
  }
  if (operation.resultMode === "safe_nodes") {
    const nodes = requiredRecordArray(result, "node list").map(safeNode);
    return { [operation.resultKey ?? "nodes"]: nodes };
  }
  if (operation.resultMode === "safe_admin_node") {
    const node = safeAdminNode(requiredResultRecord(result, "client"));
    return operation.resultKey ? { [operation.resultKey]: node } : node;
  }
  if (operation.resultMode === "safe_admin_nodes") {
    const nodes = requiredRecordArray(result, "client list").map(safeAdminNode);
    return { [operation.resultKey ?? "clients"]: nodes };
  }
  if (operation.resultMode === "safe_sessions") {
    return normalizeSessions(result);
  }
  if (operation.resultMode === "load_history") {
    return normalizeLoadHistory(result, input);
  }
  if (operation.resultMode === "ping_history") {
    return normalizePingHistory(result);
  }
  if (operation.name === "get_version") {
    return normalizeVersion(result);
  }
  return operation.resultKey ? { [operation.resultKey]: result } : result;
}

const safeSessionFields = ["uuid", "login_method", "latest_online", "expires", "created_at"] as const;

async function normalizeSessions(value: unknown): Promise<unknown> {
  const result = requiredResultRecord(value, "session list");
  const currentToken = optionalString(result.current);
  const sessions = requiredRecordArray(result.data, "session list");
  const normalized = await Promise.all(
    sessions.map(async (session) => {
      const token = requiredString(session.session, "session token", invalidUpstreamResponse);
      const summary: Record<string, unknown> = {
        session_id: await stableSessionId(token),
        current: token === currentToken,
      };
      for (const field of safeSessionFields) {
        if (session[field] !== undefined) {
          summary[field] = session[field];
        }
      }
      return summary;
    }),
  );
  return {
    current_session_id: currentToken ? await stableSessionId(currentToken) : null,
    sessions: normalized,
  };
}

async function deleteSessionByStableId(
  input: Record<string, unknown>,
  context: KomariActionContext,
): Promise<{ success: true }> {
  const sessionId = requiredString(input.session_id, "session_id", (message) => new ProviderRequestError(400, message));
  const result = requiredResultRecord(
    await requestKomariRpc("admin:getSessions", {}, context, "execute"),
    "session list",
  );
  const sessions = requiredRecordArray(result.data, "session list");
  let token: string | undefined;
  for (const session of sessions) {
    const candidate = requiredString(session.session, "session token", invalidUpstreamResponse);
    if ((await stableSessionId(candidate)) === sessionId) {
      token = candidate;
      break;
    }
  }
  if (!token) {
    throw new ProviderRequestError(404, "Komari session was not found");
  }
  await requestKomariRpc("admin:deleteSession", { session: token }, context, "execute");
  return { success: true };
}

async function stableSessionId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invalidUpstreamResponse(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Invalid Komari ${message}`);
}

function prepareOperationParams(operation: KomariOperation, input: Record<string, unknown>): unknown {
  if (operation.paramsArrayField) {
    return input[operation.paramsArrayField];
  }
  const params = { ...input };
  for (const field of operation.stringifyFields ?? []) {
    if (params[field] !== undefined) {
      params[field] = String(params[field]);
    }
  }
  return params;
}

interface KomariLoadHistory {
  count: number;
  records: Array<Record<string, unknown>>;
  load_type?: string | null;
  has_gpu_data?: boolean;
  gpu_devices?: Record<string, unknown>;
}

function normalizeLoadHistory(value: unknown, input: Record<string, unknown>): KomariLoadHistory {
  const result = requiredResultRecord(value, "load history");
  const normalized: KomariLoadHistory = {
    count: numberOrZero(result.count),
    records: arrayOfRecords(result.records),
  };
  const loadType = optionalString(result.load_type) ?? optionalString(input.load_type);
  if (loadType) {
    normalized.load_type = loadType;
  }
  if (typeof result.has_gpu_data === "boolean") {
    normalized.has_gpu_data = result.has_gpu_data;
  }
  const gpuDevices = optionalRecord(result.gpu_devices);
  if (gpuDevices) {
    normalized.gpu_devices = gpuDevices;
  }
  return normalized;
}

function normalizePingHistory(value: unknown): unknown {
  const result = requiredResultRecord(value, "ping history");
  return {
    count: numberOrZero(result.count),
    records: arrayOfRecords(result.records),
    basic_info: arrayOfRecords(result.basic_info),
    tasks: arrayOfRecords(result.tasks),
  };
}

async function requestKomariRpc(
  method: string,
  params: unknown,
  context: KomariActionContext,
  phase: KomariRequestPhase,
): Promise<unknown> {
  const url = new URL(rpcPath, `${context.baseUrl}/`);
  const timeout = createProviderTimeout(context.signal, defaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: timeout.signal,
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        rpcErrorMessage(payload) ?? `Komari returned HTTP ${response.status}`,
      );
    }
    const envelope = requiredResultRecord(payload, "JSON-RPC response");
    const rpcError = parseRpcError(envelope.error);
    if (rpcError) {
      const authFailure = rpcError.code === -32040 || rpcError.code === -32041;
      const status = authFailure && phase === "validate" ? 400 : (rpcErrorStatusByCode.get(rpcError.code) ?? 502);
      throw new ProviderRequestError(status, rpcError.message);
    }
    if (!("result" in envelope)) {
      throw new ProviderRequestError(502, "Komari returned a JSON-RPC response without a result");
    }
    return envelope.result;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Komari request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Komari request failed: ${error.message}` : "Komari request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: maxResponseBytes,
    fieldName: "Komari response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Komari returned invalid JSON");
  }
}

function normalizeVersion(value: unknown): { version: string; hash: string | null } {
  const result = requiredResultRecord(value, "version");
  return {
    version: requiredString(result.version, "Komari version", (message) => new ProviderRequestError(502, message)),
    hash: optionalString(result.hash) ?? null,
  };
}

function safeNode(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    safeNodeFields.flatMap((field) => (value[field] === undefined ? [] : [[field, value[field]]])),
  );
}

function safeAdminNode(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    safeAdminNodeFields.flatMap((field) => (value[field] === undefined ? [] : [[field, value[field]]])),
  );
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (optionalRecord(item) ? [item as Record<string, unknown>] : []));
}

function requiredRecordArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Invalid Komari ${fieldName}: expected an array`);
  }
  return value.map((item, index) =>
    requiredRecord(
      item,
      `${fieldName}[${index}]`,
      (message) => new ProviderRequestError(502, `Invalid Komari ${message}`),
    ),
  );
}

function requiredResultRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(502, `Invalid Komari ${message}`));
}

function parseRpcError(value: unknown): KomariRpcError | undefined {
  const error = optionalRecord(value);
  if (!error || typeof error.code !== "number" || typeof error.message !== "string") {
    return undefined;
  }
  return { code: error.code, message: error.message };
}

function rpcErrorMessage(value: unknown): string | undefined {
  const envelope = optionalRecord(value);
  return (
    parseRpcError(envelope?.error)?.message ?? optionalString(envelope?.message) ?? optionalString(envelope?.error)
  );
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
