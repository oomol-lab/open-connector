import type { CredentialValidationResult, ExecutionResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, toProviderExecutionError } from "../provider-runtime.ts";
import { roamScimUserRoleExtensionUrn } from "./constants.ts";

export const roamScimApiBaseUrl = "https://api.ro.am/scim/v2";

const serviceProviderConfigPath = "/ServiceProviderConfig";
const patchOperationSchema = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const scimUserSchema = "urn:ietf:params:scim:schemas:core:2.0:User";
const scimGroupSchema = "urn:ietf:params:scim:schemas:core:2.0:Group";

type RoamScimRequestPhase = "validate" | "execute";
type RoamScimActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface RoamScimRequestInput {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: RoamScimRequestPhase;
  authenticated?: boolean;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export const roamScimActionHandlers: ProviderActionHandlers<"roam_scim", RoamScimActionHandler> = {
  async get_service_provider_config(_input, context) {
    const payload = await requestRoamScimJson({
      path: serviceProviderConfigPath,
      context,
      phase: "execute",
      authenticated: false,
    });

    return {
      config: requireObjectPayload(payload, "Roam SCIM service provider config"),
    };
  },

  async list_users(input, context) {
    const payload = await requestRoamScimJson({
      path: "/Users",
      context,
      phase: "execute",
      query: buildListQuery(input),
    });

    return normalizeListResponse(payload, "users");
  },

  async get_user(input, context) {
    const id = readRequiredString(input, "id");
    const payload = await requestRoamScimJson({
      path: `/Users/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
    });

    return {
      user: normalizeUser(payload),
    };
  },

  async create_user(input, context) {
    const payload = await requestRoamScimJson({
      path: "/Users",
      context,
      phase: "execute",
      method: "POST",
      body: buildUserPayload(input),
    });

    return {
      user: normalizeUser(payload),
    };
  },

  async replace_user(input, context) {
    const id = readRequiredString(input, "id");
    const payload = await requestRoamScimJson({
      path: `/Users/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      method: "PUT",
      body: buildUserPayload(input),
    });

    return {
      user: normalizeUser(payload),
    };
  },

  async set_user_active(input, context) {
    const id = readRequiredString(input, "id");
    const payload = await requestRoamScimJson({
      path: `/Users/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      method: "PATCH",
      body: buildPatchPayload([
        {
          op: "replace",
          path: "active",
          value: input.active,
        },
      ]),
    });

    return {
      user: normalizeUser(payload),
    };
  },

  async delete_user(input, context) {
    const id = readRequiredString(input, "id");
    await requestRoamScimJson({
      path: `/Users/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      method: "DELETE",
    });

    return {
      id,
      archived: true,
    };
  },

  async list_groups(input, context) {
    const payload = await requestRoamScimJson({
      path: "/Groups",
      context,
      phase: "execute",
      query: buildListQuery(input),
    });

    return normalizeListResponse(payload, "groups");
  },

  async get_group(input, context) {
    const id = readRequiredString(input, "id");
    const payload = await requestRoamScimJson({
      path: `/Groups/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
    });

    return {
      group: normalizeGroup(payload),
    };
  },

  async create_group(input, context) {
    const payload = await requestRoamScimJson({
      path: "/Groups",
      context,
      phase: "execute",
      method: "POST",
      body: buildGroupPayload(input),
    });

    return {
      group: normalizeGroup(payload),
    };
  },

  async replace_group(input, context) {
    const id = readRequiredString(input, "id");
    const payload = await requestRoamScimJson({
      path: `/Groups/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      method: "PUT",
      body: buildGroupPayload(input),
    });

    return {
      group: normalizeGroup(payload),
    };
  },

  async update_group_members(input, context) {
    const id = readRequiredString(input, "id");
    const payload = await requestRoamScimJson({
      path: `/Groups/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      method: "PATCH",
      body: buildPatchPayload([
        {
          op: readRequiredString(input, "operation"),
          path: "members",
          value: readStringArray(input.memberIds, "memberIds").map((value) => ({ value })),
        },
      ]),
    });

    return {
      group: normalizeGroup(payload),
    };
  },

  async delete_group(input, context) {
    const id = readRequiredString(input, "id");
    await requestRoamScimJson({
      path: `/Groups/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      method: "DELETE",
    });

    return {
      id,
      archived: true,
    };
  },
};

export async function validateRoamScimCredential(
  input: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  const payload = await requestRoamScimJson({
    path: "/Users",
    context: input,
    phase: "validate",
    query: {
      count: "1",
    },
  });
  const list = requireObjectPayload(payload, "Roam SCIM user list");

  return {
    profile: {
      displayName: "Roam SCIM Bearer Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: roamScimApiBaseUrl,
      validationEndpoint: "/Users",
      validationCount: "1",
      totalUsers: optionalInteger(list.totalResults),
    }),
  };
}

