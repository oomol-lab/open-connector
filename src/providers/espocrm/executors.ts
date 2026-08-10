import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { compactObject, nullableInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  credentialProviderProxyBaseUrl,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "espocrm";
const espocrmAppUserPath = "/api/v1/App/user";
const espocrmMetadataPath = "/api/v1/Metadata";

type EspocrmRequestPhase = "validate" | "execute";

interface EspocrmActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface EspocrmRequestOptions extends EspocrmActionContext {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  phase: EspocrmRequestPhase;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

type EspocrmActionHandler = (input: Record<string, unknown>, context: EspocrmActionContext) => Promise<unknown>;

const espocrmActionHandlers: Record<string, EspocrmActionHandler> = {
  async get_app_user(_input, context) {
    const payload = await requestEspocrm({
      ...context,
      path: espocrmAppUserPath,
      method: "GET",
      phase: "execute",
    });

    return normalizeAppUserPayload(payload);
  },
  async get_metadata(input, context) {
    const metadata = await requestEspocrm({
      ...context,
      path: espocrmMetadataPath,
      method: "GET",
      phase: "execute",
      query: compactObject({
        key: optionalString(input.key),
      }),
    });

    return {
      metadata,
    };
  },
  async list_records(input, context) {
    const payload = await requestEspocrm({
      ...context,
      path: buildRecordListPath(readRequiredString(input.entityType, "entityType")),
      method: "GET",
      phase: "execute",
      query: compactObject({
        maxSize: readOptionalIntegerString(input.maxSize),
        offset: readOptionalIntegerString(input.offset),
        orderBy: optionalString(input.orderBy),
        order: optionalString(input.order),
        where: encodeOptionalJson(input.where),
      }),
    });

    return normalizeListPayload(payload, "EspoCRM list_records response");
  },
  async get_record(input, context) {
    const record = await requestEspocrm({
      ...context,
      path: buildRecordPath(
        readRequiredString(input.entityType, "entityType"),
        readRequiredString(input.recordId, "recordId"),
      ),
      method: "GET",
      phase: "execute",
    });

    return {
      record: readRequiredObject(record, "EspoCRM get_record response"),
    };
  },
  async create_record(input, context) {
    const record = await requestEspocrm({
      ...context,
      path: buildRecordListPath(readRequiredString(input.entityType, "entityType")),
      method: "POST",
      phase: "execute",
      body: readRequiredInputObject(input.data, "data"),
    });

    return {
      record: readRequiredObject(record, "EspoCRM create_record response"),
    };
  },
  async update_record(input, context) {
    const record = await requestEspocrm({
      ...context,
      path: buildRecordPath(
        readRequiredString(input.entityType, "entityType"),
        readRequiredString(input.recordId, "recordId"),
      ),
      method: "PUT",
      phase: "execute",
      body: readRequiredInputObject(input.data, "data"),
    });

    return {
      record: readRequiredObject(record, "EspoCRM update_record response"),
    };
  },
  async delete_record(input, context) {
    await requestEspocrm({
      ...context,
      path: buildRecordPath(
        readRequiredString(input.entityType, "entityType"),
        readRequiredString(input.recordId, "recordId"),
      ),
      method: "DELETE",
      phase: "execute",
    });

    return {
      ok: true,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<EspocrmActionContext>({
  service,
  handlers: espocrmActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<EspocrmActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeBaseUrl(
        optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeBaseUrl(input.values.baseUrl);
    const payload = await requestEspocrm({
      baseUrl,
      apiKey: input.apiKey,
      path: espocrmAppUserPath,
      method: "GET",
      fetcher,
      signal,
      phase: "validate",
    });
    const appUser = normalizeAppUserPayload(payload);

    return {
      profile: {
        accountId: readCurrentUserIdentifier(appUser.user),
        displayName: readCurrentUserLabel(appUser.user),
      },
      grantedScopes: [],
      metadata: {
        baseUrl,
        validationEndpoint: espocrmAppUserPath,
        user: appUser.user,
      },
    };
  },
};

async function requestEspocrm(input: EspocrmRequestOptions): Promise<unknown> {
  const url = buildUrl(input.baseUrl, input.path, input.query);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: buildHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `EspoCRM request failed for ${url}: ${error.message}`
        : `EspoCRM request failed for ${url}`,
    );
  }

  const payload = await readEspocrmPayload(response);
  if (!response.ok) {
    throw createEspocrmError(response.status, payload, input.phase);
  }
  return payload;
}

function normalizeBaseUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use HTTPS");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include username or password");
  }

  url.search = "";
  url.hash = "";
  while (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString().endsWith("/") ? url.toString().slice(0, -1) : url.toString();
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(trimLeadingSlash(path), `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function trimLeadingSlash(value: string): string {
  let output = value;
  while (output.startsWith("/")) {
    output = output.slice(1);
  }
  return output;
}

function buildHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    Accept: "application/json",
    "User-Agent": providerUserAgent,
    "X-Api-Key": apiKey,
  });
  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function buildRecordListPath(entityType: string): string {
  return `/api/v1/${encodeURIComponent(entityType)}`;
}

function buildRecordPath(entityType: string, recordId: string): string {
  return `${buildRecordListPath(entityType)}/${encodeURIComponent(recordId)}`;
}

async function readEspocrmPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "EspoCRM returned invalid JSON");
    }
    return {
      message: text,
    };
  }
}

function createEspocrmError(status: number, payload: unknown, phase: EspocrmRequestPhase): ProviderRequestError {
  const message = extractEspocrmErrorMessage(payload) ?? `EspoCRM request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function extractEspocrmErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errorMessage);
}

interface AppUserPayload {
  user: Record<string, unknown>;
  acl?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
}

function normalizeAppUserPayload(payload: unknown): AppUserPayload {
  const record = readRequiredObject(payload, "EspoCRM App/user response");
  const user = readRequiredObject(record.user, "EspoCRM App/user response user");

  return compactObject({
    user,
    acl: optionalRecord(record.acl),
    preferences: optionalRecord(record.preferences),
  }) as AppUserPayload;
}

function normalizeListPayload(
  payload: unknown,
  context: string,
): { records: Array<Record<string, unknown>>; total: number | null } {
  const record = readRequiredObject(payload, context);
  const list = record.list;
  if (!Array.isArray(list)) {
    throw new ProviderRequestError(502, `${context} did not include a list array`);
  }

  return {
    records: list.map((item) => readRequiredObject(item, `${context} list item`)),
    total: readOptionalListTotal(record.total),
  };
}

function readCurrentUserIdentifier(user: Record<string, unknown>): string {
  return optionalString(user.id) ?? optionalString(user.userName) ?? optionalString(user.name) ?? "espocrm-api-user";
}

function readCurrentUserLabel(user: Record<string, unknown>): string {
  return optionalString(user.name) ?? optionalString(user.userName) ?? optionalString(user.id) ?? "EspoCRM API User";
}

function readRequiredObject(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} did not include an object`);
  }
  return record;
}

function readRequiredInputObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, "integer input is required");
  }
  return String(value);
}

function readOptionalListTotal(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = nullableInteger(value);
  if (parsed === undefined || parsed === null || parsed < -2) {
    throw new ProviderRequestError(502, "EspoCRM total must be an integer >= -2");
  }
  return parsed;
}

function encodeOptionalJson(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return JSON.stringify(value);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: credentialProviderProxyBaseUrl("baseUrl"),
  auth: { type: "api_key_header", name: "x-api-key" },
});
