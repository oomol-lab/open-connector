import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const macroCalendarOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "list_economic_cn_cpi",
    toolName: "list_economic_cn_cpi",
    description: "List economic China cpi data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_economic_cn_cpi operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_economic_cn_cpi.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_economic_cn_cpi.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_economic_cn_cpi.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_economic_cn_cpi.", {
            minimum: 1,
          }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_economic_cn_ppi",
    toolName: "list_economic_cn_ppi",
    description: "List economic China ppi data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_economic_cn_ppi operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_economic_cn_ppi.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_economic_cn_ppi.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_economic_cn_ppi.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_economic_cn_ppi.", {
            minimum: 1,
          }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_gover_bond_yield",
    toolName: "list_gover_bond_yield",
    description: "List gover bond yield data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_gover_bond_yield operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_gover_bond_yield.", { minLength: 1 }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_gover_bond_yield.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_gover_bond_yield.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_gover_bond_yield.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_money_market_repo_in",
    toolName: "list_money_market_repo_in",
    description: "List money market repo in data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_money_market_repo_in operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_money_market_repo_in.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_money_market_repo_in.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_money_market_repo_in.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_money_market_repo_in.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_money_supplies",
    toolName: "list_money_supplies",
    description: "List money supplies data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_money_supplies operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_money_supplies.", { minLength: 1 }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_money_supplies.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_money_supplies.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_money_supplies.", {
            minimum: 1,
          }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_social_financing_sto",
    toolName: "list_social_financing_sto",
    description: "List social financing sto data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_social_financing_sto operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_social_financing_sto.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_social_financing_sto.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_social_financing_sto.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_social_financing_sto.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_equity_val",
    toolName: "list_macro_equity_val",
    description: "List macro equity valuation data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_equity_val operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_equity_val.", { minLength: 1 }),
          ["2024-01-01"],
        ),
        marketName: s.withExamples(
          s.stringEnum("Market name Accepted by Investoday for list_macro_equity_val.", [
            "United States",
            "Canada",
            "United Kingdom",
            "France",
            "Germany",
            "Italy",
            "South Korea",
            "India",
            "Japan",
            "China",
            "Hong Kong",
            "Taiwan",
            "Australia",
            "Global Equity Markets",
          ]),
          ["United States"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_equity_val.", { minLength: 1 }),
          ["2026-08-14"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_equity_val.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_equity_val.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_exch_rates",
    toolName: "list_macro_exch_rates",
    description: "List macro exch rates data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_exch_rates operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_exch_rates.", { minLength: 1 }),
          ["2024-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_exch_rates.", { minLength: 1 }),
          ["2024-12-31"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_exch_rates.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        currencyCode: s.array(
          "Currency code Accepted by Investoday for list_macro_exch_rates.",
          s.stringEnum("One currencyCode value.", [
            "AED",
            "AUD",
            "CAD",
            "CHF",
            "DKK",
            "EUR",
            "GBP",
            "HKD",
            "HUF",
            "JPY",
            "KRW",
            "MOP",
            "MXN",
            "MYR",
            "NOK",
            "NZD",
            "PLN",
            "RUB",
            "SEK",
            "SGD",
            "THB",
            "TRY",
            "USD",
            "ZAR",
          ]),
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_exch_rates.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_fiscal_exp",
    toolName: "list_macro_fiscal_exp",
    description: "List macro fiscal exp data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_fiscal_exp operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_fiscal_exp.", { minLength: 1 }),
          ["2023-01-31"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_fiscal_exp.", { minLength: 1 }),
          ["2023-09-30"],
        ),
        indCodes: s.withExamples(
          s.array(
            "Industry codes Accepted by Investoday for list_macro_fiscal_exp.",
            s.withEnum(s.integer("One indCode value."), [110002480, 110002481]),
          ),
          [[110002480, 110002481]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_fiscal_exp.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_fiscal_exp.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_fixed_asset",
    toolName: "list_macro_fixed_asset",
    description: "List macro fixed asset data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_fixed_asset operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_fixed_asset.", {
            minLength: 1,
          }),
          ["2023-01-31"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_fixed_asset.", { minLength: 1 }),
          ["2023-09-30"],
        ),
        indCodes: s.withExamples(
          s.array(
            "Industry codes Accepted by Investoday for list_macro_fixed_asset.",
            s.withEnum(
              s.integer("One indCode value."),
              [110115280, 110114485, 110114484, 110114483, 110114481, 110114479, 110114672],
            ),
          ),
          [[110115280, 110114485]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_fixed_asset.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_fixed_asset.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_goods_trade",
    toolName: "list_macro_goods_trade",
    description: "List macro goods trade data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_goods_trade operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_goods_trade.", {
            minLength: 1,
          }),
          ["2023-01-31"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_goods_trade.", { minLength: 1 }),
          ["2023-09-30"],
        ),
        indCodes: s.withExamples(
          s.array(
            "Industry codes Accepted by Investoday for list_macro_goods_trade.",
            s.withEnum(
              s.integer("One indCode value."),
              [
                110081729, 110081749, 110183587, 110183586, 110127295, 110006286, 110183585, 110183584, 110005221,
                110005222, 110183583, 110183582, 210032348, 210032347,
              ],
            ),
          ),
          [[110081729, 110127295]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_goods_trade.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_goods_trade.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_re_invest",
    toolName: "list_macro_re_invest",
    description: "List macro re invest data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_re_invest operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_re_invest.", { minLength: 1 }),
          ["2023-01-31"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_re_invest.", {
            minLength: 1,
          }),
          ["2023-09-30"],
        ),
        indCodes: s.withExamples(
          s.array(
            "Industry codes Accepted by Investoday for list_macro_re_invest.",
            s.withEnum(
              s.integer("One indCode value."),
              [110116170, 110116171, 110116448, 110116449, 110116444, 110116445, 110116442, 110116443],
            ),
          ),
          [[110116170, 110116171]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_re_invest.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_re_invest.", {
            minimum: 1,
          }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_retail_area",
    toolName: "list_macro_retail_area",
    description: "List macro retail area data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_retail_area operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_retail_area.", {
            minLength: 1,
          }),
          ["2023-01-31"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_retail_area.", { minLength: 1 }),
          ["2023-09-30"],
        ),
        indCodes: s.withExamples(
          s.array(
            "Industry codes Accepted by Investoday for list_macro_retail_area.",
            s.withEnum(
              s.integer("One indCode value."),
              [110232455, 110232456, 110232460, 110232459, 110232462, 110232461, 110232468, 110232466],
            ),
          ),
          [[110232455, 110232456]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_retail_area.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_retail_area.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_rmb_credit",
    toolName: "list_macro_rmb_credit",
    description: "List macro rmb credit data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_rmb_credit operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_rmb_credit.", { minLength: 1 }),
          ["2023-01-31"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_rmb_credit.", { minLength: 1 }),
          ["2023-09-30"],
        ),
        indCodes: s.withExamples(
          s.array(
            "Industry codes Accepted by Investoday for list_macro_rmb_credit.",
            s.withEnum(
              s.integer("One indCode value."),
              [
                191000657, 701013601, 191000654, 701013594, 701013595, 191000664, 701013597, 701013598, 701013600,
                191000652, 701013603, 701013602, 191000668, 191000669, 191000665, 110138331, 110138333, 191000660,
                110232974, 110233159, 701013616, 110255549, 110255550, 701013617, 110233153, 110255552, 110233154,
                110233148, 110233152, 110255554, 701013622, 701013623, 701013624, 110255557, 110111032, 110242346,
                191000667, 191000677, 191000672, 110138330,
              ],
            ),
          ),
          [[191000657, 191000660]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_rmb_credit.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_rmb_credit.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_soc_fin",
    toolName: "list_macro_soc_fin",
    description: "List macro soc financial data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_soc_fin operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_soc_fin.", {
            minLength: 1,
          }),
          ["2023-01-31"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_soc_fin.", {
            minLength: 1,
          }),
          ["2023-09-30"],
        ),
        indCodes: s.withExamples(
          s.array(
            "Industry codes Accepted by Investoday for list_macro_soc_fin.",
            s.withEnum(
              s.integer("One indCode value."),
              [
                150000075, 150000076, 150000077, 150000664, 150000665, 150000666, 150000667, 150008052, 150000668,
                150008054, 150008055,
              ],
            ),
          ),
          [[150000075, 150000076]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_soc_fin.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_soc_fin.", {
            minimum: 1,
          }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_macro_spot_quotes",
    toolName: "list_macro_spot_quotes",
    description: "List macro spot quotes data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_macro_spot_quotes operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_macro_spot_quotes.", {
            minLength: 1,
          }),
          ["2026-01-01"],
        ),
        spotCode: s.withExamples(
          s.nonEmptyString("Spot instrument code Accepted by Investoday for list_macro_spot_quotes."),
          ["SPOT001"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_macro_spot_quotes.", { minLength: 1 }),
          ["2026-08-14"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_macro_spot_quotes.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_macro_spot_quotes.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "is_trade_date",
    toolName: "is_trade_date",
    description: "Check whether trade date with Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday is_trade_date operation.",
      {
        tDate: s.withExamples(
          s.nonEmptyString("Trading date in YYYY-MM-DD format Accepted by Investoday for is_trade_date."),
          ["2025-12-22"],
        ),
      },
      { required: ["tDate"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_trade_special_date",
    toolName: "get_trade_special_date",
    description: "Get trade special date data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_trade_special_date operation.",
      {
        tradeDate: s.withExamples(
          s.date("Trading date in YYYY-MM-DD format Accepted by Investoday for get_trade_special_date.", {
            minLength: 1,
          }),
          ["2025-05-19"],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_cn_trade_calender_list",
    toolName: "get_cn_trade_calender_list",
    description: "Get China trade calender list data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_cn_trade_calender_list operation.",
      {
        cycle: s.withExamples(
          s.stringEnum("Analysis cycle Accepted by Investoday for get_cn_trade_calender_list.", [
            "M1",
            "M3",
            "M6",
            "Y1",
          ]),
          ["Y1"],
        ),
      },
      { required: ["cycle"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
