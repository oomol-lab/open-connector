import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "daily";

const roomNameSchema = s.nonEmptyString("The Daily room name.");
const roomPrivacySchema = s.stringEnum("The Daily room privacy setting.", ["public", "private"]);

const roomPropertiesSchema = s.looseObject("Daily room configuration properties to send as-is.", {
  nbf: s.integer("The UNIX timestamp before which users cannot join the room."),
  exp: s.integer("The UNIX timestamp after which users cannot join the room."),
  max_participants: s.integer("The maximum number of participants allowed in the room."),
  enable_prejoin_ui: s.boolean("Whether Daily Prebuilt shows the prejoin UI for this room."),
  enable_people_ui: s.boolean("Whether Daily Prebuilt shows the People UI."),
  enable_pip_ui: s.boolean("Whether Daily Prebuilt shows Picture in Picture controls."),
  enable_chat: s.boolean("Whether Daily Prebuilt chat is enabled."),
  start_video_off: s.boolean("Whether participants join with camera off by default."),
  start_audio_off: s.boolean("Whether participants join with microphone off by default."),
  lang: s.string("The default Daily Prebuilt language for this room."),
});

const meetingTokenPropertiesSchema = s.looseObject("Daily meeting token properties to send as-is.", {
  room_name: roomNameSchema,
  exp: s.integer("The UNIX timestamp after which the token cannot be used."),
  nbf: s.integer("The UNIX timestamp before which the token cannot be used."),
  is_owner: s.boolean("Whether the token grants meeting owner privileges."),
  user_name: s.string("The participant display name for the meeting."),
  user_id: s.string("The participant ID for the meeting.", { maxLength: 36 }),
  start_video_off: s.boolean("Whether this participant joins with camera off by default."),
  start_audio_off: s.boolean("Whether this participant joins with microphone off by default."),
  eject_at_token_exp: s.boolean("Whether to eject the participant when the meeting token expires."),
  eject_after_elapsed: s.integer("The number of seconds after join when the participant is ejected."),
});

const looseRecordSchema = s.looseObject("A Daily object returned by the REST API.");

const roomSchema = s.looseRequiredObject(
  "A Daily room object.",
  {
    id: s.string("The Daily room ID."),
    name: s.string("The Daily room name."),
    api_created: s.boolean("Whether the room was created through the API."),
    privacy: s.string("The Daily room privacy setting."),
    url: s.string("The Daily room URL."),
    created_at: s.string("The room creation timestamp."),
    config: s.looseObject("The Daily room configuration object."),
  },
  { optional: ["id", "name", "api_created", "privacy", "url", "created_at", "config"] },
);

const domainSchema = s.looseRequiredObject(
  "A Daily domain configuration object.",
  {
    domain_name: s.string("The Daily domain name."),
    domain_id: s.string("The Daily domain ID."),
    config: s.looseObject("The Daily domain configuration object."),
  },
  { optional: ["domain_name", "domain_id", "config"] },
);

const listRoomsInputSchema = s.object(
  "The input for listing Daily rooms.",
  {
    limit: s.integer("The maximum number of rooms to return.", { minimum: 1, maximum: 100 }),
    starting_after: s.string("Return rooms created after this room ID cursor."),
    ending_before: s.string("Return rooms created before this room ID cursor, or OLDEST for oldest rooms."),
  },
  { optional: ["limit", "starting_after", "ending_before"] },
);

const listRoomsOutputSchema = s.object(
  "The Daily rooms list response.",
  {
    total_count: s.integer("The total number of rooms returned by Daily."),
    rooms: s.array("The Daily rooms returned by the list endpoint.", roomSchema),
    raw: looseRecordSchema,
  },
  { optional: ["total_count"] },
);

const roomOutputSchema = s.requiredObject("The Daily room response.", {
  room: roomSchema,
});

const createRoomInputSchema = s.object(
  "The input for creating a Daily room.",
  {
    name: s.string("The room name. Daily generates a name when omitted."),
    privacy: roomPrivacySchema,
    properties: roomPropertiesSchema,
  },
  { optional: ["name", "privacy", "properties"] },
);

const roomNameInputSchema = s.requiredObject("The input identifying a Daily room.", {
  room_name: roomNameSchema,
});

const updateRoomInputSchema = s.object(
  "The input for updating a Daily room.",
  {
    room_name: roomNameSchema,
    privacy: roomPrivacySchema,
    properties: roomPropertiesSchema,
  },
  { optional: ["privacy", "properties"] },
);

const deleteRoomOutputSchema = s.requiredObject("The Daily delete room response.", {
  deleted: s.boolean("Whether Daily deleted the room."),
  name: s.string("The deleted Daily room name."),
});

const createMeetingTokenInputSchema = s.requiredObject("The input for creating a Daily meeting token.", {
  properties: meetingTokenPropertiesSchema,
});

const createMeetingTokenOutputSchema = s.requiredObject("The Daily meeting token response.", {
  token: s.nonEmptyString("The Daily meeting token."),
});

const domainOutputSchema = s.requiredObject("The Daily domain configuration response.", {
  domain: domainSchema,
});

export const dailyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_domain_config",
    operationType: "read",
    description: "Get the top-level configuration for the connected Daily domain.",
    inputSchema: s.object("The input for getting Daily domain configuration.", {}),
    outputSchema: domainOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_rooms",
    operationType: "read",
    description: "List Daily rooms with cursor pagination.",
    inputSchema: listRoomsInputSchema,
    outputSchema: listRoomsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_room",
    operationType: "write",
    description: "Create a Daily room with optional privacy and configuration properties.",
    inputSchema: createRoomInputSchema,
    outputSchema: roomOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_room",
    operationType: "read",
    description: "Get configuration and metadata for a Daily room by name.",
    inputSchema: roomNameInputSchema,
    outputSchema: roomOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_room",
    operationType: "write",
    description: "Update a Daily room's privacy and configuration properties.",
    inputSchema: updateRoomInputSchema,
    outputSchema: roomOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_room",
    operationType: "destructive",
    description: "Delete a Daily room by name.",
    inputSchema: roomNameInputSchema,
    outputSchema: deleteRoomOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_meeting_token",
    operationType: "write",
    description: "Create a Daily meeting token for room access control.",
    inputSchema: createMeetingTokenInputSchema,
    outputSchema: createMeetingTokenOutputSchema,
  }),
];
