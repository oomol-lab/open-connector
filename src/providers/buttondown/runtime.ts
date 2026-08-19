import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const buttondownApiBaseUrl = "https://api.buttondown.com/v1/";

type ButtondownPhase = "validate" | "execute";
type ButtondownActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface ButtondownFetchInput extends RequestInit {
  apiKey: string;
  fetcher: ProviderFetch;
}

export const buttondownActionHandlers: ProviderActionHandlers<"buttondown", ButtondownActionHandler> = {
  get_account(_input, context) {
    return getAccount(context);
  },
  list_newsletters(input, context) {
    return listNewsletters(input, context);
  },
  list_subscribers(input, context) {
    return listSubscribers(input, context);
  },
  get_subscriber(input, context) {
    return getSubscriber(input, context);
  },
  create_subscriber(input, context) {
    return createSubscriber(input, context);
  },
  update_subscriber(input, context) {
    return updateSubscriber(input, context);
  },
  delete_subscriber(input, context) {
    return deleteSubscriber(input, context);
  },
  list_tags(input, context) {
    return listTags(input, context);
  },
  create_tag(input, context) {
    return createTag(input, context);
  },
  get_tag(input, context) {
    return getTag(input, context);
  },
  update_tag(input, context) {
    return updateTag(input, context);
  },
  delete_tag(input, context) {
    return deleteTag(input, context);
  },
};

export async function validateButtondownCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestJson(
    "accounts/me",
    {},
    {
      apiKey,
      fetcher,
      signal,
    },
    "validate",
  );
  const account = normalizeObject(payload, "Buttondown account");
  const username = optionalString(account.username);
  const emailAddress = optionalString(account.email_address);

  return {
    profile: {
      accountId: emailAddress ?? username ?? "buttondown:api_key",
      displayName: emailAddress ?? username ?? "Buttondown Account",
    },
    grantedScopes: [],
    metadata: compactObject({
      username,
      email_address: emailAddress,
    }),
  };
}

async function getAccount(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await requestJson("accounts/me", {}, context, "execute");
  return normalizeObject(payload, "Buttondown account");
}

async function listNewsletters(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestJson(
    buildPath(
      "newsletters",
      compactObject({ page: optionalInteger(input.page), page_size: optionalInteger(input.page_size) }),
    ),
    {},
    context,
    "execute",
  );
  const page = normalizePage(payload, "Buttondown newsletters page");
  return {
    newsletters: page.results.map(normalizeNewsletter),
    page: page.info,
  };
}

async function listSubscribers(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestJson(
    buildPath(
      "subscribers",
      compactObject({
        page: optionalInteger(input.page),
        email_address: optionalString(input.email_address),
        type: optionalString(input.type),
        tag: input.tag,
        date__start: optionalString(input.date__start),
        date__end: optionalString(input.date__end),
      }),
    ),
    {},
    context,
    "execute",
  );
  const page = normalizePage(payload, "Buttondown subscribers page");
  return {
    subscribers: page.results.map(normalizeSubscriber),
    page: page.info,
  };
}

async function getSubscriber(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const idOrEmail = requireNonEmptyString(input.id_or_email, "id_or_email");
  const payload = await requestJson(`subscribers/${encodeURIComponent(idOrEmail)}`, {}, context, "execute");
  return { subscriber: normalizeSubscriber(payload) };
}

async function createSubscriber(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestJson(
    "subscribers",
    {
      method: "POST",
      headers: mutationHeaders(
        compactStringObject({
          "X-Buttondown-Collision-Behavior": optionalString(input.collision_behavior),
          "X-Buttondown-Bypass-Firewall": optionalBoolean(input.bypass_firewall)?.toString(),
        }),
      ),
      body: JSON.stringify(
        compactObject({
          email_address: optionalString(input.email_address),
          notes: optionalString(input.notes),
          metadata: input.metadata,
          tags: input.tags,
          referrer_url: optionalString(input.referrer_url),
          utm_campaign: optionalString(input.utm_campaign),
          utm_medium: optionalString(input.utm_medium),
          utm_source: optionalString(input.utm_source),
          type: input.type,
          ip_address: input.ip_address,
        }),
      ),
    },
    context,
    "execute",
  );
  return { subscriber: normalizeSubscriber(payload) };
}

async function updateSubscriber(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const idOrEmail = requireNonEmptyString(input.id_or_email, "id_or_email");
  const payload = await requestJson(
    `subscribers/${encodeURIComponent(idOrEmail)}`,
    {
      method: "PATCH",
      headers: mutationHeaders(),
      body: JSON.stringify(
        compactObject({
          commenting_disabled: input.commenting_disabled,
          email_address: input.email_address,
          notes: input.notes,
          metadata: input.metadata,
          tags: input.tags,
          referrer_url: input.referrer_url,
          type: input.type,
          unsubscription_reason: input.unsubscription_reason,
        }),
      ),
    },
    context,
    "execute",
  );
  return { subscriber: normalizeSubscriber(payload) };
}

async function deleteSubscriber(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const idOrEmail = requireNonEmptyString(input.id_or_email, "id_or_email");
  await requestNoContent(`subscribers/${encodeURIComponent(idOrEmail)}`, { method: "DELETE" }, context);
  return { id_or_email: idOrEmail, deleted: true };
}

