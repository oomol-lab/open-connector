import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ProspeoActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  getProviderActionHandler,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const prospeoApiBaseUrl = "https://api.prospeo.io";

const defaultRequestTimeoutMs = 30_000;

type ProspeoMode = "validate" | "execute";

type ProspeoActionHandler = (input: Record<string, unknown>, context: ProspeoRequestContext) => Promise<unknown>;

interface ProspeoRequestContext {
  apiKey: string;
  fetcher: typeof fetch;
}

interface ProspeoRequestInput {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  mode: ProspeoMode;
}

export const prospeoActionHandlers: ProviderActionHandlers<"prospeo", ProspeoActionHandler> = {
  async get_account_information(_input, context) {
    const payload = await requestProspeoJson(
      {
        method: "GET",
        path: "/account-information",
        mode: "execute",
      },
      context,
    );

    return normalizeAccountInformation(payload);
  },
  async enrich_person(input, context) {
    const payload = await requestProspeoJson(
      {
        method: "POST",
        path: "/enrich-person",
        mode: "execute",
        body: buildEnrichPersonBody(input),
      },
      context,
    );

    return {
      person: readPayloadRecord(payload, "person"),
      raw: payload,
    };
  },
  async enrich_company(input, context) {
    const payload = await requestProspeoJson(
      {
        method: "POST",
        path: "/enrich-company",
        mode: "execute",
        body: buildEnrichCompanyBody(input),
      },
      context,
    );

    return {
      company: readPayloadRecord(payload, "company"),
      raw: payload,
    };
  },
  async search_people(input, context) {
    const payload = await requestProspeoJson(
      {
        method: "POST",
        path: "/search-person",
        mode: "execute",
        body: buildSearchBody(input),
      },
      context,
    );

    return {
      people: readPayloadArray(payload, "people"),
      pagination: readPagination(payload),
      raw: payload,
    };
  },
  async search_companies(input, context) {
    const payload = await requestProspeoJson(
      {
        method: "POST",
        path: "/search-company",
        mode: "execute",
        body: buildSearchBody(input),
      },
      context,
    );

    return {
      companies: readPayloadArray(payload, "companies"),
      pagination: readPagination(payload),
      raw: payload,
    };
  },
  async search_suggestions(input, context) {
    const payload = await requestProspeoJson(
      {
        method: "POST",
        path: "/search-suggestions",
        mode: "execute",
        body: buildSearchSuggestionsBody(input),
      },
      context,
    );

    return {
      ...normalizeSearchSuggestions(payload),
      raw: payload,
    };
  },
};

export async function validateProspeoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const payload = await requestProspeoJson(
    {
      method: "GET",
      path: "/account-information",
      mode: "validate",
    },
    {
      apiKey,
      fetcher,
    },
  );
  const account = normalizeAccountInformation(payload);

  return {
    profile: {
      accountId: account.email ?? "prospeo",
      displayName: account.email ?? "Prospeo API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: prospeoApiBaseUrl,
      validationEndpoint: "/account-information",
      email: account.email ?? undefined,
      plan: account.plan ?? undefined,
      credits: account.credits ?? undefined,
    }),
  };
}

export async function executeProspeoAction(
  input: {
    actionName: ProspeoActionName;
    input: Record<string, unknown>;
    apiKey: string;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = getProviderActionHandler(prospeoActionHandlers, input.actionName);
  if (!handler) {
    throw new ProviderRequestError(400, `unknown prospeo action: ${input.actionName}`);
  }

  return handler(input.input, {
    apiKey: input.apiKey,
    fetcher,
  });
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "prospeo",
  prospeoActionHandlers as Record<
    string,
    (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
  >,
);

async function requestProspeoJson(input: ProspeoRequestInput, context: ProspeoRequestContext) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), defaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildProspeoUrl(input.path), {
      method: input.method,
      headers: buildProspeoHeaders(context.apiKey, Boolean(input.body)),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });
    const payload = await readProspeoPayload(response);

    if (!response.ok) {
      throw createProspeoError(response.status, payload, input.mode);
    }

    const object = optionalRecord(payload);
    if (!object) {
      throw new ProviderRequestError(502, "Prospeo returned an invalid payload", payload);
    }

    return object;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (controller.signal.aborted || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Prospeo request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Prospeo request failed: ${error.message}` : "Prospeo request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildProspeoUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${prospeoApiBaseUrl}/`).toString();
}

