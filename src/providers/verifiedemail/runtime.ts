import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, requiredInputString } from "../provider-runtime.ts";

const verifiedemailApiBaseUrl = "https://api.verified.email";

type VerifiedemailRequestPhase = "validate" | "execute";
type VerifiedemailQueryValue = string | number | undefined;
type VerifiedemailActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface VerifiedemailRequestInput {
  apiKey: string;
  fetcher: ProviderFetch;
  path: string;
  phase: VerifiedemailRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, VerifiedemailQueryValue>;
}

export const verifiedemailActionHandlers: ProviderActionHandlers<"verifiedemail", VerifiedemailActionHandler> = {
  get_entitlements(_input, context) {
    return requestVerifiedemailJson({
      ...context,
      path: "/v1/entitlements",
      phase: "execute",
    });
  },
  verify_emails(input, context) {
    const emails = Array.isArray(input.emails) ? input.emails.map(String) : [];
    return requestVerifiedemailJson({
      ...context,
      path: "/v1/verifications",
      phase: "execute",
      query: {
        email: emails.join(","),
      },
    });
  },
  list_lists(input, context) {
    return requestVerifiedemailJson({
      ...context,
      path: "/v1/lists",
      phase: "execute",
      query: buildPaginationQuery(input),
    });
  },
  get_list(input, context) {
    return requestVerifiedemailJson({
      ...context,
      path: `/v1/lists/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      phase: "execute",
    });
  },
  list_downloads(input, context) {
    return requestVerifiedemailJson({
      ...context,
      path: "/v1/downloads",
      phase: "execute",
      query: buildPaginationQuery(input),
    });
  },
  get_download(input, context) {
    return requestVerifiedemailJson({
      ...context,
      path: `/v1/downloads/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      phase: "execute",
    });
  },
};

export async function validateVerifiedemailCredential(
  input: { apiKey: string },
  options: { fetcher: ProviderFetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestVerifiedemailJson({
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    path: "/v1/entitlements",
    phase: "validate",
  });
  const entitlements = optionalRecord(payload.entitlements);
  const payAsYouGo = optionalRecord(entitlements?.payAsYouGo);
  const autoVerify = optionalRecord(entitlements?.autoVerify);

  return {
    profile: {
      accountId: "verifiedemail",
      displayName: "VerifiedEmail API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: verifiedemailApiBaseUrl,
      validationEndpoint: "/v1/entitlements",
      payAsYouGoCredits: optionalInteger(payAsYouGo?.credits),
      payAsYouGoNeeded: optionalInteger(payAsYouGo?.needed),
      autoVerifyCredits: optionalInteger(autoVerify?.credits),
      autoVerifyNeeded: optionalInteger(autoVerify?.needed),
    }),
  };
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, VerifiedemailQueryValue> {
  return compactObject({
    offset: optionalInteger(input.offset),
    limit: optionalInteger(input.limit),
    sortField: optionalString(input.sortField),
    sortOrder: optionalString(input.sortOrder),
  });
}

async function requestVerifiedemailJson(input: VerifiedemailRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(`${verifiedemailApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `VerifiedEmail request failed: ${error instanceof Error ? error.message : "unknown error"}`,
      error,
    );
  }

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `VerifiedEmail response read failed with HTTP ${response.status}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      error,
    );
  }

  const payload = parseVerifiedemailPayload(response.status, rawBody);
  if (!response.ok) {
    throw createVerifiedemailError(response.status, payload, input.phase);
  }

  const providerError = readVerifiedemailError(payload);
  if (providerError) {
    throw createVerifiedemailError(providerError.code ?? response.status, payload, input.phase);
  }

  return payload;
}

function parseVerifiedemailPayload(status: number, rawBody: string): Record<string, unknown> {
  if (!rawBody) {
    return {};
  }

  try {
    return optionalRecord(JSON.parse(rawBody)) ?? {};
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      `VerifiedEmail returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
      error,
    );
  }
}

function createVerifiedemailError(
  status: number,
  payload: Record<string, unknown>,
  phase: VerifiedemailRequestPhase,
): ProviderRequestError {
  const message = readVerifiedemailError(payload)?.message ?? "VerifiedEmail request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readVerifiedemailError(payload: Record<string, unknown>): { code?: number; message: string } | undefined {
  const error = optionalRecord(payload.error);
  if (!error) {
    return undefined;
  }

  return {
    code: optionalInteger(error.code),
    message: optionalString(error.message) ?? optionalString(error.error) ?? "VerifiedEmail request failed",
  };
}
