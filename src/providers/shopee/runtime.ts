import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";

import { createHmac } from "node:crypto";
import {
  looseArray as asArrayOrEmpty,
  optionalInteger as asOptionalInteger,
  optionalNumber as asOptionalNumber,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
  optionalBoolean,
} from "../../core/cast.ts";
import { createGuardedFetch } from "../../core/guarded-fetch.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerUserAgent as connectorUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

interface ShopeeEntityToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface ShopeeTokenInventory {
  shops: Record<string, ShopeeEntityToken>;
  merchants: Record<string, ShopeeEntityToken>;
}

interface ShopeeRequestInput {
  path: string;
  level: "public" | "shop" | "merchant";
  clientConfig: OAuthClientConfig;
  providerSecret?: Record<string, unknown>;
  accessToken?: string;
  entityId?: number;
  query?: Record<string, string | number | boolean | readonly unknown[] | undefined>;
  body?: Record<string, unknown> | FormData;
  fetcher: typeof fetch;
}

interface ShopeeActionContext {
  clientConfig: OAuthClientConfig;
  providerSecret?: Record<string, unknown>;
  fetcher: typeof fetch;
}

interface ShopeeNormalizedResponse {
  requestId?: string;
  data: Record<string, unknown>;
}

const shopeeImageMaxBytes = 10 * 1024 * 1024;
const shopeeImageContentTypes = new Set(["image/jpeg", "image/png"]);

function createShopeeError(code: string, message: string, status: number): ProviderRequestError {
  return new ProviderRequestError(status, message, undefined, code);
}

function asObjectOrEmpty(value: unknown): Record<string, unknown> {
  return asOptionalObject(value) ?? {};
}

function createSsrfGuardedFetch(
  fetcher: typeof fetch,
  options: { fieldName: string; requireHttps?: boolean },
): typeof fetch {
  const guardedFetch = createGuardedFetch({
    fetch: fetcher,
    createError: (message) => createShopeeError("invalid_input", message, 400),
  });
  return async (input, init) => {
    const url = assertPublicHttpUrl(String(input), {
      fieldName: options.fieldName,
      createError: (message) => createShopeeError("invalid_input", message, 400),
    });
    if (options.requireHttps && url.protocol !== "https:") {
      throw createShopeeError("invalid_input", `${options.fieldName} must use HTTPS.`, 400);
    }
    return guardedFetch(url, init);
  };
}

export interface ShopeeTokenPayload {
  access_token?: unknown;
  refresh_token?: unknown;
  expire_in?: unknown;
  shop_id?: unknown;
  merchant_id?: unknown;
  shop_id_list?: unknown;
  merchant_id_list?: unknown;
  request_id?: unknown;
  error?: unknown;
  message?: unknown;
}

export interface ShopeeParsedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  shopIds: number[];
  merchantIds: number[];
  requestId?: string;
}

export interface ShopeeRefreshInventoryResult {
  inventory: ShopeeTokenInventory;
  representative: ShopeeEntityToken;
}

export function resolveShopeeApiBaseUrl(clientConfig: OAuthClientConfig): string {
  const apiBaseUrl = clientConfig.extra.apiBaseUrl?.trim();
  if (!apiBaseUrl) {
    throw createShopeeError("provider_error", "Shopee API Base URL is unavailable.", 500);
  }
  return apiBaseUrl;
}

export function parseShopeePartnerId(clientConfig: OAuthClientConfig): number {
  const partnerId = Number(clientConfig.clientId);
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) {
    throw createShopeeError("provider_error", "Shopee Partner ID must be a positive integer.", 500);
  }
  return partnerId;
}

function getShopeePartnerKey(clientConfig: OAuthClientConfig) {
  const partnerKey = clientConfig.clientSecret.trim();
  if (!partnerKey) {
    throw createShopeeError("provider_error", "Shopee Partner Key is unavailable.", 500);
  }
  return partnerKey;
}

