import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionName, ProviderActionSources } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { createHash, createHmac } from "node:crypto";
import { compactObject, optionalInteger, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionSources } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  providerResponseError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const kuaimaiApiOrigin = "https://gw.superboss.cc";
const kuaimaiApiUrl = `${kuaimaiApiOrigin}/router`;

interface KuaimaiCredential {
  appKey: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
}

interface KuaimaiRequestInput {
  method: string;
  parameters: Record<string, unknown>;
  credential: KuaimaiCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  now?: Date;
}

interface KuaimaiContext {
  values: Record<string, string>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface NormalizedListOutput {
  items: unknown[];
  total: number | null;
  hasNext: boolean | null;
  cursor: string | null;
}

const actionMethodByName: ProviderActionSources<"kuaimai", string> = {
  refresh_session: "open.token.refresh",
  list_warehouses: "erp.warehouse.list.query",
  list_shops: "erp.shop.list.query",
  list_products: "item.list.query",
  get_product: "item.single.get",
  list_inventory: "erp.item.warehouse.list.get",
  list_orders: "erp.trade.list.query",
  list_sales_stockouts: "erp.trade.outstock.simple.query",
};

const handlers = mapProviderActionSources(
  "kuaimai",
  actionMethodByName,
  (actionName, method) => async (input: Record<string, unknown>, context: KuaimaiContext) => {
    const payload = await requestKuaimai({
      method,
      parameters: buildActionParameters(actionName, input),
      credential: readKuaimaiCredential(context.values),
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return normalizeActionOutput(actionName, payload);
  },
);

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "kuaimai",
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<KuaimaiContext> {
    const credential = await requireCustomCredential(context, "kuaimai");
    return { values: credential.values, fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "kuaimai",
  baseUrl: kuaimaiApiOrigin,
  auth: { type: "custom_credential_header", field: "appKey", name: "x-kuaimai-credential" },
  skipDnsValidation: true,
  customizeRequest(context) {
    if (context.method.toUpperCase() !== "POST") throw providerInputError("Kuaimai proxy requests must use POST");
    if (context.url.pathname !== "/router" && context.url.pathname !== "/router/")
      throw providerInputError("Kuaimai proxy requests must target the /router endpoint");
    if (context.credential?.authType !== "custom_credential")
      throw new ProviderRequestError(401, "Configure Kuaimai credentials first.");
    const parameters = readProxyParameters(context.body);
    for (const [name, value] of context.url.searchParams) parameters[name] = value;
    context.url.search = "";
    context.headers.delete("x-kuaimai-credential");
    context.setBody(buildSignedKuaimaiBody(parameters, readKuaimaiCredential(context.credential.values)));
    context.headers.set("accept", "application/json");
    context.headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const credential = readKuaimaiCredential(input.values);
    await requestKuaimai({
      method: actionMethodByName.list_warehouses,
      parameters: {},
      credential,
      fetcher,
      signal,
    });
    const accountHash = createHash("sha256")
      .update(`${credential.appKey}:${credential.accessToken}`)
      .digest("hex")
      .slice(0, 16);
    return {
      profile: {
        accountId: `kuaimai:${accountHash}`,
        displayName: `Kuaimai ERP · ${credential.appKey.slice(-6)}`,
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: kuaimaiApiUrl, validationMethod: actionMethodByName.list_warehouses },
    };
  },
};

function createKuaimaiSignature(parameters: Record<string, string>, appSecret: string) {
  const canonical = Object.entries(parameters)
    .filter(([name]) => name !== "sign")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => `${name}${value}`)
    .join("");
  return createHmac("sha256", appSecret).update(canonical, "utf8").digest("hex");
}

function buildSignedKuaimaiBody(parameters: Record<string, unknown>, credential: KuaimaiCredential, now = new Date()) {
  const values = normalizeParameters(parameters);
  delete values.appKey;
  delete values.appSecret;
  delete values.accessToken;
  delete values.refreshToken;
  delete values.session;
  delete values.timestamp;
  delete values.version;
  delete values.format;
  delete values.sign_method;
  delete values.sign;
  if (values.method === actionMethodByName.refresh_session) {
    values.refreshToken = credential.refreshToken;
  }
  values.appKey = credential.appKey;
  values.timestamp = formatChinaTimestamp(now);
  values.format = "json";
  values.version = "1.0";
  values.sign_method = "hmac-sha256";
  values.session = credential.accessToken;
  values.sign = createKuaimaiSignature(values, credential.appSecret);
  return new URLSearchParams(values).toString();
}

function readKuaimaiCredential(values: Record<string, string>): KuaimaiCredential {
  return {
    appKey: requiredInputString(values.appKey, "APP Key"),
    appSecret: requiredInputString(values.appSecret, "APP Secret"),
    accessToken: requiredInputString(values.accessToken, "access token"),
    refreshToken: requiredInputString(values.refreshToken, "refresh token"),
  };
}

function buildActionParameters(actionName: ProviderActionName<"kuaimai">, input: Record<string, unknown>) {
  switch (actionName) {
    case "refresh_session":
      return {};
    case "list_warehouses":
      return compactObject({ code: input.code, name: input.name, id: input.id });
    case "list_shops":
      return compactObject({
        name: input.name,
        id: input.id,
        shortName: input.shortName,
        pageNo: input.pageNo ?? 1,
        pageSize: input.pageSize ?? 20,
      });
    case "list_products":
      return compactObject({
        activeStatus: input.activeStatus,
        startModified: input.modifiedAfter,
        endModified: input.modifiedBefore,
        type: input.productType,
        orderBy: input.orderBy,
        whetherReturnPurchase: booleanFlag(optionalBoolean(input.includePurchaseLinks)),
        pageNo: input.pageNo ?? 1,
        pageSize: input.pageSize ?? 40,
      });
    case "get_product":
      return compactObject({
        sysItemId: input.systemProductId,
        outerId: input.merchantProductCode,
        whetherReturnPurchase: booleanFlag(optionalBoolean(input.includePurchaseLinks)),
      });
    case "list_inventory":
      return compactObject({
        outerId: input.merchantProductCode,
        skuOuterId: input.merchantSkuCode,
        pageNo: input.pageNo ?? 1,
        pageSize: input.pageSize ?? 20,
      });
    case "list_orders":
    case "list_sales_stockouts":
      return buildTradeParameters(input);
  }
}

function buildTradeParameters(input: Record<string, unknown>) {
  return compactObject({
    sid: commaSeparatedValues(input.systemOrderIds),
    tid: commaSeparatedValues(input.platformOrderIds),
    timeType: input.timeType,
    startTime: input.startTime,
    endTime: input.endTime,
    userIds: commaSeparatedValues(input.shopIds),
    status: commaSeparatedValues(input.statuses),
    tagIds: commaSeparatedValues(input.tagIds),
    exceptIds: commaSeparatedValues(input.exceptionIds),
    exceptionStatus: commaSeparatedValues(input.exceptionStatuses),
    onlyContain: input.exceptionMatch,
    types: commaSeparatedValues(input.orderTypes),
    buyerNick: input.buyerNick,
    queryType: optionalBoolean(input.archived) ? 1 : 0,
    outSids: commaSeparatedValues(input.trackingNumbers),
    useHasNext: input.useCursor === true ? true : undefined,
    useCursor: input.useCursor,
    cursor: input.cursor,
    pageNo: input.pageNo ?? 1,
    pageSize: input.pageSize ?? 20,
  });
}

function normalizeActionOutput(actionName: ProviderActionName<"kuaimai">, payload: Record<string, unknown>) {
  switch (actionName) {
    case "refresh_session": {
      const session = optionalRecord(payload.session);
      if (!session) {
        throw providerResponseError("Kuaimai returned an invalid session");
      }
      return { session };
    }
    case "list_warehouses":
      return { warehouses: requireList(payload.list, "warehouse list") };
    case "get_product": {
      const product = optionalRecord(payload.item);
      if (!product) {
        throw providerResponseError("Kuaimai returned an invalid product");
      }
      return { product };
    }
    case "list_shops":
      return { shops: requireList(payload.list, "shop list") };
    case "list_products":
      return renameList(normalizeList(payload, "items"), "products");
    case "list_inventory":
      return renameList(normalizeList(payload, "stockStatusVoList"), "inventory");
    case "list_orders":
      return renameList(normalizeList(payload, "list"), "orders");
    case "list_sales_stockouts":
      return renameList(normalizeList(payload, "list"), "stockouts");
  }
}

function normalizeList(payload: Record<string, unknown>, field: string): NormalizedListOutput {
  return {
    items: requireList(payload[field], `${field} result`),
    total: optionalInteger(payload.total) ?? null,
    hasNext: typeof payload.hasNext === "boolean" ? payload.hasNext : null,
    cursor: optionalString(payload.cursor) ?? null,
  };
}

function renameList(output: NormalizedListOutput, field: string) {
  return {
    [field]: output.items,
    total: output.total,
    hasNext: output.hasNext,
    cursor: output.cursor,
  };
}

function requireList(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw providerResponseError(`Kuaimai returned an invalid ${label}`);
  }
  return value;
}

async function requestKuaimai(input: KuaimaiRequestInput) {
  return runProviderRequest({ label: "Kuaimai", signal: input.signal }, async (signal) => {
    const response = await input.fetcher(kuaimaiApiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": providerUserAgent,
      },
      body: buildSignedKuaimaiBody({ ...input.parameters, method: input.method }, input.credential, input.now),
      signal,
    });
    const payload = await readKuaimaiPayload(response);
    if (!response.ok || payload.success === false) {
      throw createKuaimaiError(response.status, payload);
    }
    return payload;
  });
}

