import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "parsera";

const parseraAttributeSchema = s.looseRequiredObject(
  "A structured attribute Parsera should extract from the source.",
  {
    name: s.string("The output field name for the extracted attribute.", { minLength: 1 }),
    description: s.string("Natural-language guidance for extracting this attribute.", {
      minLength: 1,
    }),
    type: s.string("Optional Parsera output type for this attribute."),
  },
  { optional: ["type"] },
);

const parseraCookieSchema = s.looseRequiredObject(
  "A browser cookie forwarded to Parsera during page extraction.",
  {
    name: s.string("The cookie name.", { minLength: 1 }),
    value: s.string("The cookie value."),
    domain: s.string("The cookie domain."),
    path: s.string("The cookie path."),
  },
  { optional: ["domain", "path"] },
);

const promptOrAttributesConstraint: JsonSchema = {
  anyOf: [{ required: ["prompt"] }, { required: ["attributes"] }],
};

const parseraExtractInputSchema = {
  ...s.object(
    "Input parameters for extracting structured data from a URL with Parsera.",
    {
      url: s.url("The webpage URL to extract structured data from."),
      prompt: s.string("Natural-language extraction instructions.", { minLength: 1 }),
      attributes: s.array(
        "The structured attributes Parsera should extract from the webpage.",
        parseraAttributeSchema,
        { minItems: 1 },
      ),
      proxyCountry: s.string("Parsera proxy country to use for the webpage request.", {
        minLength: 1,
      }),
      cookies: s.array("Cookies to use while Parsera fetches the webpage.", parseraCookieSchema),
    },
    { optional: ["prompt", "attributes", "proxyCountry", "cookies"] },
  ),
  ...promptOrAttributesConstraint,
};

const parseraParseInputSchema = {
  ...s.object(
    "Input parameters for parsing structured data from raw HTML or text with Parsera.",
    {
      content: s.string("Raw HTML or text content to parse.", { minLength: 1 }),
      prompt: s.string("Natural-language parsing instructions.", { minLength: 1 }),
      attributes: s.array(
        "The structured attributes Parsera should extract from the supplied content.",
        parseraAttributeSchema,
        { minItems: 1 },
      ),
      mode: s.string("Parsera extractor mode to use for parsing.", { minLength: 1 }),
    },
    { optional: ["prompt", "attributes", "mode"] },
  ),
  ...promptOrAttributesConstraint,
};

const parseraExtractMarkdownInputSchema = s.object(
  "Input parameters for extracting clean Markdown from a URL with Parsera.",
  {
    url: s.url("The webpage URL to convert into clean Markdown."),
    proxyCountry: s.string("Parsera proxy country to use for the webpage request.", {
      minLength: 1,
    }),
    cookies: s.array("Cookies to use while Parsera fetches the webpage.", parseraCookieSchema),
  },
  { optional: ["proxyCountry", "cookies"] },
);

const parseraExtractionOutputSchema = s.looseObject("The structured extraction payload returned by Parsera.");

const parseraMarkdownOutputSchema = s.object("The normalized Markdown extraction result returned by Parsera.", {
  markdown: s.nullable(s.string("The Markdown content extracted by Parsera.")),
  raw: s.unknown("The original Parsera response payload."),
});

const parseraListOutputSchema = s.looseObject("The list payload returned by Parsera.");

export const parseraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "extract",
    description: "Extract structured data from a webpage URL with Parsera using a prompt, attributes, or both.",
    requiredScopes: [],
    inputSchema: parseraExtractInputSchema,
    outputSchema: parseraExtractionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "parse",
    description: "Parse structured attributes from raw HTML or text content already available to the caller.",
    requiredScopes: [],
    inputSchema: parseraParseInputSchema,
    outputSchema: parseraExtractionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_markdown",
    description: "Extract clean Markdown from a webpage URL with Parsera.",
    requiredScopes: [],
    inputSchema: parseraExtractMarkdownInputSchema,
    outputSchema: parseraMarkdownOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_llm_specs",
    description: "List the LLM specifications available to Parsera requests.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Parsera LLM specs.", {}),
    outputSchema: parseraListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_proxy_countries",
    description: "List proxy countries available to Parsera extraction requests.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Parsera proxy countries.", {}),
    outputSchema: parseraListOutputSchema,
  }),
];
