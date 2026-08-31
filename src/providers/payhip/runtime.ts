import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  optionalIntegerLike,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const payhipApiBaseUrl = "https://payhip.com/api/v2";
const payhipValidationPath = "/coupons";

type PayhipActionContext = ApiKeyProviderContext;
type PayhipActionHandler = (input: Record<string, unknown>, context: PayhipActionContext) => Promise<unknown>;

interface PayhipRequestOptions {
  path: string;
  fetcher: typeof fetch;
  mode: "validate" | "execute";
  method?: "GET" | "POST" | "PUT" | "DELETE";
  apiKey?: string;
  productSecretKey?: string;
  query?: Record<string, string | undefined>;
  form?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

export const payhipActionHandlers: ProviderActionHandlers<"payhip", PayhipActionHandler> = {
  create_coupon(input, context) {
    return createCoupon(input, context);
  },
  get_coupon(input, context) {
    return getCoupon(input, context);
  },
  list_coupons(input, context) {
    return listCoupons(input, context);
  },
  update_coupon(input, context) {
    return updateCoupon(input, context);
  },
  delete_coupon(input, context) {
    return deleteCoupon(input, context);
  },
  verify_license(input, context) {
    return licenseOperation("verify", input, context);
  },
  enable_license(input, context) {
    return licenseOperation("enable", input, context);
  },
  disable_license(input, context) {
    return licenseOperation("disable", input, context);
  },
  decrease_license_uses(input, context) {
    return licenseOperation("decrease", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("payhip", payhipActionHandlers);

export async function validatePayhipCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPayhipJson({
    path: payhipValidationPath,
    apiKey,
    fetcher,
    mode: "validate",
    query: {
      page: "1",
    },
  });

  const coupons = readCoupons(payload);
  return {
    profile: {
      accountId: "payhip-api-key",
      displayName: "Payhip API Key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: payhipApiBaseUrl,
      validationEndpoint: payhipValidationPath,
      firstCouponId: coupons[0]?.id ?? null,
    },
  };
}

async function createCoupon(input: Record<string, unknown>, context: PayhipActionContext) {
  const payload = await requestPayhipJson({
    path: "/coupons",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    form: toCouponForm(input),
  });

  return {
    coupon: normalizeCoupon(readSingleObject(payload, "Payhip create_coupon missing coupon data")),
  };
}

async function getCoupon(input: Record<string, unknown>, context: PayhipActionContext) {
  const couponId = requirePositiveInteger(input.couponId, "couponId");
  const payload = await requestPayhipJson({
    path: `/coupons/${encodeURIComponent(String(couponId))}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    coupon: normalizeCoupon(readSingleObject(payload, "Payhip get_coupon missing coupon data")),
  };
}

async function listCoupons(input: Record<string, unknown>, context: PayhipActionContext) {
  const payload = await requestPayhipJson({
    path: "/coupons",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: {
      page: input.page == null ? undefined : String(requirePositiveInteger(input.page, "page")),
    },
  });
  const body = requireObject(payload, "Payhip list_coupons returned an invalid payload");
  const coupons = readCoupons(payload).map(normalizeCoupon);

  return {
    coupons,
    page: nullableInteger(readAny(body, "page", "current_page")),
    perPage: nullableInteger(readAny(body, "per_page", "perPage")),
    total: nullableInteger(readAny(body, "total", "total_count", "totalCount")),
    raw: body,
  };
}

async function updateCoupon(input: Record<string, unknown>, context: PayhipActionContext) {
  const couponId = requirePositiveInteger(input.couponId, "couponId");
  const payload = await requestPayhipJson({
    path: `/coupons/${encodeURIComponent(String(couponId))}`,
    method: "PUT",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    form: toCouponForm(input),
  });

  return {
    coupon: normalizeCoupon(readSingleObject(payload, "Payhip update_coupon missing coupon data")),
  };
}

async function deleteCoupon(input: Record<string, unknown>, context: PayhipActionContext) {
  const couponId = requirePositiveInteger(input.couponId, "couponId");
  const payload = await requestPayhipJson({
    path: `/coupons/${encodeURIComponent(String(couponId))}`,
    method: "DELETE",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    deleted: true,
    couponId,
    raw: optionalRecord(payload) ?? {},
  };
}

async function licenseOperation(
  operation: "verify" | "enable" | "disable" | "decrease",
  input: Record<string, unknown>,
  context: PayhipActionContext,
) {
  const payload = await requestPayhipJson({
    path: `/license/${operation}`,
    method: "POST",
    productSecretKey: requiredString(input.productSecretKey, "productSecretKey", providerInputError),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    form: {
      license_key: requiredString(input.licenseKey, "licenseKey", providerInputError),
    },
  });

  return {
    license: normalizeLicense(payload),
  };
}

async function requestPayhipJson(options: PayhipRequestOptions) {
  const url = new URL(`${payhipApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const body = options.form ? new URLSearchParams(stringifyForm(options.form)) : undefined;
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (options.apiKey) {
    headers["payhip-api-key"] = options.apiKey;
  }
  if (options.productSecretKey) {
    headers["product-secret-key"] = options.productSecretKey;
  }
  if (body) {
    headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error instanceof Error ? error.message : "Payhip request failed",
    );
  }

  const payload = await readPayhipPayload(response);
  if (!response.ok) {
    throw mapPayhipError(response.status, payload, options.mode);
  }

  return payload;
}

async function readPayhipPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function mapPayhipError(status: number, payload: unknown, mode: "validate" | "execute") {
  const message = readErrorMessage(payload) ?? `Payhip API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 404 || status === 422 || status === 400) {
    return new ProviderRequestError(status === 422 ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const errors = body.errors;
  if (Array.isArray(errors) && typeof errors[0] === "string") {
    return errors[0];
  }

  return (
    optionalString(body.error) ?? optionalString(body.message) ?? optionalString(optionalRecord(body.error)?.message)
  );
}

function toCouponForm(input: Record<string, unknown>) {
  validateCouponDiscount(input);
  return {
    code: requiredString(input.code, "code", providerInputError),
    coupon_type: requiredString(input.couponType, "couponType", providerInputError),
    notes: readOptionalString(input.notes),
    amount_off: readOptionalNumber(input.amountOff),
    percent_off: readOptionalNumber(input.percentOff),
    product_key: readOptionalString(input.productKey),
    collection_id: readOptionalString(input.collectionId),
    usage_limit: readOptionalNumber(input.usageLimit),
  };
}

function validateCouponDiscount(input: Record<string, unknown>): void {
  if ((input.amountOff == null) === (input.percentOff == null)) {
    throw new ProviderRequestError(400, "Exactly one of amountOff or percentOff is required.");
  }
  if (input.couponType === "single" && input.productKey == null) {
    throw new ProviderRequestError(400, "productKey is required when couponType is single.");
  }
  if (input.couponType === "collection" && input.collectionId == null) {
    throw new ProviderRequestError(400, "collectionId is required when couponType is collection.");
  }
}

function stringifyForm(form: Record<string, string | number | undefined>) {
  return Object.fromEntries(
    Object.entries(form)
      .filter((entry): entry is [string, string | number] => entry[1] != null)
      .map(([key, value]) => [key, String(value)]),
  );
}

function readCoupons(payload: unknown) {
  const body = requireObject(payload, "Payhip returned an invalid coupon list payload");
  const list = readAny(body, "data", "coupons", "results");
  if (!Array.isArray(list)) {
    throw new ProviderRequestError(502, "Payhip coupon list response missing coupons");
  }
  return list.map((item) => requireObject(item, "Payhip returned an invalid coupon object"));
}

function readSingleObject(payload: unknown, message: string) {
  const body = requireObject(payload, message);
  const data = readAny(body, "data", "coupon");
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return body;
}

function normalizeCoupon(coupon: Record<string, unknown>) {
  return {
    id: requirePositiveInteger(readAny(coupon, "id", "coupon_id"), "id"),
    code: requiredString(coupon.code, "code", providerResponseError),
    couponType: requiredString(
      readAny(coupon, "coupon_type", "couponType", "type"),
      "couponType",
      providerResponseError,
    ),
    notes: nullableString(coupon.notes),
    amountOff: nullableInteger(readAny(coupon, "amount_off", "amountOff")),
    percentOff: nullableNumber(readAny(coupon, "percent_off", "percentOff")),
    productKey: nullableString(readAny(coupon, "product_key", "productKey")),
    collectionId: nullableString(readAny(coupon, "collection_id", "collectionId")),
    usageLimit: nullableInteger(readAny(coupon, "usage_limit", "usageLimit", "limit")),
    startDate: nullableString(readAny(coupon, "start_date", "startDate")),
    endDate: nullableString(readAny(coupon, "end_date", "endDate", "expiry")),
    minimumPurchaseAmount: nullableInteger(readAny(coupon, "minimum_purchase_amount", "minimumPurchaseAmount")),
    raw: coupon,
  };
}

function normalizeLicense(payload: unknown) {
  const body = requireObject(payload, "Payhip returned an invalid license payload");
  const check = optionalRecord(body.check);
  return {
    valid: readBoolean(body.valid, "valid"),
    message: nullableString(body.message),
    check: check
      ? {
          uses: nullableInteger(check.uses),
          enabled: nullableBoolean(check.enabled),
          raw: check,
        }
      : null,
    raw: body,
  };
}

function readAny(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (input[key] !== undefined) {
      return input[key];
    }
  }
  return undefined;
}

function requireObject(value: unknown, message: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function readOptionalString(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, "string input is required");
  }
  return value;
}

function readOptionalNumber(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new ProviderRequestError(400, "number input is required");
  }
  return value;
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  const parsed = optionalIntegerLike(value, fieldName, providerInputError);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function nullableString(value: unknown) {
  return value == null ? null : (optionalRawString(value) ?? String(value));
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  const number = optionalNumber(value) ?? Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableInteger(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  return optionalIntegerLike(value, "integer", providerResponseError) ?? null;
}

function nullableBoolean(value: unknown) {
  if (value == null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function readBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Payhip returned an invalid ${fieldName} payload`);
  }
  return value;
}
