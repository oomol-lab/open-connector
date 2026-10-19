import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";

import { createHmac } from "node:crypto";
import {
  looseArray,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalBoolean,
  recordOrEmpty,
} from "../../core/cast.ts";
import { createGuardedFetch } from "../../core/guarded-fetch.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, runProviderRequest } from "../provider-runtime.ts";

interface ShopeeSignatureInput {
  partnerId: number;
  partnerKey: string;
  path: string;
  timestamp: number;
  accessToken?: string;
  entityId?: number;
}

interface ShopeeRefreshInventoryInput {
  clientConfig: OAuthClientConfig;
  providerSecret?: Record<string, unknown>;
  fallbackRefreshToken: string;
  fetcher: typeof fetch;
  now?: Date;
}

interface ShopeeTokenRequestInput {
  clientConfig: OAuthClientConfig;
  body: Record<string, unknown>;
  path: "/api/v2/auth/token/get" | "/api/v2/auth/access_token/get";
  fetcher: typeof fetch;
  now?: Date;
}

interface ShopeeEntityInfoInput {
  entityType: "shop" | "merchant";
  entityId: number;
  accessToken: string;
  clientConfig: OAuthClientConfig;
  fetcher: typeof fetch;
}

interface ShopeeEntityTokenRefreshInput {
  clientConfig: OAuthClientConfig;
  entityType: "shop" | "merchant";
  entityId: number;
  refreshToken: string;
  fetcher: typeof fetch;
  now?: Date;
}

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

interface ShopeeGuardedFetchOptions {
  fieldName: string;
  requireHttps?: boolean;
}

function createSsrfGuardedFetch(fetcher: typeof fetch, options: ShopeeGuardedFetchOptions): typeof fetch {
  const guardedFetch = createGuardedFetch({
    fetch: fetcher,
    createError: (message) => new ProviderRequestError(400, message, undefined, "invalid_input"),
  });
  return async (input, init) => {
    const url = assertPublicHttpUrl(String(input), {
      fieldName: options.fieldName,
      createError: (message) => new ProviderRequestError(400, message, undefined, "invalid_input"),
    });
    if (options.requireHttps && url.protocol !== "https:") {
      throw new ProviderRequestError(400, `${options.fieldName} must use HTTPS.`, undefined, "invalid_input");
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
    throw new ProviderRequestError(500, "Shopee API Base URL is unavailable.", undefined, "provider_error");
  }
  return apiBaseUrl;
}

export function parseShopeePartnerId(clientConfig: OAuthClientConfig): number {
  const partnerId = Number(clientConfig.clientId);
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) {
    throw new ProviderRequestError(500, "Shopee Partner ID must be a positive integer.", undefined, "provider_error");
  }
  return partnerId;
}

function getShopeePartnerKey(clientConfig: OAuthClientConfig) {
  const partnerKey = clientConfig.clientSecret.trim();
  if (!partnerKey) {
    throw new ProviderRequestError(500, "Shopee Partner Key is unavailable.", undefined, "provider_error");
  }
  return partnerKey;
}

export function createShopeeSignature(input: ShopeeSignatureInput): string {
  const base = [input.partnerId, input.path, input.timestamp, input.accessToken, input.entityId]
    .filter((value) => value != null)
    .join("");
  return createHmac("sha256", input.partnerKey).update(base).digest("hex");
}

export function parseShopeeToken(payload: ShopeeTokenPayload, now: Date = new Date()): ShopeeParsedToken {
  assertShopeePayloadSuccess(payload, "Shopee token request");
  const accessToken = requireString(payload.access_token, "access_token");
  const refreshToken = requireString(payload.refresh_token, "refresh_token");
  const expiresIn = optionalInteger(payload.expire_in);
  if (expiresIn == null || expiresIn <= 0) {
    throw new ProviderRequestError(
      502,
      "Shopee token response is missing a valid expire_in value.",
      undefined,
      "provider_error",
    );
  }
  const shopIds = uniqueEntityIds([
    ...looseArray(payload.shop_id_list),
    ...(payload.shop_id == null ? [] : [payload.shop_id]),
  ]);
  const merchantIds = uniqueEntityIds([
    ...looseArray(payload.merchant_id_list),
    ...(payload.merchant_id == null ? [] : [payload.merchant_id]),
  ]);
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(now.getTime() + expiresIn * 1_000).toISOString(),
    shopIds,
    merchantIds,
    requestId: optionalString(payload.request_id),
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
  const inventory = optionalRecord(providerSecret?.tokenInventory);
  return {
    shops: readEntityTokens(inventory?.shops),
    merchants: readEntityTokens(inventory?.merchants),
  };
}

