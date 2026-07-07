import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { Cin7CoreActionName } from "./actions.ts";

import { compactObject, objectArray, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "cin7_core";
const cin7CoreApiBaseUrl = "https://inventory.dearsystems.com/ExternalApi/v2/";
const cin7CoreValidationPath = "/me";
const cin7CoreDefaultRequestTimeoutMs = 30_000;

type Cin7CorePhase = "validate" | "execute";

interface Cin7CoreContext {
  accountId: string;
  applicationKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type Cin7CoreActionHandler = (input: Record<string, unknown>, context: Cin7CoreContext) => Promise<unknown>;

const cin7CoreActionHandlers: Record<Cin7CoreActionName, Cin7CoreActionHandler> = {
  async get_current_account(_input, context) {
    const payload = await requestCin7CoreJson({
      context,
      method: "GET",
      path: cin7CoreValidationPath,
      phase: "execute",
    });

    return {
      account: requireProviderObject(payload, "Cin7 Core account response"),
    };
  },

  async list_customers(input, context) {
    const payload = await requestCin7CoreJson({
      context,
      method: "GET",
      path: "/customer",
      query: buildQueryParams(input, [
        ["page", "Page"],
        ["limit", "Limit"],
        ["id", "ID"],
        ["name", "Name"],
        ["contactFilter", "ContactFilter"],
        ["modifiedSince", "ModifiedSince"],
        ["includeDeprecated", "IncludeDeprecated"],
        ["includeProductPrices", "IncludeProductPrices"],
      ]),
      phase: "execute",
    });
    const normalized = normalizePagedPayload(payload, "CustomerList", "Cin7 Core customers");

    return {
      customers: normalized.records,
      total: normalized.total,
      page: normalized.page,
      raw: normalized.raw,
    };
  },

  async get_customer(input, context) {
    const payload = await requestCin7CoreJson({
      context,
      method: "GET",
      path: "/customer",
      query: buildQueryParams(input, [["id", "ID"]]),
      phase: "execute",
    });
    const normalized = normalizePagedPayload(payload, "CustomerList", "Cin7 Core customers");
    const customer = normalized.records[0];
    if (!customer) {
      throw new ProviderRequestError(404, "Cin7 Core customer not found");
    }

    return {
      customer,
      raw: normalized.raw,
    };
  },

  async list_products(input, context) {
    const payload = await requestCin7CoreJson({
      context,
      method: "GET",
      path: "/product",
      query: buildQueryParams(input, [
        ["id", "ID"],
        ["page", "Page"],
        ["limit", "Limit"],
        ["name", "Name"],
        ["sku", "Sku"],
        ["modifiedSince", "ModifiedSince"],
        ["includeDeprecated", "IncludeDeprecated"],
        ["includeBOM", "IncludeBOM"],
        ["includeSuppliers", "IncludeSuppliers"],
        ["includeMovements", "IncludeMovements"],
        ["includeAttachments", "IncludeAttachments"],
        ["includeReorderLevels", "IncludeReorderLevels"],
        ["includeCustomPrices", "IncludeCustomPrices"],
      ]),
      phase: "execute",
    });
    const normalized = normalizePagedPayload(payload, "Products", "Cin7 Core products");

    return {
      products: normalized.records,
      total: normalized.total,
      page: normalized.page,
      raw: normalized.raw,
    };
  },

  async get_product(input, context) {
    const payload = await requestCin7CoreJson({
      context,
      method: "GET",
      path: "/product",
      query: buildQueryParams(input, [["id", "ID"]]),
      phase: "execute",
    });
    const normalized = normalizePagedPayload(payload, "Products", "Cin7 Core products");
    const product = normalized.records[0];
    if (!product) {
      throw new ProviderRequestError(404, "Cin7 Core product not found");
    }

    return {
      product,
      raw: normalized.raw,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Cin7CoreContext>({
  service,
  handlers: cin7CoreActionHandlers,
  async createContext(context, fetcher): Promise<Cin7CoreContext> {
    const credential = await requireApiKeyCredential(context, service);
    return readCin7CoreCredentials({
      applicationKey: credential.apiKey,
      accountId: credential.values.accountId,
      fetcher,
      signal: context.signal,
    });
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const accountId = requiredString(
      credential.values.accountId,
      "accountId",
      (message) => new ProviderRequestError(400, message),
    );
    const url = createProviderProxyUrl(cin7CoreApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("api-auth-accountid", accountId);
    headers.set("api-auth-applicationkey", credential.apiKey);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = readCin7CoreCredentials({
      applicationKey: input.apiKey,
      accountId: input.values.accountId,
      fetcher,
      signal,
    });
    const payload = await requestCin7CoreJson({
      context,
      method: "GET",
      path: cin7CoreValidationPath,
      phase: "validate",
    });
    const account = requireProviderObject(payload, "Cin7 Core account response");
    const company = optionalString(account.Company);

    return {
      profile: {
        accountId: context.accountId,
        displayName: company ?? "Cin7 Core Account",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: cin7CoreApiBaseUrl,
        validationEndpoint: cin7CoreValidationPath,
        company,
        currency: optionalString(account.Currency),
      }),
    };
  },
};

function readCin7CoreCredentials(input: {
  applicationKey: string;
  accountId?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}): Cin7CoreContext {
  return {
    accountId: requiredString(input.accountId, "accountId", (message) => new ProviderRequestError(400, message)),
    applicationKey: input.applicationKey,
    fetcher: input.fetcher,
    signal: input.signal,
  };
}

async function requestCin7CoreJson(input: {
  context: Cin7CoreContext;
  method: "GET";
  path: string;
  phase: Cin7CorePhase;
  query?: URLSearchParams;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, cin7CoreDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(buildCin7CoreUrl(input), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "api-auth-accountid": input.context.accountId,
        "api-auth-applicationkey": input.context.applicationKey,
      },
      signal: timeout.signal,
    });
    const payload = await readCin7CorePayload(response);

    if (!response.ok) {
      throw createCin7CoreError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Cin7 Core request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Cin7 Core request failed: ${error.message}` : "Cin7 Core request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCin7CoreUrl(input: { path: string; query?: URLSearchParams }): URL {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, cin7CoreApiBaseUrl);
  if (input.query) {
    url.search = input.query.toString();
  }
  return url;
}

function buildQueryParams(
  input: Record<string, unknown>,
  fields: readonly (readonly [inputKey: string, queryName: string])[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();

  for (const [inputKey, queryName] of fields) {
    const formatted = formatScalarQueryParam(input[inputKey]);
    if (formatted !== undefined) {
      query.set(queryName, formatted);
    }
  }

  return query.size > 0 ? query : undefined;
}

function formatScalarQueryParam(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
}

async function readCin7CorePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Cin7 Core JSON response");
  }
}

function createCin7CoreError(status: number, payload: unknown, phase: Cin7CorePhase): ProviderRequestError {
  const message = extractCin7CoreErrorMessage(payload) ?? `Cin7 Core request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractCin7CoreErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.Message) ??
    optionalString(record.message) ??
    optionalString(record.Error) ??
    optionalString(record.error) ??
    optionalString(record.ExceptionMessage);
  if (directMessage) {
    return directMessage;
  }

  const errors = Array.isArray(record.Errors) ? record.Errors : record.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item === "string" && item.trim()) {
        return item;
      }
      const itemRecord = optionalRecord(item);
      const itemMessage = optionalString(itemRecord?.Message) ?? optionalString(itemRecord?.message);
      if (itemMessage) {
        return itemMessage;
      }
    }
  }

  return undefined;
}

function normalizePagedPayload(
  payload: unknown,
  listKey: string,
  label: string,
): {
  records: Array<Record<string, unknown>>;
  total: number | null;
  page: number | null;
  raw: Record<string, unknown>;
} {
  const body = requireProviderObject(payload, `${label} response`);
  const records = objectArray(body[listKey], `${label} list`, (message) => new ProviderRequestError(502, message));

  return {
    records,
    total: readNullableInteger(body.Total),
    page: readNullableInteger(body.Page),
    raw: body,
  };
}

function readNullableInteger(value: unknown): number | null {
  if (Number.isInteger(value)) {
    return value as number;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return record;
}