async function listTags(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestJson(
    buildPath(
      "tags",
      compactObject({ page: optionalInteger(input.page), page_size: optionalInteger(input.page_size) }),
    ),
    {},
    context,
    "execute",
  );
  const page = normalizePage(payload, "Buttondown tags page");
  return {
    tags: page.results.map(normalizeTag),
    page: page.info,
  };
}

async function createTag(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestJson(
    "tags",
    {
      method: "POST",
      headers: mutationHeaders(
        compactStringObject({
          "X-Buttondown-Collision-Behavior": optionalString(input.collision_behavior),
        }),
      ),
      body: JSON.stringify(
        compactObject({
          name: optionalString(input.name),
          color: optionalString(input.color),
          description: input.description,
          public_description: input.public_description,
          subscriber_editable: optionalBoolean(input.subscriber_editable),
        }),
      ),
    },
    context,
    "execute",
  );
  return { tag: normalizeTag(payload) };
}

async function getTag(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const id = requireNonEmptyString(input.id, "id");
  const payload = await requestJson(`tags/${encodeURIComponent(id)}`, {}, context, "execute");
  return { tag: normalizeTag(payload) };
}

async function updateTag(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const id = requireNonEmptyString(input.id, "id");
  const payload = await requestJson(
    `tags/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: mutationHeaders(),
      body: JSON.stringify(
        compactObject({
          name: input.name,
          color: input.color,
          description: input.description,
          public_description: input.public_description,
          secondary_id: input.secondary_id,
          subscriber_editable: input.subscriber_editable,
        }),
      ),
    },
    context,
    "execute",
  );
  return { tag: normalizeTag(payload) };
}

async function deleteTag(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const id = requireNonEmptyString(input.id, "id");
  await requestNoContent(`tags/${encodeURIComponent(id)}`, { method: "DELETE" }, context);
  return { id, deleted: true };
}

async function requestJson(
  path: string,
  init: RequestInit,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ButtondownPhase,
): Promise<unknown> {
  const response = await buttondownFetch(path, { ...init, ...context });
  const payload = await readButtondownPayload(response);
  if (!response.ok) {
    throw createButtondownError(response, payload, phase);
  }
  return payload;
}

async function requestNoContent(
  path: string,
  init: RequestInit,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<void> {
  const response = await buttondownFetch(path, { ...init, ...context });
  const payload = await readButtondownPayload(response);
  if (!response.ok) {
    throw createButtondownError(response, payload, "execute");
  }
}

function buttondownFetch(path: string, input: ButtondownFetchInput): Promise<Response> {
  return input.fetcher(new URL(path, buttondownApiBaseUrl), {
    ...input,
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
      Authorization: `Token ${input.apiKey}`,
      ...input.headers,
    },
    signal: input.signal ?? undefined,
  });
}

function mutationHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    "content-type": "application/json",
    ...headers,
  };
}

async function readButtondownPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

function createButtondownError(response: Response, payload: unknown, phase: ButtondownPhase): ProviderRequestError {
  const status = response.status;
  const message = extractErrorMessage(payload) ?? `Buttondown request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status, message);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const detail = record.detail ?? record.error ?? record.message;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => extractErrorMessage(item) ?? String(item)).join("; ");
  }
  return undefined;
}

function normalizePage(
  payload: unknown,
  label: string,
): {
  results: Record<string, unknown>[];
  info: Record<string, unknown>;
} {
  const record = normalizeObject(payload, label);
  const results = Array.isArray(record.results) ? record.results.map((item) => normalizeObject(item, label)) : [];
  return {
    results,
    info: compactObject({
      count: typeof record.count === "number" ? record.count : results.length,
      next: typeof record.next === "string" || record.next === null ? record.next : undefined,
      previous: typeof record.previous === "string" || record.previous === null ? record.previous : undefined,
    }),
  };
}

function normalizeNewsletter(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Buttondown newsletter");
  return {
    ...record,
    id: optionalString(record.id) ?? "",
    creation_date: optionalString(record.creation_date) ?? "",
    username: optionalString(record.username),
    name: optionalString(record.name),
    description: record.description ?? undefined,
    raw: record,
  };
}

function normalizeSubscriber(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Buttondown subscriber");
  return {
    ...record,
    id: optionalString(record.id) ?? "",
    creation_date: optionalString(record.creation_date) ?? "",
    email_address: optionalString(record.email_address) ?? "",
    metadata: optionalRecord(record.metadata) ?? {},
    tags: normalizeStringArray(record.tags),
    raw: record,
  };
}

function normalizeTag(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Buttondown tag");
  return {
    ...record,
    id: optionalString(record.id) ?? "",
    creation_date: optionalString(record.creation_date) ?? "",
    name: optionalString(record.name) ?? "",
    color: optionalString(record.color) ?? "",
    raw: record,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response must be an object`);
  }
  return record;
}

function compactStringObject(value: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function buildPath(pathname: string, query: Record<string, unknown>): string {
  const url = new URL(pathname, buttondownApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}