export async function refreshShopeeTokenInventory(
  input: ShopeeRefreshInventoryInput,
): Promise<ShopeeRefreshInventoryResult> {
  const previous = readShopeeTokenInventory(input.providerSecret);
  const shopEntries = Object.entries(previous.shops);
  const merchantEntries = Object.entries(previous.merchants);
  if (shopEntries.length === 0 && merchantEntries.length === 0) {
    throw new ProviderRequestError(
      409,
      "Shopee connection has no authorized shop or merchant tokens to refresh.",
      undefined,
      "provider_error",
    );
  }

  const shops: Record<string, ShopeeEntityToken> = {};
  const merchants: Record<string, ShopeeEntityToken> = {};
  for (const [id, token] of shopEntries) {
    try {
      shops[id] = await refreshShopeeEntityToken({
        clientConfig: input.clientConfig,
        entityType: "shop",
        entityId: Number(id),
        refreshToken: token.refreshToken || input.fallbackRefreshToken,
        fetcher: input.fetcher,
        now: input.now,
      });
    } catch {
      // 单个实体刷新失败时保留其他实体已经轮换成功的新令牌。
    }
  }
  for (const [id, token] of merchantEntries) {
    try {
      merchants[id] = await refreshShopeeEntityToken({
        clientConfig: input.clientConfig,
        entityType: "merchant",
        entityId: Number(id),
        refreshToken: token.refreshToken || input.fallbackRefreshToken,
        fetcher: input.fetcher,
        now: input.now,
      });
    } catch {
      // 单个实体刷新失败时保留其他实体已经轮换成功的新令牌。
    }
  }
  const representative = Object.values(merchants)[0] ?? Object.values(shops)[0];
  if (!representative) {
    throw new ProviderRequestError(502, "Shopee token refresh returned no tokens.", undefined, "provider_error");
  }
  return { inventory: { shops, merchants }, representative };
}

