import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "formbricks";
const formbricksApiBaseUrl = "https://app.formbricks.com/api/v2";
const formbricksValidationPath = "/me";
const formbricksRequestTimeoutMs = 30_000;

type FormbricksRequestMode = "validate" | "execute";
type FormbricksActionContext = ApiKeyProviderContext;
type FormbricksActionHandler = (input: Record<string, unknown>, context: FormbricksActionContext) => Promise<unknown>;

interface FormbricksRequestInput {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  mode: FormbricksRequestMode;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export const formbricksActionHandlers: ProviderActionHandlers<"formbricks", FormbricksActionHandler> = {
  async get_me(_input, context) {
    return normalizeMePayload(
      await requestFormbricksJson(context, {
        path: formbricksValidationPath,
        method: "GET",
        mode: "execute",
      }),
    );
  },
  async list_contact_attribute_keys(input, context) {
    return normalizeContactAttributeKeyListPayload(
      await requestFormbricksJson(context, {
        path: "/management/contact-attribute-keys",
        method: "GET",
        mode: "execute",
        query: compactObject({
          workspaceId: optionalString(input.workspaceId),
          environmentId: optionalString(input.environmentId),
          limit: optionalInteger(input.limit),
          skip: optionalInteger(input.skip),
          sortBy: optionalString(input.sortBy),
          order: optionalString(input.order),
          startDate: optionalString(input.startDate),
          endDate: optionalString(input.endDate),
          filterDateField: optionalString(input.filterDateField),
        }),
      }),
    );
  },
  async get_contact_attribute_key(input, context) {
    return {
      contactAttributeKey: normalizeContactAttributeKey(
        await requestFormbricksJson(context, {
          path: `/management/contact-attribute-keys/${encodeURIComponent(requiredInputString(input.contactAttributeKeyId, "contactAttributeKeyId"))}`,
          method: "GET",
          mode: "execute",
        }),
      ),
    };
  },
  async create_contact_attribute_key(input, context) {
    return {
      contactAttributeKey: normalizeContactAttributeKey(
        await requestFormbricksJson(context, {
          path: "/management/contact-attribute-keys",
          method: "POST",
          mode: "execute",
          body: compactObject({
            workspaceId: requiredInputString(input.workspaceId, "workspaceId"),
            environmentId: optionalString(input.environmentId),
            key: requiredInputString(input.key, "key"),
            name: requiredNullableInputString(input.name, "name"),
            description: requiredNullableInputString(input.description, "description"),
          }),
        }),
      ),
    };
  },
  async update_contact_attribute_key(input, context) {
    return {
      contactAttributeKey: normalizeContactAttributeKey(
        await requestFormbricksJson(context, {
          path: `/management/contact-attribute-keys/${encodeURIComponent(requiredInputString(input.contactAttributeKeyId, "contactAttributeKeyId"))}`,
          method: "PUT",
          mode: "execute",
          body: compactObject({
            key: optionalString(input.key),
            name: optionalNullableString(input.name),
            description: optionalNullableString(input.description),
          }),
        }),
      ),
    };
  },
  async delete_contact_attribute_key(input, context) {
    return {
      contactAttributeKey: normalizeContactAttributeKey(
        await requestFormbricksJson(context, {
          path: `/management/contact-attribute-keys/${encodeURIComponent(requiredInputString(input.contactAttributeKeyId, "contactAttributeKeyId"))}`,
          method: "DELETE",
          mode: "execute",
        }),
      ),
    };
  },
  async create_contact(input, context) {
    return {
      contact: normalizeContact(
        await requestFormbricksJson(context, {
          path: "/management/contacts",
          method: "POST",
          mode: "execute",
          body: compactObject({
            workspaceId: requiredInputString(input.workspaceId, "workspaceId"),
            environmentId: optionalString(input.environmentId),
            attributes: input.attributes,
          }),
        }),
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, formbricksActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = normalizeMePayload(
      await requestFormbricksJson(
        {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        {
          path: formbricksValidationPath,
          method: "GET",
          mode: "validate",
        },
      ),
    );

    return {
      profile: {
        accountId: payload.organizationId,
        displayName: `Formbricks organization ${payload.organizationId}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: formbricksApiBaseUrl,
        validationEndpoint: formbricksValidationPath,
        organizationId: payload.organizationId,
        workspaceCount: payload.workspaces.length,
        workspaces: payload.workspaces,
      },
    };
  },
};

async function requestFormbricksJson(
  context: Pick<FormbricksActionContext, "apiKey" | "fetcher" | "signal">,
  input: FormbricksRequestInput,
): Promise<Record<string, unknown>> {
  const timeoutSignal = AbortSignal.timeout(formbricksRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await context.fetcher(buildFormbricksUrl(input.path, input.query), {
      method: input.method,
      headers: buildFormbricksHeaders(context.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readFormbricksPayload(response);

    if (!response.ok) {
      throw createFormbricksError(response.status, payload, input.mode);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "formbricks returned invalid JSON", payload);
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "formbricks request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `formbricks request failed: ${error.message}` : "formbricks request failed",
      error,
    );
  }
}

function createFormbricksError(status: number, payload: unknown, mode: FormbricksRequestMode): ProviderRequestError {
  const message = readFormbricksErrorMessage(payload) ?? `formbricks request failed with status ${status}`;

  if ((status === 401 || status === 403) && mode === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function buildFormbricksUrl(path: string, query: Record<string, string | number | boolean | undefined> = {}): string {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${formbricksApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildFormbricksHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readFormbricksPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readFormbricksErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload || undefined;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message) ?? optionalString(record?.errorMessage);
}

function normalizeMePayload(payload: Record<string, unknown>): {
  organizationId: string;
  organizationAccess: {
    accessControl: {
      read: boolean;
      write: boolean;
    };
  };
  workspaces: Array<Record<string, unknown>>;
  environments: Array<Record<string, unknown>>;
} {
  return {
    organizationId: requiredProviderString(payload.organizationId, "organizationId"),
    organizationAccess: normalizeOrganizationAccess(payload.organizationAccess),
    workspaces: normalizeWorkspaceList(payload.workspaces),
    environments: normalizeWorkspaceList(payload.environments),
  };
}

function normalizeOrganizationAccess(value: unknown): {
  accessControl: {
    read: boolean;
    write: boolean;
  };
} {
  const record = optionalRecord(value);
  const accessControl = optionalRecord(record?.accessControl);
  if (!record || !accessControl) {
    throw new ProviderRequestError(502, "formbricks me payload is missing organizationAccess", value);
  }

  return {
    accessControl: {
      read: requiredProviderBoolean(accessControl.read, "organizationAccess.accessControl.read"),
      write: requiredProviderBoolean(accessControl.write, "organizationAccess.accessControl.write"),
    },
  };
}

function normalizeWorkspaceList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((workspace) => normalizeWorkspace(workspace));
}

function normalizeWorkspace(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "formbricks workspace entry must be an object", value);
  }

  return {
    workspaceId: requiredProviderString(record.workspaceId, "workspaceId"),
    environmentId: nullableProviderString(record.environmentId),
    environmentType: requiredProviderString(record.environmentType, "environmentType"),
    permission: requiredProviderString(record.permission, "permission"),
    projectId: requiredProviderString(record.projectId, "projectId"),
    projectName: requiredProviderString(record.projectName, "projectName"),
  };
}

function normalizeContactAttributeKeyListPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = Array.isArray(payload.data) ? payload.data : [];
  const meta = optionalRecord(payload.meta) ?? {};

  return {
    contactAttributeKeys: data.map((item) => normalizeContactAttributeKey(item)),
    meta: {
      total: requiredProviderInteger(meta.total, "meta.total"),
      limit: requiredProviderInteger(meta.limit, "meta.limit"),
      offset: requiredProviderInteger(meta.offset, "meta.offset"),
    },
  };
}

function normalizeContactAttributeKey(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "formbricks contact attribute key payload must be an object", value);
  }

  return {
    id: requiredProviderString(record.id, "id"),
    createdAt: requiredProviderString(record.createdAt, "createdAt"),
    updatedAt: requiredProviderString(record.updatedAt, "updatedAt"),
    isUnique: requiredProviderBoolean(record.isUnique, "isUnique"),
    key: requiredProviderString(record.key, "key"),
    name: nullableProviderString(record.name),
    description: nullableProviderString(record.description),
    type: requiredProviderString(record.type, "type"),
    workspaceId: requiredProviderString(record.workspaceId, "workspaceId"),
    environmentId: nullableProviderString(record.environmentId),
    raw: record,
  };
}

function normalizeContact(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "formbricks contact payload must be an object", value);
  }

  return {
    id: requiredProviderString(record.id, "id"),
    createdAt: requiredProviderString(record.createdAt, "createdAt"),
    workspaceId: requiredProviderString(record.workspaceId, "workspaceId"),
    environmentId: nullableProviderString(record.environmentId),
    attributes: normalizeStringRecord(record.attributes, "attributes"),
    raw: record,
  };
}

function normalizeStringRecord(value: unknown, field: string): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `formbricks ${field} must be an object`, value);
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== "string") {
      throw new ProviderRequestError(502, `formbricks ${field}.${key} must be a string`, record);
    }
    result[key] = entry;
  }
  return result;
}

function requiredInputString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function requiredNullableInputString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  return requiredInputString(value, fieldName);
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function requiredProviderString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `formbricks ${fieldName} is missing`);
  }
  return value;
}

function requiredProviderBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `formbricks ${fieldName} is missing`);
  }
  return value;
}

function requiredProviderInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `formbricks ${fieldName} is missing`);
  }
  return value;
}

function nullableProviderString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.formbricks.com/api/v2",
  auth: { type: "api_key_header", name: "x-api-key" },
});
