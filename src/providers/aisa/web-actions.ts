import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const searchMode = s.stringEnum("Retrieval mode; deep modes may take longer to complete.", [
  "auto",
  "fast",
  "instant",
  "deep-lite",
  "deep",
  "deep-reasoning",
]);
const stream = s.literal(false, {
  description: "Streaming is not supported by this JSON action; must be false.",
});
const text = s.boolean("Return the full page text; defaults to true for get_exa_contents.");
const highlights = s.boolean("Return highlighted relevant snippets.");
const summary = s.boolean("Return an AI-generated summary of the page.");
const outputSchema = s.looseObject("JSON Schema for a structured output.");
const urls = s.stringArray("The URLs to retrieve.", {
  minItems: 1,
  itemDescription: "A page URL.",
});
const exaPage = s.looseObject("An Exa page, including additional upstream content fields.", {
  id: s.string("The Exa result identifier, normally the page URL."),
  url: s.string("The page URL."),
  title: s.string("The page title."),
  author: s.string("The page author."),
  publishedDate: s.string("The publication date reported by the source."),
  text: s.string("The retrieved page text."),
  highlights: s.stringArray("Relevant snippets from the page.", {
    itemDescription: "A relevant snippet.",
  }),
  summary: s.string("The generated page summary."),
});
const exaCommon = {
  requestId: s.string("The Exa request identifier."),
  costDollars: s.unknown("Informational Exa cost; not the AIsa customer charge."),
};
const format = s.stringEnum("The extracted content format.", ["markdown", "text"]);
const extractDepth = s.stringEnum("Extraction depth; advanced may take longer and cost more.", ["basic", "advanced"]);
const chunksPerSource = s.integer("Maximum relevant chunks per source when an intent is provided.", {
  minimum: 1,
  maximum: 5,
});
const includeImages = s.boolean("Include extracted image URLs.");
const includeFavicon = s.boolean("Include the page favicon URL.");
const includeUsage = s.boolean("Include upstream credit usage; this is not the AIsa customer charge.");
const tavilyPage = s.looseObject("A Tavily page with extracted content and optional metadata.", {
  url: s.string("The page URL."),
  title: s.string("The page title."),
  raw_content: s.string("The extracted page content."),
  images: s.stringArray("Extracted image URLs.", { itemDescription: "An image URL." }),
  favicon: s.nullable(s.string("The page favicon URL.")),
});
const tavilyCommon = {
  request_id: s.string("The Tavily request identifier."),
  response_time: s.number("The upstream execution time in seconds."),
  results: s.array("Successfully retrieved pages.", tavilyPage),
  usage: s.looseObject("Upstream credit usage; not the AIsa customer charge.", {
    credits: s.integer("Upstream credits consumed."),
  }),
};
export const webActions: readonly ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "search_firecrawl",
    operationType: "read",
    requiredScopes: [],
    description: "Search the web through Firecrawl and return ranked URLs, titles, and snippets.",
    inputSchema: s.object(
      "A web search query and result limit.",
      {
        query: s.string("The web search query.", { minLength: 1, maxLength: 2000 }),
        limit: s.integer("The maximum number of results; upstream default 10.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      {
        optional: ["limit"],
      },
    ),
    outputSchema: s.looseObject("The Firecrawl web search result.", {
      success: s.boolean("Whether the search succeeded."),
      creditsUsed: s.integer("Supplier credits consumed by the request."),
      data: s.looseObject("The search result groups.", {
        web: s.array(
          "Ranked web search results.",
          s.looseObject("A web search result.", {
            title: s.string("The result title."),
            url: s.string("The result URL."),
            description: s.string("The result snippet."),
          }),
        ),
      }),
    }),
  }),
  defineProviderAction("aisa", {
    name: "search_exa",
    operationType: "read",
    requiredScopes: [],
    description:
      "Search the web semantically through Exa. Request contents to include page text, or retrieve selected URLs with get_exa_contents.",
    inputSchema: s.object(
      "Search the web through AIsa and Exa.",
      {
        query: s.string("The natural-language search query.", { minLength: 1 }),
        type: searchMode,
        stream,
        numResults: s.integer("Maximum search results to return.", { minimum: 1, maximum: 100 }),
        category: s.stringEnum("The kind of pages to prioritize.", [
          "company",
          "research paper",
          "news",
          "personal site",
          "financial report",
          "people",
        ]),
        includeDomains: s.stringArray("Only return results from these domains.", {
          itemDescription: "An included domain.",
        }),
        excludeDomains: s.stringArray("Exclude results from these domains.", {
          itemDescription: "An excluded domain.",
        }),
        startPublishedDate: s.string("Return pages published on or after this ISO 8601 timestamp.", {
          format: "date-time",
        }),
        endPublishedDate: s.string("Return pages published on or before this ISO 8601 timestamp.", {
          format: "date-time",
        }),
        contents: s.object(
          "Content to include alongside each search result.",
          { text, highlights, summary },
          { required: [] },
        ),
        outputSchema,
        systemPrompt: s.string("Instructions for generating the structured output."),
      },
      { required: ["query"] },
    ),
    outputSchema: s.looseObject("Exa search results with optional content and structured output.", {
      ...exaCommon,
      results: s.array("Ranked search results.", exaPage),
      output: s.unknown("Structured output generated when outputSchema is supplied."),
    }),
  }),
  defineProviderAction("aisa", {
    name: "get_exa_contents",
    operationType: "read",
    requiredScopes: [],
    description:
      "Retrieve text and metadata for known URLs through Exa. Inspect statuses for per-URL failures, including when other URLs succeed.",
    inputSchema: s.object(
      "Retrieve known pages through AIsa and Exa.",
      {
        urls,
        stream,
        text,
        highlights,
        summary,
        livecrawl: s.stringEnum("Freshness policy for fetching page content.", ["always", "fallback", "never"]),
        subpages: s.integer("Number of linked subpages to also retrieve."),
      },
      { required: ["urls"] },
    ),
    outputSchema: s.looseObject("Exa page contents and per-URL statuses.", {
      ...exaCommon,
      results: s.array("Retrieved page contents.", exaPage),
      statuses: s.array(
        "Per-URL retrieval statuses, including failures.",
        s.looseObject("An upstream retrieval status."),
      ),
    }),
  }),
  defineProviderAction("aisa", {
    name: "answer_exa",
    operationType: "read",
    requiredScopes: [],
    description: "Answer a question using Exa web retrieval with source citations and optional structured output.",
    inputSchema: s.object(
      "Ask a web-grounded question through AIsa and Exa.",
      {
        query: s.string("The question to answer.", { minLength: 1 }),
        type: searchMode,
        stream,
        text,
        outputSchema,
      },
      { required: ["query"] },
    ),
    outputSchema: s.looseObject("An Exa answer with supporting citations.", {
      ...exaCommon,
      answer: s.unknown("The answer as text or structured output."),
      citations: s.array("Sources supporting the answer.", exaPage),
    }),
  }),
  defineProviderAction("aisa", {
    name: "scrape_firecrawl",
    operationType: "read",
    requiredScopes: [],
    description:
      "Retrieve one HTTPS web page as Markdown through Firecrawl. The AIsa route supports basic proxy mode and excludes PDF URLs.",
    inputSchema: s.object(
      "Scrape a web page through AIsa and Firecrawl.",
      {
        url: s.string("The HTTPS page URL; PDF URLs are not supported.", { format: "uri" }),
      },
      {
        optional: [],
      },
    ),
    outputSchema: s.looseObject("The Firecrawl scrape response.", {
      success: s.boolean("Whether the upstream scrape succeeded."),
      creditsUsed: s.integer("Upstream credits consumed."),
      data: s.looseObject("The scraped page and its metadata.", {
        markdown: s.string("The page content in Markdown."),
        metadata: s.looseObject("Page metadata, including title, source URL and HTTP status."),
      }),
    }),
  }),
  defineProviderAction("aisa", {
    name: "map_firecrawl",
    operationType: "read",
    requiredScopes: [],
    description:
      "Discover website links through Firecrawl. Set limit to bound discovery and usage before retrieving individual pages.",
    inputSchema: s.object(
      "Discover website URLs through AIsa and Firecrawl.",
      {
        url: s.string("The HTTPS website URL.", { format: "uri" }),
        limit: s.integer("Maximum links to discover.", { minimum: 1, maximum: 100000 }),
      },
      {
        optional: [],
      },
    ),
    outputSchema: s.looseObject("Discovered Firecrawl website links.", {
      success: s.boolean("Whether upstream link discovery succeeded."),
      creditsUsed: s.integer("Upstream credits consumed."),
      links: s.array(
        "Discovered website links.",
        s.looseObject("A discovered link.", {
          url: s.string("The page URL."),
          title: s.string("The page title."),
        }),
      ),
    }),
  }),
  defineProviderAction("aisa", {
    name: "crawl_tavily",
    operationType: "read",
    requiredScopes: [],
    description:
      "Synchronously crawl a website through Tavily and return page content. Set limit, depth and breadth to bound the crawl; this does not create a background job.",
    inputSchema: s.object(
      "Crawl a website through AIsa and Tavily.",
      {
        url: s.string("The root website URL or domain.", { minLength: 1 }),
        limit: s.integer("Maximum pages to retrieve.", { minimum: 1 }),
        maxDepth: s.integer("Maximum crawl depth.", { minimum: 1, maximum: 5 }),
        maxBreadth: s.integer("Maximum links to follow at each level.", {
          minimum: 1,
          maximum: 500,
        }),
        instructions: s.string("Natural-language instructions guiding the crawl."),
        selectPaths: s.stringArray("Path patterns to include.", {
          itemDescription: "An included path regex.",
        }),
        excludePaths: s.stringArray("Path patterns to exclude.", {
          itemDescription: "An excluded path regex.",
        }),
        selectDomains: s.stringArray("Domain patterns to include.", {
          itemDescription: "An included domain regex.",
        }),
        excludeDomains: s.stringArray("Domain patterns to exclude.", {
          itemDescription: "An excluded domain regex.",
        }),
        allowExternal: s.boolean("Include external-domain links in the results."),
        chunksPerSource,
        extractDepth,
        format,
        includeFavicon,
        includeImages,
        includeUsage,
        timeout: s.number("Maximum upstream wait in seconds; defaults to 150.", {
          minimum: 10,
          maximum: 150,
        }),
      },
      { required: ["url", "limit"] },
    ),
    outputSchema: s.looseObject("The synchronously retrieved Tavily crawl results.", {
      ...tavilyCommon,
      base_url: s.string("The crawled website base URL."),
    }),
  }),
  defineProviderAction("aisa", {
    name: "extract_tavily",
    operationType: "read",
    requiredScopes: [],
    description:
      "Extract content from known URLs through Tavily. Inspect failed_results for per-URL failures; use crawl_tavily to discover and retrieve pages from a website.",
    inputSchema: s.object(
      "Extract known pages through AIsa and Tavily.",
      {
        urls: { ...urls, maxItems: 20 },
        query: s.string("User intent used to rank extracted content chunks."),
        chunksPerSource,
        extractDepth,
        format,
        includeFavicon,
        includeImages,
        includeUsage,
        timeout: s.number("Maximum upstream wait in seconds; default depends on extraction depth.", {
          minimum: 1,
          maximum: 60,
        }),
      },
      { required: ["urls"] },
    ),
    outputSchema: s.looseObject("Extracted Tavily pages and individual failures.", {
      ...tavilyCommon,
      failed_results: s.array(
        "URLs that could not be processed, with upstream error details when available.",
        s.unknown("An upstream URL failure entry."),
      ),
    }),
  }),
];
