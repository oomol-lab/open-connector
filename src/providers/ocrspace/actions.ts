import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ocrspace";

const nullableString = (description: string): JsonSchema => s.nullableString(description);
const textOverlay = s.nullable(s.looseObject("Optional OCR text overlay metadata returned by OCR.space."));

const pageResult = s.actionOutput(
  {
    pageNumber: s.positiveInteger("The 1-based page number in the OCR result."),
    parsedText: s.string("The parsed text returned for this page."),
    fileParseExitCode: s.integer("The page-level OCR parse exit code returned by OCR.space."),
    errorMessage: nullableString("The page-level error message, when present."),
    errorDetails: nullableString("The page-level error details, when present."),
    textOverlay,
  },
  "One normalized OCR page result.",
);

export type OcrspaceActionName = "extract_text" | "get_conversion_stats";

export const ocrspaceActions: ActionDefinition[] = [
  action(
    "extract_text",
    "read",
    "Extract text from a public image/PDF URL or uploaded transit file by calling OCR.space.",
    s.actionInput(
      {
        url: s.url("The public image or PDF URL to parse with OCR.space."),
        file: s.transitFile("A local transit image or PDF file to upload to OCR.space."),
        language: s.nonEmptyString("The OCR language code to send upstream."),
        detectOrientation: s.boolean("Whether OCR.space should auto-detect page orientation."),
        scale: s.boolean("Whether OCR.space should scale the input image."),
        isOverlayRequired: s.boolean("Whether OCR.space should return word-level overlay metadata."),
        isTable: s.boolean("Whether OCR.space should apply table-aware parsing when possible."),
        ocrEngine: s.stringEnum(["1", "2", "3"], {
          description: "The OCR engine version to request from OCR.space.",
        }),
      },
      [],
      "Input parameters for extracting text with OCR.space. Provide exactly one of url or file.",
    ),
    s.actionOutput(
      {
        text: s.string("The concatenated OCR text from all successful pages."),
        pages: s.array(pageResult, { description: "The normalized OCR page results returned by OCR.space." }),
        ocrExitCode: s.integer("The top-level OCR exit code returned by OCR.space."),
        isErroredOnProcessing: s.boolean("Whether OCR.space marked the request as errored during processing."),
        errorMessage: nullableString("The top-level OCR error message, when present."),
        errorDetails: nullableString("The top-level OCR error details, when present."),
        processingTimeInMilliseconds: s.string("The OCR processing time in milliseconds returned by OCR.space."),
      },
      "The normalized OCR text extraction result returned by OCR.space.",
    ),
  ),
  action(
    "get_conversion_stats",
    "read",
    "Fetch OCR.space conversion statistics for the current month or the previous month.",
    s.actionInput(
      {
        startDate: s.literal("lastMonth", {
          description: "Set to lastMonth to fetch the previous month's conversion statistics.",
        }),
      },
      [],
      "Input parameters for fetching OCR.space conversion statistics.",
    ),
    s.actionOutput(
      {
        engine1: s.integer("The OCR.space engine 1 conversion count."),
        engine2: s.integer("The OCR.space engine 2 conversion count."),
        total: s.integer("The total OCR.space conversion count."),
        period: s.stringEnum(["currentMonth", "lastMonth"], {
          description: "The logical period represented by the returned conversion counts.",
        }),
      },
      "The normalized OCR.space conversion statistics returned by OCR.space.",
    ),
  ),
];

function action(
  name: OcrspaceActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}
