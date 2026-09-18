import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gladia";

const rawObjectSchema = s.looseObject("A raw JSON object returned by Gladia.");
const transcriptionStatusSchema = s.stringEnum("The current transcription job status.", [
  "queued",
  "processing",
  "done",
  "error",
]);
const modelSchema = s.stringEnum(
  "The transcription model. solaria-1 is the default; solaria-2 may require a higher tier plan.",
  ["solaria-1", "solaria-2"],
);

const callbackConfigSchema = s.object(
  "Webhook callback configuration for a transcription job.",
  {
    url: s.url("The URL endpoint that receives the transcription callback."),
    method: s.stringEnum("The HTTP method Gladia uses for the callback request.", ["POST", "PUT"]),
  },
  { optional: ["method"] },
);

const flexibleFeatureConfigSchema = s.anyOf("A Gladia feature flag or official feature configuration.", [
  s.boolean("Whether to enable the feature."),
  s.stringArray("Feature-specific string values.", { itemDescription: "One feature-specific string value." }),
  rawObjectSchema,
]);

const languageConfigSchema = s.object("Preferred language handling for the transcription request.", {
  languages: s.stringArray("Preferred language codes for recognition.", {
    itemDescription: "One ISO 639 language code to recognize.",
  }),
  codeSwitching: s.boolean("Whether multilingual code switching is enabled."),
});

const subtitlesConfigSchema = s.object(
  "Subtitle generation configuration.",
  {
    style: s.string("The subtitle styling option."),
    formats: s.stringArray("The subtitle formats Gladia should generate.", {
      itemDescription: "One subtitle format, such as srt or vtt.",
    }),
    maximumDuration: s.number("The maximum caption duration in seconds."),
    minimumDuration: s.number("The minimum caption duration in seconds."),
    maximumRowsPerCaption: s.integer("The maximum number of rows per subtitle caption."),
    maximumCharactersPerRow: s.integer("The maximum number of characters per subtitle row."),
  },
  {
    optional: [
      "style",
      "formats",
      "maximumDuration",
      "minimumDuration",
      "maximumRowsPerCaption",
      "maximumCharactersPerRow",
    ],
  },
);

const diarizationConfigSchema = s.object(
  "Speaker diarization configuration.",
  {
    enhanced: s.boolean("Whether enhanced speaker diarization is enabled."),
    minSpeakers: s.integer("The minimum number of speakers to detect."),
    maxSpeakers: s.integer("The maximum number of speakers to detect."),
    numberOfSpeakers: s.integer("The estimated number of speakers to detect."),
  },
  { optional: ["enhanced", "minSpeakers", "maxSpeakers", "numberOfSpeakers"] },
);

const translationConfigSchema = s.object(
  "Translation configuration for a transcription job.",
  {
    model: s.string("The translation model to use."),
    context: s.string("Contextual prompt for the translation model."),
    targetLanguages: s.stringArray("Target languages for translation.", {
      itemDescription: "One ISO 639 target language code.",
    }),
    contextAdaptation: s.boolean("Whether context adaptation is enabled for translation."),
    matchOriginalUtterances: s.boolean("Whether translated utterances should match the original segmentation."),
    informal: s.boolean("Whether to use informal tone in translation."),
    lipsync: s.boolean("Whether to include lipsync metadata for subtitles."),
  },
  {
    optional: [
      "model",
      "context",
      "targetLanguages",
      "contextAdaptation",
      "matchOriginalUtterances",
      "informal",
      "lipsync",
    ],
  },
);

const summarizationConfigSchema = s.object(
  "Summarization configuration for a transcription job.",
  {
    type: s.string("The summarization type, such as general."),
  },
  { optional: ["type"] },
);

const fileInfoSchema = s.object(
  "File metadata associated with a transcription job.",
  {
    id: s.string("The Gladia file identifier."),
    source: s.string("The original URI or source of the file."),
    filename: s.string("The original file name."),
    audioDuration: s.number("The audio duration in seconds."),
    numberOfChannels: s.integer("The number of audio channels."),
  },
  { optional: ["id", "source", "filename", "audioDuration", "numberOfChannels"] },
);

