import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";
import { workdayOAuthScopes } from "./scopes.ts";

interface WorkdayContext {
  accessToken: string;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface WorkdayRequestInput extends WorkdayContext {
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  notFoundAsInvalidInput?: boolean;
}

export const workdayActionHandlers: ProviderActionHandlers<"workday", ProviderRuntimeHandler<WorkdayContext>> = {
  async get_current_user(_input, context): Promise<unknown> {
    return { worker: normalizeWorker(await requestWorkdayJson({ ...context, path: "/workers/me", phase: "execute" })) };
  },
  async list_workers(input, context): Promise<unknown> {
    const payload = await requestWorkdayJson({
      ...context,
      path: "/workers",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        search: optionalString(input.search),
        includeTerminatedWorkers: optionalBoolean(input.includeTerminatedWorkers),
      },
    });
    return {
      workers: extractCollectionItems(payload, ["data", "workers"]).map(normalizeWorker),
      total: extractCollectionTotal(payload),
      raw: normalizeRawObject(payload),
    };
  },
  async get_worker(input, context): Promise<unknown> {
    const workerId = requiredInputString(input.workerId, "workerId");
    return {
      worker: normalizeWorker(
        await requestWorkdayJson({
          ...context,
          path: `/workers/${encodeURIComponent(workerId)}`,
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
      ),
    };
  },
  async list_jobs(input, context): Promise<unknown> {
    const payload = await requestWorkdayJson({
      ...context,
      path: "/jobs",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      },
    });
    return {
      jobs: extractCollectionItems(payload, ["data", "jobs"]).map(normalizeJob),
      total: extractCollectionTotal(payload),
      raw: normalizeRawObject(payload),
    };
  },
  async get_job(input, context): Promise<unknown> {
    const jobId = requiredInputString(input.jobId, "jobId");
    return {
      job: normalizeJob(
        await requestWorkdayJson({
          ...context,
          path: `/jobs/${encodeURIComponent(jobId)}`,
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
      ),
    };
  },
  async list_job_postings(input, context): Promise<unknown> {
    const payload = await requestWorkdayJson({
      ...context,
      path: "/jobPostings",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        jobSite: normalizeStringArray(input.jobSiteIds),
        category: normalizeStringArray(input.categoryIds),
        jobPosting: normalizeStringArray(input.jobPostingIds),
        jobRequisition: normalizeStringArray(input.jobRequisitionIds),
      },
    });
    return {
      jobPostings: extractCollectionItems(payload, ["data", "jobPostings"]).map(normalizeJobPosting),
      total: extractCollectionTotal(payload),
      raw: normalizeRawObject(payload),
    };
  },
  async get_job_posting(input, context): Promise<unknown> {
    const jobPostingId = requiredInputString(input.jobPostingId, "jobPostingId");
    return {
      jobPosting: normalizeJobPosting(
        await requestWorkdayJson({
          ...context,
          path: `/jobPostings/${encodeURIComponent(jobPostingId)}`,
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
      ),
    };
  },
};

export async function validateWorkdayCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: WorkdayContext = {
    accessToken: credential.accessToken,
    metadata: credential.metadata,
    fetcher,
    signal,
  };
  const worker = normalizeWorker(await requestWorkdayJson({ ...context, path: "/workers/me", phase: "validate" }));
  const person = optionalRecord(worker.person) ?? {};
  const accountId = nonEmptyString(worker.workerId) ?? nonEmptyString(worker.id);
  if (!accountId) {
    throw new ProviderRequestError(502, "workday current worker response is missing an identifier");
  }
  return {
    profile: {
      accountId,
      displayName:
        nonEmptyString(worker.primaryWorkEmail) ??
        nonEmptyString(worker.descriptor) ??
        nonEmptyString(person.descriptor) ??
        accountId,
    },
    grantedScopes: readGrantedScopes(credential.metadata),
    metadata: {
      baseUrl: resolveWorkdayBaseUrl(credential.metadata),
      tenant: resolveWorkdayTenant(credential.metadata),
      workerId: worker.workerId,
      descriptor: worker.descriptor,
      primaryWorkEmail: worker.primaryWorkEmail,
    },
  };
}

async function requestWorkdayJson(input: WorkdayRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  const url = buildWorkdayApiUrl(
    resolveWorkdayBaseUrl(input.metadata),
    resolveWorkdayTenant(input.metadata),
    input.path,
    input.query,
  );

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.accessToken}`,
        "user-agent": providerUserAgent,
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "workday request timed out after 30 seconds");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `workday request failed: ${error.message}` : "workday request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readWorkdayResponseBody(response);
  if (!response.ok) {
    throw createWorkdayError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
  }
  return payload;
}

function resolveWorkdayBaseUrl(metadata: Record<string, unknown>): string {
  const clientExtra = optionalRecord(metadata.oauthClientExtra);
  const rawBaseUrl = optionalString(metadata.baseUrl) ?? optionalString(clientExtra?.baseUrl);
  if (!rawBaseUrl) throw new ProviderRequestError(400, "workday oauth client config is missing baseUrl");
  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new ProviderRequestError(400, "workday baseUrl must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderRequestError(400, "workday baseUrl must use http or https");
  }
  if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new ProviderRequestError(400, "workday baseUrl must use https unless connecting to localhost");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function resolveWorkdayTenant(metadata: Record<string, unknown>): string {
  const clientExtra = optionalRecord(metadata.oauthClientExtra);
  const tenant = optionalString(metadata.tenant) ?? optionalString(clientExtra?.tenant);
  if (!tenant) throw new ProviderRequestError(400, "workday oauth client config is missing tenant");
  return tenant;
}

function buildWorkdayApiUrl(
  baseUrl: string,
  tenant: string,
  path: string,
  query?: Record<string, string | number | boolean | string[] | undefined>,
): string {
  const url = new URL(`${baseUrl}/ccx/api/v1/${encodeURIComponent(tenant)}${path}`);
  appendQueryParams(url, query);
  return url.toString();
}

async function readWorkdayResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createWorkdayError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractWorkdayErrorMessage(payload) ?? `workday request failed with ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && (status === 401 || status === 403)) return new ProviderRequestError(400, message);
  if (phase === "execute" && status === 401) return new ProviderRequestError(401, message);
  if (phase === "execute" && status === 403) return new ProviderRequestError(403, message);
  if (status === 404 && notFoundAsInvalidInput) return new ProviderRequestError(400, message);
  if (status === 400 || status === 404 || status === 422) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status >= 400 ? status : 502, message);
}

function extractWorkdayErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const direct =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_description) ??
    optionalString(record.detail) ??
    optionalString(record.title);
  if (direct) return direct;
  const errors = Array.isArray(record.errors) ? record.errors : [];
  for (const error of errors) {
    const item = optionalRecord(error);
    const candidate =
      optionalString(item?.message) ?? optionalString(item?.detail) ?? optionalString(item?.description);
    if (candidate) return candidate;
  }
  return undefined;
}

function normalizeWorker(value: unknown): Record<string, unknown> {
  const record = normalizeRawObject(value);
  return {
    id: optionalString(record.id) ?? null,
    workerId: optionalString(record.workerId) ?? optionalString(record.worker_id) ?? null,
    descriptor: optionalString(record.descriptor) ?? null,
    isManager: optionalBoolean(record.isManager) ?? optionalBoolean(record.is_manager) ?? null,
    businessTitle: optionalString(record.businessTitle) ?? optionalString(record.business_title) ?? null,
    primaryWorkEmail: optionalString(record.primaryWorkEmail) ?? optionalString(record.email) ?? null,
    primaryWorkPhone: optionalString(record.primaryWorkPhone) ?? optionalString(record.phone) ?? null,
    primaryWorkAddressText: optionalString(record.primaryWorkAddressText) ?? optionalString(record.address) ?? null,
    dateOfBirth: optionalString(record.dateOfBirth) ?? optionalString(record.date_of_birth) ?? null,
    yearsOfService: optionalString(record.yearsOfService) ?? optionalString(record.years_of_service) ?? null,
    person: normalizePerson(record.person),
    primaryJob: normalizeReference(record.primaryJob),
    workerType: normalizeWorkerType(record.workerType),
    location: normalizeReference(record.location),
    primarySupervisoryOrganization: normalizeReference(
      record.primarySupervisoryOrganization ?? record.supervisoryOrganization,
    ),
    additionalJobs: normalizeReferenceArray(record.additionalJobs),
    raw: record,
  };
}

