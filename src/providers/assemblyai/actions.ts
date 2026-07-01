import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "assemblyai";

const transcriptIdSchema = s.nonEmptyString("The unique identifier of the AssemblyAI transcript.");
const transcriptStatusSchema = s.stringEnum("The current processing status of the transcript.", [
  "queued",
  "processing",
  "completed",
  "error",
]);
const speechModelSchema = s.stringEnum("The AssemblyAI speech model to use for transcription.", [
  "best",
  "nano",
  "slam-1",
  "universal",
  "universal-2",
  "universal-1",
]);
const rawObjectSchema = s.looseObject("The raw AssemblyAI response payload.");

const transcriptSchema = s.looseObject("A transcript object returned by AssemblyAI.", {
  id: s.nullable(s.string("The unique identifier of the transcript.")),
  status: s.nullable(transcriptStatusSchema),
  text: s.nullable(s.string("The completed transcript text.")),
  audio_url: s.nullable(s.string("The URL of the media that was transcribed.")),
  error: s.nullable(s.string("The error message returned when transcription failed.")),
  confidence: s.nullable(s.number("The confidence score for the transcript.")),
  audio_duration: s.nullable(s.number("The duration of the audio file in seconds.")),
  language_code: s.nullable(s.string("The detected or requested language code.")),
  created: s.nullable(s.string("The timestamp when the transcript was created.")),
  completed: s.nullable(s.string("The timestamp when the transcript completed.")),
});

const pageDetailsSchema = s.looseObject("Pagination details returned by AssemblyAI.", {
  limit: s.nullable(s.integer("The maximum number of transcripts requested.")),
  result_count: s.nullable(s.integer("The number of transcripts returned on the current page.")),
  current_url: s.nullable(s.string("The URL for the current page.")),
  prev_url: s.nullable(s.string("The URL for the previous page of older transcripts.")),
  next_url: s.nullable(s.string("The URL for the next page of newer transcripts.")),
});

const wordSchema = s.looseObject("A word timing entry returned by AssemblyAI.", {
  text: s.nullable(s.string("The transcribed word text.")),
  start: s.nullable(s.integer("The word start time in milliseconds.")),
  end: s.nullable(s.integer("The word end time in milliseconds.")),
  confidence: s.nullable(s.number("The confidence score for the word.")),
  speaker: s.nullable(s.string("The speaker label for the word when speaker labels are enabled.")),
});

const textSegmentSchema = s.looseObject("A sentence or paragraph segment returned by AssemblyAI.", {
  text: s.nullable(s.string("The segment transcript text.")),
  start: s.nullable(s.integer("The segment start time in milliseconds.")),
  end: s.nullable(s.integer("The segment end time in milliseconds.")),
  confidence: s.nullable(s.number("The confidence score for the segment.")),
  speaker: s.nullable(s.string("The speaker label for the segment when speaker labels are enabled.")),
  words: s.array("The word timing entries in the segment.", wordSchema),
});

