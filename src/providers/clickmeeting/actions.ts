import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clickmeeting";

const roomIdSchema = s.positiveInteger("The ClickMeeting room identifier.");
const sessionIdSchema = s.positiveInteger("The ClickMeeting room session identifier.");
const statusSchema = s.stringEnum("The ClickMeeting room status.", ["active", "inactive"]);
const registrationStatusSchema = s.stringEnum("The ClickMeeting registration status.", ["all", "active"]);
const roomTypeSchema = s.stringEnum("The ClickMeeting room type.", ["meeting", "webinar"]);
const accessTypeSchema = s.integer(
  "The ClickMeeting room access type: 1 for open access, 2 for password access, or 3 for token access.",
  { minimum: 1, maximum: 3 },
);
const rawRecordSchema = (description: string): JsonSchema => s.looseObject(description);

const registrationSettingsInputSchema = s.object(
  "The ClickMeeting registration settings for a room.",
  {
    enabled: s.boolean("Whether registration is enabled for the room."),
    template: s.integer("The ClickMeeting registration template identifier, from 1 to 3.", {
      minimum: 1,
      maximum: 3,
    }),
  },
  { optional: ["enabled", "template"] },
);

const roomSettingsInputSchema = s.object(
  "The ClickMeeting advanced room settings.",
  {
    showOnPersonalPage: s.boolean("Whether the room is shown on the personal page."),
    thankYouEmailsEnabled: s.boolean("Whether ClickMeeting sends thank-you emails."),
    connectionTesterEnabled: s.boolean("Whether the connection tester is enabled."),
    phonegatewayEnabled: s.boolean("Whether the phone gateway is enabled."),
    recorderAutostartEnabled: s.boolean("Whether recording starts automatically."),
    roomInviteButtonEnabled: s.boolean("Whether the invite button is enabled in the room."),
    socialMediaSharingEnabled: s.boolean("Whether social media sharing is enabled."),
    connectionStatusEnabled: s.boolean("Whether connection status is enabled."),
    thankYouPageUrl: s.string("The thank-you page URL configured for the room."),
    encryptionEnabled: s.boolean("Whether end-to-end encryption is enabled for the room."),
  },
  {
    optional: [
      "showOnPersonalPage",
      "thankYouEmailsEnabled",
      "connectionTesterEnabled",
      "phonegatewayEnabled",
      "recorderAutostartEnabled",
      "roomInviteButtonEnabled",
      "socialMediaSharingEnabled",
      "connectionStatusEnabled",
      "thankYouPageUrl",
      "encryptionEnabled",
    ],
  },
);

const conferenceCreateInputProperties: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The room name visible to ClickMeeting attendees."),
  roomType: roomTypeSchema,
  permanentRoom: s.boolean("Whether to create a permanent room instead of a one-time scheduled room."),
  accessType: accessTypeSchema,
  customRoomUrlName: s.nonEmptyString("The custom room URL slug to use instead of one derived from name."),
  lobbyDescription: s.string("The UTF-8 lobby description shown before the room starts."),
  lobbyEnabled: s.boolean("Whether the room lobby is enabled."),
  startsAt: s.string("The room start date, either YYYY-MM-DD HH:mm:ss or ISO 8601."),
  duration: s.anyOf("The room duration in ClickMeeting format, such as 1:20 or 0:20.", [
    s.nonEmptyString("The duration string accepted by ClickMeeting."),
    s.number("The duration value accepted by ClickMeeting.", { minimum: 0 }),
  ]),
  timezone: s.nonEmptyString("The time zone name for the room start date, such as America/New_York."),
  skinId: s.positiveInteger("The ClickMeeting skin identifier."),
  password: s.nonEmptyString("The room password used when accessType is 2."),
  registration: registrationSettingsInputSchema,
  settings: roomSettingsInputSchema,
};

const createConferenceInputSchema = s.object(
  "The input payload for creating a ClickMeeting room.",
  conferenceCreateInputProperties,
  {
    optional: [
      "customRoomUrlName",
      "lobbyDescription",
      "lobbyEnabled",
      "startsAt",
      "duration",
      "timezone",
      "skinId",
      "password",
      "registration",
      "settings",
    ],
  },
);

