import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { GreenhouseActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "greenhouse";
const greenhouseBaseUrl = "https://harvest.greenhouse.io/v1";
const validationPath = "/users";

type GreenhouseRequestPhase = "validate" | "execute";
type GreenhouseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const queryParamByInputKey: Record<string, string> = {
  perPage: "per_page",
  page: "page",
  skipCount: "skip_count",
  createdBefore: "created_before",
  createdAfter: "created_after",
  updatedBefore: "updated_before",
  updatedAfter: "updated_after",
  status: "status",
  requisitionId: "requisition_id",
  openingId: "opening_id",
  departmentId: "department_id",
  externalDepartmentId: "external_department_id",
  jobId: "job_id",
  email: "email",
  candidateId: "candidate_id",
};

export const greenhouseActionHandlers: Record<GreenhouseActionName, GreenhouseActionHandler> = {
  list_jobs(input, context) {
    return listCollection({ context, path: "/jobs", input, outputKey: "jobs" });
  },
  get_job(input, context) {
    return getSingle({ context, path: `/jobs/${encodePathId(input.id, "id")}`, outputKey: "job" });
  },
  list_candidates(input, context) {
    return listCollection({ context, path: "/candidates", input, outputKey: "candidates" });
  },
  get_candidate(input, context) {
    return getSingle({ context, path: `/candidates/${encodePathId(input.id, "id")}`, outputKey: "candidate" });
  },
  list_applications(input, context) {
    return listCollection({ context, path: "/applications", input, outputKey: "applications" });
  },
  get_application(input, context) {
    return getSingle({ context, path: `/applications/${encodePathId(input.id, "id")}`, outputKey: "application" });
  },
  add_candidate_note(input, context) {
    return addCandidateNote(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, greenhouseActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: greenhouseBaseUrl,
  auth: {
    type: "api_key_basic",
    suffix: ":",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestGreenhouseJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: validationPath,
      query: {
        per_page: 1,
        skip_count: true,
      },
      phase: "validate",
    });
    const users = Array.isArray(payload) ? payload : [];
    const firstUser = optionalRecord(users[0]);
    const userId = optionalInteger(firstUser?.id);
    return {
      profile: {
        accountId: userId !== undefined ? `greenhouse:user:${userId}` : "greenhouse-harvest-api-key",
        displayName: readFirstUserName(users) ?? "Greenhouse Harvest API",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: greenhouseBaseUrl,
        validationEndpoint: validationPath,
        firstUserId: userId,
        firstUserEmail: optionalString(firstUser?.primary_email_address),
      },
    };
  },
};

async function listCollection(input: {
  context: ApiKeyProviderContext;
  path: string;
  input: Record<string, unknown>;
  outputKey: string;
}): Promise<Record<string, unknown>> {
  const response = await requestGreenhouse({
    context: input.context,
    path: input.path,
    query: buildListQuery(input.input),
    phase: "execute",
  });
  const raw = await readJsonResponse(response);
  return {
    [input.outputKey]: Array.isArray(raw) ? raw : [],
    links: parseLinkHeader(response.headers.get("link")),
    raw,
  };
}

async function getSingle(input: {
  context: ApiKeyProviderContext;
  path: string;
  outputKey: string;
}): Promise<Record<string, unknown>> {
  const raw = await requestGreenhouseJson({
    context: input.context,
    path: input.path,
    phase: "execute",
  });
  return {
    [input.outputKey]: raw,
    raw,
  };
}

async function addCandidateNote(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const raw = await requestGreenhouseJson({
    context,
    path: `/candidates/${encodePathId(input.candidateId, "candidateId")}/activity_feed/notes`,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "on-behalf-of": stringifyPathValue(input.onBehalfOfUserId, "onBehalfOfUserId"),
    },
    body: JSON.stringify({
      body: input.body,
      visibility: input.visibility,
    }),
    phase: "execute",
  });
  return {
    note: raw,
    raw,
  };
}

function buildListQuery(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  for (const [inputKey, queryKey] of Object.entries(queryParamByInputKey)) {
    const value = input[inputKey];
    if (value !== undefined) {
      query[queryKey] = String(value);
    }
  }
  const candidateIds = input.candidateIds;
  if (Array.isArray(candidateIds)) {
    query.candidate_ids = candidateIds.map(String).join(",");
  }
  return query;
}

async function requestGreenhouseJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: GreenhouseRequestPhase;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: BodyInit;
}): Promise<unknown> {
  const response = await requestGreenhouse(input);
  return readJsonResponse(response);
}

async function requestGreenhouse(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: GreenhouseRequestPhase;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: BodyInit;
}): Promise<Response> {
  const url = new URL(`${greenhouseBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        authorization: buildAuthorizationHeader(input.context.apiKey),
        ...input.headers,
      },
      body: input.body,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Greenhouse API request failed: ${error.message}` : "Greenhouse API request failed",
    );
  }

  if (!response.ok) {
    throw await mapGreenhouseError(response, input.phase);
  }

  return response;
}

function buildAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Greenhouse API returned invalid JSON");
  }
}

async function mapGreenhouseError(response: Response, phase: GreenhouseRequestPhase): Promise<ProviderRequestError> {
  const text = await response.text().catch(() => "");
  const detail = readGreenhouseErrorMessage(text);
  const message = detail
    ? `Greenhouse API request failed: ${detail}`
    : `Greenhouse API request failed with HTTP ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message);
}

function readGreenhouseErrorMessage(text: string): string | null {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as {
      message?: unknown;
      errors?: Array<{ message?: unknown; field?: unknown }>;
    };
    if (typeof parsed.message === "string" && parsed.message) {
      const errors = Array.isArray(parsed.errors)
        ? parsed.errors
            .map((error) => {
              const message = typeof error.message === "string" ? error.message : null;
              const field = typeof error.field === "string" ? error.field : null;
              return field && message ? `${field}: ${message}` : message;
            })
            .filter(Boolean)
            .join("; ")
        : "";
      return errors ? `${parsed.message}: ${errors}` : parsed.message;
    }
  } catch {
    return text.slice(0, 300);
  }
  return text.slice(0, 300);
}

function parseLinkHeader(header: string | null): Record<"next" | "prev" | "last", string | null> {
  const links: Record<"next" | "prev" | "last", string | null> = {
    next: null,
    prev: null,
    last: null,
  };
  if (!header) {
    return links;
  }
  for (const part of header.split(",")) {
    const section = part.trim();
    const start = section.indexOf("<");
    const end = section.indexOf(">");
    const relationMarker = 'rel="';
    const relationStart = section.indexOf(relationMarker);
    if (start < 0 || end <= start || relationStart < 0) {
      continue;
    }
    const relationValueStart = relationStart + relationMarker.length;
    const relationEnd = section.indexOf('"', relationValueStart);
    const relation = section.slice(relationValueStart, relationEnd);
    if (relation === "next" || relation === "prev" || relation === "last") {
      links[relation] = section.slice(start + 1, end);
    }
  }
  return links;
}

function readFirstUserName(users: unknown): string | null {
  if (!Array.isArray(users)) {
    return null;
  }
  const user = optionalRecord(users[0]);
  if (!user) {
    return null;
  }
  const name = [user.first_name, user.last_name]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");
  return name || optionalString(user.name) || optionalString(user.primary_email_address) || null;
}

function encodePathId(value: unknown, fieldName: string): string {
  return encodeURIComponent(stringifyPathValue(value, fieldName));
}

function stringifyPathValue(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return requiredInputString(value, fieldName);
}

function requiredInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (text) {
    return text;
  }
  throw new ProviderRequestError(400, `${fieldName} is required.`);
}
