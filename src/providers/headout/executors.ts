import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "headout";
const headoutProductionApiBaseUrl = "https://www.headout.com/api/public/v1";
const headoutSandboxApiBaseUrl = "https://sandbox.api.test-headout.com/api/public/v1";
const headoutValidationPath = "/booking";
const headoutDefaultTimeoutMs = 30_000;

type HeadoutPhase = "validate" | "execute";
type HeadoutQueryValue = boolean | number | string | undefined;
interface HeadoutActionContext {
  apiKey: string;
  apiBaseUrl?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type HeadoutActionHandler = (input: Record<string, unknown>, context: HeadoutActionContext) => Promise<unknown>;

export const headoutActionHandlers: ProviderActionHandlers<"headout", HeadoutActionHandler> = {
  async list_cities(input, context) {
    const payload = await requestHeadoutJson({
      context,
      path: "/city",
      query: compactObject({
        offset: optionalString(input.offset),
        limit: optionalInteger(input.limit),
      }),
      phase: "execute",
    });

    const record = expectObject(payload, "Headout city list response");
    return {
      cities: readItems(record).map(normalizeCity),
      pagination: normalizePagination(record),
    };
  },
  async list_categories_by_city(input, context) {
    const payload = await requestHeadoutJson({
      context,
      path: "/category/list-by/city",
      query: compactObject({
        cityCode: requiredString(input.cityCode, "cityCode", providerInputError),
        offset: optionalString(input.offset),
        limit: optionalInteger(input.limit),
      }),
      phase: "execute",
    });

    const record = expectObject(payload, "Headout category list response");
    return {
      categories: readItems(record).map(normalizeCategory),
      pagination: normalizePagination(record),
    };
  },
  async list_products_by_city(input, context) {
    const payload = await requestHeadoutJson({
      context,
      path: "/product/listing/list-by/city",
      query: compactObject({
        cityCode: requiredString(input.cityCode, "cityCode", providerInputError),
        currencyCode: optionalString(input.currencyCode),
        language: optionalString(input.language),
        offset: optionalString(input.offset),
        limit: optionalInteger(input.limit),
      }),
      phase: "execute",
    });

    const record = expectObject(payload, "Headout city product list response");
    return {
      products: readItems(record).map(normalizeProductListing),
      pagination: normalizePagination(record),
    };
  },
  async list_products_by_category(input, context) {
    const payload = await requestHeadoutJson({
      context,
      path: "/product/listing/list-by/category",
      query: compactObject({
        categoryId: requiredString(input.categoryId, "categoryId", providerInputError),
        currencyCode: optionalString(input.currencyCode),
        language: optionalString(input.language),
        offset: optionalString(input.offset),
        limit: optionalInteger(input.limit),
      }),
      phase: "execute",
    });

    const record = expectObject(payload, "Headout category product list response");
    return {
      products: readItems(record).map(normalizeProductListing),
      pagination: normalizePagination(record),
    };
  },
  async get_product(input, context) {
    const productId = requiredString(input.productId, "productId", providerInputError);
    const payload = await requestHeadoutJson({
      context,
      path: `/product/get/${encodeURIComponent(productId)}`,
      query: compactObject({
        currencyCode: optionalString(input.currencyCode),
        language: optionalString(input.language),
        "fetch-variants": optionalBoolean(input.fetchVariants),
      }),
      phase: "execute",
    });

    return {
      product: normalizeProduct(expectObject(payload, "Headout product response")),
    };
  },
  async list_inventory_by_variant(input, context) {
    const payload = await requestHeadoutJson({
      context,
      path: "/inventory/list-by/variant",
      query: compactObject({
        variantId: requiredString(input.variantId, "variantId", providerInputError),
        startDateTime: optionalString(input.startDateTime),
        endDateTime: optionalString(input.endDateTime),
        offset: optionalString(input.offset),
        limit: optionalInteger(input.limit),
        currencyCode: optionalString(input.currencyCode),
      }),
      phase: "execute",
    });

    const record = expectObject(payload, "Headout inventory list response");
    return {
      inventories: readItems(record).map(normalizeInventory),
      pagination: normalizePagination(record),
    };
  },
  async list_bookings(input, context) {
    const payload = await requestHeadoutJson({
      context,
      path: "/booking",
      query: compactObject({
        offset: optionalString(input.offset),
        limit: optionalInteger(input.limit),
      }),
      phase: "execute",
    });

    const record = expectObject(payload, "Headout booking list response");
    return {
      bookings: readItems(record).map(normalizeBooking),
      pagination: normalizePagination(record),
    };
  },
  async get_booking(input, context) {
    const bookingId = requiredString(input.bookingId, "bookingId", providerInputError);
    const payload = await requestHeadoutJson({
      context,
      path: `/booking/${encodeURIComponent(bookingId)}`,
      query: {},
      phase: "execute",
    });

    return {
      booking: normalizeBooking(expectObject(payload, "Headout booking response")),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<HeadoutActionContext>({
  service,
  handlers: headoutActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HeadoutActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: optionalString(credential.metadata.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = resolveHeadoutApiBaseUrl(input.apiKey);
    await requestHeadoutJson({
      context: {
        apiKey: input.apiKey,
        apiBaseUrl,
        fetcher,
        signal,
      },
      path: headoutValidationPath,
      query: { limit: 1 },
      phase: "validate",
    });

    return {
      profile: {
        displayName: "Headout API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        environment: apiBaseUrl === headoutSandboxApiBaseUrl ? "sandbox" : "production",
        validationEndpoint: headoutValidationPath,
      },
    };
  },
};

async function requestHeadoutJson(input: {
  context: HeadoutActionContext;
  path: string;
  query: Record<string, HeadoutQueryValue>;
  phase: HeadoutPhase;
}): Promise<unknown> {
  const apiBaseUrl = input.context.apiBaseUrl ?? resolveHeadoutApiBaseUrl(input.context.apiKey);
  const url = buildHeadoutUrl(apiBaseUrl, input.path, input.query);
  const timeoutSignal = AbortSignal.timeout(headoutDefaultTimeoutMs);
  const signal = input.context.signal ? AbortSignal.any([input.context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Headout-Auth": input.context.apiKey,
        "User-Agent": providerUserAgent,
      },
      signal,
    });

    const payload = await readHeadoutBody(response);
    if (!response.ok) {
      throw normalizeHeadoutError(response.status, payload, input.phase, input.path);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(
        502,
        `headout ${input.path} request timed out after ${Math.ceil(headoutDefaultTimeoutMs / 1000)} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? error.message : `headout ${input.path} request failed`,
    );
  }
}

function buildHeadoutUrl(apiBaseUrl: string, path: string, query: Record<string, HeadoutQueryValue>): string {
  const url = new URL(apiBaseUrl);
  const pathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  url.pathname = `${pathname}${path}`;
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function resolveHeadoutApiBaseUrl(apiKey: string): string {
  return apiKey.startsWith("tk_") ? headoutSandboxApiBaseUrl : headoutProductionApiBaseUrl;
}

async function readHeadoutBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return {
      message: response.statusText || "Headout request failed",
    };
  }
}

function normalizeHeadoutError(
  status: number,
  payload: unknown,
  phase: HeadoutPhase,
  path: string,
): ProviderRequestError {
  const message = readHeadoutErrorMessage(payload, status, path);

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readHeadoutErrorMessage(payload: unknown, status: number, path: string): string {
  const record = optionalRecord(payload);
  const directMessage = optionalString(record?.message);
  if (directMessage) {
    return directMessage;
  }

  const errorMessage = optionalString(record?.error);
  if (errorMessage) {
    return errorMessage;
  }

  if (Array.isArray(record?.errors) && record.errors.length > 0) {
    const firstError = record.errors[0];
    if (typeof firstError === "string" && firstError.trim()) {
      return firstError;
    }
  }

  return `headout ${path} request failed with ${status}`;
}

function normalizePagination(record: Record<string, unknown>): Record<string, unknown> {
  return {
    nextUrl: optionalString(record.nextUrl) ?? null,
    prevUrl: optionalString(record.prevUrl) ?? null,
    total: optionalInteger(record.total) ?? 0,
    nextOffset: optionalInteger(record.nextOffset) ?? null,
  };
}

function readItems(record: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(record.items) ? record.items.map((item) => expectObject(item, "Headout list item")) : [];
}

function normalizeCity(record: Record<string, unknown>): Record<string, unknown> {
  return {
    code: requireStringish(record.code, "city.code"),
    name: requireStringish(record.name, "city.name"),
    image: normalizeImage(record.image),
    raw: record,
  };
}

function normalizeCategory(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireStringish(record.id, "category.id"),
    name: requireStringish(record.name, "category.name"),
    cityCode: requireStringish(record.cityCode, "category.cityCode"),
    image: normalizeImageOrNull(record.image),
    canonicalUrl: requireStringish(record.canonicalUrl, "category.canonicalUrl"),
    raw: record,
  };
}

function normalizeImage(value: unknown): Record<string, unknown> {
  const record = expectObject(value, "Headout image");
  return {
    url: requireStringish(record.url, "image.url"),
  };
}

function normalizeImageOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  return record ? normalizeImage(record) : null;
}

function normalizeProductListing(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireStringish(record.id, "product.id"),
    name: requireStringish(record.name, "product.name"),
    url: readStringish(record.url),
    canonicalUrl: readStringish(record.canonicalUrl),
    city: normalizeBasicCityOrNull(record.city),
    image: normalizeImageOrNull(record.image),
    neighbourhood: readStringish(record.neighbourhood),
    primaryCategory: normalizeProductCategoryOrNull(record.primaryCategory),
    startGeolocation: normalizeGeolocationOrNull(record.startGeolocation),
    ratingCumulative: normalizeRatingOrNull(record.ratingCumulative),
    pricing: normalizeProductPricingOrNull(record.pricing),
    hasInstantConfirmation: readBoolean(record.hasInstantConfirmation),
    raw: record,
  };
}

function normalizeProduct(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireStringish(record.id, "product.id"),
    name: requireStringish(record.name, "product.name"),
    url: readStringish(record.url),
    canonicalUrl: readStringish(record.canonicalUrl),
    neighbourhood: readStringish(record.neighbourhood),
    city: normalizeBasicCityOrNull(record.city),
    currency: normalizeCurrencyOrNull(record.currency),
    displayTags: readStringArray(record.displayTags),
    images: readObjectArray(record.images).map(normalizeImage),
    content: readObjectArray(record.content).map(normalizeContentSection),
    startLocation: normalizeLocationOrNull(record.startLocation),
    endLocation: normalizeLocationOrNull(record.endLocation),
    productType: readStringish(record.productType),
    ratingCumulative: normalizeRatingOrNull(record.ratingCumulative),
    hasInstantConfirmation: readBoolean(record.hasInstantConfirmation),
    hasMobileTicket: readBoolean(record.hasMobileTicket),
    variants: readObjectArray(record.variants).map(normalizeVariant),
    pricing: normalizeProductPricingOrNull(record.pricing),
    raw: record,
  };
}

function normalizeContentSection(record: Record<string, unknown>): Record<string, unknown> {
  return {
    title: readStringish(record.title),
    type: readStringish(record.type),
    html: readStringish(record.html),
  };
}

function normalizeVariant(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireStringish(record.id, "variant.id"),
    name: readStringish(record.name),
    description: readStringish(record.description),
    inventoryType: readStringish(record.inventoryType),
    duration: optionalInteger(record.duration) ?? null,
    priceType: readStringish(record.priceType),
    pax: normalizePaxOrNull(record.pax),
    cashback: normalizeCashbackOrNull(record.cashback),
    ticketDeliveryInfoHtml: readStringish(record.ticketDeliveryInfoHtml),
    inputFields: readObjectArray(record.inputFields).map(normalizeInputField),
    tags: readStringArray(record.tags),
    raw: record,
  };
}

function normalizeInputField(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireStringish(record.id, "inputField.id"),
    name: readStringish(record.name),
    value: readStringish(record.value),
    dataType: readStringish(record.dataType),
    level: readStringish(record.level),
    validation: normalizeValidationOrNull(record.validation),
    raw: record,
  };
}

function normalizeValidationOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    regex: readStringish(record.regex),
    minLength: optionalInteger(record.minLength) ?? null,
    maxLength: optionalInteger(record.maxLength) ?? null,
    minValue: optionalNumber(record.minValue) ?? null,
    maxValue: optionalNumber(record.maxValue) ?? null,
    required: readBoolean(record.required),
    values: readStringArrayOrNull(record.values),
    raw: record,
  };
}

function normalizePaxOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    min: optionalInteger(record.min) ?? 0,
    max: optionalInteger(record.max) ?? null,
    raw: record,
  };
}

function normalizeCashbackOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    value: optionalNumber(record.value) ?? 0,
    type: readStringish(record.type),
    raw: record,
  };
}

function normalizeProductPricingOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    type: readStringish(record.type),
    currencyCode: readStringish(record.currencyCode),
    minimumPrice: normalizeListingPriceOrNull(record.minimumPrice),
    bestDiscount: optionalNumber(record.bestDiscount) ?? null,
    raw: record,
  };
}

function normalizeListingPriceOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    originalPrice: optionalNumber(record.originalPrice) ?? null,
    finalPrice: optionalNumber(record.finalPrice) ?? null,
    raw: record,
  };
}

function normalizeBasicCityOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    code: requireStringish(record.code, "city.code"),
    name: requireStringish(record.name, "city.name"),
    raw: record,
  };
}

function normalizeProductCategoryOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    id: requireStringish(record.id, "primaryCategory.id"),
    name: readStringish(record.name),
    cityCode: readStringish(record.cityCode),
    url: readStringish(record.url),
  };
}

function normalizeCurrencyOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  const name = readStringish(record.name) ?? readStringish(record.currencyName);
  return {
    code: requireStringish(record.code, "currency.code"),
    name: name ?? "",
    symbol: requireStringish(record.symbol, "currency.symbol"),
    localSymbol: requireStringish(record.localSymbol, "currency.localSymbol"),
    precision: optionalInteger(record.precision) ?? 0,
  };
}

function normalizeGeolocationOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  const latitude = optionalNumber(record.latitude) ?? optionalNumber(record.lat);
  const longitude = optionalNumber(record.longitude) ?? optionalNumber(record.lng);
  if (latitude == null || longitude == null) {
    return null;
  }
  return {
    latitude,
    longitude,
  };
}

function normalizeAddressOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    line1: readStringish(record.line1) ?? readStringish(record.addressLine1),
    line2: readStringish(record.line2) ?? readStringish(record.addressLine2),
    cityName: readStringish(record.cityName),
    stateName: readStringish(record.stateName) ?? readStringish(record.state),
    countryName: readStringish(record.countryName),
    postalCode: readStringish(record.postalCode),
  };
}

function normalizeLocationOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    geo: normalizeGeolocationOrNull(record.geo ?? record.geolocation),
    address: normalizeAddressOrNull(record.address),
  };
}

function normalizeRatingOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    avg: optionalNumber(record.avg) ?? null,
    count: optionalInteger(record.count) ?? null,
  };
}

function normalizeInventory(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireStringish(record.id, "inventory.id"),
    startDateTime: readStringish(record.startDateTime),
    endDateTime: readStringish(record.endDateTime),
    availability: readStringish(record.availability),
    remaining: optionalInteger(record.remaining) ?? null,
    pricing: normalizeInventoryPricingOrNull(record.pricing),
    raw: record,
  };
}

function normalizeInventoryPricingOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    persons: readObjectArray(record.persons).map(normalizePersonPricing),
    groups: readObjectArray(record.groups).map(normalizeGroupPricing),
  };
}

function normalizePersonPricing(record: Record<string, unknown>): Record<string, unknown> {
  return {
    type: readStringish(record.type),
    name: readStringish(record.name),
    ageFrom: optionalInteger(record.ageFrom) ?? null,
    ageTo: optionalInteger(record.ageTo) ?? null,
    price: optionalNumber(record.price) ?? null,
    originalPrice: optionalNumber(record.originalPrice) ?? null,
  };
}

function normalizeGroupPricing(record: Record<string, unknown>): Record<string, unknown> {
  return {
    size: optionalInteger(record.size) ?? null,
    price: optionalNumber(record.price) ?? null,
    originalPrice: optionalNumber(record.originalPrice) ?? null,
  };
}

function normalizeBooking(record: Record<string, unknown>): Record<string, unknown> {
  const customerDetailsRecord = optionalRecord(record.customerDetails) ?? optionalRecord(record.customersDetails);
  return {
    bookingId: requireStringish(record.bookingId, "booking.bookingId"),
    partnerReferenceId: readStringish(record.partnerReferenceId),
    variantId: readStringish(record.variantId),
    startDateTime: readStringish(record.startDateTime),
    product: normalizeBookingProductOrNull(record.product),
    customerDetails: normalizeCustomerDetailsOrNull(customerDetailsRecord),
    variantInputFields: readObjectArray(record.variantInputFields).map(normalizeBookingInputField),
    price: normalizeMoneyOrNull(record.price),
    status: readStringish(record.status),
    voucherUrl: readStringish(record.voucherUrl),
    tickets: readObjectArray(record.tickets).map(normalizeTicket),
    creationTimestamp: optionalInteger(record.creationTimestamp) ?? null,
    raw: record,
  };
}

function normalizeBookingProductOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    id: requireStringish(record.id, "booking.product.id"),
    name: readStringish(record.name),
    variant: normalizeBookingProductVariantOrNull(record.variant),
  };
}

function normalizeBookingProductVariantOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    id: requireStringish(record.id, "booking.product.variant.id"),
    name: readStringish(record.name),
  };
}

function normalizeCustomerDetailsOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    count: optionalInteger(record.count) ?? null,
    customers: readObjectArray(record.customers).map(normalizeBookingCustomer),
  };
}

function normalizeBookingCustomer(record: Record<string, unknown>): Record<string, unknown> {
  return {
    personType: readStringish(record.personType),
    isPrimary: readBoolean(record.isPrimary),
    inputFields: readObjectArray(record.inputFields).map(normalizeBookingInputField),
  };
}

function normalizeBookingInputField(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireStringish(record.id, "booking.inputField.id"),
    name: readStringish(record.name),
    value: readStringish(record.value),
  };
}

function normalizeMoneyOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return {
    amount: optionalNumber(record.amount) ?? null,
    currencyCode: readStringish(record.currencyCode),
  };
}

function normalizeTicket(record: Record<string, unknown>): Record<string, unknown> {
  return {
    publicId: readStringish(record.publicId),
    url: readStringish(record.url),
  };
}

function expectObject(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} must be an object`);
  }
  return record;
}

function requireStringish(value: unknown, fieldName: string): string {
  const text = readStringish(value);
  if (!text) {
    throw new ProviderRequestError(502, `missing ${fieldName} in Headout response`);
  }
  return text;
}

function readStringish(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => item != null);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => readStringish(item)).filter((item): item is string => item != null);
}

function readStringArrayOrNull(value: unknown): string[] | null {
  return value == null ? null : readStringArray(value);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortLikeError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (String((error as { name?: unknown }).name) === "AbortError" ||
      String((error as { name?: unknown }).name) === "TimeoutError")
  );
}
