import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "diffbot";

const rawObjectSchema = s.looseObject({}, { description: "A Diffbot object with provider-specific fields." });
const optionalFieldSchema = s.stringEnum(["links", "extlinks", "meta", "querystring", "breadcrumb", "quotes"], {
  description: "An optional Diffbot article field to request.",
});
const naturalLanguageFeatureSchema = s.stringEnum(
  ["entities", "sentiment", "summary", "facts", "openFacts", "records", "categories", "sentences", "language"],
  { description: "A Diffbot Natural Language feature to enable." },
);

const requestSchema = s.looseObject(
  {
    pageUrl: s.string("The target page URL echoed by Diffbot."),
    api: s.string("The Diffbot API family that handled the request."),
    version: s.integer("The Diffbot API version used for the request."),
  },
  { description: "The top-level request metadata returned by Diffbot." },
);

const articleSchema = s.looseObject(
  {
    type: s.string("The Diffbot object type for the extracted page."),
    title: s.string("The extracted article title."),
    pageUrl: s.string("The canonical page URL extracted from the article."),
    text: s.string("The extracted plain text content of the article."),
    html: s.string("The extracted article HTML content."),
    date: s.string("The article publication date returned by Diffbot."),
    humanLanguage: s.string("The language code returned by Diffbot."),
    images: s.array("The images returned by Diffbot for the article.", rawObjectSchema),
    tags: s.array("The topic tags returned by Diffbot.", rawObjectSchema),
    categories: s.array("The content categories returned by Diffbot.", rawObjectSchema),
    naturalLanguage: rawObjectSchema,
  },
  { description: "The normalized primary article extracted from the Diffbot article endpoint." },
);

export const diffbotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "extract_article",
    description: "Extract article content and metadata from a public URL using Diffbot Article API.",
    inputSchema: s.object(
      "The input payload for extracting one article from a public URL with Diffbot.",
      {
        url: s.url("The public article URL to extract with Diffbot."),
        fields: s.array("Optional Diffbot article fields to include in the response.", optionalFieldSchema, {
          minItems: 1,
        }),
        timeout: s.positiveInteger("The upstream page retrieval timeout in milliseconds."),
        renderDelay: s.nonNegativeInteger("The extra delay in milliseconds before extraction."),
        scroll: s.stringEnum(["fast", "slow"], {
          description: "The scrolling mode Diffbot should use to trigger lazy-loaded content.",
        }),
        proxy: s.string("The custom proxy IP address Diffbot should use to fetch the target page.", { minLength: 1 }),
        proxyAuth: s.string("The proxy authentication string sent with the custom proxy.", { minLength: 1 }),
        useProxy: s.stringEnum(["default", "none"], {
          description: "Whether Diffbot should force its default proxy or disable proxy usage.",
        }),
        paging: s.boolean("Whether Diffbot should automatically concatenate multi-page articles."),
        maxTags: s.nonNegativeInteger("The maximum number of auto-generated tags to return."),
        tagConfidence: s.number("The minimum relevance score required for returned tags.", { minimum: 0, maximum: 1 }),
        categoryConfidence: s.number("The minimum relevance score required for returned categories.", {
          minimum: 0,
          maximum: 1,
        }),
        discussion: s.boolean("Whether Diffbot should extract article comments and discussions."),
        naturalLanguage: s.array(
          "The Diffbot Natural Language features to enable for the article.",
          naturalLanguageFeatureSchema,
          { minItems: 1 },
        ),
        summaryNumSentences: s.positiveInteger(
          "The maximum number of summary sentences when summary analysis is enabled.",
        ),
      },
      {
        required: ["url"],
        optional: [
          "fields",
          "timeout",
          "renderDelay",
          "scroll",
          "proxy",
          "proxyAuth",
          "useProxy",
          "paging",
          "maxTags",
          "tagConfidence",
          "categoryConfidence",
          "discussion",
          "naturalLanguage",
          "summaryNumSentences",
        ],
      },
    ),
    outputSchema: s.object(
      "The normalized Diffbot article extraction response.",
      {
        request: s.nullable(requestSchema),
        article: s.nullable(articleSchema),
        humanLanguage: s.string("The language code returned at the top level."),
        type: s.string("The top-level Diffbot object type."),
        title: s.string("The top-level title returned by Diffbot."),
      },
      { required: ["request", "article"], optional: ["humanLanguage", "type", "title"] },
    ),
  }),
];
