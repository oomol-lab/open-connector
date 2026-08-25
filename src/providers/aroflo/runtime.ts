import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, readProviderJsonBody } from "../provider-runtime.ts";

export const arofloApiBaseUrl = "https://api.aroflo.com/v2";

export const arofloActionHandlers: ProviderActionHandlers<"aroflo", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_health_status(_input, context) {
    const object = await request("/healthcheck", {}, context, "execute");
    return compactObject({
      status: optionalString(object.status) ?? "unknown",
      uptime: optionalInteger(object.uptime),
      raw: object,
    });
  },
  async list_clients(input, context) {
    return normalizeCollection(
      await request("/clients", query(input, ["name"]), context, "execute"),
      normalizeClientSummary,
    );
  },
  async get_client(input, context) {
    return normalizeClientDetail(
      await request(`/clients/${encoded(input.clientId, "clientId")}`, query(input, []), context, "execute"),
    );
  },
  async list_tasks(input, context) {
    return normalizeCollection(
      await request(
        "/tasks",
        query(input, [
          "businessUnitId",
          "status",
          "assignedFilterUserId",
          "scheduledFilterUserId",
          "contractorId",
          "locationId",
          "noLocation",
          "projectId",
          "clientId",
          "assetId",
          "serviceId",
          "ownerFilterOrgId",
          "subStatusList",
          "templateId",
          "tagIds",
          "startRow",
          "userBuAccessType",
          "assignedFilter",
          "serviceList",
          "statusList",
          "priorityList",
          "clientList",
          "requiredByFrom",
          "requiredByTo",
          "sortBy",
          "ascending",
          "page",
          "limit",
        ]),
        context,
        "execute",
      ),
      normalizeTaskSummary,
    );
  },
  async get_task(input, context) {
    return normalizeTaskDetail(
      await request(`/tasks/${encoded(input.taskId, "taskId")}`, query(input, []), context, "execute"),
    );
  },
  async list_users(input, context) {
    return normalizeCollection(
      await request(
        "/users",
        query(input, [
          "orgId",
          "givenName",
          "surname",
          "billingPortalAccess",
          "assignedUsersOnly",
          "excludeDisabledStockholders",
          "includeArchived",
        ]),
        context,
        "execute",
      ),
      normalizeUserSummary,
    );
  },
  async get_user(input, context) {
    return normalizeUserDetail(
      await request(`/users/${encoded(input.userId, "userId")}`, query(input, []), context, "execute"),
    );
  },
};

export async function validateArofloCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const object = await request("/clients", { _fields: "id,name" }, { apiKey, fetcher, signal }, "validate");
  return {
    profile: { accountId: "aroflo", displayName: "AroFlo API Token" },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: arofloApiBaseUrl,
      validationEndpoint: "/clients",
      clientCount: optionalInteger(object.count),
    }),
  };
}

async function request(
  path: string,
  query: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<Record<string, unknown>> {
  const url = new URL(`${arofloApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query))
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  let response: Response;
  try {
    response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `AroFlo request failed: ${error.message}` : "AroFlo request failed",
    );
  }
  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "AroFlo returned invalid JSON",
    invalidJsonFallback: (text) => text,
  });
  if (!response.ok) {
    const object = optionalRecord(payload);
    const nested = optionalRecord(object?.error);
    const message =
      (typeof payload === "string" ? payload : undefined) ??
      optionalString(object?.error) ??
      optionalString(object?.errorcode) ??
      optionalString(object?.message) ??
      optionalString(nested?.message) ??
      `AroFlo request failed with HTTP ${response.status}`;
    const status = phase === "validate" && (response.status === 401 || response.status === 403) ? 400 : response.status;
    throw new ProviderRequestError(status, message, payload);
  }
  const object = optionalRecord(payload);
  if (!object) throw new ProviderRequestError(502, "AroFlo returned an invalid response object");
  return object;
}

function query(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const output: Record<string, unknown> = { _fields: input.fields };
  for (const key of keys) output[key] = input[key];
  return output;
}
function normalizeCollection(
  object: Record<string, unknown>,
  normalize: (value: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> {
  const items = Array.isArray(object.items) ? object.items.map((item) => normalize(requiredObject(item, "item"))) : [];
  const page = optionalRecord(object.page);
  return compactObject({
    count: optionalInteger(object.count),
    items,
    page: page
      ? compactObject({
          count: optionalInteger(page.count),
          number: optionalInteger(page.number),
          size: optionalInteger(page.size),
        })
      : undefined,
    raw: object,
  });
}
function normalizeClientSummary(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: responseString(value.id, "client.id"),
    name: optionalString(value.name) ?? "",
    individual: optionalBoolean(value.individual),
    links: optionalRecord(value._links),
    raw: value,
  });
}
function normalizeClientDetail(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ...normalizeClientSummary(value),
    shortName: nullableString(value.shortName),
    website: nullableString(value.website),
  });
}
function normalizeTaskSummary(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: responseString(value.id, "task.id"),
    name: optionalString(value.name),
    status: optionalString(value.status),
    jobNumber: nullableInteger(value.jobNumber),
    dueDate: nullableString(value.dueDate),
    client: optionalRecord(value.client),
    location: optionalRecord(value.location),
    links: optionalRecord(value._links),
    raw: value,
  });
}
function normalizeTaskDetail(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({ ...normalizeTaskSummary(value), description: nullableString(value.description) });
}
function normalizeUserSummary(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: responseString(value.id, "user.id"),
    givenName: optionalString(value.givenName),
    familyName: optionalString(value.familyName),
    email: nullableString(value.email),
    accessType: optionalString(value.accessType),
    isArchived: optionalBoolean(value.isArchived),
    businessUnit: optionalRecord(value.businessUnit),
    links: optionalRecord(value._links),
    raw: value,
  });
}
function normalizeUserDetail(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ...normalizeUserSummary(value),
    mobile: nullableString(value.mobile),
    phone: nullableString(value.phone),
    position: nullableString(value.position),
  });
}
function requiredObject(value: unknown, field: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `AroFlo returned invalid ${field}`);
  return object;
}
function responseString(value: unknown, field: string): string {
  return requiredString(value, field, (message) => new ProviderRequestError(502, message));
}
function encoded(value: unknown, field: string): string {
  return encodeURIComponent(requiredString(value, field, (message) => new ProviderRequestError(400, message)));
}
function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}
function nullableInteger(value: unknown): number | null | undefined {
  const integer = optionalInteger(value);
  if (integer !== undefined) return integer;
  const number = optionalNumber(value);
  return number !== undefined && Number.isInteger(number) ? number : value === null ? null : undefined;
}