const updateConferenceInputSchema = s.object(
  "The input payload for updating a ClickMeeting room.",
  {
    roomId: roomIdSchema,
    ...conferenceCreateInputProperties,
    status: statusSchema,
  },
  {
    optional: [
      "name",
      "roomType",
      "permanentRoom",
      "accessType",
      "customRoomUrlName",
      "lobbyDescription",
      "lobbyEnabled",
      "startsAt",
      "duration",
      "timezone",
      "skinId",
      "password",
      "registration",
      "settings",
      "status",
    ],
  },
);

const conferenceSchema = s.object(
  "A normalized ClickMeeting room with the original response preserved in raw.",
  {
    id: s.nullableInteger("The ClickMeeting room identifier."),
    name: s.nullableString("The room name."),
    status: s.nullableString("The room status."),
    roomType: s.nullableString("The room type."),
    accessType: s.nullableInteger("The room access type."),
    permanentRoom: s.nullableBoolean("Whether the room is permanent."),
    roomUrl: s.nullableString("The attendee room URL."),
    embedRoomUrl: s.nullableString("The embeddable room URL."),
    startsAt: s.nullableString("The room start date when provided."),
    endsAt: s.nullableString("The room end date when provided."),
    createdAt: s.nullableString("The room creation date."),
    updatedAt: s.nullableString("The room update date."),
    timezone: s.nullableString("The room time zone."),
    registrationEnabled: s.nullableBoolean("Whether room registration is enabled."),
    raw: rawRecordSchema("The raw ClickMeeting room object."),
  },
  {
    optional: [
      "id",
      "name",
      "status",
      "roomType",
      "accessType",
      "permanentRoom",
      "roomUrl",
      "embedRoomUrl",
      "startsAt",
      "endsAt",
      "createdAt",
      "updatedAt",
      "timezone",
      "registrationEnabled",
    ],
  },
);

const accessTokenSchema = s.object(
  "A normalized ClickMeeting access token.",
  {
    token: s.nullableString("The access token value."),
    sentToEmail: s.nullableString("The email address the token was sent to when available."),
    firstUseDate: s.nullableString("The first token use date when available."),
    raw: rawRecordSchema("The raw ClickMeeting access token object."),
  },
  { optional: ["token", "sentToEmail", "firstUseDate"] },
);

const sessionAttendeeSchema = s.object(
  "A normalized ClickMeeting session attendee.",
  {
    uid: s.nullableString("The attendee UID returned by ClickMeeting."),
    email: s.nullableString("The attendee email address."),
    nickname: s.nullableString("The attendee nickname."),
    role: s.nullableString("The attendee role."),
    rating: s.nullableString("The attendee rating when available."),
    ratingComment: s.nullableString("The attendee rating comment when available."),
    raw: rawRecordSchema("The raw ClickMeeting attendee object."),
  },
  { optional: ["uid", "email", "nickname", "role", "rating", "ratingComment"] },
);

const sessionSchema = s.object(
  "A normalized ClickMeeting room session.",
  {
    id: s.nullableInteger("The ClickMeeting session identifier."),
    startDate: s.nullableString("The session start date."),
    endDate: s.nullableString("The session end date."),
    maxVisitors: s.nullableInteger("The maximum visitor count during the session."),
    totalVisitors: s.nullableInteger("The total visitor count during the session."),
    attendees: s.array("The attendees embedded in a session detail response.", sessionAttendeeSchema),
    raw: rawRecordSchema("The raw ClickMeeting session object."),
  },
  { optional: ["id", "startDate", "endDate", "maxVisitors", "totalVisitors", "attendees"] },
);

const registrationSchema = s.object(
  "A normalized ClickMeeting registration.",
  {
    id: s.nullableInteger("The registration identifier."),
    sessionId: s.nullableInteger("The session identifier associated with the registration."),
    email: s.nullableString("The registered participant email address."),
    visitorNickname: s.nullableString("The registered participant nickname."),
    registrationDate: s.nullableString("The registration date."),
    registrationConfirmed: s.nullableString("The registration confirmation value."),
    fields: rawRecordSchema("The registration form fields returned by ClickMeeting."),
    raw: rawRecordSchema("The raw ClickMeeting registration object."),
  },
  {
    optional: ["id", "sessionId", "email", "visitorNickname", "registrationDate", "registrationConfirmed", "fields"],
  },
);

