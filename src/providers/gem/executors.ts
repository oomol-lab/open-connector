import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { GemActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "gem";
const gemApiBaseUrl = "https://api.gem.com";
const gemValidationPath = "/v0/users?page_size=1";

type GemPhase = "validate" | "execute";
type GemActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GemResponse = {
  payload: unknown;
  pagination?: Record<string, unknown>;
};
type GemActionHandler = (input: Record<string, unknown>, context: GemActionContext) => Promise<unknown>;

export const gemActionHandlers: Record<GemActionName, GemActionHandler> = {
  list_users(input, context) {
    return gemList(buildListUsersPath(input), "users", context);
  },
  list_candidates(input, context) {
    return gemList(buildListCandidatesPath(input), "candidates", context);
  },
  get_candidate(input, context) {
    const candidateId = readRequiredString(input, "candidate_id", "candidate ID");
    return gemObject(`/v0/candidates/${encodeURIComponent(candidateId)}`, "candidate", context);
  },
  list_projects(input, context) {
    return gemList(buildListProjectsPath(input), "projects", context);
  },
  get_project(input, context) {
    const projectId = readRequiredString(input, "project_id", "project ID");
    return gemObject(`/v0/projects/${encodeURIComponent(projectId)}`, "project", context);
  },
  list_project_candidates(input, context) {
    const projectId = readRequiredString(input, "project_id", "project ID");
    return gemList(buildListProjectCandidatesPath(projectId, input), "project_candidates", context);
  },
  list_sequences(input, context) {
    return gemList(buildListSequencesPath(input), "sequences", context);
  },
  get_sequence(input, context) {
    const sequenceId = readRequiredString(input, "sequence_id", "sequence ID");
    return gemObject(`/v0/sequences/${encodeURIComponent(sequenceId)}`, "sequence", context);
  },
  list_custom_fields(input, context) {
    return gemList(buildListCustomFieldsPath(input), "custom_fields", context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, gemActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await gemGetJson(
      gemValidationPath,
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const userCount = readPaginationInteger(response.pagination, "total");

    return {
      profile: {
        accountId: "api_key",
        displayName: "Gem API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: gemApiBaseUrl,
        validationEndpoint: gemValidationPath,
        validationMode: "user_list_probe",
        userCount,
      }),
    };
  },
};

function buildListUsersPath(input: Record<string, unknown>): string {
  const url = gemUrl("/v0/users");
  setOptionalQuery(url, "email", optionalString(input.email));
  setPaginationQuery(url, input);
  return gemPath(url);
}

function buildListCandidatesPath(input: Record<string, unknown>): string {
  const url = gemUrl("/v0/candidates");
  setCreatedRangeQuery(url, input);
  setOptionalQuery(url, "created_by", optionalString(input.created_by));
  setOptionalQuery(url, "email", optionalString(input.email));
  setOptionalQuery(url, "linked_in_handle", optionalString(input.linked_in_handle));
  setOptionalQuery(url, "updated_after", optionalInteger(input.updated_after));
  setOptionalQuery(url, "updated_before", optionalInteger(input.updated_before));
  if (Array.isArray(input.candidate_ids)) {
    url.searchParams.set("candidate_ids", input.candidate_ids.map(String).join(","));
  }
  setPaginationQuery(url, input);
  return gemPath(url);
}

function buildListProjectsPath(input: Record<string, unknown>): string {
  const url = gemUrl("/v0/projects");
  setCreatedRangeQuery(url, input);
  setOptionalQuery(url, "user_id", optionalString(input.user_id));
  setOptionalQuery(url, "readable_by", optionalString(input.readable_by));
  setOptionalQuery(url, "writable_by", optionalString(input.writable_by));
  setOptionalQuery(url, "is_archived", optionalBoolean(input.is_archived));
  setPaginationQuery(url, input);
  return gemPath(url);
}

function buildListProjectCandidatesPath(projectId: string, input: Record<string, unknown>): string {
  const url = gemUrl(`/v0/projects/${encodeURIComponent(projectId)}/candidates`);
  setOptionalQuery(url, "added_after", optionalInteger(input.added_after));
  setOptionalQuery(url, "added_before", optionalInteger(input.added_before));
  setOptionalQuery(url, "sort", optionalString(input.sort));
  setPaginationQuery(url, input);
  return gemPath(url);
}

function buildListSequencesPath(input: Record<string, unknown>): string {
  const url = gemUrl("/v0/sequences");
  setCreatedRangeQuery(url, input);
  setOptionalQuery(url, "user_id", optionalString(input.user_id));
  setPaginationQuery(url, input);
  return gemPath(url);
}

function buildListCustomFieldsPath(input: Record<string, unknown>): string {
  const url = gemUrl("/v0/custom_fields");
  setCreatedRangeQuery(url, input);
  setOptionalQuery(url, "project_id", optionalString(input.project_id));
  setOptionalQuery(url, "scope", optionalString(input.scope));
  setOptionalQuery(url, "is_hidden", optionalBoolean(input.is_hidden));
  setOptionalQuery(url, "name", optionalString(input.name));
  setPaginationQuery(url, input);
  return gemPath(url);
}

function setCreatedRangeQuery(url: URL, input: Record<string, unknown>): void {
  setOptionalQuery(url, "created_after", optionalInteger(input.created_after));
  setOptionalQuery(url, "created_before", optionalInteger(input.created_before));
  setOptionalQuery(url, "sort", optionalString(input.sort));
}

function setPaginationQuery(url: URL, input: Record<string, unknown>): void {
  setOptionalQuery(url, "page", optionalInteger(input.page));
  setOptionalQuery(url, "page_size", optionalInteger(input.page_size));
}

function setOptionalQuery(url: URL, name: string, value: string | number | boolean | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(name, String(value));
  }
}

async function gemList(path: string, property: string, context: GemActionContext): Promise<Record<string, unknown>> {
  const response = await gemGetJson(path, context, "execute");
  if (!Array.isArray(response.payload)) {
    throw new ProviderRequestError(502, "Gem list response must be an array", response.payload);
  }

  const items = response.payload.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, "Gem list item must be an object", item);
    }
    return record;
  });

  return compactObject({
    [property]: items,
    pagination: response.pagination,
  });
}

