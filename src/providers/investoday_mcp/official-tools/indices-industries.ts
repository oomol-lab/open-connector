import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const indicesIndustriesOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "list_concepts",
    toolName: "list_concepts",
    description: "List concepts data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_concepts operation.",
      {
        conceptName: s.withExamples(s.nonEmptyString("Concept name Accepted by Investoday for list_concepts."), [
          "次新股",
        ]),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_concepts.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_concepts.", {
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
    name: "get_index_basic_info",
    toolName: "get_index_basic_info",
    description: "Get index basic info data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_index_basic_info operation.",
        {
          indexCode: s.withExamples(s.nonEmptyString("Index code Supply exactly one of indexCode or indexCodes."), [
            "399300",
          ]),
          indexCodes: s.withExamples(
            s.array("Index codes Supply exactly one of indexCodes or indexCode.", s.string("One indexCode value."), {
              minItems: 1,
            }),
            [["000001", "000300"]],
          ),
        },
        { required: [] },
      ),
      ["indexCode", "indexCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_index_quote_barch",
    toolName: "list_index_quote_barch",
    description: "List index quote barch data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_index_quote_barch operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_index_quote_barch.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_index_quote_barch.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          indexCode: s.withExamples(s.nonEmptyString("Index code Supply exactly one of indexCode or indexCodes."), [
            "000300",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_index_quote_barch.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_index_quote_barch.", { minimum: 1 }),
            [1],
          ),
          indexCodes: s.withExamples(
            s.array("Index codes Supply exactly one of indexCodes or indexCode.", s.string("One indexCode value."), {
              minItems: 1,
            }),
            [["399300", "399301"]],
          ),
        },
        { required: [] },
      ),
      ["indexCode", "indexCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_index_sample",
    toolName: "list_index_sample",
    description: "List index sample data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_index_sample operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_index_sample.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_index_sample.", {
            minLength: 1,
          }),
          ["2026-07-31"],
        ),
        indexCode: s.withExamples(s.nonEmptyString("Index code Accepted by Investoday for list_index_sample."), [
          "000300",
        ]),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_index_sample.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_index_sample.", {
            minimum: 1,
          }),
          [1],
        ),
        indexCodes: s.withExamples(
          s.array("Index codes Accepted by Investoday for list_index_sample.", s.string("One indexCode value.")),
          [["000300", "000905"]],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industries",
    toolName: "list_industries",
    description: "List industries data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_industries operation.",
      {
        industryName: s.withExamples(s.nonEmptyString("Industry name Accepted by Investoday for list_industries."), [
          "煤炭",
        ]),
        industryType: s.withExamples(
          s.stringEnum("Industry classification type Accepted by Investoday for list_industries.", [
            "INDUS2_CL",
            "INDUS3_CL",
            "INDUS4_CL",
            "INDUS5_CL",
            "INDUS6_CL",
            "INDUS8_CL",
          ]),
          ["INDUS4_CL"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_industries.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_industries.", {
            minimum: 1,
          }),
          [1],
        ),
        industryCode: s.withExamples(s.nonEmptyString("Industry code Accepted by Investoday for list_industries."), [
          "740000",
        ]),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_quote",
    toolName: "list_industry_quote",
    description: "List industry quote data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_industry_quote operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_industry_quote.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_industry_quote.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_industry_quote.", {
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
            [["640000", "740000"]],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_quote.", { minimum: 1 }),
            [1],
          ),
          industryCode: s.withExamples(
            s.nonEmptyString("Industry code Supply exactly one of industryCode or industryCodes."),
            ["640000"],
          ),
        },
        { required: [] },
      ),
      ["industryCode", "industryCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_concept_etf_mapping",
    toolName: "list_concept_etf_mapping",
    description: "List concept etf mapping data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_concept_etf_mapping operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or conceptCodes.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["512480", "515880"]],
          ),
          conceptCodes: s.withExamples(
            s.array(
              "Concept codes Supply exactly one of conceptCodes or fundCodes.",
              s.string("One conceptCode value."),
              { minItems: 1 },
            ),
            [["CLS80006", "CLS80003"]],
          ),
          minAnnualWeight: s.withExamples(
            s.number("Minimum annual weight filter Accepted by Investoday for list_concept_etf_mapping.", {
              minimum: 0,
              maximum: 100,
            }),
            [20],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_concept_etf_mapping.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_concept_etf_mapping.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["conceptCodes", "fundCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_index_finance",
    toolName: "list_index_finance",
    description: "List index finance data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_index_finance operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_index_finance.", { minLength: 1 }),
            ["2015-03-31"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_index_finance.", {
              minLength: 1,
            }),
            ["2025-12-31"],
          ),
          indexCode: s.withExamples(s.nonEmptyString("Index code Supply exactly one of indexCode or indexCodes."), [
            "000300",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_index_finance.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_index_finance.", {
              minimum: 1,
            }),
            [1],
          ),
          indexCodes: s.withExamples(
            s.array("Index codes Supply exactly one of indexCodes or indexCode.", s.string("One indexCode value."), {
              minItems: 1,
            }),
            [["000300", "000905"]],
          ),
        },
        { required: [] },
      ),
      ["indexCode", "indexCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_idx_idu_exposure",
    toolName: "list_idx_idu_exposure",
    description: "List index industry exposure data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_idx_idu_exposure operation.",
        {
          queryDate: s.withExamples(
            s.date("Query date in YYYY-MM-DD format Accepted by Investoday for list_idx_idu_exposure.", {
              minLength: 1,
            }),
            ["2026-09-01"],
          ),
          industryLevel: s.withExamples(
            s.withEnum(
              s.integer("Industry classification level Accepted by Investoday for list_idx_idu_exposure."),
              [1, 2, 3],
            ),
            [1],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_idx_idu_exposure.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          minIndustryWeight: s.withExamples(
            s.number("Minimum industry weight filter Accepted by Investoday for list_idx_idu_exposure.", {
              minimum: 0,
              maximum: 100,
            }),
            [10],
          ),
          industryCodes: s.withExamples(
            s.array(
              "Industry codes Supply exactly one of industryCodes or indexCodes.",
              s.string("One industryCode value."),
              { minItems: 1 },
            ),
            [["640000", "730000"]],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_idx_idu_exposure.", { minimum: 1 }),
            [1],
          ),
          indexCodes: s.withExamples(
            s.array(
              "Index codes Supply exactly one of indexCodes or industryCodes.",
              s.string("One indexCode value."),
              { minItems: 1 },
            ),
            [["000300", "000905"]],
          ),
        },
        { required: ["queryDate"] },
      ),
      ["indexCodes", "industryCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_index_oscillator_indicators",
    toolName: "list_index_oscillator_indicators",
    description: "List index oscillator indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_index_oscillator_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_index_oscillator_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_index_oscillator_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          indexCode: s.withExamples(s.nonEmptyString("Index code Supply exactly one of indexCode or indexCodes."), [
            "002594",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_index_oscillator_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_index_oscillator_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
          indexCodes: s.withExamples(
            s.array("Index codes Supply exactly one of indexCodes or indexCode.", s.string("One indexCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
        },
        { required: [] },
      ),
      ["indexCode", "indexCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_index_price_volume_indicators",
    toolName: "list_index_price_volume_indicators",
    description: "List index price volume indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_index_price_volume_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_index_price_volume_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_index_price_volume_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          indexCode: s.withExamples(s.nonEmptyString("Index code Supply exactly one of indexCode or indexCodes."), [
            "002594",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_index_price_volume_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_index_price_volume_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
          indexCodes: s.withExamples(
            s.array("Index codes Supply exactly one of indexCodes or indexCode.", s.string("One indexCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
        },
        { required: [] },
      ),
      ["indexCode", "indexCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_index_range_gains",
    toolName: "get_index_range_gains",
    description: "Get index range gains data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_index_range_gains operation.",
      {
        indexCode: s.withExamples(s.nonEmptyString("Index code Accepted by Investoday for get_index_range_gains."), [
          "000300",
        ]),
      },
      { required: ["indexCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_index_strength_trend_indicators",
    toolName: "list_index_strength_trend_indicators",
    description: "List index strength trend indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_index_strength_trend_indicators operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_index_strength_trend_indicators.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_index_strength_trend_indicators.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          indexCode: s.withExamples(s.nonEmptyString("Index code Supply exactly one of indexCode or indexCodes."), [
            "002594",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_index_strength_trend_indicators.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_index_strength_trend_indicators.", {
              minimum: 1,
            }),
            [1],
          ),
          indexCodes: s.withExamples(
            s.array("Index codes Supply exactly one of indexCodes or indexCode.", s.string("One indexCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
        },
        { required: [] },
      ),
      ["indexCode", "indexCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_index_technical_indicators",
    toolName: "list_index_technical_indicators",
    description: "List index technical indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_index_technical_indicators operation.",
      {
        indexCode: s.withExamples(
          s.nonEmptyString("Index code Accepted by Investoday for list_index_technical_indicators."),
          ["000001"],
        ),
      },
      { required: ["indexCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_index_valuation",
    toolName: "get_index_valuation",
    description: "Get index valuation data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_index_valuation operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for get_index_valuation.", { minLength: 1 }),
            ["2025-11-04"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for get_index_valuation.", { minLength: 1 }),
            ["2025-11-04"],
          ),
          indexCode: s.withExamples(s.nonEmptyString("Index code Supply exactly one of indexCode or indexCodes."), [
            "399300",
          ]),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_index_valuation.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_index_valuation.", { minimum: 1 }),
            [1],
          ),
          indexCodes: s.withExamples(
            s.array("Index codes Supply exactly one of indexCodes or indexCode.", s.string("One indexCode value."), {
              minItems: 1,
            }),
            [["399300", "399301"]],
          ),
        },
        { required: [] },
      ),
      ["indexCode", "indexCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_idu_concept_mappings",
    toolName: "list_idu_concept_mappings",
    description: "List industry concept mappings data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_idu_concept_mappings operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_idu_concept_mappings.", {
              minLength: 1,
            }),
            ["2026-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_idu_concept_mappings.", {
              minLength: 1,
            }),
            ["2026-09-01"],
          ),
          conceptCodes: s.withExamples(
            s.array(
              "Concept codes Supply exactly one of conceptCodes or industryCodes.",
              s.string("One conceptCode value."),
              { minItems: 1 },
            ),
            [["CLS80006", "CLS80003"]],
          ),
          industryLevel: s.withExamples(
            s.withEnum(
              s.integer("Industry classification level Accepted by Investoday for list_idu_concept_mappings."),
              [1, 2, 3],
            ),
            [1],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_idu_concept_mappings.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          minTotalCapWeight: s.withExamples(
            s.number(
              "Minimum total market-capitalization weight Accepted by Investoday for list_idu_concept_mappings.",
            ),
            [0.2],
          ),
          industryCodes: s.withExamples(
            s.array(
              "Industry codes Supply exactly one of industryCodes or conceptCodes.",
              s.string("One industryCode value."),
              { minItems: 1 },
            ),
            [["640000", "730000"]],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_idu_concept_mappings.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["conceptCodes", "industryCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_etf_mapping",
    toolName: "list_industry_etf_mapping",
    description: "List industry etf mapping data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_industry_etf_mapping operation.",
        {
          fundCodes: s.withExamples(
            s.array("Fund codes Supply exactly one of fundCodes or industryCodes.", s.string("One fundCode value."), {
              minItems: 1,
            }),
            [["512720", "515880"]],
          ),
          minAnnualWeight: s.withExamples(
            s.number("Minimum annual weight filter Accepted by Investoday for list_industry_etf_mapping.", {
              minimum: 0,
              maximum: 100,
            }),
            [20],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_industry_etf_mapping.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          industryCodes: s.withExamples(
            s.array(
              "Industry codes Supply exactly one of industryCodes or fundCodes.",
              s.string("One industryCode value."),
              { minItems: 1 },
            ),
            [["640000", "730000"]],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_etf_mapping.", {
              minimum: 1,
            }),
            [1],
          ),
        },
        { required: [] },
      ),
      ["fundCodes", "industryCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_excess_alph",
    toolName: "list_industry_excess_alph",
    description: "List industry excess alph data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_industry_excess_alph operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_industry_excess_alph.", {
            minLength: 1,
          }),
          ["2026-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_industry_excess_alph.", {
            minLength: 1,
          }),
          ["2026-07-31"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_industry_excess_alph.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_excess_alph.", { minimum: 1 }),
          [1],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_industry_excess_alph."),
          ["640000"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list__idu_fin_ind_sol_avg",
    toolName: "list__idu_fin_ind_sol_avg",
    description: "List industry financial indicator sol average data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list__idu_fin_ind_sol_avg operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list__idu_fin_ind_sol_avg.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list__idu_fin_ind_sol_avg.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list__idu_fin_ind_sol_avg.", {
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
            [["640000", "740000"]],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list__idu_fin_ind_sol_avg.", {
              minimum: 1,
            }),
            [1],
          ),
          industryCode: s.withExamples(
            s.nonEmptyString("Industry code Supply exactly one of industryCode or industryCodes."),
            ["640000"],
          ),
        },
        { required: [] },
      ),
      ["industryCode", "industryCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_fin_ttm",
    toolName: "list_industry_fin_ttm",
    description: "List industry financial ttm data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_industry_fin_ttm operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_industry_fin_ttm.", {
              minLength: 1,
            }),
            ["2024-03-31"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_industry_fin_ttm.", { minLength: 1 }),
            ["2025-12-31"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_industry_fin_ttm.", {
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
            [["801780", "801790"]],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_fin_ttm.", { minimum: 1 }),
            [1],
          ),
          industryCode: s.withExamples(
            s.nonEmptyString("Industry code Supply exactly one of industryCode or industryCodes."),
            ["801780"],
          ),
        },
        { required: [] },
      ),
      ["industryCode", "industryCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_industry_financial_overview",
    toolName: "get_industry_financial_overview",
    description: "Get industry financial overview data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_industry_financial_overview operation.",
      {
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for get_industry_financial_overview."),
          ["640000"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_forecasts",
    toolName: "list_industry_forecasts",
    description: "List industry forecasts data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_industry_forecasts operation.",
      {
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_industry_forecasts."),
          ["640000"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_industry_market_stats",
    toolName: "get_industry_market_stats",
    description: "Get industry market stats data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_industry_market_stats operation.",
      {
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for get_industry_market_stats."),
          ["640000"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_pros_idx",
    toolName: "list_industry_pros_idx",
    description: "List industry pros index data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_industry_pros_idx operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_industry_pros_idx.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_industry_pros_idx.", { minLength: 1 }),
          ["2026-08-18"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_industry_pros_idx.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_pros_idx.", { minimum: 1 }),
          [1],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_industry_pros_idx."),
          ["740000"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_prosperity_index",
    toolName: "list_industry_prosperity_index",
    description: "List industry prosperity index data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_industry_prosperity_index operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_industry_prosperity_index.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_industry_prosperity_index.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_industry_prosperity_index.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_prosperity_index.", {
            minimum: 1,
          }),
          [1],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_industry_prosperity_index."),
          ["740000"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_rotation",
    toolName: "list_industry_rotation",
    description: "List industry rotation data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_industry_rotation operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_industry_rotation.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_industry_rotation.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_industry_rotation.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_rotation.", { minimum: 1 }),
          [1],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_industry_rotation."),
          ["002594"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_idu_turnover_rates",
    toolName: "list_idu_turnover_rates",
    description: "List industry turnover rates data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_idu_turnover_rates operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_idu_turnover_rates.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_idu_turnover_rates.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_idu_turnover_rates.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_idu_turnover_rates.", { minimum: 1 }),
          [1],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_idu_turnover_rates."),
          ["640000"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_industry_val_ind",
    toolName: "list_industry_val_ind",
    description: "List industry valuation indicator data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_industry_val_ind operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_industry_val_ind.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_industry_val_ind.", { minLength: 1 }),
            ["2025-01-01"],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_industry_val_ind.", {
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
            [["000001", "600519"]],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_industry_val_ind.", { minimum: 1 }),
            [1],
          ),
          industryCode: s.withExamples(
            s.nonEmptyString("Industry code Supply exactly one of industryCode or industryCodes."),
            ["002594"],
          ),
        },
        { required: [] },
      ),
      ["industryCode", "industryCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_concept_realtime_quote",
    toolName: "get_concept_realtime_quote",
    description: "Get concept realtime quote data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_concept_realtime_quote operation.",
      {
        conceptType: s.withExamples(
          s.nonEmptyString("Concept type Accepted by Investoday for get_concept_realtime_quote."),
          ["jy"],
        ),
        conceptCode: s.withExamples(
          s.nonEmptyString("Concept code Accepted by Investoday for get_concept_realtime_quote."),
          ["14060061"],
        ),
      },
      { required: ["conceptType", "conceptCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_concept_real_quote",
    toolName: "list_concept_real_quote",
    description: "List concept real quote data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_concept_real_quote operation.",
      {
        sortColumn: s.withExamples(
          s.nonEmptyString("Column used to sort the result Accepted by Investoday for list_concept_real_quote."),
          ["changeRatio"],
        ),
        conceptType: s.withExamples(
          s.withEnum(s.integer("Concept type Accepted by Investoday for list_concept_real_quote."), [1, 2]),
          [1],
        ),
        conceptCodes: s.array(
          "Concept codes Accepted by Investoday for list_concept_real_quote.",
          s.string("One conceptCode value."),
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_concept_real_quote.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_concept_real_quote.", { minimum: 1 }),
          [1],
        ),
        order: s.withExamples(s.nonEmptyString("Sort order Accepted by Investoday for list_concept_real_quote."), [
          "desc",
        ]),
      },
      { required: ["conceptType", "sortColumn"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_concept_stock_realtime_quote",
    toolName: "get_concept_stock_realtime_quote",
    description: "Get concept stock realtime quote data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_concept_stock_realtime_quote operation.",
      {
        sortColumn: s.withExamples(
          s.nonEmptyString(
            "Column used to sort the result Accepted by Investoday for get_concept_stock_realtime_quote.",
          ),
          ["changeRatio"],
        ),
        conceptType: s.withExamples(
          s.stringEnum("Concept type Accepted by Investoday for get_concept_stock_realtime_quote.", ["jy", "cls"]),
          ["jy"],
        ),
        conceptCode: s.withExamples(
          s.nonEmptyString("Concept code Accepted by Investoday for get_concept_stock_realtime_quote."),
          ["14060061"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for get_concept_stock_realtime_quote."),
          [10],
        ),
        page: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for get_concept_stock_realtime_quote."),
          [1],
        ),
        order: s.withExamples(
          s.stringEnum("Sort order Accepted by Investoday for get_concept_stock_realtime_quote.", ["asc", "desc"]),
          ["desc"],
        ),
      },
      { required: ["conceptType", "conceptCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_index_realtime_quotes",
    toolName: "get_index_realtime_quotes",
    description: "Get index realtime quotes data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_index_realtime_quotes operation.",
      {
        indexCodes: s.withExamples(
          s.array(
            "Index codes Accepted by Investoday for get_index_realtime_quotes.",
            s.string("One indexCode value."),
            { minItems: 1 },
          ),
          [["000001", "399006"]],
        ),
      },
      { required: ["indexCodes"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
