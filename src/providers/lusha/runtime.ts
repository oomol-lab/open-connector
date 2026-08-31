import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const lushaApiBaseUrl = "https://api.lusha.com";

type LushaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const lushaActionHandlers: ProviderActionHandlers<"lusha", LushaActionHandler> = {
  get_account_usage(_input, context) {
    return requestLusha({
      context,
      path: "/v3/account/usage",
      phase: "execute",
    });
  },
  search_contacts(input, context) {
    return requestLusha({
      context,
      path: "/v3/contacts/search",
      method: "POST",
      body: input,
      phase: "execute",
    });
  },
  enrich_contacts(input, context) {
    return requestLusha({
      context,
      path: "/v3/contacts/enrich",
      method: "POST",
      body: input,
      phase: "execute",
    });
  },
  search_companies(input, context) {
    return requestLusha({
      context,
      path: "/v3/companies/search",
      method: "POST",
      body: input,
      phase: "execute",
    });
  },
  enrich_companies(input, context) {
    return requestLusha({
      context,
      path: "/v3/companies/enrich",
      method: "POST",
      body: input,
      phase: "execute",
    });
  },
};

export async function validateLushaCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestLusha({
    context: { apiKey, fetcher, signal },
    path: "/v3/account/usage",
    phase: "validate",
  });

  return {
    profile: {
      accountId: "lusha:api-key",
      displayName: "Lusha API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: lushaApiBaseUrl,
      validationEndpoint: "/v3/account/usage",
      credits: optionalRecord(payload.credits),
      plan: optionalRecord(payload.plan),
      rateLimits: optionalRecord(payload.rateLimits),
    }),
  };
}

async function requestLusha(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, lushaApiBaseUrl);
  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        api_key: input.context.apiKey,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lusha request failed: ${error.message}` : "Lusha request failed",
    );
  }

  const payload = await readLushaPayload(response);
  if (!response.ok) {
    throw mapLushaError(response.status, readLushaErrorMessage(payload), input.phase);
  }
  return payload;
}

async function readLushaPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return optionalRecord(payload) ?? {};
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Lusha returned malformed JSON");
    }
    return { message: text };
  }
}

function readLushaErrorMessage(payload: Record<string, unknown>): string {
  if (typeof payload.message === "string") {
    return payload.message;
  }
  if (Array.isArray(payload.errors) && typeof payload.errors[0] === "string") {
    return payload.errors[0];
  }
  return "Lusha request failed";
}

function mapLushaError(status: number, message: string, phase: "validate" | "execute"): ProviderRequestError {
  if (status === 402 || status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}
