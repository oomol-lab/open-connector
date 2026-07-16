import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  base64Bytes,
  compactObject,
  nullableString,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import { providerFetch, providerUserAgent, ProviderRequestError, readTransitFileInput } from "../provider-runtime.ts";

const maxMediaUploadSourceBytes = 20 * 1024 * 1024;

interface WooCommerceCredentialContext {
  storeUrl: string;
  apiBaseUrl: string;
  wpApiBaseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  wordpressUsername?: string;
  wordpressApplicationPassword?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

interface WooCommerceRequestInput {
  context: WooCommerceCredentialContext;
  path: string;
  method?: string;
  query?: Array<[string, string | number | boolean | undefined]>;
  body?: Record<string, unknown>;
  phase: "validate" | "execute";
}

interface WooCommerceListResponse<T> {
  items: T[];
  total: number | null;
  totalPages: number | null;
}

interface WordPressMediaAuth {
  username: string;
  applicationPassword: string;
}

interface MediaMetadataUpdateResult {
  media: Record<string, unknown>;
  metadataUpdated: boolean | null;
  metadataError: string | null;
}

export const woocommerceActionHandlers: Record<string, ProviderRuntimeHandler<WooCommerceCredentialContext>> = {
  list_products: listProducts,
  get_product: getProduct,
  create_product: createProduct,
  update_product: updateProduct,
  list_product_categories(input, context) {
    return listProductTerms(input, context, "categories", "categories");
  },
  list_product_tags(input, context) {
    return listProductTerms(input, context, "tags", "tags");
  },
  list_product_attributes(_input, context) {
    return listProductAttributes(context);
  },
  list_product_attribute_terms: listProductAttributeTerms,
  list_product_variations: listProductVariations,
  get_product_variation: getProductVariation,
  create_product_variation: createProductVariation,
  update_product_variation: updateProductVariation,
  upload_media: uploadMedia,
  list_orders: listOrders,
  get_order: getOrder,
  create_order: createOrder,
  update_order: updateOrder,
  update_order_status: updateOrderStatus,
  list_order_notes: listOrderNotes,
  add_order_note: addOrderNote,
  list_customers: listCustomers,
  get_customer: getCustomer,
  list_coupons: listCoupons,
  get_coupon: getCoupon,
  create_coupon: createCoupon,
  update_coupon: updateCoupon,
};

export async function validateWooCommerceCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = resolveWooCommerceCredentialContext(input, fetcher, signal);
  await woocommerceRequest<unknown[]>({
    context,
    path: "/products",
    query: [["per_page", 1]],
    phase: "validate",
  });
  return {
    profile: {
      accountId: context.storeUrl,
      displayName: new URL(context.storeUrl).host,
    },
    grantedScopes: [],
    metadata: {
      storeUrl: context.storeUrl,
      apiBaseUrl: context.apiBaseUrl,
    },
  };
}

export function resolveWooCommerceCredentialContext(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  transitFiles?: TransitFileWriter,
): WooCommerceCredentialContext {
  const storeUrl = normalizeStoreUrl(requiredProviderString(input.storeUrl, "storeUrl"));
  const wordpressUsername = optionalString(input.wordpressUsername);
  const wordpressApplicationPassword = optionalString(input.wordpressApplicationPassword);
  return {
    storeUrl,
    apiBaseUrl: `${storeUrl}/wp-json/wc/v3`,
    wpApiBaseUrl: `${storeUrl}/wp-json/wp/v2`,
    consumerKey: requiredProviderString(input.consumerKey, "consumerKey"),
    consumerSecret: requiredProviderString(input.consumerSecret, "consumerSecret"),
    ...(wordpressUsername ? { wordpressUsername } : {}),
    ...(wordpressApplicationPassword ? { wordpressApplicationPassword } : {}),
    fetcher,
    signal,
    transitFiles,
  };
}

async function listProducts(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const payload = await woocommerceList<Record<string, unknown>>({
    context,
    path: "/products",
    query: [
      ["per_page", optionalInteger(input.perPage)],
      ["page", optionalInteger(input.page)],
      ["search", optionalString(input.search)],
      ["status", optionalString(input.status)],
      ["sku", optionalString(input.sku)],
      ["category", optionalString(input.category)],
      ["tag", optionalString(input.tag)],
      ["featured", optionalBoolean(input.featured)],
      ["on_sale", optionalBoolean(input.onSale)],
      ["order", optionalString(input.order)],
      ["orderby", optionalString(input.orderBy)],
    ],
  });
  return listResult("products", payload, normalizeProduct);
}

