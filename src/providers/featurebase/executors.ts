import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { FeaturebaseActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "featurebase";
const featurebaseApiBaseUrl = "https://do.featurebase.app";
const featurebaseValidationPath = "/v2/boards";
const featurebaseApiVersion = "2026-01-01.nova";

type FeaturebaseRequestPhase = "validate" | "execute";

interface FeaturebaseActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type FeaturebaseActionHandler = (input: Record<string, unknown>, context: FeaturebaseActionContext) => Promise<unknown>;

export const featurebaseActionHandlers: Record<FeaturebaseActionName, FeaturebaseActionHandler> = {
  list_boards(_input, context) {
    return listFeaturebaseObjects("/v2/boards", {}, context);
  },
  get_board(input, context) {
    return getFeaturebaseObject(`/v2/boards/${encodeURIComponent(String(input.id))}`, context);
  },
  list_posts(input, context) {
    return listFeaturebaseObjects("/v2/posts", buildListPostsQuery(input), context);
  },
  create_post(input, context) {
    return writeFeaturebaseObject("/v2/posts", "POST", buildPostBody(input), context);
  },
  get_post(input, context) {
    return getFeaturebaseObject(`/v2/posts/${encodeURIComponent(String(input.id))}`, context);
  },
  update_post(input, context) {
    return writeFeaturebaseObject(
      `/v2/posts/${encodeURIComponent(String(input.id))}`,
      "PATCH",
      buildPostBody(input),
      context,
    );
  },
  delete_post(input, context) {
    return deleteFeaturebaseObject(`/v2/posts/${encodeURIComponent(String(input.id))}`, context);
  },
  list_contacts(input, context) {
    return listFeaturebaseObjects("/v2/contacts", buildListContactsQuery(input), context);
  },
  upsert_contact(input, context) {
    return writeFeaturebaseObject("/v2/contacts", "POST", buildContactBody(input), context);
  },
  get_contact(input, context) {
    return getFeaturebaseObject(`/v2/contacts/${encodeURIComponent(String(input.id))}`, context);
  },
  delete_contact(input, context) {
    return deleteFeaturebaseObject(`/v2/contacts/${encodeURIComponent(String(input.id))}`, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, featurebaseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await validateFeaturebaseApiKey(input.apiKey, fetcher, signal);

    return {
      profile: {
        accountId: "api_key",
        displayName: "Featurebase API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: featurebaseApiBaseUrl,
        apiVersion: featurebaseApiVersion,
        validationEndpoint: featurebaseValidationPath,
        validationMode: "list_boards_probe",
      },
    };
  },
};

async function validateFeaturebaseApiKey(apiKey: string, fetcher: typeof fetch, signal?: AbortSignal): Promise<void> {
  const response = await featurebaseFetch(new URL(featurebaseValidationPath, featurebaseApiBaseUrl), {
    method: "GET",
    headers: featurebaseHeaders(apiKey),
    fetcher,
    signal,
  });
  const payload = await readFeaturebasePayload(response);
  if (!response.ok) {
    throw createFeaturebaseError(response, payload, "validate");
  }
}

async function listFeaturebaseObjects(
  path: string,
  query: Record<string, string>,
  context: FeaturebaseActionContext,
): Promise<unknown> {
  const url = new URL(path, featurebaseApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const payload = await requestFeaturebase(url, { method: "GET", context });
  return normalizeListPayload(payload);
}

async function getFeaturebaseObject(path: string, context: FeaturebaseActionContext): Promise<unknown> {
  const payload = await requestFeaturebase(new URL(path, featurebaseApiBaseUrl), {
    method: "GET",
    context,
  });
  return { object: normalizeObjectPayload(payload) };
}

async function writeFeaturebaseObject(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
  context: FeaturebaseActionContext,
): Promise<unknown> {
  const payload = await requestFeaturebase(new URL(path, featurebaseApiBaseUrl), {
    method,
    context,
    body: JSON.stringify(body),
  });
  return { object: normalizeObjectPayload(payload) };
}

async function deleteFeaturebaseObject(path: string, context: FeaturebaseActionContext): Promise<unknown> {
  const payload = await requestFeaturebase(new URL(path, featurebaseApiBaseUrl), {
    method: "DELETE",
    context,
  });
  return normalizeDeletePayload(payload);
}

async function requestFeaturebase(
  url: URL,
  input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    context: FeaturebaseActionContext;
    body?: BodyInit;
  },
): Promise<unknown> {
  const response = await featurebaseFetch(url, {
    method: input.method,
    headers: input.body ? featurebaseJsonHeaders(input.context.apiKey) : featurebaseHeaders(input.context.apiKey),
    fetcher: input.context.fetcher,
    body: input.body,
    signal: input.context.signal,
  });
  const payload = await readFeaturebasePayload(response);
  if (!response.ok) {
    throw createFeaturebaseError(response, payload, "execute");
  }
  return payload;
}

function buildListPostsQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
    boardId: optionalString(input.boardId),
    statusId: optionalString(input.statusId),
    tags: Array.isArray(input.tags)
      ? input.tags.filter((item): item is string => typeof item === "string").join(",")
      : undefined,
    q: optionalString(input.q),
    inReview: optionalBoolean(input.inReview),
    sortBy: optionalString(input.sortBy),
  });
}

function buildListContactsQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
    contactType: optionalString(input.contactType),
  });
}

function buildPostBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: optionalString(input.title),
    boardId: optionalString(input.boardId),
    content: optionalString(input.content),
    tags: Array.isArray(input.tags) ? input.tags.filter((item): item is string => typeof item === "string") : undefined,
    statusId: optionalString(input.statusId),
    commentsEnabled: optionalBoolean(input.commentsEnabled),
    inReview: optionalBoolean(input.inReview),
    customFields: input.customFields,
    eta: input.eta,
    assigneeId: input.assigneeId,
    visibility: optionalString(input.visibility),
    author: input.author,
    createdAt: input.createdAt,
    sendStatusUpdateEmail: optionalBoolean(input.sendStatusUpdateEmail),
  });
}

function buildContactBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = compactObject({
    email: optionalString(input.email),
    userId: optionalString(input.userId),
    name: optionalString(input.name),
    profilePicture: optionalString(input.profilePicture),
    companies: input.companies,
    customFields: input.customFields,
    subscribedToChangelog: optionalBoolean(input.subscribedToChangelog),
    locale: optionalString(input.locale),
    phone: optionalString(input.phone),
    roles: input.roles,
    userHash: optionalString(input.userHash),
    createdAt: optionalString(input.createdAt),
  });
  if (!body.email && !body.userId) {
    throw new ProviderRequestError(400, "featurebase contact upsert requires email or userId");
  }
  return body;
}

function featurebaseHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

function featurebaseJsonHeaders(apiKey: string): Record<string, string> {
  return {
    ...featurebaseHeaders(apiKey),
    "content-type": "application/json",
  };
}

async function featurebaseFetch(
  url: URL,
  input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    headers: HeadersInit;
    fetcher: typeof fetch;
    body?: BodyInit;
    signal?: AbortSignal;
  },
): Promise<Response> {
  try {
    return await input.fetcher(url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `featurebase request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }
}

async function readFeaturebasePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "featurebase returned malformed JSON");
    }
    return { message: text };
  }
}

function normalizeListPayload(payload: unknown): Record<string, unknown> {
  const object = asFeaturebaseObject(payload);
  const data = Array.isArray(object.data)
    ? object.data.filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)))
    : [];
  return {
    object: typeof object.object === "string" ? object.object : "list",
    data,
    nextCursor: typeof object.nextCursor === "string" ? object.nextCursor : null,
  };
}

function normalizeObjectPayload(payload: unknown): Record<string, unknown> {
  return asFeaturebaseObject(payload);
}

function normalizeDeletePayload(payload: unknown): Record<string, unknown> {
  const object = asFeaturebaseObject(payload);
  return {
    id: typeof object.id === "string" ? object.id : "",
    object: typeof object.object === "string" ? object.object : "deleted",
    deleted: object.deleted === true,
  };
}

function asFeaturebaseObject(value: unknown): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, "featurebase returned a non-object response");
  }
  return object;
}

function createFeaturebaseError(
  response: Response,
  payload: unknown,
  phase: FeaturebaseRequestPhase,
): ProviderRequestError {
  const message = readFeaturebaseErrorMessage(payload) ?? `featurebase request failed with ${response.status}`;
  const isAuthFailure = response.status === 401 || response.status === 403;
  if (isAuthFailure && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (isAuthFailure) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(phase === "validate" ? 400 : response.status || 502, message, payload);
}

function readFeaturebaseErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  if (typeof object.message === "string") {
    return object.message;
  }
  if (typeof object.error === "string") {
    return object.error;
  }
  const errors = object.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => {
      const record = optionalRecord(item);
      return typeof record?.message === "string";
    });
    const record = optionalRecord(first);
    if (typeof record?.message === "string") {
      return record.message;
    }
  }
  return undefined;
}
