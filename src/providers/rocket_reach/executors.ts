import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "rocket_reach";
const rocketReachApiBaseUrl = "https://api.rocketreach.co/api/v2";
const requestTimeoutMs = 30_000;

type RocketReachQueryValue = string | number | boolean | Array<string | number> | undefined;
type RocketReachActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const rocketReachActionHandlers: ProviderActionHandlers<"rocket_reach", RocketReachActionHandler> = {
  get_account(_input, context) {
    return getAccount(context);
  },
  search_people(input, context) {
    return searchPeople(input, context);
  },
  lookup_person(input, context) {
    return lookupPerson(input, context);
  },
  lookup_person_and_company(input, context) {
    return lookupPersonAndCompany(input, context);
  },
  check_person_status(input, context) {
    return checkPersonStatus(input, context);
  },
  search_companies(input, context) {
    return searchCompanies(input, context);
  },
  lookup_company(input, context) {
    return lookupCompany(input, context);
  },
  get_company_size(input, context) {
    return getCompanySize(input, context);
  },
  get_company_funding(input, context) {
    return getCompanyFunding(input, context);
  },
  get_company_industries(input, context) {
    return getCompanyIndustries(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rocketReachActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const account = await requestRocketReachJson({
      apiKey,
      path: "/account",
      fetcher,
      signal,
      phase: "validate",
    });
    const accountObject = requireResponseObject(account, "account");
    const accountId = firstNonEmptyString(optionalString(accountObject.id), optionalString(accountObject.email));
    return {
      profile: {
        accountId: accountId ?? "rocketreach-api-key",
        displayName:
          firstNonEmptyString(optionalString(accountObject.name), optionalString(accountObject.email), accountId) ??
          "RocketReach API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/account",
        apiBaseUrl: rocketReachApiBaseUrl,
        accountId,
        email: optionalString(accountObject.email),
        name: optionalString(accountObject.name),
      }),
    };
  },
};