async function readKuaimaiPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw providerResponseError("Kuaimai returned an empty response");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw providerResponseError("Kuaimai returned invalid JSON");
  }
  const root = optionalRecord(payload);
  if (!root) {
    throw providerResponseError("Kuaimai returned an invalid response");
  }
  return root;
}

function createKuaimaiError(status: number, payload: Record<string, unknown>) {
  const code = optionalString(payload.code);
  const message =
    optionalString(payload.msg)?.trim() ||
    optionalString(payload.message)?.trim() ||
    `Kuaimai request failed with status ${status}`;
  const detail = code ? `[${code}] ${message}` : message;
  if (status === 429) {
    return new ProviderRequestError(429, detail);
  }
  if (status === 400 || status === 422) {
    return providerInputError(detail);
  }
  return new ProviderRequestError(responseStatus(status), detail);
}

function responseStatus(status: number) {
  return 400 <= status && status < 600 ? status : 502;
}

function normalizeParameters(parameters: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(parameters)) {
    if (value == null) continue;
    result[name] = typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return result;
}

function readProxyParameters(body: unknown): Record<string, unknown> {
  if (body == null) return {};
  if (typeof body === "string") return Object.fromEntries(new URLSearchParams(body));
  const object = optionalRecord(body);
  if (object) return object;
  throw providerInputError("Kuaimai proxy body must be an object or form-encoded string");
}

function commaSeparatedValues(value: unknown) {
  return Array.isArray(value) ? value.join(",") : undefined;
}

function booleanFlag(value: boolean | undefined) {
  return value == null ? undefined : value ? 1 : 0;
}

function formatChinaTimestamp(value: Date) {
  const chinaOffsetMs = 8 * 60 * 60 * 1_000;
  return new Date(value.getTime() + chinaOffsetMs).toISOString().slice(0, 19).replace("T", " ");
}