export function toRoamScimExecutionError(error: unknown): ExecutionResult {
  return toProviderExecutionError(error, "Roam SCIM request failed");
}

async function requestRoamScimJson(input: RoamScimRequestInput): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    const url = new URL(`${roamScimApiBaseUrl}${input.path}`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildRoamScimHeaders(input.context.apiKey, input.body !== undefined, input.authenticated ?? true),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readRoamScimPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Roam SCIM request failed: ${error.message}` : "Roam SCIM request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createRoamScimError(response, payload, input.phase);
  }

  return payload;
}

function buildRoamScimHeaders(apiKey: string, hasBody: boolean, authenticated: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/scim+json, application/json",
    "user-agent": providerUserAgent,
  };
  if (authenticated) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  if (hasBody) {
    headers["content-type"] = "application/scim+json";
  }
  return headers;
}

async function readRoamScimPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createRoamScimError(response: Response, payload: unknown, phase: RoamScimRequestPhase): ProviderRequestError {
  const message =
    extractRoamScimErrorMessage(payload) ??
    response.statusText ??
    `Roam SCIM request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    return new ProviderRequestError(response.status, message, payload, "invalid_input");
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload, "rate_limited");
  }
  return new ProviderRequestError(response.status || 502, message, payload, "provider_error");
}

function extractRoamScimErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  return optionalString(object?.detail) ?? optionalString(object?.error) ?? optionalString(object?.message);
}

function buildListQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    filter: optionalString(input.filter),
    startIndex: stringifyOptionalInteger(input.startIndex),
    count: stringifyOptionalInteger(input.count),
  });
}

function stringifyOptionalInteger(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

function buildUserPayload(input: Record<string, unknown>): Record<string, unknown> {
  const email = readRequiredString(input, "email");
  const role = optionalString(input.role);
  return compactObject({
    schemas: role ? [scimUserSchema, roamScimUserRoleExtensionUrn] : [scimUserSchema],
    userName: email,
    name: {
      givenName: readRequiredString(input, "givenName"),
      familyName: readRequiredString(input, "familyName"),
    },
    emails: [
      {
        value: email,
        primary: true,
        type: "work",
      },
    ],
    externalId: optionalString(input.externalId),
    active: typeof input.active === "boolean" ? input.active : undefined,
    ...(role
      ? {
          [roamScimUserRoleExtensionUrn]: {
            role,
          },
        }
      : {}),
  });
}

function buildGroupPayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    schemas: [scimGroupSchema],
    displayName: readRequiredString(input, "displayName"),
    members: readOptionalStringArray(input.memberIds)?.map((value) => ({ value })),
  });
}

function buildPatchPayload(operations: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    schemas: [patchOperationSchema],
    Operations: operations,
  };
}

function normalizeListResponse(payload: unknown, resourcesKey: "users" | "groups"): Record<string, unknown> {
  const object = requireObjectPayload(payload, "Roam SCIM list response");
  const resources = Array.isArray(object.Resources) ? object.Resources : [];
  return {
    [resourcesKey]:
      resourcesKey === "users"
        ? resources.map((item) => normalizeUser(item))
        : resources.map((item) => normalizeGroup(item)),
    totalResults: optionalInteger(object.totalResults) ?? 0,
    startIndex: optionalInteger(object.startIndex) ?? 0,
    itemsPerPage: optionalInteger(object.itemsPerPage) ?? resources.length,
    schemas: readOptionalStringArray(object.schemas) ?? [],
    raw: object,
  };
}

function normalizeUser(payload: unknown): Record<string, unknown> {
  return requireObjectPayload(payload, "Roam SCIM user");
}

function normalizeGroup(payload: unknown): Record<string, unknown> {
  return requireObjectPayload(payload, "Roam SCIM group");
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `${label} response was not an object`, payload, "provider_error");
  }

  return object;
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(
    input[key],
    key,
    (message) => new ProviderRequestError(400, message, undefined, "invalid_input"),
  );
}

function readStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${key} must be an array`, undefined, "invalid_input");
  }

  return value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new ProviderRequestError(400, `${key} must contain only non-empty strings`, undefined, "invalid_input");
    }

    return item.trim();
  });
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readStringArray(value, "array");
}