const transcriptionJobSchema = s.object(
  "A normalized Gladia pre-recorded transcription job.",
  {
    id: s.nonEmptyString("The unique transcription job identifier."),
    requestId: s.string("The request identifier for debugging."),
    version: s.integer("The Gladia API version used for this job."),
    status: transcriptionStatusSchema,
    createdAt: s.string("The ISO timestamp when the job was created."),
    completedAt: s.string("The ISO timestamp when the job completed or failed."),
    kind: s.string("The Gladia job kind, usually pre-recorded."),
    errorCode: s.integer("The upstream error status code."),
    file: fileInfoSchema,
    result: rawObjectSchema,
    requestParams: rawObjectSchema,
    customMetadata: rawObjectSchema,
    postSessionMetadata: rawObjectSchema,
  },
  {
    optional: [
      "requestId",
      "version",
      "createdAt",
      "completedAt",
      "kind",
      "errorCode",
      "file",
      "result",
      "requestParams",
      "customMetadata",
      "postSessionMetadata",
    ],
  },
);

function idInput(description: string): JsonSchema {
  return s.object(description, {
    id: s.nonEmptyString("The ID of the pre-recorded transcription job."),
  });
}

export const gladiaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_file",
    operationType: "write",
    description:
      "Upload an audio or video file up to 100 MiB to Gladia from a local transit file, base64 content, or public URL.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for uploading media to Gladia.",
      {
        file: s.transitFile("A local transit file to upload."),
        contentBase64: s.nonEmptyString("The audio or video file content encoded as base64."),
        sourceUrl: s.url("A public audio or video file URL to upload."),
        fileName: s.nonEmptyString("Optional file name override for base64 or URL sources."),
        mimeType: s.nonEmptyString("Optional MIME type override for base64 or URL sources."),
      },
      { optional: ["file", "contentBase64", "sourceUrl", "fileName", "mimeType"] },
    ),
    outputSchema: s.actionOutput(
      {
        audioUrl: s.string("The Gladia audio URL to pass to start_transcription."),
        metadata: rawObjectSchema,
      },
      "The uploaded Gladia media file.",
    ),
    followUpActions: ["gladia.start_transcription"],
  }),
  defineProviderAction(service, {
    name: "start_transcription",
    operationType: "write",
    description: "Start an asynchronous Gladia pre-recorded transcription job from a public audio or video URL.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for starting a Gladia pre-recorded transcription job.",
      {
        audioUrl: s.url(
          "The URL to an audio or video file. This can be a public URL or a Gladia file URL from the upload endpoint.",
        ),
        model: modelSchema,
        sentences: s.boolean("Whether to enable sentence segmentation."),
        subtitles: s.boolean("Whether to enable subtitle generation."),
        diarization: s.boolean("Whether to identify speakers in the audio."),
        translation: s.boolean("Whether to enable transcription translation."),
        summarization: s.boolean("Whether to enable transcription summarization."),
        punctuationEnhanced: s.boolean("Whether to enable enhanced punctuation and casing."),
        callback: s.boolean("Whether Gladia should send a callback. Defaults to true when callbackConfig is provided."),
        callbackConfig: callbackConfigSchema,
        customVocabulary: flexibleFeatureConfigSchema,
        customSpelling: flexibleFeatureConfigSchema,
        moderation: flexibleFeatureConfigSchema,
        namedEntityRecognition: s.boolean("Whether to enable named entity recognition."),
        chapterization: s.boolean("Whether to enable chapterization."),
        nameConsistency: s.boolean("Whether to improve speaker name consistency."),
        structuredDataExtraction: flexibleFeatureConfigSchema,
        sentimentAnalysis: s.boolean("Whether to enable sentiment analysis."),
        audioToLlm: flexibleFeatureConfigSchema,
        displayMode: s.nonEmptyString("The Gladia display_mode value for transcript formatting."),
        piiRedaction: flexibleFeatureConfigSchema,
        customMetadata: rawObjectSchema,
        languageConfig: languageConfigSchema,
        subtitlesConfig: subtitlesConfigSchema,
        diarizationConfig: diarizationConfigSchema,
        translationConfig: translationConfigSchema,
        summarizationConfig: summarizationConfigSchema,
      },
      {
        optional: [
          "model",
          "sentences",
          "subtitles",
          "diarization",
          "translation",
          "summarization",
          "punctuationEnhanced",
          "callback",
          "callbackConfig",
          "customVocabulary",
          "customSpelling",
          "moderation",
          "namedEntityRecognition",
          "chapterization",
          "nameConsistency",
          "structuredDataExtraction",
          "sentimentAnalysis",
          "audioToLlm",
          "displayMode",
          "piiRedaction",
          "customMetadata",
          "languageConfig",
          "subtitlesConfig",
          "diarizationConfig",
          "translationConfig",
          "summarizationConfig",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        id: s.string("The identifier of the created transcription job."),
        resultUrl: s.string("The URL to fetch the transcription result."),
      },
      "The created Gladia pre-recorded transcription job.",
    ),
    followUpActions: ["gladia.get_transcription"],
  }),
  defineProviderAction(service, {
    name: "get_transcription",
    operationType: "read",
    description: "Retrieve a Gladia pre-recorded transcription job by ID, including results when done.",
    requiredScopes: [],
    inputSchema: idInput("Input parameters for retrieving a Gladia transcription job."),
    outputSchema: s.actionOutput(
      {
        job: transcriptionJobSchema,
      },
      "The retrieved Gladia transcription job.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_transcriptions",
    operationType: "read",
    description:
      "List Gladia pre-recorded transcription jobs with optional pagination, date, status, and metadata filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Gladia transcription jobs.",
      {
        limit: s.positiveInteger("The maximum number of jobs to return."),
        offset: s.nonNegativeInteger("The starting offset for pagination."),
        status: s.array("Statuses to include in the result set.", transcriptionStatusSchema),
        date: s.date("Filter jobs relevant to a specific date in YYYY-MM-DD format."),
        afterDate: s.dateTime("Filter jobs after the specified ISO datetime."),
        beforeDate: s.dateTime("Filter jobs before the specified ISO datetime."),
        customMetadata: rawObjectSchema,
      },
      { optional: ["limit", "offset", "status", "date", "afterDate", "beforeDate", "customMetadata"] },
    ),
    outputSchema: s.actionOutput(
      {
        first: s.string("The URL for the first result page."),
        current: s.string("The URL for the current result page."),
        next: s.nullableString("The URL for the next result page."),
        items: s.array("The returned transcription jobs.", transcriptionJobSchema),
      },
      "A page of Gladia pre-recorded transcription jobs.",
      ["items"],
    ),
  }),
  defineProviderAction(service, {
    name: "download_transcription_audio",
    operationType: "read",
    description:
      "Download the original audio file for a Gladia pre-recorded transcription and store it in local transit storage.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for downloading a Gladia transcription audio file.",
      {
        id: s.nonEmptyString("The ID of the pre-recorded transcription job."),
        fileName: s.nonEmptyString("Optional file name to use for the transit audio file."),
        mimeType: s.nonEmptyString("Optional MIME type override for the transit audio file."),
      },
      { optional: ["fileName", "mimeType"] },
    ),
    outputSchema: s.actionOutput(
      {
        id: s.string("The Gladia pre-recorded transcription job ID."),
        name: s.string("The file name used for the transit upload."),
        mimeType: s.string("The MIME type of the downloaded audio file."),
        sizeBytes: s.nullableInteger("The downloaded audio size in bytes, when reported by Gladia."),
        fileId: s.string("The local transit file ID."),
        downloadUrl: s.string("A local transit URL for downloading the original audio file."),
      },
      "The original transcription audio stored in local transit storage.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_transcription",
    operationType: "destructive",
    description: "Delete a Gladia pre-recorded transcription job and its associated data.",
    requiredScopes: [],
    inputSchema: idInput("Input parameters for deleting a Gladia transcription job."),
    outputSchema: s.actionOutput(
      {
        statusCode: s.integer("The HTTP status code returned by Gladia."),
        message: s.string("The deletion response message, when provided."),
      },
      "The deletion result returned by Gladia.",
      ["statusCode"],
    ),
  }),
];