function normalizeJob(value: unknown): Record<string, unknown> {
  const record = normalizeRawObject(value);
  return {
    id: optionalString(record.id) ?? null,
    descriptor: optionalString(record.descriptor) ?? null,
    businessTitle: optionalString(record.businessTitle) ?? optionalString(record.business_title) ?? null,
    nextPayPeriodStartDate:
      optionalString(record.nextPayPeriodStartDate) ?? optionalString(record.next_pay_period_start_date) ?? null,
    worker: normalizeReference(record.worker),
    jobType: normalizeReference(record.jobType),
    location: normalizeReference(record.location),
    jobProfile: normalizeReference(record.jobProfile),
    supervisoryOrganization: normalizeReference(record.supervisoryOrganization),
    raw: record,
  };
}

function normalizeJobPosting(value: unknown): Record<string, unknown> {
  const record = normalizeRawObject(value);
  return {
    id: optionalString(record.id) ?? null,
    descriptor: optionalString(record.descriptor) ?? null,
    jobTitle: optionalString(record.jobTitle) ?? null,
    postingTitle: optionalString(record.postingTitle) ?? null,
    jobDescription: optionalString(record.jobDescription) ?? null,
    postingStartDate: optionalString(record.postingStartDate) ?? null,
    postingEndDate: optionalString(record.postingEndDate) ?? null,
    location: normalizeReference(record.location),
    department: normalizeReference(record.department),
    position: normalizeReference(record.position),
    postingStatus: normalizeReference(record.postingStatus),
    jobRequisition: normalizeReference(record.jobRequisition),
    hiringManager: normalizeReference(record.hiringManager),
    employmentType: normalizeReference(record.employmentType),
    experienceLevel: normalizeReference(record.experienceLevel),
    recruiters: normalizeReferenceArray(record.recruiters),
    raw: record,
  };
}

function normalizePerson(value: unknown): Record<string, string | null> {
  const record = normalizeRawObject(value);
  return {
    id: optionalString(record.id) ?? null,
    descriptor: optionalString(record.descriptor) ?? null,
  };
}

function normalizeWorkerType(value: unknown): Record<string, string | null> {
  const record = normalizeRawObject(value);
  return {
    id: optionalString(record.id) ?? null,
    descriptor: optionalString(record.descriptor) ?? null,
  };
}

function normalizeReference(value: unknown): Record<string, string | null> {
  const record = normalizeRawObject(value);
  return {
    id: optionalString(record.id) ?? null,
    href: optionalString(record.href) ?? null,
    descriptor: optionalString(record.descriptor) ?? null,
  };
}

function normalizeReferenceArray(value: unknown): Array<Record<string, string | null>> {
  return Array.isArray(value) ? value.map(normalizeReference) : [];
}

function extractCollectionItems(payload: unknown, candidates: string[]): unknown[] {
  const record = normalizeRawObject(payload);
  for (const key of candidates) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function extractCollectionTotal(payload: unknown): number | null {
  const record = normalizeRawObject(payload);
  return optionalInteger(record.total) ?? optionalInteger(record.count) ?? optionalInteger(record.totalResults) ?? null;
}

function normalizeRawObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function appendQueryParams(
  url: URL,
  query: Record<string, string | number | boolean | string[] | undefined> | undefined,
): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(key, entry);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function readGrantedScopes(metadata: Record<string, unknown>): string[] {
  const rawScope = optionalString(metadata.scope);
  return rawScope ? rawScope.split(/\s+/).filter(Boolean) : [...workdayOAuthScopes];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
