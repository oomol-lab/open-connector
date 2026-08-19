import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type ManatalActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ManatalActionHandler = (input: Record<string, unknown>, context: ManatalActionContext) => Promise<unknown>;

interface ManatalRequestOptions {
  path: string;
  context: ManatalActionContext;
  phase: "validate" | "execute";
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export const manatalApiBaseUrl = "https://api.manatal.com/open/v3";
export const manatalValidationPath = "/users/";

export const manatalActionHandlers: ProviderActionHandlers<"manatal", ManatalActionHandler> = {
  list_candidates(input, context) {
    return listRecords({
      context,
      path: "/candidates/",
      collectionKey: "candidates",
      query: buildCandidatesQuery(input),
    });
  },
  get_candidate(input, context) {
    return readRecord({
      context,
      path: `/candidates/${readRequiredId(input.candidateId, "candidateId")}/`,
      outputKey: "candidate",
    });
  },
  create_candidate(input, context) {
    return writeRecord({
      context,
      path: "/candidates/",
      outputKey: "candidate",
      method: "POST",
      body: buildCandidateBody(input),
    });
  },
  update_candidate(input, context) {
    return writeRecord({
      context,
      path: `/candidates/${readRequiredId(input.candidateId, "candidateId")}/`,
      outputKey: "candidate",
      method: "PATCH",
      body: buildCandidateBody(input),
    });
  },
  list_jobs(input, context) {
    return listRecords({
      context,
      path: "/jobs/",
      collectionKey: "jobs",
      query: buildJobsQuery(input),
    });
  },
  get_job(input, context) {
    return readRecord({
      context,
      path: `/jobs/${readRequiredId(input.jobId, "jobId")}/`,
      outputKey: "job",
    });
  },
  create_job(input, context) {
    return writeRecord({
      context,
      path: "/jobs/",
      outputKey: "job",
      method: "POST",
      body: buildJobBody(input),
    });
  },
  update_job(input, context) {
    return writeRecord({
      context,
      path: `/jobs/${readRequiredId(input.jobId, "jobId")}/`,
      outputKey: "job",
      method: "PATCH",
      body: buildJobBody(input),
    });
  },
  list_organizations(input, context) {
    return listRecords({
      context,
      path: "/organizations/",
      collectionKey: "organizations",
      query: buildOrganizationsQuery(input),
    });
  },
  get_organization(input, context) {
    return readRecord({
      context,
      path: `/organizations/${readRequiredId(input.organizationId, "organizationId")}/`,
      outputKey: "organization",
    });
  },
  create_organization(input, context) {
    return writeRecord({
      context,
      path: "/organizations/",
      outputKey: "organization",
      method: "POST",
      body: buildOrganizationBody(input),
    });
  },
  update_organization(input, context) {
    return writeRecord({
      context,
      path: `/organizations/${readRequiredId(input.organizationId, "organizationId")}/`,
      outputKey: "organization",
      method: "PATCH",
      body: buildOrganizationBody(input),
    });
  },
  list_matches(input, context) {
    return listRecords({
      context,
      path: "/matches/",
      collectionKey: "matches",
      query: buildMatchesQuery(input),
    });
  },
  get_match(input, context) {
    return readRecord({
      context,
      path: `/matches/${readRequiredId(input.matchId, "matchId")}/`,
      outputKey: "match",
    });
  },
  create_match(input, context) {
    return writeRecord({
      context,
      path: "/matches/",
      outputKey: "match",
      method: "POST",
      body: buildMatchBody(input),
    });
  },
  update_match(input, context) {
    return writeRecord({
      context,
      path: `/matches/${readRequiredId(input.matchId, "matchId")}/`,
      outputKey: "match",
      method: "PATCH",
      body: buildMatchBody(input),
    });
  },
};

export async function validateManatalCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ManatalActionContext = {
    apiKey: readRequiredString(apiKey, "apiKey"),
    fetcher,
    signal,
  };
  const payload = await requestManatalJson({
    path: manatalValidationPath,
    context,
    phase: "validate",
    query: {
      page_size: 1,
    },
  });

  const body = asObject(payload, "Manatal returned an invalid validation payload");
  const firstUser = Array.isArray(body.results) ? body.results.find((item) => optionalRecord(item)) : undefined;
  const user = optionalRecord(firstUser);
  const accountId = readOptionalString(user?.email) ?? "manatal";

  return {
    profile: {
      accountId,
      displayName: readAccountLabel(user),
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: manatalApiBaseUrl,
      validationEndpoint: manatalValidationPath,
    },
  };
}

async function listRecords(input: {
  context: ManatalActionContext;
  path: string;
  collectionKey: string;
  query: Record<string, string | number | boolean | undefined>;
}): Promise<Record<string, unknown>> {
  const payload = await requestManatalJson({
    path: input.path,
    context: input.context,
    phase: "execute",
    query: input.query,
  });
  const body = asObject(payload, "Manatal returned an invalid list response payload");
  const results = body.results;
  if (!Array.isArray(results)) {
    throw new ProviderRequestError(502, "Manatal returned an invalid result list");
  }

  return {
    [input.collectionKey]: results.map((item) => asObject(item, "Manatal returned an invalid result item")),
    count: readOptionalInteger(body.count, "count"),
    next: readOptionalNullableString(body.next, "next"),
    previous: readOptionalNullableString(body.previous, "previous"),
    raw: body,
  };
}

