import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const pushbulletApiBaseUrl = "https://api.pushbullet.com/v2";
const pushbulletValidationPath = "/users/me";

type PushbulletRequestMode = "validate" | "execute";

type PushbulletActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface PushbulletRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  mode: PushbulletRequestMode;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  emptySuccess?: unknown;
}

interface PushbulletErrorPayload {
  error?: {
    type?: unknown;
    message?: unknown;
    param?: unknown;
  };
}

export const pushbulletActionHandlers: ProviderActionHandlers<"pushbullet", PushbulletActionHandler> = {
  get_current_user(input, context) {
    return getCurrentUser(input, context);
  },
  list_devices(input, context) {
    return listDevices(input, context);
  },
  create_device(input, context) {
    return createDevice(input, context);
  },
  update_device(input, context) {
    return updateDevice(input, context);
  },
  delete_device(input, context) {
    return deleteDevice(input, context);
  },
  list_pushes(input, context) {
    return listPushes(input, context);
  },
  create_push(input, context) {
    return createPush(input, context);
  },
  update_push(input, context) {
    return updatePush(input, context);
  },
  delete_push(input, context) {
    return deletePush(input, context);
  },
  delete_all_pushes(input, context) {
    return deleteAllPushes(input, context);
  },
  list_chats(input, context) {
    return listChats(input, context);
  },
  create_chat(input, context) {
    return createChat(input, context);
  },
  update_chat(input, context) {
    return updateChat(input, context);
  },
  delete_chat(input, context) {
    return deleteChat(input, context);
  },
};

export async function validatePushbulletCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const user = await requestPushbulletJson<Record<string, unknown>>({
    apiKey,
    path: pushbulletValidationPath,
    fetcher,
    mode: "validate",
  });

  const iden = optionalString(user.iden);
  const name = optionalString(user.name);
  const email = optionalString(user.email);

  return {
    profile: {
      accountId: iden ? `pushbullet:user:${iden}` : "pushbullet-access-token",
      displayName: name || email || "Pushbullet Access Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: pushbulletValidationPath,
      userIden: iden,
      email,
      emailNormalized: optionalString(user.email_normalized),
      maxUploadSize: optionalNumber(user.max_upload_size),
    }),
  };
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pushbullet", pushbulletActionHandlers);

async function getCurrentUser(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: pushbulletValidationPath,
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function listDevices(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: "/devices",
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function createDevice(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: "/devices",
    method: "POST",
    body: compactObject({ ...input }),
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function updateDevice(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: `/devices/${encodeURIComponent(requireString(input.iden, "iden"))}`,
    method: "POST",
    body: withoutIden(input),
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function deleteDevice(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: `/devices/${encodeURIComponent(requireString(input.iden, "iden"))}`,
    method: "DELETE",
    fetcher: context.fetcher,
    mode: "execute",
    emptySuccess: { deleted: true },
  });
}

async function listPushes(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: "/pushes",
    query: compactObject({
      active: typeof input.active === "boolean" ? input.active : undefined,
      modified_after: optionalNumber(input.modified_after),
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function createPush(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: "/pushes",
    method: "POST",
    body: compactObject({ ...input }),
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function updatePush(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: `/pushes/${encodeURIComponent(requireString(input.iden, "iden"))}`,
    method: "POST",
    body: withoutIden(input),
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function deletePush(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: `/pushes/${encodeURIComponent(requireString(input.iden, "iden"))}`,
    method: "DELETE",
    fetcher: context.fetcher,
    mode: "execute",
    emptySuccess: { deleted: true },
  });
}

async function deleteAllPushes(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: "/pushes",
    method: "DELETE",
    fetcher: context.fetcher,
    mode: "execute",
    emptySuccess: { deleted: true },
  });
}

async function listChats(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: "/chats",
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function createChat(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: "/chats",
    method: "POST",
    body: compactObject({ email: input.email }),
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function updateChat(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: `/chats/${encodeURIComponent(requireString(input.iden, "iden"))}`,
    method: "POST",
    body: compactObject({ muted: input.muted }),
    fetcher: context.fetcher,
    mode: "execute",
  });
}

async function deleteChat(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestPushbulletJson({
    apiKey: context.apiKey,
    path: `/chats/${encodeURIComponent(requireString(input.iden, "iden"))}`,
    method: "DELETE",
    fetcher: context.fetcher,
    mode: "execute",
    emptySuccess: { deleted: true },
  });
}

async function requestPushbulletJson<T>(options: PushbulletRequestOptions): Promise<T> {
  const url = new URL(`${pushbulletApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    "Access-Token": options.apiKey,
    "User-Agent": providerUserAgent,
  });
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await options.fetcher(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw wrapPushbulletTransportError(error, options.mode, "request");
  }

  let payload: unknown;
  try {
    payload = await readPushbulletPayload(response, options.emptySuccess);
  } catch (error) {
    throw wrapPushbulletTransportError(error, options.mode, "response parsing");
  }

  if (!response.ok) {
    throw createPushbulletError(response, payload, options.mode);
  }

  return payload as T;
}

async function readPushbulletPayload(response: Response, emptySuccess: unknown) {
  const text = await response.text();
  if (!text) {
    return emptySuccess ?? {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    if (emptySuccess !== undefined && isEmptyObject(payload)) {
      return emptySuccess;
    }
    return payload;
  } catch {
    if (!response.ok) {
      return { error: { message: text } };
    }
    throw new ProviderRequestError(502, "Pushbullet returned invalid JSON");
  }
}

function isEmptyObject(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

function createPushbulletError(response: Response, payload: unknown, mode: PushbulletRequestMode) {
  const message = readPushbulletErrorMessage(payload) ?? `Pushbullet request failed with ${response.status}`;

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function readPushbulletErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const error = (payload as PushbulletErrorPayload).error;
  if (error?.message && typeof error.message === "string") {
    const param = typeof error.param === "string" && error.param ? ` (${error.param})` : "";
    return `${error.message}${param}`;
  }

  return undefined;
}

function wrapPushbulletTransportError(
  error: unknown,
  mode: PushbulletRequestMode,
  phase: "request" | "response parsing",
) {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  const detail = error instanceof Error && error.message ? error.message : `unknown ${phase} error`;
  return new ProviderRequestError(mode === "validate" ? 400 : 502, `Pushbullet ${phase} failed: ${detail}`);
}

function withoutIden(input: Record<string, unknown>) {
  const { iden: _iden, ...rest } = input;
  return compactObject(rest);
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}