export function createShopeeSignature(input: {
  partnerId: number;
  partnerKey: string;
  path: string;
  timestamp: number;
  accessToken?: string;
  entityId?: number;
}): string {
  const base = [input.partnerId, input.path, input.timestamp, input.accessToken, input.entityId]
    .filter((value) => value != null)
    .join("");
  return createHmac("sha256", input.partnerKey).update(base).digest("hex");
}

export function parseShopeeToken(payload: ShopeeTokenPayload, now: Date = new Date()): ShopeeParsedToken {
  assertShopeePayloadSuccess(payload, "Shopee token request");
  const accessToken = requireString(payload.access_token, "access_token");
  const refreshToken = requireString(payload.refresh_token, "refresh_token");
  const expiresIn = asOptionalInteger(payload.expire_in);
  if (expiresIn == null || expiresIn <= 0) {
    throw createShopeeError("provider_error", "Shopee token response is missing a valid expire_in value.", 502);
  }
  const shopIds = uniqueEntityIds([
    ...asArrayOrEmpty(payload.shop_id_list),
    ...(payload.shop_id == null ? [] : [payload.shop_id]),
  ]);
  const merchantIds = uniqueEntityIds([
    ...asArrayOrEmpty(payload.merchant_id_list),
    ...(payload.merchant_id == null ? [] : [payload.merchant_id]),
  ]);
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(now.getTime() + expiresIn * 1_000).toISOString(),
    shopIds,
    merchantIds,
    requestId: asOptionalString(payload.request_id),
  };
}

export function createInitialShopeeTokenInventory(token: ShopeeParsedToken): ShopeeTokenInventory {
  const entityToken = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
  };
  return {
    shops: Object.fromEntries(token.shopIds.map((id) => [String(id), entityToken])),
    merchants: Object.fromEntries(token.merchantIds.map((id) => [String(id), entityToken])),
  };
}

export function readShopeeTokenInventory(providerSecret: Record<string, unknown> | undefined): ShopeeTokenInventory {
  const inventory = asOptionalObject(providerSecret?.tokenInventory);
  return {
    shops: readEntityTokens(inventory?.shops),
    merchants: readEntityTokens(inventory?.merchants),
  };
}

export async function refreshShopeeTokenInventory(input: {
  clientConfig: OAuthClientConfig;
  providerSecret?: Record<string, unknown>;
  fallbackRefreshToken: string;
  fetcher: typeof fetch;
  now?: Date;
}): Promise<ShopeeRefreshInventoryResult> {
  const previous = readShopeeTokenInventory(input.providerSecret);
  const shopEntries = Object.entries(previous.shops);
  const merchantEntries = Object.entries(previous.merchants);
  if (shopEntries.length === 0 && merchantEntries.length === 0) {
    throw createShopeeError(
      "provider_error",
      "Shopee connection has no authorized shop or merchant tokens to refresh.",
      409,
    );
  }

  const shops: Record<string, ShopeeEntityToken> = {};
  const merchants: Record<string, ShopeeEntityToken> = {};
  for (const [id, token] of shopEntries) {
    shops[id] = await refreshShopeeEntityToken({
      clientConfig: input.clientConfig,
      entityType: "shop",
      entityId: Number(id),
      refreshToken: token.refreshToken || input.fallbackRefreshToken,
      fetcher: input.fetcher,
      now: input.now,
    });
  }
  for (const [id, token] of merchantEntries) {
    merchants[id] = await refreshShopeeEntityToken({
      clientConfig: input.clientConfig,
      entityType: "merchant",
      entityId: Number(id),
      refreshToken: token.refreshToken || input.fallbackRefreshToken,
      fetcher: input.fetcher,
      now: input.now,
    });
  }
  const representative = Object.values(merchants)[0] ?? Object.values(shops)[0];
  if (!representative) {
    throw createShopeeError("provider_error", "Shopee token refresh returned no tokens.", 502);
  }
  return { inventory: { shops, merchants }, representative };
}

