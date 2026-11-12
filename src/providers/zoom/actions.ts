import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  zoomMeetingListScope,
  zoomMeetingSummaryListScope,
  zoomMeetingSummaryReadScope,
  zoomMeetingUpdateScope,
  zoomMeetingWriteScope,
  zoomUserReadScope,
} from "./scopes.ts";

const service = "zoom";

const userIdSchema = s.nonEmptyString(
  "The Zoom user ID or email address. Use me when the credential can act on the current app user.",
);

const meetingIdSchema = s.anyOf("The Zoom meeting ID returned by Zoom.", [
  s.integer("The numeric Zoom meeting ID."),
  s.nonEmptyString("The string Zoom meeting ID."),
]);

const pageSizeSchema = s.integer("The number of records returned within a single API call.", {
  minimum: 1,
  maximum: 300,
});

const nextPageTokenSchema = s.nonEmptyString(
  "The next_page_token value returned by Zoom for the next page of results.",
);

const meetingTypeSchema = s.stringEnum("The meeting list type to request from Zoom.", [
  "scheduled",
  "live",
  "upcoming",
  "upcoming_meetings",
  "previous_meetings",
]);

const createMeetingTypeSchema = s.anyOf(
  "The Zoom meeting type: 1 instant, 2 scheduled, 3 recurring with no fixed time, 4 PMI, 8 recurring with fixed time, or 10 screen share only.",
  [
    s.literal(1, { description: "Instant meeting type." }),
    s.literal(2, { description: "Scheduled meeting type." }),
    s.literal(3, { description: "Recurring meeting with no fixed time type." }),
    s.literal(4, { description: "Personal Meeting ID meeting type." }),
    s.literal(8, { description: "Recurring meeting with fixed time type." }),
    s.literal(10, { description: "Screen share only meeting type." }),
  ],
);

const dateTimeSchema = s.nonEmptyString(
  "A Zoom date-time value. Use UTC format such as 2026-05-18T09:00:00Z, or a local date-time with timezone.",
);

const paginationSchema = s.object("Pagination metadata returned by Zoom list endpoints.", {
  pageSize: s.nullableInteger("The number of records requested or returned for this page."),
  totalRecords: s.nullableInteger("The total number of records Zoom reported."),
  nextPageToken: s.nullableString("The token to request the next page, when Zoom returned one."),
});

const userSchema = s.object("A normalized Zoom user record.", {
  id: s.nullableString("The Zoom user identifier."),
  email: s.nullableString("The user's email address."),
  firstName: s.nullableString("The user's first name."),
  lastName: s.nullableString("The user's last name."),
  displayName: s.nullableString("The user's display name when returned by Zoom."),
  type: s.nullableInteger("The Zoom user type numeric code."),
  status: s.nullableString("The user's Zoom account status."),
  timezone: s.nullableString("The user's timezone."),
  createdAt: s.nullableString("The timestamp when the user was created."),
  lastLoginTime: s.nullableString("The timestamp when the user last logged in."),
  pmi: s.nullableString("The user's personal meeting ID."),
  raw: s.looseObject("The raw Zoom user object returned by the API."),
});

const meetingSettingsSchema = s.object(
  "Meeting settings supported by the first Zoom provider pass.",
  {
    hostVideo: s.boolean("Whether to start the meeting with host video enabled."),
    participantVideo: s.boolean("Whether to start the meeting with participant video enabled."),
    joinBeforeHost: s.boolean("Whether participants can join before the host."),
    waitingRoom: s.boolean("Whether Zoom Waiting Room is enabled."),
    muteUponEntry: s.boolean("Whether participants are muted when they enter."),
    autoRecording: s.stringEnum("The automatic recording mode for the meeting.", ["local", "cloud", "none"]),
    audio: s.stringEnum("How participants join audio.", ["both", "telephony", "voip", "thirdParty"]),
    approvalType: s.integer("The meeting registration approval type documented by Zoom."),
    registrationType: s.integer("The registration type documented by Zoom."),
    enforceLogin: s.boolean("Whether participants must authenticate before joining."),
  },
  {
    optional: [
      "hostVideo",
      "participantVideo",
      "joinBeforeHost",
      "waitingRoom",
      "muteUponEntry",
      "autoRecording",
      "audio",
      "approvalType",
      "registrationType",
      "enforceLogin",
    ],
  },
);

