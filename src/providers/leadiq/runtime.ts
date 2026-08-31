import type { ApiKeyActionRequest, ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface LeadiqCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const leadiqApiBaseUrl = "https://api.leadiq.com";
export const leadiqGraphqlPath = "/graphql";

type LeadiqRequestPhase = "validate" | "execute";
type LeadiqActionHandler = (input: ApiKeyActionRequest, fetcher: typeof fetch) => Promise<unknown>;

interface GraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
}

const accountQuery = `
query Account {
  account {
    plans { name product status nextBillingPeriod }
    dataHubPlan { name product status nextBillingPeriod available used }
    universalPlan { name product status nextBillingPeriod available used }
  }
}`;

const searchPeopleQuery = `
query SearchPeople($input: SearchPeopleInput!) {
  searchPeople(input: $input) {
    totalResults
    hasMore
    results {
      id
      name { fullName first last }
      currentPositions {
        title
        seniority
        function
        companyInfo { id name domain }
        emails { value status type }
        phones { value type verificationStatus }
      }
      linkedin { linkedinUrl }
    }
  }
}`;

const searchCompanyQuery = `
query SearchCompany($input: SearchCompanyInput!) {
  searchCompany(input: $input) {
    totalResults
    results {
      id
      name
      domain
      industry
      numberOfEmployees
      locationInfo { city areaLevel1 country }
      fundingInfo { fundingTotalUsd lastFundingType }
      technologies { name category }
    }
  }
}`;

const flatAdvancedSearchQuery = `
query FlatAdvancedSearch($input: FlatSearchInput!) {
  flatAdvancedSearch(input: $input) {
    totalPeople
    people { id }
  }
}`;

const groupedAdvancedSearchQuery = `
query GroupedAdvancedSearch($input: GroupedSearchInput!) {
  groupedAdvancedSearch(input: $input) {
    totalCompanies
    companies {
      totalContactsInCompany
      company { id name domain industry employeeCount }
      people { id name title seniority linkedinUrl }
    }
  }
}`;

export const leadiqActionHandlers: ProviderActionHandlers<"leadiq", LeadiqActionHandler> = {
  async get_account(input, fetcher) {
    const data = await leadiqRequest(input.apiKey, { query: accountQuery }, fetcher, "execute");
    return requireGraphqlObject(data, "account");
  },
  async search_people(input, fetcher) {
    requireAnyStringField(
      input.input,
      ["id", "linkedinUrl", "email", "firstName", "lastName"],
      "provide at least one person identifier",
    );
    const searchInput = normalizeLeadiqStrings(input.input, ["id", "firstName", "lastName"]);
    const company = optionalRecord(searchInput.company);
    if (company) searchInput.company = normalizeLeadiqStrings(company, ["name", "domain"]);
    const data = await leadiqRequest(
      input.apiKey,
      { query: searchPeopleQuery, variables: { input: searchInput } },
      fetcher,
      "execute",
    );
    return requireGraphqlObject(data, "searchPeople");
  },
  async search_company(input, fetcher) {
    requireAnyStringField(
      input.input,
      ["id", "name", "domain", "linkedinId"],
      "provide at least one company identifier",
    );
    const searchInput = normalizeLeadiqStrings(input.input, ["id", "name", "domain", "linkedinId"]);
    const data = await leadiqRequest(
      input.apiKey,
      { query: searchCompanyQuery, variables: { input: searchInput } },
      fetcher,
      "execute",
    );
    return requireGraphqlObject(data, "searchCompany");
  },
  async flat_advanced_search(input, fetcher) {
    requireAdvancedSearchFilter(input.input);
    const data = await leadiqRequest(
      input.apiKey,
      {
        query: flatAdvancedSearchQuery,
        variables: { input: buildAdvancedSearchInput(input.input) },
      },
      fetcher,
      "execute",
    );
    return requireGraphqlObject(data, "flatAdvancedSearch");
  },
  async grouped_advanced_search(input, fetcher) {
    requireAdvancedSearchFilter(input.input);
    const data = await leadiqRequest(
      input.apiKey,
      {
        query: groupedAdvancedSearchQuery,
        variables: { input: buildAdvancedSearchInput(input.input) },
      },
      fetcher,
      "execute",
    );
    return requireGraphqlObject(data, "groupedAdvancedSearch");
  },
};

