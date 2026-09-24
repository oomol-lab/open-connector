import type { FutunnActionInput } from "./transport.ts";

import { optionalBoolean, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, requiredInputString, requiredResponseRecord } from "../provider-runtime.ts";
import { futunnTradingActions } from "./actions.trading.ts";
import { readFutunnData, readFutunnList, requestFutunn } from "./transport.ts";

const tradingNames = new Set<string>(futunnTradingActions.map((action) => action.name));
export function isFutunnTradingAction(name: string): boolean {
  return tradingNames.has(name);
}
const listEndpoints: Record<string, { path: string; field: "orders" | "order_fills"; history: boolean }> = {
  list_open_orders: { path: "orders", field: "orders", history: false },
  list_history_orders: { path: "orders_history", field: "orders", history: true },
  list_today_deals: { path: "order_fills", field: "order_fills", history: false },
  list_history_deals: { path: "fills_history", field: "order_fills", history: true },
};

export async function executeFutunnTradingAction(input: FutunnActionInput, fetcher: typeof fetch): Promise<unknown> {
  const v = input.input;
  const path = `/api/v1.0/accounts/${encodeURIComponent(requiredInputString(v.accountId, "accountId"))}`;
  if (input.actionName === "get_order_details") {
    const envelope = await requestFutunn(
      input,
      fetcher,
      `${path}/orders/detail`,
      {},
      { exchange: v.exchange, order_ids: v.orderIds },
    );
    return { orders: readFutunnList(readFutunnData(envelope), "order details") };
  }
  const endpoint = listEndpoints[input.actionName];
  if (!endpoint) throw new ProviderRequestError(400, `Unknown Futunn trading action: ${input.actionName}`);
  const envelope = await requestFutunn(input, fetcher, `${path}/${endpoint.path}`, {
    trd_market: v.market,
    page_flag: v.pageFlag ?? "",
    page_size: v.pageSize,
    code: endpoint.history ? v.code : undefined,
    start: endpoint.history ? v.start : undefined,
    end: endpoint.history ? v.end : undefined,
  });
  const data = requiredResponseRecord(readFutunnData(envelope), "Futunn account records");
  return {
    [endpoint.field === "orders" ? "orders" : "deals"]: readFutunnList(data[endpoint.field], endpoint.field),
    pageFlag: optionalString(data.page_flag) ?? null,
    completed: optionalBoolean(data.completed) ?? null,
  };
}
