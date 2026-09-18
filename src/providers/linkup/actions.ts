import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linkup";

export type LinkupActionName =
  | "get_credits_balance"
  | "search_results"
  | "search_answer"
  | "search_structured_data"
  | "fetch_webpage";

const isoDate = s.date("A calendar date in YYYY-MM-DD format.");
const depth = s.stringEnum(["deep", "standard", "fast"], {
  description: "The Linkup search depth to execute.",
});
const favicon = s.anyOf("The favicon URL, if available.", [
  s.url("The favicon URL."),
  s.literal("", { description: "An empty favicon string." }),
  { type: "null", description: "A null favicon value." },
]);
const source = s.object(
  "One source item returned by Linkup.",
  {
    name: s.string("The title or name of the source."),
    url: s.url("The source URL."),
    snippet: s.string("The source snippet used in the answer."),
    favicon,
  },
  { required: ["name", "url", "snippet"], optional: ["favicon"] },
);
const textSearchResult = s.object(
  "One text search result returned by Linkup.",
  {
    name: s.string("The result title."),
    url: s.url("The canonical result URL."),
    content: s.string("The extracted text content for the result."),
    favicon,
    type: s.literal("text", { description: "The result type." }),
  },
  { required: ["name", "url", "content", "type"], optional: ["favicon"] },
);
const imageSearchResult = s.object(
  "One image search result returned by Linkup.",
  {
    name: s.string("The image result title."),
    url: s.url("The image result URL."),
    type: s.literal("image", { description: "The result type." }),
  },
  { required: ["name", "url", "type"] },
);
const searchResult = s.anyOf("One search result returned by Linkup.", [textSearchResult, imageSearchResult]);
const fetchImage = s.object(
  "One image returned by the Linkup fetch endpoint.",
  {
    url: s.url("The image URL."),
    alt: s.string("The alt text of the image."),
  },
  { required: ["url"], optional: ["alt"] },
);

function searchInput(
  description: string,
  properties: Record<string, JsonSchema> = {},
  required: string[] = ["q", "depth"],
): JsonSchema {
  return s.object(
    description,
    {
      q: s.string({ minLength: 1, description: "The natural-language query sent to Linkup." }),
      depth,
      maxResults: s.integer({ minimum: 1, description: "The maximum number of search results to return." }),
      includeImages: s.boolean("Whether Linkup should include images in the search results."),
      includeDomains: s.array(s.string({ minLength: 1, description: "One domain to include in the search." }), {
        maxItems: 100,
        description: "Only include results from these domains.",
      }),
      excludeDomains: s.array(s.string({ minLength: 1, description: "One domain to exclude in the search." }), {
        description: "Exclude results from these domains.",
      }),
      fromDate: isoDate,
      toDate: isoDate,
      ...properties,
    },
    {
      required,
      optional: [
        "maxResults",
        "includeImages",
        "includeDomains",
        "excludeDomains",
        "fromDate",
        "toDate",
        ...Object.keys(properties).filter((key) => !required.includes(key)),
      ],
    },
  );
}

function output(properties: Record<string, JsonSchema>, description: string, required = Object.keys(properties)) {
  return s.object(properties, { required, description });
}

function action(input: {
  name: LinkupActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, input);
}

export const linkupActions: ActionDefinition[] = [
  action({
    name: "get_credits_balance",
    operationType: "read",
    description: "Get the current Linkup credits balance for the connected API key.",
    inputSchema: s.object({}, { description: "The input payload for retrieving the Linkup credits balance." }),
    outputSchema: output(
      {
        balance: s.number("The remaining Linkup credits balance."),
      },
      "The Linkup credits balance payload.",
    ),
  }),
  action({
    name: "search_results",
    operationType: "read",
    description: "Search the web with Linkup and return raw grounded search results.",
    inputSchema: searchInput("The shared input payload for Linkup search actions."),
    outputSchema: output(
      {
        results: s.array(searchResult, { description: "The ordered search results returned by Linkup." }),
      },
      "The Linkup search-results payload.",
    ),
  }),
  action({
    name: "search_answer",
    operationType: "read",
    description: "Search the web with Linkup and return a sourced natural-language answer.",
    inputSchema: searchInput("The input payload for the Linkup sourced-answer search action.", {
      includeInlineCitations: s.boolean("Whether Linkup should include inline citations in the answer."),
    }),
    outputSchema: output(
      {
        answer: s.string("The answer returned by Linkup."),
        sources: s.array(source, { description: "The sources cited in the answer." }),
      },
      "The Linkup sourced-answer payload.",
    ),
  }),
  action({
    name: "search_structured_data",
    operationType: "read",
    description: "Search the web with Linkup and return data normalized to the provided JSON schema.",
    inputSchema: searchInput(
      "The input payload for the Linkup structured-data search action.",
      {
        structuredOutputSchema: s.string({
          minLength: 1,
          description: "The JSON schema string that defines the structured response shape.",
        }),
        includeSources: s.boolean("Whether Linkup should include sources alongside the structured data."),
      },
      ["q", "depth", "structuredOutputSchema"],
    ),
    outputSchema: output(
      {
        data: s.looseObject({}, { description: "The structured data returned by Linkup." }),
        sources: s.array(searchResult, {
          description: "The sources returned alongside the structured data.",
        }),
      },
      "The Linkup structured-data payload.",
      ["data"],
    ),
  }),
  action({
    name: "fetch_webpage",
    operationType: "read",
    description: "Fetch one webpage with Linkup and return markdown plus optional raw HTML and images.",
    inputSchema: s.object(
      "The input payload for the Linkup fetch action.",
      {
        url: s.url("The webpage URL to fetch."),
        includeRawHtml: s.boolean("Whether Linkup should include the raw HTML in the response."),
        extractImages: s.boolean("Whether Linkup should include extracted images in the response."),
        renderJs: s.boolean("Whether Linkup should render the webpage JavaScript before extraction."),
      },
      { required: ["url"], optional: ["includeRawHtml", "extractImages", "renderJs"] },
    ),
    outputSchema: output(
      {
        markdown: s.string("The clean markdown extracted from the webpage."),
        rawHtml: s.string("The raw HTML returned by Linkup."),
        images: s.array(fetchImage, { description: "The images extracted from the webpage." }),
      },
      "The Linkup fetch payload.",
      ["markdown"],
    ),
  }),
];
