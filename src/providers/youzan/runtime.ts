import type { CredentialValidationResult, ExecutionResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  toProviderExecutionError,
} from "../provider-runtime.ts";

export const youzanApiBaseUrl = "https://open.youzanyun.com";
const youzanTokenUrl = `${youzanApiBaseUrl}/auth/token`;

type YouzanPhase = "validate" | "execute";

export interface YouzanCredential {
  clientId: string;
  clientSecret: string;
  grantId: string;
}

export interface YouzanContext {
  credential: YouzanCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface YouzanToken {
  accessToken: string;
  scope: string[];
  authorityId: string;
}

export async function validateYouzanCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = resolveYouzanCredential(values);
  const token = await getYouzanToken(credential, fetcher, "validate", signal);
  return {
    profile: {
      accountId: token.authorityId,
      displayName: `Youzan Store ${token.authorityId}`,
    },
    grantedScopes: token.scope,
    metadata: {
      apiBaseUrl: youzanApiBaseUrl,
      grantId: credential.grantId,
    },
  };
}

export function resolveYouzanCredential(input: Record<string, string>): YouzanCredential {
  const clientId = optionalString(input.clientId);
  const clientSecret = optionalString(input.clientSecret);
  const grantId = optionalString(input.grantId);
  if (!clientId || !clientSecret || !grantId) {
    throw new ProviderRequestError(400, "youzan clientId, clientSecret, and grantId are required");
  }
  if ([...grantId].some((character) => character < "0" || character > "9")) {
    throw new ProviderRequestError(400, "youzan grantId must contain only digits");
  }
  return { clientId, clientSecret, grantId };
}

export async function getYouzanToken(
  credential: YouzanCredential,
  fetcher: ProviderFetch,
  phase: YouzanPhase,
  signal?: AbortSignal,
): Promise<YouzanToken> {
  const { response, payload } = await fetchYouzanJson(
    youzanTokenUrl,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        authorize_type: "silent",
        client_id: credential.clientId,
        client_secret: credential.clientSecret,
        grant_id: credential.grantId,
        refresh: false,
      }),
    },
    fetcher,
    signal,
  );
  const data = optionalRecord(payload.data);
  const accessToken = optionalString(data?.access_token);
  if (
    !response.ok ||
    payload.success === false ||
    (payload.code !== undefined && payload.code !== 200) ||
    !accessToken
  ) {
    throw createYouzanTokenError(response.status, payload, phase);
  }
  return {
    accessToken,
    scope: optionalString(data?.scope)?.split(" ").filter(Boolean) ?? [],
    authorityId: optionalString(data?.authority_id) ?? credential.grantId,
  };
}

export function toYouzanExecutionError(error: unknown): ExecutionResult {
  return toProviderExecutionError(error, "Youzan request failed");
}

