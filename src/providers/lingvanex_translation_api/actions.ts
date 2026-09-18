import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lingvanex_translation_api";

const translateTextInputSchema = s.anyOf("The text values to translate with Lingvanex.", [
  s.nonEmptyString("One text value to process."),
  s.stringArray("A list of up to 128 text values to translate in one request.", {
    minItems: 1,
    maxItems: 128,
    itemDescription: "One text value to process.",
  }),
]);

const detectTextInputSchema = s.anyOf("The text values to inspect with Lingvanex.", [
  s.nonEmptyString("One text value to inspect."),
  s.stringArray("Text values to inspect in one request.", {
    minItems: 1,
    itemDescription: "One text value to inspect.",
  }),
]);

const rawObjectSchema = s.looseObject("The raw object returned by Lingvanex.");

const translationSchema = s.actionOutput(
  {
    translatedText: s.string("The translated text."),
    detectedSourceLanguage: s.nullableString("The detected source language when source was not provided."),
    model: s.nullableString("The translation model when returned by Lingvanex."),
    raw: rawObjectSchema,
  },
  "One translation returned by Lingvanex.",
);

const detectionSchema = s.actionOutput(
  {
    language: s.string("The detected language code."),
    isReliable: s.nullableBoolean("The deprecated Lingvanex reliability flag when returned."),
    confidence: s.nullableNumber("The deprecated Lingvanex confidence value when returned."),
    raw: rawObjectSchema,
  },
  "One language detection candidate returned by Lingvanex.",
);

const languageSchema = s.actionOutput(
  {
    language: s.string("The supported language code."),
    name: s.nullableString("The localized language name when a target language was requested."),
    raw: rawObjectSchema,
  },
  "One language supported by Lingvanex.",
);

export const lingvanexTranslationApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "translate_text",
    operationType: "read",
    description: "Translate one text value or a bounded list of text values with Lingvanex.",
    inputSchema: s.actionInput(
      {
        q: translateTextInputSchema,
        target: s.nonEmptyString("The target language code for the translation."),
        source: s.nonEmptyString("The source language code. Lingvanex detects the source language when omitted."),
        format: s.stringEnum("The source text format.", ["html", "text"]),
        model: s.nonEmptyString("The optional translation model passed to Lingvanex."),
      },
      ["q", "target"],
      "The input payload for translating text with Lingvanex.",
    ),
    outputSchema: s.actionOutput(
      {
        translations: s.array("The translations returned by Lingvanex.", translationSchema),
        raw: rawObjectSchema,
      },
      "The normalized Lingvanex translation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "detect_language",
    operationType: "read",
    description: "Detect the language of one text value or a list of text values.",
    inputSchema: s.actionInput(
      {
        q: detectTextInputSchema,
      },
      ["q"],
      "The input payload for detecting languages with Lingvanex.",
    ),
    outputSchema: s.actionOutput(
      {
        detections: s.array(
          "Detection candidate groups corresponding to each input text value.",
          s.array("The detection candidates for one input text value.", detectionSchema),
        ),
        raw: rawObjectSchema,
      },
      "The normalized Lingvanex language detection response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_languages",
    operationType: "read",
    description: "List languages supported by the Lingvanex Translation API.",
    inputSchema: s.actionInput(
      {
        target: s.nonEmptyString("The language code used to localize returned language names."),
        model: s.nonEmptyString("The optional translation model passed to Lingvanex."),
      },
      [],
      "The input payload for listing Lingvanex languages.",
    ),
    outputSchema: s.actionOutput(
      {
        languages: s.array("The languages supported by Lingvanex.", languageSchema),
        raw: rawObjectSchema,
      },
      "The normalized Lingvanex supported-language response.",
    ),
  }),
];
