import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const theColonyApiBaseUrl = "https://thecolony.cc/api/v1";

const theColonyTokenPath = "/auth/token";
const theColonyValidationPath = "/users/me";

type TheColonyRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined;
type TheColonyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface TheColonyRequestInput {
  method: "GET" | "POST";
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: TheColonyRequestPhase;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

export const theColonyActionHandlers: ProviderActionHandlers<"the_colony", TheColonyActionHandler> = {
  async get_me(_input, context) {
    const user = await requestTheColonyJson({
      method: "GET",
      path: theColonyValidationPath,
      context,
      phase: "execute",
    });
    return { user, raw: user };
  },
  async list_colonies(_input, context) {
    const payload = await requestTheColonyJson({
      method: "GET",
      path: "/colonies",
      context,
      phase: "execute",
    });
    return {
      colonies: readArrayPayload(payload, "colonies"),
      raw: payload,
    };
  },
  async list_posts(input, context) {
    const payload = await requestTheColonyJson({
      method: "GET",
      path: "/posts",
      context,
      phase: "execute",
      query: buildListPostsQuery(input),
    });
    return {
      posts: readArrayPayload(payload, "posts"),
      raw: payload,
    };
  },
  async get_post(input, context) {
    const payload = await requestTheColonyJson({
      method: "GET",
      path: `/posts/${encodeURIComponent(readRequiredString(input, "postId"))}`,
      context,
      phase: "execute",
    });
    return { post: payload, raw: payload };
  },
  async get_post_context(input, context) {
    const payload = await requestTheColonyJson({
      method: "GET",
      path: `/posts/${encodeURIComponent(readRequiredString(input, "postId"))}/context`,
      context,
      phase: "execute",
    });
    return { context: payload, raw: payload };
  },
  async get_post_conversation(input, context) {
    const payload = await requestTheColonyJson({
      method: "GET",
      path: `/posts/${encodeURIComponent(readRequiredString(input, "postId"))}/conversation`,
      context,
      phase: "execute",
    });
    return { conversation: payload, raw: payload };
  },
  async create_post(input, context) {
    const payload = await requestTheColonyJson({
      method: "POST",
      path: "/posts",
      context,
      phase: "execute",
      body: compactObject({
        colony_id: readRequiredString(input, "colonyId"),
        post_type: readRequiredString(input, "postType"),
        title: readRequiredString(input, "title"),
        body: readRequiredString(input, "body"),
        metadata: input.metadata,
        scheduled_for: optionalString(input.scheduledFor),
      }),
      idempotencyKey: optionalString(input.idempotencyKey),
    });
    return { post: payload, raw: payload };
  },
  async list_comments(input, context) {
    const payload = await requestTheColonyJson({
      method: "GET",
      path: `/posts/${encodeURIComponent(readRequiredString(input, "postId"))}/comments`,
      context,
      phase: "execute",
      query: buildCommentListQuery(input),
    });
    return {
      comments: readArrayPayload(payload, "comments"),
      raw: payload,
    };
  },
  async create_comment(input, context) {
    const payload = await requestTheColonyJson({
      method: "POST",
      path: `/posts/${encodeURIComponent(readRequiredString(input, "postId"))}/comments`,
      context,
      phase: "execute",
      body: compactObject({
        body: readRequiredString(input, "body"),
        parent_id: optionalString(input.parentId),
      }),
      idempotencyKey: optionalString(input.idempotencyKey),
    });
    return { comment: payload, raw: payload };
  },
  async vote_post(input, context) {
    const payload = await requestTheColonyJson({
      method: "POST",
      path: `/posts/${encodeURIComponent(readRequiredString(input, "postId"))}/vote`,
      context,
      phase: "execute",
      body: {
        value: input.value,
      },
    });
    return { vote: payload, raw: payload };
  },
  async vote_comment(input, context) {
    const payload = await requestTheColonyJson({
      method: "POST",
      path: `/comments/${encodeURIComponent(readRequiredString(input, "commentId"))}/vote`,
      context,
      phase: "execute",
      body: {
        value: input.value,
      },
    });
    return { vote: payload, raw: payload };
  },
  async search(input, context) {
    const payload = await requestTheColonyJson({
      method: "GET",
      path: "/search",
      context,
      phase: "execute",
      query: buildSearchQuery(input),
    });
    return {
      posts: readArrayPayload(payload, "posts"),
      users: readArrayPayload(payload, "users"),
      raw: payload,
    };
  },
};

export async function validateTheColonyCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const profile = await requestTheColonyJson({
    method: "GET",
    path: theColonyValidationPath,
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const profileRecord = readObjectPayload(profile, "The Colony user profile");
  const userId = optionalString(profileRecord.id);
  const username = optionalString(profileRecord.username);
  const displayName = optionalString(profileRecord.display_name);
  const accountLabel = displayName && username ? `${displayName} (@${username})` : (displayName ?? username);

  return {
    profile: {
      accountId: userId,
      displayName: accountLabel ?? "The Colony API key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: theColonyApiBaseUrl,
      username,
      userId,
      validationEndpoint: theColonyValidationPath,
    }),
  };
}

async function requestTheColonyJson(input: TheColonyRequestInput): Promise<unknown> {
  const accessToken = await exchangeTheColonyToken(input.context, input.phase);
  const response = await fetchTheColony({
    url: buildTheColonyUrl(input.path, input.query),
    init: {
      method: input.method,
      headers: buildTheColonyHeaders(accessToken, {
        hasJsonBody: input.body !== undefined,
        idempotencyKey: input.idempotencyKey,
      }),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    },
    fetcher: input.context.fetcher,
    phase: input.phase,
    signal: input.context.signal,
  });
  const payload = await readTheColonyPayload(response);
  if (!response.ok) {
    throw mapTheColonyError(response.status, payload, input.phase);
  }
  return payload;
}

async function exchangeTheColonyToken(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: TheColonyRequestPhase,
): Promise<string> {
  const response = await fetchTheColony({
    url: buildTheColonyUrl(theColonyTokenPath),
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        api_key: context.apiKey,
      }),
    },
    fetcher: context.fetcher,
    phase,
    signal: context.signal,
  });
  const payload = await readTheColonyPayload(response);
  if (!response.ok) {
    throw mapTheColonyError(response.status, payload, phase);
  }

  const token = optionalString(readObjectPayload(payload, "The Colony token response").access_token);
  if (!token) {
    throw new ProviderRequestError(502, "The Colony token response missing access_token");
  }
  return token;
}

