import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "deepl" as const;

const nonEmptyString = (description: string) => s.string({ minLength: 1, description });
const nonBlankText = (description: string) => s.string({ minLength: 1, pattern: "\\S", description });

const deeplLanguageSchema = s.object(
  "One supported DeepL language entry.",
  {
    language: nonEmptyString("The DeepL language code."),
    name: nonEmptyString("The human-readable DeepL language name."),
    supports_formality: s.boolean("Whether this target language supports the formality parameter."),
  },
  { optional: ["supports_formality"] },
);

const deeplUsageProductSchema = s.looseObject("One DeepL usage product entry.", {
  product_type: nonEmptyString("The DeepL product family identifier."),
  api_key_character_count: s.integer("The character count attributed to the current API key for this product."),
  api_key_document_count: s.integer("The document count attributed to the current API key for this product."),
  character_count: s.integer("The total billed character count for this product."),
  document_count: s.integer("The total billed document count for this product."),
});

const deeplTranslationSchema = s.object(
  "One translated text entry returned by DeepL.",
  {
    detected_source_language: nonEmptyString("The source language detected by DeepL."),
    text: s.string("The translated text returned by DeepL."),
    billed_characters: s.integer("The billed character count for this translation, when requested."),
    model_type_used: nonEmptyString("The DeepL translation model used for this result."),
  },
  { optional: ["detected_source_language", "billed_characters", "model_type_used"] },
);

const listSupportedLanguagesInputSchema = s.object(
  "Input parameters for listing DeepL supported languages.",
  {
    type: s.stringEnum("Whether to list source or target languages.", ["source", "target"]),
  },
  { optional: ["type"] },
);

const listSupportedLanguagesOutputSchema = s.object("The normalized DeepL supported language list.", {
  type: s.stringEnum("The DeepL language family returned by the API.", ["source", "target"]),
  languages: s.array("The supported DeepL languages returned by the API.", deeplLanguageSchema),
});

const getUsageInputSchema = s.object("This action does not require additional input parameters.", {});

const getUsageOutputSchema = s.object("The normalized DeepL usage response.", {
  usage: s.looseObject("The DeepL usage payload returned by the API.", {
    character_count: s.integer("The total billed character count for the current billing period."),
    character_limit: s.integer("The billed character limit for the current billing period."),
    api_key_character_count: s.integer("The billed character count attributed to the current API key."),
    api_key_character_limit: s.integer("The billed character limit attributed to the current API key."),
    document_count: s.integer("The total billed document count for the current billing period."),
    document_limit: s.integer("The billed document limit for the current billing period."),
    api_key_document_count: s.integer("The billed document count attributed to the current API key."),
    api_key_document_limit: s.integer("The billed document limit attributed to the current API key."),
    team_document_count: s.integer("The billed team document count for the current billing period."),
    team_document_limit: s.integer("The billed team document limit for the current billing period."),
    start_time: s.dateTime("The start timestamp of the current billing period."),
    end_time: s.dateTime("The end timestamp of the current billing period."),
    products: s.array("Per-product DeepL usage breakdown entries.", deeplUsageProductSchema),
  }),
});

const translateTextInputSchema = s.object(
  "Input parameters for translating text with DeepL.",
  {
    texts: s.array(
      "The text items to translate in a single DeepL request.",
      nonBlankText("One text item to translate with DeepL."),
      { minItems: 1 },
    ),
    target_lang: nonEmptyString("The target language code for the translation."),
    source_lang: nonEmptyString("The source language code to force upstream."),
    context: nonBlankText("Optional context that guides translation without being translated itself."),
    formality: s.stringEnum("The DeepL formality preference for supported target languages.", [
      "default",
      "more",
      "less",
      "prefer_more",
      "prefer_less",
    ]),
    split_sentences: s.stringEnum("The DeepL sentence splitting mode.", ["0", "1", "nonewlines"]),
    preserve_formatting: s.boolean("Whether DeepL should preserve the original input formatting."),
    show_billed_characters: s.boolean("Whether DeepL should include billed_characters in the translation response."),
  },
  {
    optional: [
      "source_lang",
      "context",
      "formality",
      "split_sentences",
      "preserve_formatting",
      "show_billed_characters",
    ],
  },
);

const translateTextOutputSchema = s.object("The normalized DeepL text translation result.", {
  translations: s.array("The translated text results returned by DeepL.", deeplTranslationSchema),
});

export const deeplActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_supported_languages",
    description: "List the DeepL source or target languages currently supported by the translation API.",
    requiredScopes: [],
    inputSchema: listSupportedLanguagesInputSchema,
    outputSchema: listSupportedLanguagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_usage",
    description: "Fetch the current DeepL API usage and quota counters for the connected API key.",
    requiredScopes: [],
    inputSchema: getUsageInputSchema,
    outputSchema: getUsageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "translate_text",
    description: "Translate one or more text items with DeepL and return the normalized translation results.",
    requiredScopes: [],
    inputSchema: translateTextInputSchema,
    outputSchema: translateTextOutputSchema,
  }),
];
