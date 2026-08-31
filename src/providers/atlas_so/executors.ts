import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "atlas_so";
const atlasSoApiBaseUrl = "https://api.atlas.so";

type AtlasSoPhase = "validate" | "execute";
type AtlasSoMethod = "GET" | "POST";
type AtlasSoQueryValue = string | number | boolean | null | undefined;
type AtlasSoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

type AtlasSoListResponse<TKey extends string> = Record<TKey, Array<Record<string, unknown>>> & {
  total: number | null;
  cursor: number | null;
  limit: number | null;
  raw: Record<string, unknown>;
};

export const atlasSoActionHandlers: ProviderActionHandlers<"atlas_so", AtlasSoActionHandler> = {
  async list_accounts(input, context) {
    return normalizeAtlasSoListResponse({
      payload: await requestAtlasSoJson({
        context,
        path: "/v1/accounts",
        query: readPaginationQuery(input),
        phase: "execute",
      }),
      itemsKey: "accounts",
      label: "Atlas accounts list response",
    });
  },

  async get_account(input, context) {
    return {
      account: requireObject(
        await requestAtlasSoJson({
          context,
          path: `/v1/accounts/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
          phase: "execute",
        }),
        "Atlas account response",
      ),
    };
  },

  async upsert_account(input, context) {
    return {
      account: requireObject(
        await requestAtlasSoJson({
          context,
          path: "/v1/accounts/upsert",
          method: "POST",
          body: readAccountWriteBody(input),
          phase: "execute",
        }),
        "Atlas account upsert response",
      ),
    };
  },

  async list_customers(input, context) {
    return normalizeAtlasSoListResponse({
      payload: await requestAtlasSoJson({
        context,
        path: "/v1/customers",
        query: readPaginationQuery(input),
        phase: "execute",
      }),
      itemsKey: "customers",
      label: "Atlas customers list response",
    });
  },

  async get_customer(input, context) {
    return {
      customer: requireObject(
        await requestAtlasSoJson({
          context,
          path: `/v1/customers/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
          phase: "execute",
        }),
        "Atlas customer response",
      ),
    };
  },

  async lookup_customer(input, context) {
    return {
      customer: requireObject(
        await requestAtlasSoJson({
          context,
          path: "/v1/customers/lookup",
          method: "POST",
          body: readCustomerLookupBody(input),
          phase: "execute",
        }),
        "Atlas customer lookup response",
      ),
    };
  },

  async create_customer(input, context) {
    return {
      customer: requireObject(
        await requestAtlasSoJson({
          context,
          path: "/v1/customers",
          method: "POST",
          body: readCustomerWriteBody(input),
          phase: "execute",
        }),
        "Atlas customer create response",
      ),
    };
  },

  async update_customer(input, context) {
    const { id, ...bodyInput } = input;
    return {
      customer: requireObject(
        await requestAtlasSoJson({
          context,
          path: `/v1/customers/${encodeURIComponent(readRequiredString(id, "id"))}`,
          method: "POST",
          body: readCustomerWriteBody(bodyInput),
          phase: "execute",
        }),
        "Atlas customer update response",
      ),
    };
  },

  async upsert_customer(input, context) {
    return {
      customer: requireObject(
        await requestAtlasSoJson({
          context,
          path: "/v1/customers/upsert",
          method: "POST",
          body: readCustomerUpsertBody(input),
          phase: "execute",
        }),
        "Atlas customer upsert response",
      ),
    };
  },

  async list_sessions(input, context) {
    return normalizeAtlasSoListResponse({
      payload: await requestAtlasSoJson({
        context,
        path: "/v1/sessions",
        query: compactObject({
          ...readPaginationQuery(input),
          externalId: readOptionalStringOrNull(input.externalId),
          email: readOptionalStringOrNull(input.email),
          pageUrl: readOptionalStringOrNull(input.pageUrl),
          startedBefore: readOptionalStringOrNull(input.startedBefore),
          startedAfter: readOptionalStringOrNull(input.startedAfter),
        }),
        phase: "execute",
      }),
      itemsKey: "sessions",
      label: "Atlas sessions list response",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, atlasSoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAtlasSoJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/v1/accounts",
      query: {
        limit: 1,
      },
      phase: "validate",
    });
    const list = normalizeAtlasSoListResponse({
      payload,
      itemsKey: "accounts",
      label: "Atlas accounts validation response",
    });
    const firstAccount = optionalRecord(list.accounts?.[0]);
    const firstAccountName = optionalString(firstAccount?.name);
    const firstAccountEmail = optionalString(firstAccount?.email);

    return {
      profile: {
        displayName: firstAccountName ?? firstAccountEmail ?? "Atlas.so API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: atlasSoApiBaseUrl,
        validationEndpoint: "/v1/accounts",
        accountCount: list.total ?? (Array.isArray(list.accounts) ? list.accounts.length : 0),
        firstAccountId: optionalString(firstAccount?.id),
        firstAccountName,
        firstAccountEmail,
      }),
    };
  },
};

