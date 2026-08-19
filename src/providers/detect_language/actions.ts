import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "detect_language";

const nonEmptyTextSchema = s.string({
  minLength: 1,
  pattern: "\\S",
  description: "The UTF-8 text to detect.",
});

const detectionCandidateSchema = s.object("One language candidate returned by Detect Language.", {
  language: s.string("The detected ISO language code."),
  score: s.number("The confidence score between 0 and 1.", {
    minimum: 0,
    maximum: 1,
  }),
});

const languageSchema = s.object("One supported language returned by Detect Language.", {
  code: s.string("The ISO language code."),
  name: s.string("The display name of the language."),
});

export const detectLanguageActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "detect_text",
    description: "Detect the language of a single text string with confidence scores.",
    inputSchema: s.object("Input parameters for detecting the language of one text string.", {
      text: nonEmptyTextSchema,
    }),
    outputSchema: s.object("Detect Language single-text detection result.", {
      detections: s.array("Language candidates ordered by confidence.", detectionCandidateSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "detect_texts",
    description: "Detect languages for multiple text strings in one batch request.",
    inputSchema: s.object("Input parameters for detecting languages for multiple texts.", {
      texts: s.array("The UTF-8 texts to detect, preserving output order.", nonEmptyTextSchema, {
        minItems: 1,
      }),
    }),
    outputSchema: s.object("Detect Language batch detection result.", {
      results: s.array(
        "Language candidate arrays ordered to match the input texts.",
        s.array("Language candidates ordered by confidence for one input text.", detectionCandidateSchema),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_account_status",
    description: "Get the current Detect Language account usage, limits, plan, and status.",
    inputSchema: s.object("Input parameters for retrieving Detect Language account status.", {}),
    outputSchema: s.object("Detect Language account status.", {
      date: s.string("The UTC date reported by Detect Language."),
      requests: s.integer("The number of requests sent today."),
      bytes: s.integer("The number of text bytes sent today."),
      plan: s.string("The Detect Language plan code."),
      planExpires: s.nullableString("The plan expiration date when one is set."),
      dailyRequestsLimit: s.integer("The daily request limit."),
      dailyBytesLimit: s.integer("The daily text-byte limit."),
      status: s.string("The Detect Language account status."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_languages",
    description: "List languages supported by Detect Language.",
    inputSchema: s.object("Input parameters for listing Detect Language supported languages.", {}),
    outputSchema: s.object("Detect Language supported languages.", {
      languages: s.array("The supported languages returned by Detect Language.", languageSchema),
    }),
  }),
];
