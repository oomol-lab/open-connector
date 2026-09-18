import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tldv" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });

const dateOrDateTime = s.anyOf("The date or datetime boundary accepted by tl;dv.", [
  s.date("A calendar date accepted by tl;dv."),
  s.dateTime("A date-time string accepted by tl;dv."),
]);

const userSchema = s.looseObject("A tl;dv user object.", {
  name: s.string("The user's display name."),
  email: s.string("The user's email address."),
});

const meetingSchema = s.looseObject("A tl;dv meeting object.", {
  id: s.string("The tl;dv meeting identifier."),
  name: s.string("The meeting name."),
  happenedAt: s.string("The date or datetime when the meeting happened."),
  url: s.string("The tl;dv web URL for opening the meeting."),
  duration: s.number("The meeting duration in seconds."),
  organizer: userSchema,
  invitees: s.array("Users invited to or participating in the meeting.", userSchema),
  template: s.unknown("The tl;dv template attached to the meeting."),
  extraProperties: s.looseObject("Additional tl;dv meeting properties."),
});

const sentenceSchema = s.object("A sentence from a tl;dv transcript.", {
  speaker: s.string("The speaker for this transcript sentence."),
  text: s.string("The sentence text."),
  startTime: s.number("The sentence start time in seconds."),
  endTime: s.number("The sentence end time in seconds."),
});

const noteSchema = s.object("A structured tl;dv meeting note.", {
  segmentId: s.string("The tl;dv segment identifier attached to the note."),
  timestamp: s.number("The note timestamp in seconds."),
  text: s.string("The note text."),
  topicId: s.string("The topic identifier for the note."),
});

const topicSchema = s.object("A tl;dv AI note topic.", {
  id: s.string("The topic identifier."),
  order: s.number("The topic sort order."),
  title: s.string("The topic title."),
  summary: s.string("The topic summary."),
});

const meetingIdInputSchema = s.object("The input payload for selecting a tl;dv meeting.", {
  meetingId: nonEmptyString("The tl;dv meeting identifier."),
});

export const tldvActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_meetings",
    operationType: "read",
    description:
      "List tl;dv meetings available to the API key with optional search, date, participation, and meeting-type filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing tl;dv meetings.",
      {
        query: nonEmptyString("The text query to search for."),
        page: s.positiveInteger("The page number to return."),
        limit: s.positiveInteger("The number of meetings to return per page.", {
          maximum: 100,
        }),
        from: dateOrDateTime,
        to: dateOrDateTime,
        onlyParticipated: s.boolean("Whether to only return meetings the API key owner participated in."),
        meetingType: s.stringEnum("The meeting type filter.", ["internal", "external"]),
      },
      {
        optional: ["query", "page", "limit", "from", "to", "onlyParticipated", "meetingType"],
      },
    ),
    outputSchema: s.object("The paginated tl;dv meetings response.", {
      page: s.number("The current page number."),
      pages: s.number("The total number of available pages."),
      total: s.number("The total number of matching meetings."),
      pageSize: s.number("The number of meetings returned per page."),
      results: s.array("The meetings returned by tl;dv.", meetingSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_meeting",
    operationType: "read",
    description: "Get a tl;dv meeting by its identifier.",
    requiredScopes: [],
    inputSchema: meetingIdInputSchema,
    outputSchema: meetingSchema,
  }),
  defineProviderAction(service, {
    name: "get_transcript",
    operationType: "read",
    description: "Get the structured transcript for a tl;dv meeting.",
    requiredScopes: [],
    inputSchema: meetingIdInputSchema,
    outputSchema: s.object("The tl;dv transcript response.", {
      id: s.string("The transcript identifier."),
      meetingId: s.string("The tl;dv meeting identifier."),
      data: s.array("The transcript sentences returned by tl;dv.", sentenceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_notes",
    operationType: "read",
    description: "Get markdown and structured AI notes for a tl;dv meeting.",
    requiredScopes: [],
    inputSchema: meetingIdInputSchema,
    outputSchema: s.object("The tl;dv meeting notes response.", {
      structuredNotes: s.array("The structured notes returned by tl;dv.", noteSchema),
      markdownContent: s.string("The meeting notes as Markdown."),
      topics: s.array("The AI topics returned by tl;dv.", topicSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "import_meeting",
    operationType: "write",
    description:
      "Submit a publicly accessible recording URL to tl;dv for meeting import and receive the created job payload.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for importing a meeting recording into tl;dv.",
      {
        name: nonEmptyString("The name of the meeting or recording to import."),
        url: s.url(
          "The publicly accessible recording URL that tl;dv should import. Supported media formats include mp3, mp4, wav, m4a, mkv, mov, avi, wma, and flac.",
        ),
        happenedAt: s.dateTime("The meeting or recording datetime. If omitted, tl;dv uses the current date."),
        dryRun: s.boolean("Whether tl;dv should validate the import without persisting or processing it."),
        participants: s.array(
          "Email addresses of participants invited to the meeting or recording.",
          s.email("A participant email address."),
        ),
      },
      {
        optional: ["happenedAt", "dryRun", "participants"],
      },
    ),
    outputSchema: s.object("The tl;dv meeting import job response.", {
      success: s.boolean("Whether tl;dv accepted the import request."),
      jobId: s.string("The tl;dv job identifier created for the import."),
      message: s.string("The message returned by tl;dv for the import request."),
    }),
  }),
];
