import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "klangio";

const uuidSchema = s.uuid("The Klangio transcription job UUID.");

const uploadFileSchema: JsonSchema = {
  ...s.object(
    "An audio file uploaded to Klangio as multipart/form-data.",
    {
      fileName: s.nonEmptyString(
        "The filename sent in the multipart file field. Required when using contentBase64; optional for URL inputs.",
      ),
      url: s.url(
        "A public HTTP or HTTPS URL for the audio file. When both url and contentBase64 are provided, url is used.",
      ),
      contentBase64: s.string("Base64-encoded audio file bytes, used only when url is not provided."),
      mimeType: s.nonEmptyString("The MIME type sent for the uploaded audio file."),
    },
    { optional: ["fileName", "url", "contentBase64", "mimeType"] },
  ),
  anyOf: [{ required: ["url"] }, { required: ["contentBase64", "fileName"] }],
};

const transcriptionModelSchema = s.stringEnum("The Klangio transcription model to use for the audio file.", [
  "piano",
  "guitar",
  "bass",
  "vocal",
  "universal",
  "lead",
  "detect",
  "drums",
  "multi",
  "wind",
  "string",
  "piano_arrangement",
]);

const jobOutputSchema = s.stringEnum("A generated output requested from Klangio.", [
  "mxml",
  "midi",
  "pdf",
  "gp5",
  "json",
  "midi_quant",
]);

const chordVocabularySchema = s.stringEnum("The chord recognition vocabulary used by Klangio.", [
  "major-minor",
  "full",
]);

const sourceSeparationModelSchema = s.stringEnum("The source separation model to use.", ["six-stems", "four-stems"]);

const sourceSeparationOutputSchema = s.stringEnum("The source separation audio output format.", ["wav", "mp3"]);

const stemTypeSchema = s.stringEnum("The source separation stem to download.", [
  "vocals",
  "bass",
  "drums",
  "other",
  "piano",
  "guitar",
]);

const jobStatusSchema = s.stringEnum("The Klangio job status.", [
  "IN_QUEUE",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);

const generatedOutputsSchema = s.object("Generated output flags returned for a transcription job.", {
  mxml: s.boolean("Whether Klangio accepted MusicXML generation."),
  midi: s.boolean("Whether Klangio accepted unquantized MIDI generation."),
  midiQuant: s.boolean("Whether Klangio accepted quantized MIDI generation."),
  gp5: s.boolean("Whether Klangio accepted GP5 generation."),
  pdf: s.boolean("Whether Klangio accepted PDF generation."),
});

const jobResponseSchema = s.object(
  "A Klangio job creation response.",
  {
    jobId: uuidSchema,
    creationDate: s.date("The date when Klangio created the job."),
    deletionDate: s.date("The date until Klangio keeps the job data available."),
    statusEndpointUrl: s.string("The Klangio endpoint URL for polling job status."),
    generatedOutputs: generatedOutputsSchema,
  },
  { optional: ["generatedOutputs"] },
);

const downloadableFileSchema = s.object("A downloadable file uploaded to connector transit storage.", {
  name: s.nonEmptyString("The generated filename."),
  mimetype: s.nonEmptyString("The MIME type of the generated file."),
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local transit download URL."),
  sizeBytes: s.integer("The generated file size in bytes.", { minimum: 0 }),
  mimeType: s.nonEmptyString("The MIME type of the generated file."),
});

const createTranscriptionJobInputSchema = s.object(
  "Input payload for creating a Klangio transcription job.",
  {
    file: uploadFileSchema,
    model: transcriptionModelSchema,
    outputs: s.array("Generated outputs to request from Klangio.", jobOutputSchema, { minItems: 1 }),
    title: s.nonEmptyString("The optional score title for the transcription."),
    composer: s.nonEmptyString("The optional score composer for the transcription."),
    webhookUrl: s.url("The webhook URL Klangio should call for job updates."),
  },
  { optional: ["title", "composer", "webhookUrl"] },
);

const fileAndWebhookInputSchema = s.object(
  "Input payload for creating a Klangio audio analysis job.",
  {
    file: uploadFileSchema,
    webhookUrl: s.url("The webhook URL Klangio should call for job updates."),
  },
  { optional: ["webhookUrl"] },
);

const chordRecognitionInputSchema = s.object(
  "Input payload for creating a Klangio chord recognition job.",
  {
    file: uploadFileSchema,
    vocabulary: chordVocabularySchema,
    webhookUrl: s.url("The webhook URL Klangio should call for job updates."),
  },
  { optional: ["webhookUrl"] },
);

const sourceSeparationInputSchema = s.object(
  "Input payload for creating a Klangio source separation job.",
  {
    file: uploadFileSchema,
    model: sourceSeparationModelSchema,
    output: sourceSeparationOutputSchema,
    webhookUrl: s.url("The webhook URL Klangio should call for job updates."),
  },
  { optional: ["model", "output", "webhookUrl"] },
);

const getJobStatusInputSchema = s.object("Input payload for fetching a Klangio job status.", {
  jobId: uuidSchema,
});

const getJobStatusOutputSchema = s.object(
  "The Klangio job status response.",
  {
    status: jobStatusSchema,
    error: s.nullable(s.string("The provider error message associated with the job status.")),
  },
  { optional: ["error"] },
);

const downloadJobResultInputSchema = s.object("Input payload for downloading a generated Klangio job result file.", {
  jobId: uuidSchema,
  resultType: jobOutputSchema,
});

const downloadSourceSeparationAudioInputSchema = s.object(
  "Input payload for downloading a Klangio source separation stem audio file.",
  {
    jobId: uuidSchema,
    stemType: stemTypeSchema,
  },
);

const downloadFileOutputSchema = s.object("The output payload for a downloaded Klangio result file.", {
  file: downloadableFileSchema,
  contentType: s.nonEmptyString("The MIME type of the downloaded result file."),
  contentLength: s.integer("The result file size in bytes.", { minimum: 0 }),
});

function defineKlangioAction(input: {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    requiredScopes: [],
    ...input,
  });
}

