import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export interface SevenShiftsContext extends ApiKeyProviderContext {
  companyGuid?: string;
}

export const sevenShiftsApiBaseUrl = "https://api.7shifts.com";

type SevenShiftsRequestPhase = "validate" | "execute";
type SevenShiftsEntityKind = "company" | "location" | "department" | "role" | "user";
type SevenShiftsActionHandler = (input: Record<string, unknown>, context: SevenShiftsContext) => Promise<unknown>;

interface SevenShiftsRequestOptions {
  path: string;
  apiKey: string;
  fetcher: ProviderFetch;
  phase: SevenShiftsRequestPhase;
  actionInput: Record<string, unknown>;
  companyGuid?: string;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
}

export const sevenShiftsActionHandlers: ProviderActionHandlers<"7_shifts", SevenShiftsActionHandler> = {
  async retrieve_identity(input, context) {
    return {
      identity: normalizeIdentityResponse(
        await requestSevenShiftsJson({
          ...context,
          path: "/v2/whoami",
          actionInput: input,
          phase: "execute",
        }),
      ),
    };
  },
  async list_companies(input, context) {
    return {
      companies: normalizeEntityArray(
        await requestSevenShiftsJson({
          ...context,
          path: "/v2/companies",
          actionInput: input,
          phase: "execute",
          query: pickQuery(input, ["modified_since"]),
        }),
        "company",
      ),
    };
  },
  async get_company(input, context) {
    return {
      company: normalizeCompanyPayload(
        await requestSevenShiftsJson({
          ...context,
          path: `/v2/companies/${encodePathSegment(requireIntegerPath(input, "id"))}`,
          actionInput: input,
          phase: "execute",
        }),
      ),
    };
  },
  async list_locations(input, context) {
    const payload = await requestSevenShiftsJson({
      ...context,
      path: `/v2/company/${encodePathSegment(requireIntegerPath(input, "company_id"))}/locations`,
      actionInput: input,
      phase: "execute",
      query: pickQuery(input, ["modified_since", "deleted", "cursor", "limit"]),
    });
    return {
      locations: normalizeEntityArray(payload, "location"),
      cursor: normalizeCursor(payload),
    };
  },
  async list_departments(input, context) {
    const payload = await requestSevenShiftsJson({
      ...context,
      path: `/v2/company/${encodePathSegment(requireIntegerPath(input, "company_id"))}/departments`,
      actionInput: input,
      phase: "execute",
      query: pickQuery(input, ["modified_since", "location_id", "cursor", "limit"]),
    });
    return {
      departments: normalizeEntityArray(payload, "department"),
      cursor: normalizeCursor(payload),
    };
  },
  async list_roles(input, context) {
    const payload = await requestSevenShiftsJson({
      ...context,
      path: `/v2/company/${encodePathSegment(requireIntegerPath(input, "company_id"))}/roles`,
      actionInput: input,
      phase: "execute",
      query: pickQuery(input, ["location_id", "department_id", "ids", "modified_since", "cursor", "limit"]),
    });
    return {
      roles: normalizeEntityArray(payload, "role"),
      cursor: normalizeCursor(payload),
    };
  },
  async list_users(input, context) {
    const payload = await requestSevenShiftsJson({
      ...context,
      path: `/v2/company/${encodePathSegment(requireIntegerPath(input, "company_id"))}/users`,
      actionInput: input,
      phase: "execute",
      query: pickQuery(input, [
        "modified_since",
        "location_id",
        "department_id",
        "role_id",
        "status",
        "name",
        "sort_by",
        "cursor",
        "limit",
      ]),
    });
    return {
      users: normalizeEntityArray(payload, "user"),
      cursor: normalizeCursor(payload),
    };
  },
};

export async function validateSevenShiftsCredential(
  input: {
    apiKey: string;
    values: Record<string, string>;
  },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSevenShiftsJson({
    path: "/v2/whoami",
    apiKey: requireSevenShiftsApiKey(input.apiKey),
    companyGuid: optionalString(input.values.companyGuid),
    actionInput: {},
    fetcher,
    phase: "validate",
    signal,
  });
  const identity = normalizeIdentityResponse(payload);
  const firstUser = identity.users[0];

  return {
    profile: {
      accountId: `7_shifts:identity:${identity.identityId}`,
      displayName: buildAccountLabel(firstUser),
      grantedScopes: [],
    },
    metadata: compactObject({
      identityId: identity.identityId,
      userId: firstUser?.id,
      companyId: firstUser?.companyId,
      userEmail: firstUser?.email,
      apiBaseUrl: sevenShiftsApiBaseUrl,
    }),
  };
}

