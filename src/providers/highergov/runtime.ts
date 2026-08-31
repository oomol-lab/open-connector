import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const highergovApiBaseUrl = "https://www.highergov.com/api-external/";

type HighergovRequestPhase = "validate" | "execute";

export const highergovActionHandlers: ProviderActionHandlers<
  "highergov",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_opportunities(input, context) {
    return requestHighergovList("opportunity/", input, context, "execute");
  },
  list_contracts(input, context) {
    return requestHighergovList("contract/", input, context, "execute");
  },
  list_agencies(input, context) {
    return requestHighergovList("agency/", input, context, "execute");
  },
  list_naics_codes(input, context) {
    return requestHighergovList("naics/", input, context, "execute");
  },
};

export async function validateHighergovCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestHighergovList("agency/", { page_size: 1 }, { apiKey, fetcher, signal }, "validate");
  return {
    profile: {
      displayName: "HigherGov API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: highergovApiBaseUrl,
      validationEndpoint: "/api-external/agency/",
    },
  };
}

async function requestHighergovList(
  path: string,
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: HighergovRequestPhase,
): Promise<unknown> {
  const url = new URL(path, highergovApiBaseUrl);
  url.searchParams.set("api_key", context.apiKey);
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  context.signal?.throwIfAborted();
  const timeout = createProviderTimeout(context.signal);
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readHighergovPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "highergov request timed out", error);
    }
    if (isAbortSignalError(context.signal, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `highergov request failed: ${error.message}` : "highergov request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createHighergovError(response, payload, phase);
  }

  return normalizePaginatedPayload(payload);
}

async function readHighergovPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "highergov returned invalid JSON",
    invalidJsonFallback: (text) => text,
  });
}

function createHighergovError(
  response: Response,
  payload: unknown,
  phase: HighergovRequestPhase,
): ProviderRequestError {
  const message = (extractHighergovErrorMessage(payload) ?? response.statusText) || "request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractHighergovErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  for (const key of ["detail", "message", "error"]) {
    const value = optionalString(object[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizePaginatedPayload(payload: unknown): Record<string, unknown> {
  const object = requireObject(payload, "response");
  if (!Array.isArray(object.results)) {
    throw invalidResponse("results");
  }
  const meta = requireObject(object.meta, "meta");
  const pagination = requireObject(meta.pagination, "meta.pagination");
  const links = requireObject(object.links, "links");

  return {
    results: object.results,
    meta: {
      pagination: {
        page: requireInteger(pagination.page, "meta.pagination.page"),
        pages: requireInteger(pagination.pages, "meta.pagination.pages"),
        count: requireInteger(pagination.count, "meta.pagination.count"),
      },
    },
    links: {
      first: sanitizePaginationLink(links.first, "links.first"),
      last: sanitizePaginationLink(links.last, "links.last"),
      next: sanitizePaginationLink(links.next, "links.next"),
      prev: sanitizePaginationLink(links.prev, "links.prev"),
    },
  };
}

function sanitizePaginationLink(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw invalidResponse(fieldName);
  }

  try {
    const url = new URL(value);
    url.searchParams.delete("api_key");
    return url.toString();
  } catch {
    throw invalidResponse(fieldName);
  }
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw invalidResponse(fieldName);
  }
  return object;
}

function requireInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw invalidResponse(fieldName);
  }
  return value;
}

function invalidResponse(fieldName: string): ProviderRequestError {
  return new ProviderRequestError(502, `invalid highergov ${fieldName} response`);
}
