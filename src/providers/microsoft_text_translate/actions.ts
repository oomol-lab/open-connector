import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "microsoft_text_translate";

const languageCodeSchema = s.nonEmptyString("A BCP 47 language code supported by Azure Translator.");
const scriptCodeSchema = s.nonEmptyString("A script code supported by Azure Translator.");
const translateTextsSchema = textArraySchema(25, 5_000);
const detectTextsSchema = textArraySchema(100, 50_000);
const transliterateTextsSchema = textArraySchema(10, 1_000);
const breakSentenceTextsSchema = textArraySchema(100, 50_000);
const dictionaryTextsSchema = textArraySchema(10, 100);
const resultsSchema = s.object("The Azure Translator operation result.", {
  results: s.array(
    "The results in the same order as the input text strings.",
    s.unknownObject("One result returned by Azure Translator."),
  ),
});

export const microsoftTextTranslateActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "translate_text",
    description: "Translate one or more text strings into one or more target languages.",
    inputSchema: s.object(
      "Input parameters for translating text with Azure Translator.",
      {
        texts: translateTextsSchema,
        to: s.array("The target language codes.", languageCodeSchema, { minItems: 1 }),
        from: languageCodeSchema,
        textType: s.stringEnum("Whether the source text is plain text or HTML.", ["plain", "html"]),
        category: s.nonEmptyString("The category ID of a Custom Translator system."),
        profanityAction: s.stringEnum("How profanity should be handled in translated text.", [
          "NoAction",
          "Marked",
          "Deleted",
        ]),
        profanityMarker: s.stringEnum("How marked profanity should be represented.", ["Asterisk", "Tag"]),
        fromScript: scriptCodeSchema,
        toScript: s.array("The target scripts corresponding to the target languages.", scriptCodeSchema, {
          minItems: 1,
        }),
        includeAlignment: s.boolean("Whether to include source-to-target alignment data."),
        includeSentenceLength: s.boolean("Whether to include source and translated sentence length data."),
      },
      {
        optional: [
          "from",
          "textType",
          "category",
          "profanityAction",
          "profanityMarker",
          "fromScript",
          "toScript",
          "includeAlignment",
          "includeSentenceLength",
        ],
      },
    ),
    outputSchema: resultsSchema,
  }),
  defineProviderAction(service, {
    name: "detect_language",
    description: "Detect the language of one or more text strings.",
    inputSchema: s.object("Input parameters for detecting languages with Azure Translator.", {
      texts: detectTextsSchema,
    }),
    outputSchema: resultsSchema,
  }),
  defineProviderAction(service, {
    name: "transliterate_text",
    description: "Convert text from one supported script into another script.",
    inputSchema: s.object("Input parameters for transliterating text with Azure Translator.", {
      texts: transliterateTextsSchema,
      language: languageCodeSchema,
      fromScript: scriptCodeSchema,
      toScript: scriptCodeSchema,
    }),
    outputSchema: resultsSchema,
  }),
  defineProviderAction(service, {
    name: "break_sentences",
    description: "Identify sentence boundaries in one or more text strings.",
    inputSchema: s.object(
      "Input parameters for finding sentence boundaries with Azure Translator.",
      { texts: breakSentenceTextsSchema, language: languageCodeSchema, script: scriptCodeSchema },
      { optional: ["language", "script"] },
    ),
    outputSchema: resultsSchema,
  }),
  defineProviderAction(service, {
    name: "dictionary_lookup",
    description: "Look up alternative translations for words and short idiomatic phrases.",
    inputSchema: s.object("Input parameters for Azure Translator dictionary lookup.", {
      texts: dictionaryTextsSchema,
      from: languageCodeSchema,
      to: languageCodeSchema,
    }),
    outputSchema: resultsSchema,
  }),
  defineProviderAction(service, {
    name: "dictionary_examples",
    description: "Get examples showing source and translated dictionary terms in context.",
    inputSchema: s.object("Input parameters for Azure Translator dictionary examples.", {
      entries: s.array(
        "The source and translated term pairs to find examples for.",
        s.object("One dictionary term pair.", {
          sourceText: s.nonEmptyString("The source-language word or phrase.", { maxLength: 100 }),
          translationText: s.nonEmptyString("The translated word or phrase.", { maxLength: 100 }),
        }),
        { minItems: 1, maxItems: 10 },
      ),
      from: languageCodeSchema,
      to: languageCodeSchema,
    }),
    outputSchema: resultsSchema,
  }),
  defineProviderAction(service, {
    name: "get_languages",
    description: "Get the languages and scripts currently supported by Azure Translator.",
    inputSchema: s.object(
      "Input parameters for retrieving Azure Translator language capabilities.",
      {
        scopes: s.array(
          "The language capability groups to return.",
          s.stringEnum("One language capability group.", ["translation", "transliteration", "dictionary"]),
          { minItems: 1 },
        ),
        acceptLanguage: languageCodeSchema,
      },
      { optional: ["scopes", "acceptLanguage"] },
    ),
    outputSchema: s.object("The supported Azure Translator language capabilities.", {
      languages: s.unknownObject("The capability groups keyed by language code as returned by Azure Translator."),
    }),
  }),
];

function textArraySchema(maxItems: number, maxItemLength: number): JsonSchema {
  return s.array(
    "The text strings to process in request order.",
    s.nonEmptyString("One text string to process.", { maxLength: maxItemLength }),
    { minItems: 1, maxItems },
  );
}