export async function requestShopeeToken(input: ShopeeTokenRequestInput): Promise<ShopeeParsedToken> {
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
        page_no: optionalInteger(input.page) ?? 1,
        page_size: optionalInteger(input.pageSize) ?? 100,
      });
    case "get_shop_info":
      return executeEntityGet("/api/v2/shop/get_shop_info", "shop", input, context);
    case "list_global_items":
      return executeEntityGet("/api/v2/global_product/get_global_item_list", "merchant", input, context, {
        offset: optionalString(input.cursor),
        page_size: optionalInteger(input.pageSize) ?? 50,
        update_time_from: optionalInteger(input.updatedFrom),
        update_time_to: optionalInteger(input.updatedTo),
      });
    case "get_global_items":
      return executeEntityGet("/api/v2/global_product/get_global_item_info", "merchant", input, context, {
        global_item_id_list: looseArray(input.globalItemIds).join(","),
      });
    case "list_global_categories":
      return executeEntityGet("/api/v2/global_product/get_category", "merchant", input, context, {
        language: optionalString(input.language) ?? "en",
      });
    case "get_global_attribute_tree":
      return executeEntityGet("/api/v2/global_product/get_attribute_tree", "merchant", input, context, {
        category_id_list: looseArray(input.categoryIds).join(","),
        language: optionalString(input.language) ?? "en",
      });
    case "list_global_brands":
      return executeEntityGet("/api/v2/global_product/get_brand_list", "merchant", input, context, {
        category_id: optionalInteger(input.categoryId),
        offset: optionalInteger(input.offset) ?? 0,
        page_size: optionalInteger(input.pageSize) ?? 100,
        status: optionalInteger(input.status) ?? 1,
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
        offset: optionalInteger(input.offset) ?? 0,
        page_size: optionalInteger(input.pageSize) ?? 100,
        item_status: looseArray(input.statuses),
        update_time_from: optionalInteger(input.updatedFrom),
        update_time_to: optionalInteger(input.updatedTo),
      });
    case "get_shop_items":
      return executeEntityGet("/api/v2/product/get_item_base_info", "shop", input, context, {
        item_id_list: looseArray(input.itemIds).join(","),
        need_tax_info: optionalBoolean(input.includeTaxInfo),
        need_complaint_policy: optionalBoolean(input.includeComplaintPolicy),
      });
    case "get_item_models":
      return executeEntityGet("/api/v2/product/get_model_list", "shop", input, context, {
        item_id: optionalInteger(input.itemId),
      });
    case "update_item_prices":
      return executeEntityPost("/api/v2/product/update_price", "shop", input, context, createItemPriceBody(input));
    case "update_item_stocks":
      return executeEntityPost("/api/v2/product/update_stock", "shop", input, context, createItemStockBody(input));
    case "list_orders":
      validateOrderTimeRange(input);
      return executeEntityGet("/api/v2/order/get_order_list", "shop", input, context, {
        time_range_field: optionalString(input.timeRangeField) ?? "update_time",
        time_from: optionalInteger(input.timeFrom),
        time_to: optionalInteger(input.timeTo),
        page_size: optionalInteger(input.pageSize) ?? 100,
        cursor: optionalString(input.cursor),
        order_status: optionalString(input.orderStatus),
      });
    case "get_orders":
      return executeEntityGet("/api/v2/order/get_order_detail", "shop", input, context, {
        order_sn_list: looseArray(input.orderSerialNumbers).join(","),
        response_optional_fields: looseArray(input.optionalFields).join(",") || undefined,
      });
    case "get_shipping_parameters":
      return executePackageGet("/api/v2/logistics/get_shipping_parameter", input, context);
    case "ship_order":
      return executeEntityPost("/api/v2/logistics/ship_order", "shop", input, context, createShipOrderBody(input));
    case "get_tracking_number":
      return executePackageGet("/api/v2/logistics/get_tracking_number", input, context, {
        response_optional_fields: looseArray(input.optionalFields).join(",") || undefined,
      });
    case "get_tracking_info":
      return executePackageGet("/api/v2/logistics/get_tracking_info", input, context);
    case "list_returns":
      validateReturnTimeRanges(input);
      return executeEntityGet("/api/v2/returns/get_return_list", "shop", input, context, {
        page_no: optionalInteger(input.page) ?? 1,
        page_size: optionalInteger(input.pageSize) ?? 40,
        create_time_from: optionalInteger(input.createdFrom),
        create_time_to: optionalInteger(input.createdTo),
        update_time_from: optionalInteger(input.updatedFrom),
        update_time_to: optionalInteger(input.updatedTo),
        status: optionalString(input.status),
        negotiation_status: optionalString(input.negotiationStatus),
        seller_proof_status: optionalString(input.sellerProofStatus),
        seller_compensation_status: optionalString(input.sellerCompensationStatus),
      });
    case "get_return":
      return executeEntityGet("/api/v2/returns/get_return_detail", "shop", input, context, {
        return_sn: optionalString(input.returnSerialNumber),
      });
    case "get_order_escrow":
      return executeEntityGet("/api/v2/payment/get_escrow_detail", "shop", input, context, {
        order_sn: optionalString(input.orderSerialNumber),
      });
  }
  throw new ProviderRequestError(400, `Unknown Shopee action: ${actionName}`, undefined, "invalid_input");
}

function createItemPriceBody(input: Record<string, unknown>) {
  return {
    item_id: optionalInteger(input.itemId),
    price_list: looseArray(input.prices).map((value) => {
      const price = recordOrEmpty(value);
      return {
        model_id: optionalInteger(price.modelId) ?? 0,
        original_price: optionalNumber(price.originalPrice),
      };
    }),
  };
}