async function requestAtlasSoJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: AtlasSoPhase;
  method?: AtlasSoMethod;
  query?: Record<string, AtlasSoQueryValue>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildAtlasSoUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildAtlasSoHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });

    if (!response.ok) {
      const payload = await readAtlasSoErrorPayload(response);
      throw createAtlasSoError(response.status, payload, input.phase);
    }

    return await readAtlasSoPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Atlas.so request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Atlas.so request failed: ${error.message}` : "Atlas.so request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildAtlasSoUrl(path: string, query?: Record<string, AtlasSoQueryValue>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${atlasSoApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildAtlasSoHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readAtlasSoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Atlas.so returned invalid JSON");
  }
}

async function readAtlasSoErrorPayload(response: Response): Promise<unknown> {
  try {
    return await readAtlasSoPayload(response);
  } catch {
    return undefined;
  }
}

function createAtlasSoError(status: number, payload: unknown, phase: AtlasSoPhase): ProviderRequestError {
  const message = extractAtlasSoErrorMessage(payload) ?? `Atlas.so request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAtlasSoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message) ?? optionalString(record.error);
  if (directMessage) {
    return directMessage;
  }

  if (typeof record.detail === "string" && record.detail.trim() !== "") {
    return record.detail;
  }

  if (Array.isArray(record.detail)) {
    const messages = record.detail
      .map((item) => {
        const itemRecord = optionalRecord(item);
        return itemRecord ? optionalString(itemRecord.msg) : undefined;
      })
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return undefined;
}

function normalizeAtlasSoListResponse<TKey extends string>(input: {
  payload: unknown;
  itemsKey: TKey;
  label: string;
}): AtlasSoListResponse<TKey> {
  const record = requireObject(input.payload, input.label);
  return {
    [input.itemsKey]: readObjectArray(record.data, `${input.label} data`),
    total: readNullableInteger(record.total, `${input.label} total`),
    cursor: readNullableInteger(record.cursor, `${input.label} cursor`),
    limit: readNullableInteger(record.limit, `${input.label} limit`),
    raw: record,
  } as AtlasSoListResponse<TKey>;
}

function readPaginationQuery(input: Record<string, unknown>): Record<string, number> {
  return compactObject({
    cursor: readOptionalNumber(input.cursor),
    limit: readOptionalNumber(input.limit),
  }) as Record<string, number>;
}

function readAccountWriteBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: readOptionalStringOrNull(input.name),
    email: readOptionalStringOrNull(input.email),
    website: readOptionalStringOrNull(input.website),
    externalId: readOptionalStringOrNull(input.externalId),
    customFields: readOptionalObjectOrNull(input.customFields),
    primaryContactId: readOptionalStringOrNull(input.primaryContactId),
    accountManagerId: readOptionalStringOrNull(input.accountManagerId),
    secondaryAccountManagerId: readOptionalStringOrNull(input.secondaryAccountManagerId),
  });
}

function readCustomerWriteBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    firstName: readOptionalStringOrNull(input.firstName),
    lastName: readOptionalStringOrNull(input.lastName),
    email: readOptionalStringOrNull(input.email),
    phoneNumber: readOptionalStringOrNull(input.phoneNumber),
    externalUserId: readOptionalStringOrNull(input.externalUserId),
    customFields: readOptionalObjectOrNull(input.customFields),
    defaultSenders: readDefaultSenders(input.defaultSenders),
  });
}

function readCustomerUpsertBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readOptionalStringOrNull(input.id),
    userId: readOptionalStringOrNull(input.userId),
    firstName: readOptionalStringOrNull(input.firstName),
    lastName: readOptionalStringOrNull(input.lastName),
    email: readOptionalStringOrNull(input.email),
    phoneNumber: readOptionalStringOrNull(input.phoneNumber),
    customFields: readOptionalObjectOrNull(input.customFields),
    account: readOptionalObjectOrNull(input.account),
    alternatePhoneNumbers: readOptionalStringArrayOrNull(input.alternatePhoneNumbers),
    alternateEmails: readOptionalStringArrayOrNull(input.alternateEmails),
  });
}

function readCustomerLookupBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readOptionalStringOrNull(input.id),
    email: readOptionalStringOrNull(input.email),
    phoneNumber: readOptionalStringOrNull(input.phoneNumber),
    userId: readOptionalStringOrNull(input.userId),
  });
}

function readDefaultSenders(value: unknown): Record<string, unknown> | null | undefined {
  const object = readOptionalObjectOrNull(value);
  if (object === undefined || object === null) {
    return object;
  }

  return compactObject({
    sms: readOptionalStringOrNull(object.sms),
    email: readOptionalStringOrNull(object.email),
  });
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }

  return record;
}

function readObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }

  return value.map((item, index) => requireObject(item, `${label}[${index}]`));
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return value;
}

function readOptionalStringOrNull(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return typeof value === "string" ? value : undefined;
}

function readOptionalObjectOrNull(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return optionalRecord(value);
}

function readOptionalStringArrayOrNull(value: unknown): string[] | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === "string");
  return items.length === value.length ? items : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readNullableInteger(value: unknown, label: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${label} must be an integer or null`);
  }

  return value;
}
