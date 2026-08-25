import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { zoomMeetingListScope, zoomMeetingUpdateScope, zoomMeetingWriteScope, zoomUserReadScope } from "./scopes.ts";

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
    description: "Fetch one Zoom user by user ID, email address, or me when supported by the app.",
    requiredScopes: [zoomUserReadScope],
    inputSchema: s.object("The input payload for fetching one Zoom user.", {
      userId: userIdSchema,
    }),
    outputSchema: s.object("The response returned when fetching one Zoom user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_meetings",
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
    name: "create_meeting",
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
