import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

type SageSalesManagementPhase = "validate" | "execute";
interface SageSalesManagementCredentials {
  publicApiKey: string;
  privateApiKey: string;
}

export interface SageSalesManagementActionContext {
  fetcher: ProviderFetch;
  sessionKey: string;
  signal?: AbortSignal;
}

type SageSalesManagementActionHandler = ProviderRuntimeHandler<SageSalesManagementActionContext>;

type ResourceConfig = {
  resourcePath: string;
  listOutputKey: "accounts" | "contacts" | "opportunities";
  recordOutputKey: "account" | "contact" | "opportunity";
};

export const sageSalesManagementApiBaseUrl = "https://api.forcemanager.com/api/v4";

const requestTimeoutMs = 30_000;

const accountsConfig = {
  resourcePath: "accounts",
  listOutputKey: "accounts",
  recordOutputKey: "account",
} as const satisfies ResourceConfig;

const contactsConfig = {
  resourcePath: "contacts",
  listOutputKey: "contacts",
  recordOutputKey: "contact",
} as const satisfies ResourceConfig;

const opportunitiesConfig = {
  resourcePath: "opportunities",
  listOutputKey: "opportunities",
  recordOutputKey: "opportunity",
} as const satisfies ResourceConfig;

export const sageSalesManagementActionHandlers: ProviderActionHandlers<
  "sage_sales_management",
  SageSalesManagementActionHandler
> = {
  get_accounts_schema(input, context) {
    return executeGetSchema(accountsConfig, input, context);
  },
  list_accounts(input, context) {
    return executeListResource(accountsConfig, input, context);
  },
  get_account(input, context) {
    return executeGetResource(accountsConfig, input, context);
  },
  create_account(input, context) {
    return executeCreateResource(accountsConfig, input, context);
  },
  update_account(input, context) {
    return executeUpdateResource(accountsConfig, input, context);
  },
  delete_account(input, context) {
    return executeDeleteResource(accountsConfig, input, context);
  },
  get_contacts_schema(input, context) {
    return executeGetSchema(contactsConfig, input, context);
  },
  list_contacts(input, context) {
    return executeListResource(contactsConfig, input, context);
  },
  get_contact(input, context) {
    return executeGetResource(contactsConfig, input, context);
  },
  create_contact(input, context) {
    return executeCreateResource(contactsConfig, input, context);
  },
  update_contact(input, context) {
    return executeUpdateResource(contactsConfig, input, context);
  },
  delete_contact(input, context) {
    return executeDeleteResource(contactsConfig, input, context);
  },
  get_opportunities_schema(input, context) {
    return executeGetSchema(opportunitiesConfig, input, context);
  },
  list_opportunities(input, context) {
    return executeListResource(opportunitiesConfig, input, context);
  },
  get_opportunity(input, context) {
    return executeGetResource(opportunitiesConfig, input, context);
  },
  create_opportunity(input, context) {
    return executeCreateResource(opportunitiesConfig, input, context);
  },
  update_opportunity(input, context) {
    return executeUpdateResource(opportunitiesConfig, input, context);
  },
  delete_opportunity(input, context) {
    return executeDeleteResource(opportunitiesConfig, input, context);
  },
};

export async function validateSageSalesManagementCredential(
  input: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const sessionKey = await loginSageSalesManagement(readCredentials(input), fetcher, "validate", signal);
  const payload = await requestSageSalesManagementJson({
    method: "GET",
    path: "/users",
    fetcher,
    phase: "validate",
    sessionKey,
    signal,
  });
  const user = readFirstObject(payload);
  const userId = readId(user);
  const userEmail = pickString(user, "email", "mail");
  const accountLabel =
    userEmail ?? joinName(pickString(user, "firstName", "first_name"), pickString(user, "lastName", "last_name"));

  return {
    profile: {
      accountId: userId === undefined ? "sage-sales-management-account" : String(userId),
      displayName: accountLabel ?? "Sage Sales Management Account",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: sageSalesManagementApiBaseUrl,
      validationEndpoint: "/users",
      userId,
      userEmail,
    }),
  };
}

export async function createSageSalesManagementActionContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<SageSalesManagementActionContext> {
  const sessionKey = await loginSageSalesManagement(readCredentials(values), fetcher, "execute", signal);
  return {
    fetcher,
    sessionKey,
    signal,
  };
}

