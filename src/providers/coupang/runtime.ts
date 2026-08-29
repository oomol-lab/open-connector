import { createHmac } from "node:crypto";
import {
  optionalBoolean,
  optionalNumber as asOptionalNumber,
  optionalString as asOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent as connectorUserAgent } from "../provider-runtime.ts";

export const coupangApiBaseUrl = "https://api-gateway.coupang.com";
const productBasePath = "/v2/providers/seller_api/apis/api/v1/marketplace";

interface CoupangCredential {
  vendorId: string;
  accessKey: string;
  secretKey: string;
  market: "KR" | "TW";
}

interface CoupangActionInput {
  actionName: string;
  input: Record<string, unknown>;
  values: Record<string, string>;
}

interface CoupangRequestInput {
  credential: CoupangCredential;
  fetcher: typeof fetch;
  method?: string;
  path: string;
  phase?: "validate" | "execute";
  query?: Record<string, string | number | boolean | undefined>;
}

interface ValidationResult {
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export async function validateCoupangCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<ValidationResult> {
  const credential = readCoupangCredential(input);
  await requestCoupangJson({
    credential,
    fetcher,
    phase: "validate",
    path: `${productBasePath}/seller-products`,
    query: { vendorId: credential.vendorId, maxPerPage: 1 },
  });
  return {
    accountLabel: `Coupang ${credential.vendorId}`,
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: coupangApiBaseUrl,
      vendorId: credential.vendorId,
      market: credential.market,
      validationPath: `${productBasePath}/seller-products`,
    },
  };
}

export async function executeCoupangAction(input: CoupangActionInput, fetcher: typeof fetch): Promise<unknown> {
  const credential = readCoupangCredential(input.values);
  const actionInput = input.input;
  switch (input.actionName) {
    case "list_products":
      return normalizeListResponse(
        await requestCoupangJson({
          credential,
          fetcher,
          path: `${productBasePath}/seller-products`,
          query: {
            vendorId: credential.vendorId,
            nextToken: asOptionalString(actionInput.nextToken),
            maxPerPage: asOptionalNumber(actionInput.maxPerPage),
            sellerProductId: asOptionalNumber(actionInput.sellerProductId),
            sellerProductName: asOptionalString(actionInput.sellerProductName),
            status: asOptionalString(actionInput.status),
            manufacture: asOptionalString(actionInput.manufacture),
            createdAt: asOptionalString(actionInput.createdAt),
          },
        }),
      );
    case "get_product":
      return normalizeObjectResponse(
        await requestCoupangJson({
          credential,
          fetcher,
          path: `${productBasePath}/seller-products/${requirePositiveInteger(actionInput.sellerProductId, "sellerProductId")}`,
        }),
      );
    case "get_item_inventory":
      return normalizeObjectResponse(
        await requestCoupangJson({
          credential,
          fetcher,
          path: `${productBasePath}/vendor-items/${requirePositiveInteger(actionInput.vendorItemId, "vendorItemId")}/inventories`,
        }),
      );
    case "update_item_quantity":
      return normalizeMutationResponse(
        await requestCoupangJson({
          credential,
          fetcher,
          method: "PUT",
          path: `${productBasePath}/vendor-items/${requirePositiveInteger(actionInput.vendorItemId, "vendorItemId")}/quantities/${requireNonNegativeInteger(actionInput.quantity, "quantity")}`,
        }),
      );
    case "update_item_price": {
      const apMinSalePrice = asOptionalNumber(actionInput.apMinSalePrice);
      const apActive = optionalBoolean(actionInput.apActive);
      if ((apMinSalePrice == null) !== (apActive == null)) {
        throw new ProviderRequestError(400, "apMinSalePrice and apActive must be provided together");
      }
      const price = requirePositiveInteger(actionInput.price, "price");
      if (price % 10 !== 0) {
        throw new ProviderRequestError(400, "price must use Coupang's 10-won unit");
      }
      if (apMinSalePrice != null && price <= apMinSalePrice) {
        throw new ProviderRequestError(400, "apMinSalePrice must be less than price");
      }
      return normalizeMutationResponse(
        await requestCoupangJson({
          credential,
          fetcher,
          method: "PUT",
          path: `${productBasePath}/vendor-items/${requirePositiveInteger(actionInput.vendorItemId, "vendorItemId")}/prices/${price}`,
          query: {
            forceSalePriceUpdate: optionalBoolean(actionInput.forceSalePriceUpdate),
            apMinSalePrice,
            apActive,
          },
        }),
      );
    }
    case "list_orders":
      return normalizeListResponse(
        await requestCoupangJson({
          credential,
          fetcher,
          path: `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(credential.vendorId)}/ordersheets`,
          query: {
            createdAtFrom: requireString(actionInput.createdAtFrom, "createdAtFrom"),
            createdAtTo: requireString(actionInput.createdAtTo, "createdAtTo"),
            status: requireString(actionInput.status, "status"),
            nextToken: asOptionalString(actionInput.nextToken),
            maxPerPage: asOptionalNumber(actionInput.maxPerPage),
          },
        }),
      );
    case "get_order":
      return normalizeListResponse(
        await requestCoupangJson({
          credential,
          fetcher,
          path: `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(credential.vendorId)}/${requirePositiveInteger(actionInput.orderId, "orderId")}/ordersheets`,
        }),
      );
    case "list_return_requests": {
      validateReturnRequestInput(actionInput);
      return normalizeListResponse(
        await requestCoupangJson({
          credential,
          fetcher,
          path: `/v2/providers/openapi/apis/api/v6/vendors/${encodeURIComponent(credential.vendorId)}/returnRequests`,
          query: {
            searchType: asOptionalString(actionInput.searchType),
            createdAtFrom: requireString(actionInput.createdAtFrom, "createdAtFrom"),
            createdAtTo: requireString(actionInput.createdAtTo, "createdAtTo"),
            status: asOptionalString(actionInput.status),
            cancelType: asOptionalString(actionInput.cancelType),
            nextToken: asOptionalString(actionInput.nextToken),
            maxPerPage: asOptionalNumber(actionInput.maxPerPage),
            orderId: asOptionalNumber(actionInput.orderId),
          },
        }),
      );
    }
  }
}

