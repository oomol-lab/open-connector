import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { WorkableActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const workableDefaultRequestTimeoutMs = 30_000;

interface WorkableContext {
  apiKey: string;
  subdomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface WorkableRequestInput {
  apiKey: string;
  subdomain: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  phase: "validate" | "execute";
  fetcher: typeof fetch;
  signal?: AbortSignal;
  notFoundAsInvalidInput?: boolean;
}

export const workableActionHandlers: Record<WorkableActionName, ProviderRuntimeHandler<WorkableContext>> = {
  async list_jobs(input, context): Promise<unknown> {
    const payload = await requestWorkableJson({
      ...context,
      path: "/jobs",
      query: compactObject({
        state: optionalString(input.state),
        limit: optionalInteger(input.limit),
        since_id: optionalString(input.since_id),
        max_id: optionalString(input.max_id),
        created_after: optionalString(input.created_after),
        updated_after: optionalString(input.updated_after),
        include_fields: readIncludeFields(input.include_fields),
      }),
      phase: "execute",
    });
    return {
      jobs: readArrayField(payload, "jobs").map(mapJob),
      paging: mapPaging(optionalRecord(payload.paging)),
    };
  },
  async get_job(input, context): Promise<unknown> {
    const job = await requestWorkableJson({
      ...context,
      path: `/jobs/${encodeURIComponent(requiredProviderString(input.shortcode, "shortcode"))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { job: mapJob(job) };
  },
  async list_candidates(input, context): Promise<unknown> {
    const payload = await requestWorkableJson({
      ...context,
      path: "/candidates",
      query: compactObject({
        email: optionalString(input.email),
        shortcode: optionalString(input.shortcode),
        stage: optionalString(input.stage),
        limit: optionalInteger(input.limit),
        since_id: optionalString(input.since_id),
        max_id: optionalString(input.max_id),
        created_after: optionalString(input.created_after),
        updated_after: optionalString(input.updated_after),
      }),
      phase: "execute",
    });
    return {
      candidates: readArrayField(payload, "candidates").map(mapCandidate),
      paging: mapPaging(optionalRecord(payload.paging)),
    };
  },
  async get_candidate(input, context): Promise<unknown> {
    const payload = await requestWorkableJson({
      ...context,
      path: `/candidates/${encodeURIComponent(requiredProviderString(input.id, "id"))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      candidate: mapCandidate(optionalRecord(payload.candidate) ?? payload),
    };
  },
};

export async function validateWorkableCredential(
  apiKey: string,
  subdomainInput: string | undefined,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const subdomain = normalizeWorkableSubdomain(subdomainInput);
  const payload = await requestWorkableJson({
    apiKey,
    subdomain,
    path: "/jobs",
    query: { limit: 1 },
    phase: "validate",
    fetcher,
    signal,
  });
  return {
    profile: {
      accountId: `${subdomain}.workable.com`,
      displayName: `${subdomain}.workable.com`,
    },
    grantedScopes: [],
    metadata: {
      subdomain,
      apiBaseUrl: buildWorkableApiBaseUrl(subdomain),
      validationEndpoint: "/jobs",
      visibleJobCountInValidationPage: readArrayField(payload, "jobs").length,
    },
  };
}

export function normalizeWorkableSubdomain(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, "Workable subdomain is required");
  }
  const host = value
    .trim()
    .replace("https://", "")
    .replace("http://", "")
    .replace(".workable.com", "")
    .split("/")[0]
    ?.trim();
  if (!host || host.includes(".") || host.includes(" ") || host.length > 63) {
    throw new ProviderRequestError(400, "Workable subdomain must be a single account subdomain");
  }
  return host.toLowerCase();
}

export function buildWorkableApiBaseUrl(subdomain: string): string {
  return `https://${subdomain}.workable.com/spi/v3`;
}

async function requestWorkableJson(input: WorkableRequestInput): Promise<Record<string, unknown>> {
  const response = await rawWorkableRequest(input);
  if (!response.ok) {
    throw await buildWorkableError(response, input);
  }
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderRequestError(502, "Workable returned invalid JSON");
  }
}

async function rawWorkableRequest(input: WorkableRequestInput): Promise<Response> {
  const timeout = createProviderTimeout(input.signal, workableDefaultRequestTimeoutMs);
  const url = new URL(`${buildWorkableApiBaseUrl(input.subdomain)}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  try {
    return await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Workable request timed out after 30 seconds");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Workable request failed: ${error.message}` : "Workable request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function buildWorkableError(response: Response, input: WorkableRequestInput): Promise<ProviderRequestError> {
  const payload = await readWorkablePayload(response);
  const message = extractWorkableErrorMessage(payload) ?? `Workable request failed with ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (input.phase === "validate" && [400, 401, 403, 404].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  if (input.phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 400 || response.status === 422 || (response.status === 404 && input.notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

async function readWorkablePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractWorkableErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function mapJob(value: unknown): Record<string, unknown> {
  const job = optionalRecord(value);
  if (!job) throw new ProviderRequestError(502, "Workable job payload is missing");
  return compactObject({
    ...job,
    id: optionalString(job.id),
    title: optionalString(job.title),
    shortcode: optionalString(job.shortcode),
    state: optionalString(job.state),
    raw: job,
  });
}

function mapCandidate(value: unknown): Record<string, unknown> {
  const candidate = optionalRecord(value);
  if (!candidate) throw new ProviderRequestError(502, "Workable candidate payload is missing");
  return compactObject({
    ...candidate,
    id: optionalString(candidate.id),
    name: optionalString(candidate.name),
    firstname: optionalString(candidate.firstname),
    lastname: optionalString(candidate.lastname),
    headline: optionalString(candidate.headline),
    email: optionalString(candidate.email),
    stage: optionalString(candidate.stage),
    profile_url: optionalString(candidate.profile_url),
    raw: candidate,
  });
}

function mapPaging(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  return compactObject({
    next: value.next === null ? null : optionalString(value.next),
  });
}

function readArrayField(payload: Record<string, unknown>, fieldName: string): unknown[] {
  const value = payload[fieldName];
  if (Array.isArray(value)) return value;
  throw new ProviderRequestError(502, `Workable response is missing ${fieldName}`);
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readIncludeFields(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new ProviderRequestError(400, "include_fields must be an array of strings");
  }
  return value.join(",");
}