const meetingSchema = s.object("A normalized Zoom meeting record.", {
  uuid: s.nullableString("The unique meeting UUID returned by Zoom."),
  id: s.nullable(
    s.anyOf("The Zoom meeting ID. Zoom may return large numeric IDs as numbers or strings.", [
      s.integer("The numeric Zoom meeting ID."),
      s.string("The string Zoom meeting ID."),
    ]),
  ),
  hostId: s.nullableString("The Zoom user ID of the host."),
  hostEmail: s.nullableString("The host email address."),
  topic: s.nullableString("The meeting topic."),
  type: s.nullableInteger("The Zoom meeting type numeric code."),
  status: s.nullableString("The meeting status returned by Zoom."),
  startTime: s.nullableString("The meeting start time returned by Zoom."),
  duration: s.nullableInteger("The scheduled meeting duration in minutes."),
  timezone: s.nullableString("The meeting timezone."),
  agenda: s.nullableString("The meeting agenda."),
  joinUrl: s.nullableString("The participant join URL."),
  startUrl: s.nullableString("The host start URL, when Zoom returns it."),
  password: s.nullableString("The meeting passcode, when Zoom returns it."),
  createdAt: s.nullableString("The timestamp when the meeting was created."),
  raw: s.looseObject("The raw Zoom meeting object returned by the API."),
});

const recurrenceSchema = s.object(
  "Recurrence settings for Zoom recurring meetings.",
  {
    type: s.integer("The recurrence type: 1 daily, 2 weekly, or 3 monthly.", { minimum: 1, maximum: 3 }),
    repeatInterval: s.integer("The interval at which the meeting recurs.", { minimum: 1 }),
    weeklyDays: s.nonEmptyString(
      "The weekly days string documented by Zoom, such as 1 for Sunday or comma-separated values.",
    ),
    monthlyDay: s.integer("The day of the month for monthly recurrence.", { minimum: 1, maximum: 31 }),
    endTimes: s.integer("The number of recurrences before the meeting stops.", { minimum: 1 }),
    endDateTime: dateTimeSchema,
  },
  {
    optional: ["repeatInterval", "weeklyDays", "monthlyDay", "endTimes", "endDateTime"],
  },
);

const summaryTimeSchema = s.dateTime(
  "A UTC date-time in Zoom's yyyy-MM-ddTHH:mm:ssZ form, such as 2026-11-01T00:00:00Z.",
);

const meetingSummaryMeetingProperties = {
  meetingUuid: s.nullableString(
    "The meeting instance UUID. Pass it to get_meeting_summary; it differs for every occurrence.",
  ),
  meetingId: s.nullable(
    s.anyOf("The numeric Zoom meeting ID, shared by every occurrence of a recurring meeting.", [
      s.integer("The numeric Zoom meeting ID."),
      s.string("The string Zoom meeting ID."),
    ]),
  ),
  meetingHostId: s.nullableString("The Zoom user ID of the meeting host."),
  meetingHostEmail: s.nullableString("The email address of the meeting host."),
  meetingTopic: s.nullableString("The meeting topic."),
  meetingStartTime: s.nullableString("The time the meeting started."),
  meetingEndTime: s.nullableString("The time the meeting ended."),
  summaryStartTime: s.nullableString("The start of the meeting span the summary covers."),
  summaryEndTime: s.nullableString("The end of the meeting span the summary covers."),
  summaryCreatedTime: s.nullableString("The time Zoom created the summary."),
  summaryLastModifiedTime: s.nullableString("The time the summary was last edited."),
};