export const youzanActionHandlers: ProviderActionHandlers<"youzan", ProviderRuntimeHandler<YouzanContext>> = {
  async get_shop(_input, context) {
    const data = requireObject(await requestYouzanApi("youzan.shop.basic.get", "3.0.0", {}, context), "Youzan shop");
    return { shop: data };
  },
  async list_inventory_items(input, context) {
    validatePageWindow(input, 40, 4_000);
    const page = optionalInteger(input.page) ?? 1;
    const pageSize = optionalInteger(input.pageSize) ?? 40;
    const data = requireObject(
      await requestYouzanApi(
        "youzan.items.inventory.get",
        "3.0.0",
        compactObject({
          banner: optionalString(input.status),
          q: optionalString(input.query),
          order_by: optionalString(input.orderBy),
          update_time_start: optionalInteger(input.updatedAfter),
          update_time_end: optionalInteger(input.updatedBefore),
          node_kdt_id: optionalInteger(input.nodeKdtId),
          page_no: page,
          page_size: pageSize,
        }),
        context,
      ),
      "Youzan inventory",
    );
    return {
      items: requireObjectArray(data.items, "Youzan inventory items"),
      total: requireNonNegativeInteger(data.count, "Youzan inventory total"),
      page,
      pageSize,
    };
  },
  async get_item(input, context) {
    const data = requireObject(
      await requestYouzanApi("youzan.item.detail.get", "1.0.1", { item_id: optionalInteger(input.itemId) }, context),
      "Youzan item",
    );
    return { item: data };
  },
  async list_onsale_items(input, context) {
    validatePageWindow(input, 20, 5_000);
    const page = optionalInteger(input.page) ?? 1;
    const pageSize = optionalInteger(input.pageSize) ?? 20;
    const data = requireObject(
      await requestYouzanApi(
        "youzan.item.base.search",
        "1.0.0",
        compactObject({
          kdt_id: optionalInteger(input.kdtId) ?? Number(context.credential.grantId),
          channel: optionalInteger(input.channel) ?? 0,
          is_displays: [1],
          sold_status_list: [0, 1, 3],
          title: optionalString(input.title),
          item_ids: input.itemIds,
          item_codes: input.itemCodes,
          item_range_query:
            input.updatedAfter === undefined && input.updatedBefore === undefined
              ? undefined
              : compactObject({
                  min_update_time: optionalInteger(input.updatedAfter),
                  max_update_time: optionalInteger(input.updatedBefore),
                }),
          page_no: page,
          page_size: pageSize,
        }),
        context,
      ),
      "Youzan on-sale items",
    );
    const paginator = requireObject(data.paginator, "Youzan on-sale item paginator");
    return {
      items: requireObjectArray(data.items, "Youzan on-sale items"),
      total: requireNonNegativeInteger(paginator.total_count, "Youzan on-sale item total"),
      page,
      pageSize,
    };
  },
  async list_orders(input, context) {
    validateOrderTimePairs(input);
    const page = optionalInteger(input.page) ?? 1;
    const pageSize = optionalInteger(input.pageSize) ?? 20;
    const data = requireObject(
      await requestYouzanApi(
        "youzan.trades.sold.get",
        "4.0.4",
        compactObject({
          status: optionalString(input.status),
          tid: optionalString(input.orderId),
          keywords: optionalString(input.keywords),
          goods_id: optionalInteger(input.itemId),
          express_type: optionalString(input.expressType),
          start_created: optionalString(input.createdAfter),
          end_created: optionalString(input.createdBefore),
          start_update: optionalString(input.updatedAfter),
          end_update: optionalString(input.updatedBefore),
          start_success: optionalString(input.completedAfter),
          end_success: optionalString(input.completedBefore),
          node_kdt_id: optionalInteger(input.nodeKdtId),
          page_no: page,
          page_size: pageSize,
        }),
        context,
      ),
      "Youzan orders",
    );
    const orders = requireObjectArray(data.full_order_info_list, "Youzan orders").map((item) =>
      requireObject(item.full_order_info, "Youzan order"),
    );
    return {
      orders,
      total: requireNonNegativeInteger(data.total_results, "Youzan order total"),
      page,
      pageSize,
    };
  },
  async get_order(input, context) {
    const data = requireObject(
      await requestYouzanApi("youzan.trade.get", "4.0.2", { tid: optionalString(input.orderId) }, context),
      "Youzan order",
    );
    return { order: requireObject(data.full_order_info, "Youzan order detail") };
  },
  async list_refunds(input, context) {
    validatePageWindow(input, 20, 3_000);
    const page = optionalInteger(input.page) ?? 1;
    const pageSize = optionalInteger(input.pageSize) ?? 20;
    const data = requireObject(
      await requestYouzanApi(
        "youzan.trade.refund.search",
        "3.0.1",
        compactObject({
          tid: optionalString(input.orderId),
          refund_id: optionalString(input.refundId),
          status: optionalString(input.status),
          demand: optionalInteger(input.demand),
          create_time_start: optionalInteger(input.createdAfter),
          create_time_end: optionalInteger(input.createdBefore),
          update_time_start: optionalInteger(input.updatedAfter),
          update_time_end: optionalInteger(input.updatedBefore),
          node_kdt_id: optionalInteger(input.nodeKdtId),
          page_no: page,
          page_size: pageSize,
        }),
        context,
      ),
      "Youzan refunds",
    );
    return {
      refunds: requireObjectArray(data.refunds, "Youzan refunds"),
      total: requireNonNegativeInteger(data.total, "Youzan refund total"),
      page,
      pageSize,
    };
  },
  async get_refund(input, context) {
    const includeAllConsultMessages = input.includeAllConsultMessages;
    const data = requireObject(
      await requestYouzanApi(
        "youzan.trade.refund.get",
        "3.0.1",
        compactObject({
          refund_id: optionalString(input.refundId),
          query_option:
            typeof includeAllConsultMessages === "boolean"
              ? { include_all_consult_message: includeAllConsultMessages }
              : undefined,
        }),
        context,
      ),
      "Youzan refund",
    );
    return { refund: data };
  },
  async get_order_logistics(input, context) {
    const packages = requireObjectArray(
      await requestYouzanApi(
        "youzan.logistics.order.batch.query",
        "1.0.0",
        {
          order_detail_params: [
            {
              order_id: optionalString(input.orderId),
              source_id: optionalInteger(input.sourceId) ?? 1002,
            },
          ],
        },
        context,
      ),
      "Youzan logistics packages",
    );
    return { packages };
  },
};