function createItemStockBody(input: Record<string, unknown>) {
  return {
    item_id: optionalInteger(input.itemId),
    stock_list: looseArray(input.stocks).map((value) => {
      const stock = recordOrEmpty(value);
      return {
        model_id: optionalInteger(stock.modelId) ?? 0,
        seller_stock: looseArray(stock.sellerStock).map((locationValue) => {
          const location = recordOrEmpty(locationValue);
          return {
            location_id: optionalString(location.locationId),
            stock: optionalInteger(location.stock),
          };
        }),
      };
    }),
  };
}

function createShipOrderBody(input: Record<string, unknown>) {
  const pickup = optionalRecord(input.pickup);
  const dropoff = optionalRecord(input.dropoff);
  const nonIntegrated = optionalRecord(input.nonIntegrated);
  const shippingMethodCount = [pickup, dropoff, nonIntegrated].filter(Boolean).length;
  if (shippingMethodCount !== 1) {
    throw new ProviderRequestError(
      400,
      "Provide exactly one of pickup, dropoff, or nonIntegrated.",
      undefined,
      "invalid_input",
    );
  }
  return {
    order_sn: optionalString(input.orderSerialNumber),
    package_number: optionalString(input.packageNumber),
    pickup: pickup
      ? {
          address_id: optionalInteger(pickup.addressId),
          pickup_time_id: optionalString(pickup.pickupTimeId),
          tracking_number: optionalString(pickup.trackingNumber),
        }
      : undefined,
    dropoff: dropoff
      ? {
          branch_id: optionalInteger(dropoff.branchId),
          sender_real_name: optionalString(dropoff.senderRealName),
          tracking_number: optionalString(dropoff.trackingNumber),
          slug: optionalString(dropoff.slug),
        }
      : undefined,
    non_integrated: nonIntegrated ? { tracking_number: optionalString(nonIntegrated.trackingNumber) } : undefined,
  };
}

async function uploadShopeeProductImage(input: Record<string, unknown>, context: ShopeeActionContext) {
  const imageUrl = optionalString(input.imageUrl);
  if (!imageUrl) {
    throw new ProviderRequestError(400, "imageUrl is required.", undefined, "invalid_input");
  }
  const guardedFetch = createSsrfGuardedFetch(context.fetcher, {
    fieldName: "imageUrl",
    requireHttps: true,
  });
  const response = await runProviderRequest({ label: "Shopee image download" }, (signal) =>
    guardedFetch(imageUrl, { signal }),
  );
  if (!response.ok) {
    throw new ProviderRequestError(
      502,
      `Shopee image download failed with HTTP ${response.status}.`,
      undefined,
      "provider_error",
    );
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !shopeeImageContentTypes.has(contentType)) {
    throw new ProviderRequestError(400, "imageUrl must return a JPG, JPEG, or PNG image.", undefined, "invalid_input");
  }
  const bytes = await readImageBytes(response);
  const extension = contentType === "image/png" ? "png" : "jpg";
  const body = new FormData();
  body.set("image", new File([bytes], `product.${extension}`, { type: contentType }));
  const scene = optionalString(input.scene);
  const ratio = optionalString(input.ratio);
  if (scene) body.set("scene", scene);
  if (ratio) body.set("ratio", ratio);
  const inventory = readShopeeTokenInventory(context.providerSecret);
  const entityId = resolveEntityId("shop", optionalInteger(input.shopId), inventory.shops);
  const payload = await requestShopee({
    path: "/api/v2/media_space/upload_image",
    level: "shop",
    entityId,
    clientConfig: context.clientConfig,
    providerSecret: context.providerSecret,
    body,
    fetcher: context.fetcher,
  });
  return normalizeShopeeResponse(payload);
}

