import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vectera";
const accessLevelSchema = s.stringEnum(["should_knock", "can_always_join", "is_host"], {
  description: "The access level granted for a Vectera meeting room.",
});
const meetingRoomIncludeSchema = s.array(
  "Optional related fields to include in each Vectera meeting room response.",
  s.stringEnum(["owner", "numTranscriptions"], {
    description: "A related meeting room field to include.",
  }),
  { minItems: 1, maxItems: 2 },
);
const currentUserIncludeSchema = s.array(
  "Optional related fields to include in the current Vectera user response.",
  s.stringEnum(["organization", "organization.defaultSmartSummaryTemplate", "organization.integrationStatus"], {
    description: "A related current-user field to include.",
  }),
  { minItems: 1, maxItems: 3 },
);
const meetingRoomSchema = s.looseRequiredObject(
  "A Vectera meeting room returned by the API.",
  {
    id: s.string("The Vectera meeting room id."),
    key: s.string("The identifier used in the meeting room URL."),
    url: s.url("The public URL used to join the meeting room."),
    ownerId: s.string("The id of the meeting room owner."),
    publicAccessLevel: accessLevelSchema,
    teamAccessLevel: accessLevelSchema,
    dateCreated: s.dateTime("When the meeting room was created."),
    isOpened: s.boolean("Whether at least one participant is currently in the meeting room."),
    isActive: s.boolean("Whether the meeting room currently has an active multi-participant session."),
  },
  {
    optional: [
      "id",
      "key",
      "url",
      "ownerId",
      "publicAccessLevel",
      "teamAccessLevel",
      "dateCreated",
      "isOpened",
      "isActive",
    ],
  },
);
const userSchema = s.looseRequiredObject(
  "The current Vectera user returned by the API.",
  {
    id: s.string("The Vectera user id."),
    username: s.nullableString("The username within the Vectera organization."),
    firstName: s.string("The user's first name."),
    lastName: s.string("The user's last name."),
    fullName: s.string("The user's full display name."),
    email: s.email("The user's email address."),
    organizationId: s.string("The id of the user's Vectera organization."),
  },
  {
    optional: ["id", "username", "firstName", "lastName", "fullName", "email", "organizationId"],
  },
);
const settingsSchema = s.looseRequiredObject(
  "Vectera meeting room settings.",
  {
    showPrivateNotes: s.boolean("Whether private note controls are visible to the meeting room host."),
    presenterMode: s.boolean("Whether presenter mode is active in the meeting room."),
    forwardUrl: s.string("The URL guests are sent to after the meeting ends."),
  },
  {
    optional: ["showPrivateNotes", "presenterMode", "forwardUrl"],
  },
);
const permissionSchema = s.looseRequiredObject(
  "A Vectera meeting room permission returned by the API.",
  {
    id: s.string("The Vectera meeting room permission id."),
    meetingRoomId: s.string("The id of the meeting room this permission grants access to."),
    accessKey: s.string("The secure access key generated for this permission."),
    url: s.url("The URL used to join the meeting room with this permission."),
    accessLevel: accessLevelSchema,
  },
  { optional: ["id", "meetingRoomId", "accessKey", "url", "accessLevel"] },
);
const paginationSchema = s.requiredObject("Pagination links parsed from the Vectera Link header.", {
  page: s.positiveInteger("The requested 1-based page number."),
  next: s.nullable(s.url("The URL of the next page, or null when there is no next page.")),
  previous: s.nullable(s.url("The URL of the previous page, or null when there is no previous page.")),
  first: s.nullable(s.url("The URL of the first page, or null when it is not returned.")),
  last: s.nullable(s.url("The URL of the last page, or null when it is not returned.")),
});
const mutationFields = {
  key: s.nonWhitespaceString("A unique identifier to use in the meeting room URL.", {
    maxLength: 255,
  }),
  ownerId: s.nonWhitespaceString("The Vectera user id that owns the meeting room."),
  publicAccessLevel: accessLevelSchema,
  teamAccessLevel: accessLevelSchema,
};