export async function requestShopeeToken(input: {
  clientConfig: OAuthClientConfig;
  body: Record<string, unknown>;
  path: "/api/v2/auth/token/get" | "/api/v2/auth/access_token/get";
  fetcher: typeof fetch;
  now?: Date;
}): Promise<ShopeeParsedToken> {
  const payload = await requestShopee({
    path: input.path,
    level: "public",
    clientConfig: input.clientConfig,
    body: input.body,
    fetcher: input.fetcher,
    now: input.now,
  });
  return parseShopeeToken(payload as ShopeeTokenPayload, input.now);
}

export async function executeShopeeAction(
  actionName: string,
  input: Record<string, unknown>,
  context: ShopeeActionContext,
): Promise<ShopeeNormalizedResponse> {
  switch (actionName) {
    case "get_merchant_info":
      return executeEntityGet("/api/v2/merchant/get_merchant_info", "merchant", input, context);
    case "list_merchant_shops":
      return executeEntityGet("/api/v2/merchant/get_shop_list_by_merchant", "merchant", input, context, {
        page_no: asOptionalInteger(input.page) ?? 1,
        page_size: asOptionalInteger(input.pageSize) ?? 100,
      });
    case "get_shop_info":
      return executeEntityGet("/api/v2/shop/get_shop_info", "shop", input, context);
    case "list_global_items":
      return executeEntityGet("/api/v2/global_product/get_global_item_list", "merchant", input, context, {
        offset: asOptionalString(input.cursor),
        page_size: asOptionalInteger(input.pageSize) ?? 50,
        update_time_from: asOptionalInteger(input.updatedFrom),
        update_time_to: asOptionalInteger(input.updatedTo),
      });
    case "get_global_items":
      return executeEntityGet("/api/v2/global_product/get_global_item_info", "merchant", input, context, {
        global_item_id_list: asArrayOrEmpty(input.globalItemIds).join(","),
      });
    case "list_global_categories":
      return executeEntityGet("/api/v2/global_product/get_category", "merchant", input, context, {
        language: asOptionalString(input.language) ?? "en",
      });
    case "get_global_attribute_tree":
      return executeEntityGet("/api/v2/global_product/get_attribute_tree", "merchant", input, context, {
        category_id_list: asArrayOrEmpty(input.categoryIds).join(","),
        language: asOptionalString(input.language) ?? "en",
      });
    case "list_global_brands":
      return executeEntityGet("/api/v2/global_product/get_brand_list", "merchant", input, context, {
        category_id: asOptionalInteger(input.categoryId),
        offset: asOptionalInteger(input.offset) ?? 0,
        page_size: asOptionalInteger(input.pageSize) ?? 100,
        status: asOptionalInteger(input.status) ?? 1,
      });
    case "upload_product_image":
      return uploadShopeeProductImage(input, context);
    case "create_global_item":
      return executeEntityPost(
        "/api/v2/global_product/add_global_item",
        "merchant",
        input,
        context,
        createGlobalItemBody(input),
      );
    case "list_shop_items":
      return executeEntityGet("/api/v2/product/get_item_list", "shop", input, context, {
        offset: asOptionalInteger(input.offset) ?? 0,
        page_size: asOptionalInteger(input.pageSize) ?? 100,
        item_status: asArrayOrEmpty(input.statuses),
        update_time_from: asOptionalInteger(input.updatedFrom),
        update_time_to: asOptionalInteger(input.updatedTo),
      });
    case "get_shop_items":
      return executeEntityGet("/api/v2/product/get_item_base_info", "shop", input, context, {
        item_id_list: asArrayOrEmpty(input.itemIds).join(","),
        need_tax_info: optionalBoolean(input.includeTaxInfo),
        need_complaint_policy: optionalBoolean(input.includeComplaintPolicy),
      });
    case "get_item_models":
      return executeEntityGet("/api/v2/product/get_model_list", "shop", input, context, {
        item_id: asOptionalInteger(input.itemId),
      });
    case "update_item_prices":
      return executeEntityPost("/api/v2/product/update_price", "shop", input, context, createItemPriceBody(input));
    case "update_item_stocks":
      return executeEntityPost("/api/v2/product/update_stock", "shop", input, context, createItemStockBody(input));
    case "list_orders":
      validateOrderTimeRange(input);
      return executeEntityGet("/api/v2/order/get_order_list", "shop", input, context, {
        time_range_field: asOptionalString(input.timeRangeField) ?? "update_time",
        time_from: asOptionalInteger(input.timeFrom),
        time_to: asOptionalInteger(input.timeTo),
        page_size: asOptionalInteger(input.pageSize) ?? 100,
        cursor: asOptionalString(input.cursor),
        order_status: asOptionalString(input.orderStatus),
      });
    case "get_orders":
      return executeEntityGet("/api/v2/order/get_order_detail", "shop", input, context, {
        order_sn_list: asArrayOrEmpty(input.orderSerialNumbers).join(","),
        response_optional_fields: asArrayOrEmpty(input.optionalFields).join(",") || undefined,
      });
    case "get_shipping_parameters":
      return executePackageGet("/api/v2/logistics/get_shipping_parameter", input, context);
    case "ship_order":
      return executeEntityPost("/api/v2/logistics/ship_order", "shop", input, context, createShipOrderBody(input));
    case "get_tracking_number":
      return executePackageGet("/api/v2/logistics/get_tracking_number", input, context, {
        response_optional_fields: asArrayOrEmpty(input.optionalFields).join(",") || undefined,
      });
    case "get_tracking_info":
      return executePackageGet("/api/v2/logistics/get_tracking_info", input, context);
    case "list_returns":
      validateReturnTimeRanges(input);
      return executeEntityGet("/api/v2/returns/get_return_list", "shop", input, context, {
        page_no: asOptionalInteger(input.page) ?? 1,
        page_size: asOptionalInteger(input.pageSize) ?? 40,
        create_time_from: asOptionalInteger(input.createdFrom),
        create_time_to: asOptionalInteger(input.createdTo),
        update_time_from: asOptionalInteger(input.updatedFrom),
        update_time_to: asOptionalInteger(input.updatedTo),
        status: asOptionalString(input.status),
        negotiation_status: asOptionalString(input.negotiationStatus),
        seller_proof_status: asOptionalString(input.sellerProofStatus),
        seller_compensation_status: asOptionalString(input.sellerCompensationStatus),
      });
    case "get_return":
      return executeEntityGet("/api/v2/returns/get_return_detail", "shop", input, context, {
        return_sn: asOptionalString(input.returnSerialNumber),
      });
    case "get_order_escrow":
      return executeEntityGet("/api/v2/payment/get_escrow_detail", "shop", input, context, {
        order_sn: asOptionalString(input.orderSerialNumber),
      });
  }
  throw createShopeeError("invalid_input", `Unknown Shopee action: ${actionName}`, 400);
}