function validateReturnRequestInput(input: Record<string, unknown>) {
  const searchType = asOptionalString(input.searchType);
  const cancelType = asOptionalString(input.cancelType);
  if (searchType === "timeFrame" && (input.nextToken != null || input.maxPerPage != null || input.orderId != null)) {
    throw new ProviderRequestError(
      400,
      "nextToken, maxPerPage, and orderId are not supported with searchType=timeFrame",
    );
  }
  if (cancelType === "CANCEL" && (input.status != null || input.orderId != null)) {
    throw new ProviderRequestError(400, "status and orderId are not supported with cancelType=CANCEL");
  }
}

export function readCoupangCredential(input: Record<string, string>): CoupangCredential {
  const vendorId = requireCredential(input.vendorId, "vendorId");
  const accessKey = requireCredential(input.accessKey, "accessKey");
  const secretKey = requireCredential(input.secretKey, "secretKey");
  const market = input.market?.trim().toUpperCase() || "KR";
  if (market !== "KR" && market !== "TW") {
    throw new ProviderRequestError(400, "market must be KR or TW");
  }
  return { vendorId, accessKey, secretKey, market };
}

async function requestCoupangJson(input: CoupangRequestInput) {
  const url = new URL(input.path, coupangApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) url.searchParams.append(key, String(value));
  }
  const method = input.method ?? "GET";
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json;charset=UTF-8",
    "user-agent": connectorUserAgent,
    "x-market": input.credential.market,
  });
  applyCoupangSignature(method, url, headers, input.credential);
  const response = await input.fetcher(url, { method, headers });
  const payload = await readPayload(response);
  if (!response.ok || isErrorPayload(payload)) {
    throw createCoupangError(response.status, payload, input.phase ?? "execute");
  }
  return payload;
}

export function applyCoupangSignature(method: string, url: URL, headers: Headers, credential: CoupangCredential): void {
  const datetime = formatCoupangDatetime(new Date());
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  const signature = createHmac("sha256", credential.secretKey)
    .update(`${datetime}${method.toUpperCase()}${url.pathname}${query}`)
    .digest("hex");
  headers.set(
    "authorization",
    `CEA algorithm=HmacSHA256, access-key=${credential.accessKey}, signed-date=${datetime}, signature=${signature}`,
  );
  headers.set("x-market", credential.market);
}

function formatCoupangDatetime(date: Date) {
  const iso = date.toISOString();
  return `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 19).split(":").join("")}Z`;
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    throw new Error("response is not an object");
  } catch {
    throw new ProviderRequestError(502, "Coupang returned an invalid JSON response");
  }
}

function isErrorPayload(payload: Record<string, unknown>) {
  return typeof payload.code === "string" && payload.code.toUpperCase() === "ERROR";
}

function createCoupangError(status: number, payload: Record<string, unknown>, phase: "validate" | "execute") {
  const message = asOptionalString(payload.message)?.trim() || `Coupang request failed with ${status}`;
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 403) return new ProviderRequestError(403, message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 400 ? status : 502, message);
}

function normalizeListResponse(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.data)) {
    throw malformedResponse("data must be an array");
  }
  const nextToken = payload.nextToken;
  if (nextToken != null && typeof nextToken !== "string") {
    throw malformedResponse("nextToken must be a string or null");
  }
  return {
    code: requireResponseCode(payload.code),
    message: requireResponseMessage(payload.message),
    nextToken: nextToken ?? null,
    items: payload.data,
  };
}

function normalizeObjectResponse(payload: Record<string, unknown>) {
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw malformedResponse("data must be an object");
  }
  return {
    code: requireResponseCode(payload.code),
    message: requireResponseMessage(payload.message),
    data,
  };
}

function normalizeMutationResponse(payload: Record<string, unknown>) {
  return {
    code: requireResponseCode(payload.code),
    message: requireResponseMessage(payload.message),
  };
}

function requireResponseCode(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return value;
  throw malformedResponse("code must be a string or number");
}

function requireResponseMessage(value: unknown) {
  if (typeof value === "string") return value;
  throw malformedResponse("message must be a string");
}

function malformedResponse(detail: string) {
  return new ProviderRequestError(502, `Coupang returned a malformed response: ${detail}`);
}

function requireCredential(value: string | undefined, fieldName: string) {
  const normalized = value?.trim();
  if (!normalized) throw new ProviderRequestError(400, `${fieldName} is required`);
  return normalized;
}

function requireString(value: unknown, fieldName: string) {
  const normalized = asOptionalString(value)?.trim();
  if (!normalized) throw new ProviderRequestError(400, `${fieldName} is required`);
  return normalized;
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
}

function requireNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
}