const recordingSchema = s.object(
  "A normalized ClickMeeting recording.",
  {
    id: s.nullableInteger("The recording identifier."),
    recordingUrl: s.nullableString("The recording download URL."),
    recordingDuration: s.nullableInteger("The recording duration in seconds."),
    conferenceId: s.nullableInteger("The room identifier associated with the recording."),
    recorderStarted: s.nullableString("The recording start date returned by ClickMeeting."),
    recorderStartDate: s.nullableString("The ISO recording start date when provided."),
    recordingFileSize: s.nullableString("The recording file size returned by ClickMeeting."),
    recordingName: s.nullableString("The recording name when provided."),
    raw: rawRecordSchema("The raw ClickMeeting recording object."),
  },
  {
    optional: [
      "id",
      "recordingUrl",
      "recordingDuration",
      "conferenceId",
      "recorderStarted",
      "recorderStartDate",
      "recordingFileSize",
      "recordingName",
    ],
  },
);

const chatSchema = s.object(
  "A normalized ClickMeeting chat export listing.",
  {
    id: s.nullableInteger("The chat session identifier."),
    name: s.nullableString("The room name associated with the chat."),
    date: s.nullableString("The chat date."),
    time: s.nullableString("The chat time."),
    timezone: s.nullableString("The chat time zone."),
    downloadLink: s.nullableString("The URL that can be used to download the chat archive."),
    raw: rawRecordSchema("The raw ClickMeeting chat object."),
  },
  { optional: ["id", "name", "date", "time", "timezone", "downloadLink"] },
);

const phoneGatewaySchema = s.object(
  "A normalized ClickMeeting phone gateway number.",
  {
    code: s.nullableString("The country code for the phone gateway."),
    location: s.nullableString("The phone gateway location."),
    value: s.nullableString("The phone number value."),
    geo: rawRecordSchema("The geographic metadata returned by ClickMeeting."),
    raw: rawRecordSchema("The raw ClickMeeting phone gateway object."),
  },
  { optional: ["code", "location", "value", "geo"] },
);

