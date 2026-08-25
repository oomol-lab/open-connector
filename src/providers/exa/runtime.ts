import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const exaApiBaseUrl = "https://api.exa.ai";

type ExaContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ExaActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface ExaRequestInput {
  method?: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  mode?: "validate" | "execute";
}

export const exaActionHandlers: ProviderActionHandlers<"exa", ExaActionHandler> = {
  search(input, context) {
    assertDomainFilters(input);
    return exaRequest({ method: "POST", path: "/search", body: input }, context);
  },
  get_contents(input, context) {
    return exaRequest({ method: "POST", path: "/contents", body: input }, context);
  },
  answer(input, context) {
    return exaRequest({ method: "POST", path: "/answer", body: input }, context);
  },
  find_similar(input, context) {
    assertDomainFilters(input);
    return exaRequest({ method: "POST", path: "/findSimilar", body: input }, context);
  },
};

export async function validateExaApiKey(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await exaRequest(
    {
      method: "POST",
      path: "/search",
      body: {
        query: "exa",
        numResults: 1,
      },
      mode: "validate",
    },
    { apiKey, fetcher, signal },
  );
  const results = Array.isArray(optionalRecord(payload)?.results)
    ? (optionalRecord(payload)?.results as unknown[])
    : undefined;

  return {
    profile: {
      accountId: "api_key",
      displayName: "Exa API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/search",
      validationQuery: "exa",
      apiBaseUrl: exaApiBaseUrl,
      resultCount: results?.length,
    }),
  };
}

async function exaRequest(input: ExaRequestInput, context: ExaContext): Promise<unknown> {
  const response = await exaRawRequest(input, context);
  if (!response.ok) {
    throw await buildExaError(response, input.mode ?? "execute");
  }

  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Exa returned invalid JSON response", text);
  }
}

async function exaRawRequest(input: ExaRequestInput, context: ExaContext): Promise<Response> {
  try {
    return await context.fetcher(new URL(input.path, exaApiBaseUrl), {
      method: input.method ?? "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": context.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Exa request failed: ${error.message}` : "Exa request failed",
      error,
    );
  }
}

async function buildExaError(response: Response, mode: "validate" | "execute"): Promise<ProviderRequestError> {
  const payload = await readExaPayload(response);
  const message = extractExaErrorMessage(payload) ?? `Exa request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (mode === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (mode === "execute" && (response.status === 400 || response.status === 404 || response.status === 422)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

async function readExaPayload(response: Response): Promise<unknown> {
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

function extractExaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function assertDomainFilters(input: Record<string, unknown>): void {
  if (input.includeDomains !== undefined && input.excludeDomains !== undefined) {
    throw new ProviderRequestError(400, "includeDomains and excludeDomains cannot be provided together");
  }
}
