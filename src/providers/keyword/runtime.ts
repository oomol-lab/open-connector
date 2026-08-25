import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const keywordApiBaseUrl = "https://app.keyword.com";

const keywordApiPathPrefix = "/api/v2";
const keywordDefaultRequestTimeoutMs = 30_000;

type KeywordRequestPhase = "validate" | "execute";

export const keywordActionHandlers: ProviderActionHandlers<
  "keyword",
  (input: Record<string, unknown>, context: KeywordRequestContext) => Promise<unknown>
> = {
  get_current_user: (_input, context) =>
    requestKeywordJson(context, {
      path: "/users/self",
    }).then((payload) => ({ user: normalizeKeywordUser(readDataObject(payload)) })),
  list_projects: (_input, context) =>
    requestKeywordJson(context, {
      path: "/groups/active",
    }).then((payload) => ({
      projects: readDataArray(payload).map(normalizeKeywordProject),
    })),
  get_project: (input, context) =>
    requestKeywordJson(context, {
      path: `/groups/${encodeURIComponent(readRequiredString(input, "projectName"))}`,
    }).then((payload) => ({ project: normalizeKeywordProject(readDataObject(payload)) })),
  list_keywords: (input, context) =>
    requestKeywordJson(context, {
      path: `/groups/${encodeURIComponent(readRequiredString(input, "projectName"))}/keywords`,
      query: compactObject({
        page: stringifyOptionalInteger(optionalInteger(input.page)),
        per_page: stringifyOptionalInteger(optionalInteger(input.perPage)),
        date: optionalString(input.date),
      }),
    }).then((payload) => ({
      keywords: readDataArray(payload).map(normalizeKeyword),
      meta: optionalRecord(optionalRecord(payload)?.meta) ?? null,
      links: optionalRecord(optionalRecord(payload)?.links) ?? null,
    })),
  get_keyword: (input, context) =>
    requestKeywordJson(context, {
      path: `/groups/${encodeURIComponent(readRequiredString(input, "projectName"))}/keywords/${encodeURIComponent(readRequiredString(input, "keywordId"))}`,
      query: compactObject({
        date: optionalString(input.date),
      }),
    }).then((payload) => ({ keyword: normalizeKeyword(readDataObject(payload)) })),
  list_project_regions: (input, context) =>
    requestKeywordJson(context, {
      path: `/groups/${encodeURIComponent(readRequiredString(input, "projectName"))}/regions`,
    }).then((payload) => ({
      regions: readDataArray(payload).map(normalizeKeywordRegion),
    })),
};

export interface KeywordRequestContext {
  apiKey: string;
  fetcher: typeof fetch;
  phase: KeywordRequestPhase;
  signal?: AbortSignal;
}

export async function validateKeywordCredential(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  const payload = await requestKeywordJson(
    {
      apiKey: input.apiKey,
      fetcher: input.fetcher,
      phase: "validate",
      signal: input.signal,
    },
    {
      path: "/users/self",
    },
  );
  const user = normalizeKeywordUser(readDataObject(payload));

  return {
    profile: {
      accountId: user.id,
      displayName: readAccountLabel(user),
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: keywordApiBaseUrl,
      validationEndpoint: `${keywordApiPathPrefix}/users/self`,
    },
  };
}

async function requestKeywordJson(
  context: KeywordRequestContext,
  request: {
    path: string;
    query?: Record<string, string | undefined>;
  },
) {
  const timeout = createProviderTimeout(context.signal, keywordDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildKeywordUrl(request.path, request.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readKeywordPayload(response);
    if (!response.ok) {
      throw createKeywordError(response, payload, context.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Keyword.com request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Keyword.com request failed: ${error.message}` : "Keyword.com request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildKeywordUrl(path: string, query: Record<string, string | undefined> = {}) {
  const url = new URL(`${keywordApiPathPrefix}${path}`, keywordApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readKeywordPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Keyword.com returned invalid JSON");
  }
}

function createKeywordError(response: Response, payload: unknown, phase: KeywordRequestPhase) {
  const message = extractKeywordErrorMessage(payload) ?? `Keyword.com request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 502, message);
}

function extractKeywordErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  const errors = record?.errors;
  if (Array.isArray(errors)) {
    for (const error of errors) {
      const errorRecord = optionalRecord(error);
      const message = optionalString(errorRecord?.message) ?? optionalString(errorRecord?.title);
      if (message) {
        return message;
      }
    }
  }

  return optionalString(record?.message) ?? optionalString(record?.error);
}

function readDataObject(payload: unknown) {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  if (!data) {
    throw new ProviderRequestError(502, "Keyword.com response did not include data object");
  }
  return data;
}

function readDataArray(payload: unknown) {
  const record = optionalRecord(payload);
  const data = record?.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "Keyword.com response did not include data array");
  }
  return data.map((item) => {
    const recordItem = optionalRecord(item);
    if (!recordItem) {
      throw new ProviderRequestError(502, "Keyword.com response included a non-object data item");
    }
    return recordItem;
  });
}

function normalizeKeywordProject(resource: Record<string, unknown>) {
  return {
    type: readResourceString(resource, "type"),
    id: readResourceString(resource, "id"),
    attributes: optionalRecord(resource.attributes) ?? {},
    raw: resource,
  };
}

function normalizeKeyword(resource: Record<string, unknown>) {
  return {
    type: readResourceString(resource, "type"),
    id: readResourceString(resource, "id"),
    attributes: optionalRecord(resource.attributes) ?? {},
    raw: resource,
  };
}

function normalizeKeywordUser(resource: Record<string, unknown>) {
  return {
    type: readResourceString(resource, "type"),
    id: readResourceString(resource, "id"),
    attributes: optionalRecord(resource.attributes) ?? {},
    raw: resource,
  };
}

function normalizeKeywordRegion(value: Record<string, unknown>) {
  return {
    region: readResourceString(value, "region"),
    language: optionalString(value.lang) ?? null,
    type: optionalString(value.type) ?? null,
    total: optionalInteger(value.total) ?? null,
    raw: value,
  };
}

function readResourceString(input: Record<string, unknown>, fieldName: string) {
  const value = optionalString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(502, `Keyword.com response did not include ${fieldName}`);
  }
  return value;
}

function readRequiredString(input: Record<string, unknown>, fieldName: string) {
  const value = optionalString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function stringifyOptionalInteger(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function readAccountLabel(user: ReturnType<typeof normalizeKeywordUser>) {
  const name = optionalString(user.attributes.name);
  const email = optionalString(user.attributes.addon_master_email);
  return name || email || "Keyword.com API Token";
}