function createItemPriceBody(input: Record<string, unknown>) {
  return {
    item_id: asOptionalInteger(input.itemId),
    price_list: asArrayOrEmpty(input.prices).map((value) => {
      const price = asObjectOrEmpty(value);
      return {
        model_id: asOptionalInteger(price.modelId) ?? 0,
        original_price: asOptionalNumber(price.originalPrice),
      };
    }),
  };
}

function createItemStockBody(input: Record<string, unknown>) {
  return {
    item_id: asOptionalInteger(input.itemId),
    stock_list: asArrayOrEmpty(input.stocks).map((value) => {
      const stock = asObjectOrEmpty(value);
      return {
        model_id: asOptionalInteger(stock.modelId) ?? 0,
        seller_stock: asArrayOrEmpty(stock.sellerStock).map((locationValue) => {
          const location = asObjectOrEmpty(locationValue);
          return {
            location_id: asOptionalString(location.locationId),
            stock: asOptionalInteger(location.stock),
          };
        }),
      };
    }),
  };
}

function createShipOrderBody(input: Record<string, unknown>) {
  const pickup = asOptionalObject(input.pickup);
  const dropoff = asOptionalObject(input.dropoff);
  const nonIntegrated = asOptionalObject(input.nonIntegrated);
  const shippingMethodCount = [pickup, dropoff, nonIntegrated].filter(Boolean).length;
  if (shippingMethodCount !== 1) {
    throw createShopeeError("invalid_input", "Provide exactly one of pickup, dropoff, or nonIntegrated.", 400);
  }
  return {
    order_sn: asOptionalString(input.orderSerialNumber),
    package_number: asOptionalString(input.packageNumber),
    pickup: pickup
      ? {
          address_id: asOptionalInteger(pickup.addressId),
          pickup_time_id: asOptionalString(pickup.pickupTimeId),
          tracking_number: asOptionalString(pickup.trackingNumber),
        }
      : undefined,
    dropoff: dropoff
      ? {
          branch_id: asOptionalInteger(dropoff.branchId),
          sender_real_name: asOptionalString(dropoff.senderRealName),
          tracking_number: asOptionalString(dropoff.trackingNumber),
          slug: asOptionalString(dropoff.slug),
        }
      : undefined,
    non_integrated: nonIntegrated ? { tracking_number: asOptionalString(nonIntegrated.trackingNumber) } : undefined,
  };
}