async function executeGetSchema(
  config: ResourceConfig,
  _input: Record<string, unknown>,
  context: SageSalesManagementActionContext,
) {
  const payload = await requestResourceJson({
    method: "GET",
    path: `/${config.resourcePath}/schema`,
    context,
  });

  return {
    schema: readObjectPayload(payload, "schema"),
    raw: payload,
  };
}

async function executeListResource(
  config: ResourceConfig,
  input: Record<string, unknown>,
  context: SageSalesManagementActionContext,
) {
  const payload = await requestResourceJson({
    method: "GET",
    path: `/${config.resourcePath}`,
    context,
    query: compactStringOrNumberRecord({
      page: readOptionalInteger(input.page),
      where: readOptionalString(input.where),
      order: readOptionalString(input.order),
      lang: readOptionalString(input.lang),
    }),
    extraHeaders: compactStringRecord({
      count: readOptionalHeaderInteger(input.count),
      extrafielddescription: readOptionalExtraFieldDescription(input.extraFieldDescription),
    }),
  });

  return {
    [config.listOutputKey]: readListPayload(payload, config.listOutputKey),
    raw: payload,
  };
}

async function executeGetResource(
  config: ResourceConfig,
  input: Record<string, unknown>,
  context: SageSalesManagementActionContext,
) {
  const payload = await requestResourceJson({
    method: "GET",
    path: `/${config.resourcePath}/${readRequiredId(input.id)}`,
    context,
  });

  return {
    [config.recordOutputKey]: readRecordPayload(payload, config.recordOutputKey),
    raw: payload,
  };
}

async function executeCreateResource(
  config: ResourceConfig,
  input: Record<string, unknown>,
  context: SageSalesManagementActionContext,
) {
  const payload = await requestResourceJson({
    method: "POST",
    path: `/${config.resourcePath}`,
    context,
    body: readBodyData(input.data),
  });

  return {
    [config.recordOutputKey]: readRecordPayload(payload, config.recordOutputKey),
    raw: payload,
  };
}

async function executeUpdateResource(
  config: ResourceConfig,
  input: Record<string, unknown>,
  context: SageSalesManagementActionContext,
) {
  const payload = await requestResourceJson({
    method: "PUT",
    path: `/${config.resourcePath}/${readRequiredId(input.id)}`,
    context,
    body: readBodyData(input.data),
  });

  return {
    [config.recordOutputKey]: readRecordPayload(payload, config.recordOutputKey),
    raw: payload,
  };
}

async function executeDeleteResource(
  config: ResourceConfig,
  input: Record<string, unknown>,
  context: SageSalesManagementActionContext,
) {
  const result = await requestResourceJsonWithStatus({
    method: "DELETE",
    path: `/${config.resourcePath}/${readRequiredId(input.id)}`,
    context,
  });

  return {
    ok: true,
    status: result.status,
    raw: result.payload,
  };
}

async function loginSageSalesManagement(
  credentials: SageSalesManagementCredentials,
  fetcher: ProviderFetch,
  phase: SageSalesManagementPhase,
  signal?: AbortSignal,
): Promise<string> {
  const payload = await requestSageSalesManagementJson({
    method: "POST",
    path: "/login",
    fetcher,
    phase,
    signal,
    body: {
      username: credentials.publicApiKey,
      password: credentials.privateApiKey,
    },
  });
  const token = optionalString(optionalRecord(payload)?.token)?.trim();
  if (!token) {
    throw new ProviderRequestError(502, "Sage Sales Management login response missing token", payload);
  }

  return token;
}

