import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const fundsOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "get_fund_manager_basic_info",
    toolName: "get_fund_manager_basic_info",
    description: "Get fund manager basic info data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_fund_manager_basic_info operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          isIncumbent: s.withExamples(
            s.withEnum(
              s.integer(
                "Whether the fund manager is currently serving Accepted by Investoday for get_fund_manager_basic_info.",
              ),
              [1, 0],
            ),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_adj_navs",
    toolName: "list_fund_adj_navs",
    description: "List fund adjusted navs data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_adj_navs operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_adj_navs.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_adj_navs.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_adj_navs.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_adj_navs.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_adj_quotes",
    toolName: "list_fund_adj_quotes",
    description: "List fund adjusted quotes data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_adj_quotes operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_adj_quotes.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_adj_quotes.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_adj_quotes.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_adj_quotes.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_all",
    toolName: "list_fund_all",
    description: "List fund all data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_fund_all operation.",
      {
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_fund_all.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_all.", {
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
    name: "get_fund_award_records",
    toolName: "get_fund_award_records",
    description: "Get fund award records data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_fund_award_records operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_fund_basic_info",
    toolName: "get_fund_basic_info",
    description: "Get fund basic info data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_fund_basic_info operation.",
      {
        fundCodes: s.withExamples(
          s.array("Fund codes Accepted by Investoday for get_fund_basic_info.", s.string("One fundCode value.")),
          [["000001", "000006"]],
        ),
        fundCode: s.withExamples(s.nonEmptyString("Fund code Accepted by Investoday for get_fund_basic_info."), [
          "000001",
        ]),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for get_fund_basic_info.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for get_fund_basic_info.", {
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
    name: "get_fund_categories",
    toolName: "get_fund_categories",
    description: "Get fund categories data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_fund_categories operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_fund_code_assoc",
    toolName: "get_fund_code_assoc",
    description: "Get fund code assoc data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_fund_code_assoc operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_currency_yield_history",
    toolName: "list_currency_yield_history",
    description: "List currency yield history data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_currency_yield_history operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_currency_yield_history.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_currency_yield_history.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_currency_yield_history.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_currency_yield_history.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_daily_quotes",
    toolName: "list_fund_daily_quotes",
    description: "List fund daily quotes data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_daily_quotes operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_daily_quotes.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_daily_quotes.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_daily_quotes.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_daily_quotes.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_dividend_distributions",
    toolName: "list_fund_dividend_distributions",
    description: "List fund dividend distributions data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_dividend_distributions operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_dividend_distributions.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_dividend_distributions.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_dividend_distributions.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_dividend_distributions.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_etf_constituent_stks",
    toolName: "list_etf_constituent_stks",
    description: "List etf constituent stks data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_etf_constituent_stks operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_etf_constituent_stks.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_etf_constituent_stks.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_etf_constituent_stks.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_etf_constituent_stks.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_etf_sub_red_lists",
    toolName: "list_etf_sub_red_lists",
    description: "List etf sub red lists data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_etf_sub_red_lists operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_etf_sub_red_lists.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_etf_sub_red_lists.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_etf_sub_red_lists.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_etf_sub_red_lists.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_fee_structures",
    toolName: "list_fund_fee_structures",
    description: "List fund fee structures data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_fee_structures operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_fee_structures.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_fee_structures.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_fee_structures.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_fee_structures.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_fin_inds",
    toolName: "list_fund_fin_inds",
    description: "List fund financial indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_fin_inds operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_fin_inds.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_fin_inds.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_fin_inds.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_fin_inds.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_fin_inds_q",
    toolName: "list_fund_fin_inds_q",
    description: "List fund financial indicators quarterly data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_fin_inds_q operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_fin_inds_q.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_fin_inds_q.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_fin_inds_q.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_fin_inds_q.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_hold_industry",
    toolName: "list_fund_hold_industry",
    description: "List fund hold industry data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_hold_industry operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000006",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_hold_industry.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_hold_industry.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_hold_structures",
    toolName: "list_fund_hold_structures",
    description: "List fund hold structures data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_hold_structures operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_hold_structures.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_hold_structures.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_hold_structures.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_hold_structures.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_hold_fund",
    toolName: "list_industry_hold_fund",
    description: "List industry hold fund data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_industry_hold_fund operation.",
        {
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_industry_hold_fund.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          industryCodes: s.withExamples(
            s.array(
              "Industry codes Supply exactly one of industryCodes or industryCode.",
              s.string("One industryCode value."),
              { minItems: 1 },
            ),
            [["370000", "74000"]],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_hold_fund.", { minimum: 1 }),
            [1],
          ),
          industryCode: s.withExamples(
            s.nonEmptyString("Industry code Supply exactly one of industryCode or industryCodes."),
            ["370000"],
          ),
        },
        { required: [] },
      ),
      ["industryCode", "industryCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_invest_targets",
    toolName: "list_fund_invest_targets",
    description: "List fund invest targets data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_invest_targets operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_invest_targets.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_invest_targets.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_invest_targets.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_invest_targets.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_fund_listings_record",
    toolName: "get_fund_listings_record",
    description: "Get fund listings record data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_fund_listings_record operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_nav_history",
    toolName: "list_fund_nav_history",
    description: "List fund nav history data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_nav_history operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_nav_history.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_nav_history.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_nav_history.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_nav_history.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_perf_benchmark_quote",
    toolName: "list_perf_benchmark_quote",
    description: "List performance benchmark quote data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_perf_benchmark_quote operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_perf_benchmark_quote.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          benchmarkIndexCodes: s.withExamples(
            s.array(
              "Benchmark index codes Supply exactly one of benchmarkIndexCodes or benchmarkIndexCode.",
              s.string("One benchmarkIndexCode value."),
              { minItems: 1 },
            ),
            [["000001", "000006"]],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_perf_benchmark_quote.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          benchmarkIndexCode: s.withExamples(
            s.nonEmptyString("Benchmark index code Supply exactly one of benchmarkIndexCode or benchmarkIndexCodes."),
            ["000001"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_perf_benchmark_quote.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_perf_benchmark_quote.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["benchmarkIndexCode", "benchmarkIndexCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_perf_benchmarks",
    toolName: "list_fund_perf_benchmarks",
    description: "List fund performance benchmarks data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_perf_benchmarks operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_perf_benchmarks.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_perf_benchmarks.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_perf_benchmarks.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_perf_benchmarks.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_portfolio_asset_holdings",
    toolName: "list_fund_portfolio_asset_holdings",
    description: "List fund portfolio asset holdings data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_portfolio_asset_holdings operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000006",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_portfolio_bond_holdings",
    toolName: "list_fund_portfolio_bond_holdings",
    description: "List fund portfolio bond holdings data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_portfolio_bond_holdings operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000006",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_portfolio_fund_holdings",
    toolName: "list_portfolio_fund_holdings",
    description: "List portfolio fund holdings data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_portfolio_fund_holdings operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000006",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_portfolio_stock_holdings",
    toolName: "list_fund_portfolio_stock_holdings",
    description: "List fund portfolio stock holdings data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_portfolio_stock_holdings operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000006",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_return_rate",
    toolName: "list_fund_return_rate",
    description: "List fund return rate data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_return_rate operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_shares",
    toolName: "list_fund_shares",
    description: "List fund shares data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_shares operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_shares.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_shares.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_shares.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_shares.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_subscription_redemption_status",
    toolName: "list_subscription_redemption_status",
    description: "List subscription redemption status data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_subscription_redemption_status operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_subscription_redemption_status.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_subscription_redemption_status.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_subscription_redemption_status.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_subscription_redemption_status.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_share_splits",
    toolName: "list_fund_share_splits",
    description: "List fund share splits data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_share_splits operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_share_splits.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_share_splits.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_share_splits.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_share_splits.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_fund_company_evals",
    toolName: "get_fund_company_evals",
    description: "Get fund company evals data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_fund_company_evals operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000006",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_mgr_hist_per",
    toolName: "list_fund_mgr_hist_per",
    description: "List fund manager historical per data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_fund_mgr_hist_per operation.",
      {
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_fund_mgr_hist_per.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        fundManagerName: s.withExamples(
          s.nonEmptyString("Fund manager name Accepted by Investoday for list_fund_mgr_hist_per."),
          ["张三"],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_mgr_hist_per.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_mgr_returns",
    toolName: "list_fund_mgr_returns",
    description: "List fund manager returns data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_fund_mgr_returns operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_mgr_returns.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_mgr_returns.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_fund_mgr_returns.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        fundManagerName: s.withExamples(
          s.nonEmptyString("Fund manager name Accepted by Investoday for list_fund_mgr_returns."),
          ["张三"],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_mgr_returns.", { minimum: 1 }),
          [1],
        ),
      },
      { required: ["fundManagerName"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_mgr_perf",
    toolName: "list_fund_mgr_perf",
    description: "List fund manager performance data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_mgr_perf operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          managerName: s.withExamples(s.nonEmptyString("Manager name Accepted by Investoday for list_fund_mgr_perf."), [
            "张三",
          ]),
          employmentStatus: s.withExamples(
            s.withEnum(s.integer("Employment status Accepted by Investoday for list_fund_mgr_perf."), [1, 0]),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_concept_hold_fund",
    toolName: "list_concept_hold_fund",
    description: "List concept hold fund data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_concept_hold_fund operation.",
      {
        conceptCodes: s.withExamples(
          s.array(
            "Concept codes Accepted by Investoday for list_concept_hold_fund.",
            s.string("One conceptCode value."),
          ),
          [["CLS80457", "CLS82591"]],
        ),
        conceptCode: s.withExamples(
          s.nonEmptyString("Concept code Accepted by Investoday for list_concept_hold_fund."),
          ["CLS82591"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_concept_hold_fund.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_concept_hold_fund.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_concept_hold_fund_batch",
    toolName: "list_concept_hold_fund_batch",
    description: "List concept hold fund batch data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_concept_hold_fund_batch operation.",
      {
        isETF: s.withExamples(
          s.boolean(
            "Whether to limit results to exchange-traded funds Accepted by Investoday for list_concept_hold_fund_batch.",
          ),
          [true],
        ),
        conceptCodes: s.array(
          "Concept codes Accepted by Investoday for list_concept_hold_fund_batch.",
          s.string("One conceptCode value."),
          { minItems: 1 },
        ),
        matchType: s.withExamples(
          s.withEnum(
            s.integer("Result matching type Accepted by Investoday for list_concept_hold_fund_batch."),
            [1, 2, 3],
          ),
          [1],
        ),
        threshold: s.withExamples(
          s.integer("Threshold value Accepted by Investoday for list_concept_hold_fund_batch."),
          [40],
        ),
      },
      { required: ["conceptCodes", "matchType", "threshold"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_current_manager_returns",
    toolName: "list_fund_current_manager_returns",
    description: "List fund current manager returns data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_current_manager_returns operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000300",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_fund_peer_avg_metric",
    toolName: "get_fund_peer_avg_metric",
    description: "Get fund peer average metric data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_fund_peer_avg_metric operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000300",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_flow",
    toolName: "list_fund_flow",
    description: "List fund flow data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_flow operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_flow.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["510300", "159915"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "510300",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_flow.", {
              minLength: 1,
            }),
            ["2025-12-31"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_flow.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_flow.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_holdings_perf",
    toolName: "list_fund_holdings_perf",
    description: "List fund holdings performance data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_holdings_perf operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_idx_ret_corr",
    toolName: "list_fund_idx_ret_corr",
    description: "List fund index ret corr data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_idx_ret_corr operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_idx_ret_corr.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_idx_ret_corr.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_idx_ret_corr.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_idx_ret_corr.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_hold_fund_batch",
    toolName: "list_industry_hold_fund_batch",
    description: "List industry hold fund batch data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_industry_hold_fund_batch operation.",
      {
        isETF: s.withExamples(
          s.boolean(
            "Whether to limit results to exchange-traded funds Accepted by Investoday for list_industry_hold_fund_batch.",
          ),
          [true],
        ),
        matchType: s.withExamples(
          s.withEnum(
            s.integer("Result matching type Accepted by Investoday for list_industry_hold_fund_batch."),
            [1, 2, 3, 4, 5, 6, 7],
          ),
          [1],
        ),
        threshold: s.withExamples(
          s.number("Threshold value Accepted by Investoday for list_industry_hold_fund_batch."),
          [40],
        ),
        industryCodes: s.withExamples(
          s.array(
            "Industry codes Accepted by Investoday for list_industry_hold_fund_batch.",
            s.string("One industryCode value."),
            { minItems: 1 },
          ),
          [["640000", "740000"]],
        ),
      },
      { required: ["industryCodes", "matchType", "threshold"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_margin_trade",
    toolName: "list_fund_margin_trade",
    description: "List fund margin trade data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_margin_trade operation.",
        {
          beginDate: s.withExamples(
            s.nonEmptyString("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_margin_trade."),
            ["2025-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "002594",
          ]),
          endDate: s.withExamples(
            s.nonEmptyString("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_margin_trade."),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_margin_trade.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_margin_trade.", { minimum: 1 }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_oscillator_indicators",
    toolName: "list_fund_oscillator_indicators",
    description: "List fund oscillator indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_oscillator_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_oscillator_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_oscillator_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_oscillator_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_oscillator_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_fund_performance_attribution",
    toolName: "get_fund_performance_attribution",
    description: "Get fund performance attribution data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_fund_performance_attribution operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "000006"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_price_volume_indicators",
    toolName: "list_fund_price_volume_indicators",
    description: "List fund price volume indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_price_volume_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_price_volume_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_price_volume_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_price_volume_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_price_volume_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_strength_trend_indicators",
    toolName: "list_fund_strength_trend_indicators",
    description: "List fund strength trend indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_strength_trend_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_strength_trend_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or fundCode.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_strength_trend_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_strength_trend_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_strength_trend_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_tech_indicators",
    toolName: "list_fund_tech_indicators",
    description: "List fund tech indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_fund_tech_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_tech_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          fundCodes: s.array(
            "Fund codes Supply exactly one of fundCodes or fundCode.",
            s.string("One fundCode value."),
            { minItems: 1 },
          ),
          fundCode: s.withExamples(s.nonEmptyString("Fund code Supply exactly one of fundCode or fundCodes."), [
            "000001",
          ]),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_tech_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_fund_tech_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_tech_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCode", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_fund_announcements",
    toolName: "list_fund_announcements",
    description: "List fund announcements data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_fund_announcements operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_fund_announcements.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        fundCodes: s.withExamples(
          s.array("Fund codes Accepted by Investoday for list_fund_announcements.", s.string("One fundCode value."), {
            minItems: 1,
          }),
          [["000001", "000004"]],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_fund_announcements.", { minLength: 1 }),
          ["2020-01-02"],
        ),
        announcementID: s.withExamples(
          s.integer("Announcement identifier Accepted by Investoday for list_fund_announcements."),
          [9128035],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_fund_announcements.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        title: s.withExamples(s.nonEmptyString("Title keyword Accepted by Investoday for list_fund_announcements."), [
          "贵州茅台利润大涨",
        ]),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_fund_announcements.", { minimum: 1 }),
          [1],
        ),
      },
      { required: ["fundCodes"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
