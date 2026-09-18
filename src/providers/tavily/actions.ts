import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tavily";

const usageSchema = s.looseObject("Credit usage details returned by Tavily.", {
  credits: s.number("The number of API credits consumed by the request."),
});
const imageSchema = s.looseObject("An image item returned by Tavily.", {
  url: s.string("The image URL."),
  description: s.string("A short description for the image."),
});
const searchResultSchema = s.looseObject("A single Tavily search result.", {
  title: s.string("The source title."),
  url: s.string("The source URL."),
  content: s.string("The extracted snippet or summary for the source."),
  score: s.number("The relevance score of the source."),
  raw_content: s.nullableString("The cleaned page content when include_raw_content is enabled."),
  favicon: s.nullableString("The favicon URL for the result when include_favicon is enabled."),
  images: s.array("Images extracted from this result.", imageSchema),
  published_date: s.string("The published date for the result when Tavily can determine it."),
});
const extractResultSchema = s.looseObject("An extracted Tavily result item.", {
  url: s.string("The processed source URL."),
  raw_content: s.string("The extracted page content in the selected format."),
  images: s.array("Images extracted from the source.", imageSchema),
  favicon: s.string("The favicon URL for the source when include_favicon is enabled."),
});
const failedResultSchema = s.looseObject("A failed Tavily extraction result.", {
  url: s.string("The source URL that failed."),
  error: s.string("The failure reason returned by Tavily."),
});
const usageKeySchema = s.looseObject("Usage details for the specific API key.", {
  usage: s.number("The total usage for the API key."),
  limit: s.number("The usage limit for the API key."),
  search_usage: s.number("Search credits consumed by the API key."),
  extract_usage: s.number("Extract credits consumed by the API key."),
  crawl_usage: s.number("Crawl credits consumed by the API key."),
  map_usage: s.number("Map credits consumed by the API key."),
  research_usage: s.number("Research credits consumed by the API key."),
});
const usageAccountSchema = s.looseObject("Plan and usage information for the account.", {
  current_plan: s.string("The current account plan name."),
  plan_usage: s.number("The total plan usage for the account."),
  plan_limit: s.number("The plan limit for the account."),
  paygo_usage: s.number("The pay-as-you-go usage for the account."),
  paygo_limit: s.number("The pay-as-you-go limit for the account."),
});
const researchResultSchema = s.looseObject("A Tavily Research task response.", {
  request_id: s.nonEmptyString("A unique identifier for the research task."),
  status: s.stringEnum("The current research task status.", ["pending", "in_progress", "completed", "failed"]),
  input: s.string("The research task or question investigated."),
  model: s.stringEnum("The model used by the research agent.", ["mini", "pro", "auto"]),
  content: s.unknown("The final research report content."),
  sources: s.array("Sources used in the research.", s.looseObject("A source used in a Tavily Research result.")),
  response_time: s.number("The response time reported by Tavily."),
});
const publicUrl = (description: string): JsonSchema => s.url(description);
const stringList = (description: string, item: string): JsonSchema =>
  s.array(description, s.nonEmptyString(item), { minItems: 1 });
const urlList = (description: string): JsonSchema => s.array(description, publicUrl("A source URL."), { minItems: 1 });
const researchFileSchema = s.object(
  "A base64-encoded .txt, .md, or .json file attached to a Tavily Research request.",
  {
    name: s.nonEmptyString("The file name, including extension."),
    data: s.nonEmptyString("The base64-encoded file contents."),
    type: s.literal("base64", { description: "The encoded file content type." }),
  },
  { required: ["name", "data", "type"] },
);

