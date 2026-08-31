import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalIntegerLike, optionalRecord, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "hackerrank_work";
const hackerrankWorkApiBaseUrl = "https://www.hackerrank.com/x/api/v3";
const hackerrankWorkDefaultRequestTimeoutMs = 30_000;

type RequestMode = "validate" | "execute";
type HackerrankWorkActionContext = ApiKeyProviderContext;
type HackerrankWorkActionHandler = (
  input: Record<string, unknown>,
  context: HackerrankWorkActionContext,
) => Promise<unknown>;

export const hackerrankWorkActionHandlers: ProviderActionHandlers<"hackerrank_work", HackerrankWorkActionHandler> = {
  async list_tests(input, context) {
    const payload = await requestHackerrankWorkJson(
      "/tests",
      context,
      {
        limit: optionalIntegerLike(input.limit, "limit", providerInputError),
        offset: optionalIntegerLike(input.offset, "offset", providerInputError),
      },
      "execute",
    );

    return {
      tests: readListItems(payload),
      pagination: readPagination(payload),
    };
  },
  async get_test(input, context) {
    const payload = await requestHackerrankWorkJson(
      `/tests/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
      context,
      {
        additional_fields: joinAdditionalFields(input.additional_fields),
      },
      "execute",
    );

    return {
      test: readResource(payload),
    };
  },
  async list_test_candidates(input, context) {
    const testId = requiredString(input.test_id, "test_id", providerInputError);
    const payload = await requestHackerrankWorkJson(
      `/tests/${encodeURIComponent(testId)}/candidates`,
      context,
      {
        limit: optionalIntegerLike(input.limit, "limit", providerInputError),
        offset: optionalIntegerLike(input.offset, "offset", providerInputError),
      },
      "execute",
    );

    return {
      candidates: readListItems(payload),
      pagination: readPagination(payload),
    };
  },
  async search_test_candidates(input, context) {
    const testId = requiredString(input.test_id, "test_id", providerInputError);
    const payload = await requestHackerrankWorkJson(
      `/tests/${encodeURIComponent(testId)}/candidates/search`,
      context,
      {
        search: requiredString(input.search, "search", providerInputError),
        limit: optionalIntegerLike(input.limit, "limit", providerInputError),
        offset: optionalIntegerLike(input.offset, "offset", providerInputError),
      },
      "execute",
    );

    return {
      candidates: readListItems(payload),
      pagination: readPagination(payload),
    };
  },
  async get_test_candidate(input, context) {
    const testId = requiredString(input.test_id, "test_id", providerInputError);
    const candidateId = requiredString(input.candidate_id, "candidate_id", providerInputError);
    const payload = await requestHackerrankWorkJson(
      `/tests/${encodeURIComponent(testId)}/candidates/${encodeURIComponent(candidateId)}`,
      context,
      {
        additional_fields: joinAdditionalFields(input.additional_fields),
      },
      "execute",
    );

    return {
      candidate: readResource(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hackerrankWorkActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: HackerrankWorkActionContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await requestHackerrankWorkJson(
      "/tests",
      context,
      {
        limit: 1,
        offset: 0,
      },
      "validate",
    );
    const tests = readListItems(payload);
    const totalCount = Number(readPagination(payload).total);

    return {
      profile: {
        displayName: "HackerRank Work API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: hackerrankWorkApiBaseUrl,
        validationEndpoint: "/tests",
        testCount: Number.isInteger(totalCount) ? totalCount : tests.length,
      },
    };
  },
};

async function requestHackerrankWorkJson(
  path: string,
  context: HackerrankWorkActionContext,
  query: Record<string, string | number | undefined>,
  mode: RequestMode,
): Promise<Record<string, unknown>> {
  const timeoutSignal = AbortSignal.timeout(hackerrankWorkDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await context.fetcher(buildHackerrankWorkUrl(path, query), {
      method: "GET",
      headers: hackerrankWorkHeaders(context.apiKey),
      signal,
    });
    const payload = await readHackerrankWorkPayload(response);

    if (!response.ok) {
      throw createHackerrankWorkError(response.status, payload, mode);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ProviderRequestError(502, "hackerrank_work returned invalid JSON");
    }

    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "hackerrank_work request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `hackerrank_work request failed: ${error.message}` : "hackerrank_work request failed",
    );
  }
}

function buildHackerrankWorkUrl(path: string, query: Record<string, string | number | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${hackerrankWorkApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function hackerrankWorkHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
  };
}

async function readHackerrankWorkPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createHackerrankWorkError(status: number, payload: unknown, mode: RequestMode): ProviderRequestError {
  const message = readHackerrankWorkErrorMessage(payload) ?? `hackerrank_work request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((status === 401 || status === 403) && mode === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if ((status === 401 || status === 403) && mode === "execute") {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readHackerrankWorkErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const directMessage = readString(record.message) ?? readString(record.error);
  if (directMessage) {
    return directMessage;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = errors[0];
    if (typeof firstError === "string" && firstError.trim()) {
      return firstError;
    }
    const errorRecord = optionalRecord(firstError);
    if (errorRecord) {
      return readString(errorRecord.message) ?? readString(errorRecord.error);
    }
  }

  return undefined;
}

function readListItems(payload: Record<string, unknown>): unknown[] {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, "hackerrank_work returned invalid list data");
  }
  return payload.data;
}

function readPagination(payload: Record<string, unknown>): Record<string, unknown> {
  const numericTotal = typeof payload.total === "number" ? readIntegerLike(payload.total) : undefined;
  return {
    page_total: readIntegerLike(payload.page_total),
    offset: readIntegerLike(payload.offset),
    previous: readString(payload.previous) ?? "",
    next: readString(payload.next) ?? "",
    first: readString(payload.first) ?? "",
    last: readString(payload.last) ?? "",
    total: readString(payload.total) ?? String(numericTotal ?? (Array.isArray(payload.data) ? payload.data.length : 0)),
  };
}

function readResource(payload: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(payload.data) ?? payload;
}

function joinAdditionalFields(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const fields = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item.length > 0);
  return fields.length === 0 ? undefined : fields.join(",");
}

function readIntegerLike(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, "hackerrank_work returned an invalid integer");
  }
  return parsed;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
