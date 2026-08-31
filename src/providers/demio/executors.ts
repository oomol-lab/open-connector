import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "demio";
const demioApiBaseUrl = "https://my.demio.com/api/v1";
const demioMaxResponseBytes = 10 * 1024 * 1024;

type DemioRequestPhase = "validate" | "execute";
type DemioMethod = "GET" | "PUT";
interface DemioContext {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type DemioActionHandler = (input: Record<string, unknown>, context: DemioContext) => Promise<unknown>;

export const demioActionHandlers: ProviderActionHandlers<"demio", DemioActionHandler> = {
  list_events(input, context) {
    return requestDemioAction(context, {
      method: "GET",
      path: "/events",
      query: compactObject({
        type: optionalString(input.type),
      }),
    });
  },
  get_event(input, context) {
    return requestDemioAction(context, {
      method: "GET",
      path: `/event/${readInteger(input.id, "id")}`,
      query: compactObject({
        active: input.active === undefined ? undefined : String(Boolean(input.active)),
      }),
    });
  },
  get_event_session(input, context) {
    return requestDemioAction(context, {
      method: "GET",
      path: `/event/${readInteger(input.id, "id")}/date/${readInteger(input.date_id, "date_id")}`,
    });
  },
  register_attendee(input, context) {
    return requestDemioAction(context, {
      method: "PUT",
      path: "/event/register",
      body: normalizeRegistrationInput(input),
    });
  },
  list_event_participants(input, context) {
    return requestDemioAction(context, {
      method: "GET",
      path: `/report/${readInteger(input.date_id, "date_id")}/participants`,
      query: compactObject({
        status: optionalString(input.status),
      }),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DemioContext>({
  service,
  handlers: demioActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<DemioContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: requireDemioApiSecret(credential.values.apiSecret),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: demioApiBaseUrl,
  auth: { type: "api_key_header", name: "Api-Key" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("Api-Secret", requireDemioApiSecret(credential.values.apiSecret));
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestDemioJson({
      method: "GET",
      path: "/ping",
      apiKey: input.apiKey,
      apiSecret: requireDemioApiSecret(input.values.apiSecret),
      phase: "validate",
      fetcher,
      signal,
    });
    const ping = optionalRecord(payload);
    if (ping?.pong !== true) {
      throw new ProviderRequestError(
        401,
        extractDemioErrorMessage(payload) ?? "Demio credential validation did not return pong",
      );
    }
    const sandbox = optionalBoolean(ping.sandbox);
    return {
      profile: {
        accountId: "api_key",
        displayName: sandbox ? "Demio Sandbox API Key" : "Demio API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: demioApiBaseUrl,
        validationEndpoint: "/ping",
        sandbox,
      }),
    };
  },
};

function requestDemioAction(
  context: DemioContext,
  request: {
    method: DemioMethod;
    path: string;
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  },
) {
  return requestDemioJson({
    ...request,
    apiKey: context.apiKey,
    apiSecret: context.apiSecret,
    phase: "execute",
    fetcher: context.fetcher,
    signal: context.signal,
  });
}

async function requestDemioJson(input: {
  method: DemioMethod;
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  apiKey: string;
  apiSecret: string;
  phase: DemioRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}) {
  const path = trimLeadingSlashes(input.path);
  const url = new URL(path, `${demioApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "api-key": input.apiKey,
        "api-secret": input.apiSecret,
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });
    const payload = await readDemioPayload(response);
    if (!response.ok) {
      throw createDemioError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Demio request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Demio request failed: ${error.message}` : "Demio request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readDemioPayload(response: Response) {
  const text = await readProviderTextBody(response, "Demio response", demioMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Demio returned invalid JSON");
  }
}

function createDemioError(response: Response, payload: unknown, phase: DemioRequestPhase) {
  const message =
    extractDemioErrorMessage(payload) ??
    optionalString(response.statusText)?.trim() ??
    `Demio request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  const invalidInput =
    phase === "validate"
      ? response.status >= 400 && response.status < 500
      : response.status === 400 || response.status === 404 || response.status === 422;
  if (invalidInput) {
    return new ProviderRequestError(phase === "validate" ? 401 : response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 || response.status < 400 ? 502 : response.status, message);
}

function extractDemioErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  if (Array.isArray(record.messages)) {
    const messages = record.messages.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  return optionalString(record.message)?.trim() || optionalString(record.error)?.trim();
}

function requireDemioApiSecret(value: unknown) {
  const apiSecret = optionalString(value)?.trim();
  if (!apiSecret) {
    throw new ProviderRequestError(400, "apiSecret is required");
  }
  return apiSecret;
}

function readInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${field} must be an integer`);
  }
  return value;
}

function trimLeadingSlashes(value: string) {
  let result = value;
  while (result.startsWith("/")) {
    result = result.slice(1);
  }
  return result;
}

function normalizeRegistrationInput(input: Record<string, unknown>): Record<string, unknown> {
  if (!Number.isInteger(input.id) && !(typeof input.ref_url === "string" && input.ref_url.trim().length > 0)) {
    throw new ProviderRequestError(400, "Either id or ref_url must identify the Demio event.");
  }
  const trimmedFields = new Set(["name", "email", "last_name", "company", "website", "phone_number"]);
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      trimmedFields.has(key) && typeof value === "string" ? value.trim() : value,
    ]),
  );
}