export const assemblyaiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_transcript",
    description: "Create an AssemblyAI transcript from an audio or video file URL.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for creating an AssemblyAI transcript.",
      {
        audioUrl: s.url("The URL of the audio or video file to transcribe."),
        speechModel: speechModelSchema,
        languageCode: s.nonEmptyString("The language code of the audio file, such as en_us or es."),
        languageDetection: s.boolean("Whether AssemblyAI should detect the spoken language."),
        punctuate: s.boolean("Whether AssemblyAI should add punctuation to the transcript."),
        formatText: s.boolean("Whether AssemblyAI should format text in the transcript."),
        speakerLabels: s.boolean("Whether AssemblyAI should identify speakers in the transcript."),
        speakersExpected: s.integer("The expected number of speakers in the audio."),
        multichannel: s.boolean("Whether the audio has multiple channels to transcribe separately."),
        audioStartFrom: s.integer("The millisecond timestamp where transcription should start."),
        audioEndAt: s.integer("The millisecond timestamp where transcription should stop."),
        filterProfanity: s.boolean("Whether AssemblyAI should filter profanity in the transcript."),
        autoHighlights: s.boolean("Whether AssemblyAI should extract key phrases."),
        sentimentAnalysis: s.boolean("Whether AssemblyAI should run sentiment analysis."),
        entityDetection: s.boolean("Whether AssemblyAI should detect named entities."),
        webhookUrl: s.url("The webhook URL AssemblyAI should call when processing completes."),
        webhookAuthHeaderName: s.nonEmptyString("The webhook authentication header name."),
        webhookAuthHeaderValue: s.nonEmptyString("The webhook authentication header value."),
      },
      {
        optional: [
          "speechModel",
          "languageCode",
          "languageDetection",
          "punctuate",
          "formatText",
          "speakerLabels",
          "speakersExpected",
          "multichannel",
          "audioStartFrom",
          "audioEndAt",
          "filterProfanity",
          "autoHighlights",
          "sentimentAnalysis",
          "entityDetection",
          "webhookUrl",
          "webhookAuthHeaderName",
          "webhookAuthHeaderValue",
        ],
      },
    ),
    outputSchema: s.object("The response returned when creating an AssemblyAI transcript.", {
      transcript: transcriptSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_transcript",
    description: "Get one AssemblyAI transcript by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving an AssemblyAI transcript.", {
      transcriptId: transcriptIdSchema,
    }),
    outputSchema: s.object("The response returned when retrieving an AssemblyAI transcript.", {
      transcript: transcriptSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_transcripts",
    description: "List AssemblyAI transcripts created by the current API key.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing AssemblyAI transcripts.",
      {
        limit: s.integer("The maximum number of transcripts to retrieve.", { minimum: 1, maximum: 200 }),
        status: transcriptStatusSchema,
        createdOn: s.date("Only return transcripts created on this date."),
        beforeId: s.nonEmptyString("Return transcripts created before this transcript ID."),
        afterId: s.nonEmptyString("Return transcripts created after this transcript ID."),
      },
      { optional: ["limit", "status", "createdOn", "beforeId", "afterId"] },
    ),
    outputSchema: s.object("The response returned when listing AssemblyAI transcripts.", {
      transcripts: s.array("The transcript records returned by AssemblyAI.", transcriptSchema),
      pageDetails: pageDetailsSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_transcript",
    description: "Delete one AssemblyAI transcript by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting an AssemblyAI transcript.", {
      transcriptId: transcriptIdSchema,
    }),
    outputSchema: s.object("The response returned when deleting an AssemblyAI transcript.", {
      transcript: transcriptSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_transcript_sentences",
    description: "Get an AssemblyAI transcript split into sentences.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving transcript sentences.", {
      transcriptId: transcriptIdSchema,
    }),
    outputSchema: s.object("The response returned when retrieving transcript sentences.", {
      id: s.nullable(s.string("The unique identifier of the transcript.")),
      confidence: s.nullable(s.number("The confidence score for the transcript.")),
      audioDuration: s.nullable(s.number("The duration of the audio file in seconds.")),
      sentences: s.array("The transcript sentences returned by AssemblyAI.", textSegmentSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_transcript_paragraphs",
    description: "Get an AssemblyAI transcript split into paragraphs.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving transcript paragraphs.", {
      transcriptId: transcriptIdSchema,
    }),
    outputSchema: s.object("The response returned when retrieving transcript paragraphs.", {
      id: s.nullable(s.string("The unique identifier of the transcript.")),
      confidence: s.nullable(s.number("The confidence score for the transcript.")),
      audioDuration: s.nullable(s.number("The duration of the audio file in seconds.")),
      paragraphs: s.array("The transcript paragraphs returned by AssemblyAI.", textSegmentSchema),
      raw: rawObjectSchema,
    }),
  }),
];

export type AssemblyaiActionName = (typeof assemblyaiActions)[number]["name"];
