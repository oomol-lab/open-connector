import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const coderabbitApiBaseUrl = "https://api.coderabbit.ai";

type JsonObject = Record<string, unknown>;
type CoderabbitRuntimeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CoderabbitActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface CoderabbitCredentialInput {
  apiKey: string;
}

export const coderabbitActionHandlers: ProviderActionHandlers<"coderabbit", CoderabbitActionHandler> = {
  async list_users(input, context) {
    return listUsers(input, context);
  },

  async manage_seats(input, context) {
    return requestCoderabbit(
      {
        method: "POST",
        path: "/v1/users/seats",
        body: {
          action: input.action,
          user_ids: input.userIds,
        },
      },
      context,
    );
  },

  async get_seat_assignment_mode(_input, context) {
    return requestCoderabbit({ method: "GET", path: "/v1/users/seats/assignment" }, context);
  },

  async update_seat_assignment_mode(input, context) {
    return requestCoderabbit(
      {
        method: "POST",
        path: "/v1/users/seats/assignment",
        body: { mode: input.mode },
      },
      context,
    );
  },

  async change_roles(input, context) {
    return requestCoderabbit(
      {
        method: "POST",
        path: "/v1/users/roles",
        body: {
          role: input.role,
          user_ids: input.userIds,
        },
      },
      context,
    );
  },

  async get_review_metrics(input, context) {
    const payload = await requestCoderabbit(
      {
        method: "GET",
        path: "/v1/metrics/reviews",
        search: buildSearchParams({
          start_date: input.startDate,
          end_date: input.endDate,
          organization_ids: joinOptionalStrings(input.organizationIds),
          repository_ids: joinOptionalStrings(input.repositoryIds),
          user_ids: joinOptionalStrings(input.userIds),
          limit: input.limit,
          cursor: input.cursor,
        }),
      },
      context,
    );

    return {
      data: readArray(payload.data),
      nextCursor: optionalString(payload.next_cursor) ?? null,
      raw: payload,
    };
  },

  async list_audit_logs(input, context) {
    const payload = await requestCoderabbit(
      {
        method: "GET",
        path: "/v1/audit-logs",
        search: buildSearchParams({
          search: input.search,
          actions: joinOptionalStrings(input.actions),
          resource_types: joinOptionalStrings(input.resourceTypes),
          date_from: input.dateFrom,
          date_to: input.dateTo,
          page: input.page,
          page_size: input.pageSize,
        }),
      },
      context,
    );

    return {
      data: readArray(payload.data),
      pagination: readObject(payload.pagination, "pagination"),
      filterOptions: readObject(payload.filter_options, "filter_options"),
      raw: payload,
    };
  },

  async list_roles(input, context) {
    const payload = await requestCoderabbit(
      {
        method: "GET",
        path: "/v1/roles",
        search: buildSearchParams({
          org_id: input.orgId,
          role_type: input.roleType,
          include_permissions: optionalBoolean(input.includePermissions),
          include_user_count: optionalBoolean(input.includeUserCount),
        }),
      },
      context,
    );

    return {
      roles: normalizeRoleList(payload),
      raw: payload,
    };
  },

  async get_role(input, context) {
    const payload = await requestCoderabbit(
      {
        method: "GET",
        path: `/v1/roles/${encodeURIComponent(requireInputString(input.roleId, "roleId"))}`,
        search: buildSearchParams({
          org_id: input.orgId,
          include_permissions: optionalBoolean(input.includePermissions),
          include_user_count: optionalBoolean(input.includeUserCount),
        }),
      },
      context,
    );

    return {
      role: normalizeRole(payload),
      raw: payload,
    };
  },

  async create_role(input, context) {
    const payload = await requestCoderabbit(
      {
        method: "POST",
        path: "/v1/roles",
        body: buildRoleBody(input),
      },
      context,
    );

    return {
      role: normalizeRole(payload),
      raw: payload,
    };
  },

  async update_role(input, context) {
    const payload = await requestCoderabbit(
      {
        method: "PATCH",
        path: `/v1/roles/${encodeURIComponent(requireInputString(input.roleId, "roleId"))}`,
        body: buildRoleBody(input),
      },
      context,
    );

    return {
      role: normalizeRole(payload),
      raw: payload,
    };
  },

  async delete_role(input, context) {
    await requestCoderabbit(
      {
        method: "DELETE",
        path: `/v1/roles/${encodeURIComponent(requireInputString(input.roleId, "roleId"))}`,
        search: buildSearchParams({ org_id: input.orgId }),
      },
      context,
    );

    return { deleted: true };
  },

  async list_role_permissions(input, context) {
    const payload = await requestCoderabbit(
      {
        method: "GET",
        path: "/v1/roles/permissions",
        search: buildSearchParams({ org_id: input.orgId }),
      },
      context,
    );

    return {
      resourceIds: readArray(payload.resource_ids).map(String),
      accessTypes: readArray(payload.access_types).map(String),
      raw: payload,
    };
  },
};

