import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FolkActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  stringArray,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { folkCompanyMutableKeys, folkPersonMutableKeys } from "./actions.ts";

const service = "folk";
const folkApiBaseUrl = "https://api.folk.app";
const folkCurrentUserPath = "/v1/users/me";
const folkDefaultRequestTimeoutMs = 30_000;

type FolkPhase = "validate" | "execute";
type FolkActionContext = ApiKeyProviderContext;
type FolkActionHandler = (input: Record<string, unknown>, context: FolkActionContext) => Promise<unknown>;

interface FolkRequestInput {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  phase: FolkPhase;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export const folkActionHandlers: Record<FolkActionName, FolkActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestFolkJson(context, {
      path: folkCurrentUserPath,
      method: "GET",
      phase: "execute",
    });

    return {
      user: normalizeUser(requireDataRecord(payload, "current user")),
    };
  },
  async list_users(input, context) {
    const payload = await requestFolkJson(context, {
      path: "/v1/users",
      method: "GET",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
      },
    });

    return normalizeListOutput(requireDataRecord(payload, "users"), normalizeUser, "users");
  },
  async get_user(input, context) {
    const payload = await requestFolkJson(context, {
      path: `/v1/users/${encodeURIComponent(readInputString(input.userId, "userId"))}`,
      method: "GET",
      phase: "execute",
    });

    return {
      user: normalizeUser(requireDataRecord(payload, "user")),
    };
  },
  async list_groups(input, context) {
    const payload = await requestFolkJson(context, {
      path: "/v1/groups",
      method: "GET",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
      },
    });

    return normalizeListOutput(requireDataRecord(payload, "groups"), normalizeGroup, "groups");
  },
  async list_group_custom_fields(input, context) {
    const payload = await requestFolkJson(context, {
      path: `/v1/groups/${encodeURIComponent(readInputString(input.groupId, "groupId"))}/custom-fields/${encodeURIComponent(readInputString(input.entityType, "entityType"))}`,
      method: "GET",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
      },
    });

    return normalizeListOutput(
      requireDataRecord(payload, "group custom fields"),
      normalizeGroupCustomField,
      "customFields",
    );
  },
  async list_people(input, context) {
    const payload = await requestFolkJson(context, {
      path: "/v1/people",
      method: "GET",
      phase: "execute",
      query: buildListQuery(input),
    });

    return normalizeListOutput(requireDataRecord(payload, "people"), normalizePerson, "people");
  },
  async get_person(input, context) {
    const payload = await requestFolkJson(context, {
      path: `/v1/people/${encodeURIComponent(readInputString(input.personId, "personId"))}`,
      method: "GET",
      phase: "execute",
    });

    return {
      person: normalizePerson(requireDataRecord(payload, "person")),
    };
  },
  async create_person(input, context) {
    const payload = await requestFolkJson(context, {
      path: "/v1/people",
      method: "POST",
      phase: "execute",
      body: buildPersonBody(input),
    });

    return {
      person: normalizePerson(requireDataRecord(payload, "person")),
    };
  },
  async update_person(input, context) {
    assertMutableFieldPresent(
      input,
      "personId",
      folkPersonMutableKeys,
      "At least one mutable person field is required.",
    );
    const payload = await requestFolkJson(context, {
      path: `/v1/people/${encodeURIComponent(readInputString(input.personId, "personId"))}`,
      method: "PATCH",
      phase: "execute",
      body: buildPersonBody(input),
    });

    return {
      person: normalizePerson(requireDataRecord(payload, "person")),
    };
  },
  async delete_person(input, context) {
    const payload = await requestFolkJson(context, {
      path: `/v1/people/${encodeURIComponent(readInputString(input.personId, "personId"))}`,
      method: "DELETE",
      phase: "execute",
    });

    const data = requireDataRecord(payload, "deleted person");
    return {
      id: readRequiredProviderString(data.id, "id"),
    };
  },
  async list_companies(input, context) {
    const payload = await requestFolkJson(context, {
      path: "/v1/companies",
      method: "GET",
      phase: "execute",
      query: buildListQuery(input),
    });

    return normalizeListOutput(requireDataRecord(payload, "companies"), normalizeCompany, "companies");
  },
  async get_company(input, context) {
    const payload = await requestFolkJson(context, {
      path: `/v1/companies/${encodeURIComponent(readInputString(input.companyId, "companyId"))}`,
      method: "GET",
      phase: "execute",
    });

    return {
      company: normalizeCompany(requireDataRecord(payload, "company")),
    };
  },
  async create_company(input, context) {
    const payload = await requestFolkJson(context, {
      path: "/v1/companies",
      method: "POST",
      phase: "execute",
      body: buildCompanyBody(input),
    });

    return {
      company: normalizeCompany(requireDataRecord(payload, "company")),
    };
  },
  async update_company(input, context) {
    assertMutableFieldPresent(
      input,
      "companyId",
      folkCompanyMutableKeys,
      "At least one mutable company field is required.",
    );
    const payload = await requestFolkJson(context, {
      path: `/v1/companies/${encodeURIComponent(readInputString(input.companyId, "companyId"))}`,
      method: "PATCH",
      phase: "execute",
      body: buildCompanyBody(input),
    });

    return {
      company: normalizeCompany(requireDataRecord(payload, "company")),
    };
  },
  async delete_company(input, context) {
    const payload = await requestFolkJson(context, {
      path: `/v1/companies/${encodeURIComponent(readInputString(input.companyId, "companyId"))}`,
      method: "DELETE",
      phase: "execute",
    });

    const data = requireDataRecord(payload, "deleted company");
    return {
      id: readRequiredProviderString(data.id, "id"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, folkActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestFolkJson(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: folkCurrentUserPath,
        method: "GET",
        phase: "validate",
      },
    );

    const user = normalizeUser(requireDataRecord(payload, "current user"));
    return {
      profile: {
        accountId: user.id,
        displayName: user.email || user.fullName || "Folk API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: folkApiBaseUrl,
        validationEndpoint: folkCurrentUserPath,
        userId: user.id,
        email: user.email,
      }),
    };
  },
};