function requireAdvancedSearchFilter(input: Record<string, unknown>): void {
  if (!["roles", "seniorities", "locations"].some((field) => Array.isArray(input[field]))) {
    throw new ProviderRequestError(400, "provide at least one advanced search filter");
  }
}

function requireAnyStringField(input: Record<string, unknown>, fields: string[], message: string): void {
  if (!fields.some((field) => typeof input[field] === "string" && input[field].trim().length > 0)) {
    throw new ProviderRequestError(400, message);
  }
}

export async function validateLeadiqCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<LeadiqCredentialCheck> {
  const apiKey = requireLeadiqApiKey(input);
  const data = await leadiqRequest(apiKey, { query: accountQuery }, fetcher, "validate");
  const account = requireGraphqlObject(data, "account");
  const plans = Array.isArray(account.plans) ? account.plans : [];
  const planName = plans.map((value) => optionalString(optionalRecord(value)?.name)).find((value) => value);

  return {
    accountLabel: planName ? `LeadIQ ${planName}` : "LeadIQ Account",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: leadiqApiBaseUrl,
      validationEndpoint: leadiqGraphqlPath,
    },
  };
}

export function requireLeadiqApiKey(input: { apiKey?: string }): string {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    throw new ProviderRequestError(400, "leadiq api_key is required");
  }
  return apiKey;
}

async function leadiqRequest(
  apiKey: string,
  request: GraphqlRequest,
  fetcher: typeof fetch,
  phase: LeadiqRequestPhase,
) {
  let response: Response;
  try {
    response = await fetcher(`${leadiqApiBaseUrl}${leadiqGraphqlPath}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `leadiq request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  }

  const payload = await readLeadiqPayload(response);
  if (!response.ok) {
    throw mapLeadiqError(response.status, readGraphqlErrorMessage(payload), phase);
  }

  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  if (errors.length > 0) {
    const firstError = optionalRecord(errors[0]);
    const status = readGraphqlErrorStatus(firstError) ?? 500;
    throw mapLeadiqError(status, optionalString(firstError?.message) ?? "LeadIQ GraphQL request failed", phase);
  }

  return requiredRecord(payload.data, "LeadIQ response data");
}

async function readLeadiqPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "leadiq returned an empty response");
  }
  try {
    return requiredRecord(JSON.parse(text), "LeadIQ response");
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(502, "leadiq returned malformed JSON");
  }
}

function readGraphqlErrorStatus(error: Record<string, unknown> | undefined) {
  const extensions = optionalRecord(error?.extensions);
  const response = optionalRecord(extensions?.response);
  const status = response?.status;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function readGraphqlErrorMessage(payload: Record<string, unknown>) {
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  return optionalString(optionalRecord(errors[0])?.message) ?? "LeadIQ request failed";
}

function mapLeadiqError(status: number, message: string, phase: LeadiqRequestPhase) {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 409, message);
  }
  if (status === 402) {
    return new ProviderRequestError(402, message || "LeadIQ credits are insufficient");
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function requireGraphqlObject(data: Record<string, unknown>, field: string) {
  const value = optionalRecord(data[field]);
  if (!value) {
    throw new ProviderRequestError(502, `leadiq response is missing data.${field}`);
  }
  return value;
}

function buildAdvancedSearchInput(input: Record<string, unknown>) {
  const { roles, seniorities, locations, limit, skip } = input;
  return {
    contactFilter: {
      roles: trimStringArray(roles),
      seniorities: trimStringArray(seniorities),
      locations: Array.isArray(locations)
        ? locations.map((location) => {
            const value = optionalRecord(location);
            return value ? normalizeLeadiqStrings(value, ["city", "areaLevel1", "country"]) : location;
          })
        : locations,
    },
    limit,
    skip,
  };
}

function normalizeLeadiqStrings(input: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const output = { ...input };
  for (const field of fields) {
    if (typeof output[field] === "string") output[field] = output[field].trim();
  }
  return output;
}

function trimStringArray(value: unknown): unknown {
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : item)) : value;
}
