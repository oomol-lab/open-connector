import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

type KintonePhase = "validate" | "execute";
type KintoneQueryValue = string | number | readonly (string | number)[];
type KintoneActionHandler = ProviderRuntimeHandler<KintoneActionContext>;

const kintoneCredentialHelpUrl =
  "https://kintone.dev/en/docs/common/user-api/overview/user-api-overview/#api-token-authentication";

interface KintoneActionContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

export const kintoneActionHandlers: ProviderActionHandlers<"kintone", KintoneActionHandler> = {
  async list_users(input, context) {
    const payload = await requestKintoneJson({
      context,
      path: "/v1/users.json",
      query: buildDirectoryListQuery(input),
      phase: "execute",
    });
    return {
      users: readObjectArray(payload, "users").map(normalizeUser),
    };
  },
  async list_departments(input, context) {
    const payload = await requestKintoneJson({
      context,
      path: "/v1/organizations.json",
      query: buildDirectoryListQuery(input),
      phase: "execute",
    });
    return {
      departments: readObjectArray(payload, "organizations").map(normalizeDepartment),
    };
  },
  async list_groups(input, context) {
    const payload = await requestKintoneJson({
      context,
      path: "/v1/groups.json",
      query: buildDirectoryListQuery(input),
      phase: "execute",
    });
    return {
      groups: readObjectArray(payload, "groups").map(normalizeGroup),
    };
  },
  async get_user_departments(input, context) {
    const payload = await requestKintoneJson({
      context,
      path: "/v1/user/organizations.json",
      query: {
        code: requiredString(input.code, "code", providerInputError),
      },
      phase: "execute",
    });
    return {
      organizationTitles: readObjectArray(payload, "organizationTitles").map(normalizeOrganizationTitle),
    };
  },
  async get_user_groups(input, context) {
    const payload = await requestKintoneJson({
      context,
      path: "/v1/user/groups.json",
      query: {
        code: requiredString(input.code, "code", providerInputError),
      },
      phase: "execute",
    });
    return {
      groups: readObjectArray(payload, "groups").map(normalizeGroup),
    };
  },
  async get_user_services(input, context) {
    const payload = await requestKintoneJson({
      context,
      path: "/v1/users/services.json",
      query: compactObject({
        codes: readOptionalStringArray(input.codes, "codes"),
        offset: optionalInteger(input.offset),
        size: optionalInteger(input.size),
      }),
      phase: "execute",
    });
    return {
      users: readObjectArray(payload, "users").map(normalizeUserServices),
    };
  },
};

export async function validateKintoneCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", providerInputError);
  const subdomain = normalizeKintoneSubdomain(input.subdomain);
  const apiBaseUrl = buildKintoneApiBaseUrl(subdomain);
  const payload = await requestKintoneJson({
    context: {
      apiKey,
      apiBaseUrl,
      fetcher,
      signal,
    },
    path: "/v1/users.json",
    query: {
      size: 1,
    },
    phase: "validate",
  });
  const users = readObjectArray(payload, "users").map(normalizeUser);
  const firstUser = users[0];
  return {
    profile: {
      accountId: `kintone:${subdomain}:${buildTokenFingerprint(apiKey)}`,
      displayName: `Kintone ${subdomain}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      subdomain,
      apiBaseUrl,
      validationEndpoint: "/v1/users.json",
      userCount: users.length,
      firstUserCode: firstUser?.code ?? undefined,
      firstUserName: firstUser?.name ?? undefined,
      credentialHelpUrl: kintoneCredentialHelpUrl,
    }),
  };
}

export function resolveKintoneApiBaseUrl(values: Record<string, string>): string {
  return buildKintoneApiBaseUrl(normalizeKintoneSubdomain(values.subdomain));
}

function normalizeKintoneSubdomain(input?: string): string {
  const subdomain = input?.trim().toLowerCase();
  if (!subdomain || !isValidKintoneSubdomain(subdomain)) {
    throw new ProviderRequestError(400, "subdomain must be a Kintone subdomain");
  }
  return subdomain;
}

function buildKintoneApiBaseUrl(subdomain: string): string {
  return `https://${subdomain}.kintone.com`;
}

async function requestKintoneJson(input: {
  context: Pick<KintoneActionContext, "apiKey" | "apiBaseUrl" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, KintoneQueryValue | undefined>;
  phase: KintonePhase;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(buildKintoneUrl(input.context.apiBaseUrl, input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readKintonePayload(response);
    if (!response.ok) {
      throw createKintoneError(response.status, payload, input.phase);
    }
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Kintone returned an invalid payload");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Kintone request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kintone request failed: ${error.message}` : "Kintone request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildKintoneUrl(
  apiBaseUrl: string,
  path: string,
  query: Record<string, KintoneQueryValue | undefined> = {},
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        url.searchParams.set(`${key}[${index}]`, String(item));
      });
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readKintonePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Kintone returned invalid JSON");
  }
}

function createKintoneError(status: number, payload: unknown, phase: KintonePhase): ProviderRequestError {
  const message = extractKintoneErrorMessage(payload) ?? `Kintone request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractKintoneErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.code);
}

function buildDirectoryListQuery(input: Record<string, unknown>): Record<string, KintoneQueryValue | undefined> {
  if (input.ids !== undefined && input.codes !== undefined) {
    throw new ProviderRequestError(400, "ids and codes cannot both be provided");
  }
  return compactObject({
    ids: readOptionalIntegerArray(input.ids, "ids"),
    codes: readOptionalStringArray(input.codes, "codes"),
    offset: optionalInteger(input.offset),
    size: optionalInteger(input.size),
  });
}

function readObjectArray(payload: Record<string, unknown>, fieldName: string): Array<Record<string, unknown>> {
  const value = payload[fieldName];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Kintone response is missing ${fieldName}`);
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `Kintone ${fieldName} item is invalid`);
    }
    return record;
  });
}