async function uploadShopeeProductImage(input: Record<string, unknown>, context: ShopeeActionContext) {
  const imageUrl = asOptionalString(input.imageUrl);
  if (!imageUrl) {
    throw createShopeeError("invalid_input", "imageUrl is required.", 400);
  }
  const guardedFetch = createSsrfGuardedFetch(context.fetcher, {
    fieldName: "imageUrl",
    requireHttps: true,
  });
  const response = await runProviderRequest({ label: "Shopee image download" }, (signal) =>
    guardedFetch(imageUrl, { signal }),
  );
  if (!response.ok) {
    throw createShopeeError("provider_error", `Shopee image download failed with HTTP ${response.status}.`, 502);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !shopeeImageContentTypes.has(contentType)) {
    throw createShopeeError("invalid_input", "imageUrl must return a JPG, JPEG, or PNG image.", 400);
  }
  const bytes = await readImageBytes(response);
  const extension = contentType === "image/png" ? "png" : "jpg";
  const body = new FormData();
  body.set("image", new File([bytes], `product.${extension}`, { type: contentType }));
  const scene = asOptionalString(input.scene);
  const ratio = asOptionalString(input.ratio);
  if (scene) body.set("scene", scene);
  if (ratio) body.set("ratio", ratio);
  const payload = await requestShopee({
    path: "/api/v2/media_space/upload_image",
    level: "public",
    clientConfig: context.clientConfig,
    body,
    fetcher: context.fetcher,
  });
  return normalizeShopeeResponse(payload);
}

