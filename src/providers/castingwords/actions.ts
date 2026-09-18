import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "castingwords";
const transcriptionLifecycle = {
  startActionId: "castingwords.submit_transcription",
  statusActionId: "castingwords.get_transcription_status",
};

function transcriptFormatSchema(description: string) {
  return s.stringEnum(description, ["txt", "html"]);
}

const serviceTierSchema = s.stringEnum(
  "The transcription tier: TRANS14 for Budget, TRANS2 for 1-Day, or TRANS6/TRANS7 for 7-Day service.",
  ["TRANS14", "TRANS2", "TRANS6", "TRANS7"],
);
const addonSchema = s.stringEnum(
  "An add-on SKU: DIFFQ2 for difficult audio, TSTMP1 for timestamps, or VERBATIM1 for verbatim transcription.",
  ["DIFFQ2", "TSTMP1", "VERBATIM1"],
);
const normalizedStatusSchema = s.stringEnum("The normalized lifecycle state used for Connector polling.", [
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
]);

export const castingwordsActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_transcription",
    operationType: "write",
    description: "Submit one publicly accessible audio or video URL for asynchronous human transcription.",
    inputSchema: s.actionInput(
      {
        mediaUrl: s.url("A directly downloadable public audio or video URL that CastingWords should transcribe."),
        serviceTier: serviceTierSchema,
        addons: s.array("Optional add-on SKUs applied to the transcription.", addonSchema, {
          minItems: 1,
        }),
        speakerNames: s.stringArray("Speaker names that help transcribers identify people in the recording.", {
          minItems: 1,
          itemDescription: "One speaker name.",
        }),
        notes: s.nonEmptyString("Instructions or context for the transcribers."),
        test: s.boolean(
          "Whether to create a no-charge test order that validates the media URL without producing a real transcript.",
        ),
      },
      ["mediaUrl", "serviceTier"],
      "A URL-based CastingWords transcription order.",
    ),
    outputSchema: s.actionOutput(
      {
        orderId: s.string("The CastingWords order identifier."),
        audiofileId: s.positiveInteger(
          "The CastingWords audio file identifier used for status and transcript requests.",
        ),
        message: s.nullableString("The order result message when CastingWords returned one."),
        raw: s.unknownObject("The raw CastingWords order response."),
      },
      "The accepted CastingWords transcription order.",
    ),
    followUpActions: ["castingwords.get_transcription_status", "castingwords.get_transcript"],
    asyncLifecycle: transcriptionLifecycle,
  }),
  defineProviderAction(service, {
    name: "get_transcription_status",
    operationType: "read",
    description: "Get the current CastingWords processing state and documented audio file details.",
    inputSchema: s.actionInput(
      {
        audiofileId: s.positiveInteger("The CastingWords audio file identifier."),
      },
      ["audiofileId"],
      "A CastingWords transcription status request.",
    ),
    outputSchema: s.actionOutput(
      {
        audiofileId: s.positiveInteger("The CastingWords audio file identifier."),
        status: normalizedStatusSchema,
        providerStatus: s.string("The original CastingWords statename value."),
        details: s.unknownObject("The documented CastingWords audio file details."),
      },
      "The normalized CastingWords transcription state.",
    ),
    followUpActions: ["castingwords.get_transcript"],
    asyncLifecycle: transcriptionLifecycle,
  }),
  defineProviderAction(service, {
    name: "get_transcript",
    operationType: "read",
    description: "Retrieve a completed CastingWords transcript as plain text or HTML.",
    inputSchema: s.actionInput(
      {
        audiofileId: s.positiveInteger("The CastingWords audio file identifier."),
        format: transcriptFormatSchema("The requested text transcript format. Defaults to txt."),
        test: s.boolean("Whether to request the official fake transcript response for supported test audio file IDs."),
      },
      ["audiofileId"],
      "A CastingWords transcript retrieval request.",
    ),
    outputSchema: s.actionOutput(
      {
        format: transcriptFormatSchema("The returned transcript format."),
        transcript: s.string("The transcript content as plain text or HTML."),
      },
      "The retrieved CastingWords transcript.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_prepay_balance",
    operationType: "read",
    description: "Get the current CastingWords prepay balance in US dollars.",
    inputSchema: s.actionInput({}, [], "No input is required to read the prepay balance."),
    outputSchema: s.actionOutput(
      {
        balance: s.string("The current prepay balance in US dollars."),
        raw: s.unknownObject("The raw CastingWords balance response."),
      },
      "The CastingWords prepay balance response.",
    ),
  }),
];
