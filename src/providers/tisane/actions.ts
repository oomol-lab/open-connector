import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tisane";

const language = s.nonEmptyString("The IETF language tag used by Tisane, such as en or zh-CN.");
const content = s.nonEmptyString("The UTF-8 text content to send to Tisane.");
const settings = s.looseObject(
  "Optional Tisane settings forwarded to the endpoint. Use official Tisane configuration keys.",
);
const rawObject = s.looseObject("The raw object returned by Tisane.");
const rawObjectArray = s.array("The raw objects returned by Tisane.", rawObject);

const languageDetection = s.object("One language segment detected by Tisane.", {
  offset: s.nullableInteger("The character offset where this language segment starts."),
  length: s.nullableInteger("The length of this language segment."),
  language: s.nonEmptyString("The detected language code for this segment."),
  score: s.nullableNumber("The confidence score returned by Tisane."),
  raw: rawObject,
});

const supportedLanguage = s.object("One language supported by Tisane.", {
  isoCode: s.nonEmptyString("The IETF language tag supported by Tisane."),
  name: s.nonEmptyString("The native language name."),
  englishName: s.nonEmptyString("The English language name."),
  nativeEncoding: s.nullableString("The native encoding reported by Tisane."),
  fontFace: s.nullableString("The recommended display font reported by Tisane."),
  latin: s.nullableBoolean("Whether the language uses a Latin script."),
  rightToLeft: s.nullableBoolean("Whether the language is written right-to-left."),
  raw: rawObject,
});

export const tisaneActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "analyze_text",
    description:
      "Analyze text with Tisane for problematic content, sentiment, entities, topics, and other linguistic features.",
    inputSchema: s.object(
      "Input parameters for Tisane text analysis.",
      { language, content, settings },
      { optional: ["settings"] },
    ),
    outputSchema: s.object("The normalized text analysis result from Tisane.", {
      text: s.string("The input text echoed by Tisane."),
      language: s.nullableString("The detected or analyzed language code when Tisane returns it."),
      topics: s.array(
        "The topics returned by Tisane as strings or detailed topic objects.",
        s.anyOf("One topic returned by Tisane.", [s.string("A topic string returned by Tisane."), rawObject]),
      ),
      abuse: rawObjectArray,
      sentenceList: rawObjectArray,
      entitiesSummary: rawObjectArray,
      sentimentExpressions: rawObjectArray,
      memory: s.nullable(rawObject),
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "detect_language",
    description:
      "Detect the language segments used in a text fragment with optional language hints and delimiter settings.",
    inputSchema: s.object(
      "Input parameters for Tisane language detection.",
      {
        content,
        languages: s.nonEmptyString("Optional vertical-bar-delimited language hints, such as en|ru|he."),
        delimiter: s.nonEmptyString("Optional delimiter expression used by Tisane to segment the text."),
      },
      { optional: ["languages", "delimiter"] },
    ),
    outputSchema: s.object("The language detection result returned by Tisane.", {
      languages: s.array("The detected language segments.", languageDetection),
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_supported_languages",
    description: "List the languages currently supported by Tisane.",
    inputSchema: s.object("The input payload for listing Tisane supported languages.", {}),
    outputSchema: s.object("The supported languages returned by Tisane.", {
      languages: s.array("The languages supported by Tisane.", supportedLanguage),
    }),
  }),
  defineProviderAction(service, {
    name: "extract_text",
    description: "Remove markup such as HTML, CSS, JavaScript, or JSON from UTF-8 text and return plain decoded text.",
    inputSchema: s.object("Input parameters for extracting text with Tisane.", {
      content: s.nonEmptyString("The UTF-8 markup content to clean up."),
    }),
    outputSchema: s.object("The plain text extracted by Tisane.", {
      text: s.string("The extracted plain text."),
    }),
  }),
  defineProviderAction(service, {
    name: "calculate_similarity",
    description:
      "Calculate the semantic similarity between two text fragments, either in one language or across languages.",
    inputSchema: s.object(
      "Input parameters for calculating semantic similarity with Tisane.",
      {
        language1: language,
        content1: s.nonEmptyString("The first UTF-8 text fragment to compare."),
        language2: language,
        content2: s.nonEmptyString("The second UTF-8 text fragment to compare."),
        settings,
      },
      { optional: ["settings"] },
    ),
    outputSchema: s.object("The semantic similarity score returned by Tisane.", {
      similarity: s.number("The semantic similarity score between 0 and 1.", { minimum: 0, maximum: 1 }),
    }),
  }),
  defineProviderAction(service, {
    name: "transform_text",
    description:
      "Translate text between languages with Tisane, or paraphrase text when source and target languages match.",
    inputSchema: s.object(
      "Input parameters for translating or paraphrasing text with Tisane.",
      {
        from: s.nonEmptyString(
          "The source IETF language tag. Use * or a vertical-bar-delimited list to ask Tisane to auto-detect.",
        ),
        to: s.nonEmptyString("The target IETF language tag."),
        content,
        settings,
      },
      { optional: ["settings"] },
    ),
    outputSchema: s.object("The transformed text returned by Tisane.", {
      text: s.string("The translated or paraphrased text."),
    }),
  }),
  defineProviderAction(service, {
    name: "compare_entities",
    description: "Compare two compound person entities with Tisane and return whether they are the same or different.",
    inputSchema: s.object("Input parameters for comparing two Tisane person entities.", {
      language1: language,
      entity1: s.nonEmptyString("The first person entity text to compare."),
      language2: language,
      entity2: s.nonEmptyString("The second person entity text to compare."),
      type: s.literal("person", { description: "The entity type to compare. Tisane currently supports person." }),
    }),
    outputSchema: s.object(
      "The entity comparison result returned by Tisane.",
      {
        result: s.stringEnum("The comparison result returned by Tisane.", ["no_single_entity", "same", "different"]),
        differences: s.stringArray("The difference categories returned by Tisane when entities differ."),
        raw: rawObject,
      },
      { optional: ["differences"] },
    ),
  }),
];
