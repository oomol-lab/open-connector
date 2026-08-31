import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "gumroad";
const gumroadApiBaseUrl = "https://api.gumroad.com/v2";
const gumroadValidationPath = "/user";
const gumroadRequestTimeoutMs = 30_000;

type GumroadPhase = "validate" | "execute";
type GumroadMethod = "GET" | "PUT" | "POST";
type GumroadActionContext = ApiKeyProviderContext;
type GumroadActionHandler = (input: Record<string, unknown>, context: GumroadActionContext) => Promise<unknown>;

export const gumroadActionHandlers: ProviderActionHandlers<"gumroad", GumroadActionHandler> = {
  get_current_user(_input, context) {
    return requestGumroad({
      method: "GET",
      path: gumroadValidationPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  list_products(_input, context) {
    return requestGumroad({
      method: "GET",
      path: "/products",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_product(input, context) {
    return requestGumroad({
      method: "GET",
      path: `/products/${encodeURIComponent(requiredString(input.productId, "productId", providerInputError))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  async list_sales(input, context) {
    const payload = await requestGumroad({
      method: "GET",
      path: "/sales",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      params: {
        after: optionalString(input.after),
        before: optionalString(input.before),
        product_id: optionalString(input.productId),
        email: optionalString(input.email),
        order_id: optionalString(input.orderId),
        name: optionalString(input.name),
        license_key: optionalString(input.licenseKey),
        page_key: optionalString(input.pageKey),
      },
    });

    return withNullablePagination(payload);
  },
  get_sale(input, context) {
    return requestGumroad({
      method: "GET",
      path: `/sales/${encodeURIComponent(requiredString(input.saleId, "saleId", providerInputError))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  async list_product_subscribers(input, context) {
    const payload = await requestGumroad({
      method: "GET",
      path: `/products/${encodeURIComponent(
        requiredString(input.productId, "productId", providerInputError),
      )}/subscribers`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      params: {
        email: optionalString(input.email),
        paginated: input.paginated === undefined ? undefined : String(input.paginated),
        page_key: optionalString(input.pageKey),
      },
    });

    return withNullablePagination(payload);
  },
  mark_sale_as_shipped(input, context) {
    return requestGumroad({
      method: "PUT",
      path: `/sales/${encodeURIComponent(requiredString(input.saleId, "saleId", providerInputError))}/mark_as_shipped`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      params: {
        tracking_url: optionalString(input.trackingUrl),
      },
    });
  },
  refund_sale(input, context) {
    return requestGumroad({
      method: "PUT",
      path: `/sales/${encodeURIComponent(requiredString(input.saleId, "saleId", providerInputError))}/refund`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      params: {
        amount_cents: optionalInteger(input.amountCents)?.toString(),
      },
    });
  },
  resend_sale_receipt(input, context) {
    return requestGumroad({
      method: "POST",
      path: `/sales/${encodeURIComponent(requiredString(input.saleId, "saleId", providerInputError))}/resend_receipt`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, gumroadActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await requestGumroad({
      method: "GET",
      path: gumroadValidationPath,
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const user = requireGumroadObject(response.user, "Gumroad user");
    const email = optionalString(user.email);
    const name = optionalString(user.name);
    const label = email || name || "Gumroad user";

    return {
      profile: {
        displayName: label,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: gumroadApiBaseUrl,
        validationEndpoint: gumroadValidationPath,
      },
    };
  },
};

async function requestGumroad(input: {
  method: GumroadMethod;
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: GumroadPhase;
  signal?: AbortSignal;
  params?: Record<string, string | undefined>;
}): Promise<Record<string, unknown>> {
  const url = new URL(`${gumroadApiBaseUrl}${input.path}`);
  const apiKey = optionalString(input.apiKey);
  if (!apiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const params = buildParams({
    access_token: apiKey,
    ...input.params,
  });
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  const body = input.method === "GET" ? undefined : params.toString();

  if (input.method === "GET") {
    for (const [key, value] of params) {
      url.searchParams.set(key, value);
    }
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  }

  const timeoutSignal = AbortSignal.timeout(gumroadRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers,
      body,
      signal,
    });
    const payload = await readJsonResponse(response);
    const bodyRecord = optionalRecord(payload);
    const message = bodyRecord ? optionalString(bodyRecord.message) : undefined;

    if (!response.ok) {
      throw mapGumroadError(response.status, message, payload, input.phase);
    }
    if (!bodyRecord) {
      throw new ProviderRequestError(502, "Gumroad response was not a JSON object");
    }
    if (bodyRecord.success === false) {
      throw new ProviderRequestError(502, message ?? "Gumroad request was not successful", payload);
    }

    return bodyRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Gumroad request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gumroad request failed: ${error.message}` : "Gumroad request failed",
    );
  }
}

function buildParams(input: Record<string, string | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const trimmed = optionalString(value);
    if (trimmed) {
      params.set(key, trimmed);
    }
  }
  return params;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Gumroad response was not valid JSON");
  }
}

function requireGumroadObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} was not a JSON object`);
  }
  return record;
}

function withNullablePagination(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    next_page_url: payload.next_page_url ?? null,
    next_page_key: payload.next_page_key ?? null,
  };
}

function mapGumroadError(
  status: number,
  message: string | undefined,
  payload: unknown,
  phase: GumroadPhase,
): ProviderRequestError {
  const fallback = `Gumroad request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message ?? fallback, payload);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message ?? fallback, payload);
  }
  return new ProviderRequestError(status || 502, message ?? fallback, payload);
}
