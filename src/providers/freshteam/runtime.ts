import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FreshteamActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const freshteamValidationPath = "/api/employees";
const freshteamDefaultRequestTimeoutMs = 30_000;
const defaultFreshteamPage = 1;

export interface FreshteamActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FreshteamRequestInput {
  baseUrl: string;
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  query?: Record<string, string | number | undefined>;
  mode: "validate" | "execute";
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}

interface FreshteamResponse {
  payload: unknown;
  headers: Headers;
}

export const freshteamActionHandlers: Record<FreshteamActionName, ProviderRuntimeHandler<FreshteamActionContext>> = {
  async list_employees(input, context) {
    const page = readPage(input.page);
    const response = await requestFreshteamJson({
      ...context,
      path: freshteamValidationPath,
      mode: "execute",
      query: buildListEmployeesQuery(input, page),
    });

    return {
      employees: readArrayPayload(response.payload, "employees", "Freshteam employees"),
      pagination: buildFreshteamPagination(response.headers, page),
    };
  },

  async get_employee(input, context) {
    const employeeId = requirePositiveInteger(input.employeeId, "employeeId");
    const response = await requestFreshteamJson({
      ...context,
      path: `/api/employees/${employeeId}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        include: stringifyStringList(input.include),
      }),
    });

    return {
      employee: readObjectPayload(response.payload, "employee", "Freshteam employee"),
    };
  },

  async list_employee_fields(input, context) {
    const page = readPage(input.page);
    const response = await requestFreshteamJson({
      ...context,
      path: "/api/employee_fields",
      mode: "execute",
      query: { page },
    });

    return {
      employeeFields: readArrayPayload(response.payload, "employee_fields", "Freshteam employee fields"),
      pagination: buildFreshteamPagination(response.headers, page),
    };
  },

  async list_job_postings(input, context) {
    const page = readPage(input.page);
    const response = await requestFreshteamJson({
      ...context,
      path: "/api/job_postings",
      mode: "execute",
      query: buildListJobPostingsQuery(input, page),
    });

    return {
      jobPostings: readArrayPayload(response.payload, "job_postings", "Freshteam job postings"),
      pagination: buildFreshteamPagination(response.headers, page),
    };
  },

  async get_job_posting(input, context) {
    const jobPostingId = requirePositiveInteger(input.jobPostingId, "jobPostingId");
    const response = await requestFreshteamJson({
      ...context,
      path: `/api/job_postings/${jobPostingId}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      jobPosting: readObjectPayload(response.payload, "job_posting", "Freshteam job posting"),
    };
  },

  async list_job_posting_fields(input, context) {
    const page = readPage(input.page);
    const response = await requestFreshteamJson({
      ...context,
      path: "/api/job_posting_fields",
      mode: "execute",
      query: { page },
    });

    return {
      jobPostingFields: readArrayPayload(response.payload, "job_posting_fields", "Freshteam job posting fields"),
      pagination: buildFreshteamPagination(response.headers, page),
    };
  },

  async list_applicant_fields(input, context) {
    const jobPostingId = requirePositiveInteger(input.jobPostingId, "jobPostingId");
    const page = readPage(input.page);
    const response = await requestFreshteamJson({
      ...context,
      path: `/api/job_postings/${jobPostingId}/applicant_fields`,
      mode: "execute",
      notFoundAsInvalidInput: true,
      query: { page },
    });

    return {
      applicantFields: readArrayPayload(response.payload, "applicant_fields", "Freshteam applicant fields"),
      pagination: buildFreshteamPagination(response.headers, page),
    };
  },

  async list_candidate_sources(input, context) {
    const page = readPage(input.page);
    const response = await requestFreshteamJson({
      ...context,
      path: "/api/candidate_sources",
      mode: "execute",
      query: { page },
    });

    return {
      candidateSources: readArrayPayload(response.payload, "candidate_sources", "Freshteam candidate sources"),
      pagination: buildFreshteamPagination(response.headers, page),
    };
  },

  async list_candidate_source_categories(input, context) {
    const page = readPage(input.page);
    const response = await requestFreshteamJson({
      ...context,
      path: "/api/candidate_source_categories",
      mode: "execute",
      query: { page },
    });

    return {
      candidateSourceCategories: readArrayPayload(
        response.payload,
        "candidate_source_categories",
        "Freshteam candidate source categories",
      ),
      pagination: buildFreshteamPagination(response.headers, page),
    };
  },
};

export async function validateFreshteamCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const domain = normalizeFreshteamDomain(values.domain);
  const baseUrl = buildFreshteamBaseUrl(domain);
  const response = await requestFreshteamJson({
    baseUrl,
    apiKey,
    path: freshteamValidationPath,
    fetcher,
    signal,
    mode: "validate",
    query: { page: defaultFreshteamPage },
  });

  if (!Array.isArray(response.payload)) {
    throw new ProviderRequestError(502, "Freshteam validation response must be an array", response.payload);
  }

  return {
    profile: {
      accountId: `freshteam:${domain}`,
      displayName: `Freshteam ${domain}`,
    },
    grantedScopes: [],
    metadata: {
      domain,
      baseUrl,
      validationEndpoint: `${freshteamValidationPath}?page=1`,
    },
  };
}

