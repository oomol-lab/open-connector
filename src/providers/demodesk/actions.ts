import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "demodesk";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const limit = s.integer("Maximum number of items to return. Demodesk allows 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const cursor = nonEmptyString("Opaque cursor returned by a previous Demodesk list response.");
const language = s.string({
  pattern: "^[a-z]{2}(-[A-Z]{2})?$",
  description: "Language code used to request an on-the-fly translation.",
});
const transcriptFormat = s.stringEnum("Transcript response format to request from Demodesk.", ["json", "plaintext"]);
const filterValue = s.anyOf("A Demodesk recording filter value.", [
  s.string("A single filter value."),
  s.array(s.string("One filter value."), {
    minItems: 1,
    description: "Multiple filter values for an in-style recording filter.",
  }),
]);
const recordingFilters = s.record(
  "Demodesk recording filters keyed by documented Ransack-style names, such as host_eq or status_in.",
  filterValue,
);
const tokenInput = s.actionInput(
  { token: nonEmptyString("Public Demodesk recording token.") },
  ["token"],
  "A Demodesk recording token input.",
);
const recordingTokens = {
  ...s.array(nonEmptyString("One public Demodesk recording token."), {
    minItems: 1,
    maxItems: 100,
    description: "Public Demodesk recording tokens.",
  }),
  uniqueItems: true,
};

const paginatedMeta = s.object(
  {
    hasNext: s.boolean("Whether another page is available."),
    limit: s.integer("Page size used by Demodesk."),
    nextCursor: s.nullableString("Cursor for the next page when available."),
  },
  { required: ["hasNext", "limit", "nextCursor"], description: "Demodesk pagination metadata." },
);

const group = s.looseObject("A Demodesk group.", {
  groupId: s.string("Internal Demodesk group ID."),
  groupName: s.string("Human-readable Demodesk group name."),
});
const user = s.looseObject("A Demodesk user profile.", {
  id: s.string("Internal Demodesk user ID."),
  firstName: s.string("First name of the user."),
  lastName: s.string("Last name of the user."),
  email: s.email("Primary email address of the user."),
  role: s.stringEnum("Role of the user within the company.", ["user", "manager", "company_admin"]),
  locale: s.string("Locale of the user."),
  timeZone: s.string("IANA time zone of the user."),
  groups: s.array(group, { description: "Groups the current user belongs to when returned by Demodesk." }),
});
const recordingStatus = s.stringEnum("Demodesk recording status.", [
  "pending",
  "ready",
  "failure",
  "cancelled",
  "expired",
]);
const postprocessingStatus = s.stringEnum("Demodesk post-processing status.", [
  "pending",
  "done",
  "failed",
  "too_short",
]);
const access = s.stringEnum("Demodesk recording access permission level.", [
  "company_wide",
  "selected_groups",
  "host_and_participants",
  "host_only",
]);
const recording = s.looseObject("A Demodesk recording.", {
  recordingToken: s.string("Public recording token identifier."),
  recordingId: s.string("Internal recording ID as a string."),
  demoId: s.string("Internal demo ID as a string."),
  userId: s.integer("ID of the demo host user."),
  name: s.nullableString("Recording name when present."),
  recordingWebUrl: s.url("URL to the recording view in Demodesk."),
  temporaryDirectUrl: s.nullable(s.url("Temporary direct video file URL when available.")),
  status: recordingStatus,
  createdAt: s.dateTime("Timestamp when the recording was created."),
  updatedAt: s.dateTime("Timestamp when the recording was last updated."),
  demoStartDate: s.nullable(s.dateTime("Meeting start timestamp when available.")),
  durationMs: s.nullableInteger("Recording duration in milliseconds when available."),
  postprocessingStatus: s.nullable(postprocessingStatus),
  access,
  groupIds: s.array(s.string("A group ID."), { description: "Group IDs assigned to the demo in list responses." }),
  host: s.nullable(s.looseObject("Resolved recording host when present.")),
  audioOnly: s.boolean("Whether the recording is audio-only."),
  attendeeClassification: s.nullableString("Demodesk attendee classification when present."),
  meetingLocation: s.looseObject("Meeting location metadata returned by Demodesk."),
  participants: s.array(s.looseObject("A Demodesk recording participant."), {
    description: "Participants returned on a recording detail response.",
  }),
  groups: s.array(group, { description: "Groups assigned to the recording in detail responses." }),
  statistics: s.looseObject("Demodesk recording statistics."),
});
const transcriptSpeaker = s.object(
  { displayName: s.nullableString("Speaker display name when available.") },
  { required: ["displayName"], description: "A transcript speaker." },
);
const transcriptSentence = s.object(
  {
    startInSeconds: s.number("Sentence start time in seconds."),
    endInSeconds: s.number("Sentence end time in seconds."),
    text: s.string("Sentence text."),
  },
  { required: ["startInSeconds", "endInSeconds", "text"], description: "A transcript sentence." },
);
const transcriptParagraph = s.object(
  {
    startInSeconds: s.number("Paragraph start time in seconds."),
    endInSeconds: s.number("Paragraph end time in seconds."),
    speaker: s.nullable(transcriptSpeaker),
    sentences: s.array(transcriptSentence, { description: "Sentences in the paragraph." }),
  },
  {
    required: ["startInSeconds", "endInSeconds", "speaker", "sentences"],
    description: "A transcript paragraph.",
  },
);
const transcript = s.object(
  {
    language: s.string("Transcript language code."),
    paragraphs: s.array(transcriptParagraph, { description: "Transcript paragraphs." }),
  },
  { required: ["language", "paragraphs"], description: "A structured Demodesk transcript." },
);
const plaintextTranscript = s.object(
  {
    language: s.string("Transcript language code."),
    text: s.string("Transcript text."),
  },
  { required: ["language", "text"], description: "A plaintext Demodesk transcript." },
);
const transcriptPayload = s.anyOf("A structured or plaintext transcript payload.", [transcript, plaintextTranscript]);
const summary = s.looseObject("A Demodesk AI-generated recording summary.", {
  summaryId: s.string("Summary ID."),
  promptId: s.nullableString("Prompt ID when available."),
  promptName: s.nullableString("Prompt name when available."),
  languageCode: s.string("Summary language code."),
  content: s.string("Plaintext summary content."),
  htmlContent: s.nullableString("HTML summary content when available."),
  createdAt: s.dateTime("Timestamp when the summary was created."),
  updatedAt: s.dateTime("Timestamp when the summary was last updated."),
});
const scorecardQuestion = s.looseObject("A Demodesk scorecard question result.", {
  questionId: s.string("Question ID."),
  position: s.integer("Question position."),
  name: s.nullableString("Question name when available."),
  text: s.string("Question text."),
  criteria: s.nullableString("Scoring criteria when available."),
  score: s.nullableInteger("Question score when available."),
  comment: s.nullableString("Question comment when available."),
  rawTimestamps: s.nullableString("Raw timestamp references when available."),
});
const scorecard = s.looseObject("A Demodesk scorecard result.", {
  scorecardId: s.string("Scorecard ID."),
  templateId: s.nullableString("Scorecard template ID when available."),
  templateName: s.string("Scorecard template name."),
  score: s.nullableInteger("Overall score when available."),
  comment: s.nullableString("Overall scorecard comment when available."),
  languageCode: s.nullableString("Scorecard language code when available."),
  giverUserId: s.nullableInteger("User ID of the score giver when available."),
  receiverUserId: s.integer("User ID of the score receiver."),
  createdAt: s.dateTime("Timestamp when the scorecard was created."),
  updatedAt: s.dateTime("Timestamp when the scorecard was last updated."),
  questions: s.array(scorecardQuestion, { description: "Question-level scorecard results." }),
});

export type DemodeskActionName =
  | "get_current_user"
  | "list_users"
  | "list_recordings"
  | "get_recording"
  | "get_recording_transcript"
  | "batch_get_recording_transcripts"
  | "list_recording_summaries"
  | "list_recording_scorecards";

export const demodeskActions: Array<ProviderActionDefinition<DemodeskActionName>> = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Demodesk user represented by the current API key.",
    inputSchema: s.actionInput({}, [], "Input parameters for getting the current Demodesk user."),
    outputSchema: s.actionOutput({ user }, "The current Demodesk user response."),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List active Demodesk users visible to the current API key.",
    inputSchema: s.object(
      {
        search: s.string({ minLength: 1, description: "Case-insensitive search across user full name and email." }),
        cursor,
        limit,
      },
      { optional: ["search", "cursor", "limit"], description: "Input parameters for listing Demodesk users." },
    ),
    outputSchema: s.actionOutput(
      {
        users: s.array(user, { description: "Users returned by Demodesk." }),
        meta: paginatedMeta,
      },
      "The Demodesk users list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_recordings",
    description: "List Demodesk recordings with cursor pagination and optional filters.",
    inputSchema: s.object(
      {
        cursor,
        limit,
        filters: recordingFilters,
      },
      { optional: ["cursor", "limit", "filters"], description: "Input parameters for listing Demodesk recordings." },
    ),
    outputSchema: s.actionOutput(
      {
        recordings: s.array(recording, { description: "Recordings returned by Demodesk." }),
        meta: paginatedMeta,
      },
      "The Demodesk recordings list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_recording",
    description: "Get one Demodesk recording by public recording token.",
    inputSchema: tokenInput,
    outputSchema: s.actionOutput({ recording }, "The Demodesk recording detail response."),
  }),
  defineProviderAction(service, {
    name: "get_recording_transcript",
    description: "Get the transcript for one Demodesk recording token.",
    inputSchema: s.object(
      {
        token: nonEmptyString("Public Demodesk recording token."),
        lang: language,
        format: transcriptFormat,
      },
      {
        required: ["token"],
        optional: ["lang", "format"],
        description: "Input parameters for retrieving a Demodesk recording transcript.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        status: s.stringEnum("Transcript retrieval status.", ["ready", "processing", "empty"]),
        transcript: s.nullable(transcript),
        text: s.nullableString("Plaintext transcript when plaintext format was requested."),
        error: s.nullable(s.looseObject("Upstream Demodesk status payload for non-ready states.")),
      },
      "The Demodesk recording transcript response.",
    ),
  }),
  defineProviderAction(service, {
    name: "batch_get_recording_transcripts",
    description: "Get transcripts for up to 100 Demodesk recording tokens in one request.",
    inputSchema: s.object(
      {
        recordingTokens,
        lang: language,
        format: transcriptFormat,
      },
      {
        required: ["recordingTokens"],
        optional: ["lang", "format"],
        description: "Input parameters for retrieving Demodesk recording transcripts in batch.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        results: s.array(
          s.object(
            {
              recordingToken: s.string("Public Demodesk recording token."),
              status: s.stringEnum("Per-recording transcript status.", [
                "ready",
                "processing",
                "not_requested",
                "empty",
                "not_found",
              ]),
              transcript: s.nullable(transcriptPayload),
            },
            {
              required: ["recordingToken", "status", "transcript"],
              description: "One Demodesk batch transcript result.",
            },
          ),
          { description: "Per-recording transcript results." },
        ),
        meta: s.object(
          { requestedCount: s.integer("Number of recording tokens requested.") },
          { required: ["requestedCount"], description: "Demodesk transcript batch metadata." },
        ),
      },
      "The Demodesk transcript batch response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_recording_summaries",
    description: "List AI-generated summaries attached to a Demodesk recording.",
    inputSchema: tokenInput,
    outputSchema: s.actionOutput(
      { summaries: s.array(summary, { description: "Summaries returned by Demodesk." }) },
      "The Demodesk recording summaries response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_recording_scorecards",
    description: "List scorecards linked to a Demodesk recording.",
    inputSchema: tokenInput,
    outputSchema: s.actionOutput(
      { scorecards: s.array(scorecard, { description: "Scorecards returned by Demodesk." }) },
      "The Demodesk recording scorecards response.",
    ),
  }),
];