async function requestFolkJson(context: FolkActionContext, input: FolkRequestInput): Promise<Record<string, unknown>> {
  const timeoutSignal = AbortSignal.timeout(folkDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await context.fetcher(buildFolkUrl(input.path, input.query ?? {}), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });

    const payload = await readFolkPayload(response);
    if (!response.ok) {
      throw buildFolkError(response.status, payload, input.phase);
    }

    return requireRecord(payload, "response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "Folk request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Folk request failed: ${error.message}` : "Folk request failed",
      error,
    );
  }
}

function buildFolkUrl(path: string, query: Record<string, unknown>): URL {
  const url = new URL(path, folkApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    appendQueryParam(url.searchParams, [key], value);
  }
  return url;
}

function appendQueryParam(searchParams: URLSearchParams, path: string[], value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryParam(searchParams, path, item);
    }
    return;
  }
  if (typeof value === "object") {
    const record = optionalRecord(value);
    if (!record) {
      return;
    }
    for (const [childKey, childValue] of Object.entries(record)) {
      appendQueryParam(searchParams, [...path, childKey], childValue);
    }
    return;
  }

  const key = path.map((part, index) => (index === 0 ? part : `[${part}]`)).join("");
  const lastPart = path[path.length - 1];
  if (typeof value === "boolean" && (lastPart === "empty" || lastPart === "not_empty")) {
    if (value) {
      searchParams.append(key, "");
    }
    return;
  }

  searchParams.append(key, String(value));
}

async function readFolkPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Folk returned invalid JSON");
  }
}

function buildFolkError(status: number, payload: unknown, phase: FolkPhase): ProviderRequestError {
  const errorRecord = optionalRecord(payload);
  const errorBody = errorRecord ? optionalRecord(errorRecord.error) : undefined;
  const message = optionalString(errorBody?.message) ?? optionalString(errorRecord?.message) ?? "Folk request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 403 || status === 422)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(409, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
    combinator: optionalString(input.combinator),
    filter: optionalRecord(input.filter),
  });
}

function buildPersonBody(input: Record<string, unknown>): Record<string, unknown> {
  const birthday = readNullableString(input.birthday);

  return compactObject({
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
    fullName: optionalString(input.fullName),
    description: optionalRawString(input.description),
    birthday: birthday === null && input.birthday === undefined ? undefined : birthday,
    jobTitle: optionalRawString(input.jobTitle),
    groups: readOptionalObjectArray(input.groups),
    companies: readOptionalObjectArray(input.companies),
    addresses: readOptionalStringArray(input.addresses),
    emails: readOptionalStringArray(input.emails),
    phones: readOptionalStringArray(input.phones),
    urls: readOptionalStringArray(input.urls),
    customFieldValues: optionalRecord(input.customFieldValues),
  });
}

function buildCompanyBody(input: Record<string, unknown>): Record<string, unknown> {
  const lastFundingDate = readNullableString(input.lastFundingDate);
  const industry = readNullableString(input.industry);
  const employeeRange = readNullableString(input.employeeRange);

  return compactObject({
    name: optionalString(input.name),
    description: optionalRawString(input.description),
    fundingRaised: readNullableNumberish(input.fundingRaised),
    lastFundingDate: lastFundingDate === null && input.lastFundingDate === undefined ? undefined : lastFundingDate,
    industry: industry === null && input.industry === undefined ? undefined : industry,
    foundationYear: readNullableNumberish(input.foundationYear),
    employeeRange: employeeRange === null && input.employeeRange === undefined ? undefined : employeeRange,
    groups: readOptionalObjectArray(input.groups),
    addresses: readOptionalStringArray(input.addresses),
    emails: readOptionalStringArray(input.emails),
    phones: readOptionalStringArray(input.phones),
    urls: readOptionalStringArray(input.urls),
    customFieldValues: optionalRecord(input.customFieldValues),
  });
}

function normalizeListOutput<T>(
  data: Record<string, unknown>,
  normalizeItem: (value: Record<string, unknown>) => T,
  itemKey: string,
): Record<string, unknown> {
  const items = Array.isArray(data.items) ? data.items.map((item) => normalizeItem(requireRecord(item, itemKey))) : [];

  return {
    [itemKey]: items,
    pagination: normalizePagination(data.pagination),
  };
}

function normalizePagination(value: unknown): Record<string, string | null> {
  const pagination = optionalRecord(value);
  const nextLink = optionalString(pagination?.nextLink) ?? null;
  return {
    nextLink,
    nextCursor: extractCursor(nextLink),
  };
}

function normalizeUser(value: Record<string, unknown>): { id: string; fullName: string; email: string } {
  return {
    id: readRequiredProviderString(value.id, "id"),
    fullName: optionalString(value.fullName) ?? "",
    email: optionalString(value.email) ?? "",
  };
}

function normalizeGroup(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredProviderString(value.id, "id"),
    name: optionalString(value.name) ?? "",
  };
}

function normalizeGroupCustomField(value: Record<string, unknown>): Record<string, unknown> {
  return {
    name: optionalString(value.name) ?? "",
    type: optionalString(value.type) ?? "",
    options: normalizeGroupCustomFieldOptions(value.options),
    config: normalizeGroupCustomFieldConfig(value.config),
  };
}

function normalizePerson(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredProviderString(value.id, "id"),
    firstName: optionalString(value.firstName) ?? "",
    lastName: optionalString(value.lastName) ?? "",
    fullName: optionalString(value.fullName) ?? "",
    description: optionalString(value.description) ?? "",
    birthday: readNullableString(value.birthday),
    jobTitle: optionalString(value.jobTitle) ?? "",
    createdAt: readNullableString(value.createdAt),
    createdBy: normalizeNullableUser(value.createdBy),
    groups: normalizeGroupList(value.groups),
    companies: normalizeCompanyReferenceList(value.companies),
    addresses: readStringArrayOrEmpty(value.addresses),
    emails: readStringArrayOrEmpty(value.emails),
    phones: readStringArrayOrEmpty(value.phones),
    urls: readStringArrayOrEmpty(value.urls),
    customFieldValues: optionalRecord(value.customFieldValues) ?? {},
    interactionMetadata: normalizeInteractionMetadata(value.interactionMetadata),
    strongestConnection: normalizeStrongestConnection(value.strongestConnection),
  };
}

function normalizeCompany(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredProviderString(value.id, "id"),
    name: optionalString(value.name) ?? "",
    description: optionalString(value.description) ?? "",
    fundingRaised: readNullableStringLike(value.fundingRaised),
    lastFundingDate: readNullableString(value.lastFundingDate),
    industry: readNullableString(value.industry),
    foundationYear: readNullableStringLike(value.foundationYear),
    employeeRange: readNullableString(value.employeeRange),
    groups: normalizeGroupList(value.groups),
    addresses: readStringArrayOrEmpty(value.addresses),
    emails: readStringArrayOrEmpty(value.emails),
    phones: readStringArrayOrEmpty(value.phones),
    urls: readStringArrayOrEmpty(value.urls),
    createdAt: readNullableString(value.createdAt),
    createdBy: normalizeNullableUser(value.createdBy),
    customFieldValues: optionalRecord(value.customFieldValues) ?? {},
  };
}

function normalizeInteractionMetadata(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  const userRecord = optionalRecord(record.user);
  const workspaceRecord = optionalRecord(record.workspace);
  if (!userRecord || !workspaceRecord) {
    return null;
  }

  return {
    user: {
      approximateCount: optionalInteger(userRecord.approximateCount) ?? 0,
      lastInteractedAt: readNullableString(userRecord.lastInteractedAt),
    },
    workspace: {
      approximateCount: optionalInteger(workspaceRecord.approximateCount) ?? 0,
      lastInteractedAt: readNullableString(workspaceRecord.lastInteractedAt),
      lastInteractedBy: normalizeUserList(workspaceRecord.lastInteractedBy),
    },
  };
}

function normalizeStrongestConnection(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).flatMap(([key, child]) => {
      const childRecord = optionalRecord(child);
      return childRecord ? [[key, normalizeUser(childRecord)]] : [];
    }),
  );
}

function normalizeGroupCustomFieldOptions(value: unknown): Array<Record<string, string>> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((option) => {
    const record = optionalRecord(option);
    return record
      ? [
          {
            label: optionalString(record.label) ?? "",
            color: optionalString(record.color) ?? "",
          },
        ]
      : [];
  });
}

function normalizeGroupCustomFieldConfig(value: unknown): Record<string, string> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    format: optionalString(record.format) ?? "",
    currency: optionalString(record.currency) ?? "",
  };
}

function normalizeGroupList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeGroup(requireRecord(item, "group")));
}

function normalizeUserList(value: unknown): ReturnType<typeof normalizeUser>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeUser(requireRecord(item, "user")));
}

function normalizeCompanyReferenceList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = requireRecord(item, "company");
    return {
      id: readRequiredProviderString(record.id, "id"),
      name: optionalString(record.name) ?? "",
    };
  });
}

function normalizeNullableUser(value: unknown): ReturnType<typeof normalizeUser> | null {
  const record = optionalRecord(value);
  return record ? normalizeUser(record) : null;
}

function requireDataRecord(payload: Record<string, unknown>, label: string): Record<string, unknown> {
  return requireRecord(payload.data, label);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Folk returned an invalid ${label} payload`);
  }

  return record;
}

