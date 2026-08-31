import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const permitIoApiBaseUrl = "https://api.permit.io";

interface PermitIoRequestOptions {
  apiKey: string;
  method: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  emptySuccess?: boolean;
}

export interface PermitIoContext {
  apiKey: string;
  fetcher: typeof fetch;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

interface PermitIoEnvironmentContext {
  projectId: string;
  environmentId: string;
}

export const permitIoActionHandlers: ProviderActionHandlers<"permit_io", ProviderRuntimeHandler<PermitIoContext>> = {
  list_users(input, context) {
    return requestEnvironment(context, input, "GET", "/users", undefined, listQuery(input, ["search", "role"]));
  },
  get_user(input, context) {
    return requestEnvironment(context, input, "GET", `/users/${pathValue(input.userId, "userId")}`);
  },
  create_user(input, context) {
    return requestEnvironment(
      context,
      input,
      "POST",
      "/users",
      pickBody(input, ["key", "email", "first_name", "last_name", "attributes"]),
    );
  },
  update_user(input, context) {
    return requestEnvironment(
      context,
      input,
      "PATCH",
      `/users/${pathValue(input.userId, "userId")}`,
      pickBody(input, ["email", "first_name", "last_name", "attributes"]),
    );
  },
  delete_user(input, context) {
    return requestEnvironment(
      context,
      input,
      "DELETE",
      `/users/${pathValue(input.userId, "userId")}`,
      undefined,
      undefined,
      true,
    );
  },
  list_tenants(input, context) {
    return requestEnvironment(context, input, "GET", "/tenants", undefined, listQuery(input, ["search"]));
  },
  get_tenant(input, context) {
    return requestEnvironment(context, input, "GET", `/tenants/${pathValue(input.tenantId, "tenantId")}`);
  },
  create_tenant(input, context) {
    return requestEnvironment(
      context,
      input,
      "POST",
      "/tenants",
      pickBody(input, ["key", "name", "description", "attributes"]),
    );
  },
  update_tenant(input, context) {
    return requestEnvironment(
      context,
      input,
      "PATCH",
      `/tenants/${pathValue(input.tenantId, "tenantId")}`,
      pickBody(input, ["name", "description", "attributes"]),
    );
  },
  delete_tenant(input, context) {
    return requestEnvironment(
      context,
      input,
      "DELETE",
      `/tenants/${pathValue(input.tenantId, "tenantId")}`,
      undefined,
      undefined,
      true,
    );
  },
  list_role_assignments(input, context) {
    return requestEnvironment(
      context,
      input,
      "GET",
      "/role_assignments",
      undefined,
      listQuery(input, ["user", "role", "tenant", "resource", "resourceInstance", "detailed"]),
    );
  },
  assign_role(input, context) {
    return requestEnvironment(
      context,
      input,
      "POST",
      "/role_assignments",
      pickBody(input, ["user", "role", "tenant", "resource_instance"]),
    );
  },
  unassign_role(input, context) {
    return requestEnvironment(
      context,
      input,
      "DELETE",
      "/role_assignments",
      pickBody(input, ["user", "role", "tenant", "resource_instance"]),
      undefined,
      true,
    );
  },
};

export async function validatePermitIoCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestPermitIoJson({
    apiKey,
    method: "GET",
    path: "/v2/api-key/scope",
    fetcher,
    signal,
    phase: "validate",
  });
  const scope = recordOrEmpty(payload);
  const organizationId = requiredResponseString(scope.organization_id, "organization_id");
  const projectId = optionalString(scope.project_id);
  const environmentId = optionalString(scope.environment_id);
  const accountId = environmentId ?? projectId ?? organizationId;

  return {
    profile: {
      accountId,
      displayName: environmentId
        ? `Permit.io environment ${environmentId}`
        : projectId
          ? `Permit.io project ${projectId}`
          : `Permit.io organization ${organizationId}`,
    },
    grantedScopes: [],
    metadata: {
      organizationId,
      projectId,
      environmentId,
    },
  };
}

function requestEnvironment(
  context: PermitIoContext,
  input: Record<string, unknown>,
  method: string,
  suffix: string,
  body?: Record<string, unknown>,
  query?: Record<string, string | number | boolean | undefined>,
  emptySuccess?: boolean,
): Promise<unknown> {
  const environment = resolveContext(context, input);
  return requestPermitIoJson({
    apiKey: context.apiKey,
    method,
    path: `/v2/facts/${encodeURIComponent(environment.projectId)}/${encodeURIComponent(environment.environmentId)}${suffix}`,
    body,
    query,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    emptySuccess,
  });
}

function resolveContext(context: PermitIoContext, input: Record<string, unknown>): PermitIoEnvironmentContext {
  const projectId = optionalString(input.projectId) ?? optionalString(context.metadata?.projectId);
  const environmentId = optionalString(input.environmentId) ?? optionalString(context.metadata?.environmentId);
  if (!projectId || !environmentId) {
    throw new ProviderRequestError(400, "Permit.io projectId and environmentId are required for this API key scope");
  }
  return { projectId, environmentId };
}

async function requestPermitIoJson(options: PermitIoRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(options.signal);
  const url = new URL(options.path, permitIoApiBaseUrl);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await options.fetcher(url, {
      method: options.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Permit.io request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Permit.io request failed: ${error.message}` : "Permit.io request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw permitIoError(response, payload, options.phase);
  }
  if (options.emptySuccess) {
    return { ok: true };
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text().catch(() => "");
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function permitIoError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = recordOrEmpty(payload);
  const message =
    optionalString(record.detail) ??
    optionalString(record.message) ??
    `Permit.io request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function listQuery(
  input: Record<string, unknown>,
  fields: readonly string[],
): Record<string, string | number | boolean | undefined> {
  const query: Record<string, string | number | boolean | undefined> = {
    page: optionalInteger(input.page),
    per_page: optionalInteger(input.perPage),
  };
  for (const field of fields) {
    const outputName = field === "resourceInstance" ? "resource_instance" : field;
    const value = input[field];
    if (typeof value === "string" || typeof value === "boolean") {
      query[outputName] = value;
    }
  }
  if (fields.includes("detailed")) {
    query.include_total_count = true;
  }
  return query;
}

function pickBody(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) {
      body[field] = input[field];
    }
  }
  return body;
}

function pathValue(value: unknown, field: string): string {
  return encodeURIComponent(requiredInputString(value, field));
}

function requiredInputString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${field} is required`);
  }
  return result;
}

function requiredResponseString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(502, `Permit.io response is missing ${field}`);
  }
  return result;
}
