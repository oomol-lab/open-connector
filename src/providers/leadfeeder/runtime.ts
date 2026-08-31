import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const leadfeederApiBaseUrl = "https://api.leadfeeder.com";
const validationPath = "/v1/users/me";

type LeadfeederPhase = "validate" | "execute";
type LeadfeederActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const leadfeederActionHandlers: ProviderActionHandlers<"leadfeeder", LeadfeederActionHandler> = {
  list_accounts(input, context) {
    return requestLeadfeederJson({
      apiKey: context.apiKey,
      path: "/v1/accounts",
      query: buildQueryParams(input, [["accountId", "account_id"]]),
      phase: "execute",
      context,
    });
  },
  get_current_user(_input, context) {
    return requestLeadfeederJson({
      apiKey: context.apiKey,
      path: validationPath,
      phase: "execute",
      context,
    });
  },
  get_company(input, context) {
    return requestLeadfeederJson({
      apiKey: context.apiKey,
      path: `/v1/companies/${encodePathSegment(requiredString(input.companyId, "companyId", providerInputError))}`,
      query: buildQueryParams(input, [["accountId", "account_id"], "include"]),
      phase: "execute",
      context,
    });
  },
  get_companies(input, context) {
    return requestLeadfeederJson({
      apiKey: context.apiKey,
      path: "/v1/companies",
      query: buildQueryParams(
        {
          ...input,
          companyIds: stringArray(input.companyIds, "companyIds", providerInputError).join(","),
        },
        [["companyIds", "ids"], ["accountId", "account_id"], "include"],
      ),
      phase: "execute",
      context,
    });
  },
  search_companies(input, context) {
    assertSearchCriteria(input);
    return requestLeadfeederJson({
      apiKey: context.apiKey,
      path: "/v1/companies/search",
      method: "POST",
      query: buildQueryParams(input, [
        ["accountId", "account_id"],
        ["pageCursor", "page[cursor]"],
        ["pageSize", "page[size]"],
      ]),
      body: buildSearchCompaniesBody(input),
      phase: "execute",
      context,
    });
  },
  match_companies(input, context) {
    return requestLeadfeederJson({
      apiKey: context.apiKey,
      path: "/v1/companies/match",
      method: "POST",
      query: buildQueryParams(input, [
        ["accountId", "account_id"],
        ["maxResultsPerCompany", "max_results_per_company"],
      ]),
      body: {
        companies: objectArray(input.companies, "companies", providerInputError).map(toLeadfeederMatchCompany),
      },
      phase: "execute",
      context,
    });
  },
  enrich_ip(input, context) {
    return requestLeadfeederJson({
      apiKey: context.apiKey,
      path: "/v1/ip/enrich",
      query: buildQueryParams(input, [["accountId", "account_id"], "ip"]),
      phase: "execute",
      context,
    });
  },
};

export async function validateLeadfeederCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestLeadfeederJson({
    apiKey,
    path: validationPath,
    phase: "validate",
    context: { fetcher, signal },
  });
  const data = requiredRecord(
    requiredRecord(payload, "Leadfeeder response", providerResponseError).data,
    "Leadfeeder current user",
    providerResponseError,
  );
  const attributes = optionalRecord(data.attributes) ?? {};
  const email = optionalString(attributes.email);
  const fullName = [optionalString(attributes.first_name), optionalString(attributes.last_name)]
    .filter(Boolean)
    .join(" ");

  return {
    profile: {
      accountId: optionalString(data.id),
      displayName: email ?? fullName ?? "Leadfeeder API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: leadfeederApiBaseUrl,
      validationEndpoint: validationPath,
      userId: optionalString(data.id),
      email,
      teamRole: optionalString(attributes.team_role),
    }),
  };
}

