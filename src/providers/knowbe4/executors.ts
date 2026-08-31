import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "knowbe4";
const knowbe4ReportingValidationPath = "/v1/account";
const knowbe4DefaultRegion = "us";

const knowbe4RegionBaseUrls = {
  us: "https://us.api.knowbe4.com",
  eu: "https://eu.api.knowbe4.com",
  ca: "https://ca.api.knowbe4.com",
  uk: "https://uk.api.knowbe4.com",
  de: "https://de.api.knowbe4.com",
} as const;

type Knowbe4Region = keyof typeof knowbe4RegionBaseUrls;
type Knowbe4RequestMode = "validate" | "execute";
type Knowbe4ActionHandler = (input: Record<string, unknown>, context: Knowbe4ActionContext) => Promise<unknown>;

interface Knowbe4ActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface Knowbe4RequestInput extends Knowbe4ActionContext {
  path: string;
  mode: Knowbe4RequestMode;
  query?: Record<string, string | undefined>;
}

export const knowbe4ActionHandlers: ProviderActionHandlers<"knowbe4", Knowbe4ActionHandler> = {
  async get_account(_input, context): Promise<unknown> {
    const account = requireObjectPayload(
      await requestKnowbe4Json({
        ...context,
        path: knowbe4ReportingValidationPath,
        mode: "execute",
      }),
      "KnowBe4 account response",
    );
    return {
      account: normalizeAccount(account),
      raw: account,
    };
  },
  async list_users(input, context): Promise<unknown> {
    const response = await requestKnowbe4JsonWithResponse({
      ...context,
      path: "/v1/users",
      mode: "execute",
      query: compactObject({
        status: optionalString(input.status),
        group_id: optionalIntegerString(input.groupId),
        expand: input.expandGroups === true ? "group" : undefined,
        per_page: optionalIntegerString(input.perPage),
        cursor: optionalString(input.cursor),
      }),
    });
    const users = requireArrayPayload(response.payload, "KnowBe4 users response");
    return {
      users: users.map((user) => normalizeUser(requireObjectPayload(user, "KnowBe4 user object"))),
      pagination: buildPagination(response.response, input),
      raw: response.payload,
    };
  },
  async get_user(input, context): Promise<unknown> {
    const userId = requireIntegerPathValue(input.userId, "userId");
    const user = requireObjectPayload(
      await requestKnowbe4Json({
        ...context,
        path: `/v1/users/${userId}`,
        mode: "execute",
      }),
      "KnowBe4 user response",
    );
    return {
      user: normalizeUser(user),
      raw: user,
    };
  },
  async list_groups(input, context): Promise<unknown> {
    const response = await requestKnowbe4JsonWithResponse({
      ...context,
      path: "/v1/groups",
      mode: "execute",
      query: compactObject({
        status: optionalString(input.status),
        per_page: optionalIntegerString(input.perPage),
        cursor: optionalString(input.cursor),
      }),
    });
    const groups = requireArrayPayload(response.payload, "KnowBe4 groups response");
    return {
      groups: groups.map((group) => normalizeGroup(requireObjectPayload(group, "KnowBe4 group object"))),
      pagination: buildPagination(response.response, input),
      raw: response.payload,
    };
  },
  async get_group(input, context): Promise<unknown> {
    const groupId = requireIntegerPathValue(input.groupId, "groupId");
    const group = requireObjectPayload(
      await requestKnowbe4Json({
        ...context,
        path: `/v1/groups/${groupId}`,
        mode: "execute",
      }),
      "KnowBe4 group response",
    );
    return {
      group: normalizeGroup(group),
      raw: group,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Knowbe4ActionContext>({
  service,
  handlers: knowbe4ActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<Knowbe4ActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveKnowbe4BaseUrl(credential.metadata, credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKnowbe4Credential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateKnowbe4Credential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<CredentialValidationResult> {
  const region = normalizeKnowbe4Region(values.region);
  const baseUrl = knowbe4RegionBaseUrls[region];
  const account = requireObjectPayload(
    await requestKnowbe4Json({
      path: knowbe4ReportingValidationPath,
      apiKey,
      baseUrl,
      fetcher,
      signal,
      mode: "validate",
    }),
    "KnowBe4 account response",
  );
  const normalizedAccount = normalizeAccount(account);
  const domain = normalizedAccount.domains[0];
  const displayName = optionalString(normalizedAccount.name) ?? domain ?? "KnowBe4 Reporting API Key";

  return {
    profile: {
      accountId: domain ?? displayName,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      region,
      apiBaseUrl: baseUrl,
      accountName: normalizedAccount.name,
      primaryDomain: domain,
      validationEndpoint: knowbe4ReportingValidationPath,
    }),
  };
}

async function requestKnowbe4Json(input: Knowbe4RequestInput): Promise<unknown> {
  return (await requestKnowbe4JsonWithResponse(input)).payload;
}

async function requestKnowbe4JsonWithResponse(
  input: Knowbe4RequestInput,
): Promise<{ payload: unknown; response: Response }> {
  const url = new URL(input.path, `${input.baseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readKnowbe4Payload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "KnowBe4 request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `KnowBe4 request failed: ${error.message}` : "KnowBe4 request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createKnowbe4Error(response, payload, input.mode);
  }

  return { payload, response };
}

async function readKnowbe4Payload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "KnowBe4 returned invalid JSON");
  }
}

function createKnowbe4Error(response: Response, payload: unknown, mode: Knowbe4RequestMode): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `KnowBe4 request failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const direct =
    optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.error_description);
  if (direct) {
    return direct;
  }
  const errors = object.errors;
  if (Array.isArray(errors)) {
    const first = errors[0];
    if (typeof first === "string") {
      return first;
    }
    const firstObject = optionalRecord(first);
    return firstObject ? (optionalString(firstObject.message) ?? optionalString(firstObject.error)) : undefined;
  }
  return undefined;
}

function normalizeAccount(account: Record<string, unknown>): Record<string, unknown> & { domains: string[] } {
  return {
    ...account,
    name: optionalString(account.name) ?? null,
    domains: readStringArray(account.domains),
    subscriptionLevel: optionalString(account.subscription_level) ?? null,
    subscriptionEndDate: optionalString(account.subscription_end_date) ?? null,
    numberOfSeats: optionalInteger(account.number_of_seats) ?? null,
    currentRiskScore: optionalNumber(account.current_risk_score) ?? null,
    raw: account,
  };
}

function normalizeUser(user: Record<string, unknown>): Record<string, unknown> {
  return {
    ...user,
    id: optionalInteger(user.id) ?? null,
    email: optionalString(user.email) ?? null,
    firstName: optionalString(user.first_name) ?? null,
    lastName: optionalString(user.last_name) ?? null,
    jobTitle: optionalString(user.job_title) ?? null,
    status: optionalString(user.status) ?? null,
    groups: readIntegerArray(user.groups),
    currentRiskScore: optionalNumber(user.current_risk_score) ?? null,
    raw: user,
  };
}

function normalizeGroup(group: Record<string, unknown>): Record<string, unknown> {
  return {
    ...group,
    id: optionalInteger(group.id) ?? null,
    name: optionalString(group.name) ?? null,
    groupType: optionalString(group.group_type) ?? null,
    memberCount: optionalInteger(group.member_count) ?? null,
    status: optionalString(group.status) ?? null,
    currentRiskScore: optionalNumber(group.current_risk_score) ?? null,
    raw: group,
  };
}

function buildPagination(response: Response, input: Record<string, unknown>): Record<string, unknown> {
  return {
    requestCursor: optionalString(input.cursor) ?? null,
    requestPerPage: optionalInteger(input.perPage) ?? null,
    nextCursor:
      response.headers.get("x-next-cursor") ??
      response.headers.get("next-cursor") ??
      response.headers.get("x-cursor-next") ??
      null,
    requestId: response.headers.get("x-request-id") ?? null,
  };
}

function resolveKnowbe4BaseUrl(metadata: Record<string, unknown>, values: Record<string, string>): string {
  const metadataBaseUrl = optionalString(metadata.apiBaseUrl);
  if (metadataBaseUrl && isOfficialKnowbe4BaseUrl(metadataBaseUrl)) {
    return metadataBaseUrl;
  }
  return knowbe4RegionBaseUrls[normalizeKnowbe4Region(metadata.region ?? values.region)];
}

function normalizeKnowbe4Region(value: unknown): Knowbe4Region {
  if (typeof value !== "string" || value.trim() === "") {
    return knowbe4DefaultRegion;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "us" || normalized === "eu" || normalized === "ca" || normalized === "uk" || normalized === "de") {
    return normalized;
  }

  throw new ProviderRequestError(400, "knowbe4 region must be one of: us, eu, ca, uk, de");
}

function isOfficialKnowbe4BaseUrl(value: string): boolean {
  return Object.values(knowbe4RegionBaseUrls).some((baseUrl) => baseUrl === value);
}

function requireIntegerPathValue(value: unknown, fieldName: string): string {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(value);
}

function requireObjectPayload(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  }
  return object;
}

function requireArrayPayload(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`, value);
  }
  return value;
}

function optionalIntegerString(value: unknown): string | undefined {
  return Number.isInteger(value) ? String(value) : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item !== "");
}

function readIntegerArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item)) : [];
}
