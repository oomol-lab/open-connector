import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const fixedIncomeOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "list_bonds_basic",
    toolName: "list_bonds_basic",
    description: "List bonds basic data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_bonds_basic operation.",
        {
          bondCodes: s.withExamples(
            s.array("Bond codes Supply exactly one of bondCodes or bondCode.", s.string("One bondCode value."), {
              minItems: 1,
            }),
            [["110059", "113052"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_bonds_basic.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          bondCode: s.withExamples(s.nonEmptyString("Bond code Supply exactly one of bondCode or bondCodes."), [
            "110059",
          ]),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_bonds_basic.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["bondCode", "bondCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_cb_basic",
    toolName: "list_cb_basic",
    description: "List convertible bond basic data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_cb_basic operation.",
      {
        cbCodes: s.withExamples(
          s.array("Convertible bond codes Accepted by Investoday for list_cb_basic.", s.string("One cbCode value.")),
          [["110059", "113052"]],
        ),
        cbCode: s.withExamples(s.nonEmptyString("Convertible bond code Accepted by Investoday for list_cb_basic."), [
          "110059",
        ]),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_cb_basic.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_cb_basic.", {
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
    name: "list_bonds_coupons",
    toolName: "list_bonds_coupons",
    description: "List bonds coupons data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_bonds_coupons operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_bonds_coupons.", { minLength: 1 }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_bonds_coupons.", {
              minLength: 1,
            }),
            ["2026-08-12"],
          ),
          bondCodes: s.withExamples(
            s.array("Bond codes Supply exactly one of bondCodes or bondCode.", s.string("One bondCode value."), {
              minItems: 1,
            }),
            [["110059", "113052"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_bonds_coupons.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          bondCode: s.withExamples(s.nonEmptyString("Bond code Supply exactly one of bondCode or bondCodes."), [
            "110059",
          ]),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_bonds_coupons.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["bondCode", "bondCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_bonds_ratings",
    toolName: "list_bonds_ratings",
    description: "List bonds ratings data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_bonds_ratings operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_bonds_ratings.", { minLength: 1 }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_bonds_ratings.", {
              minLength: 1,
            }),
            ["2026-08-12"],
          ),
          bondCodes: s.withExamples(
            s.array("Bond codes Supply exactly one of bondCodes or bondCode.", s.string("One bondCode value."), {
              minItems: 1,
            }),
            [["110059", "113052"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_bonds_ratings.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          bondCode: s.withExamples(s.nonEmptyString("Bond code Supply exactly one of bondCode or bondCodes."), [
            "110059",
          ]),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_bonds_ratings.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["bondCode", "bondCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_bonds_yield_curve",
    toolName: "list_bonds_yield_curve",
    description: "List bonds yield curve data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_bonds_yield_curve operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_bonds_yield_curve.", {
            minLength: 1,
          }),
          ["2026-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_bonds_yield_curve.", { minLength: 1 }),
          ["2026-08-12"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_bonds_yield_curve.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_bonds_yield_curve.", { minimum: 1 }),
          [1],
        ),
        curveCode: s.withExamples(
          s.stringEnum("Yield curve code Accepted by Investoday for list_bonds_yield_curve.", ["CNYYC", "USDYC"]),
          ["CNYYC"],
        ),
      },
      { required: ["curveCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_cb_daily",
    toolName: "list_cb_daily",
    description: "List convertible bond daily data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_cb_daily operation.",
        {
          cbCodes: s.withExamples(
            s.array("Convertible bond codes Supply exactly one of cbCodes or cbCode.", s.string("One cbCode value."), {
              minItems: 1,
            }),
            [["110059", "113052"]],
          ),
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_cb_daily.", {
              minLength: 1,
            }),
            ["2026-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_cb_daily.", {
              minLength: 1,
            }),
            ["2026-08-12"],
          ),
          cbCode: s.withExamples(s.nonEmptyString("Convertible bond code Supply exactly one of cbCode or cbCodes."), [
            "110059",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_cb_daily.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_cb_daily.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["cbCode", "cbCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_cb_plans",
    toolName: "list_cb_plans",
    description: "List convertible bond plans data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_cb_plans operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_cb_plans.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_cb_plans.", {
              minLength: 1,
            }),
            ["2026-08-12"],
          ),
          cbCode: s.withExamples(s.nonEmptyString("Convertible bond code Supply exactly one of cbCode or stockCode."), [
            "110059",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_cb_plans.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_cb_plans.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or cbCode."), [
            "600000",
          ]),
        },
        { required: [] },
      ),
      ["cbCode", "stockCode"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_cb_valuation",
    toolName: "list_cb_valuation",
    description: "List convertible bond valuation data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_cb_valuation operation.",
        {
          cbCodes: s.withExamples(
            s.array("Convertible bond codes Supply exactly one of cbCodes or cbCode.", s.string("One cbCode value."), {
              minItems: 1,
            }),
            [["110059", "113052"]],
          ),
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_cb_valuation.", { minLength: 1 }),
            ["2026-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_cb_valuation.", {
              minLength: 1,
            }),
            ["2026-08-12"],
          ),
          cbCode: s.withExamples(s.nonEmptyString("Convertible bond code Supply exactly one of cbCode or cbCodes."), [
            "110059",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_cb_valuation.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_cb_valuation.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["cbCode", "cbCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_chain_bond_issuers",
    toolName: "get_chain_bond_issuers",
    description: "Get chain bond issuers data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_chain_bond_issuers operation.",
      {
        companyName: s.withExamples(
          s.nonEmptyString("Company name Accepted by Investoday for get_chain_bond_issuers."),
          ["广东粤运交通股份有限公司"],
        ),
      },
      { required: ["companyName"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_chain_com_main_pro",
    toolName: "list_chain_com_main_pro",
    description: "List chain com main pro data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_chain_com_main_pro operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_chain_com_main_pro.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_chain_com_main_pro.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        stockCodes: s.withExamples(
          s.array("Stock codes Accepted by Investoday for list_chain_com_main_pro.", s.string("One stockCode value.")),
          [["600519", "000001"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_chain_com_main_pro.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        productCodes: s.withExamples(
          s.array(
            "Product codes Accepted by Investoday for list_chain_com_main_pro.",
            s.string("One productCode value."),
          ),
          [["P0007786", "P0007806"]],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_chain_com_main_pro.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_chain_industry_info",
    toolName: "get_chain_industry_info",
    description: "Get chain industry info data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_chain_industry_info operation.",
      {
        industryName: s.withExamples(
          s.nonEmptyString("Industry name Accepted by Investoday for get_chain_industry_info."),
          ["商品化工"],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for get_chain_industry_info."),
          ["CSF_15101010"],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_chain_pro_ind_maps",
    toolName: "list_chain_pro_ind_maps",
    description: "List chain pro indicator maps data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_chain_pro_ind_maps operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_chain_pro_ind_maps.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_chain_pro_ind_maps.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        stockCodes: s.withExamples(
          s.array("Stock codes Accepted by Investoday for list_chain_pro_ind_maps.", s.string("One stockCode value."), {
            minItems: 1,
          }),
          [["000001", "600519"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_chain_pro_ind_maps.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_chain_pro_ind_maps.", { minimum: 1 }),
          [1],
        ),
      },
      { required: ["stockCodes"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_chain_pro_relation",
    toolName: "get_chain_pro_relation",
    description: "Get chain pro relation data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_chain_pro_relation operation.",
      {
        productCode: s.withExamples(
          s.nonEmptyString("Product code Accepted by Investoday for get_chain_pro_relation."),
          ["P0007786"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for get_chain_pro_relation.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for get_chain_pro_relation.", { minimum: 1 }),
          [1],
        ),
        productName: s.withExamples(
          s.nonEmptyString("Product name Accepted by Investoday for get_chain_pro_relation."),
          ["红茶"],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_chain_product_info",
    toolName: "get_chain_product_info",
    description: "Get chain product info data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_chain_product_info operation.",
      {
        productCode: s.withExamples(
          s.nonEmptyString("Product code Accepted by Investoday for get_chain_product_info."),
          ["P0007784"],
        ),
        productName: s.withExamples(
          s.nonEmptyString("Product name Accepted by Investoday for get_chain_product_info."),
          ["白茶"],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_chain_sec_basic_info",
    toolName: "get_chain_sec_basic_info",
    description: "Get chain sec basic info data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_chain_sec_basic_info operation.",
      {
        stockCodes: s.withExamples(
          s.array("Stock codes Accepted by Investoday for get_chain_sec_basic_info.", s.string("One stockCode value.")),
          [["000001", "600519"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for get_chain_sec_basic_info.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for get_chain_sec_basic_info.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_futures_kline_minute",
    toolName: "list_futures_kline_minute",
    description: "List futures kline minute data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_futures_kline_minute operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_futures_kline_minute.", {
            minLength: 1,
          }),
          ["2026-07-23"],
        ),
        futureCode: s.withExamples(
          s.nonEmptyString("Futures contract code Accepted by Investoday for list_futures_kline_minute."),
          ["CHINA50"],
        ),
        klinePeriod: s.withExamples(
          s.integer("K-line period Accepted by Investoday for list_futures_kline_minute."),
          [-2],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_futures_kline_minute.", {
            minLength: 1,
          }),
          ["2026-07-23"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_futures_kline_minute.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_futures_kline_minute.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
