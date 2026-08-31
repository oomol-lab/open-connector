import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sif" as const;

const countrySchema = s.nonEmptyString(
  "The Amazon marketplace code, such as US, UK, DE, or JP. Sif defaults to US when omitted.",
);
const keywordSchema = s.nonEmptyString("A keyword to analyze.");
const keywordRootSchema = s.nonEmptyString(
  "A keyword root. Sif also analyzes modifier variants that start with this value.",
);
const asinSchema = s.nonEmptyString("An Amazon Standard Identification Number (ASIN).");
const granularitySchema = s.stringEnum("The time granularity. Sif defaults to week when omitted.", ["week", "month"]);
const sifToolResultSchema = s.requiredObject("The normalized result returned by the Sif MCP tool.", {
  result: s.unknown(
    "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
  ),
});

function defineSifToolAction<const TName extends string>(input: {
  name: TName;
  description: string;
  inputSchema: JsonSchema;
  followUpActions?: string[];
}) {
  return defineProviderAction(service, {
    name: input.name,
    description: input.description,
    followUpActions: input.followUpActions,
    inputSchema: input.inputSchema,
    outputSchema: sifToolResultSchema,
  });
}

const sifToolSchema = s.requiredObject("A tool currently exposed by the connected Sif MCP account.", {
  name: s.nonEmptyString("The exact Sif MCP tool name to pass to call_tool."),
  inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Sif MCP."),
});

