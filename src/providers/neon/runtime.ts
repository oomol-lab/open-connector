import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const neonApiBaseUrl = "https://console.neon.tech/api/v2";

type NeonRequestPhase = "validate" | "execute";
type NeonQueryValue = string | number | boolean | undefined;
type NeonActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type NeonActionHandler = (input: Record<string, unknown>, context: NeonActionContext) => Promise<unknown>;

interface NeonRequestInput {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: NeonRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, NeonQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
  allowNoContent?: boolean;
}

export const neonActionHandlers: ProviderActionHandlers<"neon", NeonActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_projects(input, context) {
    return listProjects(input, context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  create_project(input, context) {
    return createProject(input, context);
  },
  update_project(input, context) {
    return updateProject(input, context);
  },
  delete_project(input, context) {
    return deleteProject(input, context);
  },
  list_branches(input, context) {
    return listBranches(input, context);
  },
  get_branch(input, context) {
    return getBranch(input, context);
  },
  create_branch(input, context) {
    return createBranch(input, context);
  },
  update_branch(input, context) {
    return updateBranch(input, context);
  },
  delete_branch(input, context) {
    return deleteBranch(input, context);
  },
  list_databases(input, context) {
    return listDatabases(input, context);
  },
  get_database(input, context) {
    return getDatabase(input, context);
  },
  create_database(input, context) {
    return createDatabase(input, context);
  },
  update_database(input, context) {
    return updateDatabase(input, context);
  },
  delete_database(input, context) {
    return deleteDatabase(input, context);
  },
  list_operations(input, context) {
    return listOperations(input, context);
  },
  get_operation(input, context) {
    return getOperation(input, context);
  },
};

export async function validateNeonCredential(
  input: { apiKey: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const profile = normalizeCurrentUser(
    await requestNeonJson({
      apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
      path: "/users/me",
      fetcher,
      signal,
      phase: "validate",
    }),
  );
  const profileId = optionalString(profile.id);
  const email = optionalString(profile.email);
  const name = optionalString(profile.name);
  const lastName = optionalString(profile.lastName);
  const plan = optionalString(profile.plan);
  const displayName = buildDisplayName(name, lastName, email);

  return {
    profile: {
      accountId: profileId ?? email ?? "neon",
      displayName: displayName ?? "Neon API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/users/me",
      apiBaseUrl: neonApiBaseUrl,
      userId: profileId,
      email,
      name,
      lastName,
      plan,
      projectsLimit: optionalNumber(profile.projectsLimit),
      branchesLimit: optionalNumber(profile.branchesLimit),
    }),
  };
}

async function getCurrentUser(context: NeonActionContext): Promise<Record<string, unknown>> {
  return normalizeCurrentUser(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: "/users/me",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  );
}

async function listProjects(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: "/projects",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: compactObject({
        cursor: optionalString(input.cursor),
        limit: optionalNumber(input.limit),
        search: optionalString(input.search),
        org_id: optionalString(input.orgId),
        recoverable: optionalBoolean(input.recoverable),
      }),
    }),
    "project list response",
  );

  return {
    projects: normalizeNeonArray(payload.projects, "projects"),
    unavailableProjectIds: normalizeStringArray(payload.unavailable_project_ids),
    pagination: normalizeNullableNeonObject(payload.pagination),
  };
}

async function getProject(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "project detail response",
  );

  return {
    project: normalizeNeonObject(payload.project, "project"),
  };
}

async function createProject(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: "/projects",
      method: "POST",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      body: {
        project: compactObject({
          name: readRequiredInputString(input, "name"),
          org_id: optionalString(input.orgId),
          region_id: optionalString(input.regionId),
          pg_version: optionalNumber(input.pgVersion),
          store_passwords: optionalBoolean(input.storePasswords),
          history_retention_seconds: optionalNumber(input.historyRetentionSeconds),
          branch: buildCreateProjectBranch(input),
        }),
      },
    }),
    "create project response",
  );

  return {
    project: normalizeNeonObject(payload.project, "project"),
    branch: normalizeNullableNeonObject(payload.branch),
    databases: normalizeNeonArrayOrEmpty(payload.databases, "databases"),
    operations: normalizeNeonArrayOrEmpty(payload.operations, "operations"),
  };
}

async function updateProject(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  assertAnyField(input, ["name", "historyRetentionSeconds"]);
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}`,
      method: "PATCH",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: {
        project: compactObject({
          name: optionalString(input.name),
          history_retention_seconds: optionalNumber(input.historyRetentionSeconds),
        }),
      },
    }),
    "update project response",
  );

  return {
    project: normalizeNeonObject(payload.project, "project"),
    operations: normalizeNeonArrayOrEmpty(payload.operations, "operations"),
  };
}

async function deleteProject(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}`,
      method: "DELETE",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "delete project response",
  );

  return {
    deleted: true,
    project: normalizeNeonObject(payload.project, "project"),
  };
}