async function requestResourceJson(input: {
  method: "GET" | "POST" | "PUT";
  path: string;
  context: SageSalesManagementActionContext;
  query?: Record<string, string | number>;
  extraHeaders?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  return requestSageSalesManagementJson({
    ...input,
    fetcher: input.context.fetcher,
    phase: "execute",
    sessionKey: input.context.sessionKey,
  });
}

async function requestResourceJsonWithStatus(input: {
  method: "DELETE";
  path: string;
  context: SageSalesManagementActionContext;
}) {
  return requestSageSalesManagementJsonWithStatus({
    method: input.method,
    path: input.path,
    fetcher: input.context.fetcher,
    phase: "execute",
    sessionKey: input.context.sessionKey,
  });
}

async function requestSageSalesManagementJson(input: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  fetcher: ProviderFetch;
  phase: SageSalesManagementPhase;
  sessionKey?: string;
  signal?: AbortSignal;
  query?: Record<string, string | number>;
  extraHeaders?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  return (await requestSageSalesManagementJsonWithStatus(input)).payload;
}

async function requestSageSalesManagementJsonWithStatus(input: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  fetcher: ProviderFetch;
  phase: SageSalesManagementPhase;
  sessionKey?: string;
  signal?: AbortSignal;
  query?: Record<string, string | number>;
  extraHeaders?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  const timeout = createProviderTimeout(input.signal, requestTimeoutMs);

  try {
    const response = await input.fetcher(buildSageSalesManagementUrl(input.path, input.query), {
      method: input.method,
      headers: compactObject({
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        ...(input.sessionKey ? { "x-session-key": input.sessionKey } : {}),
        ...input.extraHeaders,
        "user-agent": providerUserAgent,
      }),
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      throw createSageSalesManagementError(response.status, payload, input.phase);
    }

    return {
      status: response.status,
      payload,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Sage Sales Management request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Sage Sales Management request failed: ${error.message}`
        : "Sage Sales Management request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSageSalesManagementUrl(path: string, query: Record<string, string | number> = {}) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${sageSalesManagementApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Sage Sales Management returned invalid JSON", text);
    }
    return text;
  }
}

function createSageSalesManagementError(
  status: number,
  payload: unknown,
  phase: SageSalesManagementPhase,
): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Sage Sales Management request failed with status ${status}`;

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

  return new ProviderRequestError(status || 502, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message)?.trim() ||
    optionalString(record.error)?.trim() ||
    optionalString(record.detail)?.trim() ||
    optionalString(record.error_description)?.trim()
  );
}

function readCredentials(values: Record<string, string>): SageSalesManagementCredentials {
  const publicApiKey = values.publicApiKey?.trim();
  const privateApiKey = values.privateApiKey?.trim();
  if (!publicApiKey) {
    throw new ProviderRequestError(400, "publicApiKey is required");
  }
  if (!privateApiKey) {
    throw new ProviderRequestError(400, "privateApiKey is required");
  }

  return {
    publicApiKey,
    privateApiKey,
  };
}

function readFirstObject(payload: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(payload)) {
    return optionalRecord(payload[0]);
  }

  const record = optionalRecord(payload);
  const data = record ? record.data : undefined;
  if (Array.isArray(data)) {
    return optionalRecord(data[0]);
  }

  return optionalRecord(data) ?? record;
}

function readListPayload(payload: unknown, outputKey: string) {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => readObjectPayload(item, `${outputKey}[${index}]`));
  }

  const record = readObjectPayload(payload, outputKey);
  const directValue = record[outputKey];
  if (Array.isArray(directValue)) {
    return directValue.map((item, index) => readObjectPayload(item, `${outputKey}[${index}]`));
  }

  const data = record.data;
  if (Array.isArray(data)) {
    return data.map((item, index) => readObjectPayload(item, `data[${index}]`));
  }

  throw new ProviderRequestError(502, `Sage Sales Management ${outputKey} response missing list data`, 502);
}

function readRecordPayload(payload: unknown, outputKey: string) {
  const record = readObjectPayload(payload, outputKey);
  const directValue = record[outputKey];
  if (directValue !== undefined) {
    return readObjectPayload(directValue, outputKey);
  }

  const data = record.data;
  if (data !== undefined) {
    return readObjectPayload(data, "data");
  }

  return record;
}

function readObjectPayload(payload: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `Sage Sales Management ${fieldName} response was not an object`, payload);
  }

  return record;
}

function readBodyData(value: unknown) {
  return readObjectPayload(value, "data");
}

function readRequiredId(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, "id must be a positive integer");
  }

  return parsed;
}

function readOptionalInteger(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(400, "integer input is required");
  }

  return parsed;
}

function readOptionalHeaderInteger(value: unknown) {
  const parsed = readOptionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readOptionalExtraFieldDescription(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return value ? "1" : "0";
}

function compactStringOrNumberRecord(input: Record<string, string | number | undefined>) {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string | number] => entry[1] !== undefined),
  );
}

function compactStringRecord(input: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function pickString(record: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = optionalString(record[key])?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readId(record: Record<string, unknown> | undefined) {
  const value = record?.id;
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return undefined;
}

function joinName(firstName: string | undefined, lastName: string | undefined) {
  const value = [firstName, lastName].filter(Boolean).join(" ").trim();
  return value || undefined;
}
