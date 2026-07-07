import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { BarkActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "bark";
const barkDefaultBaseUrl = "https://api.day.app";
const barkSuccessCode = 200;

interface BarkContext extends ApiKeyProviderContext {
  baseUrl: string;
  deviceKey: string;
}

interface BarkCredential {
  deviceKey: string;
  baseUrl: string;
}

interface BarkResponsePayload {
  code: number;
  message: string;
  timestamp?: number;
}

type BarkRequestPhase = "validate" | "execute";
type BarkActionHandler = (input: Record<string, unknown>, context: BarkContext) => Promise<unknown>;

export const barkActionHandlers: Record<BarkActionName, BarkActionHandler> = {
  send_notification(input, context) {
    return sendBarkNotification(input, context);
  },
  send_batch_notifications(input, context) {
    return sendBarkBatchNotifications(input, context);
  },
  send_encrypted_notification(input, context) {
    return sendBarkEncryptedNotification(input, context);
  },
  get_server_info(_input, context) {
    return getBarkServerInfo(context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<BarkContext>({
  service,
  handlers: barkActionHandlers,
  async createContext(context, fetcher): Promise<BarkContext> {
    const credential = await requireApiKeyCredential(context, service);
    const resolved = resolveBarkCredential(
      credential.apiKey,
      optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
    );
    return {
      apiKey: credential.apiKey,
      baseUrl: resolved.baseUrl,
      deviceKey: resolved.deviceKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const resolved = resolveBarkCredential(
      credential.apiKey,
      optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
    );
    const url = createProviderProxyUrl(resolved.baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    const body = buildBarkProxyBody(input.endpoint, input.body, resolved.deviceKey);
    if (body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body,
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credential = resolveBarkCredential(input.apiKey, optionalString(input.values.baseUrl));
    await requestBarkServerPing({
      baseUrl: credential.baseUrl,
      fetcher,
      signal,
    });

    const deviceKeyHash = hashBarkDeviceKey(credential.deviceKey);
    return {
      profile: {
        accountId: `bark:${deviceKeyHash.slice(0, 16)}`,
        displayName: "Bark Device",
      },
      grantedScopes: [],
      metadata: {
        baseUrl: credential.baseUrl,
        deviceKeyHash,
        validationEndpoint: "/ping",
      },
    };
  },
};

async function sendBarkNotification(
  input: Record<string, unknown>,
  context: BarkContext,
): Promise<BarkResponsePayload> {
  const payload = await requestBarkJson({
    context,
    path: "/push",
    method: "POST",
    body: buildBarkPushPayload(context.deviceKey, input),
    phase: "execute",
  });

  return normalizeBarkResponsePayload(payload);
}

async function sendBarkBatchNotifications(
  input: Record<string, unknown>,
  context: BarkContext,
): Promise<BarkResponsePayload> {
  const payload = await requestBarkJson({
    context,
    path: "/push",
    method: "POST",
    body: buildBarkBatchPushPayload(input),
    phase: "execute",
  });

  return normalizeBarkResponsePayload(payload);
}

async function sendBarkEncryptedNotification(
  input: Record<string, unknown>,
  context: BarkContext,
): Promise<BarkResponsePayload> {
  const payload = await requestBarkJson({
    context,
    path: "/push",
    method: "POST",
    body: {
      device_key: context.deviceKey,
      ciphertext: input.ciphertext,
    },
    phase: "execute",
  });

  return normalizeBarkResponsePayload(payload);
}

async function getBarkServerInfo(context: BarkContext): Promise<Record<string, unknown>> {
  const response = await requestBarkRaw({
    context,
    path: "/info",
    method: "GET",
    phase: "execute",
  });

  return {
    raw: await readBarkPayload(response),
  };
}

async function requestBarkServerPing(input: {
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<void> {
  await requestBarkRaw({
    context: {
      baseUrl: input.baseUrl,
      fetcher: input.fetcher,
      signal: input.signal,
    },
    path: "/ping",
    method: "GET",
    phase: "validate",
  });
}

async function requestBarkJson(input: {
  context: Pick<BarkContext, "baseUrl" | "fetcher" | "signal">;
  path: string;
  method: "POST";
  body: Record<string, unknown>;
  phase: BarkRequestPhase;
}): Promise<Record<string, unknown>> {
  const response = await requestBarkRaw(input);
  const payload = await readBarkPayload(response);
  if (response.ok) {
    const normalized = normalizeBarkResponsePayload(payload);
    if (normalized.code === barkSuccessCode) {
      return payload;
    }

    throw new ProviderRequestError(502, normalized.message, payload);
  }

  throw mapBarkHttpError(response.status, readBarkErrorMessage(payload), input.phase);
}

async function requestBarkRaw(input: {
  context: Pick<BarkContext, "baseUrl" | "fetcher" | "signal">;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  phase: BarkRequestPhase;
}): Promise<Response> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildBarkUrl(input.context.baseUrl, input.path), {
      method: input.method,
      headers: buildBarkHeaders(input.body != null),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error
        ? `Bark ${input.path} request failed: ${error.message}`
        : `Bark ${input.path} request failed`,
    );
  }

  if (response.ok) {
    return response;
  }

  if (input.method === "GET") {
    const payload = await readBarkPayload(response);
    throw mapBarkHttpError(response.status, readBarkErrorMessage(payload), input.phase);
  }

  return response;
}

function resolveBarkCredential(apiKey: string, baseUrlInput?: string): BarkCredential {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "Bark device key is required");
  }

  const parsedFromUrl = parseBarkPushUrl(trimmedApiKey);
  if (parsedFromUrl) {
    return parsedFromUrl;
  }

  return {
    deviceKey: trimmedApiKey,
    baseUrl: normalizeBarkBaseUrl(baseUrlInput),
  };
}

function parseBarkPushUrl(value: string): BarkCredential | undefined {
  if (!value.includes("://")) {
    return undefined;
  }

  let url: URL;
  try {
    url = assertPublicHttpUrl(value, {
      fieldName: "Bark push URL",
      createError: (message) => new ProviderRequestError(400, message),
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    return undefined;
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Bark push URL must use https");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const deviceKeyIndex = url.hostname === "api.day.app" ? 0 : segments.length - 1;
  const deviceKey = segments[deviceKeyIndex]?.trim();
  if (!deviceKey) {
    throw new ProviderRequestError(400, "Bark push URL must include a device key");
  }

  const baseSegments = deviceKeyIndex === 0 ? [] : segments.slice(0, deviceKeyIndex);
  const basePath = baseSegments.length > 0 ? `/${baseSegments.join("/")}` : "";

  return {
    deviceKey,
    baseUrl: normalizeBarkBaseUrl(`${url.origin}${basePath}`),
  };
}

function normalizeBarkBaseUrl(value?: string): string {
  const candidate = value?.trim() || barkDefaultBaseUrl;
  const url = assertPublicHttpUrl(candidate, {
    fieldName: "Bark baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Bark baseUrl must use https");
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

function buildBarkUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/u, ""), `${baseUrl}/`).toString();
}

function buildBarkHeaders(hasBody: boolean): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent": providerUserAgent,
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
  };
}

function buildBarkProxyBody(endpoint: unknown, body: unknown, deviceKey: string): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (typeof body === "string") {
    return body;
  }
  const record = optionalRecord(body);
  if (endpoint === "/push" && record && !Array.isArray(record.device_keys)) {
    return JSON.stringify({ ...record, device_key: deviceKey });
  }
  return JSON.stringify(body);
}

function buildBarkPushPayload(deviceKey: string, input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    device_key: deviceKey,
    ...buildBarkNotificationPayload(input),
  });
}

function buildBarkBatchPushPayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    device_keys: input.device_keys,
    ...buildBarkNotificationPayload(input),
  });
}

function buildBarkNotificationPayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: input.title,
    subtitle: input.subtitle,
    body: input.body,
    level: input.level,
    volume: input.volume,
    badge: input.badge,
    call: input.call === true ? "1" : undefined,
    autoCopy: input.autoCopy === true ? "1" : undefined,
    copy: input.copy,
    sound: input.sound,
    icon: input.icon,
    group: input.group,
    isArchive: mapBarkBooleanFlag(input.isArchive),
    url: input.url,
    action: input.action,
  });
}

function mapBarkBooleanFlag(value: unknown): string | undefined {
  if (value === true) {
    return "1";
  }
  if (value === false) {
    return "0";
  }
  return undefined;
}

async function readBarkPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      message: text,
    };
  }
}

function normalizeBarkResponsePayload(payload: Record<string, unknown>): BarkResponsePayload {
  const timestamp = optionalInteger(payload.timestamp);
  return {
    code: optionalInteger(payload.code) ?? barkSuccessCode,
    message: optionalString(payload.message) ?? "success",
    ...(timestamp !== undefined ? { timestamp } : {}),
  };
}

function readBarkErrorMessage(payload: Record<string, unknown>): string {
  return optionalString(payload.message) ?? optionalString(payload.error) ?? "Bark request failed";
}

function mapBarkHttpError(status: number, message: string, phase: BarkRequestPhase): ProviderRequestError {
  if (status === 401 || status === 403 || (phase === "validate" && status === 404)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function hashBarkDeviceKey(deviceKey: string): string {
  return createHash("sha256").update(deviceKey).digest("hex");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
