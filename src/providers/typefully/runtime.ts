import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { providerInputError, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const typefullyApiBaseUrl = "https://api.typefully.com";

const typefullyValidationPath = "/v2/me";

type TypefullyJsonObject = Record<string, unknown>;
type TypefullyActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface TypefullyRequestOptions {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

export const typefullyActionHandlers: ProviderActionHandlers<"typefully", TypefullyActionHandler> = {
  get_current_user(_input, context) {
    return requestTypefullyJson({
      apiKey: context.apiKey,
      path: typefullyValidationPath,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
  },
  list_social_sets(input, context) {
    return requestTypefullyJson({
      apiKey: context.apiKey,
      path: "/v2/social-sets",
      query: paginationQuery(input),
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
  },
  get_social_set(input, context) {
    return requestTypefullyJson({
      apiKey: context.apiKey,
      path: `/v2/social-sets/${encodeURIComponent(requireInputString(input.social_set_id, "social_set_id"))}/`,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
  },
  list_drafts(input, context) {
    return requestTypefullyJson({
      apiKey: context.apiKey,
      path: `/v2/social-sets/${encodeURIComponent(requireInputString(input.social_set_id, "social_set_id"))}/drafts`,
      query: compactObject({
        ...paginationQuery(input),
        status: optionalString(input.status),
        platform: optionalString(input.platform),
        from_date: optionalString(input.from_date),
        to_date: optionalString(input.to_date),
      }),
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
  },
  create_draft(input, context) {
    return requestTypefullyJson({
      apiKey: context.apiKey,
      path: `/v2/social-sets/${encodeURIComponent(requireInputString(input.social_set_id, "social_set_id"))}/drafts`,
      method: "POST",
      body: requiredRecord(input.body, "body", providerInputError),
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
  },
  get_draft(input, context) {
    return requestTypefullyJson({
      apiKey: context.apiKey,
      path: `/v2/social-sets/${encodeURIComponent(requireInputString(input.social_set_id, "social_set_id"))}/drafts/${encodeURIComponent(requireInputString(input.draft_id, "draft_id"))}`,
      query: compactObject({
        exclude_comment_markers:
          typeof input.exclude_comment_markers === "boolean" ? input.exclude_comment_markers : undefined,
      }),
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
  },
  update_draft(input, context) {
    return requestTypefullyJson({
      apiKey: context.apiKey,
      path: `/v2/social-sets/${encodeURIComponent(requireInputString(input.social_set_id, "social_set_id"))}/drafts/${encodeURIComponent(requireInputString(input.draft_id, "draft_id"))}`,
      method: "PATCH",
      query: compactObject({
        exclude_comment_markers:
          typeof input.exclude_comment_markers === "boolean" ? input.exclude_comment_markers : undefined,
      }),
      body: requiredRecord(input.body, "body", providerInputError),
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
  },
  async delete_draft(input, context) {
    const response = await typefullyFetch({
      apiKey: context.apiKey,
      path: `/v2/social-sets/${encodeURIComponent(requireInputString(input.social_set_id, "social_set_id"))}/drafts/${encodeURIComponent(requireInputString(input.draft_id, "draft_id"))}`,
      method: "DELETE",
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });

    if (!response.ok) {
      const payload = await parseTypefullyErrorPayload(response);
      throw toTypefullyError(response, payload, "execute");
    }

    return { deleted: true };
  },
};

export async function validateTypefullyCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
}> {
  const payload = await requestTypefullyJson({
    apiKey,
    path: typefullyValidationPath,
    fetcher,
    mode: "validate",
    signal,
  });

  const userId = payload.id === undefined ? undefined : String(payload.id);
  const name = optionalString(payload.name);
  const email = optionalString(payload.email);
  const apiKeyLabel = optionalString(payload.api_key_label);

  return {
    profile: {
      accountId: userId ? `typefully:user:${userId}` : "typefully",
      displayName: apiKeyLabel ?? name ?? email ?? "Typefully API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      validationEndpoint: typefullyValidationPath,
      userId,
      name,
      email,
      apiKeyLabel,
    }),
  };
}

async function requestTypefullyJson(input: TypefullyRequestOptions): Promise<TypefullyJsonObject> {
  const response = await typefullyFetch(input);
  if (!response.ok) {
    const payload = await parseTypefullyErrorPayload(response);
    throw toTypefullyError(response, payload, input.mode);
  }
  return parseTypefullyJson(response);
}

async function typefullyFetch(input: TypefullyRequestOptions): Promise<Response> {
  const url = new URL(input.path, typefullyApiBaseUrl);
  const method = input.method ?? "GET";
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  try {
    return await input.fetcher(url, {
      method,
      headers: typefullyHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Typefully request failed for ${method} ${url.toString()}: ${message}`);
  }
}

function typefullyHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function parseTypefullyJson(response: Response): Promise<TypefullyJsonObject> {
  const payload = await parseOptionalTypefullyJson(response);
  if (payload) {
    return payload;
  }

  throw new ProviderRequestError(502, "Typefully returned an empty response body");
}

async function parseOptionalTypefullyJson(response: Response): Promise<TypefullyJsonObject | null> {
  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Failed to read Typefully response body: ${error.message}`
        : "Failed to read Typefully response body",
    );
  }

  if (raw.trim() === "") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Typefully returned invalid JSON");
  }

  const payload = optionalRecord(parsed);
  if (!payload) {
    throw new ProviderRequestError(502, "Typefully returned a non-object JSON payload");
  }

  return payload;
}

async function parseTypefullyErrorPayload(response: Response): Promise<TypefullyJsonObject | null> {
  try {
    return await parseOptionalTypefullyJson(response);
  } catch {
    return null;
  }
}

function toTypefullyError(
  response: Response,
  payload: TypefullyJsonObject | null,
  mode: "validate" | "execute",
): ProviderRequestError {
  const error = optionalRecord(payload?.error);
  const message =
    optionalString(error?.message) ??
    optionalString(payload?.message) ??
    `Typefully request failed with status ${response.status}`;

  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message);
  }

  if (response.status === 400 || response.status === 404 || response.status === 409) {
    return new ProviderRequestError(response.status === 404 ? 404 : 400, message);
  }

  if (response.status === 403 || response.status === 402) {
    return new ProviderRequestError(response.status, message);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : 500, message);
}

function paginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return {
    limit: typeof input.limit === "number" ? input.limit : undefined,
    offset: typeof input.offset === "number" ? input.offset : undefined,
  };
}

function requireInputString(value: unknown, fieldName: string): string {
  if (typeof value === "number") {
    return String(value);
  }

  return requiredString(value, fieldName, providerInputError);
}
