import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalRecord,
  optionalString,
  optionalStringArray,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const jumpsellerApiBaseUrl = "https://api.jumpseller.com/v1/";

const jumpsellerDefaultTimeoutMs = 30_000;

type JumpsellerRequestPhase = "validate" | "execute";
type JumpsellerResourceKey = "store" | "product" | "order" | "customer" | "category";

interface JumpsellerCredential {
  login: string;
  authtoken: string;
}

interface JumpsellerCredentialSummary {
  storeCode?: string;
  storeName?: string;
  storeUrl?: string;
  storeEmail?: string;
}

export interface JumpsellerActionContext {
  credential: JumpsellerCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface JumpsellerRequestInput {
  method: "GET" | "POST" | "PUT";
  path: string;
  credential: JumpsellerCredential;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase: JumpsellerRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export async function validateJumpsellerCredential(
  apiKey: string,
  login: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<JumpsellerCredentialSummary> {
  const credential = {
    login: requiredString(login, "login", providerInputError),
    authtoken: apiKey,
  };
  const payload = await requestJumpsellerJson({
    method: "GET",
    path: "/store/info.json",
    credential,
    query: {
      fields: "name,code,url,email",
    },
    phase: "validate",
    fetcher,
    signal,
  });
  const store = unwrapResource(payload, "store");
  const storeName = optionalString(store.name);
  const storeUrl = optionalString(store.url);
  const storeCode = optionalString(store.code);

  return {
    storeCode,
    storeName,
    storeUrl,
    storeEmail: optionalString(store.email),
  };
}

export const jumpsellerActionHandlers: ProviderActionHandlers<
  "jumpseller",
  ProviderRuntimeHandler<JumpsellerActionContext>
> = {
  async get_store_info(input, context) {
    const payload = await requestJumpsellerJson({
      method: "GET",
      path: "/store/info.json",
      credential: context.credential,
      query: buildFieldsQuery(input),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return { store: unwrapResource(payload, "store"), raw: payload };
  },
  list_products(input, context) {
    return listResources({
      resourceKey: "product",
      outputKey: "products",
      path: "/products.json",
      input,
      ...context,
    });
  },
  get_product(input, context) {
    return getResource({
      resourceKey: "product",
      path: `/products/${readId(input)}.json`,
      input,
      ...context,
    });
  },
  search_products(input, context) {
    return listResources({
      resourceKey: "product",
      outputKey: "products",
      path: "/products/search.json",
      input,
      query: { query: requiredString(input.query, "query", providerInputError) },
      ...context,
    });
  },
  create_product(input, context) {
    return mutateResource({
      method: "POST",
      resourceKey: "product",
      path: "/products.json",
      body: { product: requiredRecord(input.product, "product", providerInputError) },
      input,
      ...context,
    });
  },
  update_product(input, context) {
    return mutateResource({
      method: "PUT",
      resourceKey: "product",
      path: `/products/${readId(input)}.json`,
      body: { product: requiredRecord(input.product, "product", providerInputError) },
      input,
      ...context,
    });
  },
  list_orders(input, context) {
    const status = optionalString(input.status);
    return listResources({
      resourceKey: "order",
      outputKey: "orders",
      path: status ? `/orders/status/${encodeURIComponent(status)}.json` : "/orders.json",
      input,
      ...context,
    });
  },
  get_order(input, context) {
    return getResource({
      resourceKey: "order",
      path: `/orders/${readId(input)}.json`,
      input,
      ...context,
    });
  },
  search_orders(input, context) {
    return listResources({
      resourceKey: "order",
      outputKey: "orders",
      path: "/orders/search.json",
      input,
      query: { query: requiredString(input.query, "query", providerInputError) },
      ...context,
    });
  },
  update_order(input, context) {
    return mutateResource({
      method: "PUT",
      resourceKey: "order",
      path: `/orders/${readId(input)}.json`,
      body: { order: requiredRecord(input.order, "order", providerInputError) },
      input,
      ...context,
    });
  },
  list_customers(input, context) {
    return listResources({
      resourceKey: "customer",
      outputKey: "customers",
      path: "/customers.json",
      input,
      ...context,
    });
  },
  get_customer(input, context) {
    return getResource({
      resourceKey: "customer",
      path: `/customers/${readId(input)}.json`,
      input,
      ...context,
    });
  },
  search_customers(input, context) {
    return listResources({
      resourceKey: "customer",
      outputKey: "customers",
      path: "/customers/search.json",
      input,
      query: {
        query: requiredString(input.query, "query", providerInputError),
        order: optionalString(input.order),
      },
      ...context,
    });
  },
  create_customer(input, context) {
    return mutateResource({
      method: "POST",
      resourceKey: "customer",
      path: "/customers.json",
      body: { customer: requiredRecord(input.customer, "customer", providerInputError) },
      input,
      ...context,
    });
  },
  update_customer(input, context) {
    return mutateResource({
      method: "PUT",
      resourceKey: "customer",
      path: `/customers/${readId(input)}.json`,
      body: { customer: requiredRecord(input.customer, "customer", providerInputError) },
      input,
      ...context,
    });
  },
  list_categories(input, context) {
    return listResources({
      resourceKey: "category",
      outputKey: "categories",
      path: "/categories.json",
      input,
      ...context,
    });
  },
  get_category(input, context) {
    return getResource({
      resourceKey: "category",
      path: `/categories/${readId(input)}.json`,
      input,
      ...context,
    });
  },
  create_category(input, context) {
    return mutateResource({
      method: "POST",
      resourceKey: "category",
      path: "/categories.json",
      body: { category: requiredRecord(input.category, "category", providerInputError) },
      input,
      ...context,
    });
  },
  update_category(input, context) {
    return mutateResource({
      method: "PUT",
      resourceKey: "category",
      path: `/categories/${readId(input)}.json`,
      body: { category: requiredRecord(input.category, "category", providerInputError) },
      input,
      ...context,
    });
  },
};

async function listResources(input: {
  resourceKey: JumpsellerResourceKey;
  outputKey: string;
  path: string;
  input: Record<string, unknown>;
  credential: JumpsellerCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
}) {
  const payload = await requestJumpsellerJson({
    method: "GET",
    path: input.path,
    credential: input.credential,
    query: {
      ...buildListQuery(input.input),
      ...input.query,
    },
    phase: "execute",
    fetcher: input.fetcher,
    signal: input.signal,
  });
  return {
    [input.outputKey]: unwrapResourceList(payload, input.resourceKey, input.outputKey),
    raw: payload,
  };
}

async function getResource(input: {
  resourceKey: JumpsellerResourceKey;
  path: string;
  input: Record<string, unknown>;
  credential: JumpsellerCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}) {
  const payload = await requestJumpsellerJson({
    method: "GET",
    path: input.path,
    credential: input.credential,
    query: buildFieldsQuery(input.input),
    phase: "execute",
    fetcher: input.fetcher,
    signal: input.signal,
  });
  return {
    [input.resourceKey]: unwrapResource(payload, input.resourceKey),
    raw: payload,
  };
}

async function mutateResource(input: {
  method: "POST" | "PUT";
  resourceKey: JumpsellerResourceKey;
  path: string;
  body: Record<string, unknown>;
  input: Record<string, unknown>;
  credential: JumpsellerCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}) {
  const payload = await requestJumpsellerJson({
    method: input.method,
    path: input.path,
    credential: input.credential,
    query: buildFieldsQuery(input.input),
    body: input.body,
    phase: "execute",
    fetcher: input.fetcher,
    signal: input.signal,
  });
  return {
    [input.resourceKey]: unwrapResource(payload, input.resourceKey),
    raw: payload,
  };
}

async function requestJumpsellerJson(input: JumpsellerRequestInput) {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, jumpsellerApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, jumpsellerDefaultTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: jumpsellerHeaders(input.credential, input.body != null),
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    timeout.cleanup();
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Jumpseller request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Jumpseller request failed: ${error.message}` : "Jumpseller request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readJumpsellerPayload(response);
  if (!response.ok) {
    throw createJumpsellerError(response.status, payload, input.phase);
  }
  return payload;
}

function buildListQuery(input: Record<string, unknown>) {
  return {
    ...buildFieldsQuery(input),
    page: stringifyOptionalNumber(input.page),
    limit: stringifyOptionalNumber(input.limit),
    locale: optionalString(input.locale),
  };
}

function buildFieldsQuery(input: Record<string, unknown>) {
  return compactObject({
    fields: stringifyFields(input.fields),
    locale: optionalString(input.locale),
  });
}

function stringifyFields(value: unknown) {
  return optionalStringArray(value)?.join(",");
}

function stringifyOptionalNumber(value: unknown) {
  return typeof value === "number" ? String(value) : undefined;
}

function readId(input: Record<string, unknown>) {
  return positiveInteger(input.id, "id", providerInputError);
}

function unwrapResourceList(payload: unknown, key: JumpsellerResourceKey, outputKey: string) {
  const values = readResourceArray(payload, key, outputKey);
  return values.map((item) => unwrapResource(item, key));
}

function readResourceArray(payload: unknown, key: JumpsellerResourceKey, outputKey: string) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = optionalRecord(payload);
  const plural = record ? record[outputKey] : undefined;
  if (Array.isArray(plural)) {
    return plural;
  }

  const singular = record ? record[key] : undefined;
  if (Array.isArray(singular)) {
    return singular;
  }

  throw new ProviderRequestError(502, "Jumpseller list response is not an array");
}

function unwrapResource(payload: unknown, key: JumpsellerResourceKey) {
  const record = requiredRecord(payload, "Jumpseller response", providerResponseError);
  const wrapped = optionalRecord(record[key]);
  if (wrapped) {
    return wrapped;
  }
  if (key === "store") {
    return record;
  }
  return record;
}

function jumpsellerHeaders(credential: JumpsellerCredential, hasBody: boolean) {
  return {
    accept: "application/json",
    authorization: buildBasicAuthorizationHeader(credential),
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

function buildBasicAuthorizationHeader(credential: JumpsellerCredential) {
  return `Basic ${Buffer.from(`${credential.login}:${credential.authtoken}`, "utf8").toString("base64")}`;
}

async function readJumpsellerPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createJumpsellerError(status: number, payload: unknown, phase: JumpsellerRequestPhase) {
  const message = extractJumpsellerErrorMessage(payload) ?? `Jumpseller request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && [400, 401, 403].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && [401, 403].includes(status)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && [400, 404, 409, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractJumpsellerErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}
