import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "platerecognizer";

const boxSchema = s.actionOutput({
  xmin: s.integer("The left edge of the detected box in pixels."),
  ymin: s.integer("The top edge of the detected box in pixels."),
  xmax: s.integer("The right edge of the detected box in pixels."),
  ymax: s.integer("The bottom edge of the detected box in pixels."),
});

const scoredRegionSchema = s.actionOutput({
  code: s.nonEmptyString("The upstream region or country code."),
  score: s.number("The confidence score for the returned region code."),
});

const scoredCandidateSchema = s.actionOutput({
  plate: s.nonEmptyString("One alternative normalized plate candidate."),
  score: s.number("The confidence score for this plate candidate."),
});

const vehicleSchema = s.actionOutput({
  score: s.number("The confidence score for the detected vehicle."),
  type: s.nonEmptyString("The detected vehicle type, such as Sedan or SUV."),
  box: boxSchema,
});

const scoredLabelSchema = s.looseRequiredObject(
  "A scored prediction object returned by optional Plate Recognizer MMC features.",
  {
    score: s.number("The confidence score for this prediction."),
  },
);

const yearSchema = s.actionOutput({
  year_range: s.array(
    "The inclusive year range returned by the optional MMC feature.",
    s.integer("One year boundary returned by Plate Recognizer."),
    { minItems: 2, maxItems: 2 },
  ),
  score: s.number("The confidence score for the year range prediction."),
});

const resultSchema = s.object(
  "One recognized number plate result returned by Plate Recognizer.",
  {
    box: boxSchema,
    plate: s.nonEmptyString("The normalized plate string returned by Plate Recognizer."),
    region: scoredRegionSchema,
    score: s.number("The confidence score for the selected plate result."),
    dscore: s.number("The detector confidence score for the plate region."),
    vehicle: vehicleSchema,
    candidates: s.array("Alternative plate candidates returned for the same detection.", scoredCandidateSchema),
    model_make: s.array("Optional make and model predictions returned by MMC.", scoredLabelSchema),
    color: s.array("Optional color predictions returned by MMC.", scoredLabelSchema),
    orientation: s.array("Optional orientation predictions returned by MMC.", scoredLabelSchema),
    year: yearSchema,
    direction: s.number("Optional direction of travel in degrees returned when direction=true."),
    direction_score: s.number("Confidence score for the optional direction prediction."),
  },
  { optional: ["model_make", "color", "orientation", "year", "direction", "direction_score"] },
);

export const platerecognizerActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "read_number_plates",
    operationType: "read",
    description:
      "Read number plates from one image by calling Plate Recognizer Snapshot Cloud and returning normalized detections.",
    inputSchema: s.object(
      "Input payload for reading number plates from one image with Plate Recognizer. Provide exactly one of uploadUrl, uploadBase64, or file. direction requires mmc=true.",
      {
        uploadUrl: s.nonEmptyString("The public image URL to process instead of uploading raw bytes."),
        uploadBase64: s.nonEmptyString("The Base64-encoded image content to send as the upload field."),
        file: s.transitFile("Image file uploaded through POST /api/files."),
        regions: s.stringArray("Optional list of country or state codes used to bias recognition.", { minItems: 1 }),
        cameraId: s.nonEmptyString("Optional camera identifier sent to Plate Recognizer."),
        timestamp: s.dateTime("Optional UTC ISO 8601 timestamp associated with the image."),
        mmc: s.boolean("Whether to request optional make, model, color, orientation, and year predictions."),
        direction: s.boolean("Whether to request optional direction-of-travel prediction. Requires mmc=true."),
        config: s.looseObject(
          "Additional engine configuration forwarded as JSON. config.detection_mode=vehicle is not supported in this first pass.",
        ),
      },
    ),
    outputSchema: s.actionOutput({
      processingTime: s.number("The processing time in milliseconds reported upstream."),
      filename: s.nullableString("The processed filename returned by Plate Recognizer."),
      cameraId: s.nullableString("The camera identifier echoed back by Plate Recognizer, when present."),
      timestamp: s.nullableString("The timestamp echoed back by Plate Recognizer, when present."),
      results: s.array("Recognized number plate results returned for the image.", resultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_statistics",
    operationType: "read",
    description: "Retrieve current-month Plate Recognizer Snapshot Cloud usage and reset information.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      usage: s.actionOutput({
        month: s.integer("The current billing month number."),
        calls: s.integer("The number of recognition calls used this month."),
        year: s.integer("The current billing year."),
        resetsOn: s.dateTime("When the Plate Recognizer monthly counter resets."),
      }),
      totalCalls: s.integer("The maximum number of calls allowed during the current period."),
    }),
  }),
];
