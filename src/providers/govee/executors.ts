import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { randomUUID } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "govee";
const goveeApiBaseUrl = "https://openapi.api.govee.com";
const goveeRequestTimeoutMs = 30_000;

type GoveeRequestPhase = "validate" | "execute";

interface GoveeRequestInput {
  path: string;
  method: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: GoveeRequestPhase;
  body?: Record<string, unknown>;
}

const handlers: ProviderActionHandlers<"govee", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_devices(_input, context) {
    const payload = await requestGovee({
      path: "/router/api/v1/user/devices",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      devices: readArrayProperty(payload, "data", "Govee devices response did not include data"),
      raw: readObjectPayload(payload),
    };
  },

  async get_device_state(input, context) {
    const payload = await requestGovee({
      path: "/router/api/v1/device/state",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      body: buildDevicePayload(input),
    });
    return {
      state: readObjectProperty(payload, "payload", "Govee state response did not include payload"),
      raw: readObjectPayload(payload),
    };
  },

  async control_capability(input, context) {
    const payload = await requestGovee({
      path: "/router/api/v1/device/control",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      body: {
        requestId: optionalString(input.requestId) ?? randomUUID(),
        payload: {
          sku: requiredString(input.sku, "sku", providerInputError),
          device: requiredString(input.device, "device", providerInputError),
          capability: {
            type: requiredString(input.type, "type", providerInputError),
            instance: requiredString(input.instance, "instance", providerInputError),
            value: input.value,
          },
        },
      },
    });
    const envelope = readObjectPayload(payload);
    return {
      result: {
        requestId: optionalString(envelope.requestId) ?? null,
        code: readNumericCode(envelope),
        message: readGoveeMessage(envelope) ?? "success",
      },
      raw: envelope,
    };
  },

  async list_light_scenes(input, context) {
    return listScenes("/router/api/v1/device/scenes", input, context);
  },

  async list_diy_scenes(input, context) {
    return listScenes("/router/api/v1/device/diy-scenes", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: goveeApiBaseUrl,
  auth: { type: "api_key_header", name: "Govee-API-Key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestGovee({
      path: "/router/api/v1/user/devices",
      method: "GET",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const devices = readArrayProperty(payload, "data", "Govee devices response did not include data");
    const firstDevice = devices.map(optionalRecord).find((device) => device !== undefined);
    const deviceName = firstDevice ? optionalString(firstDevice.deviceName) : undefined;
    return {
      profile: {
        accountId: "api_key",
        displayName: deviceName ? `Govee: ${deviceName}` : "Govee API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: goveeApiBaseUrl,
        validationEndpoint: "/router/api/v1/user/devices",
        deviceCount: devices.length,
      }),
    };
  },
};

async function listScenes(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestGovee({
    path,
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: buildDevicePayload(input),
  });
  return {
    scenes: readObjectProperty(payload, "payload", "Govee scene response did not include payload"),
    raw: readObjectPayload(payload),
  };
}

function buildDevicePayload(input: Record<string, unknown>): Record<string, unknown> {
  return {
    requestId: randomUUID(),
    payload: {
      sku: requiredString(input.sku, "sku", providerInputError),
      device: requiredString(input.device, "device", providerInputError),
    },
  };
}

async function requestGovee(input: GoveeRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, goveeRequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(`${goveeApiBaseUrl}${input.path}`, {
      method: input.method,
      headers: {
        accept: "application/json",
        "Govee-API-Key": input.apiKey,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    payload = await readGoveePayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Govee request timed out");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Govee request failed: ${error.message}` : "Govee request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createGoveeError(response.status, payload, input.phase);
  }
  const envelope = optionalRecord(payload);
  const code = envelope ? readNumericCode(envelope) : undefined;
  if (code !== undefined && code >= 400) {
    throw createGoveeError(code, payload, input.phase);
  }
  return payload;
}

async function readGoveePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readArrayProperty(payload: unknown, key: string, message: string): unknown[] {
  const value = readObjectPayload(payload)[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function readObjectProperty(payload: unknown, key: string, message: string): Record<string, unknown> {
  const value = optionalRecord(readObjectPayload(payload)[key]);
  if (!value) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function readObjectPayload(payload: unknown): Record<string, unknown> {
  const value = optionalRecord(payload);
  if (!value) {
    throw new ProviderRequestError(502, "Govee response was not an object");
  }
  return value;
}

function readNumericCode(payload: Record<string, unknown>): number {
  return typeof payload.code === "number" && Number.isFinite(payload.code) ? payload.code : 200;
}

function createGoveeError(status: number, payload: unknown, phase: GoveeRequestPhase): ProviderRequestError {
  const message = readGoveeErrorMessage(payload) ?? `Govee request failed with ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readGoveeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  return record ? (readGoveeMessage(record) ?? optionalString(record.error)) : undefined;
}

function readGoveeMessage(payload: Record<string, unknown>): string | undefined {
  return optionalString(payload.message) ?? optionalString(payload.msg);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