const meetingSummaryListItemSchema = s.object(
  "One AI Companion meeting summary listed for the user, without its content.",
  meetingSummaryMeetingProperties,
);

const summaryDetailSchema = s.object("One labelled section of a legacy Zoom summary.", {
  label: s.nullableString("The section label."),
  summary: s.nullableString("The section text."),
});

const summaryDetailsSchema = s.array("Labelled sections of the legacy summary.", summaryDetailSchema);
const nextStepsSchema = s.array("Legacy next-step strings Zoom extracted from the meeting.", s.string("A next step."));

const meetingSummarySchema = s.object("The content and metadata of one Zoom AI Companion meeting summary.", {
  ...meetingSummaryMeetingProperties,
  summaryLastModifiedUserId: s.nullableString("The Zoom user ID of the last editor of the summary."),
  summaryLastModifiedUserEmail: s.nullableString("The email address of the last editor of the summary."),
  summaryTitle: s.nullableString("The summary title."),
  summaryContent: s.nullableString("The full summary in Markdown, Zoom's unified summary field."),
  summaryDocUrl: s.nullableString("The URL of the summary document in Zoom Docs, when Zoom returns one."),
  summaryOverview: s.nullableString("The legacy overview paragraph. Zoom marks it deprecated."),
  summaryDetails: summaryDetailsSchema,
  nextSteps: nextStepsSchema,
  editedSummary: s.nullable(
    s.object("The user-edited version of the legacy fields, when someone edited the summary.", {
      summaryOverview: s.nullableString("The edited overview paragraph."),
      summaryDetails: s.anyOf("The edited details, as text or as labelled sections.", [
        s.string("The edited details as text."),
        summaryDetailsSchema,
      ]),
      nextSteps: nextStepsSchema,
    }),
  ),
});

const meetingWriteProperties = {
  topic: s.string("The meeting topic.", { minLength: 1, maxLength: 200 }),
  type: createMeetingTypeSchema,
  startTime: dateTimeSchema,
  duration: s.integer("The scheduled meeting duration in minutes.", { minimum: 1, maximum: 1440 }),
  timezone: s.nonEmptyString("The meeting timezone, such as America/Los_Angeles, Asia/Tokyo, or UTC."),
  agenda: s.string("The meeting agenda. Zoom allows up to 2,000 characters.", { maxLength: 2000 }),
  password: s.nonEmptyString("The passcode required to join the meeting."),
  scheduleFor: s.nonEmptyString("The email address or user ID of the user to schedule for."),
  settings: meetingSettingsSchema,
  recurrence: recurrenceSchema,
};

