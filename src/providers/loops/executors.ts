import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { LoopsActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "loops";
const loopsApiOrigin = "https://app.loops.so";
const loopsApiBaseUrl = `${loopsApiOrigin}/api`;
const loopsApiVersion = "v1";

type LoopsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const loopsActionHandlers: Record<LoopsActionName, LoopsActionHandler> = {
  create_contact(input, context) {
    return loopsRequest(context, "/contacts/create", { method: "POST", body: buildContactBody(input) });
  },
  update_contact(input, context) {
    return loopsRequest(context, "/contacts/update", { method: "PUT", body: buildContactBody(input) });
  },
  find_contact(input, context) {
    return loopsRequest(context, buildContactLookupPath("/contacts/find", input), { method: "GET" });
  },
  delete_contact(input, context) {
    return loopsRequest(context, "/contacts/delete", { method: "POST", body: buildIdentifierBody(input) });
  },
  create_contact_property(input, context) {
    return loopsRequest(context, "/contacts/properties", {
      method: "POST",
      body: pickDefined(input, ["name", "type"]),
    });
  },
  list_contact_properties(input, context) {
    return loopsRequest(context, buildListContactPropertiesPath(input), { method: "GET" });
  },
  list_mailing_lists(_input, context) {
    return loopsRequest(context, "/lists", { method: "GET" });
  },
  send_event(input, context) {
    return loopsRequest(context, "/events/send", {
      method: "POST",
      body: buildEventBody(input),
      idempotencyKey: optionalString(input.idempotencyKey),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, loopsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: `${loopsApiBaseUrl}/${loopsApiVersion}`,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLoopsCredential(input.apiKey, fetcher, signal);
  },
};

async function validateLoopsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await loopsRequest({ apiKey, fetcher, signal }, "/api-key", { method: "GET" }, "validate");
  const record = requireLoopsObject(payload);
  const teamName = optionalString(record.teamName);
  return {
    profile: {
      accountId: "loops-api-key",
      displayName: teamName ?? "Loops API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: loopsApiBaseUrl,
      apiVersion: loopsApiVersion,
      validationEndpoint: `/${loopsApiVersion}/api-key`,
      ...(teamName ? { teamName } : {}),
    },
  };
}

function buildLoopsUrl(pathOrUrl: string | URL): URL {
  if (pathOrUrl instanceof URL) {
    return pathOrUrl;
  }
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return new URL(`/api/${loopsApiVersion}${path}`, loopsApiOrigin);
}

function buildContactLookupPath(path: string, input: Record<string, unknown>): URL {
  const url = buildLoopsUrl(path);
  appendIdentifierQuery(url, input);
  return url;
}

function buildListContactPropertiesPath(input: Record<string, unknown>): URL {
  const url = buildLoopsUrl("/contacts/properties");
  const list = optionalString(input.list);
  if (list) {
    url.searchParams.set("list", list);
  }
  return url;
}

function appendIdentifierQuery(url: URL, input: Record<string, unknown>): void {
  const email = optionalString(input.email);
  const userId = optionalString(input.userId);
  const identifierCount = [email, userId].filter((value) => !!value).length;
  if (identifierCount !== 1) {
    throw new ProviderRequestError(400, "provide exactly one of email or userId");
  }
  if (email) {
    url.searchParams.set("email", email);
  }
  if (userId) {
    url.searchParams.set("userId", userId);
  }
}

function buildIdentifierBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = pickDefined(input, ["email", "userId"]);
  if (Object.keys(body).length !== 1) {
    throw new ProviderRequestError(400, "provide exactly one of email or userId");
  }
  return body;
}

function buildContactBody(input: Record<string, unknown>): Record<string, unknown> {
  return mergeCustomProperties(
    pickDefined(input, [
      "email",
      "userId",
      "firstName",
      "lastName",
      "source",
      "subscribed",
      "userGroup",
      "mailingLists",
    ]),
    input.customProperties,
    input,
  );
}

function buildEventBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = mergeCustomProperties(
    pickDefined(input, ["eventName", "email", "userId"]),
    input.eventProperties,
    input,
  );
  return mergeCustomProperties(body, input.contactProperties, {});
}

function mergeCustomProperties(
  base: Record<string, unknown>,
  nestedCustomProperties: unknown,
  topLevelInput: Record<string, unknown>,
): Record<string, unknown> {
  const reserved = new Set([
    "customProperties",
    "eventProperties",
    "contactProperties",
    "idempotencyKey",
    ...Object.keys(base),
  ]);
  for (const [key, value] of Object.entries(topLevelInput)) {
    if (!reserved.has(key)) {
      base[key] = value;
    }
  }

  const nested = optionalRecord(nestedCustomProperties);
  if (nested) {
    Object.assign(base, nested);
  }
  return base;
}

function pickDefined(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }
  return body;
}

async function loopsRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  pathOrUrl: string | URL,
  input: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    idempotencyKey?: string;
  },
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  const url = buildLoopsUrl(pathOrUrl);
  const init: RequestInit = {
    method: input.method,
    headers: loopsHeaders(context.apiKey, input.body !== undefined, input.idempotencyKey),
    signal: context.signal,
  };
  if (input.body !== undefined) {
    init.body = JSON.stringify(input.body);
  }

  const response = await context.fetcher(url.toString(), init);
  const payload = await readLoopsPayload(response);
  if (!response.ok) {
    throw createLoopsError(response, payload, phase);
  }

  return payload;
}

function loopsHeaders(apiKey: string, hasBody: boolean, idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
  }
  return headers;
}

async function readLoopsPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function requireLoopsObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "invalid Loops response");
  }
  return record;
}

function createLoopsError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractLoopsErrorMessage(payload) ?? `Loops request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if ([400, 404, 405, 409, 422].includes(response.status)) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function extractLoopsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error);
}
