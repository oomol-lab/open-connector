import type { ApiKeyActionRequest, ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  getProviderActionHandler,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
} from "../provider-runtime.ts";

export interface ZylvieCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

type RequestPhase = "validate" | "execute";
type ActionHandler = (input: ApiKeyActionRequest, fetcher: typeof fetch) => Promise<unknown>;

export const zylvieApiBaseUrl = "https://api.zylvie.com";

const productFieldMap = {
  title: "title",
  url: "url",
  currency: "currency",
  price: "price",
  pricingModel: "pricing_model",
  display: "display",
  subtitle: "subtitle",
  description: "description",
  summary: "summary",
  interval: "interval",
  intervalCount: "interval_count",
  trialPeriodDays: "trial_period_days",
  collectAddressAndPhone: "collect_address_and_phone",
  shippingFee: "shipping_fee",
  shippingType: "shipping_type",
  categories: "categories",
  tags: "tags",
  productImageUrls: "productimages",
  productFileUrls: "productfiles",
  downloadEmailSubject: "download_email_subject",
  downloadEmailBody: "download_email_body",
  successUrl: "success_url",
  successEmailSubject: "success_email_subject",
  successEmailBody: "success_email_body",
  gatedPageUrl: "gated_page_url",
  gatedPageBody: "gated_page_body",
  isLicensed: "is_licensed",
  redemptionInstructions: "redemption_instructions",
  excludeFromAutomations: "exclude_from_automations",
} as const;

const couponFieldMap = {
  code: "code",
  type: "type",
  amount: "amount",
  isStorewide: "is_storewide",
  productIds: "products",
  isLive: "is_live",
  limit: "limit",
  durationInMonths: "duration_in_months",
  start: "start",
  end: "end",
  affiliateId: "affiliate",
  requiredSubscriptionProductId: "requires_subscription_product",
} as const;

const actionHandlers: ProviderActionHandlers<"zylvie", ActionHandler> = {
  get_current_user(input, fetcher) {
    return requestZylvieJson({
      apiKey: input.apiKey,
      path: "/me",
      method: "GET",
      fetcher,
      phase: "execute",
    });
  },
  create_product(input, fetcher) {
    if (input.input.pricingModel === "subscription") {
      if (input.input.interval === undefined) {
        throw new ProviderRequestError(400, "interval is required when pricingModel is subscription.");
      }
      if (input.input.intervalCount === undefined) {
        throw new ProviderRequestError(400, "intervalCount is required when pricingModel is subscription.");
      }
    }
    return mutation(input, fetcher, "/products/create", "POST", productFieldMap);
  },
  update_product(input, fetcher) {
    return mutation(input, fetcher, "/products/update", "PUT", {
      id: "id",
      ...productFieldMap,
    });
  },
  delete_product(input, fetcher) {
    return mutation(input, fetcher, "/products/delete", "DELETE", { id: "id" });
  },
  create_coupon(input, fetcher) {
    if (input.input.type === "percentage" && typeof input.input.amount === "number" && input.input.amount > 100) {
      throw new ProviderRequestError(400, "amount must not exceed 100 for percentage coupons.");
    }
    if (input.input.isStorewide === false && input.input.productIds === undefined) {
      throw new ProviderRequestError(400, "productIds is required when isStorewide is false.");
    }
    return mutation(input, fetcher, "/coupons/create", "POST", couponFieldMap);
  },
  update_coupon(input, fetcher) {
    return mutation(input, fetcher, "/coupons/update", "PUT", {
      id: "id",
      ...couponFieldMap,
    });
  },
  delete_coupon(input, fetcher) {
    return mutation(input, fetcher, "/coupons/delete", "DELETE", { id: "id" });
  },
  list_coupons(input, fetcher) {
    return requestZylvieJson({
      apiKey: input.apiKey,
      path: "/coupons/list",
      method: "GET",
      query: typeof input.input.archived === "boolean" ? { archived: String(input.input.archived) } : undefined,
      fetcher,
      phase: "execute",
    });
  },
  verify_license_key(input, fetcher) {
    return requestZylvieJson({
      apiKey: input.apiKey,
      path: "/licensekeys/verify",
      method: "GET",
      query: {
        product_id: requireString(input.input.productId, "productId"),
        license_key: requireString(input.input.licenseKey, "licenseKey"),
      },
      fetcher,
      phase: "execute",
    });
  },
  redeem_license_key(input, fetcher) {
    return mutation(input, fetcher, "/licensekeys/redeem", "POST", {
      licenseKey: "license_key",
    });
  },
  refund_license_key(input, fetcher) {
    return mutation(input, fetcher, "/licensekeys/refund", "POST", {
      licenseKey: "license_key",
    });
  },
  async verify_subscriptions(input, fetcher) {
    const payload = await requestZylvieJson({
      apiKey: input.apiKey,
      path: "/subscriptions/verify",
      method: "GET",
      query: { email: requireString(input.input.email, "email") },
      fetcher,
      phase: "execute",
    });
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Zylvie subscription verification response must be an array");
    }
    return { subscriptions: payload };
  },
};

export async function validateZylvieCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<ZylvieCredentialCheck> {
  const payload = await requestZylvieJson({
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    path: "/me",
    method: "GET",
    fetcher,
    phase: "validate",
  });
  const user = requiredResponseRecord(payload, "Zylvie current-user response");
  const brand = optionalString(user.brand)?.trim();
  const email = optionalString(user.email)?.trim();

  return {
    accountLabel: brand || email || "Zylvie API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: zylvieApiBaseUrl,
      validationEndpoint: "/me",
    },
  };
}

export async function executeZylvieAction(input: ApiKeyActionRequest, fetcher: typeof fetch): Promise<unknown> {
  const handler = getProviderActionHandler(actionHandlers, input.actionName);
  if (!handler) {
    throw new ProviderRequestError(500, `Zylvie action is not implemented yet: ${input.actionName}`);
  }
  return handler(input, fetcher);
}

export async function requestZylvieJson(input: {
  apiKey: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: RequestPhase;
}): Promise<unknown> {
  const url = new URL(input.path, zylvieApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const timeoutHandle = createProviderTimeout(undefined);

  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: timeoutHandle.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createRequestError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || (error instanceof DOMException && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "Zylvie request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zylvie request failed: ${error.message}` : "Zylvie request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function mutation(
  input: ApiKeyActionRequest,
  fetcher: typeof fetch,
  path: string,
  method: "POST" | "PUT" | "DELETE",
  fieldMap: Record<string, string>,
) {
  const body: Record<string, unknown> = {};
  for (const [inputField, upstreamField] of Object.entries(fieldMap)) {
    if (input.input[inputField] !== undefined) {
      body[upstreamField] = input.input[inputField];
    }
  }
  return requestZylvieJson({
    apiKey: input.apiKey,
    path,
    method,
    body,
    fetcher,
    phase: "execute",
  });
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zylvie returned invalid JSON");
  }
}

function createRequestError(response: Response, payload: unknown, phase: RequestPhase) {
  const message = extractErrorMessage(payload) ?? `Zylvie request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(409, message);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "error", "detail"]) {
    const value = optionalString(record[key])?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}