function normalizeUser(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableString(item.id),
    code: readNullableString(item.code),
    name: readNullableString(item.name),
    email: readNullableString(item.email),
    valid: optionalBoolean(item.valid) ?? null,
    raw: item,
  };
}

function normalizeDepartment(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableString(item.id),
    code: readNullableString(item.code),
    name: readNullableString(item.name),
    description: readNullableString(item.description),
    raw: item,
  };
}

function normalizeGroup(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableString(item.id),
    code: readNullableString(item.code),
    name: readNullableString(item.name),
    description: readNullableString(item.description),
    raw: item,
  };
}

function normalizeTitle(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableString(item.id),
    code: readNullableString(item.code),
    name: readNullableString(item.name),
    description: readNullableString(item.description),
    raw: item,
  };
}

function normalizeOrganizationTitle(item: Record<string, unknown>): Record<string, unknown> {
  const organization = optionalRecord(item.organization);
  if (!organization) {
    throw new ProviderRequestError(502, "Kintone organizationTitles item is missing organization");
  }
  const title = item.title === undefined || item.title === null ? null : optionalRecord(item.title);
  if (item.title !== undefined && item.title !== null && !title) {
    throw new ProviderRequestError(502, "Kintone organizationTitles item has an invalid title");
  }
  return {
    organization: normalizeDepartment(organization),
    title: title ? normalizeTitle(title) : null,
    raw: item,
  };
}

function normalizeUserServices(item: Record<string, unknown>): Record<string, unknown> {
  return {
    code: readNullableString(item.code),
    services: readStringArrayProperty(item.services, "services"),
    raw: item,
  };
}

function readNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => requiredString(item, fieldName, providerInputError));
}

function readOptionalIntegerArray(value: unknown, fieldName: string): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => {
    const parsed = optionalInteger(item);
    if (parsed === undefined || parsed <= 0) {
      throw new ProviderRequestError(400, `${fieldName} must contain positive integers`);
    }
    return parsed;
  });
}

function readStringArrayProperty(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Kintone response is missing ${fieldName}`);
  }
  return value.map((item) => {
    const text = optionalString(item);
    if (text === undefined) {
      throw new ProviderRequestError(502, `Kintone ${fieldName} item is invalid`);
    }
    return text;
  });
}

function isValidKintoneSubdomain(subdomain: string): boolean {
  if (subdomain.length > 63 || subdomain.startsWith("-") || subdomain.endsWith("-")) {
    return false;
  }
  for (const char of subdomain) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (!isDigit && !isLowercaseLetter && char !== "-") {
      return false;
    }
  }
  return true;
}

function buildTokenFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}