export const klangioActions: ActionDefinition[] = [
  defineKlangioAction({
    name: "create_transcription_job",
    operationType: "write",
    description: "Create a Klangio transcription job from a URL or Base64 audio file and requested score outputs.",
    inputSchema: createTranscriptionJobInputSchema,
    outputSchema: jobResponseSchema,
  }),
  defineKlangioAction({
    name: "create_chord_recognition_job",
    operationType: "write",
    description: "Create a Klangio chord recognition job from a URL or Base64 audio file.",
    inputSchema: chordRecognitionInputSchema,
    outputSchema: jobResponseSchema,
  }),
  defineKlangioAction({
    name: "create_chord_recognition_extended_job",
    operationType: "write",
    description: "Create a Klangio chord recognition job with extended key detection from a URL or Base64 audio file.",
    inputSchema: chordRecognitionInputSchema,
    outputSchema: jobResponseSchema,
  }),
  defineKlangioAction({
    name: "create_beat_tracking_job",
    operationType: "write",
    description: "Create a Klangio beat and downbeat tracking job from a URL or Base64 audio file.",
    inputSchema: fileAndWebhookInputSchema,
    outputSchema: jobResponseSchema,
  }),
  defineKlangioAction({
    name: "create_strum_recognition_job",
    operationType: "write",
    description: "Create a Klangio guitar strum recognition job from a URL or Base64 audio file.",
    inputSchema: fileAndWebhookInputSchema,
    outputSchema: jobResponseSchema,
  }),
  defineKlangioAction({
    name: "create_source_separation_job",
    operationType: "write",
    description: "Create a Klangio source separation job from a URL or Base64 audio file.",
    inputSchema: sourceSeparationInputSchema,
    outputSchema: jobResponseSchema,
  }),
  defineKlangioAction({
    name: "get_job_status",
    operationType: "read",
    description: "Fetch the current processing status for a Klangio job.",
    inputSchema: getJobStatusInputSchema,
    outputSchema: getJobStatusOutputSchema,
  }),
  defineKlangioAction({
    name: "download_job_result",
    operationType: "read",
    description: "Download a generated Klangio job result file and upload it to local transit storage.",
    inputSchema: downloadJobResultInputSchema,
    outputSchema: downloadFileOutputSchema,
  }),
  defineKlangioAction({
    name: "download_source_separation_audio",
    operationType: "read",
    description: "Download a Klangio source separation stem audio file and upload it to local transit storage.",
    inputSchema: downloadSourceSeparationAudioInputSchema,
    outputSchema: downloadFileOutputSchema,
  }),
];
