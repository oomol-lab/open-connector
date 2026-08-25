import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

type QueryValue = string | number | boolean | undefined;
type Digistore24RequestPhase = "validate" | "execute";

interface Digistore24ActionContext {
  readonly apiKey: string;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
}

type Digistore24ActionHandler = (input: Record<string, unknown>, context: Digistore24ActionContext) => Promise<unknown>;

interface Digistore24RequestInput {
  readonly functionName: string;
  readonly query?: Record<string, QueryValue>;
  readonly phase: Digistore24RequestPhase;
}

const digistore24ApiBaseUrl = "https://www.digistore24.com/api/call";
const digistore24RequestTimeoutMs = 30_000;
const digistore24MaxResponseBytes = 10 * 1024 * 1024;

export const digistore24ActionHandlers: ProviderActionHandlers<"digistore24", Digistore24ActionHandler> = {
  get_user_info(_input, context) {
    return executeGetUserInfo(context);
  },
  list_products(input, context) {
    return executeListProducts(input, context);
  },
  get_product(input, context) {
    return executeGetProduct(input, context);
  },
  list_buyers(input, context) {
    return executeListBuyers(input, context);
  },
  get_buyer(input, context) {
    return executeGetBuyer(input, context);
  },
  list_purchases(input, context) {
    return executeListPurchases(input, context);
  },
  get_purchase(input, context) {
    return executeGetPurchase(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Digistore24ActionContext>({
  service: "digistore24",
  handlers: digistore24ActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<Digistore24ActionContext> {
    const credential = await requireApiKeyCredential(context, "digistore24");
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "digistore24",
  baseUrl: digistore24ApiBaseUrl,
  auth: { type: "api_key_header", name: "X-DS-API-KEY" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await digistore24Request(
      {
        functionName: "getUserInfo",
        phase: "validate",
      },
      input.apiKey,
      fetcher,
      signal,
    );
    const userInfo = normalizeUserInfo(readPayloadObject(payload, "user info"));
    return {
      profile: {
        accountId: userInfo.userId == null ? undefined : String(userInfo.userId),
        displayName: userInfo.userName ?? "Digistore24 API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: digistore24ApiBaseUrl,
        validationFunction: "getUserInfo",
        userId: userInfo.userId,
        userName: userInfo.userName,
        grantedRoles: userInfo.grantedRoles,
      },
    };
  },
};

async function executeGetUserInfo(context: Digistore24ActionContext) {
  const payload = await digistore24Request(
    {
      functionName: "getUserInfo",
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return normalizeUserInfo(readPayloadObject(payload, "user info"));
}

async function executeListProducts(input: Record<string, unknown>, context: Digistore24ActionContext) {
  const payload = await digistore24Request(
    {
      functionName: "listProducts",
      query: compactObject({
        sort_by: optionalString(input.sortBy),
      }),
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    products: readObjectArray(payload).map(normalizeProductSummary),
  };
}

async function executeGetProduct(input: Record<string, unknown>, context: Digistore24ActionContext) {
  const payload = await digistore24Request(
    {
      functionName: "getProduct",
      query: {
        product_id: readRequiredInteger(input.productId, "productId"),
      },
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );
  const payloadObject = readPayloadObject(payload, "product");
  const product = optionalRecord(payloadObject.product) ?? payloadObject;
  if (!product) {
    throw new ProviderRequestError(502, "Digistore24 returned invalid product data");
  } else {
    return { product };
  }
}

async function executeListBuyers(input: Record<string, unknown>, context: Digistore24ActionContext) {
  const payload = await digistore24Request(
    {
      functionName: "listBuyers",
      query: compactObject({
        page_no: optionalInteger(input.pageNo),
        page_size: optionalInteger(input.pageSize),
      }),
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return normalizeBuyerList(readPayloadObject(payload, "buyer list"));
}

async function executeGetBuyer(input: Record<string, unknown>, context: Digistore24ActionContext) {
  const payload = await digistore24Request(
    {
      functionName: "getBuyer",
      query: {
        buyer_id: readRequiredInteger(input.buyerId, "buyerId"),
      },
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );
  const payloadObject = readPayloadObject(payload, "buyer");
  const data = optionalRecord(payloadObject.data) ?? payloadObject;
  const buyer = optionalRecord(data.buyer) ?? data;
  if (!buyer) {
    throw new ProviderRequestError(502, "Digistore24 returned invalid buyer data");
  } else {
    return { buyer: normalizeBuyer(buyer) };
  }
}

async function executeListPurchases(input: Record<string, unknown>, context: Digistore24ActionContext) {
  const search = optionalRecord(input.search);
  const payload = await digistore24Request(
    {
      functionName: "listPurchases",
      query: compactObject({
        from: trimOptionalString(input.from),
        to: trimOptionalString(input.to),
        search: search ? JSON.stringify(toPurchaseSearchPayload(search)) : undefined,
        sort_by: optionalString(input.sortBy),
        sort_order: optionalString(input.sortOrder),
        load_transactions: optionalBoolean(input.loadTransactions),
        page_no: optionalInteger(input.pageNo),
        page_size: optionalInteger(input.pageSize),
      }),
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  const payloadObject = readPayloadObject(payload, "purchase list");
  const purchases = readObjectArray(payloadObject.purchase_list ?? payloadObject);
  return {
    purchases: purchases.map(normalizePurchase),
    raw: payloadObject,
  };
}

async function executeGetPurchase(input: Record<string, unknown>, context: Digistore24ActionContext) {
  const payload = await digistore24Request(
    {
      functionName: "getPurchase",
      query: {
        purchase_id: readRequiredString(input.purchaseId, "purchaseId"),
      },
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  const payloadObject = readPayloadObject(payload, "purchase");
  return {
    purchases: normalizePurchasePayload(payloadObject),
    raw: payloadObject,
  };
}

async function digistore24Request(
  input: Digistore24RequestInput,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  let response: Response;
  let payload: unknown;
  const timeout = createProviderTimeout(signal, digistore24RequestTimeoutMs);

  try {
    response = await fetcher(buildDigistore24Url(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-DS-API-KEY": apiKey,
      },
      signal: timeout.signal,
    });
    payload = await readResponsePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Digistore24 request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Digistore24 request failed: ${error.message}` : "Digistore24 request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createDigistore24Error(response.status, response.statusText, payload, input.phase);
  }

  const responseObject = optionalRecord(payload);
  if (!responseObject) {
    throw new ProviderRequestError(502, "Digistore24 returned an invalid response");
  } else if (responseObject.result === "error") {
    throw createDigistore24Error(400, "Bad Request", responseObject, input.phase);
  } else if (Object.hasOwn(responseObject, "data")) {
    return responseObject.data;
  } else {
    return responseObject;
  }
}

function buildDigistore24Url(input: Digistore24RequestInput) {
  const url = new URL(`${digistore24ApiBaseUrl}/${input.functionName}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readResponsePayload(response: Response) {
  const text = await readProviderTextBody(response, "Digistore24 response", digistore24MaxResponseBytes);
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createDigistore24Error(status: number, statusText: string, payload: unknown, phase: Digistore24RequestPhase) {
  const message = extractErrorMessage(payload) ?? (statusText || `Digistore24 request failed with ${status || 500}`);

  if (status === 429) {
    return new ProviderRequestError(429, message);
  } else if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  } else if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  } else if (phase === "execute" && (status === 400 || status === 404 || status === 422)) {
    return new ProviderRequestError(400, message);
  } else {
    return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
  }
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  } else {
    return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.code);
  }
}

function normalizeUserInfo(payload: Record<string, unknown>) {
  return {
    userId: asNullableInteger(payload.user_id),
    userName: asNullableString(payload.user_name),
    grantedRoles: asNullableString(payload.granted_roles),
    grantedRolesMessage: asNullableString(payload.granted_roles_msg),
    raw: payload,
  };
}

function normalizeProductSummary(product: Record<string, unknown>) {
  return {
    id: asNullableInteger(product.id),
    name: asNullableString(product.name),
    note: asNullableString(product.note),
    tag: asNullableString(product.tag),
    language: asNullableString(product.language),
    productGroupId: asNullableInteger(product.product_group_id),
    productGroupName: asNullableString(product.product_group_name),
    unitsLeft: asNullableString(product.units_left),
    createdAt: asNullableString(product.created_at),
    modifiedAt: asNullableString(product.modified_at),
    raw: product,
  };
}

function normalizeBuyerList(payload: Record<string, unknown>) {
  return {
    pageNo: asNullableInteger(payload.page_no),
    pageSize: asNullableInteger(payload.page_size),
    itemCount: asNullableInteger(payload.item_count),
    pageCount: asNullableInteger(payload.page_count),
    buyers: readObjectArray(payload.items).map(normalizeBuyer),
    raw: payload,
  };
}

function normalizeBuyer(buyer: Record<string, unknown>) {
  return {
    id: asNullableInteger(buyer.id),
    addressId: asNullableInteger(buyer.address_id),
    createdAt: asNullableString(buyer.created_at),
    email: asNullableString(buyer.email),
    firstName: asNullableString(buyer.first_name),
    lastName: asNullableString(buyer.last_name),
    salutation: asNullableString(buyer.salutation),
    title: asNullableString(buyer.title),
    company: asNullableString(buyer.company),
    street: asNullableString(buyer.street),
    streetName: asNullableString(buyer.street_name),
    streetNumber: asNullableString(buyer.street_number),
    zipcode: asNullableString(buyer.zipcode),
    city: asNullableString(buyer.city),
    state: asNullableString(buyer.state),
    country: asNullableString(buyer.country),
    phoneNo: asNullableString(buyer.phone_no),
    raw: buyer,
  };
}

function normalizePurchasePayload(payload: Record<string, unknown>) {
  const records = Object.values(payload).flatMap((value) => {
    const record = optionalRecord(value);
    return record ? [record] : [];
  });
  if (records.length > 0 && !("id" in payload)) {
    return records.map(normalizePurchase);
  } else {
    return [normalizePurchase(payload)];
  }
}

function normalizePurchase(purchase: Record<string, unknown>) {
  return {
    id: asNullableString(purchase.id),
    amount: asNullableNumber(purchase.amount),
    currency: asNullableString(purchase.currency),
    createdAt: asNullableString(purchase.created_at),
    billingType: asNullableString(purchase.billing_type),
    billingStatus: asNullableString(purchase.billing_status),
    receiptUrl: asNullableString(purchase.receipt_url),
    invoiceUrl: asNullableString(purchase.invoice_url),
    buyer: normalizeNullableBuyer(purchase.buyer),
    items: readObjectArray(purchase.items),
    transactions: readObjectArray(purchase.transaction_list),
    raw: purchase,
  };
}

function normalizeNullableBuyer(value: unknown) {
  const buyer = optionalRecord(value);
  return buyer ? normalizeBuyer(buyer) : null;
}

function toPurchaseSearchPayload(search: Record<string, unknown>) {
  return compactObject({
    role: optionalString(search.role),
    product_id: optionalString(search.productId),
    first_name: optionalString(search.firstName),
    last_name: optionalString(search.lastName),
    email: optionalString(search.email),
    has_affiliate: optionalBoolean(search.hasAffiliate),
    affiliate_name: optionalString(search.affiliateName),
    order_type: optionalString(search.orderType),
    pay_method: optionalString(search.payMethod),
    billing_type: optionalString(search.billingType),
    transaction_type: optionalString(search.transactionType),
    currency: optionalString(search.currency),
    purchase_id: optionalString(search.purchaseId),
  });
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  } else {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
}

function trimOptionalString(value: unknown): string | undefined {
  return optionalString(value)?.trim();
}

function readPayloadObject(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Digistore24 returned invalid ${label} data`);
  } else {
    return record;
  }
}

function readRequiredInteger(value: unknown, fieldName: string) {
  const parsed = optionalInteger(value);
  if (parsed == null) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  } else {
    return parsed;
  }
}

function readObjectArray(value: unknown) {
  if (value == null) {
    return [];
  } else if (Array.isArray(value)) {
    return value.map((item) => {
      const record = optionalRecord(item);
      if (!record) {
        throw new ProviderRequestError(502, "Digistore24 returned an invalid item");
      } else {
        return record;
      }
    });
  } else {
    throw new ProviderRequestError(502, "Digistore24 returned an invalid list");
  }
}

function asNullableString(value: unknown) {
  return value == null ? null : (optionalString(value) ?? null);
}

function asNullableInteger(value: unknown) {
  if (value == null) {
    return null;
  } else {
    const parsed = optionalInteger(value);
    return parsed ?? null;
  }
}

function asNullableNumber(value: unknown) {
  return value == null ? null : (optionalNumber(value) ?? null);
}