function validatePageWindow(input: Record<string, unknown>, defaultPageSize: number, maximum: number): void {
  const page = optionalInteger(input.page) ?? 1;
  if (page * (optionalInteger(input.pageSize) ?? defaultPageSize) > maximum) {
    throw new ProviderRequestError(400, `page multiplied by pageSize cannot exceed ${maximum}`);
  }
}

function validateOrderTimePairs(input: Record<string, unknown>): void {
  for (const [after, before] of [
    ["createdAfter", "createdBefore"],
    ["updatedAfter", "updatedBefore"],
    ["completedAfter", "completedBefore"],
  ]) {
    if ((input[after] !== undefined) !== (input[before] !== undefined)) {
      throw new ProviderRequestError(400, `${after} and ${before} must be provided together`);
    }
  }
}

async function requestYouzanApi(
  api: string,
  version: string,
  body: Record<string, unknown>,
  context: YouzanContext,
): Promise<unknown> {
  const token = await getYouzanToken(context.credential, context.fetcher, "execute", context.signal);
  const url = new URL(`/api/${api}/${version}`, youzanApiBaseUrl);
  url.searchParams.set("access_token", token.accessToken);
  const { response, payload } = await fetchYouzanJson(
    url,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
    },
    context.fetcher,
    context.signal,
  );
  if (!response.ok || payload.success === false || (payload.code !== undefined && payload.code !== 200)) {
    throw createYouzanApiError(response.status, payload);
  }
  if (payload.data === undefined || payload.data === null) {
    throw youzanError("provider_error", "Youzan returned an invalid data payload", 502);
  }
  return payload.data;
}

async function fetchYouzanJson(
  url: string | URL,
  init: RequestInit,
  fetcher: ProviderFetch,
  parentSignal?: AbortSignal,
): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const timeout = createProviderTimeout(parentSignal);
  try {
    const response = await fetcher(url, { ...init, signal: timeout.signal });
    const text = await response.text();
    if (!text) return { response, payload: {} };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw youzanError("provider_error", "Youzan returned invalid JSON", 502);
    }
    const payload = optionalRecord(parsed);
    if (!payload) throw youzanError("provider_error", "Youzan returned invalid JSON", 502);
    return { response, payload };
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw youzanError("provider_error", "Youzan request timed out", 504);
    throw youzanError(
      "provider_error",
      error instanceof Error ? `Youzan request failed: ${error.message}` : "Youzan request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

function createYouzanTokenError(
  status: number,
  payload: Record<string, unknown>,
  phase: YouzanPhase,
): ProviderRequestError {
  const message = readYouzanMessage(payload, "Youzan rejected the application credentials");
  if (status === 429) return youzanError("rate_limited", message, 429, payload);
  if (status >= 500) return youzanError("provider_error", message, 502, payload);
  return phase === "validate"
    ? youzanError("invalid_input", message, 400, payload)
    : youzanError("authorization_failed", message, 401, payload);
}

function createYouzanApiError(status: number, payload: Record<string, unknown>): ProviderRequestError {
  const message = readYouzanMessage(payload, "Youzan API request failed");
  if (status === 429) return youzanError("rate_limited", message, 429, payload);
  if (status === 401 || status === 403 || payload.code === 40010) {
    return youzanError("authorization_failed", message, 401, payload);
  }
  return youzanError("provider_error", message, 502, payload);
}

function readYouzanMessage(payload: Record<string, unknown>, fallback: string): string {
  return optionalString(payload.message) ?? optionalString(payload.msg) ?? fallback;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw youzanError("provider_error", `${label} payload is invalid`, 502);
  return object;
}

function requireObjectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw youzanError("provider_error", `${label} payload is invalid`, 502);
  const objects = value.map(optionalRecord);
  if (objects.some((item) => item === undefined)) {
    throw youzanError("provider_error", `${label} payload is invalid`, 502);
  }
  return objects as Record<string, unknown>[];
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw youzanError("provider_error", `${label} payload is invalid`, 502);
  }
  return value;
}

function youzanError(code: string, message: string, status: number, details?: unknown): ProviderRequestError {
  return new ProviderRequestError(status, message, details, code);
}
