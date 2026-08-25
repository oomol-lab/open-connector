import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, positiveInteger } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const hunterApiBaseUrl = "https://api.hunter.io/v2";

type HunterMethod = "GET" | "POST" | "PUT" | "DELETE";
type HunterQueryValue = unknown;
type HunterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface HunterRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, HunterQueryValue>;
  method?: HunterMethod;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}

export const hunterActionHandlers: ProviderActionHandlers<"hunter", HunterActionHandler> = {
  account_information(_input, context) {
    return requestHunter({
      ...context,
      path: "/account",
    });
  },
  combined_enrichment(input, context) {
    assertEmailOrLinkedin(input);
    return requestHunter({
      ...context,
      path: "/combined/find",
      query: input,
    });
  },
  company_enrichment(input, context) {
    return requestHunter({
      ...context,
      path: "/companies/find",
      query: input,
    });
  },
  create_lead(input, context) {
    return requestHunter({
      ...context,
      path: "/leads",
      method: "POST",
      body: input,
    });
  },
  create_leads_list(input, context) {
    return requestHunter({
      ...context,
      path: "/leads_lists",
      method: "POST",
      body: input,
    });
  },
  async delete_lead(input, context) {
    const id = readHunterId(input);
    await requestHunter({
      ...context,
      path: `/leads/${id}`,
      method: "DELETE",
    });
    return { id, deleted: true };
  },
  discover_companies(input, context) {
    assertDiscoverCompaniesInput(input);
    return requestHunter({
      ...context,
      path: "/discover",
      method: "POST",
      body: input,
    });
  },
  domain_search(input, context) {
    assertDomainOrCompany(input);
    return requestHunter({
      ...context,
      path: "/domain-search",
      query: input,
    });
  },
  email_count(input, context) {
    assertDomainOrCompany(input);
    return requestHunter({
      ...context,
      path: "/email-count",
      query: input,
    });
  },
  email_finder(input, context) {
    assertEmailFinderInput(input);
    return requestHunter({
      ...context,
      path: "/email-finder",
      query: input,
    });
  },
  email_verifier(input, context) {
    return requestHunter({
      ...context,
      path: "/email-verifier",
      query: input,
    });
  },
  get_lead(input, context) {
    return requestHunter({
      ...context,
      path: `/leads/${readHunterId(input)}`,
    });
  },
  list_custom_attributes(_input, context) {
    return requestHunter({
      ...context,
      path: "/leads_custom_attributes",
    });
  },
  list_leads(input, context) {
    return requestHunter({
      ...context,
      path: "/leads",
      query: buildListLeadsQuery(input),
    });
  },
  list_leads_lists(input, context) {
    return requestHunter({
      ...context,
      path: "/leads_lists",
      query: input,
    });
  },
  people_enrichment(input, context) {
    assertEmailOrLinkedin(input);
    return requestHunter({
      ...context,
      path: "/people/find",
      query: input,
    });
  },
  async update_lead(input, context) {
    assertLeadUpdateInput(input);
    const id = readHunterId(input);
    await requestHunter({
      ...context,
      path: `/leads/${id}`,
      method: "PUT",
      body: omitFields(input, ["id"]),
    });
    return { id, updated: true };
  },
  upsert_lead(input, context) {
    return requestHunter({
      ...context,
      path: "/leads",
      method: "PUT",
      body: input,
    });
  },
};

export async function validateHunterCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestHunter({
    path: "/account",
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });
  const account = readAccountData(payload);
  const email = optionalString(account.email);

  return {
    profile: {
      accountId: email ?? "hunter:api-key",
      displayName: email ?? "Hunter API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/account",
      apiBaseUrl: hunterApiBaseUrl,
      email,
      plan_name: optionalString(account.plan_name),
      plan_level: typeof account.plan_level === "number" ? account.plan_level : undefined,
      searches: account.searches,
      verifications: account.verifications,
    }),
  };
}

