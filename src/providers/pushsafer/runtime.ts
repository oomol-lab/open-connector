import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

export const pushsaferApiBaseUrl = "https://www.pushsafer.com";

const pushsaferDefaultRequestTimeoutMs = 30_000;

type PushsaferRequestPhase = "validate" | "execute";

interface PushsaferRequestInput {
  apiKey: string;
  path: string;
  params: URLSearchParams;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: PushsaferRequestPhase;
}

export async function validatePushsaferCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", invalidInput);
  const username = requireNonEmptyString(input.username, "username");
  const payload = await requestPushsaferJson({
    apiKey,
    path: "/api-k",
    params: new URLSearchParams({ u: username }),
    fetcher,
    signal,
    phase: "validate",
  });
  requireSuccessPayload(payload);

  return {
    profile: { accountId: username, displayName: username },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: pushsaferApiBaseUrl,
      username,
      validationEndpoint: "/api-k",
    },
  };
}

interface PushsaferContext {
  apiKey: string;
  username: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

const handlers: Record<string, ProviderRuntimeHandler<PushsaferContext>> = {
  send_message(input, context) {
    return sendMessage(input, context.apiKey, context.fetcher, context.signal);
  },
  list_devices(_input, context) {
    return listDevices(context.username, context.apiKey, context.fetcher, context.signal);
  },
  list_groups(_input, context) {
    return listGroups(context.username, context.apiKey, context.fetcher, context.signal);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<PushsaferContext>({
  service: "pushsafer",
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "pushsafer");
    return {
      apiKey: credential.apiKey,
      username: requiredString(credential.values.username, "username", invalidInput),
      fetcher,
      signal: context.signal,
    };
  },
});

async function sendMessage(
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  setString(params, "m", input.message);
  setString(params, "t", input.title);
  setString(params, "d", input.target);
  setInteger(params, "s", input.sound);
  setInteger(params, "v", input.vibration);
  setInteger(params, "i", input.icon);
  setString(params, "c", input.iconColor);
  setString(params, "u", input.url);
  setString(params, "ut", input.urlTitle);
  setInteger(params, "l", input.timeToLive);
  setInteger(params, "pr", input.priority);

  const payload = requireSuccessPayload(
    await requestPushsaferJson({
      apiKey,
      path: "/api",
      params,
      fetcher,
      signal,
      phase: "execute",
    }),
  );

  return {
    success: requirePayloadString(payload.success, "success"),
    availableCalls: requirePayloadInteger(payload.available, "available"),
    deliveries: parseDeliveries(payload.message_ids),
  };
}

async function listDevices(username: string, apiKey: string, fetcher: ProviderFetch, signal?: AbortSignal) {
  const payload = requireSuccessPayload(
    await requestPushsaferJson({
      apiKey,
      path: "/api-d",
      params: new URLSearchParams({ u: username }),
      fetcher,
      signal,
      phase: "execute",
    }),
  );
  const devices = optionalRecord(payload.devices);
  if (!devices) {
    throw invalidResponse("devices");
  }

  return {
    devices: Object.entries(devices).map(([id, name]) => ({
      id,
      name: requirePayloadString(name, `devices.${id}`),
    })),
  };
}

async function listGroups(username: string, apiKey: string, fetcher: ProviderFetch, signal?: AbortSignal) {
  const payload = requireSuccessPayload(
    await requestPushsaferJson({
      apiKey,
      path: "/api-g",
      params: new URLSearchParams({ u: username }),
      fetcher,
      signal,
      phase: "execute",
    }),
  );
  const groups = optionalRecord(payload.groups);
  if (!groups) {
    throw invalidResponse("groups");
  }

  return {
    groups: Object.entries(groups).map(([id, value]) => {
      const group = optionalRecord(value);
      if (!group) {
        throw invalidResponse(`groups.${id}`);
      }
      const deviceIds = optionalString(group.devices)
        ?.split("|")
        .map((deviceId) => deviceId.trim())
        .filter(Boolean);
      return {
        id,
        name: requirePayloadString(group.name, `groups.${id}.name`),
        deviceIds: deviceIds ?? [],
      };
    }),
  };
}

async function requestPushsaferJson(input: PushsaferRequestInput) {
  const params = new URLSearchParams(input.params);
  params.set("k", input.apiKey);

  try {
    const response = await input.fetcher(new URL(input.path, pushsaferApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: params,
      signal: input.signal ?? AbortSignal.timeout(pushsaferDefaultRequestTimeoutMs),
    });
    const payload = await readPayload(response);
    if (response.status !== 200) {
      throw createPushsaferError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ProviderRequestError(504, "Pushsafer request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pushsafer request failed: ${error.message}` : "Pushsafer request failed",
    );
  }
}

async function readPayload(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Pushsafer returned invalid JSON");
  }
}

function requireSuccessPayload(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    throw invalidResponse("response object");
  }
  if (record.status !== 1) {
    const message = extractErrorMessage(record) ?? "Pushsafer rejected the request";
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function createPushsaferError(status: number, payload: unknown, phase: PushsaferRequestPhase) {
  const message = extractErrorMessage(payload) ?? `Pushsafer request failed with status ${status}`;
  if (status === 280 || status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 250 || status === 255 || status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  return new ProviderRequestError(502, message);
}

function extractErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function parseDeliveries(value: unknown) {
  const messageIds = optionalString(value);
  if (messageIds === undefined || messageIds === "") {
    return [];
  }
  return messageIds.split(",").map((delivery) => {
    const [messageId, deviceId] = delivery.split(":");
    if (!messageId || !deviceId) {
      throw invalidResponse("message_ids");
    }
    return { messageId, deviceId };
  });
}

function setString(params: URLSearchParams, name: string, value: unknown) {
  const normalized = optionalString(value);
  if (normalized !== undefined) {
    params.set(name, normalized);
  }
}

function setInteger(params: URLSearchParams, name: string, value: unknown) {
  const normalized = optionalInteger(value);
  if (normalized !== undefined) {
    params.set(name, String(normalized));
  }
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  const normalized = optionalString(value)?.trim();
  if (!normalized) {
    throw new ProviderRequestError(400, `Pushsafer ${fieldName} is required`);
  }
  return normalized;
}

function requirePayloadString(value: unknown, fieldName: string) {
  const normalized = optionalString(value);
  if (normalized === undefined) {
    throw invalidResponse(fieldName);
  }
  return normalized;
}

function requirePayloadInteger(value: unknown, fieldName: string) {
  const normalized = optionalInteger(value);
  if (normalized === undefined) {
    throw invalidResponse(fieldName);
  }
  return normalized;
}

function invalidResponse(fieldName: string) {
  return new ProviderRequestError(502, `Pushsafer returned an invalid ${fieldName} field`);
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
