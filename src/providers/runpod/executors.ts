import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "runpod";
const runpodApiBaseUrl = "https://rest.runpod.io/v1";
const runpodValidationPath = "/pods";

type RunpodRequestPhase = "validate" | "execute";
type RunpodQueryValue = string | number | boolean | readonly string[] | undefined;
type RunpodActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface RunpodRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: RunpodRequestPhase;
  method?: string;
  query?: Record<string, RunpodQueryValue>;
  body?: Record<string, unknown>;
  emptySuccess?: unknown;
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}

export const runpodActionHandlers: ProviderActionHandlers<"runpod", RunpodActionHandler> = {
  list_pods(input, context) {
    return listPods(input, context);
  },
  get_pod(input, context) {
    return getPod(input, context);
  },
  start_pod(input, context) {
    return performLifecycleAction(input, context, { action: "start", method: "POST", pathSuffix: "/start" });
  },
  stop_pod(input, context) {
    return performLifecycleAction(input, context, { action: "stop", method: "POST", pathSuffix: "/stop" });
  },
  restart_pod(input, context) {
    return performLifecycleAction(input, context, { action: "restart", method: "POST", pathSuffix: "/restart" });
  },
  reset_pod(input, context) {
    return performLifecycleAction(input, context, { action: "reset", method: "POST", pathSuffix: "/reset" });
  },
  delete_pod(input, context) {
    return performLifecycleAction(input, context, { action: "delete", method: "DELETE", pathSuffix: "" });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, runpodActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const pods = await requestRunpodPods({
      apiKey,
      path: runpodValidationPath,
      fetcher,
      phase: "validate",
      signal,
    });
    const firstPod = pods[0];
    return {
      profile: {
        accountId: "runpod-api-key",
        displayName: "Runpod API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: runpodValidationPath,
        podCount: pods.length,
        firstPodId: optionalString(firstPod?.id),
        firstPodName: optionalString(firstPod?.name),
      }),
    };
  },
};

async function listPods(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const pods = await requestRunpodPods({
    apiKey: context.apiKey,
    path: "/pods",
    query: compactObject({
      computeType: optionalString(input.computeType),
      cpuFlavorId: readOptionalStringArray(input.cpuFlavorId),
      dataCenterId: readOptionalStringArray(input.dataCenterId),
      desiredStatus: optionalString(input.desiredStatus),
      endpointId: optionalString(input.endpointId),
      gpuTypeId: readOptionalStringArray(input.gpuTypeId),
      id: optionalString(input.id),
      imageName: optionalString(input.imageName),
      includeMachine: optionalBoolean(input.includeMachine),
      includeNetworkVolume: optionalBoolean(input.includeNetworkVolume),
      includeSavingsPlans: optionalBoolean(input.includeSavingsPlans),
      includeTemplate: optionalBoolean(input.includeTemplate),
      includeWorkers: optionalBoolean(input.includeWorkers),
      name: optionalString(input.name),
      networkVolumeId: optionalString(input.networkVolumeId),
      templateId: optionalString(input.templateId),
    }),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  return { pods };
}

async function getPod(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const podId = requireInputString(input.podId, "podId");
  const pod = normalizeRunpodPod(
    await requestRunpodJson({
      apiKey: context.apiKey,
      path: `/pods/${encodeURIComponent(podId)}`,
      query: compactObject({
        includeMachine: optionalBoolean(input.includeMachine),
        includeNetworkVolume: optionalBoolean(input.includeNetworkVolume),
        includeSavingsPlans: optionalBoolean(input.includeSavingsPlans),
        includeTemplate: optionalBoolean(input.includeTemplate),
        includeWorkers: optionalBoolean(input.includeWorkers),
      }),
      fetcher: context.fetcher,
      phase: "execute",
      notFoundAsInvalidInput: true,
      signal: context.signal,
    }),
  );
  return { pod };
}

async function performLifecycleAction(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  config: {
    action: "start" | "stop" | "restart" | "reset" | "delete";
    method: "POST" | "DELETE";
    pathSuffix: string;
  },
): Promise<Record<string, unknown>> {
  const podId = requireInputString(input.podId, "podId");
  await requestRunpodJson({
    apiKey: context.apiKey,
    path: `/pods/${encodeURIComponent(podId)}${config.pathSuffix}`,
    method: config.method,
    fetcher: context.fetcher,
    phase: "execute",
    emptySuccess: { podId, action: config.action, success: true },
    notFoundAsInvalidInput: true,
    signal: context.signal,
  });
  return { podId, action: config.action, success: true };
}

async function requestRunpodPods(input: RunpodRequestOptions): Promise<Record<string, unknown>[]> {
  const payload = await requestRunpodJson(input);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Runpod returned a non-array Pods payload");
  }
  return payload.map((pod) => normalizeRunpodPod(pod));
}

async function requestRunpodJson(input: RunpodRequestOptions): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildRunpodUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildRunpodHeaders(input.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    payload = await readRunpodPayload(response, input.emptySuccess);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Runpod request failed: ${error.message}` : "Runpod request failed",
    );
  }
  if (!response.ok) {
    throw createRunpodError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
  }
  return payload;
}

function buildRunpodUrl(path: string, query?: Record<string, RunpodQueryValue>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${runpodApiBaseUrl}${normalizedPath}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildRunpodHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

async function readRunpodPayload(response: Response, emptySuccess: unknown): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return emptySuccess ?? {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return { message: text };
    throw new ProviderRequestError(502, "Runpod returned invalid JSON");
  }
}

function createRunpodError(
  status: number,
  payload: unknown,
  phase: RunpodRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message = readRunpodErrorMessage(payload) ?? `Runpod request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 404 && notFoundAsInvalidInput) return new ProviderRequestError(400, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && (status === 401 || status === 403))
    return new ProviderRequestError(status, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : 400, message, payload);
}

function readRunpodErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload.trim();
  const payloadObject = optionalRecord(payload);
  if (!payloadObject) return undefined;
  const directMessage =
    optionalString(payloadObject.message) ??
    optionalString(payloadObject.error) ??
    optionalString(payloadObject.detail);
  if (directMessage) return directMessage;
  const nestedError = optionalRecord(payloadObject.error);
  return optionalString(nestedError?.message) ?? optionalString(nestedError?.detail);
}

function normalizeRunpodPod(value: unknown): Record<string, unknown> {
  const pod = optionalRecord(value);
  if (!pod) throw new ProviderRequestError(502, "Runpod returned an invalid Pod payload");
  return compactObject({
    id: requireResponseString(pod.id, "id"),
    name: optionalString(pod.name),
    desiredStatus: optionalString(pod.desiredStatus),
    image: optionalString(pod.image),
    machineId: optionalString(pod.machineId),
    endpointId: optionalString(pod.endpointId),
    templateId: optionalString(pod.templateId),
    publicIp: optionalString(pod.publicIp),
    costPerHr: optionalNumber(pod.costPerHr),
    adjustedCostPerHr: optionalNumber(pod.adjustedCostPerHr),
    interruptible: optionalBoolean(pod.interruptible),
    locked: optionalBoolean(pod.locked),
    lastStartedAt: optionalString(pod.lastStartedAt),
    lastStatusChange: optionalString(pod.lastStatusChange),
    cpuFlavorId: optionalString(pod.cpuFlavorId),
    vcpuCount: optionalNumber(pod.vcpuCount),
    memoryInGb: optionalNumber(pod.memoryInGb),
    containerDiskInGb: optionalNumber(pod.containerDiskInGb),
    volumeInGb: optionalNumber(pod.volumeInGb),
    volumeMountPath: optionalString(pod.volumeMountPath),
    ports: normalizeStringArray(pod.ports),
    portMappings: normalizeNumberRecord(pod.portMappings),
    env: normalizeStringRecord(pod.env),
    gpu: optionalRecord(pod.gpu),
    machine: optionalRecord(pod.machine),
    networkVolume: optionalRecord(pod.networkVolume),
    savingsPlans: normalizeObjectArray(pod.savingsPlans),
  });
}

function normalizeStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function normalizeObjectArray(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  const input = optionalRecord(value);
  if (!input) return undefined;
  const normalized = Object.fromEntries(Object.entries(input).filter(([, item]) => typeof item === "string")) as Record<
    string,
    string
  >;
  return Object.keys(normalized).length > 0 ? normalized : {};
}

function normalizeNumberRecord(value: unknown): Record<string, number> | undefined {
  const input = optionalRecord(value);
  if (!input) return undefined;
  const normalized = Object.fromEntries(Object.entries(input).filter(([, item]) => typeof item === "number")) as Record<
    string,
    number
  >;
  return Object.keys(normalized).length > 0 ? normalized : {};
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
}

function requireInputString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new ProviderRequestError(400, `${fieldName} is required`);
  return normalized;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new ProviderRequestError(502, `Runpod response is missing ${fieldName}`);
  return normalized;
}