async function listBranches(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/branches`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        search: optionalString(input.search),
        sort_by: optionalString(input.sortBy),
        sort_order: optionalString(input.sortOrder),
        cursor: optionalString(input.cursor),
        limit: optionalNumber(input.limit),
      }),
    }),
    "branch list response",
  );

  return {
    branches: normalizeNeonArray(payload.branches, "branches"),
    annotations: normalizeAnnotationsMap(payload.annotations),
    pagination: normalizeNullableNeonObject(payload.pagination),
  };
}

async function getBranch(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const branchId = readRequiredInputString(input, "branchId");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "branch detail response",
  );

  return {
    branch: normalizeNeonObject(payload.branch, "branch"),
    annotation: normalizeNullableNeonObject(payload.annotation),
  };
}

async function createBranch(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  if (optionalString(input.parentLsn) && optionalString(input.parentTimestamp)) {
    throw new ProviderRequestError(400, "parentLsn and parentTimestamp cannot be used together");
  }
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/branches`,
      method: "POST",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: {
        branch: compactObject({
          name: readRequiredInputString(input, "name"),
          parent_id: optionalString(input.parentId),
          parent_lsn: optionalString(input.parentLsn),
          parent_timestamp: optionalString(input.parentTimestamp),
          protected: optionalBoolean(input.protected),
          init_source: optionalString(input.initSource),
        }),
      },
    }),
    "create branch response",
  );

  return {
    branch: normalizeNeonObject(payload.branch, "branch"),
    operations: normalizeNeonArrayOrEmpty(payload.operations, "operations"),
  };
}

async function updateBranch(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const branchId = readRequiredInputString(input, "branchId");
  assertAnyField(input, ["name", "protected"]);
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
      method: "PATCH",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: {
        branch: compactObject({
          name: optionalString(input.name),
          protected: optionalBoolean(input.protected),
        }),
      },
    }),
    "update branch response",
  );

  return {
    branch: normalizeNeonObject(payload.branch, "branch"),
    operations: normalizeNeonArrayOrEmpty(payload.operations, "operations"),
  };
}

async function deleteBranch(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const branchId = readRequiredInputString(input, "branchId");
  const payload = await requestNeonJson({
    apiKey: context.apiKey,
    path: `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
    allowNoContent: true,
  });

  if (payload === null) {
    return {
      deleted: true,
      branch: null,
      operations: [],
    };
  }

  const response = requireResponseObject(payload, "delete branch response");
  return {
    deleted: true,
    branch: normalizeNullableNeonObject(response.branch),
    operations: normalizeNeonArrayOrEmpty(response.operations, "operations"),
  };
}

async function listDatabases(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const branchId = readRequiredInputString(input, "branchId");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "database list response",
  );

  return {
    databases: normalizeNeonArray(payload.databases, "databases"),
  };
}

async function getDatabase(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const branchId = readRequiredInputString(input, "branchId");
  const databaseName = readRequiredInputString(input, "databaseName");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases/${encodeURIComponent(databaseName)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "database detail response",
  );

  return {
    database: normalizeNeonObject(payload.database, "database"),
  };
}

async function createDatabase(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const branchId = readRequiredInputString(input, "branchId");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases`,
      method: "POST",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: {
        database: {
          name: readRequiredInputString(input, "name"),
          owner_name: readRequiredInputString(input, "ownerName"),
        },
      },
    }),
    "create database response",
  );

  return {
    database: normalizeNeonObject(payload.database, "database"),
    operations: normalizeNeonArrayOrEmpty(payload.operations, "operations"),
  };
}

async function updateDatabase(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const branchId = readRequiredInputString(input, "branchId");
  const databaseName = readRequiredInputString(input, "databaseName");
  assertAnyField(input, ["newName", "ownerName"]);
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases/${encodeURIComponent(databaseName)}`,
      method: "PATCH",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: {
        database: compactObject({
          name: optionalString(input.newName),
          owner_name: optionalString(input.ownerName),
        }),
      },
    }),
    "update database response",
  );

  return {
    database: normalizeNeonObject(payload.database, "database"),
    operations: normalizeNeonArrayOrEmpty(payload.operations, "operations"),
  };
}

async function deleteDatabase(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const branchId = readRequiredInputString(input, "branchId");
  const databaseName = readRequiredInputString(input, "databaseName");
  const payload = await requestNeonJson({
    apiKey: context.apiKey,
    path: `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases/${encodeURIComponent(databaseName)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
    allowNoContent: true,
  });

  if (payload === null) {
    return {
      deleted: true,
      database: null,
      operations: [],
    };
  }

  const response = requireResponseObject(payload, "delete database response");
  return {
    deleted: true,
    database: normalizeNullableNeonObject(response.database),
    operations: normalizeNeonArrayOrEmpty(response.operations, "operations"),
  };
}

