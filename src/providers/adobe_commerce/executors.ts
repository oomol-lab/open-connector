import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { AdobeCommerceActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "adobe_commerce";
const adobeCommerceCredentialHelpUrl = "https://developer.adobe.com/commerce/webapi/get-started/authentication/";
const adobeCommerceValidationPath = ["products"] as const;

interface AdobeCommerceContext {
  apiKey: string;
  baseUrl: string;
  storeCode: string | undefined;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AdobeCommerceRequestOptions {
  context: AdobeCommerceContext;
  mode: AdobeCommerceRequestMode;
  pathSegments: readonly string[];
  query?: Record<string, QueryValue>;
  appendSearchCriteria?: (url: URL) => void;
}

type AdobeCommerceRequestMode = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;
type AdobeCommerceActionHandler = (input: Record<string, unknown>, context: AdobeCommerceContext) => Promise<unknown>;

export const adobeCommerceActionHandlers: Record<AdobeCommerceActionName, AdobeCommerceActionHandler> = {
  async list_products(input, context) {
    const payload = await requestAdobeCommerceJson({
      context: {
        ...context,
        storeCode: resolveStoreCode(input.storeCode, context.storeCode),
      },
      mode: "execute",
      pathSegments: ["products"],
      query: compactObject({
        fields: readOptionalTrimmedString(input.fields),
      }),
      appendSearchCriteria(url) {
        appendSearchCriteria(url, input);
      },
    });

    return normalizeProductSearchResult(payload);
  },
  async get_product(input, context) {
    const payload = await requestAdobeCommerceJson({
      context: {
        ...context,
        storeCode: resolveStoreCode(input.storeCode, context.storeCode),
      },
      mode: "execute",
      pathSegments: ["products", requireRequiredString(input.sku, "sku")],
      query: compactObject({
        editMode: optionalBoolean(input.editMode),
        storeId: optionalInteger(input.storeId),
        forceReload: optionalBoolean(input.forceReload),
        fields: readOptionalTrimmedString(input.fields),
      }),
    });

    return {
      product: normalizeProduct(payload),
    };
  },
  async list_categories(input, context) {
    const payload = await requestAdobeCommerceJson({
      context: {
        ...context,
        storeCode: resolveStoreCode(input.storeCode, context.storeCode),
      },
      mode: "execute",
      pathSegments: ["categories"],
      query: compactObject({
        rootCategoryId: optionalInteger(input.rootCategoryId),
        depth: optionalInteger(input.depth),
        fields: readOptionalTrimmedString(input.fields),
      }),
    });

    return {
      category: normalizeCategory(payload),
    };
  },
  async get_category(input, context) {
    const payload = await requestAdobeCommerceJson({
      context: {
        ...context,
        storeCode: resolveStoreCode(input.storeCode, context.storeCode),
      },
      mode: "execute",
      pathSegments: ["categories", String(readRequiredInteger(input.categoryId, "categoryId"))],
      query: compactObject({
        storeId: optionalInteger(input.storeId),
        fields: readOptionalTrimmedString(input.fields),
      }),
    });

    return {
      category: normalizeCategory(payload),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AdobeCommerceContext>({
  service,
  handlers: adobeCommerceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AdobeCommerceContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeAdobeCommerceBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl),
      storeCode: normalizeOptionalStoreCode(credential.metadata.storeCode ?? credential.values.storeCode),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = normalizeAdobeCommerceBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl);
    const storeCode = normalizeOptionalStoreCode(credential.metadata.storeCode ?? credential.values.storeCode);
    const url = new URL(baseUrl);
    const segments = [...splitPathSegments(url.pathname), "rest", ...(storeCode ? [storeCode] : []), "V1"];
    url.pathname = `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
    return url.toString();
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeAdobeCommerceBaseUrl(input.values.baseUrl);
    const storeCode = normalizeOptionalStoreCode(input.values.storeCode);

    const payload = await requestAdobeCommerceJson({
      context: {
        apiKey: input.apiKey,
        baseUrl,
        storeCode,
        fetcher,
        signal,
      },
      mode: "validate",
      pathSegments: adobeCommerceValidationPath,
      query: {
        fields: "items[sku,name],total_count",
      },
      appendSearchCriteria(url) {
        url.searchParams.set("searchCriteria[pageSize]", "1");
        url.searchParams.set("searchCriteria[currentPage]", "1");
      },
    });
    const result = normalizeProductSearchResult(payload);
    const host = new URL(baseUrl).host;

    return {
      profile: {
        accountId: `adobe_commerce:${host}${storeCode ? `:${storeCode}` : ""}`,
        displayName: `Adobe Commerce (${host})`,
      },
      grantedScopes: [],
      metadata: compactObject({
        baseUrl,
        storeCode,
        validationEndpoint: buildDisplayPath(storeCode, adobeCommerceValidationPath),
        credentialHelpUrl: adobeCommerceCredentialHelpUrl,
        productCount: result.totalCount,
      }),
    };
  },
};

async function requestAdobeCommerceJson(options: AdobeCommerceRequestOptions): Promise<unknown> {
  const response = await requestAdobeCommerce(options);
  const payload = await readAdobeCommercePayload(response);
  if (!response.ok) {
    throw mapAdobeCommerceError(response.status, payload, options.mode);
  }
  return payload;
}

async function requestAdobeCommerce(options: AdobeCommerceRequestOptions): Promise<Response> {
  const url = buildAdobeCommerceUrl(options.context, options.pathSegments);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  options.appendSearchCriteria?.(url);

  try {
    return await options.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: options.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Adobe Commerce request failed: ${error.message}` : "Adobe Commerce request failed",
      error,
    );
  }
}

function buildAdobeCommerceUrl(
  context: Pick<AdobeCommerceContext, "baseUrl" | "storeCode">,
  pathSegments: readonly string[],
): URL {
  const url = new URL(context.baseUrl);
  const segments = [
    ...splitPathSegments(url.pathname),
    "rest",
    ...(context.storeCode ? [context.storeCode] : []),
    "V1",
    ...pathSegments,
  ];
  url.pathname = `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
  url.search = "";
  url.hash = "";
  return url;
}

function buildDisplayPath(storeCode: string | undefined, pathSegments: readonly string[]): string {
  return `/${["rest", ...(storeCode ? [storeCode] : []), "V1", ...pathSegments].join("/")}`;
}

async function readAdobeCommercePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Adobe Commerce returned invalid JSON");
    }
    return text;
  }
}

function mapAdobeCommerceError(status: number, payload: unknown, mode: AdobeCommerceRequestMode): ProviderRequestError {
  const message = readAdobeCommerceErrorMessage(payload) ?? `Adobe Commerce request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 401 || status === 403) {
    return mode === "validate"
      ? new ProviderRequestError(400, message, payload)
      : new ProviderRequestError(409, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function readAdobeCommerceErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const message = optionalString(body.message);
  if (message) {
    return message;
  }

  const errors = body.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => {
      const record = optionalRecord(item);
      return optionalString(record?.message);
    });
    const record = optionalRecord(first);
    return optionalString(record?.message);
  }

  return undefined;
}

function appendSearchCriteria(url: URL, input: Record<string, unknown>): void {
  const filterGroups = Array.isArray(input.filterGroups) ? input.filterGroups : [];
  filterGroups.forEach((group, groupIndex) => {
    const groupRecord = optionalRecord(group);
    const filters = Array.isArray(groupRecord?.filters) ? groupRecord.filters : [];
    filters.forEach((filter, filterIndex) => {
      const filterRecord = optionalRecord(filter);
      if (!filterRecord) {
        return;
      }
      const prefix = `searchCriteria[filter_groups][${groupIndex}][filters][${filterIndex}]`;
      url.searchParams.set(`${prefix}[field]`, requireRequiredString(filterRecord.field, "field"));
      url.searchParams.set(`${prefix}[value]`, requireRequiredString(filterRecord.value, "value"));
      const conditionType = readOptionalTrimmedString(filterRecord.conditionType);
      if (conditionType) {
        url.searchParams.set(`${prefix}[condition_type]`, conditionType);
      }
    });
  });

  const sortOrders = Array.isArray(input.sortOrders) ? input.sortOrders : [];
  sortOrders.forEach((sortOrder, index) => {
    const sortRecord = optionalRecord(sortOrder);
    if (!sortRecord) {
      return;
    }
    const prefix = `searchCriteria[sortOrders][${index}]`;
    url.searchParams.set(`${prefix}[field]`, requireRequiredString(sortRecord.field, "field"));
    const direction = readOptionalTrimmedString(sortRecord.direction);
    if (direction) {
      url.searchParams.set(`${prefix}[direction]`, direction);
    }
  });

  const pageSize = optionalInteger(input.pageSize);
  if (pageSize !== undefined) {
    url.searchParams.set("searchCriteria[pageSize]", String(pageSize));
  }

  const currentPage = optionalInteger(input.currentPage);
  if (currentPage !== undefined) {
    url.searchParams.set("searchCriteria[currentPage]", String(currentPage));
  }
}

function normalizeProductSearchResult(payload: unknown): Record<string, unknown> {
  const body = requireObject(payload, "product search response");
  const items = Array.isArray(body.items) ? body.items : [];
  const totalCount = optionalInteger(body.total_count) ?? items.length;

  return {
    products: items.map((item) => normalizeProduct(item)),
    searchCriteria: optionalRecord(body.search_criteria) ?? null,
    totalCount,
  };
}

function normalizeProduct(value: unknown): Record<string, unknown> {
  const product = requireObject(value, "product");
  return {
    id: optionalInteger(product.id) ?? null,
    sku: optionalString(product.sku) ?? "",
    name: optionalString(product.name) ?? null,
    price: optionalNumber(product.price) ?? null,
    typeId: optionalString(product.type_id) ?? null,
    attributeSetId: optionalInteger(product.attribute_set_id) ?? null,
    status: optionalInteger(product.status) ?? null,
    visibility: optionalInteger(product.visibility) ?? null,
    createdAt: optionalString(product.created_at) ?? null,
    updatedAt: optionalString(product.updated_at) ?? null,
    customAttributes: normalizeObjectArray(product.custom_attributes),
    extensionAttributes: optionalRecord(product.extension_attributes) ?? null,
    raw: product,
  };
}

function normalizeCategory(value: unknown): Record<string, unknown> {
  const category = requireObject(value, "category");
  return {
    id: optionalInteger(category.id) ?? null,
    parentId: optionalInteger(category.parent_id) ?? null,
    name: optionalString(category.name) ?? null,
    isActive: optionalBoolean(category.is_active) ?? null,
    position: optionalInteger(category.position) ?? null,
    level: optionalInteger(category.level) ?? null,
    path: optionalString(category.path) ?? null,
    productCount: optionalInteger(category.product_count) ?? null,
    children: normalizeObjectArray(category.children_data),
    raw: category,
  };
}

function normalizeObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => optionalRecord(item)).filter((item) => item !== undefined);
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Adobe Commerce returned an invalid ${fieldName} payload`, value);
  }
  return record;
}

function requireRequiredString(value: unknown, fieldName: string): string {
  const trimmed = readOptionalTrimmedString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}

function normalizeOptionalStoreCode(value: unknown): string | undefined {
  return readOptionalTrimmedString(value);
}

function resolveStoreCode(inputStoreCode: unknown, metadataStoreCode: string | undefined): string | undefined {
  return normalizeOptionalStoreCode(inputStoreCode) ?? metadataStoreCode;
}

function normalizeAdobeCommerceBaseUrl(rawValue: unknown): string {
  const raw = requireRequiredString(rawValue, "baseUrl");
  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
  const url = assertPublicHttpUrl(withProtocol, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include credentials");
  }
  url.hash = "";
  url.search = "";
  url.pathname = normalizeBasePath(url.pathname);
  return trimTrailingSlash(url.toString());
}

function normalizeBasePath(pathname: string): string {
  const withoutTrailing = trimTrailingSlash(pathname);
  if (withoutTrailing === "" || withoutTrailing === "/") {
    return "/";
  }

  const segments = splitPathSegments(withoutTrailing);
  if (segments[segments.length - 1] === "rest") {
    segments.pop();
  }
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

function splitPathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function trimTrailingSlash(value: string): string {
  let output = value;
  while (output.length > 1 && output.endsWith("/")) {
    output = output.slice(0, -1);
  }
  return output;
}