export const vecteraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the user associated with the connected Vectera API token.",
    inputSchema: s.object(
      "Options for retrieving the current Vectera user.",
      { include: currentUserIncludeSchema },
      { optional: ["include"] },
    ),
    outputSchema: s.requiredObject("The current Vectera user response.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "list_meeting_rooms",
    operationType: "read",
    description: "List Vectera meeting rooms available to the connected user.",
    inputSchema: s.object(
      "Filters and pagination controls for listing Vectera meeting rooms.",
      {
        page: s.positiveInteger("The 1-based result page to request."),
        perPage: s.positiveInteger("The number of meeting rooms to return per page.", {
          maximum: 100,
        }),
        search: s.nonWhitespaceString("Text to search for in meeting room keys."),
        filter: s.nonWhitespaceString("A Vectera filter expression for meeting room fields."),
        orderBy: s.array(
          "Meeting room fields to sort by; prefix a field with - for descending order.",
          s.nonWhitespaceString("One Vectera meeting room sort field."),
          { minItems: 1 },
        ),
        include: meetingRoomIncludeSchema,
      },
      { optional: ["page", "perPage", "search", "filter", "orderBy", "include"] },
    ),
    outputSchema: s.requiredObject("A page of Vectera meeting rooms.", {
      meetingRooms: s.array("The meeting rooms returned for this page.", meetingRoomSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_meeting_room",
    operationType: "read",
    description: "Get one Vectera meeting room by id.",
    inputSchema: s.object(
      "Input for retrieving one Vectera meeting room.",
      {
        meetingRoomId: s.nonWhitespaceString("The Vectera meeting room id."),
        include: meetingRoomIncludeSchema,
      },
      { optional: ["include"] },
    ),
    outputSchema: s.requiredObject("The Vectera meeting room response.", {
      meetingRoom: meetingRoomSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_meeting_room",
    operationType: "write",
    description: "Create a Vectera meeting room with optional ownership and access settings.",
    inputSchema: {
      ...s.object(
        "Fields for creating a Vectera meeting room.",
        {
          ...mutationFields,
          preferredKey: s.nonWhitespaceString(
            "A preferred meeting room key that Vectera may suffix to avoid conflicts.",
            { maxLength: 255 },
          ),
          templateId: s.nonWhitespaceString("The Vectera meeting room template id to apply."),
          include: meetingRoomIncludeSchema,
        },
        {
          optional: ["key", "preferredKey", "templateId", "ownerId", "publicAccessLevel", "teamAccessLevel", "include"],
        },
      ),
      not: { required: ["key", "preferredKey"] },
    },
    outputSchema: s.requiredObject("The created Vectera meeting room response.", {
      meetingRoom: meetingRoomSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_meeting_room",
    operationType: "write",
    description: "Update the key, owner, or access levels of a Vectera meeting room.",
    inputSchema: {
      ...s.object(
        "Fields for updating a Vectera meeting room.",
        {
          meetingRoomId: s.nonWhitespaceString("The Vectera meeting room id."),
          ...mutationFields,
          include: meetingRoomIncludeSchema,
        },
        { optional: ["key", "ownerId", "publicAccessLevel", "teamAccessLevel", "include"] },
      ),
      anyOf: [
        { required: ["key"] },
        { required: ["ownerId"] },
        { required: ["publicAccessLevel"] },
        { required: ["teamAccessLevel"] },
      ],
    },
    outputSchema: s.requiredObject("The updated Vectera meeting room response.", {
      meetingRoom: meetingRoomSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_meeting_room_settings",
    operationType: "read",
    description: "Get settings for one Vectera meeting room.",
    inputSchema: s.requiredObject("Input identifying one Vectera meeting room.", {
      meetingRoomId: s.nonWhitespaceString("The Vectera meeting room id."),
    }),
    outputSchema: s.requiredObject("The Vectera meeting room settings response.", {
      settings: settingsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_meeting_room_settings",
    operationType: "write",
    description: "Update writable settings for one Vectera meeting room.",
    inputSchema: {
      ...s.object(
        "Writable settings for one Vectera meeting room.",
        {
          meetingRoomId: s.nonWhitespaceString("The Vectera meeting room id."),
          showPrivateNotes: s.boolean("Whether private note controls are visible to the meeting room host."),
          presenterMode: s.boolean("Whether presenter mode is active in the meeting room."),
          forwardUrl: s.string("The URL guests are sent to after the meeting, or an empty string to remove it."),
        },
        { optional: ["showPrivateNotes", "presenterMode", "forwardUrl"] },
      ),
      anyOf: [{ required: ["showPrivateNotes"] }, { required: ["presenterMode"] }, { required: ["forwardUrl"] }],
    },
    outputSchema: s.requiredObject("The updated Vectera meeting room settings response.", {
      settings: settingsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_meeting_room_permission",
    operationType: "write",
    description: "Create a shareable Vectera meeting room access permission and join URL.",
    inputSchema: {
      ...s.object(
        "Fields for creating a Vectera meeting room permission.",
        {
          meetingRoomId: s.nonWhitespaceString("The Vectera meeting room id to grant access to."),
          accessLevel: accessLevelSchema,
          email: s.email("An email address that should receive the meeting room invitation."),
          userId: s.nonWhitespaceString("A Vectera user id that should receive the invitation."),
          inviteMessage: s.string("The optional message included with an emailed invitation."),
        },
        { optional: ["accessLevel", "email", "userId", "inviteMessage"] },
      ),
      not: { required: ["email", "userId"] },
    },
    outputSchema: s.requiredObject("The created Vectera meeting room permission response.", {
      permission: permissionSchema,
    }),
  }),
];
