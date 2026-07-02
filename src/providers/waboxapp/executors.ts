import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { WaboxappActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "waboxapp";
const waboxappApiBaseUrl = "https://www.waboxapp.com";
const waboxappValidationPath = "/api/status/{uid}";
const waboxappRequestTimeoutMs = 30_000;

type WaboxappPhase = "validate" | "execute";

interface WaboxappActionContext {
  apiKey: string;
  uid: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface WaboxappRequestPayload {
  status: number;
  payload: unknown;
}

interface WaboxappAccountStatus {
  uid: string;
  hookUrl: string | null;
  alias: string | null;
  platform: string | null;
  batteryPercent: number | null;
  plugged: boolean | null;
  locale: string | null;
  raw: Record<string, unknown>;
}

type WaboxappActionHandler = (input: Record<string, unknown>, context: WaboxappActionContext) => Promise<unknown>;

export const waboxappActionHandlers: Record<WaboxappActionName, WaboxappActionHandler> = {
  get_account_status(_input, context) {
    return getAccountStatus(context);
  },
  send_chat(input, context) {
    return sendChat(input, context);
  },
  send_image(input, context) {
    return sendImage(input, context);
  },
  send_link(input, context) {
    return sendLink(input, context);
  },
  send_media(input, context) {
    return sendMedia(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<WaboxappActionContext>({
  service,
  handlers: waboxappActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<WaboxappActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey.trim(),
      uid: requireWaboxappUid({
        uid: optionalString(credential.values.uid) ?? optionalString(credential.metadata.uid),
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateWaboxappCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateWaboxappCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const token = apiKey.trim();
  const uid = requireWaboxappUid(values);
  const payload = await requestWaboxappStatus(uid, token, fetcher, "validate", signal);
  const account = normalizeWaboxappAccountStatus(payload);

  return {
    profile: {
      accountId: account.uid,
      displayName: account.alias ?? account.uid,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: waboxappApiBaseUrl,
      validationEndpoint: waboxappValidationPath,
      uid: account.uid,
      hookUrl: account.hookUrl ?? undefined,
      alias: account.alias ?? undefined,
      platform: account.platform ?? undefined,
      batteryPercent: account.batteryPercent ?? undefined,
      plugged: account.plugged ?? undefined,
      locale: account.locale ?? undefined,
    }),
  };
}

async function getAccountStatus(context: WaboxappActionContext): Promise<unknown> {
  const payload = await requestWaboxappStatus(context.uid, context.apiKey, context.fetcher, "execute", context.signal);
  return {
    account: normalizeWaboxappAccountStatus(payload),
  };
}

async function sendChat(input: Record<string, unknown>, context: WaboxappActionContext): Promise<unknown> {
  const payload = await requestWaboxappMessage({
    actionPath: "/api/send/chat",
    context,
    body: {
      to: requireInputString(input.to, "to"),
      custom_uid: requireInputString(input.customUid, "customUid"),
      text: requireInputString(input.text, "text"),
    },
  });
  return normalizeWaboxappSendResult(payload);
}

async function sendImage(input: Record<string, unknown>, context: WaboxappActionContext): Promise<unknown> {
  const payload = await requestWaboxappMessage({
    actionPath: "/api/send/image",
    context,
    body: compactObject({
      to: requireInputString(input.to, "to"),
      custom_uid: requireInputString(input.customUid, "customUid"),
      url: requireInputString(input.imageUrl, "imageUrl"),
      caption: readOptionalNonEmptyString(input.caption),
      description: readOptionalNonEmptyString(input.description),
    }) as Record<string, string>,
  });
  return normalizeWaboxappSendResult(payload);
}

async function sendLink(input: Record<string, unknown>, context: WaboxappActionContext): Promise<unknown> {
  const payload = await requestWaboxappMessage({
    actionPath: "/api/send/link",
    context,
    body: compactObject({
      to: requireInputString(input.to, "to"),
      custom_uid: requireInputString(input.customUid, "customUid"),
      url: requireInputString(input.linkUrl, "linkUrl"),
      caption: readOptionalNonEmptyString(input.caption),
      description: readOptionalNonEmptyString(input.description),
      url_thumb: readOptionalNonEmptyString(input.urlThumb),
    }) as Record<string, string>,
  });
  return normalizeWaboxappSendResult(payload);
}

async function sendMedia(input: Record<string, unknown>, context: WaboxappActionContext): Promise<unknown> {
  const payload = await requestWaboxappMessage({
    actionPath: "/api/send/media",
    context,
    body: compactObject({
      to: requireInputString(input.to, "to"),
      custom_uid: requireInputString(input.customUid, "customUid"),
      url: requireInputString(input.mediaUrl, "mediaUrl"),
      caption: readOptionalNonEmptyString(input.caption),
      description: readOptionalNonEmptyString(input.description),
      url_thumb: readOptionalNonEmptyString(input.urlThumb),
    }) as Record<string, string>,
  });
  return normalizeWaboxappSendResult(payload);
}

async function requestWaboxappStatus(
  uid: string,
  apiKey: string,
  fetcher: typeof fetch,
  phase: WaboxappPhase,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const url = new URL(`/api/status/${encodeURIComponent(uid)}`, waboxappApiBaseUrl);
  url.searchParams.set("token", apiKey);
  const payload = await requestWaboxapp(
    {
      method: "GET",
      url,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    },
    fetcher,
    phase,
  );
  return requireWaboxappSuccessPayload(payload, phase);
}

async function requestWaboxappMessage(input: {
  actionPath: string;
  context: WaboxappActionContext;
  body: Record<string, string>;
}): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    token: input.context.apiKey,
    uid: input.context.uid,
  });
  for (const [key, value] of Object.entries(input.body)) {
    params.set(key, value);
  }

  const payload = await requestWaboxapp(
    {
      method: "POST",
      url: new URL(input.actionPath, waboxappApiBaseUrl),
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": providerUserAgent,
      },
      body: params.toString(),
      signal: input.context.signal,
    },
    input.context.fetcher,
    "execute",
  );
  return requireWaboxappSuccessPayload(payload, "execute");
}

async function requestWaboxapp(
  input: {
    method: "GET" | "POST";
    url: URL;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
  fetcher: typeof fetch,
  phase: WaboxappPhase,
): Promise<WaboxappRequestPayload> {
  const timeout = createProviderTimeout(input.signal, waboxappRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetcher(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Waboxapp request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Waboxapp request failed: ${error.message}` : "Waboxapp request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readWaboxappPayload(response);
  if (!response.ok) {
    throw createWaboxappError(response.status, payload, phase);
  }
  return payload;
}

async function readWaboxappPayload(response: Response): Promise<WaboxappRequestPayload> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return { status: response.status, payload: null };
  }
  try {
    return { status: response.status, payload: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, payload: text };
  }
}

function createWaboxappError(
  status: number,
  payload: WaboxappRequestPayload,
  phase: WaboxappPhase,
): ProviderRequestError {
  const message = extractWaboxappError(payload.payload) ?? `Waboxapp request failed with status ${status || 500}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload.payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload.payload);
  }
  if (status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload.payload);
  }
  return new ProviderRequestError(status || 502, message, payload.payload);
}

function requireWaboxappSuccessPayload(payload: WaboxappRequestPayload, phase: WaboxappPhase): Record<string, unknown> {
  const record = optionalRecord(payload.payload);
  if (!record) {
    throw new ProviderRequestError(502, "Waboxapp response must be a JSON object");
  }
  if (record.success !== true) {
    const error = extractWaboxappError(payload.payload) ?? "Waboxapp reported an unsuccessful response";
    throw new ProviderRequestError(phase === "validate" ? 400 : 502, error, payload.payload);
  }
  return record;
}

function normalizeWaboxappSendResult(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    success: true,
    customUid: requireResponseString(payload.custom_uid, "custom_uid"),
    raw: payload,
  };
}

function normalizeWaboxappAccountStatus(payload: Record<string, unknown>): WaboxappAccountStatus {
  return {
    uid: requireResponseString(payload.uid, "uid"),
    hookUrl: readNullableString(payload.hook_url),
    alias: readNullableString(payload.alias),
    platform: readNullableString(payload.platform),
    batteryPercent: readNullableInteger(payload.battery),
    plugged: readNullablePlugged(payload.plugged),
    locale: readNullableString(payload.locale),
    raw: payload,
  };
}

function requireWaboxappUid(input: { uid?: string }): string {
  const uid = input.uid?.trim();
  if (!uid) {
    throw new ProviderRequestError(400, "uid is required");
  }
  return uid;
}

function extractWaboxappError(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return record ? optionalString(record.error)?.trim() || undefined : undefined;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireResponseString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `${fieldName} is required in Waboxapp response`),
  );
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  return optionalString(value);
}

function readNullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function readNullableInteger(value: unknown): number | null {
  const rawNumber = optionalNumber(value);
  if (rawNumber != null && Number.isFinite(rawNumber)) {
    return Math.trunc(rawNumber);
  }
  const normalized = optionalString(value);
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNullablePlugged(value: unknown): boolean | null {
  const normalized = optionalString(value);
  if (normalized === "1") {
    return true;
  }
  if (normalized === "0") {
    return false;
  }
  return null;
}
