import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dandelion";

const textSchema = s.nonEmptyString("The plain text to analyze.", { pattern: "\\S" });
const languageSchema = s.nonEmptyString("The ISO 639-1 language code. Omit it to let Dandelion detect the language.", {
  pattern: "\\S",
});
const baseResponseFields = {
  timestamp: s.string("The response generation timestamp returned by Dandelion."),
  time: s.number("The processing time in milliseconds returned by Dandelion."),
};

const languageResponseFields = {
  ...baseResponseFields,
  lang: s.string("The ISO 639-1 language code used for the analysis."),
  langConfidence: s.optional(s.number("The language detection confidence from 0 to 1 when Dandelion detects it.")),
};

const extractEntitiesAction = defineProviderAction(service, {
  name: "extract_entities",
  description: "Extract linked entities and their positions from plain text with Dandelion.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for extracting entities with Dandelion.",
    {
      text: textSchema,
      language: languageSchema,
      minimumConfidence: s.number("The minimum entity confidence from 0 to 1.", {
        minimum: 0,
        maximum: 1,
      }),
      maximumEntities: s.integer("The maximum number of top entities to include in addition to annotations.", {
        minimum: 1,
      }),
      include: s.array(
        "The optional entity detail groups to include.",
        s.stringEnum("One detail group: types, abstract, categories, image, lod, or alternate_labels.", [
          "types",
          "abstract",
          "categories",
          "image",
          "lod",
          "alternate_labels",
        ]),
        { minItems: 1 },
      ),
      country: s.string("The two-letter country code used to improve entity disambiguation."),
    },
    { optional: ["language", "minimumConfidence", "maximumEntities", "include", "country"] },
  ),
  outputSchema: s.object("The entity extraction result returned by Dandelion.", {
    ...languageResponseFields,
    annotations: s.array(
      "The entities found in the text.",
      s.looseObject("One entity annotation returned by Dandelion.", {
        id: s.integer("The linked Wikipedia entity identifier."),
        title: s.string("The linked entity title."),
        uri: s.string("The linked entity URI."),
        label: s.string("The entity label returned by Dandelion."),
        confidence: s.number("The entity annotation confidence."),
        spot: s.string("The matching text span."),
        start: s.integer("The zero-based start offset of the matching span."),
        end: s.integer("The exclusive end offset of the matching span."),
      }),
    ),
    topEntities: s.optional(
      s.array(
        "The highest-ranked entities when maximumEntities was requested.",
        s.object("One top-ranked entity returned by Dandelion.", {
          id: s.integer("The linked Wikipedia entity identifier."),
          uri: s.string("The linked entity URI."),
          score: s.number("The entity importance score within this text."),
        }),
      ),
    ),
  }),
});

const analyzeSentimentAction = defineProviderAction(service, {
  name: "analyze_sentiment",
  description: "Analyze the sentiment expressed by plain text with Dandelion.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for analyzing sentiment with Dandelion.",
    { text: textSchema, language: languageSchema },
    { optional: ["language"] },
  ),
  outputSchema: s.object("The sentiment analysis result returned by Dandelion.", {
    ...languageResponseFields,
    sentiment: s.object("The detected sentiment.", {
      score: s.number("The sentiment score from -1 to 1."),
      type: s.stringEnum("The sentiment classification.", ["positive", "neutral", "negative"]),
    }),
  }),
});

const detectLanguageAction = defineProviderAction(service, {
  name: "detect_language",
  description: "Detect the languages present in plain text with Dandelion.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for detecting languages with Dandelion.",
    {
      text: textSchema,
      clean: s.boolean(
        "Whether Dandelion should remove URLs, email addresses, hashtags, and mentions before detection.",
      ),
    },
    { optional: ["clean"] },
  ),
  outputSchema: s.object("The language detection result returned by Dandelion.", {
    ...baseResponseFields,
    detectedLanguages: s.array(
      "The detected languages ordered by confidence.",
      s.object("One detected language.", {
        language: s.string("The detected ISO 639-1 language code."),
        confidence: s.number("The detection confidence."),
      }),
    ),
  }),
});

const compareTextSimilarityAction = defineProviderAction(service, {
  name: "compare_text_similarity",
  description: "Compare the semantic similarity of two plain texts with Dandelion.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for comparing text similarity with Dandelion.",
    {
      firstText: s.nonEmptyString("The first plain text to compare.", { pattern: "\\S" }),
      secondText: s.nonEmptyString("The second plain text to compare.", { pattern: "\\S" }),
      language: languageSchema,
      bagOfWords: s.boolean("Whether to compare the texts as bags of words instead of preserving word order."),
    },
    { optional: ["language", "bagOfWords"] },
  ),
  outputSchema: s.object("The text similarity result returned by Dandelion.", {
    ...languageResponseFields,
    similarity: s.number("The semantic similarity score from 0 to 1."),
  }),
});

export const dandelionActions: ActionDefinition[] = [
  extractEntitiesAction,
  analyzeSentimentAction,
  detectLanguageAction,
  compareTextSimilarityAction,
];
