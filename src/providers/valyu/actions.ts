import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "valyu";

const rawObjectSchema = s.looseObject("A JSON object passed through from Valyu.");

const searchResultSchema = s.object(
  "One search result returned by Valyu.",
  {
    id: s.string("The unique identifier for this result."),
    title: s.string("The title of the source document."),
    url: s.url("The URL of the source document."),
    content: s.anyOf("The extracted result content.", [
      s.string("Extracted text content in markdown format."),
      s.array("Structured result content rows.", rawObjectSchema),
      rawObjectSchema,
    ]),
    description: s.nullableString("A short description or meta summary of the result."),
    source: s.string("The Valyu source identifier for the result."),
    price: s.number("The cost in USD for this individual result."),
    length: s.integer("The character count of the content field."),
    image_url: s.nullable(
      s.anyOf("Image URLs associated with this result.", [
        s.url("One image URL."),
        s.record("Image URLs keyed by index.", s.url("One image URL.")),
      ]),
    ),
    relevance_score: s.number("The relevance score from reranking.", { minimum: 0, maximum: 1 }),
    data_type: s.stringEnum("The format of the content field.", ["unstructured", "structured"]),
    source_type: s.stringEnum("The classification of the source.", [
      "website",
      "forum",
      "paper",
      "data",
      "report",
      "health_data",
      "clinical_trial",
      "drug_label",
      "grants",
    ]),
    publication_date: s.string("The publication date in YYYY-MM-DD format, if known."),
    doi: s.string("The DOI identifier for academic results."),
    citation: s.string("Citation text for academic results."),
    citation_count: s.integer("The citation count for academic results."),
    authors: s.array("Author names for academic results.", s.string("One author name.")),
    references: s.string("References text for academic results."),
    metadata: rawObjectSchema,
    raw: rawObjectSchema,
  },
  {
    optional: [
      "description",
      "image_url",
      "relevance_score",
      "publication_date",
      "doi",
      "citation",
      "citation_count",
      "authors",
      "references",
      "metadata",
    ],
  },
);

const sourceCountsSchema = s.object(
  "The count of search results broken down by source type.",
  {
    web: s.integer("The number of web results."),
    proprietary: s.integer("The number of proprietary results."),
  },
  { optional: ["web", "proprietary"], additionalProperties: s.integer("A source result count.") },
);

export const valyuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    description: "Search web, academic, financial, and proprietary data sources with Valyu.",
    inputSchema: s.object(
      "The input payload for a Valyu Search request.",
      {
        query: s.nonEmptyString("The search query to execute."),
        max_num_results: s.integer("The maximum number of search results to return.", { minimum: 1, maximum: 20 }),
        search_type: s.stringEnum("Controls which data sources are searched.", ["all", "web", "proprietary", "news"]),
        max_price: s.number("The maximum budget in CPM for this request.", { exclusiveMinimum: 0 }),
        relevance_threshold: s.number("The minimum relevance score for returned results.", { minimum: 0, maximum: 1 }),
        included_sources: s.array(
          "Sources to include in the search.",
          s.string("A domain, URL, datasource identifier, preset name, web keyword, or collection reference."),
          { minItems: 1 },
        ),
        excluded_sources: s.array(
          "Sources to exclude from the search.",
          s.string("A domain, URL, or datasource identifier to exclude."),
          {
            minItems: 1,
          },
        ),
        source_biases: s.nullable(
          s.record(
            "Bias values by domain or URL path.",
            s.integer("A bias value from -5 for strong demotion to 5 for strong boost.", { minimum: -5, maximum: 5 }),
          ),
        ),
        instructions: s.string("Natural language instructions to help rank results.", { maxLength: 500 }),
        is_tool_call: s.boolean("Whether this request originates from an AI tool call."),
        response_length: s.anyOf("The maximum content length per result.", [
          s.stringEnum("A named response length.", ["short", "medium", "large", "max"]),
          s.integer("A custom positive character limit.", { minimum: 1 }),
        ]),
        start_date: s.date("Only return results published on or after this date."),
        end_date: s.date("Only return results published on or before this date."),
        country_code: s.stringEnum("The ISO 3166-1 alpha-2 country code for geo-targeted web results.", [
          "ALL",
          "AR",
          "AU",
          "AT",
          "BE",
          "BR",
          "CA",
          "CL",
          "DK",
          "FI",
          "FR",
          "DE",
          "HK",
          "IN",
          "ID",
          "IT",
          "JP",
          "KR",
          "MY",
          "MX",
          "NL",
          "NZ",
          "NO",
          "CN",
          "PL",
          "PT",
          "PH",
          "RU",
          "SA",
          "ZA",
          "ES",
          "SE",
          "CH",
          "TW",
          "TR",
          "GB",
          "US",
        ]),
        fast_mode: s.boolean("Whether to bypass LLM query rewriting and reranking for lower latency."),
        url_only: s.boolean("Whether to return only URLs without full content extraction."),
      },
      {
        required: ["query"],
        optional: [
          "max_num_results",
          "search_type",
          "max_price",
          "relevance_threshold",
          "included_sources",
          "excluded_sources",
          "source_biases",
          "instructions",
          "is_tool_call",
          "response_length",
          "start_date",
          "end_date",
          "country_code",
          "fast_mode",
          "url_only",
        ],
      },
    ),
    outputSchema: s.object(
      "The Valyu Search response.",
      {
        success: s.boolean("Whether the search completed successfully."),
        error: s.nullableString("An error or warning message returned by Valyu."),
        tx_id: s.string("The Valyu transaction ID for tracking and support."),
        query: s.string("The original query as submitted."),
        results: s.array("Search results ordered by relevance.", searchResultSchema),
        results_by_source: sourceCountsSchema,
        total_deduction_dollars: s.number("The total cost charged for this search in USD."),
        total_characters: s.integer("The total number of characters across returned results."),
        warnings: s.array("Warning messages returned by Valyu.", s.string("One warning message.")),
        raw: rawObjectSchema,
      },
      { optional: ["warnings"] },
    ),
  }),
];
