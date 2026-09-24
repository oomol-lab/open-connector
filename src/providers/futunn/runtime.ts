import type { FutunnActionInput } from "./transport.ts";

import { optionalNumber } from "../../core/cast.ts";
import { requiredInputString, requiredResponseRecord } from "../provider-runtime.ts";
import { executeFutunnResearchAction, isFutunnResearchAction } from "./runtime-research.ts";
import { executeFutunnTradingAction, isFutunnTradingAction } from "./runtime-trading.ts";
import { readFutunnData, readFutunnList, requestFutunn } from "./transport.ts";

export async function executeFutunnAction(input: FutunnActionInput, fetcher: typeof fetch): Promise<unknown> {
  const values = input.input;
  const request = (path: string, query?: Record<string, unknown>, body?: unknown) =>
    requestFutunn(input, fetcher, path, query, body).then(readFutunnData);
  if (isFutunnResearchAction(input.actionName)) return executeFutunnResearchAction(input, fetcher);
  if (isFutunnTradingAction(input.actionName)) return executeFutunnTradingAction(input, fetcher);
  switch (input.actionName) {
    case "get_market_snapshot": {
      const data = requiredResponseRecord(
        await request("/api/v1.0/quote/snapshot", {}, { code_list: values.symbols }),
        "Futunn snapshot data",
      );
      return { snapshots: readFutunnList(data.snapshot_list, "snapshot_list") };
    }
    case "get_history_kline": {
      const data = requiredResponseRecord(
        await request(
          `/api/v1.0/quote/${encodeURIComponent(requiredInputString(values.symbol, "symbol"))}/history-kline`,
          {
            start: values.start,
            end: values.end,
            ktype: values.ktype,
            autype: values.autype,
            num: values.num,
            extended_time: values.extendedTime,
          },
        ),
        "Futunn history data",
      );
      return {
        bars: readFutunnList(data.kline_list, "kline_list"),
        nextTime: optionalNumber(data.next_time) ?? null,
        volumePrecision: optionalNumber(data.volume_precision) ?? null,
      };
    }
    case "list_trading_days": {
      const data = requiredResponseRecord(
        await request("/api/v1.0/quote/trading-days", values),
        "Futunn calendar data",
      );
      return { tradingDays: readFutunnList(data.trading_days, "trading_days") };
    }
    case "list_accounts": {
      const data = requiredResponseRecord(
        await request("/api/v1.0/accounts/authorized_trd_accs"),
        "Futunn account data",
      );
      return { accounts: readFutunnList(data.accounts, "accounts") };
    }
    case "get_account_funds":
      return {
        funds: requiredResponseRecord(
          await request(
            `/api/v1.0/accounts/${encodeURIComponent(requiredInputString(values.accountId, "accountId"))}/funds`,
            { currency: values.currency },
          ),
          "Futunn funds",
        ),
      };
    case "list_positions":
      return {
        positions: readFutunnList(
          await request(
            `/api/v1.0/accounts/${encodeURIComponent(requiredInputString(values.accountId, "accountId"))}/positions`,
            { code: values.code, pl_ratio_min: values.plRatioMin, pl_ratio_max: values.plRatioMax },
          ),
          "positions",
        ),
      };
  }
}
