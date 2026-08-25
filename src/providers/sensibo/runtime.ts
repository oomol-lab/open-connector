import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "sensibo";
const sensiboApiBaseUrl = "https://home.sensibo.com/api/v2";
const sensiboValidationPath = "/users/me/pods";
const sensiboTimeoutMs = 30_000;
const defaultDeviceFields = "id,name,room,measurements,acState,connectionStatus,productModel";

type SensiboPhase = "validate" | "execute";
type SensiboActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const sensiboActionHandlers: ProviderActionHandlers<"sensibo", SensiboActionHandler> = {
  async list_devices(input, context) {
    const payload = await requestSensiboJson({
      apiKey: context.apiKey,
      path: sensiboValidationPath,
      query: {
        fields: optionalString(input.fields) ?? defaultDeviceFields,
      },
      context,
      method: "GET",
      phase: "execute",
    });

    return {
      devices: normalizeObjectArray(readSensiboResult(payload, "device list")),
    };
  },
  async get_device(input, context) {
    const deviceId = readInputString(input.device_id, "device_id");
    const payload = await requestSensiboJson({
      apiKey: context.apiKey,
      path: `/pods/${encodeURIComponent(deviceId)}`,
      query: {
        fields: optionalString(input.fields) ?? defaultDeviceFields,
      },
      context,
      method: "GET",
      phase: "execute",
    });

    return {
      device: requireRecord(readSensiboResult(payload, "device details"), "Sensibo device"),
    };
  },
  async get_ac_states(input, context) {
    const deviceId = readInputString(input.device_id, "device_id");
    const limit = optionalInteger(input.limit);
    const payload = await requestSensiboJson({
      apiKey: context.apiKey,
      path: `/pods/${encodeURIComponent(deviceId)}/acStates`,
      query: {
        limit: limit == null ? undefined : String(limit),
      },
      context,
      method: "GET",
      phase: "execute",
    });

    return {
      states: normalizeObjectArray(readSensiboResult(payload, "ac state history")),
    };
  },
  async set_ac_state(input, context) {
    const deviceId = readInputString(input.device_id, "device_id");
    const acState = requireRecord(input.acState, "Sensibo acState");

    await requestSensiboJson({
      apiKey: context.apiKey,
      path: `/pods/${encodeURIComponent(deviceId)}/acStates`,
      context,
      method: "POST",
      body: {
        acState,
      },
      phase: "execute",
    });

    return {
      success: true,
    };
  },
};

export async function validateSensiboCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSensiboJson({
    apiKey,
    path: sensiboValidationPath,
    query: {
      fields: "id,name",
    },
    context: {
      fetcher,
      signal,
    },
    method: "GET",
    phase: "validate",
  });

  const devices = normalizeObjectArray(readSensiboResult(payload, "device list"));
  const firstDevice = devices[0];

  return {
    profile: {
      accountId: "sensibo",
      displayName: "Sensibo API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: sensiboApiBaseUrl,
      validationEndpoint: sensiboValidationPath,
      firstDeviceId: optionalString(firstDevice?.id),
      firstDeviceName: optionalString(firstDevice?.name),
    }),
  };
}

async function requestSensiboJson(input: {
  apiKey: string;
  path: string;
  query?: Record<string, string | undefined>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  phase: SensiboPhase;
}): Promise<unknown> {
  const url = buildSensiboUrl(input.path, input.apiKey, input.query);
  const timeout = createProviderTimeout(input.context.signal, sensiboTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: buildSensiboHeaders(input.method),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readSensiboPayload(response);
    if (!response.ok) {
      throw createSensiboError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Sensibo request timed out.");
    }
    if (error instanceof SyntaxError) {
      throw new ProviderRequestError(502, "Sensibo returned invalid JSON.");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Sensibo request failed: ${error.message}` : "Sensibo request failed.",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSensiboUrl(path: string, apiKey: string, query?: Record<string, string | undefined>): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${sensiboApiBaseUrl}/`);
  url.searchParams.set("apiKey", apiKey);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function buildSensiboHeaders(method: "GET" | "POST"): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "accept-encoding": "gzip",
    "content-type": method === "POST" ? "application/json" : undefined,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

async function readSensiboPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  return JSON.parse(text) as unknown;
}

function createSensiboError(response: Response, payload: unknown, phase: SensiboPhase): ProviderRequestError {
  const message =
    extractSensiboErrorMessage(payload) ??
    (phase === "validate" ? "Sensibo credential validation failed." : "Sensibo request failed.");

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractSensiboErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(optionalRecord(record.status)?.message)
  );
}

function readSensiboResult(payload: unknown, label: string): unknown {
  const record = requireRecord(payload, `Sensibo ${label} response`);
  const result = record.result;
  if (result === undefined) {
    throw new ProviderRequestError(502, `Sensibo ${label} response is missing result`, payload);
  }
  return result;
}

function readInputString(value: unknown, key: string): string {
  return requiredString(value, key, (message) => new ProviderRequestError(400, message));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return record;
}

function normalizeObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Sensibo result must be an array", value);
  }

  return value.map((item) => requireRecord(item, "Sensibo result item"));
}

export const sensiboExecutors: ProviderExecutors = defineApiKeyProviderExecutors(service, sensiboActionHandlers);
