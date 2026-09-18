import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

interface OfficialTool {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  toolName: string;
}

const officialTools: OfficialTool[] = [
  {
    name: "search",
    operationType: "read",
    description: "Search securities, funds, indices, industries and concepts by name or code.",
    inputSchema: {
      type: "object",
      description: "Arguments for search.",
      properties: {
        key: {
          type: "string",
          description: "Search keyword, such as a company name or security code.",
        },
        type: {
          type: "string",
          description:
            "Comma-separated search types: 11 A-shares, 12 indices, 13 ETF benchmarks, 21 funds, 22 ETFs, 23 LOFs, 27 fund managers, 28 fund companies, 29 fund themes, 31 Hong Kong stocks, 71/72 Shenwan level 1/2 industries, 81/82 Juyuan/Cailian concepts.",
          minLength: 1,
        },
        pageNum: {
          type: "integer",
          description: "Page number, starting at 1.",
          minimum: 1,
        },
        pageSize: {
          type: "integer",
          description: "Records per page, from 1 to 500.",
          minimum: 1,
          maximum: 500,
        },
      },
      required: ["type"],
      additionalProperties: false,
    },
    toolName: "search",
  },
  {
    name: "get_stock_basic_info",
    operationType: "read",
    description: "Get basic information for one or multiple Shanghai, Shenzhen or Beijing stocks.",
    inputSchema: {
      type: "object",
      description: "Arguments for get_stock_basic_info.",
      properties: {
        stockCode: {
          type: "string",
          description: "One stock code. Supply exactly one of stockCode or stockCodes.",
          minLength: 1,
        },
        stockCodes: {
          type: "array",
          description: "Stock codes for a batch query. Supply exactly one of stockCode or stockCodes.",
          items: {
            type: "string",
            description: "A stock code.",
            minLength: 1,
          },
          minItems: 1,
        },
        pageNum: {
          type: "integer",
          description: "Page number, starting at 1.",
          minimum: 1,
        },
        pageSize: {
          type: "integer",
          description: "Records per page, from 1 to 500.",
          minimum: 1,
          maximum: 500,
        },
      },
      required: [],
      additionalProperties: false,
      oneOf: [
        {
          required: ["stockCode"],
        },
        {
          required: ["stockCodes"],
        },
      ],
    },
    toolName: "get_stock_basic_info",
  },
  {
    name: "get_stock_quote_realtime",
    operationType: "read",
    description: "Get the latest realtime quote for one Shanghai, Shenzhen or Beijing stock.",
    inputSchema: {
      type: "object",
      description: "Arguments for get_stock_quote_realtime.",
      properties: {
        stockCode: {
          type: "string",
          description: "Stock code, for example 002594.",
          minLength: 1,
        },
      },
      required: ["stockCode"],
      additionalProperties: false,
    },
    toolName: "get_stock_quote_realtime",
  },
  {
    name: "list_stock_adjusted_quotes",
    operationType: "read",
    description: "Get forward-adjusted daily stock prices over a date range, including batch queries and pagination.",
    inputSchema: {
      type: "object",
      description: "Arguments for list_stock_adjusted_quotes.",
      properties: {
        stockCode: {
          type: "string",
          description: "One stock code. Supply exactly one of stockCode or stockCodes.",
          minLength: 1,
        },
        stockCodes: {
          type: "array",
          description: "Stock codes for a batch query. Supply exactly one of stockCode or stockCodes.",
          items: {
            type: "string",
            description: "A stock code.",
            minLength: 1,
          },
          minItems: 1,
        },
        beginDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format; earliest supported date is 2020-01-01.",
          format: "date",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format.",
          format: "date",
        },
        pageNum: {
          type: "integer",
          description: "Page number, starting at 1.",
          minimum: 1,
        },
        pageSize: {
          type: "integer",
          description: "Records per page, from 1 to 500.",
          minimum: 1,
          maximum: 500,
        },
      },
      required: [],
      additionalProperties: false,
      oneOf: [
        {
          required: ["stockCode"],
        },
        {
          required: ["stockCodes"],
        },
      ],
    },
    toolName: "list_stock_adjusted_quotes",
  },
  {
    name: "get_stock_val_indicators",
    operationType: "read",
    description: "Get stock valuation indicators including market capitalization, PE, PB and PS over a date range.",
    inputSchema: {
      type: "object",
      description: "Arguments for get_stock_val_indicators.",
      properties: {
        stockCode: {
          type: "string",
          description: "One stock code. Supply exactly one of stockCode or stockCodes.",
          minLength: 1,
        },
        stockCodes: {
          type: "array",
          description: "Stock codes for a batch query. Supply exactly one of stockCode or stockCodes.",
          items: {
            type: "string",
            description: "A stock code.",
            minLength: 1,
          },
          minItems: 1,
        },
        beginDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format; earliest supported date is 2020-01-01.",
          format: "date",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format.",
          format: "date",
        },
        pageNum: {
          type: "integer",
          description: "Page number, starting at 1.",
          minimum: 1,
        },
        pageSize: {
          type: "integer",
          description: "Records per page, from 1 to 500.",
          minimum: 1,
          maximum: 500,
        },
      },
      required: [],
      additionalProperties: false,
      oneOf: [
        {
          required: ["stockCode"],
        },
        {
          required: ["stockCodes"],
        },
      ],
    },
    toolName: "get_stock_val_indicators",
  },
  {
    name: "list_report_research",
    operationType: "read",
    description:
      "Find research reports by stock, industry, institution or category, with optional keywords and publication dates.",
    inputSchema: {
      type: "object",
      description: "Arguments for list_report_research.",
      properties: {
        stockCode: {
          type: "string",
          description: "Stock code; supply at least one stock, industry, institution or category filter.",
          minLength: 1,
        },
        industryCode: {
          type: "string",
          description: "Shenwan level 2 industry code.",
          minLength: 1,
        },
        industryCodeLv1: {
          type: "string",
          description: "Shenwan level 1 industry code.",
          minLength: 1,
        },
        institutionCode: {
          type: "integer",
          description: "Research institution code.",
        },
        categoryCode: {
          type: "string",
          description:
            "Report category: 000100 industry, 000200 company, 000300 fund, 000400 bond, 000500 strategy, 000700 economy, 000800 forex, 000900 futures, 001000 money market, 001100 global market, 001200 capital market, 001210 NEEQ, 001300 Hong Kong, 001400 other, 001500 morning briefing, 001600 warrants, 001700 financial engineering, 001900 non-fund wealth management.",
          enum: [
            "000100",
            "000200",
            "000300",
            "000400",
            "000500",
            "000700",
            "000800",
            "000900",
            "001000",
            "001100",
            "001200",
            "001210",
            "001300",
            "001400",
            "001500",
            "001600",
            "001700",
            "001900",
          ],
        },
        beginDate: {
          type: "string",
          description: "Publication start date in YYYY-MM-DD format.",
          format: "date",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format.",
          format: "date",
        },
        key: {
          type: "string",
          description: "Optional keyword for research reports.",
        },
        pageNum: {
          type: "integer",
          description: "Page number, starting at 1.",
          minimum: 1,
        },
        pageSize: {
          type: "integer",
          description: "Records per page, from 1 to 500.",
          minimum: 1,
          maximum: 500,
        },
      },
      required: [],
      additionalProperties: false,
      anyOf: [
        {
          required: ["stockCode"],
        },
        {
          required: ["industryCode"],
        },
        {
          required: ["industryCodeLv1"],
        },
        {
          required: ["institutionCode"],
        },
        {
          required: ["categoryCode"],
        },
      ],
    },
    toolName: "list_report_research",
  },
  {
    name: "search_announcements",
    operationType: "read",
    description:
      "Search announcement passages by meaning, optionally filtering by stock, announcement ID and publication dates.",
    inputSchema: {
      type: "object",
      description: "Arguments for search_announcements.",
      properties: {
        query: {
          type: "string",
          description: "Natural-language text describing the announcement information to find.",
          minLength: 1,
        },
        stockCode: {
          type: "string",
          description: "Optional stock code.",
        },
        announcementId: {
          type: "integer",
          description: "Optional announcement ID.",
        },
        beginDate: {
          type: "string",
          description: "Publication start date or timestamp, as accepted by Investoday.",
        },
        endDate: {
          type: "string",
          description: "Publication end date or timestamp, as accepted by Investoday.",
        },
        topK: {
          type: "integer",
          description: "Number of matching passages to return.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    toolName: "list_announcement_vector-search",
  },
  {
    name: "get_market_change_ratio_status",
    operationType: "read",
    description: "Get current market breadth, including rising, falling and limit-up or limit-down stock counts.",
    inputSchema: {
      type: "object",
      description: "Arguments for get_market_change_ratio_status.",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    toolName: "get_market_change_ratio_status",
  },
];

export const investodayOfficialToolNames: Map<string, string> = new Map<string, string>(
  officialTools.map((tool) => [tool.name, tool.toolName]),
);

export const investodayOfficialActions: ActionDefinition[] = officialTools.map((tool) =>
  defineProviderAction("investoday_mcp", {
    name: tool.name,
    operationType: tool.operationType,

    description: tool.description,
    requiredScopes: [],
    inputSchema: tool.inputSchema,
    outputSchema: s.object(
      "The result returned by the Investoday MCP tool.",
      {
        result: s.unknown(
          "Structured financial data or the original MCP content envelope, including any upstream pagination metadata.",
        ),
      },
      { optional: [] },
    ),
  }),
);