async function getProduct(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  return normalizeProduct((await getWooRecord(input, context, "productId", "/products")).data);
}

async function createProduct(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  return normalizeProduct(
    (
      await woocommerceRequest<Record<string, unknown>>({
        context,
        path: "/products",
        method: "POST",
        body: buildProductWriteBody(input),
        phase: "execute",
      })
    ).data,
  );
}

async function updateProduct(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const productId = requirePositiveInteger(input.productId, "productId");
  return normalizeProduct(
    (
      await woocommerceRequest<Record<string, unknown>>({
        context,
        path: `/products/${productId}`,
        method: "PUT",
        body: buildProductWriteBody(input),
        phase: "execute",
      })
    ).data,
  );
}

async function listProductTerms(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
  path: "categories" | "tags",
  outputKey: "categories" | "tags",
): Promise<unknown> {
  const payload = await woocommerceList<Record<string, unknown>>({
    context,
    path: `/products/${path}`,
    query: [
      ["per_page", optionalInteger(input.perPage)],
      ["page", optionalInteger(input.page)],
      ["search", optionalString(input.search)],
      ["order", optionalString(input.order)],
      ["orderby", optionalString(input.orderBy)],
    ],
  });
  return listResult(outputKey, payload, normalizeTerm);
}

async function listProductAttributes(context: WooCommerceCredentialContext): Promise<unknown> {
  const payload = await woocommerceRequest<Record<string, unknown>[]>({
    context,
    path: "/products/attributes",
    phase: "execute",
  });
  return {
    attributes: Array.isArray(payload.data) ? payload.data.map(normalizeProductAttribute) : [],
  };
}

async function listProductAttributeTerms(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
): Promise<unknown> {
  const attributeId = requirePositiveInteger(input.attributeId, "attributeId");
  const payload = await woocommerceList<Record<string, unknown>>({
    context,
    path: `/products/attributes/${attributeId}/terms`,
    query: [
      ["per_page", optionalInteger(input.perPage)],
      ["page", optionalInteger(input.page)],
      ["search", optionalString(input.search)],
    ],
  });
  return listResult("terms", payload, normalizeTerm);
}

async function listProductVariations(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
): Promise<unknown> {
  const productId = requirePositiveInteger(input.productId, "productId");
  const payload = await woocommerceList<Record<string, unknown>>({
    context,
    path: `/products/${productId}/variations`,
    query: [
      ["per_page", optionalInteger(input.perPage)],
      ["page", optionalInteger(input.page)],
      ["sku", optionalString(input.sku)],
    ],
  });
  return listResult("variations", payload, normalizeProductVariation);
}

async function getProductVariation(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
): Promise<unknown> {
  const productId = requirePositiveInteger(input.productId, "productId");
  const variationId = requirePositiveInteger(input.variationId, "variationId");
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: `/products/${productId}/variations/${variationId}`,
    phase: "execute",
  });
  return normalizeProductVariation(payload.data);
}

async function createProductVariation(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
): Promise<unknown> {
  const productId = requirePositiveInteger(input.productId, "productId");
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: `/products/${productId}/variations`,
    method: "POST",
    body: buildVariationWriteBody(input),
    phase: "execute",
  });
  return normalizeProductVariation(payload.data);
}

async function updateProductVariation(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
): Promise<unknown> {
  const productId = requirePositiveInteger(input.productId, "productId");
  const variationId = requirePositiveInteger(input.variationId, "variationId");
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: `/products/${productId}/variations/${variationId}`,
    method: "PUT",
    body: buildVariationWriteBody(input),
    phase: "execute",
  });
  return normalizeProductVariation(payload.data);
}

