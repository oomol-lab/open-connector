import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const maintainxApiBaseUrl = "https://api.getmaintainx.com/v1";

const maintainxDefaultTimeoutMs = 30_000;

type MaintainxRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined;
type MaintainxActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MaintainxRequestOptions {
  apiKey: string;
  method: string;
  path: string;
  fetcher: ProviderFetch;
  phase: MaintainxRequestPhase;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  emptySuccess?: boolean;
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}

export const maintainxActionHandlers: ProviderActionHandlers<"maintainx", MaintainxActionHandler> = {
  list_work_orders(input, context) {
    return requestMaintainxJson({
      ...context,
      method: "GET",
      path: "/workorders",
      query: buildWorkOrderListQuery(input),
      headers: buildOrganizationHeaders(input),
      phase: "execute",
    });
  },
  get_work_order(input, context) {
    const workOrderId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "GET",
      path: `/workorders/${encodeURIComponent(String(workOrderId))}`,
      query: compactObject({
        expand: readOptionalArray(input.expand),
        useSequentialId: optionalBoolean(input.useSequentialId),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_work_order(input, context) {
    return requestMaintainxJson({
      ...context,
      method: "POST",
      path: "/workorders",
      query: buildSkipWebhookQuery(input),
      headers: buildOrganizationHeaders(input),
      body: pickRequestBody(input, workOrderBodyKeys),
      phase: "execute",
    });
  },
  update_work_order(input, context) {
    const workOrderId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "PATCH",
      path: `/workorders/${encodeURIComponent(String(workOrderId))}`,
      query: compactObject({
        ...buildSkipWebhookQuery(input),
        expand: readOptionalArray(input.expand),
      }),
      body: pickRequestBody(input, workOrderBodyKeys),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  update_work_order_status(input, context) {
    const workOrderId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "PATCH",
      path: `/workorders/${encodeURIComponent(String(workOrderId))}/status`,
      query: buildSkipWebhookQuery(input),
      body: {
        status: input.status,
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_work_order_comments(input, context) {
    const workOrderId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "GET",
      path: `/workorders/${encodeURIComponent(String(workOrderId))}/comments`,
      query: buildPaginationQuery(input),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_work_order_comment(input, context) {
    const workOrderId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "POST",
      path: `/workorders/${encodeURIComponent(String(workOrderId))}/comments`,
      query: buildSkipWebhookQuery(input),
      body: {
        content: input.content,
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_locations(input, context) {
    return requestMaintainxJson({
      ...context,
      method: "GET",
      path: "/locations",
      query: buildLocationListQuery(input),
      headers: buildOrganizationHeaders(input, { allowMultiple: true }),
      phase: "execute",
    });
  },
  get_location(input, context) {
    const locationId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "GET",
      path: `/locations/${encodeURIComponent(String(locationId))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_location(input, context) {
    return requestMaintainxJson({
      ...context,
      method: "POST",
      path: "/locations",
      query: buildSkipWebhookQuery(input),
      headers: buildOrganizationHeaders(input),
      body: pickRequestBody(input, locationBodyKeys),
      phase: "execute",
    });
  },
  update_location(input, context) {
    const locationId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "PATCH",
      path: `/locations/${encodeURIComponent(String(locationId))}`,
      query: buildSkipWebhookQuery(input),
      body: pickRequestBody(input, locationBodyKeys),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  delete_location(input, context) {
    const locationId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "DELETE",
      path: `/locations/${encodeURIComponent(String(locationId))}`,
      query: buildSkipWebhookQuery(input),
      phase: "execute",
      emptySuccess: true,
      notFoundAsInvalidInput: true,
    });
  },
  list_users(input, context) {
    return requestMaintainxJson({
      ...context,
      method: "GET",
      path: "/users",
      query: buildUserListQuery(input),
      headers: buildOrganizationHeaders(input),
      phase: "execute",
    });
  },
  get_user(input, context) {
    const userId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "GET",
      path: `/users/${encodeURIComponent(String(userId))}`,
      headers: buildOrganizationHeaders(input),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_user(input, context) {
    return requestMaintainxJson({
      ...context,
      method: "POST",
      path: "/users",
      query: buildSkipWebhookQuery(input),
      headers: buildOrganizationHeaders(input),
      body: pickRequestBody(input, userBodyKeys),
      phase: "execute",
    });
  },
  update_user(input, context) {
    const userId = readPositiveInteger(input.id, "id");
    return requestMaintainxJson({
      ...context,
      method: "PATCH",
      path: `/users/${encodeURIComponent(String(userId))}`,
      query: buildSkipWebhookQuery(input),
      headers: buildOrganizationHeaders(input),
      body: pickRequestBody(input, userBodyKeys),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
};

export async function validateMaintainxCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestMaintainxJson({
    apiKey,
    method: "GET",
    path: "/locations",
    query: {
      limit: 1,
    },
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "api_key",
      displayName: "MaintainX API key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: maintainxApiBaseUrl,
      validationEndpoint: "/locations",
    },
  };
}

async function requestMaintainxJson(options: MaintainxRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(options.signal, maintainxDefaultTimeoutMs);
  const url = new URL(`${maintainxApiBaseUrl}${options.path}`);
  appendQuery(url, options.query);

  const headers = compactObject({
    accept: "application/json",
    authorization: `Bearer ${options.apiKey}`,
    "user-agent": providerUserAgent,
    ...options.headers,
    ...(options.body === undefined ? {} : { "content-type": "application/json" }),
  });

  try {
    const response = await options.fetcher(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      throw mapMaintainxError(response, payload, options.phase, options.notFoundAsInvalidInput);
    }

    return options.emptySuccess ? { ok: true } : payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "MaintainX request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MaintainX request failed: ${error.message}` : "MaintainX request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function appendQuery(url: URL, query: Record<string, QueryValue> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        url.searchParams.append(key, String(child));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function buildWorkOrderListQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    ...buildPaginationQuery(input),
    title: optionalString(input.title),
    assets: readOptionalArray(input.assets),
    notAssets: readOptionalArray(input.notAssets),
    locations: readOptionalArray(input.locations),
    notLocations: readOptionalArray(input.notLocations),
    parts: readOptionalArray(input.parts),
    notParts: readOptionalArray(input.notParts),
    vendors: readOptionalArray(input.vendors),
    notVendors: readOptionalArray(input.notVendors),
    assignees: readOptionalArray(input.assignees),
    teams: readOptionalArray(input.teams),
    categories: readOptionalArray(input.categories),
    notCategories: readOptionalArray(input.notCategories),
    priorities: readOptionalArray(input.priorities),
    statuses: readOptionalArray(input.statuses),
    partStatuses: readOptionalArray(input.partStatuses),
    show_upcoming: optionalBoolean(input.showUpcoming),
    sort: optionalString(input.sort),
    expand: readOptionalArray(input.expand),
  });
}

function buildLocationListQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    ...buildPaginationQuery(input),
    name: optionalString(input.name),
    customFieldName: readOptionalArray(input.customFieldName),
    expand: readOptionalArray(input.expand),
  });
}

function buildUserListQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    ...buildPaginationQuery(input),
    onlyAssignable: optionalBoolean(input.onlyAssignable),
    email: readOptionalArray(input.email),
    expand: readOptionalArray(input.expand),
  });
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    cursor: optionalString(input.cursor),
    limit: optionalInteger(input.limit),
  });
}

function buildSkipWebhookQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    skipWebhook: optionalBoolean(input.skipWebhook),
  });
}

function buildOrganizationHeaders(
  input: Record<string, unknown>,
  options: { allowMultiple?: boolean } = {},
): Record<string, string | undefined> {
  const organizationId = optionalInteger(input.organizationId);
  const organizationIds = readOptionalArray(input.organizationIds);
  if (organizationId !== undefined && organizationIds !== undefined) {
    throw new ProviderRequestError(400, "Use either organizationId or organizationIds, not both.");
  }
  return compactObject({
    "x-organization-id": organizationId === undefined ? undefined : String(organizationId),
    "x-organization-ids": options.allowMultiple && organizationIds ? organizationIds.map(String).join(",") : undefined,
  });
}

const workOrderBodyKeys = [
  "assetId",
  "assignees",
  "estimatedTime",
  "requesterId",
  "workRequestId",
  "workOrderTemplateId",
  "categories",
  "description",
  "dueDate",
  "externalData",
  "isParent",
  "startDate",
  "locationId",
  "priority",
  "procedureTemplateId",
  "title",
  "type",
  "extraFields",
  "vendorIds",
  "partsUsed",
  "parentId",
] as const;

const locationBodyKeys = ["name", "description", "address", "barcode", "parentId", "extraFields", "vendorIds"];

const userBodyKeys = [
  "firstName",
  "lastName",
  "role",
  "customRole",
  "email",
  "phoneNumber",
  "externalData",
  "extraFields",
  "authType",
  "inviteType",
  "hourlyRate",
] as const;

function pickRequestBody(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }
  return body;
}

function readOptionalArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return numberValue;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapMaintainxError(
  response: Response,
  payload: unknown,
  phase: MaintainxRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message = (extractErrorMessage(payload) ?? response.statusText) || "MaintainX request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = errors?.[0];
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.errorMessage) ??
    (typeof firstError === "string" ? firstError : undefined)
  );
}
