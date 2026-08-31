import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const jazzhrApiBaseUrl = "https://api.resumatorapi.com/v1";
const jazzhrDefaultRequestTimeoutMs = 30_000;

type JazzhrRequestPhase = "validate" | "execute";

interface JazzhrListConfig {
  path: string;
  outputKey: string;
  filters: readonly string[];
}

interface JazzhrGetConfig {
  pathPrefix: string;
  idField: string;
  outputKey: string;
}

const listActionConfigs = {
  list_jobs: {
    path: "/jobs",
    outputKey: "jobs",
    filters: [
      "title",
      "recruiter",
      "board_code",
      "department",
      "hiring_lead",
      "state",
      "city",
      "from_open_date",
      "to_open_date",
      "status",
      "confidential",
      "private",
    ],
  },
  list_applicants: {
    path: "/applicants",
    outputKey: "applicants",
    filters: [
      "name",
      "city",
      "job_id",
      "job_title",
      "recruiter_id",
      "apply_date",
      "from_apply_date",
      "to_apply_date",
      "status",
      "rating",
    ],
  },
  list_users: {
    path: "/users",
    outputKey: "users",
    filters: ["name", "email", "type"],
  },
} as const satisfies Record<string, JazzhrListConfig>;

const getActionConfigs = {
  get_job: {
    pathPrefix: "/jobs",
    idField: "job_id",
    outputKey: "job",
  },
  get_applicant: {
    pathPrefix: "/applicants",
    idField: "applicant_id",
    outputKey: "applicant",
  },
  get_user: {
    pathPrefix: "/users",
    idField: "user_id",
    outputKey: "user",
  },
} as const satisfies Record<string, JazzhrGetConfig>;

export const jazzhrActionHandlers: ProviderActionHandlers<"jazzhr", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_jobs(input, context) {
    return listJazzhrRecords(input, context, listActionConfigs.list_jobs);
  },
  get_job(input, context) {
    return getJazzhrRecord(input, context, getActionConfigs.get_job);
  },
  list_applicants(input, context) {
    return listJazzhrRecords(input, context, listActionConfigs.list_applicants);
  },
  get_applicant(input, context) {
    return getJazzhrRecord(input, context, getActionConfigs.get_applicant);
  },
  list_users(input, context) {
    return listJazzhrRecords(input, context, listActionConfigs.list_users);
  },
  get_user(input, context) {
    return getJazzhrRecord(input, context, getActionConfigs.get_user);
  },
};

export async function validateJazzhrCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestJazzhrJson({
    apiKey,
    path: "/users",
    query: {},
    fetcher,
    signal,
    phase: "validate",
  });
  const users = normalizeJazzhrListPayload(payload, "users");
  const firstUser = optionalRecord(users[0]);

  return {
    profile: {
      accountId: stringifyOptional(firstUser?.id) ?? "jazzhr_api_key",
      displayName: buildJazzhrAccountLabel(firstUser),
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: jazzhrApiBaseUrl,
      validationEndpoint: "/users",
      firstUserId: stringifyOptional(firstUser?.id),
      firstUserEmail: optionalString(firstUser?.email),
    }),
  };
}

async function listJazzhrRecords(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  config: JazzhrListConfig,
): Promise<Record<string, unknown>> {
  const payload = await requestJazzhrJson({
    apiKey: context.apiKey,
    path: buildJazzhrListPath(config.path, input, config.filters, optionalInteger(input.page)),
    query: {},
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    [config.outputKey]: normalizeJazzhrListPayload(payload, config.outputKey),
    raw: payload,
  };
}

async function getJazzhrRecord(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  config: JazzhrGetConfig,
): Promise<Record<string, unknown>> {
  const id = readRequiredString(input, config.idField);
  const payload = await requestJazzhrJson({
    apiKey: context.apiKey,
    path: `${config.pathPrefix}/${encodePathSegment(id)}`,
    query: {},
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    [config.outputKey]: normalizeJazzhrRecordPayload(payload, config.outputKey),
    raw: payload,
  };
}

function buildJazzhrListPath(
  path: string,
  input: Record<string, unknown>,
  fields: readonly string[],
  page: number | undefined,
): string {
  const segments = [path];
  for (const field of fields) {
    const value = input[field];
    if (value !== undefined) {
      segments.push(encodePathSegment(field), encodePathSegment(stringifyPathValue(value)));
    }
  }
  if (page !== undefined) {
    segments.push("page", String(page));
  }
  return segments.join("/");
}

async function requestJazzhrJson(input: {
  apiKey: string;
  path: string;
  query: Record<string, string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: JazzhrRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, jazzhrDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildJazzhrUrl(input.apiKey, input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readJazzhrPayload(response);
    if (!response.ok) {
      throw createJazzhrError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "JazzHR request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `JazzHR request failed: ${error.message}` : "JazzHR request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildJazzhrUrl(apiKey: string, path: string, query: Record<string, string>): URL {
  const url = new URL(`${jazzhrApiBaseUrl}${path}`);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function readJazzhrPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "JazzHR returned invalid JSON");
  }
}

function normalizeJazzhrListPayload(payload: unknown, outputKey: string): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeJazzhrRecordPayload(item, outputKey));
  }
  const record = optionalRecord(payload);
  const wrapped = record?.[outputKey];
  if (Array.isArray(wrapped)) {
    return wrapped.map((item) => normalizeJazzhrRecordPayload(item, outputKey));
  }
  throw new ProviderRequestError(502, `JazzHR ${outputKey} response was not a list`);
}

function normalizeJazzhrRecordPayload(payload: unknown, outputKey: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `JazzHR ${outputKey} response was not an object`);
  }
  return record;
}

function createJazzhrError(response: Response, payload: unknown, phase: JazzhrRequestPhase): ProviderRequestError {
  const message = extractJazzhrErrorMessage(payload) ?? `JazzHR request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractJazzhrErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message) ?? optionalString(record?.reason);
}

function buildJazzhrAccountLabel(user: Record<string, unknown> | undefined): string {
  const firstName = optionalString(user?.first_name);
  const lastName = optionalString(user?.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || optionalString(user?.email) || "JazzHR API Key";
}

function readRequiredString(input: Record<string, unknown>, fieldName: string): string {
  const value = optionalString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function stringifyOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function stringifyPathValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
