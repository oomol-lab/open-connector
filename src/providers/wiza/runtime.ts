import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment, jsonObject } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type WizaPhase = "validate" | "execute";
type WizaActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface WizaRequestOptions {
  path: string;
  phase: WizaPhase;
  method?: "GET" | "POST";
  body?: unknown;
}

export const wizaApiBaseUrl = "https://wiza.co";
const wizaValidationPath = "/api/meta/credits";

export const wizaActionHandlers: ProviderActionHandlers<"wiza", WizaActionHandler> = {
  get_credits(_input, context) {
    return requestWizaJson({ path: wizaValidationPath, phase: "execute" }, context);
  },
  get_individual_reveal(input, context) {
    return requestWizaJson(
      { path: `/api/individual_reveals/${encodePathSegment(input.id)}`, phase: "execute" },
      context,
    );
  },
  get_list(input, context) {
    return requestWizaJson({ path: `/api/lists/${encodePathSegment(input.id)}`, phase: "execute" }, context);
  },
  prospect_search(input, context) {
    return requestWizaJson({ path: "/api/prospects/search", phase: "execute", method: "POST", body: input }, context);
  },
  start_individual_reveal(input, context) {
    return requestWizaJson(
      {
        path: "/api/individual_reveals",
        phase: "execute",
        method: "POST",
        body: normalizeStartIndividualRevealInput(input),
      },
      context,
    );
  },
};

export async function validateWizaCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestWizaJson({ path: wizaValidationPath, phase: "validate" }, { apiKey, fetcher, signal });
  return {
    profile: {
      accountId: "wiza-api-key",
      displayName: "Wiza API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: wizaApiBaseUrl,
      validationEndpoint: wizaValidationPath,
    },
  };
}

async function requestWizaJson(
  options: WizaRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(options.path, wizaApiBaseUrl), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: context.signal,
    });
    payload = await readWizaPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      `wiza request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  if (!response.ok) throw mapWizaError(response.status, payload, options.phase);
  return payload;
}

function normalizeStartIndividualRevealInput(input: Record<string, unknown>): Record<string, unknown> {
  const individualReveal = optionalRecord(input.individual_reveal);
  if (!individualReveal) return input;

  const { linkedin_profile_url: linkedInProfileUrl, ...restIndividualReveal } = individualReveal;
  return {
    ...input,
    individual_reveal: jsonObject({
      ...restIndividualReveal,
      profile_url:
        restIndividualReveal.profile_url === undefined ? linkedInProfileUrl : restIndividualReveal.profile_url,
    }),
  };
}

async function readWizaPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "wiza returned malformed JSON");
    return { message: text };
  }
}

function mapWizaError(status: number, payload: unknown, phase: WizaPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Wiza API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) return undefined;
  for (const key of ["message", "error", "detail"]) {
    const message = optionalString(body[key]);
    if (message) return message;
  }
  return optionalString(optionalRecord(body.error)?.message) ?? optionalString(optionalRecord(body.status)?.message);
}
