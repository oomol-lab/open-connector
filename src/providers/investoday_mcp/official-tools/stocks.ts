import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const stocksOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "list_stock_absorption_mergers",
    toolName: "list_stock_absorption_mergers",
    description: "List stock absorption mergers data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_absorption_mergers operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_absorption_mergers.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_absorption_mergers.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_absorption_mergers.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_absorption_mergers.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_adjusted_quotes",
    toolName: "list_stock_adjusted_quotes",
    description: "Get forward-adjusted daily stock prices over a date range, including batch queries and pagination.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for list_stock_adjusted_quotes.",
        {
          stockCode: s.nonEmptyString("One stock code. Supply exactly one of stockCode or stockCodes."),
          stockCodes: s.array(
            "Stock codes for a batch query. Supply exactly one of stockCode or stockCodes.",
            s.nonEmptyString("A stock code."),
            { minItems: 1 },
          ),
          beginDate: s.date("Start date in YYYY-MM-DD format; earliest supported date is 2020-01-01."),
          endDate: s.date("End date in YYYY-MM-DD format."),
          pageNum: s.integer("Page number, starting at 1.", { minimum: 1 }),
          pageSize: s.integer("Records per page, from 1 to 500.", { minimum: 1, maximum: 500 }),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_share_adj_factors",
    toolName: "list_stock_share_adj_factors",
    description: "List stock share adjusted factors data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_share_adj_factors operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_share_adj_factors.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_share_adj_factors.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_share_adj_factors.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_share_adj_factors.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_all",
    toolName: "list_stock_all",
    description: "List stock all data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_all operation.",
      {
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_all.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_all.", {
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
    name: "list_stock_balance_sheet",
    toolName: "list_stock_balance_sheet",
    description: "List stock balance sheet data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_balance_sheet operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_balance_sheet.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_balance_sheet.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_balance_sheet.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_balance_sheet.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_balan_sheet_pit",
    toolName: "list_stk_balan_sheet_pit",
    description: "List stock balan sheet pit data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stk_balan_sheet_pit operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stk_balan_sheet_pit.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stk_balan_sheet_pit.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stk_balan_sheet_pit.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_balan_sheet_pit.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_basic_info",
    toolName: "get_stock_basic_info",
    description: "Get basic information for one or multiple Shanghai, Shenzhen or Beijing stocks.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for get_stock_basic_info.",
        {
          stockCode: s.nonEmptyString("One stock code. Supply exactly one of stockCode or stockCodes."),
          stockCodes: s.array(
            "Stock codes for a batch query. Supply exactly one of stockCode or stockCodes.",
            s.nonEmptyString("A stock code."),
            { minItems: 1 },
          ),
          pageNum: s.integer("Page number, starting at 1.", { minimum: 1 }),
          pageSize: s.integer("Records per page, from 1 to 500.", { minimum: 1, maximum: 500 }),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_capital_changes",
    toolName: "list_stock_capital_changes",
    description: "List stock capital changes data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_capital_changes operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_capital_changes.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_capital_changes.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_capital_changes.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_capital_changes.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_cash_flows",
    toolName: "list_stock_cash_flows",
    description: "List stock cash flows data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_cash_flows operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_cash_flows.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_cash_flows.", { minLength: 1 }),
            ["2022-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_cash_flows.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_cash_flows.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_cash_flows_pit",
    toolName: "list_stock_cash_flows_pit",
    description: "List stock cash flows pit data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_cash_flows_pit operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_cash_flows_pit.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_cash_flows_pit.", {
            minLength: 1,
          }),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_cash_flows_pit.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_cash_flows_pit.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_company_profiles",
    toolName: "get_company_profiles",
    description: "Get company profiles data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_company_profiles operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_company_profiles.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_company_profiles.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_core_mgmt_changes",
    toolName: "list_stock_core_mgmt_changes",
    description: "List stock core mgmt changes data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_core_mgmt_changes operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_core_mgmt_changes.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          positionStatus: s.withExamples(
            s.stringEnum("Position status Accepted by Investoday for list_stock_core_mgmt_changes.", ["1", "0", "-1"]),
            ["1"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_core_mgmt_changes.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_core_mgmt_changes.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_core_mgmt_changes.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stocks_dividends",
    toolName: "list_stocks_dividends",
    description: "List stocks dividends data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stocks_dividends operation.",
        {
          beginDate: s.withExamples(
            s.nonEmptyString("Start date in YYYY-MM-DD format Accepted by Investoday for list_stocks_dividends."),
            ["2025-01-01"],
          ),
          endDate: s.withExamples(
            s.nonEmptyString("End date in YYYY-MM-DD format Accepted by Investoday for list_stocks_dividends."),
            ["2025-01-31"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stocks_dividends.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stocks_dividends.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_earnings_bulletins",
    toolName: "list_stock_earnings_bulletins",
    description: "List stock earnings bulletins data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_earnings_bulletins operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_earnings_bulletins.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_earnings_bulletins.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_earnings_bulletins.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_earnings_bulletins.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_executive_shareholding_change",
    toolName: "list_stock_executive_shareholding_change",
    description: "List stock executive shareholding change data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_executive_shareholding_change operation.",
        {
          beginDate: s.withExamples(
            s.date(
              "Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_executive_shareholding_change.",
              { minLength: 1 },
            ),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date(
              "End date in YYYY-MM-DD format Accepted by Investoday for list_stock_executive_shareholding_change.",
              { minLength: 1 },
            ),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer(
              "Number of records per page Accepted by Investoday for list_stock_executive_shareholding_change.",
              { minimum: 1, maximum: 500 },
            ),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer(
              "Page number, starting at 1 Accepted by Investoday for list_stock_executive_shareholding_change.",
              { minimum: 1 },
            ),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_former_names",
    toolName: "get_stock_former_names",
    description: "Get stock former names data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stock_former_names operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stock_former_names.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stock_former_names.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_freeze_details",
    toolName: "list_stock_freeze_details",
    description: "List stock freeze details data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_freeze_details operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_freeze_details.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_freeze_details.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_freeze_details.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_freeze_details.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_holder_cnt",
    toolName: "list_stock_holder_cnt",
    description: "List stock holder cnt data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_holder_cnt operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_holder_cnt.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_holder_cnt.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_holder_cnt.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_holder_cnt.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_income_statements",
    toolName: "list_stock_income_statements",
    description: "List stock income statements data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_income_statements operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_income_statements.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_income_statements.", {
              minLength: 1,
            }),
            ["2025-03-30"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_income_statements.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_income_statements.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_income_state_pit",
    toolName: "list_stk_income_state_pit",
    description: "List stock income state pit data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stk_income_state_pit operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stk_income_state_pit.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stk_income_state_pit.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stk_income_state_pit.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_income_state_pit.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_industries",
    toolName: "get_stock_industries",
    description: "Get stock industries data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stock_industries operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stock_industries.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stock_industries.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_institutional_holdings_stats",
    toolName: "list_stock_institutional_holdings_stats",
    description: "List stock institutional holdings stats data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_institutional_holdings_stats operation.",
        {
          beginDate: s.withExamples(
            s.date(
              "Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_institutional_holdings_stats.",
              { minLength: 1 },
            ),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date(
              "End date in YYYY-MM-DD format Accepted by Investoday for list_stock_institutional_holdings_stats.",
              { minLength: 1 },
            ),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer(
              "Number of records per page Accepted by Investoday for list_stock_institutional_holdings_stats.",
              { minimum: 1, maximum: 500 },
            ),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer(
              "Page number, starting at 1 Accepted by Investoday for list_stock_institutional_holdings_stats.",
              { minimum: 1 },
            ),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_major_contracts",
    toolName: "list_stock_major_contracts",
    description: "List stock major contracts data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_major_contracts operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_major_contracts.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_major_contracts.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_major_contracts.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_major_contracts.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_margin_securities",
    toolName: "get_stock_margin_securities",
    description: "Get stock margin securities data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stock_margin_securities operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stock_margin_securities.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stock_margin_securities.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_management_dirs",
    toolName: "list_stock_management_dirs",
    description: "List stock management dirs data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_management_dirs operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_management_dirs.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          positionStatus: s.withExamples(
            s.stringEnum("Position status Accepted by Investoday for list_stock_management_dirs.", ["1", "0", "-1"]),
            ["1"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_management_dirs.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_management_dirs.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_management_dirs.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_offerings",
    toolName: "list_stock_offerings",
    description: "List stock offerings data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_offerings operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_offerings.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_offerings.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_offerings.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_offerings.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_pledge_details",
    toolName: "list_stock_pledge_details",
    description: "List stock pledge details data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_pledge_details operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_pledge_details.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_pledge_details.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_pledge_details.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_pledge_details.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stocks_public_offering_place",
    toolName: "list_stocks_public_offering_place",
    description: "List stocks public offering place data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stocks_public_offering_place operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stocks_public_offering_place.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stocks_public_offering_place.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stocks_public_offering_place.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stocks_public_offering_place.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_related_transactions",
    toolName: "list_stock_related_transactions",
    description: "List stock related transactions data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_related_transactions operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_related_transactions.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_related_transactions.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_related_transactions.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_related_transactions.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_report_schema",
    toolName: "list_stock_report_schema",
    description: "List stock report schema data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_report_schema operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_report_schema.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_report_schema.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_report_schema.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_report_schema.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_repurchase_plans",
    toolName: "list_stock_repurchase_plans",
    description: "List stock repurchase plans data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_repurchase_plans operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_repurchase_plans.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_repurchase_plans.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_repurchase_plans.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_repurchase_plans.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stocks_rights_issue_res",
    toolName: "list_stocks_rights_issue_res",
    description: "List stocks rights issue res data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stocks_rights_issue_res operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stocks_rights_issue_res.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stocks_rights_issue_res.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stocks_rights_issue_res.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stocks_rights_issue_res.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_rights_issues",
    toolName: "get_stock_rights_issues",
    description: "Get stock rights issues data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stock_rights_issues operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for get_stock_rights_issues.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for get_stock_rights_issues.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stock_rights_issues.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stock_rights_issues.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_special_notices",
    toolName: "list_stock_special_notices",
    description: "List stock special notices data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_special_notices operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_special_notices.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_special_notices.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_special_notices.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_special_notices.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_tender_offers",
    toolName: "list_stock_tender_offers",
    description: "List stock tender offers data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_tender_offers operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_tender_offers.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_tender_offers.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_tender_offers.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_tender_offers.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_top10_circulating_shareh",
    toolName: "list_stock_top10_circulating_shareh",
    description: "List stock top10 circulating shareh data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_top10_circulating_shareh operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_top10_circulating_shareh.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_top10_circulating_shareh.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_top10_circulating_shareh.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_top10_circulating_shareh.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_unadjusted_quotes",
    toolName: "list_stock_unadjusted_quotes",
    description: "List stock unadjusted quotes data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_unadjusted_quotes operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_unadjusted_quotes.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_unadjusted_quotes.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_unadjusted_quotes.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_unadjusted_quotes.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_audit_opinion",
    toolName: "list_stock_audit_opinion",
    description: "List stock audit opinion data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_audit_opinion operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_audit_opinion.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_audit_opinion.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_audit_opinion.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_audit_opinion.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_balance_sheet_q",
    toolName: "list_stock_balance_sheet_q",
    description: "List stock balance sheet quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_balance_sheet_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_balance_sheet_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_balance_sheet_q.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_balance_sheet_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_balance_sheet_q.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_balance_sht_ttm",
    toolName: "list_stk_balance_sht_ttm",
    description: "List stock balance sht ttm data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stk_balance_sht_ttm operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stk_balance_sht_ttm.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stk_balance_sht_ttm.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stk_balance_sht_ttm.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_balance_sht_ttm.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_block_trades",
    toolName: "list_stock_block_trades",
    description: "List stock block trades data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_block_trades operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_block_trades.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_block_trades.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_block_trades.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_block_trades.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_cash_flows_q",
    toolName: "list_stock_cash_flows_q",
    description: "List stock cash flows quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_cash_flows_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_cash_flows_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_cash_flows_q.", {
            minLength: 1,
          }),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_cash_flows_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_cash_flows_q.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_cash_flows_ttm",
    toolName: "list_stock_cash_flows_ttm",
    description: "List stock cash flows ttm data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_cash_flows_ttm operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_cash_flows_ttm.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_cash_flows_ttm.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_cash_flows_ttm.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_cash_flows_ttm.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_concept_classifications",
    toolName: "list_stock_concept_classifications",
    description: "List stock concept classifications data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_concept_classifications operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_concept_classifications.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_concept_classifications.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_concept_classifications.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_concept_classifications.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_stock_concept_classifications."),
          ["000001"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_daily_fund_flows",
    toolName: "list_stock_daily_fund_flows",
    description: "List stock daily fund flows data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_daily_fund_flows operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_daily_fund_flows.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_daily_fund_flows.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_daily_fund_flows.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_daily_fund_flows.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_dragon_tiger_broke_details",
    toolName: "list_stk_dragon_tiger_broke_details",
    description: "List stock dragon tiger broke details data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stk_dragon_tiger_broke_details operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stk_dragon_tiger_broke_details.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stk_dragon_tiger_broke_details.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stk_dragon_tiger_broke_details.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_dragon_tiger_broke_details.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_dragon_tiger_details",
    toolName: "list_stock_dragon_tiger_details",
    description: "List stock dragon tiger details data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_dragon_tiger_details operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_dragon_tiger_details.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_dragon_tiger_details.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_dragon_tiger_details.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_dragon_tiger_details.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_dupont_analysis",
    toolName: "list_stk_dupont_analysis",
    description: "List stock dupont analysis data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stk_dupont_analysis operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stk_dupont_analysis.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stk_dupont_analysis.", {
            minLength: 1,
          }),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stk_dupont_analysis.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_dupont_analysis.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_fin_derivative_inds",
    toolName: "list_stock_fin_derivative_inds",
    description: "List stock financial derivative indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_fin_derivative_inds operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_derivative_inds.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_derivative_inds.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_fin_derivative_inds.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_fin_derivative_inds.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_fin_derivative_inds_q",
    toolName: "list_stock_fin_derivative_inds_q",
    description: "List stock financial derivative indicators quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_fin_derivative_inds_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_derivative_inds_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_derivative_inds_q.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_fin_derivative_inds_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_fin_derivative_inds_q.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_fin_derivative_inds_ttm",
    toolName: "list_stock_fin_derivative_inds_ttm",
    description: "List stock financial derivative indicators ttm data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_fin_derivative_inds_ttm operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_derivative_inds_ttm.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_derivative_inds_ttm.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_fin_derivative_inds_ttm.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_fin_derivative_inds_ttm.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_fin_ind_sw_rnk_q",
    toolName: "list_stk_fin_ind_sw_rnk_q",
    description: "List stock financial indicator sw rnk quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stk_fin_ind_sw_rnk_q operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stk_fin_ind_sw_rnk_q.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stk_fin_ind_sw_rnk_q.", {
            minLength: 1,
          }),
          ["2025-03-30"],
        ),
        stockCodes: s.withExamples(
          s.array(
            "Stock codes Accepted by Investoday for list_stk_fin_ind_sw_rnk_q.",
            s.string("One stockCode value."),
            { minItems: 1 },
          ),
          [["000001", "600519"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stk_fin_ind_sw_rnk_q.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_fin_ind_sw_rnk_q.", { minimum: 1 }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_stk_fin_ind_sw_rnk_q."),
          ["002594"],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_stk_fin_ind_sw_rnk_q."),
          ["640000"],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_cash_coll_q",
    toolName: "list_fin_ind_cash_coll_q",
    description: "List financial indicator cash coll quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_cash_coll_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_cash_coll_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_cash_coll_q.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_cash_coll_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_cash_coll_q.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_operating_q",
    toolName: "list_fin_ind_operating_q",
    description: "List financial indicator operating quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_operating_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_operating_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_operating_q.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_operating_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_operating_q.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_profit_q",
    toolName: "list_fin_ind_profit_q",
    description: "List financial indicator profit quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_profit_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_profit_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_profit_q.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_profit_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_profit_q.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_profit_ttm",
    toolName: "list_fin_ind_profit_ttm",
    description: "List financial indicator profit ttm data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_profit_ttm operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_profit_ttm.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_profit_ttm.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_profit_ttm.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_profit_ttm.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_solvency_q",
    toolName: "list_fin_ind_solvency_q",
    description: "List financial indicator solvency quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_solvency_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_solvency_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_solvency_q.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_solvency_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_solvency_q.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_solvency_ttm",
    toolName: "list_fin_ind_solvency_ttm",
    description: "List financial indicator solvency ttm data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_solvency_ttm operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_solvency_ttm.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_solvency_ttm.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_solvency_ttm.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_solvency_ttm.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_finance_strength",
    toolName: "get_stock_finance_strength",
    description: "Get stock finance strength data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_finance_strength operation.",
      {
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_finance_strength."),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_fin_health_history",
    toolName: "get_fin_health_history",
    description: "Get financial health history data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_fin_health_history operation.",
      {
        type: s.stringEnum("Investoday query type Accepted by Investoday for get_fin_health_history.", ["1", "2"]),
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_fin_health_history."),
      },
      { required: ["stockCode", "type"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_finance_growth_ability",
    toolName: "get_stock_finance_growth_ability",
    description: "Get stock finance growth ability data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_finance_growth_ability operation.",
      {
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_finance_growth_ability."),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_finance_growth_ability_hist",
    toolName: "get_stock_finance_growth_ability_hist",
    description: "Get stock finance growth ability historical data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_finance_growth_ability_hist operation.",
      {
        type: s.stringEnum("Investoday query type Accepted by Investoday for get_stock_finance_growth_ability_hist.", [
          "1",
          "2",
        ]),
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_finance_growth_ability_hist."),
      },
      { required: ["stockCode", "type"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_finance_industry_compare",
    toolName: "get_stock_finance_industry_compare",
    description: "Get stock finance industry compare data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_finance_industry_compare operation.",
      {
        type: s.stringEnum("Investoday query type Accepted by Investoday for get_stock_finance_industry_compare.", [
          "indu1",
          "indu2",
          "indu3",
        ]),
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_finance_industry_compare."),
        key: s.stringEnum("Search keyword Accepted by Investoday for get_stock_finance_industry_compare.", [
          "f2030",
          "f2040",
          "f2050",
          "f2060",
          "f2070",
          "f2080",
          "f2090",
          "f2100",
          "f2190",
          "f2200",
          "f2210",
          "f2220",
          "f2230",
          "f2240",
          "f2180Ext",
          "f2250",
          "f2260",
          "f2270",
          "f2280",
          "f2290",
          "f2300Ext2",
          "f2310",
          "f2320",
          "f2330",
          "f2340",
          "f2350",
          "f2370",
          "f2380",
          "f2390",
          "f2440Ext2",
          "f2450Ext2",
          "f2460Ext2",
          "f2470",
          "f2480",
        ]),
      },
      { required: ["stockCode", "type", "key"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_finance_profit_ability",
    toolName: "get_stock_finance_profit_ability",
    description: "Get stock finance profit ability data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_finance_profit_ability operation.",
      {
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_finance_profit_ability."),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_finance_profit_ability_hist",
    toolName: "get_stock_finance_profit_ability_hist",
    description: "Get stock finance profit ability historical data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_finance_profit_ability_hist operation.",
      {
        type: s.stringEnum("Investoday query type Accepted by Investoday for get_stock_finance_profit_ability_hist.", [
          "1",
          "2",
        ]),
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_finance_profit_ability_hist."),
      },
      { required: ["stockCode", "type"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_finance_valuation",
    toolName: "get_stock_finance_valuation",
    description: "Get stock finance valuation data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_finance_valuation operation.",
      {
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_finance_valuation."),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_finance_valuation_hist",
    toolName: "get_stock_finance_valuation_hist",
    description: "Get stock finance valuation historical data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_finance_valuation_hist operation.",
      {
        type: s.stringEnum("Investoday query type Accepted by Investoday for get_stock_finance_valuation_hist.", [
          "1",
          "2",
        ]),
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_finance_valuation_hist."),
      },
      { required: ["stockCode", "type"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_cash_collect",
    toolName: "list_fin_ind_cash_collect",
    description: "List financial indicator cash collect data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_cash_collect operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_cash_collect.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_cash_collect.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_cash_collect.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_cash_collect.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_fin_ind_grow_q",
    toolName: "list_stock_fin_ind_grow_q",
    description: "List stock financial indicator grow quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_fin_ind_grow_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_ind_grow_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_ind_grow_q.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_fin_ind_grow_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_fin_ind_grow_q.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_fin_ind_growth",
    toolName: "list_stock_fin_ind_growth",
    description: "List stock financial indicator growth data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_fin_ind_growth operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_ind_growth.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_fin_ind_growth.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_fin_ind_growth.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_fin_ind_growth.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_operating",
    toolName: "list_fin_ind_operating",
    description: "List financial indicator operating data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_operating operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_operating.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_operating.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_operating.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_operating.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_profit",
    toolName: "list_fin_ind_profit",
    description: "List financial indicator profit data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_profit operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_profit.", { minLength: 1 }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_profit.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_profit.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_profit.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fin_ind_solvency",
    toolName: "list_fin_ind_solvency",
    description: "List financial indicator solvency data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fin_ind_solvency operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_solvency.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fin_ind_solvency.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fin_ind_solvency.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fin_ind_solvency.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_financial_strength_ext_hist",
    toolName: "get_stock_financial_strength_ext_hist",
    description: "Get stock financial strength ext historical data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_financial_strength_ext_hist operation.",
      {
        stockCode: s.nonEmptyString("Stock code Accepted by Investoday for get_stock_financial_strength_ext_hist."),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_fin_subitem_score",
    toolName: "get_stock_fin_subitem_score",
    description: "Get stock financial subitem score data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_fin_subitem_score operation.",
      {
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for get_stock_fin_subitem_score."),
          ["600519"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_growth_op_revs",
    toolName: "list_stock_growth_op_revs",
    description: "List stock growth op revs data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_growth_op_revs operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_growth_op_revs.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_growth_op_revs.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_income_statement_q",
    toolName: "list_stock_income_statement_q",
    description: "List stock income statement quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_income_statement_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_income_statement_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_income_statement_q.", {
              minLength: 1,
            }),
            ["2025-03-30"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_income_statement_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_income_statement_q.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_income_statement_ttm",
    toolName: "list_stock_income_statement_ttm",
    description: "List stock income statement ttm data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_income_statement_ttm operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_income_statement_ttm.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_income_statement_ttm.", {
              minLength: 1,
            }),
            ["2025-03-30"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_income_statement_ttm.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_income_statement_ttm.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_limit_up_down",
    toolName: "list_stock_limit_up_down",
    description: "List stock limit up down data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_limit_up_down operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_limit_up_down.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_limit_up_down.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_limit_up_down.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_limit_up_down.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_major_sup_cust",
    toolName: "list_stock_major_sup_cust",
    description: "List stock major sup cust data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_major_sup_cust operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_major_sup_cust.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_major_sup_cust.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_major_sup_cust.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_major_sup_cust.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_margin_requirement",
    toolName: "get_stock_margin_requirement",
    description: "Get stock margin requirement data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stock_margin_requirement operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for get_stock_margin_requirement.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for get_stock_margin_requirement.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stock_margin_requirement.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stock_margin_requirement.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_margin_trade",
    toolName: "list_stock_margin_trade",
    description: "List stock margin trade data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_margin_trade operation.",
        {
          beginDate: s.withExamples(
            s.nonEmptyString("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_margin_trade."),
            ["2025-01-01"],
          ),
          endDate: s.withExamples(
            s.nonEmptyString("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_margin_trade."),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_margin_trade.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_margin_trade.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_margin_trade_totals",
    toolName: "list_stock_margin_trade_totals",
    description: "List stock margin trade totals data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_margin_trade_totals operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_margin_trade_totals.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_margin_trade_totals.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_margin_trade_totals.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_margin_trade_totals.", {
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
    name: "list_stock_oscillator_indicators",
    toolName: "list_stock_oscillator_indicators",
    description: "List stock oscillator indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_oscillator_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_oscillator_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_oscillator_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_oscillator_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_oscillator_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_per_share_indicators",
    toolName: "list_per_share_indicators",
    description: "List per share indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_per_share_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_per_share_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_per_share_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_per_share_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_per_share_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_per_share_indicators_q",
    toolName: "list_per_share_indicators_q",
    description: "List per share indicators quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_per_share_indicators_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_per_share_indicators_q.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_per_share_indicators_q.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_per_share_indicators_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_per_share_indicators_q.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_performance_metrics",
    toolName: "list_stock_performance_metrics",
    description: "List stock performance metrics data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_performance_metrics operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_performance_metrics.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_performance_metrics.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_performance_metrics.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_performance_metrics.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_price_volume_indicators",
    toolName: "list_stock_price_volume_indicators",
    description: "List stock price volume indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_price_volume_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_price_volume_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_price_volume_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_price_volume_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_price_volume_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_soctk_strength_trend_indicators",
    toolName: "list_soctk_strength_trend_indicators",
    description: "List soctk strength trend indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_soctk_strength_trend_indicators operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_soctk_strength_trend_indicators.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_soctk_strength_trend_indicators.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_soctk_strength_trend_indicators.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_soctk_strength_trend_indicators.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_soctk_strength_trend_indicators."),
          ["002594"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_strength_trend_indicators",
    toolName: "list_stock_strength_trend_indicators",
    description: "List stock strength trend indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_strength_trend_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_strength_trend_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_strength_trend_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_strength_trend_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_strength_trend_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stk_sw_idu_returns",
    toolName: "get_stk_sw_idu_returns",
    description: "Get stock sw industry returns data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stk_sw_idu_returns operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stk_sw_idu_returns.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stk_sw_idu_returns.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_turnover_rates",
    toolName: "list_stock_turnover_rates",
    description: "List stock turnover rates data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_turnover_rates operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_turnover_rates.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_turnover_rates.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_turnover_rates.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_turnover_rates.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_up_down_list",
    toolName: "list_stock_up_down_list",
    description: "List stock up down list data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_up_down_list operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_up_down_list.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_up_down_list.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        limitFlag: s.withExamples(
          s.withEnum(
            s.integer("Limit-up or limit-down filter Accepted by Investoday for list_stock_up_down_list."),
            [1, -1, 0],
          ),
          [1],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_up_down_list.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_up_down_list.", { minimum: 1 }),
          [1],
        ),
      },
      { required: ["limitFlag"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_val_indicators",
    toolName: "get_stock_val_indicators",
    description: "Get stock valuation indicators including market capitalization, PE, PB and PS over a date range.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for get_stock_val_indicators.",
        {
          stockCode: s.nonEmptyString("One stock code. Supply exactly one of stockCode or stockCodes."),
          stockCodes: s.array(
            "Stock codes for a batch query. Supply exactly one of stockCode or stockCodes.",
            s.nonEmptyString("A stock code."),
            { minItems: 1 },
          ),
          beginDate: s.date("Start date in YYYY-MM-DD format; earliest supported date is 2020-01-01."),
          endDate: s.date("End date in YYYY-MM-DD format."),
          pageNum: s.integer("Page number, starting at 1.", { minimum: 1 }),
          pageSize: s.integer("Records per page, from 1 to 500.", { minimum: 1, maximum: 500 }),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_vol_indicators",
    toolName: "list_stock_vol_indicators",
    description: "List stock vol indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_vol_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_vol_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_vol_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_vol_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_vol_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_realtime_fund_flow",
    toolName: "get_stock_realtime_fund_flow",
    description: "Get stock realtime fund flow data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_realtime_fund_flow operation.",
      {
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for get_stock_realtime_fund_flow."),
          ["002594"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_quote_realtime",
    toolName: "get_stock_quote_realtime",
    description: "Get the latest realtime quote for one Shanghai, Shenzhen or Beijing stock.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for get_stock_quote_realtime.",
      {
        stockCode: s.nonEmptyString("Stock code, for example 002594."),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_quote_rt_ext",
    toolName: "get_stock_quote_rt_ext",
    description: "Get stock quote realtime ext data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_quote_rt_ext operation.",
      {
        sortColumn: s.withExamples(
          s.stringEnum("Column used to sort the result Accepted by Investoday for get_stock_quote_rt_ext.", [
            "changeRatio",
            "limitUpTime",
            "limitDownTime",
          ]),
          ["changeRatio"],
        ),
        stockCodes: s.withExamples(
          s.array("Stock codes Accepted by Investoday for get_stock_quote_rt_ext.", s.string("One stockCode value.")),
          [["000001"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for get_stock_quote_rt_ext."),
          [10],
        ),
        page: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for get_stock_quote_rt_ext."),
          [1],
        ),
        order: s.withExamples(s.nonEmptyString("Sort order Accepted by Investoday for get_stock_quote_rt_ext."), [
          "asc",
        ]),
      },
      { required: ["sortColumn"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_realtime_quote_merge",
    toolName: "get_stock_realtime_quote_merge",
    description: "Get stock realtime quote merge data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_realtime_quote_merge operation.",
      {
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for get_stock_realtime_quote_merge."),
          ["600839"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_arbitration_cases",
    toolName: "list_stock_arbitration_cases",
    description: "List stock arbitration cases data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_arbitration_cases operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_arbitration_cases.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_arbitration_cases.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_arbitration_cases.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_arbitration_cases.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_consultations",
    toolName: "list_stk_consultations",
    description: "List stock consultations data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stk_consultations operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stk_consultations.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stk_consultations.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stk_consultations.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_consultations.", { minimum: 1 }),
          [1],
        ),
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for list_stk_consultations."), [
          "002594",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_inst_research",
    toolName: "list_stock_inst_research",
    description: "List stock inst research data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_inst_research operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_inst_research.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_inst_research.", {
            minLength: 1,
          }),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_inst_research.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_inst_research.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_op_reviews",
    toolName: "list_stock_op_reviews",
    description: "List stock op reviews data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_op_reviews operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_op_reviews.", { minLength: 1 }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_op_reviews.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_op_reviews.", {
            minimum: 1,
            maximum: 5,
          }),
          [5],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_op_reviews.", { minimum: 1 }),
          [1],
        ),
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for list_stock_op_reviews."), [
          "002594",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_violation_penalt",
    toolName: "list_stock_violation_penalt",
    description: "List stock violation penalt data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_violation_penalt operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_violation_penalt.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_violation_penalt.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_violation_penalt.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_violation_penalt.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_business_themes",
    toolName: "get_stock_business_themes",
    description: "Get stock business themes data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stock_business_themes operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stock_business_themes.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stock_business_themes.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_dcf_result",
    toolName: "list_stock_dcf_result",
    description: "List stock dcf result data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_dcf_result operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_dcf_result.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_dcf_result.", {
            minLength: 1,
          }),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_dcf_result.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_dcf_result.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_esg_rating",
    toolName: "list_stock_esg_rating",
    description: "List stock esg rating data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_esg_rating operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_esg_rating.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_esg_rating.", { minLength: 1 }),
            ["2020-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_esg_rating.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          dataSource: s.withExamples(
            s.withEnum(s.integer("Data source Accepted by Investoday for list_stock_esg_rating."), [1, 2]),
            [1],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_esg_rating.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: ["dataSource"] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_fund_flow_s",
    toolName: "list_stock_fund_flow_s",
    description: "List stock fund flow s data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_fund_flow_s operation.",
      {
        date: s.withExamples(
          s.date("Query date in YYYY-MM-DD format Accepted by Investoday for list_stock_fund_flow_s.", {
            minLength: 1,
          }),
          ["2026-07-10"],
        ),
        minAmount: s.withExamples(
          s.number("Minimum amount filter Accepted by Investoday for list_stock_fund_flow_s.", {
            minimum: 0,
          }),
          [1000],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_fund_flow_s.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        maxAmount: s.withExamples(
          s.number("Maximum amount filter Accepted by Investoday for list_stock_fund_flow_s.", {
            minimum: 0,
          }),
          [20000],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_fund_flow_s.", { minimum: 1 }),
          [1],
        ),
        matchMode: s.withExamples(
          s.withEnum(
            s.integer("Result matching mode Accepted by Investoday for list_stock_fund_flow_s.", {
              minimum: 1,
              maximum: 2,
            }),
            [1, 2],
          ),
          [1],
        ),
        signalCodes: s.withExamples(
          s.array(
            "Technical signal codes Accepted by Investoday for list_stock_fund_flow_s.",
            s.withEnum(
              s.integer("One signalCode value."),
              [101, 102, 201, 202, 203, 204, 205, 206, 301, 302, 303, 304, 401, 402, 403, 404],
            ),
            { minItems: 1 },
          ),
          [[101, 203, 401]],
        ),
      },
      { required: ["date", "signalCodes"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stk_fundamentals",
    toolName: "get_stk_fundamentals",
    description: "Get stock fundamentals data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stk_fundamentals operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stk_fundamentals.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stk_fundamentals.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stk_investment_risks",
    toolName: "get_stk_investment_risks",
    description: "Get stock investment risks data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stk_investment_risks operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stk_investment_risks.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stk_investment_risks.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_market_ind_dm",
    toolName: "list_stock_market_ind_dm",
    description: "List stock market indicator data mining data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stock_market_ind_dm operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_market_ind_dm.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_market_ind_dm.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stock_market_ind_dm.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_market_ind_dm.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_price_pattern",
    toolName: "list_stock_price_pattern",
    description: "List stock price pattern data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_price_pattern operation.",
      {
        date: s.withExamples(
          s.date("Query date in YYYY-MM-DD format Accepted by Investoday for list_stock_price_pattern.", {
            minLength: 1,
          }),
          ["2026-07-10"],
        ),
        cycleType: s.withExamples(
          s.withEnum(s.integer("Analysis cycle type Accepted by Investoday for list_stock_price_pattern."), [1, 2, 3]),
          [2],
        ),
        statusCodes: s.withExamples(
          s.array(
            "Status codes Accepted by Investoday for list_stock_price_pattern.",
            s.withEnum(s.integer("One statusCode value."), [1, 2, 3]),
            { minItems: 1 },
          ),
          [[1, 2]],
        ),
        patternCodes: s.withExamples(
          s.array(
            "Price-pattern codes Accepted by Investoday for list_stock_price_pattern.",
            s.withEnum(s.integer("One patternCode value."), [1, 2, 3, 4, 5, 6, 7]),
            { minItems: 1 },
          ),
          [[1, 5, 7]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_price_pattern.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_price_pattern.", { minimum: 1 }),
          [1],
        ),
      },
      { required: ["date", "cycleType", "patternCodes", "statusCodes"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_prospects",
    toolName: "get_stock_prospects",
    description: "Get stock prospects data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stock_prospects operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stock_prospects.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stock_prospects.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stock_score",
    toolName: "get_stock_score",
    description: "Get stock score data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_stock_score operation.",
      {
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for get_stock_score."), [
          "000001",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_tech_signals",
    toolName: "list_stk_tech_signals",
    description: "List stock tech signals data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stk_tech_signals operation.",
      {
        date: s.withExamples(
          s.nonEmptyString("Query date in YYYY-MM-DD format Accepted by Investoday for list_stk_tech_signals."),
          ["2026-07-13"],
        ),
        signalMatchMode: s.withExamples(
          s.withEnum(
            s.integer("Technical signal matching mode Accepted by Investoday for list_stk_tech_signals.", {
              minimum: 1,
              maximum: 2,
            }),
            [1, 2],
          ),
          [1],
        ),
        stockCodes: s.withExamples(
          s.array("Stock codes Accepted by Investoday for list_stk_tech_signals.", s.string("One stockCode value.")),
          [["000001", "600519"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stk_tech_signals.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_tech_signals.", { minimum: 1 }),
          [1],
        ),
        signalCodes: s.withExamples(
          s.array(
            "Technical signal codes Accepted by Investoday for list_stk_tech_signals.",
            s.withEnum(
              s.integer("One signalCode value."),
              [
                101, 102, 103, 104, 105, 106, 107, 108, 201, 202, 203, 204, 205, 206, 301, 302, 303, 401, 402, 403, 404,
                405, 406, 407, 408, 501, 502, 503, 504, 505, 506, 507, 601, 602, 603, 604, 605, 606, 607, 701, 702, 703,
                704, 705, 706, 801, 802, 803, 804, 805, 806, 807, 808, 901, 902, 1001, 1002, 1003, 1004, 1005, 1006,
                1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023,
                1024, 1025, 1026, 1027, 1028, 1029, 1030,
              ],
            ),
            { minItems: 1 },
          ),
          [[606, 801, 807, 1018]],
        ),
      },
      { required: ["date", "signalCodes"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_trend_structure",
    toolName: "list_stk_trend_structure",
    description: "List stock trend structure data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stk_trend_structure operation.",
      {
        date: s.withExamples(
          s.date("Query date in YYYY-MM-DD format Accepted by Investoday for list_stk_trend_structure.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        cycleType: s.withExamples(
          s.withEnum(s.integer("Analysis cycle type Accepted by Investoday for list_stk_trend_structure."), [1, 2, 3]),
          [1],
        ),
        minTrendScore: s.withExamples(
          s.nonEmptyString("Minimum trend score Accepted by Investoday for list_stk_trend_structure."),
          ["60"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stk_trend_structure.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_trend_structure.", { minimum: 1 }),
          [1],
        ),
        matchMode: s.withExamples(
          s.stringEnum("Result matching mode Accepted by Investoday for list_stk_trend_structure.", ["1", "2"]),
          ["2"],
        ),
        signalCodes: s.withExamples(
          s.array(
            "Technical signal codes Accepted by Investoday for list_stk_trend_structure.",
            s.withEnum(s.integer("One signalCode value."), [1, 2, 3, 4, 5, 6]),
            { minItems: 1 },
          ),
          [[1, 2, 3]],
        ),
      },
      { required: ["date", "cycleType", "signalCodes"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_val_factors",
    toolName: "list_stock_val_factors",
    description: "List stock valuation factors data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_val_factors operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stock_val_factors.", {
            minLength: 1,
          }),
          ["2026-07-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stock_val_factors.", { minLength: 1 }),
          ["2026-07-31"],
        ),
        stockCodes: s.withExamples(
          s.array("Stock codes Accepted by Investoday for list_stock_val_factors.", s.string("One stockCode value.")),
          [["000001", "600519"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_val_factors.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_val_factors.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stock_volume_price",
    toolName: "list_stock_volume_price",
    description: "List stock volume price data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_stock_volume_price operation.",
      {
        date: s.withExamples(
          s.date("Query date in YYYY-MM-DD format Accepted by Investoday for list_stock_volume_price.", {
            minLength: 1,
          }),
          ["2026-07-10"],
        ),
        cycleType: s.withExamples(
          s.withEnum(
            s.integer("Analysis cycle type Accepted by Investoday for list_stock_volume_price.", {
              minimum: 1,
              maximum: 3,
            }),
            [1, 2, 3],
          ),
          [2],
        ),
        priceFeedbacks: s.withExamples(
          s.array(
            "Price feedback values Accepted by Investoday for list_stock_volume_price.",
            s.stringEnum("One priceFeedback value.", [
              "strong_positive",
              "positive",
              "flat",
              "negative",
              "strong_negative",
            ]),
          ),
          [["positive", "strong_positive"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_stock_volume_price.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        minVolumePriceScore: s.withExamples(
          s.number("Minimum volume-price score Accepted by Investoday for list_stock_volume_price.", {
            minimum: 0,
            maximum: 100,
          }),
          [60],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_stock_volume_price.", { minimum: 1 }),
          [1],
        ),
        matchMode: s.withExamples(
          s.withEnum(
            s.integer("Result matching mode Accepted by Investoday for list_stock_volume_price.", {
              minimum: 1,
              maximum: 2,
            }),
            [1, 2],
          ),
          [1],
        ),
        signalCodes: s.withExamples(
          s.array(
            "Technical signal codes Accepted by Investoday for list_stock_volume_price.",
            s.withEnum(s.integer("One signalCode value."), [1, 2, 3, 4, 5]),
          ),
          [[1, 2, 5]],
        ),
      },
      { required: ["date", "cycleType"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