async function readImageBytes(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > shopeeImageMaxBytes) {
    throw createShopeeError("invalid_input", "imageUrl exceeds Shopee's 10 MB image limit.", 400);
  }
  if (!response.body) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > shopeeImageMaxBytes) {
      await reader.cancel();
      throw createShopeeError("invalid_input", "imageUrl exceeds Shopee's 10 MB image limit.", 400);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function createGlobalItemBody(input: Record<string, unknown>) {
  const imageIds = asArrayOrEmpty(input.imageIds);
  const attributes = asArrayOrEmpty(input.attributes);
  const sellerStock = asArrayOrEmpty(input.sellerStock);
  const packageLength = asOptionalNumber(input.packageLength);
  const packageWidth = asOptionalNumber(input.packageWidth);
  const packageHeight = asOptionalNumber(input.packageHeight);
  const dimensionCount = [packageLength, packageWidth, packageHeight].filter((value) => value != null).length;
  if (dimensionCount !== 0 && dimensionCount !== 3) {
    throw createShopeeError(
      "invalid_input",
      "packageLength, packageWidth, and packageHeight must be provided together.",
      400,
    );
  }
  const brandId = asOptionalInteger(input.brandId);
  const brandName = asOptionalString(input.brandName);
  return {
    category_id: asOptionalInteger(input.categoryId),
    global_item_name: asOptionalString(input.name),
    description: asOptionalString(input.description),
    global_item_sku: asOptionalString(input.sku),
    image: imageIds.length > 0 ? { image_id_list: imageIds } : undefined,
    original_price: asOptionalNumber(input.originalPrice),
    normal_stock: asOptionalInteger(input.stock),
    weight: asOptionalNumber(input.weight),
    dimension:
      packageLength != null && packageWidth != null && packageHeight != null
        ? {
            package_length: packageLength,
            package_width: packageWidth,
            package_height: packageHeight,
          }
        : undefined,
    pre_order: { days_to_ship: asOptionalInteger(input.daysToShip) },
    condition: asOptionalString(input.condition),
    brand: brandId != null || brandName != null ? { brand_id: brandId, original_brand_name: brandName } : undefined,
    attribute_list:
      attributes.length > 0
        ? attributes.map((value) => {
            const attribute = asObjectOrEmpty(value);
            return {
              attribute_id: asOptionalInteger(attribute.attributeId),
              attribute_value_list: asArrayOrEmpty(attribute.values).map((item) => {
                const attributeValue = asObjectOrEmpty(item);
                return {
                  value_id: asOptionalInteger(attributeValue.valueId),
                  original_value_name: asOptionalString(attributeValue.originalValueName),
                  value_unit: asOptionalString(attributeValue.valueUnit),
                };
              }),
            };
          })
        : undefined,
    seller_stock:
      sellerStock.length > 0
        ? sellerStock.map((value) => {
            const stock = asObjectOrEmpty(value);
            return {
              location_id: asOptionalString(stock.locationId),
              stock: asOptionalInteger(stock.stock),
            };
          })
        : undefined,
  };
}

export async function fetchShopeeEntityInfo(input: {
  entityType: "shop" | "merchant";
  entityId: number;
  accessToken: string;
  clientConfig: OAuthClientConfig;
  fetcher: typeof fetch;
}): Promise<Record<string, unknown>> {
  const path = input.entityType === "shop" ? "/api/v2/shop/get_shop_info" : "/api/v2/merchant/get_merchant_info";
  return requestShopee({
    path,
    level: input.entityType,
    entityId: input.entityId,
    accessToken: input.accessToken,
    clientConfig: input.clientConfig,
    fetcher: input.fetcher,
  });
}

async function executeEntityGet(
  path: string,
  entityType: "shop" | "merchant",
  input: Record<string, unknown>,
  context: ShopeeActionContext,
  query?: Record<string, string | number | boolean | readonly unknown[] | undefined>,
) {
  const inventory = readShopeeTokenInventory(context.providerSecret);
  const entities = entityType === "shop" ? inventory.shops : inventory.merchants;
  const requestedId = asOptionalInteger(input[`${entityType}Id`]);
  const entityId = resolveEntityId(entityType, requestedId, entities);
  const payload = await requestShopee({
    path,
    level: entityType,
    entityId,
    clientConfig: context.clientConfig,
    providerSecret: context.providerSecret,
    query,
    fetcher: context.fetcher,
  });
  return normalizeShopeeResponse(payload);
}

function executePackageGet(
  path: string,
  input: Record<string, unknown>,
  context: ShopeeActionContext,
  extraQuery?: Record<string, string | number | boolean | readonly unknown[] | undefined>,
) {
  return executeEntityGet(path, "shop", input, context, {
    order_sn: asOptionalString(input.orderSerialNumber),
    package_number: asOptionalString(input.packageNumber),
    ...extraQuery,
  });
}

async function executeEntityPost(
  path: string,
  entityType: "shop" | "merchant",
  input: Record<string, unknown>,
  context: ShopeeActionContext,
  body: Record<string, unknown>,
) {
  const inventory = readShopeeTokenInventory(context.providerSecret);
  const entities = entityType === "shop" ? inventory.shops : inventory.merchants;
  const requestedId = asOptionalInteger(input[`${entityType}Id`]);
  const entityId = resolveEntityId(entityType, requestedId, entities);
  const payload = await requestShopee({
    path,
    level: entityType,
    entityId,
    clientConfig: context.clientConfig,
    providerSecret: context.providerSecret,
    body,
    fetcher: context.fetcher,
  });
  return normalizeShopeeResponse(payload);
}

async function requestShopee(input: ShopeeRequestInput & { now?: Date }): Promise<Record<string, unknown>> {
  const partnerId = parseShopeePartnerId(input.clientConfig);
  const timestamp = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  const token =
    input.level === "public"
      ? undefined
      : input.accessToken
        ? { accessToken: input.accessToken }
        : selectEntityToken(input.level, input.entityId, input.providerSecret);
  const sign = createShopeeSignature({
    partnerId,
    partnerKey: getShopeePartnerKey(input.clientConfig),
    path: input.path,
    timestamp,
    accessToken: token?.accessToken,
    entityId: input.entityId,
  });
  const url = new URL(input.path, resolveShopeeApiBaseUrl(input.clientConfig));
  url.searchParams.set("partner_id", String(partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  if (token) {
    url.searchParams.set("access_token", token.accessToken);
  }
  if (input.level === "shop") {
    url.searchParams.set("shop_id", String(input.entityId));
  }
  if (input.level === "merchant") {
    url.searchParams.set("merchant_id", String(input.entityId));
  }
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") url.searchParams.append(key, String(item));
      }
    } else if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return runProviderRequest({ label: "Shopee Open Platform" }, async (signal) => {
    const isFormData = input.body instanceof FormData;
    let requestBody: BodyInit | undefined;
    if (input.body instanceof FormData) {
      requestBody = input.body;
    } else if (input.body) {
      requestBody = JSON.stringify(input.body);
    }
    const response = await input.fetcher(url, {
      method: input.body ? "POST" : "GET",
      headers: {
        accept: "application/json",
        ...(!isFormData && input.body ? { "content-type": "application/json" } : {}),
        "user-agent": connectorUserAgent,
      },
      body: requestBody,
      signal,
    });
    const payload = asOptionalObject(await response.json().catch(() => undefined));
    if (!payload) {
      throw createShopeeError(
        "provider_error",
        `Shopee Open Platform returned a non-JSON response with HTTP ${response.status}.`,
        response.ok ? 502 : response.status,
      );
    }
    assertShopeePayloadSuccess(payload, "Shopee Open Platform", response.status);
    return payload;
  });
}

function validateReturnTimeRanges(input: Record<string, unknown>) {
  const createdFrom = asOptionalInteger(input.createdFrom);
  const updatedFrom = asOptionalInteger(input.updatedFrom);
  validateTimeRange(createdFrom, asOptionalInteger(input.createdTo), "Shopee return creation time range");
  validateTimeRange(updatedFrom, asOptionalInteger(input.updatedTo), "Shopee return update time range");
  if (createdFrom != null && updatedFrom != null && updatedFrom < createdFrom) {
    throw createShopeeError("invalid_input", "Shopee return update time must not start before creation time.", 400);
  }
}

function validateTimeRange(from: number | undefined, to: number | undefined, label: string) {
  if (from == null || to == null) return;
  if (to < from) {
    throw createShopeeError("invalid_input", `${label} must end after it starts.`, 400);
  }
  if (to - from > 15 * 24 * 60 * 60) {
    throw createShopeeError("invalid_input", `${label} cannot exceed 15 days.`, 400);
  }
}

function assertShopeePayloadSuccess(
  payload: {
    error?: unknown;
    message?: unknown;
    request_id?: unknown;
  },
  label: string,
  httpStatus = 200,
) {
  const error = asOptionalString(payload.error);
  if (!error && httpStatus < 400) {
    return;
  }
  const message = asOptionalString(payload.message);
  const requestId = asOptionalString(payload.request_id);
  const details = [error, message, requestId ? `request_id=${requestId}` : undefined].filter(Boolean).join(": ");
  throw createShopeeError(
    "provider_error",
    `${label} failed${details ? `: ${details}` : ""}`,
    httpStatus >= 400 ? httpStatus : 502,
  );
}

function selectEntityToken(
  entityType: "shop" | "merchant",
  entityId: number | undefined,
  providerSecret: Record<string, unknown> | undefined,
) {
  if (entityId == null) {
    throw createShopeeError("invalid_input", `Shopee ${entityType} ID is required.`, 400);
  }
  const inventory = readShopeeTokenInventory(providerSecret);
  const token = entityType === "shop" ? inventory.shops[String(entityId)] : inventory.merchants[String(entityId)];
  if (!token) {
    throw createShopeeError(
      "invalid_input",
      `Shopee ${entityType} ${entityId} is not authorized by this connection.`,
      400,
    );
  }
  return token;
}

function resolveEntityId(
  entityType: "shop" | "merchant",
  requestedId: number | undefined,
  entities: Record<string, ShopeeEntityToken>,
) {
  if (requestedId != null) {
    if (!entities[String(requestedId)]) {
      throw createShopeeError(
        "invalid_input",
        `Shopee ${entityType} ${requestedId} is not authorized by this connection.`,
        400,
      );
    }
    return requestedId;
  }
  const ids = Object.keys(entities).map(Number);
  if (ids.length === 1) {
    return ids[0]!;
  }
  throw createShopeeError(
    "invalid_input",
    ids.length === 0
      ? `This Shopee connection has no authorized ${entityType}.`
      : `This Shopee connection has multiple ${entityType}s; provide ${entityType}Id.`,
    400,
  );
}

function readEntityTokens(value: unknown): Record<string, ShopeeEntityToken> {
  const raw = asObjectOrEmpty(value);
  const result: Record<string, ShopeeEntityToken> = {};
  for (const [id, candidate] of Object.entries(raw)) {
    const token = asOptionalObject(candidate);
    const accessToken = asOptionalString(token?.accessToken);
    const refreshToken = asOptionalString(token?.refreshToken);
    const expiresAt = asOptionalString(token?.expiresAt);
    if (accessToken && refreshToken && expiresAt) {
      result[id] = { accessToken, refreshToken, expiresAt };
    }
  }
  return result;
}

async function refreshShopeeEntityToken(input: {
  clientConfig: OAuthClientConfig;
  entityType: "shop" | "merchant";
  entityId: number;
  refreshToken: string;
  fetcher: typeof fetch;
  now?: Date;
}) {
  const token = await requestShopeeToken({
    clientConfig: input.clientConfig,
    path: "/api/v2/auth/access_token/get",
    body: {
      partner_id: parseShopeePartnerId(input.clientConfig),
      [`${input.entityType}_id`]: input.entityId,
      refresh_token: input.refreshToken,
    },
    fetcher: input.fetcher,
    now: input.now,
  });
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
  };
}

function uniqueEntityIds(values: unknown[]) {
  const ids = values
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return [...new Set(ids)];
}

function requireString(value: unknown, fieldName: string) {
  const string = asOptionalString(value);
  if (!string) {
    throw createShopeeError("provider_error", `Shopee token response is missing ${fieldName}.`, 502);
  }
  return string;
}

function normalizeShopeeResponse(payload: Record<string, unknown>): ShopeeNormalizedResponse {
  return {
    requestId: asOptionalString(payload.request_id),
    data: payload,
  };
}

function validateOrderTimeRange(input: Record<string, unknown>) {
  const from = asOptionalInteger(input.timeFrom);
  const to = asOptionalInteger(input.timeTo);
  if (from == null || to == null) {
    throw createShopeeError("invalid_input", "timeFrom and timeTo are required.", 400);
  }
  if (to < from) {
    throw createShopeeError("invalid_input", "timeTo must not be earlier than timeFrom.", 400);
  }
  if (to - from > 15 * 24 * 60 * 60) {
    throw createShopeeError("invalid_input", "Shopee order time range cannot exceed 15 days.", 400);
  }
}
