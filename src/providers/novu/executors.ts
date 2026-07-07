import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { NovuActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "novu";
const novuDefaultApiBaseUrl = "https://api.novu.co";
const novuEuApiBaseUrl = "https://eu.api.novu.co";
const novuAllowedApiBaseUrls = [novuDefaultApiBaseUrl, novuEuApiBaseUrl];

type NovuRequestPhase = "validate" | "execute";
type NovuMethod = "GET" | "POST" | "PATCH";
type NovuActionHandler = (input: Record<string, unknown>, context: NovuActionContext) => Promise<unknown>;

interface NovuActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface NovuRequestInput {
  method: NovuMethod;
  path: string;
  apiKey: string;
  apiBaseUrl: string;
  phase: NovuRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

export const novuActionHandlers: Record<NovuActionName, NovuActionHandler> = {
  async search_subscribers(input, context): Promise<unknown> {
    const payload = await requestNovuJson({
      method: "GET",
      path: "/v2/subscribers",
      apiKey: context.apiKey,
      apiBaseUrl: context.apiBaseUrl,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
      query: compactObject({
        after: input.after,
        before: input.before,
        limit: input.limit,
        orderDirection: input.orderDirection,
        orderBy: input.orderBy,
        includeCursor: input.includeCursor,
        email: input.email,
        name: input.name,
        phone: input.phone,
        subscriberId: input.subscriberId,
      }),
    });
    const object = readRecord(payload, "Novu subscribers response");

    return {
      subscribers: Array.isArray(object.data) ? object.data : [],
      next: nullableString(object.next),
      previous: nullableString(object.previous),
      totalCount: typeof object.totalCount === "number" ? object.totalCount : 0,
      totalCountCapped: object.totalCountCapped === true,
      raw: object,
    };
  },

  async create_subscriber(input, context): Promise<unknown> {
    const payload = await requestNovuJson({
      method: "POST",
      path: "/v2/subscribers",
      apiKey: context.apiKey,
      apiBaseUrl: context.apiBaseUrl,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
      query: compactObject({ failIfExists: input.failIfExists }),
      body: buildSubscriberBody(input, true),
      idempotencyKey: optionalString(input.idempotencyKey),
    });
    const subscriber = readRecord(payload, "Novu subscriber response");
    return { subscriber, raw: subscriber };
  },

  async get_subscriber(input, context): Promise<unknown> {
    const payload = await requestNovuJson({
      method: "GET",
      path: `/v2/subscribers/${encodePathSegment(input.subscriberId)}`,
      apiKey: context.apiKey,
      apiBaseUrl: context.apiBaseUrl,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    const subscriber = readRecord(payload, "Novu subscriber response");
    return { subscriber, raw: subscriber };
  },

  async update_subscriber(input, context): Promise<unknown> {
    const payload = await requestNovuJson({
      method: "PATCH",
      path: `/v2/subscribers/${encodePathSegment(input.subscriberId)}`,
      apiKey: context.apiKey,
      apiBaseUrl: context.apiBaseUrl,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
      body: buildSubscriberBody(input, false),
      idempotencyKey: optionalString(input.idempotencyKey),
    });
    const subscriber = readRecord(payload, "Novu subscriber response");
    return { subscriber, raw: subscriber };
  },

  async trigger_event(input, context): Promise<unknown> {
    const payload = await requestNovuJson({
      method: "POST",
      path: "/v1/events/trigger",
      apiKey: context.apiKey,
      apiBaseUrl: context.apiBaseUrl,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
      body: compactObject({
        name: input.name,
        to: input.to,
        payload: input.payload,
        overrides: input.overrides,
        transactionId: input.transactionId,
        actor: input.actor,
        tenant: input.tenant,
        context: input.context,
      }),
      idempotencyKey: optionalString(input.idempotencyKey),
    });
    const object = readRecord(payload, "Novu trigger response");

    return {
      acknowledged: object.acknowledged === true,
      status: optionalString(object.status) ?? "error",
      error: Array.isArray(object.error) ? object.error.map(String) : [],
      transactionId: nullableString(object.transactionId),
      activityFeedLink: nullableString(object.activityFeedLink),
      jobData: optionalRecord(object.jobData) ?? null,
      raw: object,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<NovuActionContext>({
  service,
  handlers: novuActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NovuActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizeNovuApiBaseUrl(credential.metadata.apiBaseUrl ?? credential.values.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Novu request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeNovuApiBaseUrl(credential.metadata.apiBaseUrl ?? credential.values.apiBaseUrl);
  },
  auth: {
    type: "api_key_authorization",
    prefix: "ApiKey ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = normalizeNovuApiBaseUrl(input.values.apiBaseUrl);
    const payload = await requestNovuJson({
      method: "GET",
      path: "/v2/subscribers",
      apiKey: input.apiKey,
      apiBaseUrl,
      phase: "validate",
      fetcher,
      signal,
      query: { limit: 1 },
    });
    const object = readRecord(payload, "Novu subscribers response");
    const subscribers = Array.isArray(object.data) ? object.data : [];
    const firstSubscriber = optionalRecord(subscribers[0]);
    const firstSubscriberId = optionalString(firstSubscriber?.subscriberId);
    const displayName = firstSubscriberId
      ? `Novu ${firstSubscriberId}`
      : `Novu ${apiBaseUrl === novuEuApiBaseUrl ? "EU" : "US"} API Key`;

    return {
      profile: {
        accountId: firstSubscriberId ?? apiBaseUrl,
        displayName,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/v2/subscribers",
        firstSubscriberId,
        totalCount: typeof object.totalCount === "number" ? object.totalCount : undefined,
      }),
    };
  },
};

function buildSubscriberBody(input: Record<string, unknown>, includeSubscriberId: boolean): Record<string, unknown> {
  return compactObject({
    subscriberId: includeSubscriberId ? input.subscriberId : undefined,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    avatar: input.avatar,
    locale: input.locale,
    timezone: input.timezone,
    data: input.data,
  });
}

function normalizeNovuApiBaseUrl(value: unknown): string {
  const raw = optionalString(value) ?? novuDefaultApiBaseUrl;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "Novu API Base URL is invalid");
  }

  while (url.pathname.endsWith("/") && url.pathname !== "/") {
    url.pathname = url.pathname.slice(0, -1);
  }
  const text = url.toString();
  const normalized = text.endsWith("/") ? text.slice(0, -1) : text;
  if (!novuAllowedApiBaseUrls.includes(normalized) || url.search || url.hash || url.username || url.password) {
    throw new ProviderRequestError(400, "Novu API Base URL must be https://api.novu.co or https://eu.api.novu.co");
  }
  return normalized;
}

async function requestNovuJson(input: NovuRequestInput): Promise<unknown> {
  const url = new URL(input.path, input.apiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: buildNovuHeaders(input.apiKey, input.idempotencyKey),
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readNovuJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Novu request failed: ${error.message}` : "Novu request failed",
      error,
    );
  }

  if (!response.ok) {
    throw buildNovuError(response.status, payload, input.phase);
  }

  return payload;
}

function buildNovuHeaders(apiKey: string, idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `ApiKey ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
  if (idempotencyKey != null) {
    headers["idempotency-key"] = idempotencyKey;
  }
  return headers;
}

async function readNovuJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Novu returned invalid JSON");
  }
}

function buildNovuError(status: number, payload: unknown, phase: NovuRequestPhase): ProviderRequestError {
  const message = readNovuErrorMessage(payload) ?? `Novu API returned HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readNovuErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const message = object.message;
  if (typeof message === "string") {
    return message;
  }
  if (Array.isArray(message)) {
    return message.map(String).join("; ");
  }
  return optionalString(object.error) ?? optionalString(object.type);
}

function readRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, `${fieldName} must be an object`);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
