import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stealthgpt";

const modelSchema = s.stringEnum("StealthGPT model used to process the text.", ["super", "standard", "lite"]);

const writingModeSchema = s.stringEnum("How StealthGPT structures generated content.", ["default", "essay"]);

const toneSchema = s.stringEnum("Writing complexity used when writingMode is essay.", [
  "Standard",
  "HighSchool",
  "College",
  "PhD",
]);

const qualityModeSchema = s.stringEnum("Whether StealthGPT prioritizes rewrite quality or speed.", ["quality", "fast"]);

const outputFormatSchema = s.stringEnum("Format of the generated or humanized result.", ["text", "markdown"]);

const textResultSchema = s.looseRequiredObject("Text processing result and billing details returned by StealthGPT.", {
  result: s.string("The generated or humanized content."),
  howLikelyToBeDetected: s.number(
    "Historical StealthGPT score where a higher value means the content reads as more human.",
    { minimum: 0, maximum: 100 },
  ),
  wordsSpent: s.number("Words charged for this request."),
  remainingCredits: s.number("Prepaid word balance remaining after this request."),
  billingMode: s.stringEnum("Billing source used for this request.", ["prepaid", "payg"]),
  meteredChargedCredits: s.number("Words added to metered usage, or zero when prepaid words were used."),
});

const generateTextInputSchema = s.object(
  "Input for generating text with StealthGPT.",
  {
    prompt: s.nonEmptyString("Instructions or topic for the content to generate."),
    model: modelSchema,
    writingMode: writingModeSchema,
    tone: toneSchema,
    qualityMode: qualityModeSchema,
    isMultilingual: s.boolean("Whether non-English input should produce output in the original language."),
    outputFormat: outputFormatSchema,
  },
  { optional: ["writingMode", "tone", "qualityMode", "isMultilingual", "outputFormat"] },
);

const humanizeTextInputSchema = s.object(
  "Input for humanizing existing text with StealthGPT.",
  {
    text: s.nonEmptyString("Source text to humanize without instruction wrappers, up to 3,000 words."),
    model: modelSchema,
    qualityMode: qualityModeSchema,
    isMultilingual: s.boolean("Whether non-English source text should remain in its original language."),
    outputFormat: outputFormatSchema,
  },
  { optional: ["qualityMode", "isMultilingual", "outputFormat"] },
);

const detectionOutputSchema = s.looseRequiredObject("AI detection score and billing details returned by StealthGPT.", {
  howLikelyToBeDetected: s.number(
    "Score from 0 to 100 where a higher value means the text is more likely to be flagged as AI-generated.",
    { minimum: 0, maximum: 100 },
  ),
  wordsSpent: s.number("Words charged for this detection request."),
  remainingCredits: s.number("Prepaid word balance remaining after this request."),
  billingMode: s.stringEnum("Billing source used for this request.", ["prepaid", "payg"]),
  meteredChargedCredits: s.number("Words added to metered usage, or zero when prepaid words were used."),
});

const paygSchema = s.requiredObject("StealthGPT pay-as-you-go billing status.", {
  mode: s.stringEnum("Current pay-as-you-go billing state.", [
    "metered_active",
    "metered_past_due",
    "metered_setup_required",
  ]),
  unbilledCredits: s.number("Words accumulated for metered billing but not yet reported."),
  lastUsageReportAt: s.nullable(s.dateTime("Timestamp when metered usage was last reported, when available.")),
});

export const stealthgptActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "generate_text",
    operationType: "write",
    description: "Generate text from instructions with StealthGPT and return usage details.",
    inputSchema: generateTextInputSchema,
    outputSchema: textResultSchema,
  }),
  defineProviderAction(service, {
    name: "humanize_text",
    operationType: "write",
    description: "Humanize existing text with StealthGPT and return usage details.",
    inputSchema: humanizeTextInputSchema,
    outputSchema: textResultSchema,
  }),
  defineProviderAction(service, {
    name: "detect_ai_text",
    operationType: "read",
    description: "Score how likely text is to be flagged as AI-generated with StealthGPT.",
    inputSchema: s.requiredObject("Input for detecting AI-generated text with StealthGPT.", {
      text: s.nonEmptyString("Text to analyze, up to 3,000 words."),
    }),
    outputSchema: detectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_balance",
    operationType: "read",
    description: "Get the current StealthGPT prepaid and pay-as-you-go word balance.",
    inputSchema: s.requiredObject("This action does not require input parameters.", {}),
    outputSchema: s.looseRequiredObject("Current StealthGPT account balance.", {
      credits: s.number("Prepaid words available in the account."),
      payg: s.nullable(paygSchema),
    }),
  }),
];