async function gemObject(path: string, property: string, context: GemActionContext): Promise<Record<string, unknown>> {
  const response = await gemGetJson(path, context, "execute");
  const payload = optionalRecord(response.payload);
  if (!payload) {
    throw new ProviderRequestError(502, "Gem object response must be an object", response.payload);
  }

  return {
    [property]: payload,
  };
}

async function gemGetJson(path: string, context: GemActionContext, phase: GemPhase): Promise<GemResponse> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(gemUrl(path), {
      method: "GET",
      headers: gemHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readGemPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gem request failed: ${error.message}` : "Gem request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createGemError(response, payload, phase);
  }

  return {
    payload,
    pagination: readGemPagination(response.headers),
  };
}

function gemHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

async function readGemPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readGemPagination(headers: Headers): Record<string, unknown> | undefined {
  const raw = headers.get("x-pagination");
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Gem X-Pagination header is invalid JSON");
  }

  const record = optionalRecord(parsed);
  if (!record) {
    throw new ProviderRequestError(502, "Gem X-Pagination header must be an object", parsed);
  }
  return record;
}

function createGemError(response: Response, payload: unknown, phase: GemPhase): ProviderRequestError {
  const message = readGemErrorMessage(payload) ?? `Gem request failed with HTTP ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function readGemErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.status);
}

function readRequiredString(input: Record<string, unknown>, field: string, label: string): string {
  const value = optionalString(input[field]);
  if (!value) {
    throw new ProviderRequestError(400, `Gem ${label} is required`);
  }
  return value;
}

function readPaginationInteger(pagination: Record<string, unknown> | undefined, field: string): number | undefined {
  const value = pagination?.[field];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function gemUrl(path: string): URL {
  return new URL(path, gemApiBaseUrl);
}

function gemPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.gem.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
