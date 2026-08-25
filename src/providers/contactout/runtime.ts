import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const contactoutApiBaseUrl = "https://api.contactout.com";

type ContactoutActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const contactoutActionHandlers: ProviderActionHandlers<"contactout", ContactoutActionHandler> = {
  enrich_linkedin_profile(input, context) {
    return getContactoutObject("/v1/linkedin/enrich", input, context, "enrich_linkedin_profile");
  },
  enrich_email_profile(input, context) {
    return getContactoutObject("/v1/email/enrich", input, context, "enrich_email_profile");
  },
  enrich_person(input, context) {
    assertValidPersonEnrichmentInput(input);
    return postContactoutObject("/v1/people/enrich", input, context, "enrich_person");
  },
  get_linkedin_contact_info(input, context) {
    return getContactoutObject("/v1/people/linkedin", input, context, "get_linkedin_contact_info");
  },
  enrich_companies_by_domain(input, context) {
    return postContactoutObject("/v1/domain/enrich", input, context, "enrich_companies_by_domain");
  },
  search_people(input, context) {
    const body = flattenFiltersInput(input, ["page", "data_types", "reveal_info"]);
    return postContactoutObject("/v1/people/search", body, context, "search_people");
  },
  count_people(input, context) {
    const body = requireFilters(input.filters);
    return postContactoutObject("/v1/people/count", body, context, "count_people");
  },
  find_decision_makers(input, context) {
    assertAnyString(input, ["linkedin_url", "domain", "name"], "linkedin_url, domain, or name is required.");
    return getContactoutObject("/v1/people/decision-makers", input, context, "find_decision_makers");
  },
  search_companies(input, context) {
    const body = requireFilters(input.filters);
    return postContactoutObject("/v1/company/search", body, context, "search_companies");
  },
  get_linkedin_profile_by_email(input, context) {
    return getContactoutObject("/v1/people/person", input, context, "get_linkedin_profile_by_email");
  },
  check_personal_email_available(input, context) {
    return getContactoutObject(
      "/v1/people/linkedin/personal_email_status",
      input,
      context,
      "check_personal_email_available",
    );
  },
  check_work_email_available(input, context) {
    return getContactoutObject("/v1/people/linkedin/work_email_status", input, context, "check_work_email_available");
  },
  check_phone_available(input, context) {
    return getContactoutObject("/v1/people/linkedin/phone_status", input, context, "check_phone_available");
  },
  verify_email(input, context) {
    return getContactoutObject("/v1/email/verify", input, context, "verify_email");
  },
  get_usage_stats(input, context) {
    return getContactoutObject("/v1/stats", input, context, "get_usage_stats");
  },
};

export async function validateContactoutCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = requireContactoutObject(
    await requestContactout({
      path: "/v1/stats",
      method: "GET",
      apiKey,
      fetcher,
      signal,
      phase: "validate",
    }),
    "ContactOut validation response",
  );

  return {
    profile: {
      accountId: "contactout:api-token",
      displayName: "ContactOut API Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: contactoutApiBaseUrl,
      validationEndpoint: "/v1/stats",
      validationStatus: optionalInteger(payload.status_code),
      period: optionalRecord(payload.period),
    }),
  };
}

async function getContactoutObject(
  path: string,
  query: Record<string, unknown>,
  context: ApiKeyProviderContext,
  actionName: string,
): Promise<Record<string, unknown>> {
  return requireContactoutObject(
    await requestContactout({
      path,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      query,
      phase: "execute",
    }),
    `ContactOut ${actionName} response`,
  );
}

async function postContactoutObject(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
  actionName: string,
): Promise<Record<string, unknown>> {
  return requireContactoutObject(
    await requestContactout({
      path,
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      body,
      phase: "execute",
    }),
    `ContactOut ${actionName} response`,
  );
}

async function requestContactout(input: {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  phase: "validate" | "execute";
}): Promise<unknown> {
  const url = new URL(input.path, contactoutApiBaseUrl);
  if (input.query) {
    for (const [key, value] of Object.entries(input.query)) {
      appendQueryValue(url, key, value);
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        authorization: "basic",
        token: input.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `ContactOut request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readContactoutPayload(response);
  if (!response.ok) {
    throw mapContactoutError(response.status, payload, input.phase);
  }
  return payload;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === "boolean") {
    url.searchParams.set(key, value ? "true" : "false");
    return;
  }
  url.searchParams.set(key, String(value));
}

async function readContactoutPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "ContactOut returned invalid JSON");
    }
    return { error: text };
  }
}

function mapContactoutError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readContactoutErrorMessage(payload, status);
  if (phase === "validate" && (status === 400 || status === 401)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readContactoutErrorMessage(payload: unknown, status: number): string {
  const record = optionalRecord(payload);
  if (record) {
    for (const key of ["error", "message", "status_message", "detail"]) {
      const value = optionalString(record[key]);
      if (value) {
        return value;
      }
    }
  }
  return `ContactOut request failed with ${status}`;
}

function flattenFiltersInput(input: Record<string, unknown>, passthroughKeys: string[]): Record<string, unknown> {
  const filters = requireFilters(input.filters);
  const body: Record<string, unknown> = { ...filters };
  for (const key of passthroughKeys) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }
  return body;
}

function requireFilters(value: unknown): Record<string, unknown> {
  const filters = requiredRecord(value, "filters", (message) => new ProviderRequestError(400, message));
  if (Object.keys(filters).length === 0) {
    throw new ProviderRequestError(400, "filters must contain at least one search filter.");
  }
  return filters;
}

function assertValidPersonEnrichmentInput(input: Record<string, unknown>): void {
  if (optionalString(input.linkedin_url) || optionalString(input.email) || optionalString(input.phone)) {
    return;
  }
  const hasName =
    optionalString(input.full_name) || (optionalString(input.first_name) && optionalString(input.last_name));
  const hasSecondary =
    Array.isArray(input.company) ||
    Array.isArray(input.company_domain) ||
    Array.isArray(input.education) ||
    optionalString(input.location);
  if (!hasName || !hasSecondary) {
    throw new ProviderRequestError(
      400,
      "Provide linkedin_url, email, phone, or a name plus company, company_domain, education, or location.",
    );
  }
}

function assertAnyString(input: Record<string, unknown>, keys: string[], message: string): void {
  if (keys.some((key) => optionalString(input[key]))) {
    return;
  }
  throw new ProviderRequestError(400, message);
}

function requireContactoutObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}
