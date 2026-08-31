import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  ProviderRequestError,
  defineApiKeyProviderExecutors,
  providerUserAgent,
  requiredResponseRecord,
} from "../provider-runtime.ts";

type StripeActionContext = ApiKeyProviderContext;

type StripeActionHandler = (input: Record<string, unknown>, context: StripeActionContext) => Promise<unknown>;

interface StripeRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  method: "GET" | "POST" | "DELETE";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

const service = "stripe";
const stripeApiBaseUrl = "https://api.stripe.com";
const stripeApiVersion = "2024-06-20";
const stripeAccountPath = "/v1/account";

export const stripeActionHandlers: ProviderActionHandlers<"stripe", StripeActionHandler> = {
  identify_account(_input, context) {
    return executeIdentifyAccount(context);
  },
  create_customer(input, context) {
    return executeCustomerMutation("/v1/customers", input, context);
  },
  update_customer(input, context) {
    return executeCustomerMutation(
      `/v1/customers/${encodeStripePath(input.customerId, "customerId")}`,
      omitKeys(input, ["customerId"]),
      context,
    );
  },
  get_customer(input, context) {
    return executeCustomerRead(`/v1/customers/${encodeStripePath(input.customerId, "customerId")}`, context);
  },
  list_customers(input, context) {
    return executeStripeList("/v1/customers", "customers", input, context);
  },
  search_customers(input, context) {
    return executeStripeList("/v1/customers/search", "customers", input, context);
  },
  delete_customer(input, context) {
    return executeStripeDelete(`/v1/customers/${encodeStripePath(input.customerId, "customerId")}`, context);
  },
  create_product(input, context) {
    return executeProductMutation("/v1/products", input, context);
  },
  update_product(input, context) {
    return executeProductMutation(
      `/v1/products/${encodeStripePath(input.productId, "productId")}`,
      omitKeys(input, ["productId"]),
      context,
    );
  },
  get_product(input, context) {
    return executeProductRead(`/v1/products/${encodeStripePath(input.productId, "productId")}`, context);
  },
  list_products(input, context) {
    return executeStripeList("/v1/products", "products", input, context);
  },
  search_products(input, context) {
    return executeStripeList("/v1/products/search", "products", input, context);
  },
  delete_product(input, context) {
    return executeStripeDelete(`/v1/products/${encodeStripePath(input.productId, "productId")}`, context);
  },
  create_price(input, context) {
    if (input.product === undefined && input.product_data === undefined) {
      throw new ProviderRequestError(400, "create_price requires product or product_data");
    }
    if (
      input.unit_amount === undefined &&
      input.unit_amount_decimal === undefined &&
      input.custom_unit_amount === undefined
    ) {
      throw new ProviderRequestError(400, "create_price requires unit_amount or unit_amount_decimal");
    }
    if (
      input.custom_unit_amount !== undefined &&
      (input.unit_amount !== undefined || input.unit_amount_decimal !== undefined)
    ) {
      throw new ProviderRequestError(
        400,
        "create_price custom_unit_amount cannot be used with unit_amount or unit_amount_decimal",
      );
    }
    return executePriceMutation("/v1/prices", input, context);
  },
  update_price(input, context) {
    return executePriceMutation(
      `/v1/prices/${encodeStripePath(input.priceId, "priceId")}`,
      omitKeys(input, ["priceId"]),
      context,
    );
  },
  get_price(input, context) {
    return executePriceRead(`/v1/prices/${encodeStripePath(input.priceId, "priceId")}`, context);
  },
  list_prices(input, context) {
    return executeStripeList("/v1/prices", "prices", input, context);
  },
  search_prices(input, context) {
    return executeStripeList("/v1/prices/search", "prices", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, stripeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const profile = await validateStripeCredential(input.apiKey, fetcher);
    return profile;
  },
};

async function validateStripeCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<{
  profile: {
    accountId?: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = requiredResponseRecord(
    await stripeRequest(stripeAccountPath, {
      apiKey,
      fetcher,
      method: "GET",
    }),
    "stripe account response",
  );
  const accountId = optionalString(payload.id);
  const email = optionalString(payload.email);
  const country = optionalString(payload.country);
  const defaultCurrency = optionalString(payload.default_currency);

  return {
    profile: {
      accountId,
      displayName: email ?? accountId ?? "Stripe API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: stripeApiBaseUrl,
      apiVersion: stripeApiVersion,
      validationEndpoint: stripeAccountPath,
      accountId,
      email,
      country,
      defaultCurrency,
    }),
  };
}

async function executeIdentifyAccount(context: StripeActionContext) {
  const payload = requiredResponseRecord(
    await stripeRequest(stripeAccountPath, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "GET",
    }),
    "stripe account response",
  );

  return {
    account: payload,
    accountId: optionalString(payload.id) ?? null,
    email: optionalString(payload.email) ?? null,
    country: optionalString(payload.country) ?? null,
    defaultCurrency: optionalString(payload.default_currency) ?? null,
  };
}