async function requestHunter(input: HunterRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(`${hunterApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: compactObject({
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
        "content-type": input.body ? "application/json" : undefined,
      }) as HeadersInit,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Hunter request failed: ${error.message}` : "Hunter request failed",
      error,
    );
  }

  if (!response.ok) {
    throw mapHunterError(response.status, await readHunterErrorMessage(response), input.phase ?? "execute");
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return optionalRecord(payload) ?? {};
  } catch {
    throw new ProviderRequestError(502, "Hunter returned malformed JSON");
  }
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === undefined || item === null || item === "") {
        continue;
      }
      url.searchParams.append(key, String(item));
    }
    return;
  }

  url.searchParams.set(key, String(value));
}

function buildListLeadsQuery(input: Record<string, unknown>): Record<string, unknown> {
  const query = omitFields(input, ["sending_status", "verification_status", "custom_attributes"]);

  if (Array.isArray(input.sending_status)) {
    query["sending_status[]"] = input.sending_status;
  }
  if (Array.isArray(input.verification_status)) {
    query["verification_status[]"] = input.verification_status;
  }
  const customAttributes = optionalRecord(input.custom_attributes);
  if (customAttributes) {
    for (const [key, value] of Object.entries(customAttributes)) {
      query[`custom_attributes[${key}]`] = value;
    }
  }

  return query;
}

function readHunterId(input: Record<string, unknown>): number {
  return positiveInteger(input.id, "id", (message) => new ProviderRequestError(400, message));
}

function omitFields(input: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const omitted = new Set(fields);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !omitted.has(key)));
}

async function readHunterErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      errors?: Array<{
        details?: unknown;
      }>;
      data?: {
        message?: unknown;
      };
      message?: unknown;
    };

    const firstError = Array.isArray(payload.errors) ? payload.errors[0] : undefined;
    const firstErrorDetails = optionalString(firstError?.details);
    if (firstErrorDetails) {
      return firstErrorDetails;
    }
    return (
      optionalString(payload.data?.message) ??
      optionalString(payload.message) ??
      `Hunter request failed with HTTP ${response.status}`
    );
  } catch {
    return `Hunter request failed with HTTP ${response.status}`;
  }
}

function mapHunterError(status: number, message: string, phase: "validate" | "execute"): ProviderRequestError {
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status, message);
}

function readAccountData(payload: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(payload.data) ?? payload;
}

function assertDomainOrCompany(input: Record<string, unknown>): void {
  if (!optionalString(input.domain) && !optionalString(input.company)) {
    throw new ProviderRequestError(400, "domain or company must be provided");
  }
}

function assertEmailOrLinkedin(input: Record<string, unknown>): void {
  if (!optionalString(input.email) && !optionalString(input.linkedin_handle)) {
    throw new ProviderRequestError(400, "email or linkedin_handle must be provided");
  }
}

function assertEmailFinderInput(input: Record<string, unknown>): void {
  if (!optionalString(input.domain) && !optionalString(input.company) && !optionalString(input.linkedin_handle)) {
    throw new ProviderRequestError(400, "domain, company, or linkedin_handle must be provided");
  }

  const hasSplitName = Boolean(optionalString(input.first_name) && optionalString(input.last_name));
  if (!optionalString(input.linkedin_handle) && !optionalString(input.full_name) && !hasSplitName) {
    throw new ProviderRequestError(400, "full_name, first_name and last_name, or linkedin_handle must be provided");
  }
}

function assertDiscoverCompaniesInput(input: Record<string, unknown>): void {
  const filters = optionalRecord(input.filters);
  if (!optionalString(input.query) && (!filters || Object.keys(filters).length === 0)) {
    throw new ProviderRequestError(400, "query or non-empty filters must be provided");
  }
}

function assertLeadUpdateInput(input: Record<string, unknown>): void {
  readHunterId(input);
  const updates = omitFields(input, ["id"]);
  if (Object.keys(updates).length === 0) {
    throw new ProviderRequestError(400, "at least one lead field must be provided");
  }
}