function readRequiredProviderString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `Folk returned an invalid ${fieldName}`);
  }
  return stringValue;
}

function readInputString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return optionalString(value) ?? null;
}

function readNullableStringLike(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return String(value);
  }

  return optionalString(value) ?? null;
}

function readNullableNumberish(value: unknown): string | number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return undefined;
}

function readStringArrayOrEmpty(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return stringArray(value, "array item", (message) => new ProviderRequestError(502, message));
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readStringArrayOrEmpty(value);
}

function readOptionalObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return objectArray(value, "array item", (message) => new ProviderRequestError(400, message));
}

function extractCursor(nextLink: string | null): string | null {
  if (!nextLink) {
    return null;
  }

  try {
    return new URL(nextLink).searchParams.get("cursor");
  } catch {
    return null;
  }
}

function assertMutableFieldPresent(
  input: Record<string, unknown>,
  idFieldName: string,
  mutableKeys: readonly string[],
  message: string,
): void {
  for (const key of mutableKeys) {
    if (key !== idFieldName && Object.hasOwn(input, key)) {
      return;
    }
  }

  throw new ProviderRequestError(400, message);
}

function optionalRawString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isAbortError(error: unknown): boolean {
  const errorRecord = optionalRecord(error);
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError" || optionalBoolean(errorRecord?.aborted) === true)
  );
}