const sifMarketActions: ActionDefinition[] = [
  defineSifToolAction({
    name: "market_get_keyword_history",
    description:
      "Get raw historical ABA search volume, rank, and Top-3 click and conversion concentration for up to 10 keywords. Costs 1 Sif point.",
    followUpActions: ["sif.market_get_keyword_root_trend", "sif.market_screen_keyword_opportunities"],
    inputSchema: s.object(
      "Parameters for retrieving Sif keyword history.",
      {
        keywords: s.array("One to ten keywords to compare.", keywordSchema, {
          minItems: 1,
          maxItems: 10,
        }),
        country: countrySchema,
        granularity: granularitySchema,
      },
      { optional: ["country", "granularity"] },
    ),
  }),
  defineSifToolAction({
    name: "market_get_keyword_demand",
    description: "Diagnose demand lifecycle and seasonal timing for up to 20 keywords. Costs 2 Sif points.",
    followUpActions: ["sif.market_get_keyword_competition"],
    inputSchema: s.object(
      "Parameters for diagnosing keyword demand.",
      {
        keywords: s.array("One to twenty keywords to analyze.", keywordSchema, {
          minItems: 1,
          maxItems: 20,
        }),
        country: countrySchema,
      },
      { optional: ["country"] },
    ),
  }),
  defineSifToolAction({
    name: "market_get_keyword_root_trend",
    description:
      "Compare exact-keyword demand with aggregate keyword-root demand to assess market size and demand concentration. Costs 3 Sif points.",
    followUpActions: ["sif.market_screen_keyword_opportunities"],
    inputSchema: s.object(
      "Parameters for comparing exact-keyword and keyword-root demand.",
      {
        keyword: keywordSchema,
        country: countrySchema,
        granularity: granularitySchema,
      },
      { optional: ["country", "granularity"] },
    ),
  }),
  defineSifToolAction({
    name: "market_get_keyword_competition",
    description:
      "Analyze a keyword's traffic-share leaders, ABA Top-3 concentration, market accessibility, and optional ASIN competitive position. Costs 2 Sif points.",
    inputSchema: s.object(
      "Parameters for analyzing keyword competition.",
      {
        keyword: keywordSchema,
        asin: asinSchema,
        country: countrySchema,
        time_type: s.stringEnum("The analysis time type.", ["all", "week", "month"]),
        time_value: s.nonEmptyString("The Sunday date for week analysis or first-of-month date for month analysis."),
        rank_evolution: s.boolean("Whether to include rank-evolution data."),
      },
      { optional: ["asin", "country", "time_type", "time_value", "rank_evolution"] },
    ),
  }),
  defineSifToolAction({
    name: "market_get_keyword_root_competitors",
    description:
      "Discover the leading ASIN competitors across a keyword root using ABA buyer click behavior. Costs 2 Sif points.",
    followUpActions: ["sif.market_discover_competitors"],
    inputSchema: s.object(
      "Parameters for discovering keyword-root competitors.",
      {
        keyword_root: keywordRootSchema,
        country: countrySchema,
        topN: s.integer("The maximum number of competitors to return, from 1 to 50.", {
          minimum: 1,
          maximum: 50,
        }),
      },
      { optional: ["country", "topN"] },
    ),
  }),
  defineSifToolAction({
    name: "market_screen_keyword_opportunities",
    description:
      "Rank keyword-root variants by demand and click-concentration opportunity signals. Costs 3 Sif points.",
    followUpActions: ["sif.market_get_keyword_competition"],
    inputSchema: s.object(
      "Parameters for screening keyword opportunities.",
      {
        keyword_root: keywordRootSchema,
        country: countrySchema,
        topN: s.integer("The maximum number of opportunity keywords to return, from 1 to 200.", {
          minimum: 1,
          maximum: 200,
        }),
      },
      { optional: ["country", "topN"] },
    ),
  }),
  defineSifToolAction({
    name: "market_discover_competitors",
    description:
      "Analyze and filter a keyword's Top-100 competitor pool by price, review threshold, sales, and competitive posture. Costs 3 Sif points.",
    followUpActions: ["sif.market_get_asin_profile", "sif.market_get_asin_aba_footprint"],
    inputSchema: s.object(
      "Parameters for deep competitor discovery.",
      {
        keyword: keywordSchema,
        country: countrySchema,
        my_asin: s.nonEmptyString(
          "The caller's ASIN. Sif excludes it and narrows results to its competing price range.",
        ),
        max_results: s.integer("The maximum number of competitors to return, from 1 to 10.", {
          minimum: 1,
          maximum: 10,
        }),
        price_min: s.number("The minimum competitor price used to narrow the result."),
        price_max: s.number("The maximum competitor price used to narrow the result."),
        max_reviews: s.nonNegativeInteger("The maximum competitor review count used to narrow the result."),
        posture_filter: s.stringEnum("The competitive posture label used to narrow the result.", [
          "自然权威型",
          "广告依赖型",
          "品牌型",
          "曝光高销量低型",
          "混合型",
        ]),
      },
      {
        optional: ["country", "my_asin", "max_results", "price_min", "price_max", "max_reviews", "posture_filter"],
      },
    ),
  }),
  defineSifToolAction({
    name: "market_get_asin_profile",
    description:
      "Get product-positioning profiles such as price, rating, reviews, BSR, brand, listing age, variants, and dimensions for up to 20 ASINs. Costs 2 Sif points per input ASIN.",
    followUpActions: ["sif.market_get_asin_keyword_signals", "sif.market_get_asin_aba_footprint"],
    inputSchema: s.object(
      "Parameters for retrieving ASIN product profiles.",
      {
        asins: s.array("One to twenty ASINs, including parent ASINs.", asinSchema, {
          minItems: 1,
          maxItems: 20,
        }),
        country: countrySchema,
      },
      { optional: ["country"] },
    ),
  }),
  defineSifToolAction({
    name: "market_get_asin_keyword_signals",
    description:
      "Analyze an ASIN's keyword traffic contribution, organic and paid dependence, rank stability, and health signals. Costs 3 Sif points.",
    followUpActions: ["sif.market_get_keyword_demand", "sif.market_get_keyword_competition"],
    inputSchema: s.object(
      "Parameters for analyzing ASIN keyword signals.",
      {
        asin: asinSchema,
        country: countrySchema,
        listingSearch: s.boolean("Whether to use Sif's listing-search scope."),
        time_type: s.stringEnum("The analysis time type.", ["lately", "week", "month"]),
        time_value: s.nonEmptyString(
          "The recent-day count, Sunday week date, or first-of-month date matching time_type.",
        ),
        topN: s.integer("The maximum number of keywords to return, from 1 to 300.", {
          minimum: 1,
          maximum: 300,
        }),
      },
      { optional: ["country", "listingSearch", "time_type", "time_value", "topN"] },
    ),
  }),
  defineSifToolAction({
    name: "market_get_asin_aba_footprint",
    description: "Reverse-map an ASIN to search terms where it occupies an ABA Top-3 position. Costs 2 Sif points.",
    inputSchema: s.object(
      "Parameters for retrieving an ASIN's ABA Top-3 footprint.",
      {
        asin: asinSchema,
        country: countrySchema,
        topN: s.integer("The maximum number of keyword records to retrieve, from 1 to 1000.", {
          minimum: 1,
          maximum: 1000,
        }),
      },
      { optional: ["country", "topN"] },
    ),
  }),
];

export const sifActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    description:
      "Discover the current Sif Amazon analysis tools and their live input schemas before choosing a tool to call.",
    followUpActions: ["sif.call_tool"],
    inputSchema: s.requiredObject("No input is required.", {}),
    outputSchema: s.requiredObject("The current Sif MCP business tool catalog.", {
      tools: s.array("Business tools currently exposed to the connected Sif account.", sifToolSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    description:
      "Call a current Sif MCP Amazon analysis tool with JSON arguments after discovering its live input schema.",
    followUpActions: ["sif.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current Sif MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: sifToolResultSchema,
  }),
  ...sifMarketActions,
];
