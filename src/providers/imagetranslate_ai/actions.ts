import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "imagetranslate_ai";

const translatedFileSchema = s.object(
  "The translated PNG, no larger than 50 MB, uploaded to connector transit storage.",
  {
    name: s.nonEmptyString("The generated translated image filename."),
    mimeType: s.stringEnum("The MIME type of the translated image.", ["image/png"]),
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local URL for downloading the translated image."),
    sizeBytes: s.nonNegativeInteger("The translated image size in bytes, up to 50 MB."),
  },
);

const translateImageInputSchema = s.object(
  "Input for translating text in an image while preserving its visual layout.",
  {
    imageUrl: s.string("A public HTTP or HTTPS URL for a JPG, PNG, or WebP image no larger than 20 MB.", {
      format: "uri",
      maxLength: 2048,
    }),
    sourceLanguage: s.nonEmptyString(
      "The source language as an ISO 639-1 or BCP-47 code, or auto for detection. Defaults to auto.",
      { maxLength: 32 },
    ),
    targetLanguage: s.nonEmptyString(
      "The target language as an ISO 639-1 or BCP-47 code, such as en, ja, ko, zh-cn, or zh-tw.",
      { maxLength: 32 },
    ),
    mode: s.stringEnum(
      "The layout mode: manga preserves comic text layout and strokes; general uses standard rendering; e-commerce preserves layout without strokes; light-novel overlays translated text. Defaults to general.",
      ["general", "manga", "e-commerce", "light-novel"],
    ),
    translator: s.stringEnum("The AI translation model. Defaults to grok.", [
      "grok",
      "gemini",
      "deepseek",
      "kimi",
      "chatgpt",
      "claude",
    ]),
    customPrompt: s.string("Additional translation instructions, terminology, character context, or style guidance.", {
      maxLength: 1000,
    }),
    idempotencyKey: s.string(
      "A caller-generated UUID that must be reused when retrying the same translation after a timeout to avoid duplicate credit charges.",
      { format: "uuid" },
    ),
  },
  {
    optional: ["sourceLanguage", "mode", "translator", "customPrompt"],
  },
);

const translateImageOutputSchema = s.object(
  "The completed ImageTranslate.AI translation and remaining credit balance.",
  {
    recordId: s.nonEmptyString("The ImageTranslate.AI record ID to include when contacting provider support."),
    remainingCredit: s.nonNegativeInteger("The advanced-credit balance remaining after this translation."),
    file: translatedFileSchema,
  },
);

export const imagetranslateAiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "translate_image",
    operationType: "read",
    description:
      "Translate text in a public image with ImageTranslate.AI, preserve the selected layout style, and return a rendered PNG up to 50 MB through transit storage. ImageTranslate.AI may charge before Connector can reject an oversized rendered result.",
    requiredScopes: [],
    inputSchema: translateImageInputSchema,
    outputSchema: translateImageOutputSchema,
  }),
];