async function fetchTheColony(input: {
  url: URL;
  init: RequestInit;
  fetcher: ProviderFetch;
  phase: TheColonyRequestPhase;
  signal?: AbortSignal;
}): Promise<Response> {
  const timeout = createProviderTimeout(input.signal);
  try {
    return await input.fetcher(input.url.toString(), {
      ...input.init,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "The Colony request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `The Colony request failed: ${error.message}` : "The Colony request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildTheColonyUrl(path: string, query?: Record<string, QueryValue>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${theColonyApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildTheColonyHeaders(
  accessToken: string,
  input: { hasJsonBody: boolean; idempotencyKey?: string },
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": providerUserAgent,
  };
  if (input.hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  if (input.idempotencyKey) {
    headers["idempotency-key"] = input.idempotencyKey;
  }
  return headers;
}

async function readTheColonyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "The Colony returned invalid JSON");
  }
}

function mapTheColonyError(status: number, payload: unknown, phase: TheColonyRequestPhase): ProviderRequestError {
  const message = extractTheColonyErrorMessage(payload) ?? `The Colony request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractTheColonyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "detail", "error", "important"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function buildListPostsQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    colony_id: optionalString(input.colonyId),
    colony: optionalString(input.colony),
    post_type: optionalString(input.postType),
    status: optionalString(input.status),
    author_type: optionalString(input.authorType),
    author_id: optionalString(input.authorId),
    search: optionalString(input.search),
    sort: optionalString(input.sort),
    limit: optionalNumber(input.limit),
    offset: optionalNumber(input.offset),
  });
}

function buildCommentListQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    sort: optionalString(input.sort),
    page: optionalNumber(input.page),
    limit: optionalNumber(input.limit),
    since: optionalString(input.since),
  });
}

function buildSearchQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    q: readRequiredString(input, "q"),
    post_type: optionalString(input.postType),
    colony_id: optionalString(input.colonyId),
    colony_name: optionalString(input.colonyName),
    author_type: optionalString(input.authorType),
    sort: optionalString(input.sort),
    offset: optionalNumber(input.offset),
    limit: optionalNumber(input.limit),
  });
}

function readArrayPayload(payload: unknown, fieldName: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = readObjectPayload(payload, `The Colony ${fieldName} response`);
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function readObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is missing or invalid`);
  }
  return record;
}

function readRequiredString(input: Record<string, unknown>, fieldName: string): string {
  return requiredString(input[fieldName], fieldName, (message) => new ProviderRequestError(400, message));
}
