import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

export const smartrecruitersApiBaseUrl = "https://api.smartrecruiters.com";

type SmartRecruitersPhase = "validate" | "execute";
type SmartRecruitersActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type SmartRecruitersQuery = Record<string, string | readonly string[] | undefined>;

interface SmartRecruitersRequestInput {
  method: string;
  path: string;
  phase: SmartRecruitersPhase;
  query?: Partial<SmartRecruitersQuery>;
}

export const smartrecruitersActionHandlers: ProviderActionHandlers<"smartrecruiters", SmartRecruitersActionHandler> = {
  async list_jobs(input, context) {
    const raw = await requestSmartRecruitersJson(
      {
        method: "GET",
        path: "/jobs",
        query: buildJobsQuery(input),
        phase: "execute",
      },
      context,
    );
    return normalizeListResponse(raw, "jobs");
  },

  async get_job(input, context) {
    return {
      job: await requestSmartRecruitersJson(
        {
          method: "GET",
          path: `/jobs/${encodeURIComponent(requiredInputString(input.jobId, "jobId"))}`,
          query: compactObject({
            language: optionalString(input.language),
          }),
          phase: "execute",
        },
        context,
      ),
    };
  },

  async search_candidates(input, context) {
    const raw = await requestSmartRecruitersJson(
      {
        method: "GET",
        path: "/candidates",
        query: buildCandidatesQuery(input),
        phase: "execute",
      },
      context,
    );
    return normalizeListResponse(raw, "candidates");
  },

  async get_candidate(input, context) {
    return {
      candidate: await requestSmartRecruitersJson(
        {
          method: "GET",
          path: `/candidates/${encodeURIComponent(requiredInputString(input.candidateId, "candidateId"))}`,
          phase: "execute",
        },
        context,
      ),
    };
  },
};

export async function validateSmartRecruitersCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const raw = await requestSmartRecruitersJson(
    {
      method: "GET",
      path: "/jobs",
      query: { limit: "1", sort: "job_id" },
      phase: "validate",
    },
    { apiKey, fetcher, signal },
  );
  const list = optionalRecord(raw);

  return {
    profile: {
      accountId: "smartrecruiters-api-key",
      displayName: "SmartRecruiters API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/jobs",
      apiBaseUrl: smartrecruitersApiBaseUrl,
      limit: optionalNumber(list?.limit),
      nextPageId: optionalString(list?.nextPageId),
    }),
  };
}

async function requestSmartRecruitersJson(
  input: SmartRecruitersRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "SmartRecruiters" }, async (signal) => {
    const response = await context.fetcher(buildSmartRecruitersUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-SmartToken": context.apiKey,
      },
      signal,
    });
    const payload = await readSmartRecruitersPayload(response);

    if (!response.ok) {
      throw createSmartRecruitersError(response.status, payload, input.phase);
    }
    if (payload == null) {
      throw new ProviderRequestError(502, "SmartRecruiters returned an empty payload");
    }

    return payload;
  });
}

function buildSmartRecruitersUrl(path: string, query: Partial<SmartRecruitersQuery> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${smartrecruitersApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildJobsQuery(input: Record<string, unknown>): Partial<SmartRecruitersQuery> {
  return compactObject({
    q: optionalString(input.q),
    limit: optionalNumberString(input.limit),
    pageId: optionalString(input.pageId),
    language: optionalString(input.language),
    city: optionalStringArray(input.city),
    department: optionalStringArray(input.department),
    updatedAfter: optionalString(input.updatedAfter),
    lastActivityAfter: optionalString(input.lastActivityAfter),
    sort: input.pageId ? "job_id" : undefined,
  });
}

function buildCandidatesQuery(input: Record<string, unknown>): Partial<SmartRecruitersQuery> {
  return compactObject({
    q: optionalString(input.q),
    limit: optionalNumberString(input.limit),
    pageId: optionalString(input.pageId),
    jobId: optionalStringArray(input.jobId),
    location: optionalStringArray(input.location),
    status: optionalStringArray(input.status),
    tag: optionalStringArray(input.tag),
    updatedAfter: optionalString(input.updatedAfter),
    subStatus: optionalString(input.subStatus),
  });
}

function normalizeListResponse(raw: unknown, outputKey: "jobs" | "candidates"): Record<string, unknown> {
  const object = optionalRecord(raw);
  if (!object) {
    throw new ProviderRequestError(502, "SmartRecruiters returned a non-object list payload");
  }

  const content = object.content;
  if (!Array.isArray(content)) {
    throw new ProviderRequestError(502, "SmartRecruiters returned a list payload without content");
  }

  return {
    [outputKey]: content,
    limit: optionalNumber(object.limit) ?? null,
    nextPageId: optionalString(object.nextPageId) ?? null,
    raw: object,
  };
}

async function readSmartRecruitersPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SmartRecruiters returned invalid JSON");
  }
}

function createSmartRecruitersError(
  status: number,
  payload: unknown,
  phase: SmartRecruitersPhase,
): ProviderRequestError {
  const message = extractSmartRecruitersMessage(payload) ?? `SmartRecruiters request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractSmartRecruitersMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  const message = optionalString(object?.message);
  if (message) {
    return message;
  }

  const errors = object?.errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }
  for (const error of errors) {
    const errorObject = optionalRecord(error);
    const errorMessage = optionalString(errorObject?.message);
    const errorCode = optionalString(errorObject?.code);
    if (errorMessage) {
      return errorMessage;
    }
    if (errorCode) {
      return errorCode;
    }
  }

  return undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function optionalNumberString(value: unknown): string | undefined {
  const numberValue = optionalNumber(value);
  return numberValue === undefined ? undefined : String(numberValue);
}