export const zoomActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Fetch one Zoom user by user ID or email address, or the connected user when userId is me or omitted.",
    requiredScopes: [zoomUserReadScope],
    inputSchema: s.object(
      "The input payload for fetching one Zoom user.",
      {
        userId: s.withDefault(userIdSchema, "me"),
      },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The response returned when fetching one Zoom user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_meetings",
    operationType: "read",
    description: "List scheduled, live, upcoming, or previous meetings for a Zoom user using official pagination.",
    requiredScopes: [zoomMeetingListScope],
    inputSchema: s.object(
      "The input payload for listing Zoom meetings.",
      {
        userId: userIdSchema,
        type: meetingTypeSchema,
        from: s.date("A Zoom date filter in YYYY-MM-DD format."),
        to: s.date("A Zoom date filter in YYYY-MM-DD format."),
        timezone: s.nonEmptyString("The timezone used to interpret the from and to filters."),
        pageSize: pageSizeSchema,
        nextPageToken: nextPageTokenSchema,
      },
      {
        optional: ["type", "from", "to", "timezone", "pageSize", "nextPageToken"],
      },
    ),
    outputSchema: s.object("The response returned when listing Zoom meetings.", {
      pagination: paginationSchema,
      meetings: s.array("The normalized Zoom meetings returned for this page.", meetingSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_user_meeting_summaries",
    operationType: "read",
    description:
      "List a user's AI Companion meeting summaries in a time window, newest first, without their content. Zoom's page token expires 15 minutes after it is issued; an expired token is refused as invalid input.",
    requiredScopes: [zoomMeetingSummaryListScope],
    inputSchema: s.object(
      "The input payload for listing Zoom meeting summaries.",
      {
        userId: s.withDefault(userIdSchema, "me"),
        from: summaryTimeSchema,
        to: summaryTimeSchema,
        timeFilterField: s.stringEnum(
          "Which summary time from and to filter on. Zoom defaults to summary_start_time.",
          ["summary_start_time", "summary_created_time"],
        ),
        pageSize: s.integer("The number of summaries per page. Zoom defaults to 30.", { minimum: 1, maximum: 300 }),
        nextPageToken: nextPageTokenSchema,
      },
      {
        optional: ["userId", "from", "to", "timeFilterField", "pageSize", "nextPageToken"],
      },
    ),
    outputSchema: s.object("The response returned when listing Zoom meeting summaries.", {
      summaries: s.array("The summaries on this page; empty when the window has none.", meetingSummaryListItemSchema),
      nextPageToken: s.nullableString("The token for the next page, or null on the last page."),
      pageSize: s.nullableInteger("The page size Zoom applied."),
      from: s.nullableString("The window start Zoom applied."),
      to: s.nullableString("The window end Zoom applied."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_meeting_summary",
    operationType: "read",
    description:
      "Fetch the AI Companion summary of one meeting instance by its UUID. When Zoom answers 403 code 2305 (summary access restricted to IP ranges, summaries shared by email only, or the summary in Trash), the result is available false with a reason instead of an error.",
    requiredScopes: [zoomMeetingSummaryReadScope],
    inputSchema: s.object("The input payload for fetching one Zoom meeting summary.", {
      meetingUuid: s.nonEmptyString("The meeting instance UUID returned by list_user_meeting_summaries."),
    }),
    outputSchema: s.object("The response returned when fetching one Zoom meeting summary.", {
      available: s.boolean("Whether Zoom returned the summary through the API."),
      unavailableReason: s.nullable(
        s.stringEnum(
          "Zoom answered 403 code 2305: the account restricts summary access to IP ranges or shares summaries by email only, or the summary is in Trash; unavailableMessage carries Zoom's own wording.",
          ["not_accessible"],
        ),
      ),
      unavailableMessage: s.nullableString("Zoom's own message when the summary is not available."),
      summary: s.nullable(meetingSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_meeting",
    operationType: "write",
    description: "Create a Zoom meeting for a user with the core official scheduling fields and first-pass settings.",
    requiredScopes: [zoomMeetingWriteScope],
    inputSchema: s.object(
      "The input payload for creating a Zoom meeting.",
      {
        userId: userIdSchema,
        ...meetingWriteProperties,
      },
      {
        optional: [
          "userId",
          "topic",
          "type",
          "startTime",
          "duration",
          "timezone",
          "agenda",
          "password",
          "scheduleFor",
          "settings",
          "recurrence",
        ],
      },
    ),
    outputSchema: s.object("The response returned when creating a Zoom meeting.", {
      meeting: meetingSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_meeting",
    operationType: "write",
    description:
      "Update a Zoom meeting by meeting ID with the core official scheduling fields and first-pass settings.",
    requiredScopes: [zoomMeetingUpdateScope],
    inputSchema: s.object(
      "The input payload for updating a Zoom meeting.",
      {
        meetingId: meetingIdSchema,
        ...meetingWriteProperties,
      },
      {
        optional: [
          "topic",
          "type",
          "startTime",
          "duration",
          "timezone",
          "agenda",
          "password",
          "scheduleFor",
          "settings",
          "recurrence",
        ],
      },
    ),
    outputSchema: s.object("The response returned when updating a Zoom meeting.", {
      success: s.boolean("Whether Zoom accepted the meeting update request."),
      meetingId: meetingIdSchema,
    }),
  }),
];
