import type { CredentialValidationResult } from "../../core/types.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

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

export const komariActionHandlers: Record<string, KomariActionHandler> = {
  async get_version(_input, context) {
    return normalizeVersion(await requestKomariRpc("public:getVersion", {}, context, "execute"));
  },
  async list_nodes(_input, context) {
    const result = await requestKomariRpc("public:getNodesInformation", {}, context, "execute");
    return { nodes: requiredRecordArray(result, "node list").map(safeNode) };
  },
  async get_recent_metrics(input, context) {
    const uuid = requiredInputString(input.uuid, "uuid");
    return {
      records: requiredRecordArray(
        await requestKomariRpc("public:getClientRecentRecords", { uuid }, context, "execute"),
        "recent metrics",
      ),
    };
  },
  async get_load_history(input, context) {
    const uuid = requiredInputString(input.uuid, "uuid");
    const loadType = optionalString(input.loadType) ?? "all";
    const hours = optionalPositiveInteger(input.hours, "hours") ?? 4;
    const result = requiredResultRecord(
      await requestKomariRpc(
        "public:getRecordsByUUID",
        { uuid, load_type: loadType, hours: String(hours) },
        context,
        "execute",
      ),
      "load history",
    );
    return {
      count: numberOrZero(result.count),
      records: arrayOfRecords(result.records),
      loadType: optionalString(result.load_type) ?? (loadType === "all" ? null : loadType),
      ...(typeof result.has_gpu_data === "boolean" ? { hasGpuData: result.has_gpu_data } : {}),
      ...(optionalRecord(result.gpu_devices) ? { gpuDevices: result.gpu_devices } : {}),
    };
  },
  async list_ping_tasks(_input, context) {
    return {
      tasks: requiredRecordArray(
        await requestKomariRpc("public:getPublicPingTasks", {}, context, "execute"),
        "ping task list",
      ),
    };
  },
  async get_node_ping_history(input, context) {
    return executePingHistory(
      {
        uuid: requiredInputString(input.uuid, "uuid"),
        hours: String(optionalPositiveInteger(input.hours, "hours") ?? 4),
      },
      context,
    );
  },
  async get_task_ping_history(input, context) {
    return executePingHistory(
      {
        task_id: String(requiredPositiveInteger(input.taskId, "taskId")),
        hours: String(optionalPositiveInteger(input.hours, "hours") ?? 4),
      },
      context,
    );
  },
};

export function createKomariContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): KomariActionContext {
  return {
    apiKey,
    baseUrl: normalizeKomariBaseUrl(values.baseUrl),
    fetcher,
    signal,
  };
}

export async function validateKomariCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createKomariContext(values, apiKey, fetcher, signal);
  const version = normalizeVersion(await requestKomariRpc("public:getVersion", {}, context, "validate"));
  await requestKomariRpc("admin:getDatabaseSize", {}, context, "validate");
  const host = new URL(context.baseUrl).host;
  return {
    profile: {
      accountId: `komari:${host}`,
      displayName: `Komari ${host}`,
    },
    grantedScopes: [],
    metadata: {
      baseUrl: context.baseUrl,
      version: version.version,
      rpcPath: `/${rpcPath}`,
    },
  };
}

/** Normalize a Komari instance URL while preserving a reverse-proxy base path. */
export function normalizeKomariBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
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

async function executePingHistory(params: Record<string, string>, context: KomariActionContext): Promise<unknown> {
  const result = requiredResultRecord(
    await requestKomariRpc("public:getPingRecords", params, context, "execute"),
    "ping history",
  );
  return {
    count: numberOrZero(result.count),
    records: arrayOfRecords(result.records),
    basicInfo: arrayOfRecords(result.basic_info),
    tasks: arrayOfRecords(result.tasks),
  };
}

async function requestKomariRpc(
  method: string,
  params: Record<string, unknown>,
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
      const status = authFailure ? (phase === "validate" ? 400 : 401) : rpcError.code === -32602 ? 400 : 502;
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
  const safeFields = [
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
  ] as const;
  return Object.fromEntries(safeFields.flatMap((field) => (value[field] === undefined ? [] : [[field, value[field]]])));
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

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredPositiveInteger(value, fieldName);
}

function requiredPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