export const tavilyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Execute a Tavily Search query and return ranked source results.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString("The search query to execute with Tavily."),
        search_depth: s.stringEnum("Controls the latency-versus-relevance tradeoff for Tavily Search.", [
          "advanced",
          "basic",
          "fast",
          "ultra-fast",
        ]),
        chunks_per_source: s.integer("The maximum number of chunks to return per source.", { minimum: 1, maximum: 3 }),
        max_results: s.integer("The maximum number of search results to return.", { minimum: 0, maximum: 20 }),
        topic: s.stringEnum("The search category used by Tavily.", ["general", "news", "finance"]),
        time_range: s.stringEnum("The date range shortcut used to filter results.", [
          "day",
          "week",
          "month",
          "year",
          "d",
          "w",
          "m",
          "y",
        ]),
        start_date: s.date("Only return results after this YYYY-MM-DD date."),
        end_date: s.date("Only return results before this YYYY-MM-DD date."),
        include_answer: s.union([
          s.boolean("Whether to include an answer."),
          s.stringEnum("The answer detail level.", ["basic", "advanced"]),
        ]),
        include_raw_content: s.union([
          s.boolean("Whether to include raw content."),
          s.stringEnum("The raw content format.", ["markdown", "text"]),
        ]),
        include_images: s.boolean("Whether to include top-level and per-result images."),
        include_image_descriptions: s.boolean("Whether to include descriptions for returned images."),
        include_favicon: s.boolean("Whether to include favicons for returned results."),
        include_domains: stringList(
          "Domains that Tavily should include in the search results.",
          "A domain name to include.",
        ),
        exclude_domains: stringList(
          "Domains that Tavily should exclude from the search results.",
          "A domain name to exclude.",
        ),
        country: s.string("A country name used to boost results for general searches."),
        auto_parameters: s.boolean("Whether Tavily should auto-configure search parameters."),
        exact_match: s.boolean("Whether Tavily should require quoted exact phrases to match exactly."),
        include_usage: s.boolean("Whether to include credit usage details in the response."),
      },
      ["query"],
      "The input payload for a Tavily Search request.",
    ),
    outputSchema: s.looseRequiredObject("The Tavily Search response payload.", {
      query: s.string("The search query that was executed."),
      results: s.array("The ranked search results returned by Tavily.", searchResultSchema),
      response_time: s.union([
        s.number("The total response time reported by Tavily."),
        s.string("The total response time reported by Tavily."),
      ]),
      request_id: s.string("A unique request identifier for Tavily support and debugging."),
      answer: s.string("A Tavily-generated answer for the query."),
      images: s.array("Query-related images returned by Tavily.", imageSchema),
      auto_parameters: s.looseObject("Auto-selected parameters returned by Tavily when enabled."),
      usage: usageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "extract",
    operationType: "read",
    description: "Extract structured page content from one or more URLs with Tavily.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        urls: urlList("The URLs that Tavily should extract content from."),
        query: s.string("An optional query used to rerank extracted chunks."),
        chunks_per_source: s.integer("The maximum number of chunks to return per source when query is provided.", {
          minimum: 1,
          maximum: 5,
        }),
        extract_depth: s.stringEnum("Controls whether Tavily uses basic or advanced extraction.", [
          "basic",
          "advanced",
        ]),
        include_images: s.boolean("Whether to include images found on each page."),
        include_favicon: s.boolean("Whether to include the favicon URL for each page."),
        format: s.stringEnum("The format of the extracted page content.", ["markdown", "text"]),
        timeout: s.number("The extraction timeout in seconds.", { minimum: 1, maximum: 60 }),
        include_usage: s.boolean("Whether to include credit usage details in the response."),
      },
      ["urls"],
      "The input payload for a Tavily Extract request.",
    ),
    outputSchema: s.looseRequiredObject("The Tavily Extract response payload.", {
      results: s.array("The successful extraction results returned by Tavily.", extractResultSchema),
      failed_results: s.array("URLs that Tavily could not extract successfully.", failedResultSchema),
      response_time: s.number("The total response time reported by Tavily."),
      request_id: s.string("A unique request identifier for Tavily support and debugging."),
      usage: usageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "map",
    operationType: "read",
    description: "Discover URLs from a website with Tavily Map.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        url: publicUrl("The root URL that Tavily should map."),
        instructions: s.string("Natural-language instructions that guide the mapping."),
        max_depth: s.integer("The maximum mapping depth.", { minimum: 1, maximum: 5 }),
        max_breadth: s.integer("The maximum number of links to follow per level.", { minimum: 1, maximum: 500 }),
        limit: s.positiveInteger("The maximum number of links Tavily should process."),
        select_paths: stringList(
          "Regex patterns used to include only matching URL paths.",
          "A path selection pattern.",
        ),
        select_domains: stringList(
          "Regex patterns used to include only matching domains.",
          "A domain selection pattern.",
        ),
        exclude_paths: stringList("Regex patterns used to exclude matching URL paths.", "A path exclusion pattern."),
        exclude_domains: stringList("Regex patterns used to exclude matching domains.", "A domain exclusion pattern."),
        allow_external: s.boolean("Whether external domain links can appear in the results."),
        timeout: s.number("The mapping timeout in seconds.", { minimum: 10, maximum: 150 }),
        include_usage: s.boolean("Whether to include credit usage details in the response."),
      },
      ["url"],
      "The input payload for a Tavily Map request.",
    ),
    outputSchema: s.looseRequiredObject("The Tavily Map response payload.", {
      base_url: s.string("The base URL that Tavily mapped."),
      results: s.stringArray("The URLs discovered during the mapping operation."),
      response_time: s.number("The total response time reported by Tavily."),
      request_id: s.string("A unique request identifier for Tavily support and debugging."),
      usage: usageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "crawl",
    operationType: "read",
    description: "Crawl a website and extract content from discovered pages with Tavily.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        url: publicUrl("The root URL that Tavily should crawl."),
        instructions: s.string("Natural-language instructions that guide the crawl."),
        max_depth: s.integer("The maximum crawl depth.", { minimum: 1, maximum: 5 }),
        max_breadth: s.integer("The maximum number of links to follow per crawl level.", { minimum: 1, maximum: 500 }),
        limit: s.positiveInteger("The maximum number of links Tavily should process."),
        select_paths: stringList(
          "Regex patterns used to include only matching URL paths.",
          "A path selection pattern.",
        ),
        select_domains: stringList(
          "Regex patterns used to include only matching domains.",
          "A domain selection pattern.",
        ),
        exclude_paths: stringList("Regex patterns used to exclude matching URL paths.", "A path exclusion pattern."),
        exclude_domains: stringList("Regex patterns used to exclude matching domains.", "A domain exclusion pattern."),
        allow_external: s.boolean("Whether external domain links can appear in the results."),
        include_images: s.boolean("Whether to include images in crawled results."),
        extract_depth: s.stringEnum("Controls whether Tavily uses basic or advanced extraction.", [
          "basic",
          "advanced",
        ]),
        format: s.stringEnum("The format of the extracted page content.", ["markdown", "text"]),
        include_favicon: s.boolean("Whether to include a favicon URL for each crawled result."),
        timeout: s.number("The crawl timeout in seconds.", { minimum: 10, maximum: 150 }),
        include_usage: s.boolean("Whether to include credit usage details in the response."),
      },
      ["url"],
      "The input payload for a Tavily Crawl request.",
    ),
    outputSchema: s.looseRequiredObject("The Tavily Crawl response payload.", {
      base_url: s.string("The base URL that Tavily crawled."),
      results: s.array("The extracted results returned by Tavily Crawl.", extractResultSchema),
      response_time: s.number("The total response time reported by Tavily."),
      request_id: s.string("A unique request identifier for Tavily support and debugging."),
      usage: usageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_research",
    operationType: "write",
    description: "Start an asynchronous Tavily Research task and return a request ID for polling.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        input: s.nonEmptyString("The research task or question to investigate."),
        model: s.stringEnum("Research model to use.", ["mini", "pro", "auto"]),
        stream: s.literal(false, { description: "Must be false or omitted. Tavily SSE streaming is not supported." }),
        output_schema: s.looseObject("JSON Schema for structured research output."),
        citation_format: s.stringEnum("The format for citations in the research report.", [
          "numbered",
          "mla",
          "apa",
          "chicago",
        ]),
        include_domains: s.array("Soft source preference domains.", s.nonEmptyString("A domain to prioritize."), {
          maxItems: 20,
        }),
        exclude_domains: s.array("Hard source blocklist domains.", s.nonEmptyString("A domain to exclude."), {
          maxItems: 20,
        }),
        output_length: s.stringEnum("The target research response length.", ["short", "standard", "long"]),
        files: s.array("Up to 5 .txt, .md, or .json files to use as additional research sources.", researchFileSchema, {
          minItems: 1,
          maxItems: 5,
        }),
      },
      ["input"],
      "The input payload for creating a Tavily Research task.",
    ),
    outputSchema: researchResultSchema,
    asyncLifecycle: {
      startActionId: "tavily.create_research",
      statusActionId: "tavily.get_research",
    },
  }),
  defineProviderAction(service, {
    name: "get_research",
    operationType: "read",
    description: "Get the current status and result for a Tavily Research task.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { request_id: s.nonEmptyString("The unique identifier of the research task.") },
      ["request_id"],
      "The input payload for retrieving a Tavily Research task.",
    ),
    outputSchema: researchResultSchema,
    asyncLifecycle: {
      startActionId: "tavily.create_research",
      statusActionId: "tavily.get_research",
    },
  }),
  defineProviderAction(service, {
    name: "get_usage",
    operationType: "read",
    description: "Get API key and account usage details from Tavily.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for a Tavily usage request."),
    outputSchema: s.actionOutput(
      {
        key: usageKeySchema,
        account: usageAccountSchema,
      },
      "The Tavily usage response payload.",
    ),
  }),
];
