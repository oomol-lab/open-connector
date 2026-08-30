import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bland_ai" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const rawObjectSchema = s.looseObject("The raw object returned by Bland AI.");
const nullableString = (description: string) => s.nullable(s.string(description));
const nullableNumber = (description: string) => s.nullable(s.number(description));
const nullableInteger = (description: string) => s.nullable(s.integer(description));
const nullableBoolean = (description: string) => s.nullable(s.boolean(description));

const callSchema = s.object("A normalized Bland AI call.", {
  callId: s.string("Unique id of the call."),
  createdAt: nullableString("Timestamp when the call request was created."),
  startedAt: nullableString("Timestamp when the call connected when provided."),
  endedAt: nullableString("Timestamp when the call ended when provided."),
  callLength: nullableNumber("Call length in minutes when provided."),
  fromNumber: nullableString("Phone number that initiated the call when provided."),
  toNumber: nullableString("Phone number that received the call when provided."),
  completed: nullableBoolean("Whether the call has completed when provided."),
  inbound: nullableBoolean("Whether the call was inbound when provided."),
  queueStatus: nullableString("Bland queue status when provided."),
  status: nullableString("Most up-to-date call status when provided."),
  answeredBy: nullableString("Answer classification such as human, voicemail, or no-answer."),
  errorMessage: nullableString("Error message recorded by Bland when provided."),
  batchId: nullableString("Batch id associated with the call when provided."),
  recordingUrl: nullableString("Recording URL when the call was recorded and Bland provides it."),
  summary: nullableString("Generated call summary when provided."),
  raw: rawObjectSchema,
});

const transcriptSchema = s.object("A normalized Bland AI transcript phrase.", {
  id: nullableString("Unique phrase id when provided."),
  createdAt: nullableString("Timestamp when this transcript phrase was created."),
  text: s.string("Transcript phrase text."),
  user: nullableString("Speaker label such as user, assistant, robot, or agent-action."),
  raw: rawObjectSchema,
});

const voiceSchema = s.object("A normalized Bland AI voice.", {
  id: s.string("UUID of the Bland voice."),
  name: s.string("Display name of the voice."),
  description: nullableString("Human-readable voice description when provided."),
  isPublic: nullableBoolean("Whether the voice is public or curated when provided."),
  tags: s.array("Labels describing the voice.", s.string("One voice tag.")),
  userId: nullableString("Owner UUID when provided."),
  voiceId: nullableString("Underlying model identifier when provided."),
  service: nullableString("Bland TTS engine identifier when provided."),
  finetuned: nullableBoolean("Whether the voice has been fine-tuned when provided."),
  isCreatorVoice: nullableBoolean("Whether the voice is a creator-program voice when provided."),
  ratings: nullableInteger("Total number of voice ratings when provided."),
  averageRating: nullableNumber("Average voice rating when provided."),
  myRating: nullableNumber("Authenticated user's rating when provided."),
  creatorDisplayName: nullableString("Creator display name when provided."),
  raw: rawObjectSchema,
});

export const blandAiActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve Bland AI account status, billing balance, and total call count.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving Bland AI account details.", {}),
    outputSchema: s.object("Bland AI account details.", {
      status: s.string("Current Bland AI account status."),
      billing: rawObjectSchema,
      currentBalance: nullableNumber("Current account credit balance when provided."),
      refillTo: nullableNumber("Auto-refill target balance when provided."),
      totalCalls: nullableInteger("Total number of calls made by the account when provided."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List Bland AI calls with optional official filters and result-window controls.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Bland AI calls.",
      {
        fromNumber: nonEmptyString("Filter calls by the number that initiated the call."),
        toNumber: nonEmptyString("Filter calls by the number that answered the call."),
        from: s.nonNegativeInteger("Starting index, inclusive, for the call result window."),
        to: s.nonNegativeInteger("Ending index for the call result window."),
        limit: s.positiveInteger("Maximum number of calls to return."),
        ascending: s.boolean("Whether to sort calls ascending by creation time."),
        sortBy: s.stringEnum("Field to sort calls by.", ["created_at", "updated_at"]),
        startDate: nonEmptyString("Start date or ISO datetime for filtering calls."),
        endDate: nonEmptyString("End date or ISO datetime for filtering calls."),
        createdAt: nonEmptyString("Specific call creation date in YYYY-MM-DD format."),
        timezone: nonEmptyString("IANA timezone for interpreting date-only filters."),
        updateStartDate: nonEmptyString("Start date for filtering calls by update date."),
        updateEndDate: nonEmptyString("End date for filtering calls by update date."),
        completed: s.boolean("Whether to filter calls by completed status."),
        batchId: nonEmptyString("Filter calls by Bland batch id."),
        answeredBy: nonEmptyString("Filter calls by answer classification."),
        inbound: s.boolean("Whether to filter inbound calls."),
        durationGt: s.number("Filter calls with call length greater than this minute value."),
        durationLt: s.number("Filter calls with call length less than this minute value."),
        campaignId: nonEmptyString("Filter calls by campaign id."),
      },
      {
        optional: [
          "fromNumber",
          "toNumber",
          "from",
          "to",
          "limit",
          "ascending",
          "sortBy",
          "startDate",
          "endDate",
          "createdAt",
          "timezone",
          "updateStartDate",
          "updateEndDate",
          "completed",
          "batchId",
          "answeredBy",
          "inbound",
          "durationGt",
          "durationLt",
          "campaignId",
        ],
      },
    ),
    outputSchema: s.object("Bland AI call list response.", {
      totalCount: nullableInteger("Total number of calls matching the filters when provided."),
      count: nullableInteger("Number of calls returned when provided."),
      calls: s.array("Calls returned by Bland AI.", callSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Retrieve detailed information and transcript phrases for a Bland AI call.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Bland AI call.", {
      callId: nonEmptyString("Unique id of the call to retrieve."),
    }),
    outputSchema: s.object("Bland AI call details response.", {
      call: callSchema,
      transcripts: s.array("Transcript phrases returned for the call.", transcriptSchema),
      concatenatedTranscript: nullableString("Single combined transcript text when provided."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_voices",
    description: "List every Bland AI voice available to the authenticated account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Bland AI voices.", {}),
    outputSchema: s.object("Bland AI voice list response.", {
      voices: s.array("Voices returned by Bland AI.", voiceSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_voice",
    description: "Retrieve details for a specific Bland AI voice by UUID or curated voice name.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Bland AI voice.", {
      voiceId: nonEmptyString("Voice UUID or curated voice name."),
    }),
    outputSchema: s.object("Bland AI voice details response.", {
      voice: voiceSchema,
    }),
  }),
];
