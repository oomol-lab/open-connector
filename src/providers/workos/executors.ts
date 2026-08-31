import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "workos";
const workosApiBaseUrl = "https://api.workos.com";

type WorkosActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const workosActionHandlers: ProviderActionHandlers<"workos", WorkosActionHandler> = {
  list_users(input, context) {
    return executeListAction(
      "/user_management/users",
      buildListParams(input, ["organization_id", "email"]),
      "users",
      context,
    );
  },
  get_user(input, context) {
    return executeGetWrappedAction(`/user_management/users/${encodePathSegment(input.id)}`, "user", context);
  },
  create_user(input, context) {
    return executeBodyWrappedAction("POST", "/user_management/users", buildUserBody(input), "user", context);
  },
  update_user(input, context) {
    return executeBodyWrappedAction(
      "PUT",
      `/user_management/users/${encodePathSegment(input.id)}`,
      buildUserBody(input),
      "user",
      context,
    );
  },
  list_organizations(input, context) {
    return executeListAction("/organizations", buildListParams(input, ["domains", "search"]), "organizations", context);
  },
  get_organization(input, context) {
    return executeGetWrappedAction(`/organizations/${encodePathSegment(input.id)}`, "organization", context);
  },
  create_organization(input, context) {
    return executeBodyWrappedAction("POST", "/organizations", buildOrganizationBody(input), "organization", context);
  },
  update_organization(input, context) {
    return executeBodyWrappedAction(
      "PUT",
      `/organizations/${encodePathSegment(input.id)}`,
      buildOrganizationBody(input),
      "organization",
      context,
    );
  },
  list_organization_memberships(input, context) {
    return executeListAction(
      "/user_management/organization_memberships",
      buildListParams(input, ["organization_id", "user_id", "statuses"]),
      "organization_memberships",
      context,
    );
  },
  get_organization_membership(input, context) {
    return executeGetWrappedAction(
      `/user_management/organization_memberships/${encodePathSegment(input.id)}`,
      "organization_membership",
      context,
    );
  },
  create_organization_membership(input, context) {
    return executeBodyWrappedAction(
      "POST",
      "/user_management/organization_memberships",
      buildOrganizationMembershipBody(input),
      "organization_membership",
      context,
    );
  },
  update_organization_membership(input, context) {
    return executeBodyWrappedAction(
      "PUT",
      `/user_management/organization_memberships/${encodePathSegment(input.id)}`,
      buildOrganizationMembershipBody(input),
      "organization_membership",
      context,
    );
  },
  deactivate_organization_membership(input, context) {
    return executeBodyWrappedAction(
      "PUT",
      `/user_management/organization_memberships/${encodePathSegment(input.id)}/deactivate`,
      undefined,
      "organization_membership",
      context,
    );
  },
  reactivate_organization_membership(input, context) {
    return executeBodyWrappedAction(
      "PUT",
      `/user_management/organization_memberships/${encodePathSegment(input.id)}/reactivate`,
      undefined,
      "organization_membership",
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, workosActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await workosRequest({
      method: "GET",
      path: "/organizations?limit=1",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    return {
      profile: {
        accountId: "workos-api-key",
        displayName: "WorkOS API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: workosApiBaseUrl,
        validationEndpoint: "/organizations?limit=1",
      },
    };
  },
};

async function executeListAction(
  path: string,
  params: URLSearchParams,
  listKey: string,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await workosRequest({
    method: "GET",
    path: buildPathWithParams(path, params),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    [listKey]: looseArray(payload.data),
    list_metadata: optionalRecord(payload.list_metadata) ?? {},
    raw: payload,
  };
}

async function executeGetWrappedAction(
  path: string,
  wrapperKey: string,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await workosRequest({
    method: "GET",
    path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    [wrapperKey]: readWrappedObject(payload, wrapperKey),
    raw: payload,
  };
}

async function executeBodyWrappedAction(
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown> | undefined,
  wrapperKey: string,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await workosRequest({
    method,
    path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    body,
    phase: "execute",
  });
  return {
    [wrapperKey]: readWrappedObject(payload, wrapperKey),
    raw: payload,
  };
}

async function workosRequest(input: {
  method: "GET" | "POST" | "PUT";
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await input.fetcher(new URL(input.path, workosApiBaseUrl), {
      method: input.method,
      headers: workosHeaders(input.apiKey, input.body ? { "content-type": "application/json" } : {}),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `WorkOS request failed: ${error.message}` : "WorkOS request failed",
    );
  }

  const payload = await readWorkosPayload(response);
  if (!response.ok) {
    throw mapWorkosError(response, payload, input.phase);
  }
  return payload;
}

function workosHeaders(apiKey: string, extraHeaders: Record<string, string>): Headers {
  return new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  });
}

async function readWorkosPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    const payload: unknown = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ProviderRequestError(502, "WorkOS returned a non-object response");
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "WorkOS returned invalid JSON");
  }
}

function mapWorkosError(
  response: Response,
  payload: Record<string, unknown>,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readWorkosErrorMessage(payload) ?? `WorkOS request failed with HTTP ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function readWorkosErrorMessage(payload: Record<string, unknown>): string | undefined {
  const error = optionalRecord(payload.error);
  return (
    optionalString(error?.message) ??
    optionalString(payload.message) ??
    optionalString(payload.error_description) ??
    optionalString(payload.error)
  );
}

function buildListParams(input: Record<string, unknown>, extraFields: string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of ["before", "after", "limit", "order", ...extraFields]) {
    appendQueryValue(params, field, input[field]);
  }
  return params;
}

function appendQueryValue(params: URLSearchParams, field: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      params.append(field, String(item));
    }
    return;
  }
  params.set(field, String(value));
}

function buildPathWithParams(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function buildUserBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    email: optionalString(input.email),
    first_name: optionalString(input.first_name),
    last_name: optionalString(input.last_name),
    name: optionalString(input.name),
    email_verified: optionalBoolean(input.email_verified),
    metadata: optionalRecord(input.metadata),
    external_id: optionalString(input.external_id),
    password: optionalString(input.password),
  });
}

function buildOrganizationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    allow_profiles_outside_organization: optionalBoolean(input.allow_profiles_outside_organization),
    domain_data: Array.isArray(input.domain_data) ? input.domain_data : undefined,
    metadata: optionalRecord(input.metadata),
    external_id: optionalString(input.external_id),
  });
}

function buildOrganizationMembershipBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    user_id: optionalString(input.user_id),
    organization_id: optionalString(input.organization_id),
    role_slug: optionalString(input.role_slug),
    role_slugs: Array.isArray(input.role_slugs) ? input.role_slugs : undefined,
  });
}

function readWrappedObject(payload: Record<string, unknown>, wrapperKey: string): Record<string, unknown> {
  return optionalRecord(payload[wrapperKey]) ?? payload;
}