export const clickMeetingActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "ping",
    description: "Check ClickMeeting API availability for the connected API key.",
    inputSchema: s.object("The input payload for checking ClickMeeting API status.", {}),
    outputSchema: s.object("The ClickMeeting ping response.", {
      ping: s.string("The ping response value returned by ClickMeeting."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_conferences",
    description: "List active or inactive ClickMeeting rooms.",
    inputSchema: s.object(
      "The input payload for listing ClickMeeting rooms.",
      {
        status: statusSchema,
        page: s.positiveInteger("The page number for inactive room listings."),
      },
      { optional: ["page"] },
    ),
    outputSchema: s.object("The response returned when listing ClickMeeting rooms.", {
      conferences: s.array("The rooms returned by ClickMeeting.", conferenceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_conference",
    description: "Create a ClickMeeting meeting or webinar room.",
    inputSchema: createConferenceInputSchema,
    outputSchema: s.object("The response returned after creating a ClickMeeting room.", {
      conference: conferenceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_conference",
    description: "Get details for a ClickMeeting room.",
    inputSchema: s.object("The input payload for getting a ClickMeeting room.", {
      roomId: roomIdSchema,
    }),
    outputSchema: s.object("The response returned when getting a ClickMeeting room.", {
      conference: conferenceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_conference",
    description: "Update a ClickMeeting room.",
    inputSchema: updateConferenceInputSchema,
    outputSchema: s.object("The response returned after updating a ClickMeeting room.", {
      conference: conferenceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_conference",
    description: "Delete a ClickMeeting room.",
    inputSchema: s.object("The input payload for deleting a ClickMeeting room.", {
      roomId: roomIdSchema,
    }),
    outputSchema: s.object("The response returned after deleting a ClickMeeting room.", {
      result: s.string("The delete result returned by ClickMeeting."),
    }),
  }),
  defineProviderAction(service, {
    name: "generate_access_tokens",
    description: "Generate access tokens for a token-protected ClickMeeting room.",
    inputSchema: s.object("The input payload for generating ClickMeeting access tokens.", {
      roomId: roomIdSchema,
      howMany: s.integer("The number of access tokens to generate, up to 1000.", {
        minimum: 1,
        maximum: 1000,
      }),
    }),
    outputSchema: s.object("The response returned after generating ClickMeeting access tokens.", {
      accessTokens: s.array("The generated access tokens.", accessTokenSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_access_tokens",
    description: "List generated access tokens for a ClickMeeting room.",
    inputSchema: s.object("The input payload for listing ClickMeeting access tokens.", {
      roomId: roomIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ClickMeeting access tokens.", {
      accessTokens: s.array("The generated access tokens.", accessTokenSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_sessions",
    description: "List sessions for a ClickMeeting room.",
    inputSchema: s.object("The input payload for listing ClickMeeting room sessions.", {
      roomId: roomIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ClickMeeting room sessions.", {
      sessions: s.array("The sessions returned by ClickMeeting.", sessionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_session",
    description: "Get details for a ClickMeeting room session.",
    inputSchema: s.object("The input payload for getting a ClickMeeting room session.", {
      roomId: roomIdSchema,
      sessionId: sessionIdSchema,
    }),
    outputSchema: s.object("The response returned when getting a ClickMeeting room session.", {
      session: sessionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_session_attendees",
    description: "List attendees for a ClickMeeting room session.",
    inputSchema: s.object("The input payload for listing ClickMeeting session attendees.", {
      roomId: roomIdSchema,
      sessionId: sessionIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ClickMeeting session attendees.", {
      attendees: s.array("The attendees returned by ClickMeeting.", sessionAttendeeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_registrations",
    description: "List registrations for a ClickMeeting room by registration status.",
    inputSchema: s.object("The input payload for listing ClickMeeting room registrations.", {
      roomId: roomIdSchema,
      status: registrationStatusSchema,
    }),
    outputSchema: s.object("The response returned when listing ClickMeeting registrations.", {
      registrations: s.array("The registrations returned by ClickMeeting.", registrationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "register_participant",
    description: "Register a participant for a ClickMeeting room.",
    inputSchema: s.object(
      "The input payload for registering a ClickMeeting participant.",
      {
        roomId: roomIdSchema,
        firstName: s.nonEmptyString("The participant first name."),
        lastName: s.nonEmptyString("The participant last name."),
        email: s.email("The participant email address."),
        company: s.string("The participant company name."),
        confirmationEmail: s.object(
          "The optional ClickMeeting confirmation email settings.",
          {
            enabled: s.boolean("Whether ClickMeeting should send a confirmation email."),
            lang: s.nonEmptyString("The confirmation email language code."),
          },
          { optional: ["enabled", "lang"] },
        ),
      },
      { optional: ["company", "confirmationEmail"] },
    ),
    outputSchema: s.object(
      "The response returned after registering a ClickMeeting participant.",
      {
        status: s.string("The registration status returned by ClickMeeting."),
        url: s.string("The participant room URL returned by ClickMeeting."),
      },
      { optional: ["url"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_session_registrations",
    description: "List registrations for a specific ClickMeeting room session.",
    inputSchema: s.object("The input payload for listing ClickMeeting session registrations.", {
      roomId: roomIdSchema,
      sessionId: sessionIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ClickMeeting session registrations.", {
      registrations: s.array("The registrations returned by ClickMeeting.", registrationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_time_zones",
    description: "List ClickMeeting time zones, optionally filtered by country code.",
    inputSchema: s.object(
      "The input payload for listing ClickMeeting time zones.",
      {
        country: s.string("The ISO 3166-1 alpha-2 country code to filter time zones.", {
          minLength: 2,
          maxLength: 2,
        }),
      },
      { optional: ["country"] },
    ),
    outputSchema: s.object("The response returned when listing ClickMeeting time zones.", {
      timeZones: s.array("The time zone names returned by ClickMeeting.", s.string("A ClickMeeting time zone name.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_phone_gateways",
    description: "List ClickMeeting phone gateway numbers.",
    inputSchema: s.object("The input payload for listing ClickMeeting phone gateways.", {}),
    outputSchema: s.object("The response returned when listing ClickMeeting phone gateways.", {
      phoneGateways: s.array("The phone gateways returned by ClickMeeting.", phoneGatewaySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_all_recordings",
    description: "List all ClickMeeting recordings for the connected account.",
    inputSchema: s.object("The input payload for listing all ClickMeeting recordings.", {}),
    outputSchema: s.object("The response returned when listing all ClickMeeting recordings.", {
      recordings: s.array("The recordings returned by ClickMeeting.", recordingSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_conference_recordings",
    description: "List recordings for a ClickMeeting room.",
    inputSchema: s.object("The input payload for listing ClickMeeting room recordings.", {
      roomId: roomIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ClickMeeting room recordings.", {
      recordings: s.array("The recordings returned by ClickMeeting.", recordingSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_chats",
    description: "List ClickMeeting chat archives available for download.",
    inputSchema: s.object("The input payload for listing ClickMeeting chat archives.", {}),
    outputSchema: s.object("The response returned when listing ClickMeeting chat archives.", {
      chats: s.array("The chat archive listings returned by ClickMeeting.", chatSchema),
    }),
  }),
];
