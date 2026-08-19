import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const paddleApiBaseUrl = "https://api.paddle.com";
const paddleValidationPath = "/products";

type PaddleRequestPhase = "validate" | "execute";
type PaddleActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const paddleActionHandlers: ProviderActionHandlers<"paddle", PaddleActionHandler> = {
  list_products(input, context) {
    return executeListProducts(input, context);
  },
  get_product(input, context) {
    return executeGetEntity("product", `/products/${encodePath(input.id)}`, context);
  },
  create_product(input, context) {
    return executeWriteEntity("product", "/products", "POST", input, context);
  },
  update_product(input, context) {
    return executeWriteEntity("product", `/products/${encodePath(input.id)}`, "PATCH", input, context);
  },
  list_prices(input, context) {
    return executeListPrices(input, context);
  },
  get_price(input, context) {
    return executeGetEntity("price", `/prices/${encodePath(input.id)}`, context);
  },
  create_price(input, context) {
    return executeWriteEntity("price", "/prices", "POST", input, context);
  },
  update_price(input, context) {
    return executeWriteEntity("price", `/prices/${encodePath(input.id)}`, "PATCH", input, context);
  },
  list_customers(input, context) {
    return executeListCustomers(input, context);
  },
  get_customer(input, context) {
    return executeGetEntity("customer", `/customers/${encodePath(input.id)}`, context);
  },
  create_customer(input, context) {
    return executeWriteEntity("customer", "/customers", "POST", input, context);
  },
  update_customer(input, context) {
    return executeWriteEntity("customer", `/customers/${encodePath(input.id)}`, "PATCH", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("paddle", paddleActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await paddleRequest(paddleValidationPath, {
      apiKey: input.apiKey,
      fetcher,
      method: "GET",
      phase: "validate",
      searchParams: new URLSearchParams([["per_page", "1"]]),
    });

    return {
      profile: {
        accountId: "paddle-api-key",
        displayName: "Paddle API Key",
      },
      metadata: {
        apiBaseUrl: paddleApiBaseUrl,
        validationEndpoint: paddleValidationPath,
      },
    };
  },
};

async function executeListProducts(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const searchParams = paginationSearchParams(input);
  setJoined(searchParams, "id", input.ids);
  setJoined(searchParams, "include", input.include);
  setJoined(searchParams, "status", input.status);
  setJoined(searchParams, "tax_category", input.taxCategory);
  setOptional(searchParams, "type", input.type);

  return executeList("/products", searchParams, input, context);
}

async function executeListPrices(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const searchParams = paginationSearchParams(input);
  setJoined(searchParams, "id", input.ids);
  setJoined(searchParams, "include", input.include);
  setJoined(searchParams, "product_id", input.productIds);
  setJoined(searchParams, "status", input.status);
  setOptional(searchParams, "recurring", input.recurring);
  setOptional(searchParams, "billing_cycle.interval", input.billingCycleInterval);
  setOptional(searchParams, "billing_cycle.frequency", input.billingCycleFrequency);
  setOptional(searchParams, "type", input.type);

  return executeList("/prices", searchParams, input, context);
}

async function executeListCustomers(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const searchParams = paginationSearchParams(input);
  setJoined(searchParams, "id", input.ids);
  setJoined(searchParams, "email", input.emails);
  setJoined(searchParams, "status", input.status);
  setOptional(searchParams, "search", input.search);

  return executeList("/customers", searchParams, input, context);
}

async function executeList(
  path: string,
  searchParams: URLSearchParams,
  input: Record<string, unknown>,
  context: { apiKey: string; fetcher: typeof fetch },
) {
  const payload = await paddleRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    searchParams,
    skipCount: input.skipCount === true,
  });

  return {
    data: readDataArray(payload),
    meta: readMeta(payload),
  };
}

async function executeGetEntity(
  outputKey: "product" | "price" | "customer",
  path: string,
  context: { apiKey: string; fetcher: typeof fetch },
) {
  const payload = await paddleRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
  });

  return {
    [outputKey]: readDataObject(payload),
    meta: readMeta(payload),
  };
}

async function executeWriteEntity(
  outputKey: "product" | "price" | "customer",
  path: string,
  method: "POST" | "PATCH",
  input: Record<string, unknown>,
  context: { apiKey: string; fetcher: typeof fetch },
) {
  const payload = await paddleRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method,
    phase: "execute",
    body: actionBody(input),
  });

  return {
    [outputKey]: readDataObject(payload),
    meta: readMeta(payload),
  };
}

async function paddleRequest(
  path: string,
  input: {
    apiKey: string;
    fetcher: typeof fetch;
    method: string;
    phase: PaddleRequestPhase;
    searchParams?: URLSearchParams;
    body?: Record<string, unknown>;
    skipCount?: boolean;
  },
) {
  const url = new URL(path, paddleApiBaseUrl);
  if (input.searchParams) {
    for (const [key, value] of input.searchParams) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: paddleHeaders(input.apiKey, input.body !== undefined, input.skipCount === true),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    payload = await readPaddlePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Paddle request failed: ${error.message}` : "Paddle request failed",
    );
  }

  if (!response.ok) {
    throw createPaddleError(response, payload, input.phase);
  }

  return payload;
}

function paddleHeaders(apiKey: string, hasBody: boolean, skipCount: boolean) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  if (skipCount) {
    headers["Skip-Count"] = "true";
  }
  return headers;
}

async function readPaddlePayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (response.ok) {
      throw new ProviderRequestError(
        502,
        error instanceof Error ? `Paddle returned malformed JSON: ${error.message}` : "Paddle returned malformed JSON",
      );
    }

    return text;
  }
}

function createPaddleError(response: Response, payload: unknown, phase: PaddleRequestPhase) {
  const message = extractPaddleErrorMessage(payload) ?? response.statusText ?? "Paddle request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractPaddleErrorMessage(payload: unknown) {
  const data = optionalRecord(payload);
  if (!data) {
    return typeof payload === "string" && payload ? payload : undefined;
  }

  const error = optionalRecord(data.error);
  const detail = optionalString(error?.detail);
  if (detail) {
    return detail;
  }

  const message = optionalString(error?.message) ?? optionalString(data.message);
  if (message) {
    return message;
  }

  return optionalString(data.error);
}

function readDataObject(payload: unknown) {
  return optionalRecord(optionalRecord(payload)?.data) ?? null;
}

function readDataArray(payload: unknown) {
  const data = optionalRecord(payload)?.data;
  return Array.isArray(data) ? data : [];
}

function readMeta(payload: unknown) {
  return optionalRecord(optionalRecord(payload)?.meta) ?? {};
}

function paginationSearchParams(input: Record<string, unknown>) {
  const searchParams = new URLSearchParams();
  setOptional(searchParams, "after", input.after);
  setOptional(searchParams, "per_page", input.perPage);
  setOptional(searchParams, "order_by", input.orderBy);
  return searchParams;
}

function setOptional(searchParams: URLSearchParams, key: string, value: unknown) {
  const stringValue = typeof value === "boolean" || typeof value === "number" ? String(value) : optionalString(value);
  if (stringValue !== undefined) {
    searchParams.set(key, stringValue);
  }
}

function setJoined(searchParams: URLSearchParams, key: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }
  searchParams.set(key, value.map(String).join(","));
}

function actionBody(input: Record<string, unknown>) {
  const body = { ...input };
  delete body.id;
  return compactObject(body);
}

function encodePath(value: unknown) {
  return encodeURIComponent(String(value));
}