export async function validateCoderabbitApiKey(
  input: CoderabbitCredentialInput,
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const context: CoderabbitRuntimeContext = {
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
  };
  const output = await listUsers({ limit: 1 }, context);
  const firstUser = optionalRecord(output.users[0]);
  const firstUserId = optionalString(firstUser?.user_id);

  return {
    profile: {
      accountId: "coderabbit:organization",
      displayName: "CodeRabbit Organization",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: coderabbitApiBaseUrl,
      validationEndpoint: "/v1/users",
      seatsPurchased: output.seatsPurchased,
      seatsAssigned: output.seatsAssigned,
      seatAssignmentMode: output.seatAssignmentMode,
      firstUserId,
    }),
  };
}

async function listUsers(
  input: Record<string, unknown>,
  context: CoderabbitRuntimeContext,
): Promise<{
  seatsPurchased: number;
  seatsAssigned: number;
  seatAssignmentMode: string;
  users: unknown[];
  nextCursor: string | null;
  raw: JsonObject;
}> {
  const payload = await requestCoderabbit(
    {
      method: "GET",
      path: "/v1/users",
      search: buildSearchParams({
        seat_filter: input.seatFilter,
        role_filter: input.roleFilter,
        limit: input.limit,
        cursor: input.cursor,
      }),
    },
    context,
  );

  return {
    seatsPurchased: requireInteger(payload.seats_purchased, "seats_purchased"),
    seatsAssigned: requireInteger(payload.seats_assigned, "seats_assigned"),
    seatAssignmentMode: requireStringFromResponse(payload.seat_assignment_mode, "seat_assignment_mode"),
    users: readArray(payload.users),
    nextCursor: optionalString(payload.next_cursor) ?? null,
    raw: payload,
  };
}

async function requestCoderabbit(
  request: {
    method: "DELETE" | "GET" | "PATCH" | "POST";
    path: string;
    search?: URLSearchParams;
    body?: Record<string, unknown>;
  },
  context: CoderabbitRuntimeContext,
): Promise<JsonObject> {
  const url = new URL(`${coderabbitApiBaseUrl}${request.path}`);
  if (request.search) {
    for (const [key, value] of request.search) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method,
      headers: {
        accept: "application/json",
        ...(request.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
        "x-coderabbitai-api-key": context.apiKey,
      },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CodeRabbit request failed: ${error.message}` : "CodeRabbit request failed",
    );
  }

  const payload = await readJsonObject(response, { tolerant: !response.ok });
  if (!response.ok) {
    throw mapCoderabbitError(response, payload);
  }

  return payload;
}

async function readJsonObject(
  response: Response,
  options: { tolerant: boolean } = { tolerant: false },
): Promise<JsonObject> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (options.tolerant) {
      return {};
    }
    throw new ProviderRequestError(502, "CodeRabbit returned invalid JSON");
  }

  return readObject(payload, "response");
}

function mapCoderabbitError(response: Response, payload: JsonObject): ProviderRequestError {
  const error = optionalRecord(payload.error);
  const firstError = Array.isArray(payload.errors) ? optionalRecord(payload.errors[0]) : undefined;
  const message =
    optionalString(error?.message) ??
    optionalString(firstError?.message) ??
    optionalString(payload.message) ??
    `CodeRabbit API request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403 || response.status === 410) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function buildSearchParams(input: Record<string, unknown>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  return search;
}

function buildRoleBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    org_id: input.orgId,
    name: input.name,
    description: input.description,
    is_default: optionalBoolean(input.isDefault),
    duplicate_from: input.duplicateFrom,
    permissions: input.permissions,
  });
}

function normalizeRoleList(payload: JsonObject): unknown[] {
  const roles = readOptionalArray(payload.roles) ?? readOptionalArray(payload.data);
  if (roles) {
    return roles.map(normalizeRole);
  }

  throw new ProviderRequestError(502, "CodeRabbit returned invalid roles payload", payload);
}

function normalizeRole(value: unknown): JsonObject {
  return readObject(value, "role");
}

function joinOptionalStrings(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map(String).join(",");
}

function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readObject(value: unknown, fieldName: string): JsonObject {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `CodeRabbit returned invalid ${fieldName}`);
  }
  return object;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, invalidInputError);
}

function requireStringFromResponse(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(502, message));
}

function requireInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    throw new ProviderRequestError(502, `CodeRabbit returned invalid ${fieldName}`);
  }
  return integer;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