async function readRecord(input: {
  context: ManatalActionContext;
  path: string;
  outputKey: string;
}): Promise<Record<string, unknown>> {
  const payload = await requestManatalJson({
    path: input.path,
    context: input.context,
    phase: "execute",
  });
  const body = asObject(payload, `Manatal returned an invalid ${input.outputKey} payload`);
  return {
    [input.outputKey]: body,
    raw: body,
  };
}

async function writeRecord(input: {
  context: ManatalActionContext;
  path: string;
  outputKey: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const payload = await requestManatalJson({
    path: input.path,
    context: input.context,
    phase: "execute",
    method: input.method,
    body: input.body,
  });
  const body = asObject(payload, `Manatal returned an invalid ${input.outputKey} payload`);
  return {
    [input.outputKey]: body,
    raw: body,
  };
}

async function requestManatalJson(options: ManatalRequestOptions): Promise<unknown> {
  const url = new URL(`${manatalApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildManatalAuthorizationHeader(options.context.apiKey),
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await options.context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(502, "Manatal request failed before receiving a response", {
      cause: readThrownMessage(error),
    });
  }

  let payload: unknown;
  try {
    payload = await readResponsePayload(response);
  } catch (error) {
    throw new ProviderRequestError(502, "Manatal response body could not be read", {
      cause: readThrownMessage(error),
    });
  }

  if (!response.ok) {
    throw mapManatalError(response.status, payload, options.phase);
  }

  return payload;
}

function buildCandidatesQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    ...buildPaginationQuery(input),
    id: readOptionalIntegerInput(input.id, "id"),
    full_name: readOptionalString(input.fullName),
    creator_id: readOptionalIntegerInput(input.creatorId, "creatorId"),
    owner_id: readOptionalIntegerInput(input.ownerId, "ownerId"),
    source_type: readOptionalString(input.sourceType),
    email: readOptionalString(input.email),
    phone_number: readOptionalString(input.phoneNumber),
    gender: readOptionalString(input.gender),
    birth_date__gte: readOptionalString(input.birthDateGte),
    birth_date__lte: readOptionalString(input.birthDateLte),
    address: readOptionalString(input.address),
    latest_degree: readOptionalString(input.latestDegree),
    latest_university: readOptionalString(input.latestUniversity),
    current_company: readOptionalString(input.currentCompany),
    current_position: readOptionalString(input.currentPosition),
    description: readOptionalString(input.description),
    external_id: readOptionalString(input.externalId),
    candidate_tags: readOptionalString(input.candidateTags),
    candidate_industries: readOptionalString(input.candidateIndustries),
    candidate_location: readOptionalString(input.candidateLocation),
    ...buildTimestampQuery(input),
  });
}

function buildJobsQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    ...buildPaginationQuery(input),
    id: readOptionalIntegerInput(input.id, "id"),
    organization_id: readOptionalIntegerInput(input.organizationId, "organizationId"),
    position_name: readOptionalString(input.positionName),
    headcount: readOptionalIntegerInput(input.headcount, "headcount"),
    creator_id: readOptionalIntegerInput(input.creatorId, "creatorId"),
    owner_id: readOptionalIntegerInput(input.ownerId, "ownerId"),
    address: readOptionalString(input.address),
    status: readOptionalString(input.status),
    frequency: readOptionalString(input.frequency),
    city: readOptionalString(input.city),
    state: readOptionalString(input.state),
    contract_details: readOptionalString(input.contractDetails),
    is_published: readOptionalBoolean(input.isPublished, "isPublished"),
    is_remote: readOptionalBoolean(input.isRemote, "isRemote"),
    external_id: readOptionalString(input.externalId),
    open_at__gte: readOptionalString(input.openAtGte),
    open_at__lte: readOptionalString(input.openAtLte),
    close_at__gte: readOptionalString(input.closeAtGte),
    close_at__lte: readOptionalString(input.closeAtLte),
    ...buildTimestampQuery(input),
  });
}

function buildOrganizationsQuery(
  input: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  return compactObject({
    ...buildPaginationQuery(input),
    id: readOptionalIntegerInput(input.id, "id"),
    name: readOptionalString(input.name),
    creator_id: readOptionalIntegerInput(input.creatorId, "creatorId"),
    owner_id: readOptionalIntegerInput(input.ownerId, "ownerId"),
    address: readOptionalString(input.address),
    website: readOptionalString(input.website),
    is_public: readOptionalBoolean(input.isPublic, "isPublic"),
    is_visible: readOptionalBoolean(input.isVisible, "isVisible"),
    external_id: readOptionalString(input.externalId),
    ...buildTimestampQuery(input),
  });
}

function buildMatchesQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    ...buildPaginationQuery(input),
    ordering: readOptionalString(input.ordering),
    external_id: readOptionalString(input.externalId),
    stage__in: readOptionalString(input.stageIn),
    hired_at__gte: readOptionalString(input.hiredAtGte),
    hired_at__lte: readOptionalString(input.hiredAtLte),
    submitted_at__gte: readOptionalString(input.submittedAtGte),
    submitted_at__lte: readOptionalString(input.submittedAtLte),
    interview_at__gte: readOptionalString(input.interviewAtGte),
    interview_at__lte: readOptionalString(input.interviewAtLte),
    offer_at__gte: readOptionalString(input.offerAtGte),
    offer_at__lte: readOptionalString(input.offerAtLte),
    dropped_at__gte: readOptionalString(input.droppedAtGte),
    dropped_at__lte: readOptionalString(input.droppedAtLte),
    ...buildTimestampQuery(input),
  });
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return {
    page: readOptionalIntegerInput(input.page, "page"),
    page_size: readOptionalIntegerInput(input.pageSize, "pageSize"),
  };
}

function buildTimestampQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    created_at__gte: readOptionalString(input.createdAtGte),
    created_at__lte: readOptionalString(input.createdAtLte),
    updated_at__gte: readOptionalString(input.updatedAtGte),
    updated_at__lte: readOptionalString(input.updatedAtLte),
  };
}

function buildCandidateBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    external_id: input.externalId,
    full_name: input.fullName,
    owner: input.owner,
    source_type: input.sourceType,
    source_other: input.sourceOther,
    consent: input.consent,
    email: input.email,
    phone_number: input.phoneNumber,
    gender: input.gender,
    birth_date: input.birthDate,
    address: input.address,
    zipcode: input.zipcode,
    latest_degree: input.latestDegree,
    latest_university: input.latestUniversity,
    current_company: input.currentCompany,
    current_department: input.currentDepartment,
    current_position: input.currentPosition,
    description: input.description,
    custom_fields: input.customFields,
  });
}

function buildJobBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    external_id: input.externalId,
    organization: input.organization,
    position_name: input.positionName,
    description: input.description,
    expected_close_at: input.expectedCloseAt,
    headcount: input.headcount,
    salary_min: input.salaryMin,
    is_salary_visible: input.isSalaryVisible,
    salary_max: input.salaryMax,
    frequency: input.frequency,
    currency: input.currency,
    industry: input.industry,
    owner: input.owner,
    address: input.address,
    city: input.city,
    state: input.state,
    country: input.country,
    zipcode: input.zipcode,
    contract_details: input.contractDetails,
    is_published: input.isPublished,
    is_remote: input.isRemote,
    status: input.status,
    custom_fields: input.customFields,
    is_pinned_in_career_page: input.isPinnedInCareerPage,
  });
}

function buildOrganizationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    external_id: input.externalId,
    name: input.name,
    owner: input.owner,
    address: input.address,
    website: input.website,
    description: input.description,
    is_public: input.isPublic,
    is_visible: input.isVisible,
    custom_fields: input.customFields,
  });
}

function buildMatchBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    external_id: input.externalId,
    owner: input.owner,
    job: input.job,
    candidate: input.candidate,
    custom_fields: input.customFields,
    is_active: input.isActive,
    hired_at: input.hiredAt,
    submitted_at: input.submittedAt,
    interview_at: input.interviewAt,
    offer_at: input.offerAt,
    dropped_at: input.droppedAt,
  });
}

function buildManatalAuthorizationHeader(apiKey: string): string {
  return `Token ${apiKey}`;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      detail: text,
    };
  }
}

function mapManatalError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Manatal API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return phase === "validate"
      ? new ProviderRequestError(400, message, payload)
      : new ProviderRequestError(status, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const detail = readOptionalString(body.detail);
  if (detail) {
    return detail;
  }
  const message = readOptionalString(body.message);
  if (message) {
    return message;
  }
  const error = readOptionalString(body.error);
  if (error) {
    return error;
  }

  for (const value of Object.values(body)) {
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string");
      if (typeof first === "string") {
        return first;
      }
    }
  }

  return undefined;
}

function readAccountLabel(user: Record<string, unknown> | undefined): string {
  const email = readOptionalString(user?.email);
  if (email) {
    return email;
  }
  const displayName = readOptionalString(user?.display_name);
  if (displayName) {
    return displayName;
  }
  const fullName = readOptionalString(user?.full_name);
  return fullName ?? "Manatal API Key";
}

function readThrownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readRequiredId(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readOptionalNullableString(value: unknown, fieldName: string): string | null | undefined {
  if (value === undefined || value === null) {
    return value === null ? null : undefined;
  }
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `Manatal returned an invalid ${fieldName} payload`);
  }
  return value;
}

function readOptionalIntegerInput(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value;
}

function readOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, `${fieldName} must be a boolean`);
  }
  return value;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `Manatal returned an invalid ${fieldName} payload`);
  }
  return value;
}