async function readImageBytes(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > shopeeImageMaxBytes) {
    throw new ProviderRequestError(400, "imageUrl exceeds Shopee's 10 MB image limit.", undefined, "invalid_input");
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
      throw new ProviderRequestError(400, "imageUrl exceeds Shopee's 10 MB image limit.", undefined, "invalid_input");
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
  const imageIds = looseArray(input.imageIds);
  const attributes = looseArray(input.attributes);
  const sellerStock = looseArray(input.sellerStock);
  const packageLength = optionalNumber(input.packageLength);
  const packageWidth = optionalNumber(input.packageWidth);
  const packageHeight = optionalNumber(input.packageHeight);
  const dimensionCount = [packageLength, packageWidth, packageHeight].filter((value) => value != null).length;
  if (dimensionCount !== 0 && dimensionCount !== 3) {
    throw new ProviderRequestError(
      400,
      "packageLength, packageWidth, and packageHeight must be provided together.",
      undefined,
      "invalid_input",
    );
  }
  const brandId = optionalInteger(input.brandId);
  const brandName = optionalString(input.brandName);
  return {
    category_id: optionalInteger(input.categoryId),
    global_item_name: optionalString(input.name),
    description: optionalString(input.description),
    global_item_sku: optionalString(input.sku),
    image: imageIds.length > 0 ? { image_id_list: imageIds } : undefined,
    original_price: optionalNumber(input.originalPrice),
    normal_stock: optionalInteger(input.stock),
    weight: optionalNumber(input.weight),
    dimension:
      packageLength != null && packageWidth != null && packageHeight != null
        ? {
            package_length: packageLength,
            package_width: packageWidth,
            package_height: packageHeight,
          }
        : undefined,
    pre_order: { days_to_ship: optionalInteger(input.daysToShip) },
    condition: optionalString(input.condition),
    brand: brandId != null || brandName != null ? { brand_id: brandId, original_brand_name: brandName } : undefined,
    attribute_list:
      attributes.length > 0
        ? attributes.map((value) => {
            const attribute = recordOrEmpty(value);
            return {
              attribute_id: optionalInteger(attribute.attributeId),
              attribute_value_list: looseArray(attribute.values).map((item) => {
                const attributeValue = recordOrEmpty(item);
                return {
                  value_id: optionalInteger(attributeValue.valueId),
                  original_value_name: optionalString(attributeValue.originalValueName),
                  value_unit: optionalString(attributeValue.valueUnit),
                };
              }),
            };
          })
        : undefined,
    seller_stock:
      sellerStock.length > 0
        ? sellerStock.map((value) => {
            const stock = recordOrEmpty(value);
            return {
              location_id: optionalString(stock.locationId),
              stock: optionalInteger(stock.stock),
            };
          })
        : undefined,
  };
}