function buildProspeoHeaders(apiKey: string, hasBody: boolean) {
  return compactObject({
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    "X-KEY": apiKey,
  }) as Record<string, string>;
}

async function readProspeoPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Prospeo returned invalid JSON");
    }
    return { message: text };
  }
}

function createProspeoError(status: number, payload: unknown, mode: ProspeoMode) {
  const message = readProspeoErrorMessage(payload) ?? `Prospeo request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return mode === "validate"
      ? new ProviderRequestError(400, message, payload)
      : new ProviderRequestError(status, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(mode === "validate" ? 400 : 404, message, payload);
  }
  if (status === 408 || status === 429) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readProspeoErrorMessage(payload: unknown) {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.message) || optionalString(object.error) || optionalString(object.detail) || undefined;
}

function normalizeAccountInformation(payload: Record<string, unknown>) {
  return {
    email: readFirstString(payload, ["email", "account_email", "accountEmail"]),
    plan: readFirstString(payload, ["plan", "subscription", "subscription_plan", "subscriptionPlan"]),
    credits: readFirstObject(payload, ["credits", "credit", "usage"]),
    raw: payload,
  };
}

function readPayloadRecord(payload: Record<string, unknown>, preferredKey: string) {
  const byKey = optionalRecord(payload[preferredKey]);
  if (byKey) {
    return byKey;
  }

  const data = optionalRecord(payload.data);
  if (!data) {
    return null;
  }

  return optionalRecord(data[preferredKey]) ?? data;
}

function readPayloadArray(payload: Record<string, unknown>, preferredKey: string) {
  const direct = payload[preferredKey];
  if (Array.isArray(direct)) {
    return normalizeArrayItems(direct);
  }

  const data = payload.data;
  if (Array.isArray(data)) {
    return normalizeArrayItems(data);
  }

  const dataObject = optionalRecord(data);
  if (dataObject && Array.isArray(dataObject[preferredKey])) {
    return normalizeArrayItems(dataObject[preferredKey]);
  }

  return [];
}

function normalizeArrayItems(items: unknown[]) {
  return items.map((item) => optionalRecord(item) ?? item);
}

function readPagination(payload: Record<string, unknown>) {
  const pagination =
    optionalRecord(payload.pagination) ??
    optionalRecord(payload.meta) ??
    optionalRecord(optionalRecord(payload.data)?.pagination);
  if (!pagination) {
    return null;
  }

  return {
    total: readFirstInteger(pagination, ["total", "total_results", "totalResults", "count"]),
    page: readFirstInteger(pagination, ["page", "current_page", "currentPage"]),
    perPage: readFirstInteger(pagination, ["per_page", "perPage", "limit"]),
  };
}

function buildSearchBody(input: Record<string, unknown>) {
  const filters = optionalRecord(input.filters);
  return compactObject({
    page: input.page,
    filters,
  });
}

function buildEnrichPersonBody(input: Record<string, unknown>) {
  return {
    data: compactObject({
      linkedin_url: readNonEmptyString(input.linkedinUrl),
      first_name: readNonEmptyString(input.firstName),
      last_name: readNonEmptyString(input.lastName),
      full_name: readNonEmptyString(input.fullName),
      email: readNonEmptyString(input.email),
      id: readNonEmptyString(input.personId),
      company: readNonEmptyString(input.company),
      company_domain: readNonEmptyString(input.companyDomain),
      company_linkedin_url: readNonEmptyString(input.companyLinkedinUrl),
      only_verified_email: input.onlyVerifiedEmail,
      enrich_mobile: input.enrichMobile,
      only_verified_mobile: input.onlyVerifiedMobile,
    }),
  };
}

function buildEnrichCompanyBody(input: Record<string, unknown>) {
  return {
    data: compactObject({
      company_website: readNonEmptyString(input.domain),
      company_linkedin_url: readNonEmptyString(input.linkedinUrl),
      company_name: readNonEmptyString(input.companyName),
      id: readNonEmptyString(input.companyId),
    }),
  };
}

const searchSuggestionRequestFields = {
  locationSearch: "location_search",
  jobTitleSearch: "job_title_search",
  technologySearch: "technology_search",
  industrySearch: "industry_search",
  naicsSearch: "naics_search",
  sicSearch: "sic_search",
  companyOperatingLanguagesSearch: "company_operating_languages_search",
  companyGoogleDiscoverySearch: "company_google_discovery_search",
  companyKeyCustomersSearch: "company_key_customers_search",
  companyIntegrationsSearch: "company_integrations_search",
  companyProductsServicesProductsSearch: "company_products_services_products_search",
  companyProductsServicesServicesSearch: "company_products_services_services_search",
  companyIcpTitlesSearch: "company_icp_titles_search",
  companyIcpIndustriesSearch: "company_icp_industries_search",
  companyIcpGeographicMarketsSearch: "company_icp_geographic_markets_search",
  companyIcpOtherDepartmentsSearch: "company_icp_other_departments_search",
  companyAwardsSearch: "company_awards_search",
  companyAwardsComplianceSearch: "company_awards_compliance_search",
  companyHeadcountByLocationSearch: "company_headcount_by_location_search",
  companyFundingInvestorsSearch: "company_funding_investors_search",
  companyFundingAcceleratorSearch: "company_funding_accelerator_search",
  companyWebsiteTrafficCountriesSearch: "company_website_traffic_countries_search",
};

function buildSearchSuggestionsBody(input: Record<string, unknown>) {
  for (const [inputKey, requestKey] of Object.entries(searchSuggestionRequestFields)) {
    const value = readNonEmptyString(input[inputKey]);
    if (value) {
      return { [requestKey]: value };
    }
  }

  return {};
}

const searchSuggestionResponseFields = {
  location_suggestions: "locationSuggestions",
  job_title_suggestions: "jobTitleSuggestions",
  technology_suggestions: "technologySuggestions",
  industry_suggestions: "industrySuggestions",
  naics_suggestions: "naicsSuggestions",
  sic_suggestions: "sicSuggestions",
};

function normalizeSearchSuggestions(payload: Record<string, unknown>) {
  const entries: Record<string, unknown[] | null> = {
    locationSuggestions: null,
    jobTitleSuggestions: null,
    technologySuggestions: null,
    industrySuggestions: null,
    naicsSuggestions: null,
    sicSuggestions: null,
    companyFilterSuggestions: null,
  };
  let suggestionField: string | null = null;
  let suggestions: unknown[] = [];

  for (const [responseKey, outputKey] of Object.entries(searchSuggestionResponseFields)) {
    const value = readOptionalArray(payload, responseKey);
    if (!value) {
      continue;
    }

    suggestionField = responseKey;
    suggestions = value;
    entries[outputKey] = value;
    break;
  }

  if (!suggestionField) {
    for (const key of Object.keys(payload)) {
      if (!key.startsWith("company_") || !key.endsWith("_suggestions")) {
        continue;
      }

      const value = readOptionalArray(payload, key);
      if (!value) {
        continue;
      }

      suggestionField = key;
      suggestions = value;
      entries.companyFilterSuggestions = value;
      break;
    }
  }

  return {
    suggestionField,
    suggestions,
    ...entries,
  };
}

function readOptionalArray(input: Record<string, unknown>, key: string) {
  const direct = input[key];
  if (Array.isArray(direct)) {
    return normalizeArrayItems(direct);
  }

  return null;
}

function readFirstString(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readFirstInteger(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function readFirstObject(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = optionalRecord(input[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readNonEmptyString(value: unknown) {
  const text = optionalString(value);
  return text || undefined;
}