export function resolveFreshteamBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const baseUrl = optionalString(metadata.baseUrl);
  if (baseUrl) {
    return trimTrailingSlash(baseUrl);
  }

  const domain = optionalString(metadata.domain) ?? optionalString(values.domain);
  return buildFreshteamBaseUrl(normalizeFreshteamDomain(domain));
}

function buildListEmployeesQuery(input: Record<string, unknown>, page: number): Record<string, string | number> {
  return compactQuery({
    page,
    status: optionalString(input.status),
    first_name: optionalString(input.firstName),
    last_name: optionalString(input.lastName),
    personal_email: optionalString(input.personalEmail),
    official_email: optionalString(input.officialEmail),
    employee_type: optionalString(input.employeeType),
    department: optionalInteger(input.departmentId),
    business_unit: optionalInteger(input.businessUnitId),
    location: stringifyIntegerList(input.locationIds),
    reporting_manager: optionalInteger(input.reportingManagerId),
    updated_since: optionalString(input.updatedSince),
    sort: optionalString(input.sort),
    sort_type: optionalString(input.sortType),
    draft: stringifyBoolean(input.draft),
    terminated: stringifyBoolean(input.terminated),
    deleted: stringifyBoolean(input.deleted),
  });
}

function buildListJobPostingsQuery(input: Record<string, unknown>, page: number): Record<string, string | number> {
  return compactQuery({
    page,
    status: optionalString(input.status),
    title: optionalString(input.title),
    type: optionalString(input.type),
    department: optionalInteger(input.departmentId),
    location: optionalInteger(input.locationId),
    remote: stringifyBoolean(input.remote),
    location_city: optionalString(input.locationCity),
    location_country: optionalString(input.locationCountry),
  });
}

function compactQuery(input: Record<string, string | number | undefined>): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      query[key] = value;
    }
  }
  return query;
}

async function requestFreshteamJson(input: FreshteamRequestInput): Promise<FreshteamResponse> {
  const timeout = createProviderTimeout(input.signal, freshteamDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildFreshteamUrl(input.baseUrl, input.path, input.query), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "User-Agent": providerUserAgent,
        Accept: "application/json",
      },
      signal: timeout.signal,
    });

    const payload = await readFreshteamPayload(response);
    if (!response.ok) {
      throw createFreshteamError(response, payload, input.mode, input.notFoundAsInvalidInput === true);
    }

    return {
      payload,
      headers: response.headers,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      timeout.didTimeout()
        ? `Freshteam request timed out after ${Math.max(1, Math.ceil(freshteamDefaultRequestTimeoutMs / 1000))} seconds`
        : error instanceof Error
          ? `Freshteam request failed: ${error.message}`
          : "Freshteam request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readFreshteamPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Freshteam returned invalid JSON");
  }
}

