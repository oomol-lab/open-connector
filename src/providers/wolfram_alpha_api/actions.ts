import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wolfram_alpha_api";

const queryFieldSchema = s.nonEmptyString("Natural-language query or mathematical expression sent to Wolfram|Alpha.");
const modeFieldSchema = s.stringEnum("Recognizer mode. Use default for general queries or voice for spoken phrasing.", [
  "default",
  "voice",
]);
const unitsFieldSchema = s.stringEnum("Measurement system requested by Wolfram|Alpha for unit-sensitive answers.", [
  "metric",
  "imperial",
]);
const timeoutFieldSchema = s.positiveInteger("Maximum processing time in seconds accepted by Wolfram|Alpha.");

export const wolframAlphaApiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_query",
    operationType: "read",
    description: "Validate whether Wolfram|Alpha can interpret a query.",
    inputSchema: s.actionInput(
      {
        query: queryFieldSchema,
        mode: modeFieldSchema,
      },
      ["query"],
      "Input parameters for validating whether Wolfram|Alpha can interpret a query.",
    ),
    outputSchema: s.actionOutput(
      {
        query: s.string("Original query sent to the recognizer endpoint."),
        mode: modeFieldSchema,
        accepted: s.boolean("Whether Wolfram|Alpha accepted the query."),
        domain: s.nullableString("Recognized Wolfram|Alpha domain for the query, when available."),
        timingMs: s.nullableNumber("Recognizer timing value returned by Wolfram|Alpha in milliseconds."),
        resultSignificanceScore: s.nullableNumber(
          "Recognizer significance score returned by Wolfram|Alpha, when available.",
        ),
        spellingCorrection: s.nullableString(
          "Suggested spelling correction returned by Wolfram|Alpha, when available.",
        ),
        summaryBoxPath: s.nullableString("Summary box path returned by Wolfram|Alpha, when available."),
      },
      "Normalized query validation result returned by Wolfram|Alpha.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_short_answer",
    operationType: "read",
    description: "Get a concise short answer from Wolfram|Alpha.",
    inputSchema: s.actionInput(
      {
        query: queryFieldSchema,
        units: unitsFieldSchema,
        timeout: timeoutFieldSchema,
      },
      ["query"],
      "Input parameters for retrieving a concise short answer from Wolfram|Alpha.",
    ),
    outputSchema: s.actionOutput(
      {
        query: s.string("Original query sent to the short answer endpoint."),
        answer: s.string("Short textual answer returned by Wolfram|Alpha."),
      },
      "Normalized short answer payload returned by Wolfram|Alpha.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_spoken_result",
    operationType: "read",
    description: "Get a spoken-style single-sentence result from Wolfram|Alpha.",
    inputSchema: s.actionInput(
      {
        query: queryFieldSchema,
        units: unitsFieldSchema,
        timeout: timeoutFieldSchema,
      },
      ["query"],
      "Input parameters for retrieving a spoken-style result from Wolfram|Alpha.",
    ),
    outputSchema: s.actionOutput(
      {
        query: s.string("Original query sent to the spoken result endpoint."),
        result: s.string("Spoken-style text returned by Wolfram|Alpha."),
      },
      "Normalized spoken result payload returned by Wolfram|Alpha.",
    ),
  }),
];
