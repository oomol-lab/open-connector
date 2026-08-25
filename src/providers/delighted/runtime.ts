import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const delightedApiBaseUrl = "https://api.delighted.com/v1";
const delightedValidationPath = "/metrics.json";
const delightedDefaultRequestTimeoutMs = 30_000;

type DelightedQueryValue = string | number | boolean | Array<string | number | boolean> | undefined;
type DelightedActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface DelightedRequestOptions {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, DelightedQueryValue>;
  body?: Record<string, unknown>;
  mode: "validate" | "execute";
}

interface DelightedResponse {
  payload: unknown;
  headers: Headers;
}

export const delightedActionHandlers: ProviderActionHandlers<"delighted", DelightedActionHandler> = {
  create_or_update_person(input, context) {
    return delightedCreateOrUpdatePerson(input, context);
  },
  list_people(input, context) {
    return delightedListPeople(input, context);
  },
  list_unsubscribed_people(input, context) {
    return delightedListUnsubscribedPeople(input, context);
  },
  list_bounced_people(input, context) {
    return delightedListBouncedPeople(input, context);
  },
  unsubscribe_person(input, context) {
    return delightedUnsubscribePerson(input, context);
  },
  delete_person(input, context) {
    return delightedDeletePerson(input, context);
  },
  list_survey_responses(input, context) {
    return delightedListSurveyResponses(input, context);
  },
  get_metrics(input, context) {
    return delightedGetMetrics(input, context);
  },
};

export async function validateDelightedCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await requestDelightedJson({
    apiKey,
    fetcher,
    signal,
    path: delightedValidationPath,
    mode: "validate",
  });
  const metrics = requiredRecord(response.payload, "metrics", providerError);

  return {
    profile: {
      displayName: "Delighted API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: delightedApiBaseUrl,
      validationEndpoint: delightedValidationPath,
      nps: optionalInteger(metrics.nps),
      promoter_count: optionalInteger(metrics.promoter_count),
      passive_count: optionalInteger(metrics.passive_count),
      detractor_count: optionalInteger(metrics.detractor_count),
      response_count: optionalInteger(metrics.response_count),
    }),
  };
}

async function delightedCreateOrUpdatePerson(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  assertPersonCreateInput(input);
  const response = await requestDelightedJson({
    ...requestContext(context),
    path: "/people.json",
    method: "POST",
    mode: "execute",
    body: compactObject({
      email: optionalString(input.email),
      phone_number: optionalString(input.phone_number),
      channel: optionalString(input.channel),
      name: optionalString(input.name),
      delay: optionalInteger(input.delay),
      properties: optionalRecord(input.properties),
      send: optionalBoolean(input.send),
      last_sent_at: optionalInteger(input.last_sent_at),
      email_update: optionalString(input.email_update),
      phone_number_update: optionalString(input.phone_number_update),
    }),
  });

  return {
    person: requireObjectPayload(response.payload, "person"),
  };
}

async function delightedListPeople(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  if (optionalString(input.email) && optionalString(input.phone_number)) {
    throw new ProviderRequestError(400, "Only one of email or phone_number may be provided.");
  }
  const response = await requestDelightedJson({
    ...requestContext(context),
    path: "/people.json",
    mode: "execute",
    query: compactObject({
      per_page: optionalInteger(input.per_page),
      since: optionalInteger(input.since),
      until: optionalInteger(input.until),
      email: optionalString(input.email),
      phone_number: optionalString(input.phone_number),
      page_info: optionalString(input.page_info),
    }),
  });

  const people = requireArrayPayload(response.payload, "people");
  const nextPageUrl = parseNextLink(response.headers.get("link"));
  return {
    people,
    next_page_info: extractNextPageInfo(nextPageUrl),
    next_page_url: nextPageUrl,
  };
}

async function delightedListUnsubscribedPeople(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const perPage = optionalInteger(input.per_page) ?? 20;
  const page = optionalInteger(input.page) ?? 1;
  const response = await requestDelightedJson({
    ...requestContext(context),
    path: "/unsubscribes.json",
    mode: "execute",
    query: compactObject({
      per_page: perPage,
      page,
      since: optionalInteger(input.since),
      until: optionalInteger(input.until),
    }),
  });
  const unsubscribes = requireArrayPayload(response.payload, "unsubscribes");
  return { unsubscribes, next_page: unsubscribes.length >= perPage ? page + 1 : null };
}

async function delightedListBouncedPeople(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const perPage = optionalInteger(input.per_page) ?? 20;
  const page = optionalInteger(input.page) ?? 1;
  const response = await requestDelightedJson({
    ...requestContext(context),
    path: "/bounces.json",
    mode: "execute",
    query: compactObject({
      per_page: perPage,
      page,
      since: optionalInteger(input.since),
      until: optionalInteger(input.until),
    }),
  });
  const bounces = requireArrayPayload(response.payload, "bounces");
  return { bounces, next_page: bounces.length >= perPage ? page + 1 : null };
}

async function delightedUnsubscribePerson(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const response = await requestDelightedJson({
    ...requestContext(context),
    path: "/unsubscribes.json",
    method: "POST",
    mode: "execute",
    body: { person_email: optionalString(input.person_email) },
  });
  return requireOkPayload(response.payload);
}