async function requestSevenShiftsJson(options: SevenShiftsRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(options.signal);

  try {
    const response = await options.fetcher(buildSevenShiftsUrl(options.path, options.query), {
      method: "GET",
      headers: buildSevenShiftsHeaders(options),
      signal: timeout.signal,
    });
    const payload = await readSevenShiftsPayload(response);

    if (!response.ok) {
      throw createSevenShiftsError(response.status, payload, options.phase);
    }
    if (payload === null) {
      throw new ProviderRequestError(502, "7shifts returned an empty response");
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "7shifts request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `7shifts request failed: ${error.message}` : "7shifts request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSevenShiftsUrl(path: string, query?: Record<string, string | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${sevenShiftsApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildSevenShiftsHeaders(options: Pick<SevenShiftsRequestOptions, "actionInput" | "apiKey" | "companyGuid">) {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.apiKey}`,
    "user-agent": providerUserAgent,
  });

  const companyGuid = optionalString(options.actionInput.companyGuid) ?? options.companyGuid;
  const apiVersion = optionalString(options.actionInput.apiVersion);
  if (companyGuid) {
    headers.set("x-company-guid", companyGuid);
  }
  if (apiVersion) {
    headers.set("x-api-version", apiVersion);
  }

  return headers;
}

async function readSevenShiftsPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "7shifts returned invalid JSON");
  }
}

function createSevenShiftsError(
  status: number,
  payload: unknown,
  phase: SevenShiftsRequestPhase,
): ProviderRequestError {
  const message = extractSevenShiftsErrorMessage(payload) ?? `7shifts request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractSevenShiftsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "detail", "title", "error_description", "error"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeIdentityResponse(payload: unknown) {
  const data = optionalRecord(requireDataWrapper(payload, "7shifts identity"));
  if (!data) {
    throw new ProviderRequestError(502, "7shifts identity payload is missing data");
  }

  const identityId = optionalInteger(data.identity_id);
  if (identityId === undefined) {
    throw new ProviderRequestError(502, "7shifts identity_id is missing");
  }

  return {
    identityId,
    users: Array.isArray(data.users) ? data.users.map((user) => normalizeIdentityUser(user)) : [],
    raw: data,
  };
}

function normalizeIdentityUser(value: unknown) {
  const user = requireObjectPayload(value, "7shifts identity user");
  return {
    id: requireIntegerField(user, "id", "7shifts identity user"),
    identityId: normalizeNullableInteger(user.identity_id),
    companyId: requireIntegerField(user, "company_id", "7shifts identity user"),
    firstName: normalizeNullableString(user.first_name),
    lastName: normalizeNullableString(user.last_name),
    email: normalizeNullableString(user.email),
    active: normalizeNullableBoolean(user.active),
    raw: user,
  };
}

function normalizeCompanyPayload(payload: unknown) {
  return normalizeEntity(requireObjectPayload(payload, "7shifts company"), "company");
}

function normalizeEntityArray(payload: unknown, kind: SevenShiftsEntityKind) {
  const data = requireDataWrapper(payload, `7shifts ${kind} list`);
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, `7shifts ${kind} list is missing data`);
  }
  return data.map((item) => normalizeEntity(requireObjectPayload(item, `7shifts ${kind}`), kind));
}

function normalizeEntity(record: Record<string, unknown>, kind: SevenShiftsEntityKind) {
  const id = requireIntegerField(record, "id", `7shifts ${kind}`);
  const name = kind === "user" ? undefined : requireStringField(record, "name", `7shifts ${kind}`);

  if (kind === "company") {
    return {
      id,
      name: name ?? "",
      status: normalizeNullableString(record.status),
      raw: record,
    };
  }
  if (kind === "user") {
    return {
      id,
      firstName: normalizeNullableString(record.first_name),
      lastName: normalizeNullableString(record.last_name),
      email: normalizeNullableString(record.email),
      active: normalizeNullableBoolean(record.active),
      raw: record,
    };
  }
  return {
    id,
    name: name ?? "",
    raw: record,
  };
}

function normalizeCursor(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  const meta = optionalRecord(payloadRecord?.meta);
  const cursor = optionalRecord(meta?.cursor);
  if (!cursor) {
    return null;
  }
  return {
    current: normalizeNullableString(cursor.current),
    prev: normalizeNullableString(cursor.prev),
    next: normalizeNullableString(cursor.next),
    count: normalizeNullableInteger(cursor.count),
  };
}

function requireDataWrapper(payload: unknown, label: string): unknown {
  const wrapper = requireObjectPayload(payload, label);
  if (!("data" in wrapper)) {
    throw new ProviderRequestError(502, `${label} is missing data`);
  }
  return wrapper.data;
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is missing or invalid`);
  }
  return record;
}

function requireIntegerPath(input: Record<string, unknown>, fieldName: string): number {
  const value = optionalInteger(input[fieldName]);
  if (value !== undefined) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an integer`);
}

function requireSevenShiftsApiKey(value: string): string {
  const apiKey = optionalString(value);
  if (apiKey) {
    return apiKey;
  }
  throw new ProviderRequestError(400, "apiKey is required");
}

function requireIntegerField(record: Record<string, unknown>, fieldName: string, label: string): number {
  const value = optionalInteger(record[fieldName]);
  if (value === undefined) {
    throw new ProviderRequestError(502, `${label} ${fieldName} is missing`);
  }
  return value;
}

function requireStringField(record: Record<string, unknown>, fieldName: string, label: string): string {
  const value = optionalString(record[fieldName]);
  if (!value) {
    throw new ProviderRequestError(502, `${label} ${fieldName} is missing`);
  }
  return value;
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(
    keys.map((key) => {
      const value = input[key];
      if (Array.isArray(value)) {
        return [key, value.map((item) => String(item)).join(",")];
      }
      if (typeof value === "boolean" || typeof value === "number") {
        return [key, String(value)];
      }
      if (typeof value === "string") {
        return [key, optionalString(value)];
      }
      return [key, undefined];
    }),
  );
}

function normalizeNullableString(value: unknown): string | null {
  return value === null ? null : (optionalString(value) ?? null);
}

function normalizeNullableInteger(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  const number = optionalInteger(value) ?? optionalNumber(value);
  return number !== undefined && Number.isInteger(number) ? number : null;
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  return value === null ? null : (optionalBoolean(value) ?? null);
}

function buildAccountLabel(user: ReturnType<typeof normalizeIdentityUser> | undefined): string {
  if (!user) {
    return "7shifts Access Token";
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || `7shifts User ${user.id}`;
}