async function requestLeadfeederJson(input: {
  apiKey: string;
  path: string;
  phase: LeadfeederPhase;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  method?: "GET" | "POST";
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(input.path, leadfeederApiBaseUrl);
  if (input.query && input.query.size > 0) {
    url.search = input.query.toString();
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-Api-Key": input.apiKey,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Leadfeeder request failed: ${error.message}` : "Leadfeeder request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createLeadfeederError(response.status, payload, input.phase);
  }
  return payload;
}

function buildQueryParams(
  input: Record<string, unknown>,
  allowed: readonly (string | readonly [string, string])[],
): URLSearchParams {
  const query = new URLSearchParams();
  for (const field of allowed) {
    const inputKey = typeof field === "string" ? field : field[0];
    const outputKey = typeof field === "string" ? field : field[1];
    const value = input[inputKey];
    if (value !== undefined && value !== null && value !== "") {
      query.set(outputKey, String(value));
    }
  }
  return query;
}

function buildSearchCompaniesBody(input: Record<string, unknown>): Record<string, unknown> {
  const revenue = optionalRecord(input.revenue);
  if (revenue && revenue.min === undefined && revenue.max === undefined) {
    throw new ProviderRequestError(400, "At least one of revenue.min or revenue.max is required.");
  }
  return compactObject({
    search_terms: input.searchTerms,
    locations: Array.isArray(input.locations) ? input.locations.map(toSearchLocation) : undefined,
    industries: input.industries,
    employee_ranges: input.employeeRanges,
    revenue: input.revenue,
    icp_ids: input.icpIds,
    filters: toSearchFilters(input.filters),
  });
}

function assertSearchCriteria(input: Record<string, unknown>): void {
  const fields = ["searchTerms", "locations", "industries", "employeeRanges", "revenue", "icpIds", "filters"];
  if (!fields.some((field) => input[field] !== undefined)) {
    throw new ProviderRequestError(400, "At least one company search criterion is required.");
  }
}

function toSearchLocation(value: unknown): Record<string, unknown> {
  const location = requiredRecord(value, "Leadfeeder search location", providerInputError);
  const geo = optionalRecord(location.geo);
  return compactObject({
    street: location.street,
    postal_code: location.postalCode,
    city: location.city,
    country_code: location.countryCode,
    region_code: location.regionCode,
    geo: geo
      ? compactObject({
          latitude: geo.latitude,
          longitude: geo.longitude,
          distance: geo.distance,
        })
      : undefined,
  });
}

function toSearchFilters(value: unknown): Record<string, unknown> | undefined {
  const filters = optionalRecord(value);
  if (!filters) {
    return undefined;
  }
  return compactObject({
    has_phone: filters.hasPhone,
    has_email: filters.hasEmail,
    has_social_media_profiles: filters.hasSocialMediaProfiles,
    do_not_contact: filters.doNotContact,
    has_financials_revenue: filters.hasFinancialsRevenue,
    has_financials_earnings: filters.hasFinancialsEarnings,
    has_financials_net_worth: filters.hasFinancialsNetWorth,
    has_ip_addresses: filters.hasIpAddresses,
  });
}

function toLeadfeederMatchCompany(value: Record<string, unknown>): Record<string, unknown> {
  if (
    value.companyName === undefined &&
    value.url === undefined &&
    value.vatId === undefined &&
    value.registerId === undefined
  ) {
    throw new ProviderRequestError(400, "At least one of companyName, url, vatId, or registerId is required.");
  }
  return compactObject({
    company_name: value.companyName,
    url: value.url,
    email: value.email,
    phone: value.phone,
    country: value.country,
    country_code: value.countryCode,
    city: value.city,
    postal_code: value.postalCode,
    street: value.street,
    street_name: value.streetName,
    street_number: value.streetNumber,
    register_id: value.registerId,
    register_location: value.registerLocation,
    vat_id: value.vatId,
  });
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Leadfeeder returned invalid JSON");
    }
    return { errors: [{ title: text }] };
  }
}

function createLeadfeederError(status: number, payload: unknown, phase: LeadfeederPhase): ProviderRequestError {
  const message = readErrorMessage(payload, status);
  if (status === 401 || (phase === "validate" && status === 403)) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readErrorMessage(payload: unknown, status: number): string {
  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    return `Leadfeeder request failed with ${status}`;
  }
  if (Array.isArray(objectPayload.errors)) {
    const firstError = objectPayload.errors.find((item) => optionalRecord(item));
    const error = optionalRecord(firstError);
    if (error) {
      return (
        optionalString(error.detail) ??
        optionalString(error.title) ??
        optionalString(error.message) ??
        optionalString(error.code) ??
        `Leadfeeder request failed with ${status}`
      );
    }
  }
  return (
    optionalString(objectPayload.detail) ??
    optionalString(objectPayload.title) ??
    optionalString(objectPayload.message) ??
    `Leadfeeder request failed with ${status}`
  );
}