function createFreshteamError(
  response: Response,
  payload: unknown,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractFreshteamErrorMessage(payload) ?? `Freshteam request failed with ${response.status}`;

  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function extractFreshteamErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct = optionalString(record.message) ?? optionalString(record.description) ?? optionalString(record.error);
  if (direct) {
    return direct;
  }

  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = optionalRecord(errors[0]);
    const message = first ? (optionalString(first.message) ?? optionalString(first.description)) : undefined;
    if (message) {
      return message;
    }
  }
  return undefined;
}

function buildFreshteamUrl(baseUrl: string, path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${trimTrailingSlash(baseUrl)}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildFreshteamBaseUrl(domain: string): string {
  return `https://${domain}.freshteam.com`;
}

function normalizeFreshteamDomain(rawDomain: unknown): string {
  const domain = optionalString(rawDomain);
  if (!domain) {
    throw new ProviderRequestError(400, "domain is required");
  }

  let normalized = domain;
  if (normalized.startsWith("https://")) {
    normalized = normalized.slice("https://".length);
  } else if (normalized.startsWith("http://")) {
    normalized = normalized.slice("http://".length);
  }

  normalized = trimTrailingSlash(normalized);
  if (normalized.toLowerCase().endsWith(".freshteam.com")) {
    normalized = normalized.slice(0, -".freshteam.com".length);
  }
  normalized = normalized.toLowerCase();

  if (!normalized || !isFreshteamSubdomain(normalized)) {
    throw new ProviderRequestError(400, "domain is required");
  }

  return normalized;
}

function isFreshteamSubdomain(value: string): boolean {
  if (value.length === 0 || value.startsWith("-") || value.endsWith("-")) {
    return false;
  }

  for (const char of value) {
    const isLetter = char >= "a" && char <= "z";
    const isDigit = char >= "0" && char <= "9";
    if (!isLetter && !isDigit && char !== "-") {
      return false;
    }
  }
  return true;
}

function readPage(value: unknown): number {
  return optionalInteger(value) ?? defaultFreshteamPage;
}

function readArrayPayload(payload: unknown, wrapperKey: string, label: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const wrapper = optionalRecord(payload);
  const wrapped = wrapper?.[wrapperKey];
  if (Array.isArray(wrapped)) {
    return wrapped;
  }

  throw new ProviderRequestError(502, `${label} response must be an array`, payload);
}

function readObjectPayload(payload: unknown, wrapperKey: string, label: string): Record<string, unknown> {
  const direct = optionalRecord(payload);
  if (!direct) {
    throw new ProviderRequestError(502, `${label} response must be an object`, payload);
  }
  const wrapped = optionalRecord(direct[wrapperKey]);
  return wrapped ?? direct;
}

function buildFreshteamPagination(
  headers: Headers,
  page: number,
): {
  page: number;
  hasMore: boolean;
  nextPage: number | null;
  totalPages: number | null;
  totalObjects: number | null;
  link: string | null;
} {
  const totalPages = readPositiveHeader(headers, "total-pages");
  const totalObjects = readNonNegativeHeader(headers, "total-objects");
  const link = headers.get("link");
  const hasMore = totalPages === null ? (link?.includes('rel="next"') ?? false) : page < totalPages;

  return {
    page,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    totalPages,
    totalObjects,
    link,
  };
}

function readPositiveHeader(headers: Headers, name: string): number | null {
  const parsed = readIntegerHeader(headers, name);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function readNonNegativeHeader(headers: Headers, name: string): number | null {
  const parsed = readIntegerHeader(headers, name);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function readIntegerHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function stringifyStringList(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value
    .map((item) => optionalString(item))
    .filter((item) => item !== undefined)
    .join(",");
}

function stringifyIntegerList(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value
    .map((item) => optionalInteger(item))
    .filter((item) => item !== undefined)
    .join(",");
}

function stringifyBoolean(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : String(parsed);
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function trimTrailingSlash(value: string): string {
  let normalized = value;
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
