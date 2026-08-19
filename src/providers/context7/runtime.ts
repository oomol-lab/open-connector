import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  setSearchParams,
} from "../provider-runtime.ts";

export const context7ApiBaseUrl = "https://context7.com/api";
export const context7ValidationEndpoint = "/v2/libs/search";

const context7DefaultRequestTimeoutMs = 30_000;

type Context7RequestPhase = "validate" | "execute";

export async function validateContext7Credential(input: {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  await requestContext7Json({
    path: context7ValidationEndpoint,
    query: {
      libraryName: "context7",
      query: "validate API key",
      fast: "true",
    },
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: "validate",
  });

  return {
    profile: {
      displayName: "Context7 API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: context7ApiBaseUrl,
      validationEndpoint: context7ValidationEndpoint,
    },
  };
}

export const context7ActionHandlers: ProviderActionHandlers<
  "context7",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  search_libraries(input, context) {
    return requestContext7Json({
      path: "/v2/libs/search",
      query: {
        libraryName: requiredString(input.libraryName, "libraryName", invalidInputError),
        query: requiredString(input.query, "query", invalidInputError),
        fast: optionalBooleanString(input.fast),
      },
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_documentation_context(input, context) {
    return requestContext7Json({
      path: "/v2/context",
      query: {
        libraryId: requiredString(input.libraryId, "libraryId", invalidInputError),
        query: requiredString(input.query, "query", invalidInputError),
        type: "json",
        fast: optionalBooleanString(input.fast),
      },
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
};

async function requestContext7Json(input: {
  path: string;
  query: Record<string, string | undefined>;
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: Context7RequestPhase;
}): Promise<unknown> {
  const url = new URL(`${context7ApiBaseUrl}${input.path}`);
  setSearchParams(url, input.query);

  input.signal?.throwIfAborted();
  const timeout = createProviderTimeout(input.signal, context7DefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readContext7Payload(response);
    if (response.status !== 200) {
      throw createContext7Error(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Context7 request timed out");
    }
    if (isAbortSignalError(input.signal, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Context7 request failed: ${error.message}` : "Context7 request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readContext7Payload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Context7 returned invalid JSON",
  });
}

function createContext7Error(response: Response, payload: unknown, phase: Context7RequestPhase): ProviderRequestError {
  const message = readContext7ErrorMessage(payload) ?? `Context7 request failed with status ${response.status}`;

  if (response.status === 202) {
    return new ProviderRequestError(503, message, payload);
  }
  if (response.status === 301) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 402 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase == "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase == "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase == "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function readContext7ErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error);
}

function optionalBooleanString(value: unknown): string | undefined {
  return typeof value == "boolean" ? String(value) : undefined;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