async function delightedDeletePerson(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const response = await requestDelightedJson({
    ...requestContext(context),
    path: buildDeletePersonPath(input),
    method: "DELETE",
    mode: "execute",
  });
  return requireOkPayload(response.payload);
}

async function delightedListSurveyResponses(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const perPage = optionalInteger(input.per_page) ?? 20;
  const page = optionalInteger(input.page) ?? 1;
  const expand =
    Array.isArray(input.expand) && input.expand.length > 0 ? input.expand.map((entry) => String(entry)) : ["notes"];
  const response = await requestDelightedJson({
    ...requestContext(context),
    path: "/survey_responses.json",
    mode: "execute",
    query: compactObject({
      per_page: perPage,
      page,
      since: optionalInteger(input.since),
      until: optionalInteger(input.until),
      updated_since: optionalInteger(input.updated_since),
      updated_until: optionalInteger(input.updated_until),
      trend: optionalString(input.trend),
      person_id: optionalString(input.person_id),
      person_email: optionalString(input.person_email),
      order: optionalString(input.order),
      "expand[]": expand,
    }),
  });
  const responses = requireArrayPayload(response.payload, "responses");
  return { responses, next_page: responses.length >= perPage ? page + 1 : null };
}

async function delightedGetMetrics(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const response = await requestDelightedJson({
    ...requestContext(context),
    path: delightedValidationPath,
    mode: "execute",
    query: compactObject({
      since: optionalInteger(input.since),
      until: optionalInteger(input.until),
      trend: optionalString(input.trend),
      "groups[]": Array.isArray(input.groups) ? input.groups.map((group) => String(group)) : undefined,
    }),
  });
  return {
    metrics: requireObjectPayload(response.payload, "metrics"),
  };
}

function requestContext(
  context: ApiKeyProviderContext,
): Pick<DelightedRequestOptions, "apiKey" | "fetcher" | "signal"> {
  return {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
  };
}

async function requestDelightedJson(input: DelightedRequestOptions): Promise<DelightedResponse> {
  const timeout = createProviderTimeout(input.signal, delightedDefaultRequestTimeoutMs);
  try {
    const url = new URL(`${delightedApiBaseUrl}${input.path}`);
    appendQuery(url, input.query);
    const response = await input.fetcher(url.toString(), {
      method: input.method ?? (input.body === undefined ? "GET" : "POST"),
      headers: buildHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await parseResponsePayload(response);
    if (!response.ok) {
      throw mapDelightedError(payload, response, input.mode);
    }
    return { payload, headers: response.headers };
  } catch (error) {
    if (isAbortLikeError(error) && timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Delighted request timed out after 30 seconds");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function appendQuery(url: URL, query: Record<string, DelightedQueryValue> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, String(entry));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function buildHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapDelightedError(payload: unknown, response: Response, mode: "validate" | "execute"): ProviderRequestError {
  const message = pickErrorMessage(payload) ?? `Delighted request failed with status ${response.status}`;
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function pickErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const direct = optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  if (direct) {
    return direct;
  }
  if (Array.isArray(record.errors)) {
    for (const error of record.errors) {
      const nested = optionalRecord(error);
      const message =
        typeof error === "string" ? error : (optionalString(nested?.message) ?? optionalString(nested?.error));
      if (message) {
        return message;
      }
    }
  }
  return undefined;
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  return requiredRecord(payload, `Delighted ${label} response`, providerError);
}

function requireArrayPayload(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `Delighted ${label} response must be an array`);
  }
  return payload;
}

function requireOkPayload(payload: unknown): { ok: true } {
  const record = requireObjectPayload(payload, "mutation");
  if (record.ok !== true) {
    throw new ProviderRequestError(502, "Delighted mutation response must include ok=true");
  }
  return { ok: true };
}

function parseNextLink(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }
  for (const segment of headerValue.split(",")) {
    if (!segment.includes('rel="next"')) {
      continue;
    }
    const match = segment.match(/<([^>]+)>/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function extractNextPageInfo(nextPageUrl: string | null): string | null {
  if (!nextPageUrl) {
    return null;
  }
  try {
    return new URL(nextPageUrl).searchParams.get("page_info");
  } catch {
    return null;
  }
}

function buildDeletePersonPath(input: Record<string, unknown>): string {
  const identifiers = [
    optionalString(input.id),
    optionalString(input.email),
    optionalString(input.phone_number),
  ].filter(Boolean);
  if (identifiers.length !== 1) {
    throw new ProviderRequestError(400, "Exactly one delete person identifier is required.");
  }
  const id = optionalString(input.id);
  if (id) {
    return `/people/${encodeURIComponent(id)}`;
  }
  const email = optionalString(input.email);
  if (email) {
    return `/people/email:${encodeURIComponent(email)}`;
  }
  return `/people/phone_number:${encodeURIComponent(optionalString(input.phone_number) ?? "")}`;
}

function assertPersonCreateInput(input: Record<string, unknown>): void {
  if (!optionalString(input.email) && !optionalString(input.phone_number)) {
    throw new ProviderRequestError(400, "Either email or phone_number is required.");
  }
  if (input.channel === "sms" && !optionalString(input.phone_number)) {
    throw new ProviderRequestError(400, "phone_number is required when channel is sms.");
  }
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