async function listOperations(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/operations`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        cursor: optionalString(input.cursor),
        limit: optionalNumber(input.limit),
      }),
    }),
    "operation list response",
  );

  return {
    operations: normalizeNeonArray(payload.operations, "operations"),
    pagination: normalizeNullableNeonObject(payload.pagination),
  };
}

async function getOperation(input: Record<string, unknown>, context: NeonActionContext): Promise<unknown> {
  const projectId = readRequiredInputString(input, "projectId");
  const operationId = readRequiredInputString(input, "operationId");
  const payload = requireResponseObject(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `/projects/${encodeURIComponent(projectId)}/operations/${encodeURIComponent(operationId)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "operation detail response",
  );

  return {
    operation: normalizeNeonObject(payload.operation, "operation"),
  };
}

async function requestNeonJson({
  apiKey,
  path,
  fetcher,
  phase,
  signal,
  method = "GET",
  query,
  body,
  notFoundAsInvalidInput = false,
  allowNoContent = false,
}: NeonRequestInput): Promise<unknown | null> {
  const url = new URL(`${neonApiBaseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      method,
      headers: buildNeonHeaders(apiKey, body != null),
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Neon request failed: ${error.message}` : "Neon request failed",
    );
  }

  const payload = await readResponseBody(response);
  if (response.ok) {
    if (response.status === 204 || payload === null) {
      return allowNoContent ? null : payload;
    }
    return payload;
  }

  throw new ProviderRequestError(
    mapNeonStatusToErrorStatus(response.status, phase, notFoundAsInvalidInput),
    extractNeonErrorMessage(payload) ?? `Neon request failed with HTTP ${response.status}`,
    payload,
  );
}

function buildNeonHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readResponseBody(response: Response): Promise<unknown | null> {
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

function mapNeonStatusToErrorStatus(status: number, phase: NeonRequestPhase, notFoundAsInvalidInput: boolean): number {
  if (phase === "validate" && (status === 401 || status === 403)) {
    return 400;
  }
  if (status === 404 && notFoundAsInvalidInput) {
    return 400;
  }
  return status;
}

function extractNeonErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const directMessage = optionalString(object.message);
  if (directMessage) {
    return directMessage;
  }

  const directError = optionalString(object.error);
  if (directError) {
    return directError;
  }

  return optionalString(optionalRecord(object.error)?.message);
}

function buildCreateProjectBranch(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const branch = compactObject({
    name: optionalString(input.branchName),
    database_name: optionalString(input.databaseName),
    role_name: optionalString(input.roleName),
  });

  return Object.keys(branch).length > 0 ? branch : undefined;
}

function buildDisplayName(
  name: string | undefined,
  lastName: string | undefined,
  email: string | undefined,
): string | undefined {
  const fullName = [name, lastName]
    .filter((value) => value && value.trim())
    .join(" ")
    .trim();
  return fullName || email;
}

function readRequiredInputString(input: Record<string, unknown>, field: string): string {
  return requiredString(input[field], field, (message) => new ProviderRequestError(400, message));
}

function assertAnyField(input: Record<string, unknown>, fields: string[]): void {
  if (!fields.some((field) => input[field] !== undefined)) {
    throw new ProviderRequestError(400, `at least one of ${fields.join(" or ")} must be provided`);
  }
}

function requireResponseObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Malformed Neon response: missing ${field}`);
  }
  return value as Record<string, unknown>;
}

function normalizeCurrentUser(value: unknown): Record<string, unknown> {
  return normalizeNeonObject(value, "current user");
}

function normalizeNeonObject(value: unknown, field: string): Record<string, unknown> {
  return normalizeNeonValue(requireResponseObject(value, field)) as Record<string, unknown>;
}

function normalizeNullableNeonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return normalizeNeonValue(value) as Record<string, unknown>;
}

function normalizeNeonArray(value: unknown, field: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Malformed Neon response: missing ${field}`);
  }
  return value.map((item, index) => normalizeNeonObject(item, `${field}[${index}]`));
}

function normalizeNeonArrayOrEmpty(value: unknown, field: string): Array<Record<string, unknown>> {
  if (value == null) {
    return [];
  }
  return normalizeNeonArray(value, field);
}

function normalizeStringArray(value: unknown): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Malformed Neon response: unavailable_project_ids");
  }
  return value.map((item) => String(item));
}

function normalizeAnnotationsMap(value: unknown): Record<string, Record<string, unknown>> {
  if (value == null) {
    return {};
  }
  const annotations = requireResponseObject(value, "annotations");
  return Object.fromEntries(
    Object.entries(annotations).map(([key, child]) => [key, normalizeNeonObject(child, `annotations.${key}`)]),
  );
}

function normalizeNeonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNeonValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      toCamelCase(key),
      normalizeNeonValue(child),
    ]),
  );
}

function toCamelCase(value: string): string {
  let output = "";
  let uppercaseNext = false;

  for (const char of value) {
    if (char === "_") {
      uppercaseNext = true;
      continue;
    }

    output += uppercaseNext ? char.toUpperCase() : char;
    uppercaseNext = false;
  }

  return output;
}