export async function fetchShopeeEntityInfo(input: ShopeeEntityInfoInput): Promise<Record<string, unknown>> {
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
  const requestedId = optionalInteger(input[`${entityType}Id`]);
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
    order_sn: optionalString(input.orderSerialNumber),
    package_number: optionalString(input.packageNumber),
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
  const requestedId = optionalInteger(input[`${entityType}Id`]);
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
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
    };
    if (!isFormData && input.body) {
      headers["content-type"] = "application/json";
    }
    const response = await input.fetcher(url, {
      method: input.body ? "POST" : "GET",
      headers,
      body: requestBody,
      signal,
    });
    const payload = optionalRecord(await response.json().catch(() => undefined));
    if (!payload) {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Shopee Open Platform returned a non-JSON response with HTTP ${response.status}.`,
        undefined,
        "provider_error",
      );
    }
    assertShopeePayloadSuccess(payload, "Shopee Open Platform", response.status);
    return payload;
  });
}

function validateReturnTimeRanges(input: Record<string, unknown>) {
  const createdFrom = optionalInteger(input.createdFrom);
  const updatedFrom = optionalInteger(input.updatedFrom);
  validateTimeRange(createdFrom, optionalInteger(input.createdTo), "Shopee return creation time range");
  validateTimeRange(updatedFrom, optionalInteger(input.updatedTo), "Shopee return update time range");
  if (createdFrom != null && updatedFrom != null && updatedFrom < createdFrom) {
    throw new ProviderRequestError(
      400,
      "Shopee return update time must not start before creation time.",
      undefined,
      "invalid_input",
    );
  }
}

function validateTimeRange(from: number | undefined, to: number | undefined, label: string) {
  if (from == null || to == null) return;
  if (to < from) {
    throw new ProviderRequestError(400, `${label} must end after it starts.`, undefined, "invalid_input");
  }
  if (to - from > 15 * 24 * 60 * 60) {
    throw new ProviderRequestError(400, `${label} cannot exceed 15 days.`, undefined, "invalid_input");
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
  const error = optionalString(payload.error);
  if (!error && httpStatus < 400) {
    return;
  }
  const message = optionalString(payload.message);
  const requestId = optionalString(payload.request_id);
  const details = [error, message, requestId ? `request_id=${requestId}` : undefined].filter(Boolean).join(": ");
  throw new ProviderRequestError(
    httpStatus >= 400 ? httpStatus : 502,
    `${label} failed${details ? `: ${details}` : ""}`,
    undefined,
    "provider_error",
  );
}

function selectEntityToken(
  entityType: "shop" | "merchant",
  entityId: number | undefined,
  providerSecret: Record<string, unknown> | undefined,
) {
  if (entityId == null) {
    throw new ProviderRequestError(400, `Shopee ${entityType} ID is required.`, undefined, "invalid_input");
  }
  const inventory = readShopeeTokenInventory(providerSecret);
  const token = entityType === "shop" ? inventory.shops[String(entityId)] : inventory.merchants[String(entityId)];
  if (!token) {
    throw new ProviderRequestError(
      400,
      `Shopee ${entityType} ${entityId} is not authorized by this connection.`,
      undefined,
      "invalid_input",
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
      throw new ProviderRequestError(
        400,
        `Shopee ${entityType} ${requestedId} is not authorized by this connection.`,
        undefined,
        "invalid_input",
      );
    }
    return requestedId;
  }
  const ids = Object.keys(entities).map(Number);
  if (ids.length === 1) {
    return ids[0]!;
  }
  throw new ProviderRequestError(
    400,
    ids.length === 0
      ? `This Shopee connection has no authorized ${entityType}.`
      : `This Shopee connection has multiple ${entityType}s; provide ${entityType}Id.`,
    undefined,
    "invalid_input",
  );
}

function readEntityTokens(value: unknown): Record<string, ShopeeEntityToken> {
  const raw = recordOrEmpty(value);
  const result: Record<string, ShopeeEntityToken> = {};
  for (const [id, candidate] of Object.entries(raw)) {
    const token = optionalRecord(candidate);
    const accessToken = optionalString(token?.accessToken);
    const refreshToken = optionalString(token?.refreshToken);
    const expiresAt = optionalString(token?.expiresAt);
    if (accessToken && refreshToken && expiresAt) {
      result[id] = { accessToken, refreshToken, expiresAt };
    }
  }
  return result;
}

async function refreshShopeeEntityToken(input: ShopeeEntityTokenRefreshInput) {
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
  const string = optionalString(value);
  if (!string) {
    throw new ProviderRequestError(502, `Shopee token response is missing ${fieldName}.`, undefined, "provider_error");
  }
  return string;
}

function normalizeShopeeResponse(payload: Record<string, unknown>): ShopeeNormalizedResponse {
  return {
    requestId: optionalString(payload.request_id),
    data: payload,
  };
}

function validateOrderTimeRange(input: Record<string, unknown>) {
  const from = optionalInteger(input.timeFrom);
  const to = optionalInteger(input.timeTo);
  if (from == null || to == null) {
    throw new ProviderRequestError(400, "timeFrom and timeTo are required.", undefined, "invalid_input");
  }
  if (to < from) {
    throw new ProviderRequestError(400, "timeTo must not be earlier than timeFrom.", undefined, "invalid_input");
  }
  if (to - from > 15 * 24 * 60 * 60) {
    throw new ProviderRequestError(400, "Shopee order time range cannot exceed 15 days.", undefined, "invalid_input");
  }
}
