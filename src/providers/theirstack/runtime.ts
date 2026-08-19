import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const theirstackApiBaseUrl = "https://api.theirstack.com";

type TheirStackHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const theirstackActionHandlers: ProviderActionHandlers<"theirstack", TheirStackHandler> = {
  async search_jobs(input, context) {
    assertJobSearchWindow(input);
    const payload = await theirstackRequestJson("POST", "/v1/jobs/search", input, context);
    const record = readObject(payload, "TheirStack job search response");
    return {
      jobs: readArray(record.data),
      metadata: readObject(record.metadata, "TheirStack job search metadata"),
    };
  },
  async search_companies(input, context) {
    const payload = await theirstackRequestJson("POST", "/v1/companies/search", input, context);
    const record = readObject(payload, "TheirStack company search response");
    return {
      companies: readArray(record.data),
      metadata: readObject(record.metadata, "TheirStack company search metadata"),
    };
  },
  async list_technographics(input, context) {
    assertTechnographicsCompany(input);
    const payload = await theirstackRequestJson("POST", "/v1/companies/technologies", input, context);
    const record = readObject(payload, "TheirStack technographics response");
    return {
      technologies: readArray(record.data),
      metadata: readObject(record.metadata, "TheirStack technographics metadata"),
    };
  },
  get_credit_balance(_input, context) {
    return theirstackRequestJson("GET", "/v0/billing/credit-balance", undefined, context);
  },
};

export async function validateTheirStackCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await theirstackRequestJson(
    "GET",
    "/v0/billing/credit-balance",
    undefined,
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    "validate",
  );
  const record = readObject(payload, "TheirStack credit balance response");
  return {
    profile: { accountId: "theirstack:api-key", displayName: "TheirStack API Key" },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: theirstackApiBaseUrl,
      validationEndpoint: "/v0/billing/credit-balance",
      apiCredits: record.api_credits,
      usedApiCredits: record.used_api_credits,
    }),
  };
}

async function theirstackRequestJson(
  method: "GET" | "POST",
  path: string,
  body: Record<string, unknown> | undefined,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(`${theirstackApiBaseUrl}${path}`, {
      method,
      headers: compactObject({
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
        "content-type": body !== undefined ? "application/json" : undefined,
      }) as HeadersInit,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TheirStack request failed: ${error.message}` : "TheirStack request failed",
    );
  }
  if (!response.ok) throw createTheirStackError(response.status, payload, phase);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createTheirStackError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readTheirStackErrorMessage(payload) ?? `TheirStack request failed with ${status}`;
  if (status === 401 || status === 403)
    return new ProviderRequestError(phase === "validate" ? 401 : 403, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function readTheirStackErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const detail = record.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        const itemRecord = optionalRecord(item);
        return optionalString(itemRecord?.msg) ?? optionalString(itemRecord?.message);
      })
      .filter((item): item is string => Boolean(item));
    if (messages.length > 0) return messages.join("; ");
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.title);
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`);
  return record;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function assertJobSearchWindow(input: Record<string, unknown>): void {
  if (
    input.posted_at_max_age_days === undefined &&
    input.posted_at_gte === undefined &&
    input.posted_at_lte === undefined &&
    !hasArrayValues(input.company_domain_or) &&
    !hasArrayValues(input.company_linkedin_url_or) &&
    !hasArrayValues(input.company_name_or)
  ) {
    throw new ProviderRequestError(
      400,
      "TheirStack job search requires a posting date filter or a company domain, LinkedIn URL, or name filter.",
    );
  }
}

function assertTechnographicsCompany(input: Record<string, unknown>): void {
  if (
    input.company_domain === undefined &&
    input.company_name === undefined &&
    input.company_linkedin_url === undefined
  ) {
    throw new ProviderRequestError(
      400,
      "TheirStack technographics requires company_domain, company_name, or company_linkedin_url.",
    );
  }
}

function hasArrayValues(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}
