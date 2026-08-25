import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  pickOptionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "jobnimbus";
const jobnimbusApiBaseUrl = "https://app.jobnimbus.com/api1";
const jobnimbusValidationPath = "/account/settings";

type JobnimbusRequestPhase = "validate" | "execute";
type JobnimbusActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type JobnimbusActionHandler = (input: Record<string, unknown>, context: JobnimbusActionContext) => Promise<unknown>;
type JobnimbusRequestMethod = "GET" | "POST" | "PUT";

interface JobnimbusResponsePayload {
  body: unknown;
  count: number;
  results: Array<Record<string, unknown>>;
}

interface JobnimbusRequestInput {
  path: string;
  method: JobnimbusRequestMethod;
  apiKey: string;
  fetcher: typeof fetch;
  phase: JobnimbusRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

export const jobnimbusActionHandlers: ProviderActionHandlers<"jobnimbus", JobnimbusActionHandler> = {
  async list_contacts(input, context) {
    const payload = await requestJobnimbus({
      path: "/contacts",
      method: "GET",
      ...context,
      phase: "execute",
      query: buildListQuery(input),
    });

    return {
      count: payload.count,
      contacts: payload.results,
    };
  },
  async get_contact(input, context) {
    const contactId = readRequiredId(input.contactId, "contactId");
    const payload = await requestJobnimbus({
      path: `/contacts/${encodeURIComponent(contactId)}`,
      method: "GET",
      ...context,
      phase: "execute",
      query: buildDetailQuery(input),
    });

    return {
      contact: requireObjectPayload(payload.body, "JobNimbus contact response"),
    };
  },
  async create_contact(input, context) {
    const payload = await requestJobnimbus({
      path: "/contacts",
      method: "POST",
      ...context,
      phase: "execute",
      query: buildWriteQuery(input),
      body: requiredRecord(input.data, "data"),
    });

    return {
      contact: requireObjectPayload(payload.body, "JobNimbus create contact response"),
    };
  },
  async update_contact(input, context) {
    const contactId = readRequiredId(input.contactId, "contactId");
    const payload = await requestJobnimbus({
      path: `/contacts/${encodeURIComponent(contactId)}`,
      method: "PUT",
      ...context,
      phase: "execute",
      query: buildWriteQuery(input),
      body: requiredRecord(input.data, "data"),
    });

    return {
      contact: requireObjectPayload(payload.body, "JobNimbus update contact response"),
    };
  },
  async list_jobs(input, context) {
    const payload = await requestJobnimbus({
      path: "/jobs",
      method: "GET",
      ...context,
      phase: "execute",
      query: buildListQuery(input),
    });

    return {
      count: payload.count,
      jobs: payload.results,
    };
  },
  async get_job(input, context) {
    const jobId = readRequiredId(input.jobId, "jobId");
    const payload = await requestJobnimbus({
      path: `/jobs/${encodeURIComponent(jobId)}`,
      method: "GET",
      ...context,
      phase: "execute",
      query: buildDetailQuery(input),
    });

    return {
      job: requireObjectPayload(payload.body, "JobNimbus job response"),
    };
  },
  async create_job(input, context) {
    const payload = await requestJobnimbus({
      path: "/jobs",
      method: "POST",
      ...context,
      phase: "execute",
      query: buildWriteQuery(input),
      body: requiredRecord(input.data, "data"),
    });

    return {
      job: requireObjectPayload(payload.body, "JobNimbus create job response"),
    };
  },
  async update_job(input, context) {
    const jobId = readRequiredId(input.jobId, "jobId");
    const payload = await requestJobnimbus({
      path: `/jobs/${encodeURIComponent(jobId)}`,
      method: "PUT",
      ...context,
      phase: "execute",
      query: buildWriteQuery(input),
      body: requiredRecord(input.data, "data"),
    });

    return {
      job: requireObjectPayload(payload.body, "JobNimbus update job response"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, jobnimbusActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJobnimbus({
      path: jobnimbusValidationPath,
      method: "GET",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const account = requireObjectPayload(payload.body, "JobNimbus account settings response");
    const accountId = readOptionalId(account);
    const accountName = pickOptionalString(
      account,
      "company_name",
      "companyName",
      "account_name",
      "accountName",
      "name",
    );

    return {
      profile: {
        accountId: accountId ?? buildTokenFingerprint(input.apiKey),
        displayName: accountName ?? "JobNimbus API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: jobnimbusApiBaseUrl,
        validationEndpoint: jobnimbusValidationPath,
        accountId,
        accountName,
      }),
    };
  },
};

function buildListQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    actor: optionalString(input.actor),
    size: readOptionalPositiveInteger(input.size, "size", 1000),
    from: readOptionalNonNegativeInteger(input.from, "from"),
    sort_field: optionalString(input.sortField),
    sort_direction: readOptionalSortDirection(input.sortDirection),
    fields: joinStringList(input.fields, "fields"),
    filter: encodeFilter(input.filter),
  });
}

function buildDetailQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    actor: optionalString(input.actor),
    fields: joinStringList(input.fields, "fields"),
  });
}

function buildWriteQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    actor: optionalString(input.actor),
    bulk: readOptionalBoolean(input.bulk, "bulk"),
    skip: joinStringList(input.skip, "skip"),
  });
}

function encodeFilter(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.stringify(requiredRecord(value, "filter"));
}

function joinStringList(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  const parts = value
    .map((item) => {
      if (typeof item !== "string") {
        throw new ProviderRequestError(400, `${fieldName} items must be strings`);
      }
      return item.trim();
    })
    .filter((item) => item !== "");

  return parts.length > 0 ? parts.join(",") : undefined;
}

function readRequiredId(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalId(payload: Record<string, unknown>): string | undefined {
  const stringId = pickOptionalString(payload, "jnid", "id", "_id");
  if (stringId) {
    return stringId;
  }

  const numericId = optionalInteger(payload.id);
  return numericId === undefined ? undefined : String(numericId);
}

function readOptionalPositiveInteger(value: unknown, fieldName: string, maximum?: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  if (maximum !== undefined && parsed > maximum) {
    throw new ProviderRequestError(400, `${fieldName} must be at most ${maximum}`);
  }
  return String(parsed);
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return String(parsed);
}

function readOptionalSortDirection(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = optionalString(value);
  if (!parsed) {
    return undefined;
  }
  if (parsed !== "asc" && parsed !== "desc") {
    throw new ProviderRequestError(400, "sortDirection must be asc or desc");
  }
  return parsed;
}

function readOptionalBoolean(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be a boolean`);
  }
  return String(parsed);
}

async function requestJobnimbus(input: JobnimbusRequestInput): Promise<JobnimbusResponsePayload> {
  const url = new URL(input.path.replace(/^\//, ""), `${jobnimbusApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: jobnimbusHeaders(input.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    payload = await readJobnimbusPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `JobNimbus request failed: ${error.message}` : "JobNimbus request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createJobnimbusError(response, payload, input.phase);
  }

  if (response.status === 204 || payload === null) {
    return { body: {}, count: 0, results: [] };
  }
  if (Array.isArray(payload)) {
    return {
      body: payload,
      count: payload.length,
      results: payload.map((item, index) => requireObjectPayload(item, `JobNimbus array response item ${index}`)),
    };
  }

  const record = requireObjectPayload(payload, "JobNimbus response");
  const results = Array.isArray(record.results)
    ? record.results.map((item, index) => requireObjectPayload(item, `JobNimbus results[${index}] response item`))
    : [];

  return {
    body: record,
    count: optionalInteger(record.count) ?? results.length,
    results,
  };
}

function jobnimbusHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readJobnimbusPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createJobnimbusError(
  response: Response,
  payload: unknown,
  phase: JobnimbusRequestPhase,
): ProviderRequestError {
  const message = readJobnimbusErrorMessage(payload) ?? response.statusText ?? "JobNimbus request failed";

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 415 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readJobnimbusErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return pickOptionalString(record, "message", "error", "errorMessage", "detail");
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} returned invalid object`, value);
  }

  return value as Record<string, unknown>;
}

function buildTokenFingerprint(apiKey: string): string {
  return `jobnimbus:token:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}