async function getAccount(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  return {
    account: requireResponseObject(
      await requestRocketReachJson({
        apiKey: context.apiKey,
        path: "/account",
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
      "account",
    ),
  };
}

async function searchPeople(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const query = requiredInputRecord(input.query, "query");
  const limit = readLimit(input.limit);
  const page = readPage(input.page);
  const options = optionalRecord(input.options) ?? {};
  const payload = await requestRocketReachJson({
    apiKey: context.apiKey,
    path: "/search",
    method: "POST",
    body: {
      ...options,
      query,
      start: (page - 1) * limit + 1,
      page_size: limit,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = optionalRecord(payload) ?? {};
  return {
    profiles: readObjectArray(record.profiles),
    pagination: optionalRecord(record.pagination) ?? null,
  };
}

async function lookupPerson(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return {
    person: requireResponseObject(
      await requestRocketReachJson({
        apiKey: context.apiKey,
        path: "/person/lookup",
        query: buildPersonLookupQuery(input),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
      "person",
    ),
  };
}

async function lookupPersonAndCompany(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const person = requireResponseObject(
    await requestRocketReachJson({
      apiKey: context.apiKey,
      path: "/person/lookup",
      query: buildPersonLookupQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "person",
  );
  return {
    person,
    company: extractCompanyFromPersonPayload(person),
  };
}

async function checkPersonStatus(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const ids = Array.isArray(input.ids)
    ? input.ids
        .map((value) =>
          typeof value === "string" && value
            ? value
            : typeof value === "number" && Number.isInteger(value) && value > 0
              ? String(value)
              : null,
        )
        .filter((value): value is string => value !== null)
    : [];
  const payload = await requestRocketReachJson({
    apiKey: context.apiKey,
    path: "/person/checkStatus",
    query: { ids },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { people: Array.isArray(payload) ? readObjectArray(payload) : [] };
}

async function searchCompanies(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const page = readPage(input.page);
  if (page > 1) {
    return {
      companies: [],
      exactMatchOnly: true,
    };
  }
  const company = await lookupCompanyProfile(
    context.apiKey,
    {
      ...input,
      name: optionalString(input.name) ?? optionalString(input.query) ?? optionalString(input.domain),
    },
    context,
  );
  return {
    companies: readLimit(input.limit) >= 1 ? [company] : [],
    exactMatchOnly: true,
  };
}

async function lookupCompany(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return { company: await lookupCompanyProfile(context.apiKey, input, context) };
}

async function getCompanySize(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const company = await lookupCompanyProfile(context.apiKey, input, context);
  return { company, numEmployees: company.numEmployees };
}

async function getCompanyFunding(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const rawCompany = await lookupCompanyRaw(context.apiKey, input, context);
  const company = normalizeCompany(rawCompany);
  return {
    company,
    revenue: company.revenue,
    fundingInvestors: Array.isArray(rawCompany.funding_investors) ? rawCompany.funding_investors : [],
  };
}

async function getCompanyIndustries(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const company = await lookupCompanyProfile(context.apiKey, input, context);
  return {
    company,
    primaryIndustry: company.industry,
    industryKeywords: company.industryKeywords,
  };
}

async function lookupCompanyProfile(
  apiKey: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return normalizeCompany(await lookupCompanyRaw(apiKey, input, context));
}

async function lookupCompanyRaw(
  apiKey: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return requireResponseObject(
    await requestRocketReachJson({
      apiKey,
      path: "/company/lookup",
      query: buildCompanyLookupQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "company",
  );
}

function buildPersonLookupQuery(input: Record<string, unknown>): Record<string, RocketReachQueryValue> {
  return compactObject({
    id: readOptionalPositiveInteger(input.id),
    email: optionalString(input.email),
    name: optionalString(input.name),
    linkedin_url: optionalString(input.linkedin_url),
    current_employer: optionalString(input.current_employer),
    title: optionalString(input.title),
    npi_number: readOptionalPositiveInteger(input.npi_number),
    lookup_type: optionalString(input.lookup_type),
    webhook_id: readOptionalPositiveInteger(input.webhook_id),
    return_cached_emails: typeof input.return_cached_emails === "boolean" ? input.return_cached_emails : undefined,
    block: typeof input.block === "boolean" ? input.block : undefined,
  });
}

function buildCompanyLookupQuery(input: Record<string, unknown>): Record<string, RocketReachQueryValue> {
  return compactObject({
    id: readOptionalPositiveInteger(input.id) ?? readOptionalPositiveInteger(input.company_id),
    name: optionalString(input.name) ?? optionalString(input.query),
    domain: optionalString(input.domain) ?? (typeof input.company_id === "string" ? input.company_id : undefined),
  });
}

function normalizeCompany(rawCompany: Record<string, unknown>): Record<string, unknown> {
  return {
    companyId: readNullableInteger(rawCompany.id),
    name: readNullableString(rawCompany.name),
    domain:
      firstNonEmptyString(
        optionalString(rawCompany.domain),
        optionalString(rawCompany.website_domain),
        optionalString(rawCompany.email_domain),
      ) ?? null,
    emailDomain: readNullableString(rawCompany.email_domain),
    websiteDomain: readNullableString(rawCompany.website_domain),
    rrProfileUrl: readNullableString(rawCompany.rr_profile_url),
    yearFounded: readNullableString(rawCompany.year_founded),
    numEmployees: readNullableInteger(rawCompany.num_employees),
    revenue: readNullableNumber(rawCompany.revenue),
    industry: readNullableString(rawCompany.industry),
    industryKeywords: readStringArray(rawCompany.industry_keywords),
    description: readNullableString(rawCompany.description),
    links: optionalRecord(rawCompany.links) ?? null,
    address: optionalRecord(rawCompany.address) ?? null,
    raw: rawCompany,
  };
}

function extractCompanyFromPersonPayload(person: Record<string, unknown>): Record<string, unknown> | null {
  for (const key of [
    "company",
    "current_employer_data",
    "current_employer_profile",
    "current_employer_company",
    "organization",
  ]) {
    const candidate = optionalRecord(person[key]);
    if (candidate) {
      return normalizeCompany(candidate);
    }
  }
  return null;
}

async function requestRocketReachJson(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  method?: "GET" | "POST";
  query?: Record<string, RocketReachQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);
  const signal = input.signal ?? controller.signal;
  try {
    const response = await input.fetcher(buildRocketReachUrl(input.path, input.query ?? {}), {
      method: input.method ?? "GET",
      headers: {
        "user-agent": providerUserAgent,
        "Api-Key": input.apiKey,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal,
    });
    const payload = await readRocketReachJson(response);
    if (!response.ok) {
      throw normalizeRocketReachError(response, payload, input.phase, input.notFoundAsInvalidInput === true);
    }
    return payload;
  } catch (error) {
    if (timedOut && error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ProviderRequestError(
        502,
        `rocket_reach ${input.path} request timed out after ${Math.ceil(requestTimeoutMs / 1000)} seconds`,
      );
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error && error.message ? error.message : "rocket_reach request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildRocketReachUrl(path: string, query: Record<string, RocketReachQueryValue>): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${rocketReachApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        url.searchParams.append(key, String(child));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readRocketReachJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status || 502,
      `rocket_reach returned invalid JSON: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
  }
}

function normalizeRocketReachError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readRocketReachErrorMessage(payload, response.status);
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 400 ? response.status : 500, message, payload);
}

function readRocketReachErrorMessage(payload: unknown, status: number): string {
  const record = optionalRecord(payload);
  if (!record) {
    return `rocket_reach request failed with ${status}`;
  }
  const detail = optionalString(record.detail);
  if (detail) {
    return detail;
  }
  const error = optionalString(record.error);
  if (error) {
    return error;
  }
  const parts = Object.entries(record).flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return value.length === 0 ? [] : [`${key}: ${value.map((item) => String(item)).join(", ")}`];
    }
    if (value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(([nestedKey, nestedValue]) =>
        Array.isArray(nestedValue)
          ? [`${key}.${nestedKey}: ${nestedValue.map((item) => String(item)).join(", ")}`]
          : nestedValue != null
            ? [`${key}.${nestedKey}: ${String(nestedValue)}`]
            : [],
      );
    }
    return value != null ? [`${key}: ${String(value)}`] : [];
  });
  return parts.length > 0 ? parts.join("; ") : `rocket_reach request failed with ${status}`;
}

function requireResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(
    value,
    fieldName,
    () => new ProviderRequestError(502, `rocket_reach response missing ${fieldName}`),
  );
}

function requiredInputRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, () => new ProviderRequestError(400, `${fieldName} must be an object`));
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readPage(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function readLimit(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 20;
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readNullableInteger(value: unknown): number | null {
  return value === null ? null : typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readNullableString(value: unknown): string | null {
  return nullableString(value) ?? null;
}

function readNullableNumber(value: unknown): number | null {
  return value === null ? null : (optionalNumber(value) ?? null);
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value);
}