async function uploadMedia(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const username = requiredProviderString(context.wordpressUsername, "wordpressUsername");
  const applicationPassword = requiredProviderString(
    context.wordpressApplicationPassword,
    "wordpressApplicationPassword",
  );
  const source = await resolveMediaUploadSource(input, context);
  const response = await context.fetcher(`${context.wpApiBaseUrl}/media`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString("base64")}`,
      "content-disposition": `attachment; filename="${escapeHeaderFileName(source.fileName)}"`,
      "content-type": source.mimeType,
      "user-agent": providerUserAgent,
    },
    body: new Blob([toArrayBuffer(source.bytes)]),
    signal: context.signal,
  });
  const data = parseJson(await response.text());
  if (!response.ok) throw mapWooCommerceError(response.status, data, "execute");
  const media = optionalRecord(data) ?? {};
  return normalizeMedia(await updateUploadedMediaMetadata(input, context, { username, applicationPassword }, media));
}

async function listOrders(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const payload = await woocommerceList<Record<string, unknown>>({
    context,
    path: "/orders",
    query: [
      ["per_page", optionalInteger(input.perPage)],
      ["page", optionalInteger(input.page)],
      ["status", optionalString(input.status)],
      ["customer", optionalInteger(input.customer)],
      ["product", optionalInteger(input.product)],
      ["search", optionalString(input.search)],
      ["after", optionalString(input.after)],
      ["before", optionalString(input.before)],
      ["order", optionalString(input.order)],
      ["orderby", optionalString(input.orderBy)],
    ],
  });
  return listResult("orders", payload, normalizeOrder);
}

async function getOrder(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  return normalizeOrder((await getWooRecord(input, context, "orderId", "/orders")).data);
}

async function createOrder(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: "/orders",
    method: "POST",
    body: buildOrderWriteBody(input),
    phase: "execute",
  });
  return normalizeOrder(payload.data);
}

async function updateOrder(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const orderId = requirePositiveInteger(input.orderId, "orderId");
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: `/orders/${orderId}`,
    method: "PUT",
    body: buildOrderWriteBody(input),
    phase: "execute",
  });
  return normalizeOrder(payload.data);
}

async function updateOrderStatus(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
): Promise<unknown> {
  const orderId = requirePositiveInteger(input.orderId, "orderId");
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: `/orders/${orderId}`,
    method: "PUT",
    body: { status: requiredProviderString(input.status, "status") },
    phase: "execute",
  });
  return normalizeOrder(payload.data);
}

async function listOrderNotes(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const orderId = requirePositiveInteger(input.orderId, "orderId");
  const payload = await woocommerceRequest<Record<string, unknown>[]>({
    context,
    path: `/orders/${orderId}/notes`,
    phase: "execute",
  });
  return {
    notes: Array.isArray(payload.data) ? payload.data.map(normalizeOrderNote) : [],
  };
}

async function addOrderNote(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const orderId = requirePositiveInteger(input.orderId, "orderId");
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: `/orders/${orderId}/notes`,
    method: "POST",
    body: {
      note: requiredProviderString(input.note, "note"),
      customer_note: optionalBoolean(input.customerNote) ?? false,
    },
    phase: "execute",
  });
  return normalizeOrderNote(payload.data);
}

async function listCustomers(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const payload = await woocommerceList<Record<string, unknown>>({
    context,
    path: "/customers",
    query: [
      ["per_page", optionalInteger(input.perPage)],
      ["page", optionalInteger(input.page)],
      ["search", optionalString(input.search)],
      ["email", optionalString(input.email)],
      ["role", optionalString(input.role)],
      ["order", optionalString(input.order)],
      ["orderby", optionalString(input.orderBy)],
    ],
  });
  return listResult("customers", payload, normalizeCustomer);
}

async function getCustomer(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  return normalizeCustomer((await getWooRecord(input, context, "customerId", "/customers")).data);
}

async function listCoupons(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const payload = await woocommerceList<Record<string, unknown>>({
    context,
    path: "/coupons",
    query: [
      ["per_page", optionalInteger(input.perPage)],
      ["page", optionalInteger(input.page)],
      ["search", optionalString(input.search)],
      ["code", optionalString(input.code)],
      ["order", optionalString(input.order)],
      ["orderby", optionalString(input.orderBy)],
    ],
  });
  return listResult("coupons", payload, normalizeCoupon);
}

async function getCoupon(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  return normalizeCoupon((await getWooRecord(input, context, "couponId", "/coupons")).data);
}

async function createCoupon(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: "/coupons",
    method: "POST",
    body: buildCouponWriteBody(input),
    phase: "execute",
  });
  return normalizeCoupon(payload.data);
}

async function updateCoupon(input: Record<string, unknown>, context: WooCommerceCredentialContext): Promise<unknown> {
  const couponId = requirePositiveInteger(input.couponId, "couponId");
  const payload = await woocommerceRequest<Record<string, unknown>>({
    context,
    path: `/coupons/${couponId}`,
    method: "PUT",
    body: buildCouponWriteBody(input),
    phase: "execute",
  });
  return normalizeCoupon(payload.data);
}

async function getWooRecord(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
  idField: string,
  path: string,
): Promise<{ data: Record<string, unknown> }> {
  const id = requirePositiveInteger(input[idField], idField);
  return woocommerceRequest<Record<string, unknown>>({
    context,
    path: `${path}/${id}`,
    phase: "execute",
  });
}

async function woocommerceList<T>(input: Omit<WooCommerceRequestInput, "phase">): Promise<WooCommerceListResponse<T>> {
  const response = await woocommerceRequest<T[]>({ ...input, phase: "execute" });
  return {
    items: Array.isArray(response.data) ? response.data : [],
    total: parseHeaderInteger(response.headers.get("x-wp-total")),
    totalPages: parseHeaderInteger(response.headers.get("x-wp-totalpages")),
  };
}

async function woocommerceRequest<T>(input: WooCommerceRequestInput): Promise<{ data: T; headers: Headers }> {
  const url = new URL(`${input.context.apiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${input.context.consumerKey}:${input.context.consumerSecret}`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  const body = input.body ? JSON.stringify(input.body) : undefined;
  if (body) headers["content-type"] = "application/json";
  const response = await input.context.fetcher(url, {
    method: input.method ?? "GET",
    headers,
    body,
    signal: input.context.signal,
  });
  const data = parseJson(await response.text());
  if (!response.ok) throw mapWooCommerceError(response.status, data, input.phase);
  return { data: data as T, headers: response.headers };
}

function buildProductWriteBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    type: optionalString(input.type),
    status: optionalString(input.status),
    sku: optionalString(input.sku),
    regular_price: optionalString(input.regularPrice),
    sale_price: optionalString(input.salePrice),
    description: optionalString(input.description),
    short_description: optionalString(input.shortDescription),
    manage_stock: optionalBoolean(input.manageStock),
    stock_quantity: optionalInteger(input.stockQuantity),
    stock_status: optionalString(input.stockStatus),
    categories: optionalObjectArray(input.categories)?.map(buildIdReference),
    tags: optionalObjectArray(input.tags)?.map(buildIdReference),
    images: optionalObjectArray(input.images)?.map(buildProductImageInput),
    attributes: optionalObjectArray(input.attributes)?.map(buildProductAttributeInput),
  });
}

function buildVariationWriteBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    sku: optionalString(input.sku),
    regular_price: optionalString(input.regularPrice),
    sale_price: optionalString(input.salePrice),
    manage_stock: optionalBoolean(input.manageStock),
    stock_quantity: optionalInteger(input.stockQuantity),
    stock_status: optionalString(input.stockStatus),
    attributes: optionalObjectArray(input.attributes)?.map(buildVariationAttributeInput),
    image: optionalObject(input.image, buildProductImageInput),
  });
}

function buildOrderWriteBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    status: optionalString(input.status),
    customer_id: optionalInteger(input.customerId),
    currency: optionalString(input.currency),
    billing: optionalObject(input.billing, buildAddressInput),
    shipping: optionalObject(input.shipping, buildAddressInput),
    line_items: optionalObjectArray(input.lineItems)?.map(buildOrderLineItemInput),
    coupon_lines: optionalObjectArray(input.couponLines)?.map(buildCouponLineInput),
    shipping_lines: optionalObjectArray(input.shippingLines)?.map(buildShippingLineInput),
    customer_note: optionalString(input.customerNote),
    payment_method: optionalString(input.paymentMethod),
    payment_method_title: optionalString(input.paymentMethodTitle),
    set_paid: optionalBoolean(input.setPaid),
  });
}

function buildCouponWriteBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    code: optionalString(input.code),
    discount_type: optionalString(input.discountType),
    amount: optionalString(input.amount),
    description: optionalString(input.description),
    individual_use: optionalBoolean(input.individualUse),
    exclude_sale_items: optionalBoolean(input.excludeSaleItems),
    free_shipping: optionalBoolean(input.freeShipping),
    date_expires: optionalString(input.dateExpires),
    minimum_amount: optionalString(input.minimumAmount),
    maximum_amount: optionalString(input.maximumAmount),
  });
}

function buildIdReference(input: Record<string, unknown>): Record<string, number> {
  return { id: requirePositiveInteger(input.id, "id") };
}

function buildProductImageInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: optionalInteger(input.id),
    src: optionalString(input.src),
    name: optionalString(input.name),
    alt: optionalString(input.alt),
  });
}

function buildProductAttributeInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: optionalInteger(input.id),
    name: optionalString(input.name),
    position: optionalInteger(input.position),
    visible: optionalBoolean(input.visible),
    variation: optionalBoolean(input.variation),
    options: Array.isArray(input.options) ? input.options.map((value) => String(value)) : undefined,
  });
}

function buildVariationAttributeInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: optionalInteger(input.id),
    name: optionalString(input.name),
    option: requiredProviderString(input.option, "option"),
  });
}

function buildAddressInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    first_name: optionalString(input.firstName),
    last_name: optionalString(input.lastName),
    company: optionalString(input.company),
    address_1: optionalString(input.address1),
    address_2: optionalString(input.address2),
    city: optionalString(input.city),
    state: optionalString(input.state),
    postcode: optionalString(input.postcode),
    country: optionalString(input.country),
    email: optionalString(input.email),
    phone: optionalString(input.phone),
  });
}

function buildOrderLineItemInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    product_id: requirePositiveInteger(input.productId, "productId"),
    variation_id: optionalInteger(input.variationId),
    quantity: optionalNumber(input.quantity),
    subtotal: optionalString(input.subtotal),
    total: optionalString(input.total),
  });
}

function buildCouponLineInput(input: Record<string, unknown>): Record<string, string> {
  return { code: requiredProviderString(input.code, "code") };
}

function buildShippingLineInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: optionalInteger(input.id),
    method_id: optionalString(input.methodId),
    method_title: optionalString(input.methodTitle),
    total: optionalString(input.total),
  });
}

async function updateUploadedMediaMetadata(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
  auth: WordPressMediaAuth,
  media: Record<string, unknown>,
): Promise<MediaMetadataUpdateResult> {
  const title = optionalString(input.title);
  const altText = optionalString(input.altText);
  if (title === undefined && altText === undefined) return { media, metadataUpdated: null, metadataError: null };
  const mediaId = optionalInteger(media.id);
  if (mediaId == null || mediaId <= 0) {
    return {
      media,
      metadataUpdated: false,
      metadataError: "WordPress media response did not include a valid media ID",
    };
  }
  try {
    const response = await context.fetcher(`${context.wpApiBaseUrl}/media/${mediaId}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${auth.username}:${auth.applicationPassword}`).toString("base64")}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(compactObject({ title, alt_text: altText })),
      signal: context.signal,
    });
    const data = parseJson(await response.text());
    if (!response.ok) {
      const error = mapWooCommerceError(response.status, data, "execute");
      return { media, metadataUpdated: false, metadataError: error.message };
    }
    return { media: optionalRecord(data) ?? media, metadataUpdated: true, metadataError: null };
  } catch (error) {
    return {
      media,
      metadataUpdated: false,
      metadataError: error instanceof Error ? error.message : "media metadata update failed",
    };
  }
}

async function resolveMediaUploadSource(
  input: Record<string, unknown>,
  context: WooCommerceCredentialContext,
): Promise<{ bytes: Uint8Array; fileName: string; mimeType: string }> {
  const fileInput = optionalRecord(input.file);
  const fileUrl = optionalString(input.fileUrl);
  const contentBase64 = optionalString(input.contentBase64);
  const sourceCount =
    Number(fileInput !== undefined) + Number(fileUrl !== undefined) + Number(contentBase64 !== undefined);
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of file, fileUrl, or contentBase64 is required");
  }
  if (fileInput) {
    const file = await readTransitFileInput(fileInput, context);
    if (file.file.size > maxMediaUploadSourceBytes) {
      throw new ProviderRequestError(400, `upload source exceeds ${maxMediaUploadSourceBytes} bytes`);
    }
    return {
      bytes: new Uint8Array(await file.file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.mimeType,
    };
  }
  if (fileUrl) {
    const fileName = requiredProviderString(input.fileName, "fileName");
    const sourceUrl = assertPublicHttpUrl(fileUrl, { fieldName: "fileUrl", createError: providerInputError });
    return {
      bytes: await downloadSourceBytes(sourceUrl.toString(), context),
      fileName,
      mimeType: optionalString(input.mimeType) ?? inferMimeType(fileName),
    };
  }
  const fileName = requiredProviderString(input.fileName, "fileName");
  return {
    bytes: decodeBase64Content(contentBase64),
    fileName,
    mimeType: optionalString(input.mimeType) ?? inferMimeType(fileName),
  };
}

async function downloadSourceBytes(sourceUrl: string, context: WooCommerceCredentialContext): Promise<Uint8Array> {
  const response = await providerFetch(sourceUrl, {
    method: "GET",
    // Workers has no "error" redirect mode; "manual" never follows either, and
    // the !response.ok check below rejects any 3xx.
    redirect: "manual",
    signal: context.signal,
  });
  if (!response.ok) throw new ProviderRequestError(502, `failed to fetch upload source: ${response.status}`);
  return readBoundedResponseBytes(response, {
    maxBytes: maxMediaUploadSourceBytes,
    fieldName: "upload source",
    createError: providerInputError,
  });
}

function decodeBase64Content(contentBase64: string | undefined): Uint8Array {
  const bytes = base64Bytes(contentBase64, "contentBase64", providerInputError);
  if (bytes.byteLength > maxMediaUploadSourceBytes) {
    throw new ProviderRequestError(400, `upload source exceeds ${maxMediaUploadSourceBytes} bytes`);
  }
  return bytes;
}

function normalizeStoreUrl(rawValue: string): string {
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new ProviderRequestError(400, "storeUrl must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") throw new ProviderRequestError(400, "storeUrl must use HTTPS");
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const pathname = trimTrailingSlashes(url.pathname);
  return `${url.origin}${pathname === "/" ? "" : pathname}`;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapWooCommerceError(status: number, data: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const payload = optionalRecord(data) ?? {};
  const message = optionalString(payload.message) ?? `WooCommerce API request failed with status ${status}`;
  if (phase === "validate" || status === 400 || status === 401 || status === 403 || status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status || 500, message);
}

function normalizeProduct(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    name: nullableText(input.name),
    slug: nullableText(input.slug),
    permalink: nullableText(input.permalink),
    type: nullableText(input.type),
    status: nullableText(input.status),
    sku: nullableText(input.sku),
    price: nullableText(input.price),
    regularPrice: nullableText(input.regular_price),
    salePrice: nullableText(input.sale_price),
    stockStatus: nullableText(input.stock_status),
    stockQuantity: optionalInteger(input.stock_quantity) ?? null,
    categories: objectArray(input.categories).map(normalizeProductCategory),
    images: objectArray(input.images).map(normalizeImage),
  };
}

function normalizeProductVariation(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    sku: nullableText(input.sku),
    price: nullableText(input.price),
    regularPrice: nullableText(input.regular_price),
    salePrice: nullableText(input.sale_price),
    stockStatus: nullableText(input.stock_status),
    stockQuantity: optionalInteger(input.stock_quantity) ?? null,
    attributes: objectArray(input.attributes).map(normalizeVariationAttribute),
    image: optionalRecord(input.image) ? normalizeImage(optionalRecord(input.image)!) : null,
  };
}

function normalizeOrder(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    number: nullableText(input.number),
    status: nullableText(input.status),
    currency: nullableText(input.currency),
    total: nullableText(input.total),
    customerId: optionalInteger(input.customer_id) ?? null,
    dateCreated: nullableText(input.date_created),
    dateModified: nullableText(input.date_modified),
    billing: normalizeAddress(input.billing),
    shipping: normalizeAddress(input.shipping),
    lineItems: objectArray(input.line_items).map(normalizeLineItem),
  };
}

function normalizeCustomer(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    email: nullableText(input.email),
    firstName: nullableText(input.first_name),
    lastName: nullableText(input.last_name),
    username: nullableText(input.username),
    role: nullableText(input.role),
    dateCreated: nullableText(input.date_created),
    dateModified: nullableText(input.date_modified),
    billing: normalizeAddress(input.billing),
    shipping: normalizeAddress(input.shipping),
  };
}

function normalizeCoupon(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    code: nullableText(input.code),
    amount: nullableText(input.amount),
    discountType: nullableText(input.discount_type),
    description: nullableText(input.description),
    dateCreated: nullableText(input.date_created),
    dateModified: nullableText(input.date_modified),
  };
}

function normalizeProductAttribute(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    name: nullableText(input.name),
    slug: nullableText(input.slug),
    type: nullableText(input.type),
    orderBy: nullableText(input.order_by),
    hasArchives: optionalBoolean(input.has_archives) ?? null,
  };
}

function normalizeOrderNote(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    author: nullableText(input.author),
    dateCreated: nullableText(input.date_created),
    note: nullableText(input.note),
    customerNote: optionalBoolean(input.customer_note) ?? false,
  };
}

function normalizeMedia(input: MediaMetadataUpdateResult | Record<string, unknown>): Record<string, unknown> {
  const source = isMediaMetadataUpdateResult(input) ? input.media : input;
  const title = optionalRecord(source.title);
  return {
    id: optionalInteger(source.id) ?? null,
    sourceUrl: nullableText(source.source_url),
    mediaType: nullableText(source.media_type),
    mimeType: nullableText(source.mime_type),
    title: title ? nullableText(title.rendered) : nullableText(source.title),
    altText: nullableText(source.alt_text),
    metadataUpdated: "metadataUpdated" in input ? input.metadataUpdated : null,
    metadataError: "metadataError" in input ? input.metadataError : null,
  };
}

function isMediaMetadataUpdateResult(
  input: MediaMetadataUpdateResult | Record<string, unknown>,
): input is MediaMetadataUpdateResult {
  return optionalRecord(input.media) !== undefined;
}

function normalizeAddress(value: unknown): Record<string, string | null> {
  const record = optionalRecord(value) ?? {};
  return {
    firstName: nullableText(record.first_name),
    lastName: nullableText(record.last_name),
    company: nullableText(record.company),
    address1: nullableText(record.address_1),
    address2: nullableText(record.address_2),
    city: nullableText(record.city),
    state: nullableText(record.state),
    postcode: nullableText(record.postcode),
    country: nullableText(record.country),
    email: nullableText(record.email),
    phone: nullableText(record.phone),
  };
}

function normalizeLineItem(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    productId: optionalInteger(input.product_id) ?? null,
    variationId: optionalInteger(input.variation_id) ?? null,
    name: nullableText(input.name),
    quantity: optionalNumber(input.quantity) ?? null,
    total: nullableText(input.total),
    sku: nullableText(input.sku),
  };
}

function normalizeTerm(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    name: nullableText(input.name),
    slug: nullableText(input.slug),
    count: optionalInteger(input.count) ?? null,
  };
}

function normalizeProductCategory(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    name: nullableText(input.name),
    slug: nullableText(input.slug),
  };
}

function normalizeImage(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    src: nullableText(input.src),
    name: nullableText(input.name),
    alt: nullableText(input.alt),
  };
}

function normalizeVariationAttribute(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalInteger(input.id) ?? null,
    name: nullableText(input.name),
    option: nullableText(input.option),
  };
}

function listResult<T>(
  key: string,
  payload: WooCommerceListResponse<T>,
  normalize: (input: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> {
  return {
    [key]: payload.items.map((item) => normalize(optionalRecord(item) ?? {})),
    total: payload.total,
    totalPages: payload.totalPages,
  };
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => item != null)
    : [];
}

function optionalObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? objectArray(value) : undefined;
}

function optionalObject<T>(value: unknown, mapper: (input: Record<string, unknown>) => T): T | undefined {
  const objectValue = optionalRecord(value);
  return objectValue ? mapper(objectValue) : undefined;
}

function parseHeaderInteger(value: string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function nullableText(value: unknown): string | null {
  return nullableString(value) ?? null;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 1 && value.charAt(end - 1) === "/") end -= 1;
  return value.slice(0, end);
}

function inferMimeType(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function escapeHeaderFileName(fileName: string): string {
  return fileName.replace(/["\\\r\n]/g, "_");
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
