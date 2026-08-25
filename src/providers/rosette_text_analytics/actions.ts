import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rosette_text_analytics";

const rawObjectSchema = s.looseObject("The raw object returned by Rosette Text Analytics.");

const documentInputSchema: JsonSchema = {
  ...s.object(
    "Input document for Rosette Text Analytics. Provide exactly one of content or contentUri.",
    {
      content: s.nonEmptyString("Text content to analyze."),
      contentUri: s.url(
        "A URI that Rosette Text Analytics can fetch and analyze. This is mutually exclusive with content.",
      ),
      language: s.string("ISO 639 language code for the input document when Rosette needs a language hint."),
      options: s.looseObject(
        "Optional Rosette endpoint options forwarded to the API. Use official option names for the selected action.",
      ),
    },
    { optional: ["content", "contentUri", "language", "options"] },
  ),
  oneOf: [
    {
      required: ["content"],
      not: { required: ["contentUri"] },
    },
    {
      required: ["contentUri"],
      not: { required: ["content"] },
    },
  ],
};

const languageDetectionSchema = s.actionOutput(
  {
    language: s.string("The three-letter ISO 639-3 language code detected by Rosette."),
    confidence: s.nullable(s.number("The detection confidence score returned by Rosette.")),
    raw: rawObjectSchema,
  },
  "One language detected by Rosette Text Analytics.",
);

const mentionOffsetSchema = s.looseObject("One mention offset object returned by Rosette.", {
  startOffset: s.integer("The starting character offset for the mention."),
  endOffset: s.integer("The ending character offset for the mention."),
});

const entitySchema = s.actionOutput(
  {
    type: s.nullableString("The entity type returned by Rosette."),
    mention: s.nullableString("The entity mention text returned by Rosette."),
    normalized: s.nullableString("The normalized entity text returned by Rosette."),
    count: s.nullableInteger("The mention count returned by Rosette."),
    entityId: s.nullableString("The entity identifier returned by Rosette."),
    confidence: s.nullableNumber("The entity confidence score returned by Rosette."),
    linkingConfidence: s.nullableNumber("The entity linking confidence score returned by Rosette."),
    salience: s.nullableNumber("The entity salience score returned by Rosette."),
    mentionOffsets: s.array("The mention offsets returned by Rosette.", mentionOffsetSchema),
    raw: rawObjectSchema,
  },
  "One entity returned by Rosette Text Analytics.",
);

const labelScoreSchema = s.actionOutput(
  {
    label: s.nullableString("The label returned by Rosette."),
    confidence: s.nullableNumber("The label confidence score returned by Rosette."),
    raw: rawObjectSchema,
  },
  "One label and score returned by Rosette Text Analytics.",
);

const categorySchema = s.actionOutput(
  {
    label: s.nullableString("The category label returned by Rosette."),
    confidence: s.nullableNumber("The category confidence score returned by Rosette."),
    score: s.nullableNumber("The raw category score returned by Rosette."),
    raw: rawObjectSchema,
  },
  "One contextual category returned by Rosette Text Analytics.",
);

export const rosetteTextAnalyticsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "identify_language",
    description: "Identify the language or languages of a text document with Rosette Text Analytics.",
    inputSchema: documentInputSchema,
    outputSchema: s.actionOutput(
      {
        languageDetections: s.array("The detected languages in descending confidence order.", languageDetectionSchema),
        raw: rawObjectSchema,
      },
      "The language identification result returned by Rosette.",
    ),
  }),
  defineProviderAction(service, {
    name: "extract_entities",
    description: "Extract named entities such as people, organizations, locations, dates, and emails.",
    inputSchema: documentInputSchema,
    outputSchema: s.actionOutput(
      {
        entitiesResponse: s.array("The entities extracted from the document.", entitySchema),
        raw: rawObjectSchema,
      },
      "The entity extraction result returned by Rosette.",
    ),
  }),
  defineProviderAction(service, {
    name: "analyze_sentiment",
    description: "Analyze document sentiment and entity sentiment with Rosette Text Analytics.",
    inputSchema: documentInputSchema,
    outputSchema: s.actionOutput(
      {
        document: s.nullable(labelScoreSchema),
        entities: s.array("The entities with sentiment context returned by Rosette.", entitySchema),
        raw: rawObjectSchema,
      },
      "The sentiment analysis result returned by Rosette.",
    ),
  }),
  defineProviderAction(service, {
    name: "identify_categories",
    description: "Identify contextual content categories for a text document.",
    inputSchema: documentInputSchema,
    outputSchema: s.actionOutput(
      {
        categories: s.array("The contextual categories identified by Rosette.", categorySchema),
        raw: rawObjectSchema,
      },
      "The category identification result returned by Rosette.",
    ),
  }),
  defineProviderAction(service, {
    name: "identify_tokens",
    description: "Identify word, number, affix, and punctuation tokens in a text document.",
    inputSchema: documentInputSchema,
    outputSchema: s.actionOutput(
      {
        tokens: s.array("The tokens returned by Rosette.", s.string("One token returned by Rosette.")),
        raw: rawObjectSchema,
      },
      "The tokenization result returned by Rosette.",
    ),
  }),
];