async function executeCustomerMutation(path: string, input: Record<string, unknown>, context: StripeActionContext) {
  const customer = await stripeRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    body: input,
  });
  return { customer: optionalRecord(customer) ?? null };
}

async function executeCustomerRead(path: string, context: StripeActionContext) {
  const customer = await stripeRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
  });
  return { customer: optionalRecord(customer) ?? null };
}

async function executeProductMutation(path: string, input: Record<string, unknown>, context: StripeActionContext) {
  const product = await stripeRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    body: input,
  });
  return { product: optionalRecord(product) ?? null };
}

async function executeProductRead(path: string, context: StripeActionContext) {
  const product = await stripeRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
  });
  return { product: optionalRecord(product) ?? null };
}

async function executePriceMutation(path: string, input: Record<string, unknown>, context: StripeActionContext) {
  const price = await stripeRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    body: input,
  });
  return { price: optionalRecord(price) ?? null };
}

async function executePriceRead(path: string, context: StripeActionContext) {
  const price = await stripeRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
  });
  return { price: optionalRecord(price) ?? null };
}

async function executeStripeList(
  path: string,
  outputKey: "customers" | "products" | "prices",
  input: Record<string, unknown>,
  context: StripeActionContext,
) {
  const payload = await stripeRequest(path, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    query: input,
  });
  return { [outputKey]: requiredResponseRecord(payload, "stripe list response") };
}

async function executeStripeDelete(path: string, context: StripeActionContext) {
  const payload = requiredResponseRecord(
    await stripeRequest(path, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "DELETE",
    }),
    "stripe delete response",
  );
  return {
    deleted: payload.deleted === true,
    object: optionalString(payload.object) ?? "unknown",
    id: optionalString(payload.id) ?? "unknown",
    raw: payload,
  };
}

async function stripeRequest(path: string, input: StripeRequestInput): Promise<unknown> {
  const url = new URL(`${stripeApiBaseUrl}${path}`);
  appendStripeParams(url.searchParams, input.query);

  const headers: Record<string, string> = {
    authorization: `Bearer ${input.apiKey}`,
    "stripe-version": stripeApiVersion,
    "user-agent": providerUserAgent,
  };

  let body: string | undefined;
  if (input.body) {
    const params = new URLSearchParams();
    appendStripeParams(params, input.body);
    body = params.toString();
    headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  }

  const response = await input.fetcher(url.toString(), {
    method: input.method,
    headers,
    ...(body ? { body } : {}),
  });

  if (!response.ok) {
    throw mapStripeError(response.status, await readStripeErrorMessage(response));
  }

  if (response.status === 204) {
    return {};
  }

  return response.json() as Promise<unknown>;
}

function appendStripeParams(params: URLSearchParams, value: unknown, prefix?: string): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendStripeParams(params, item, prefix);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      appendStripeParams(params, child, prefix ? `${prefix}[${key}]` : key);
    }
    return;
  }

  if (!prefix) {
    return;
  }

  params.append(prefix, String(value));
}

function encodeStripePath(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return encodeURIComponent(value);
}

function omitKeys(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !omitted.has(key)));
}

async function readStripeErrorMessage(response: Response): Promise<string> {
  try {
    const payload = optionalRecord(await response.json());
    const error = optionalRecord(payload?.error);
    const message = optionalString(error?.message);
    if (message) {
      return message;
    }
  } catch {
    // Stripe can return HTML or an empty body for edge errors.
  }

  const text = await response.text().catch(() => "");
  return text.trim() || `Stripe request failed with status ${response.status}`;
}

function mapStripeError(status: number, message: string): ProviderRequestError {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message || "Stripe API key is invalid");
  }

  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message || "Stripe rate limit exceeded");
  }

  return new ProviderRequestError(502, message, status);
}
