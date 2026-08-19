import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { objectArray, optionalRawString, optionalRecord, positiveInteger, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const hrPartnerApiBaseUrl = "https://api.hrpartner.io";
export const hrPartnerValidationPath = "/company";

interface HrPartnerRequestOptions {
  readonly path: string;
  readonly apiKey: string;
  readonly fetcher: typeof fetch;
  readonly mode: "validate" | "execute";
  readonly query?: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

export const hrPartnerActionHandlers: ProviderActionHandlers<
  "hr_partner",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  get_company: getCompany,
  list_employees: listEmployees,
  get_employee: getEmployee,
  list_lookups: listLookups,
  list_job_listings: listJobListings,
  get_job_listing: getJobListing,
  list_applicants: listApplicants,
  get_applicant: getApplicant,
  list_applications: listApplications,
  get_application: getApplication,
};

export async function validateHrPartnerCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestHrPartnerJson({
    path: hrPartnerValidationPath,
    apiKey,
    fetcher,
    signal,
    mode: "validate",
  });
  const company = requireObjectPayload(payload, "company");
  const displayName = readString(company.name) ?? readString(company.subdomain) ?? "HR Partner API Key";

  return {
    profile: {
      displayName,
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: hrPartnerApiBaseUrl,
      companySlug: readString(company.slug),
      subdomain: readString(company.subdomain),
    },
  };
}

async function getCompany(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: "/company",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: pickQuery(input, ["custom_fields", "active_modules"]),
  });
  return {
    company: requireObjectPayload(payload, "company"),
  };
}

async function listEmployees(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: "/employees",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: input,
  });
  return {
    employees: requireArrayPayload(payload, "employees"),
  };
}

async function getEmployee(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: `/employee/${encodeURIComponent(requiredString(input.employee_code, "employee_code"))}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
  return {
    employee: requireObjectPayload(payload, "employee"),
  };
}

async function listLookups(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: `/lookups/${encodeURIComponent(requiredString(input.lookup_name, "lookup_name"))}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
  return {
    lookups: requireArrayPayload(payload, "lookups"),
  };
}

async function listJobListings(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: "/jobs",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: input,
  });
  return {
    jobs: requireArrayPayload(payload, "jobs"),
  };
}

async function getJobListing(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: `/job/${encodeURIComponent(requiredString(input.job_id, "job_id"))}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
  return {
    job: requireObjectPayload(payload, "job"),
  };
}

async function listApplicants(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: "/applicants",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: input,
  });
  return {
    applicants: requireArrayPayload(payload, "applicants"),
  };
}

async function getApplicant(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: `/applicant/${encodeURIComponent(requiredString(input.applicant_id, "applicant_id"))}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
  return {
    applicant: requireObjectPayload(payload, "applicant"),
  };
}

async function listApplications(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: `/applications/${encodeURIComponent(requiredString(input.job_id, "job_id"))}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: pickQuery(input, [
      "source",
      "stage",
      "submitted_at_from",
      "submitted_at_to",
      "is_flagged",
      "is_archived",
      "is_hired",
      "is_read",
    ]),
  });
  return {
    applications: requireArrayPayload(payload, "applications"),
  };
}

async function getApplication(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestHrPartnerJson({
    path: `/application/${positiveInteger(input.application_id, "application_id")}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
  return {
    application: requireObjectPayload(payload, "application"),
  };
}

async function requestHrPartnerJson(options: HrPartnerRequestOptions): Promise<unknown> {
  const url = new URL(options.path, hrPartnerApiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null) {
      const queryValue = typeof value === "string" ? requireQueryString(value, key) : String(value);
      url.searchParams.set(key, queryValue);
    }
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": options.apiKey,
      },
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `HR Partner request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
      error,
    );
  }

  const payload = await readHrPartnerPayload(response);
  if (!response.ok) {
    throw mapHrPartnerError(response.status, payload, options.mode);
  }

  return payload;
}

async function readHrPartnerPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "HR Partner returned malformed JSON");
    }
    return { message: text };
  }
}

function mapHrPartnerError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `HR Partner API request failed with status ${status}`;
  if (status === 401) {
    if (mode === "validate") {
      return new ProviderRequestError(400, message, payload);
    } else {
      return new ProviderRequestError(401, message, payload);
    }
  } else if (status === 400 || status === 404 || status === 405 || status === 406) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  } else if (status === 403) {
    if (mode === "validate") {
      return new ProviderRequestError(400, message, payload);
    } else {
      return new ProviderRequestError(502, message, { providerStatus: 403, payload });
    }
  } else if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  } else {
    return new ProviderRequestError(502, message, payload);
  }
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const error = body.error;
  if (typeof error === "string" && error) {
    return error;
  } else {
    const errorObject = optionalRecord(error);
    const errorMessage = readString(errorObject?.message);
    if (errorMessage) {
      return errorMessage;
    } else {
      return readString(body.message);
    }
  }
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]) {
  const query: Record<string, unknown> = {};
  for (const key of keys) {
    query[key] = input[key];
  }
  return query;
}

function requireArrayPayload(value: unknown, payloadName: string): Array<Record<string, unknown>> {
  return objectArray(
    value,
    payloadName,
    () => new ProviderRequestError(502, `HR Partner returned invalid ${payloadName}`),
  );
}

function requireObjectPayload(value: unknown, payloadName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `HR Partner returned an invalid ${payloadName}`);
  }
  return object;
}

function readString(value: unknown): string | undefined {
  const text = optionalRawString(value);
  return text ? text : undefined;
}

function requireQueryString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return normalized;
}
