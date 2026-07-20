import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "anysearch";

const restDomains = [
  "general",
  "code",
  "tech",
  "fashion",
  "travel",
  "home",
  "ecommerce",
  "gaming",
  "film",
  "music",
  "finance",
  "academic",
  "legal",
  "business",
  "ip",
  "security",
  "education",
  "health",
  "religion",
  "geo",
  "environment",
  "energy",
];

const mcpDomains = [
  "general",
  "resource",
  "social_media",
  "finance",
  "academic",
  "legal",
  "health",
  "business",
  "security",
  "ip",
  "code",
  "energy",
  "environment",
  "agriculture",
  "travel",
  "film",
  "gaming",
];

const searchResultSchema = s.looseRequiredObject("One source returned by AnySearch.", {
  title: s.string("The source title."),
  url: s.url("The original source URL."),
  snippet: s.string("A short summary of the source."),
  content: s.string("The cleaned source content."),
});

const searchMetadataSchema = s.looseRequiredObject("Metadata describing the AnySearch request.", {
  total_results: s.nonNegativeInteger("The number of results returned by AnySearch."),
  search_time_ms: s.nonNegativeInteger("The end-to-end search latency reported by AnySearch in milliseconds."),
});

const mcpSearchItemSchema = s.object(
  "One query in an AnySearch batch search request.",
  {
    query: s.nonEmptyString("The search query with one intent."),
    domain: s.stringEnum("The vertical domain selected after calling get_sub_domains.", mcpDomains),
    sub_domain: s.nonEmptyString("The sub-domain routing key returned by get_sub_domains."),
    sub_domain_params: s.record(
      "Structured parameters returned for the selected sub-domain.",
      s.unknown("A sub-domain-specific parameter value."),
    ),
    max_results: s.integer("The maximum number of results for this query.", {
      minimum: 1,
      maximum: 10,
    }),
  },
  { optional: ["domain", "sub_domain", "sub_domain_params", "max_results"] },
);

export const anySearchActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    description: "Search AnySearch's automatically routed data sources and return structured source results.",
    inputSchema: s.object(
      "The input payload for an AnySearch unified REST search request.",
      {
        query: s.nonEmptyString("The search query to execute."),
        max_results: s.integer("The maximum number of search results to return.", {
          minimum: 1,
          maximum: 100,
        }),
        domain: s.stringEnum("The top-level domain used to route the search.", restDomains),
        tag: s.nonEmptyString(
          "A sub-domain capability tag, such as code.doc. Use a sub-domain returned by get_sub_domains when possible.",
        ),
        content_types: s.stringArray("Content types to include, such as web, news, or doc.", {
          minItems: 1,
          itemDescription: "One AnySearch content type.",
        }),
        zone: s.stringEnum("The regional search zone used by AnySearch.", ["cn", "intl"]),
        language: s.nonEmptyString("The preferred result language, such as zh-CN or en."),
        params: s.record(
          "Parameters required by the selected tag. Use values returned by get_sub_domains when possible.",
          s.unknown("A tag-specific parameter value."),
        ),
      },
      { optional: ["max_results", "domain", "tag", "content_types", "zone", "language", "params"] },
    ),
    outputSchema: s.looseRequiredObject("The normalized AnySearch search response.", {
      results: s.array("The structured sources returned by AnySearch.", searchResultSchema),
      metadata: searchMetadataSchema,
      request_id: s.nonEmptyString("The AnySearch request identifier used for tracing."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sub_domains",
    description:
      "Discover AnySearch vertical sub-domains and their required parameters before running a specialized search.",
    inputSchema: s.oneOf(
      [
        s.object("Discover capabilities for one AnySearch domain.", {
          domain: s.stringEnum("The domain whose sub-domains should be returned.", mcpDomains),
        }),
        s.object("Discover capabilities for multiple AnySearch domains.", {
          domains: s.array(
            "The domains whose sub-domains should be returned.",
            s.stringEnum("One AnySearch vertical domain.", mcpDomains),
            { minItems: 1, maxItems: 5 },
          ),
        }),
      ],
      { description: "One domain or a batch of up to five domains to discover." },
    ),
    outputSchema: s.object("The current AnySearch vertical capability directory.", {
      content: s.nonEmptyString("Markdown describing matching sub-domains and their parameters."),
      request_id: s.nonEmptyString("The AnySearch request identifier used for tracing."),
    }),
  }),
  defineProviderAction(service, {
    name: "batch_search",
    description:
      "Run up to five independent general or vertical AnySearch queries in parallel and return agent-ready Markdown.",
    inputSchema: s.object("The parallel AnySearch query batch.", {
      queries: s.array("The search queries to execute in parallel.", mcpSearchItemSchema, {
        minItems: 1,
        maxItems: 5,
      }),
    }),
    outputSchema: s.object("The combined AnySearch batch search result.", {
      content: s.nonEmptyString("Markdown containing the result of every query in the batch."),
      request_ids: s.stringArray("The AnySearch request identifiers associated with the batch.", {
        minItems: 1,
        maxItems: 5,
        itemDescription: "One AnySearch request identifier.",
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "extract",
    description: "Fetch an HTML page through AnySearch and return its cleaned content as Markdown.",
    inputSchema: s.object("The page to extract through AnySearch.", {
      url: s.url("The HTTP or HTTPS page URL to fetch and convert to Markdown."),
    }),
    outputSchema: s.object("The cleaned page content returned by AnySearch.", {
      content: s.nonEmptyString("The extracted page content as Markdown."),
      request_id: s.nonEmptyString("The AnySearch request identifier used for tracing."),
    }),
  }),
];
