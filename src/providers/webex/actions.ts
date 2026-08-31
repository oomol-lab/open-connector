import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema as ActionJsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "webex" as const;

const id = (description: string) => s.nonEmptyString(description, { pattern: "\\S" });
const optional = <T extends ActionJsonSchema>(schema: T) => s.optional(schema);
const max1000 = optional(s.integer("The maximum number of Webex records to return.", { minimum: 1, maximum: 1000 }));
const max100 = optional(s.integer("The maximum number of Webex records to return.", { minimum: 1, maximum: 100 }));
const dateTime = (description: string) => optional(s.dateTime(description));
const bool = (description: string) => optional(s.boolean(description));
const text = (description: string) => optional(s.string(description));
const nonEmptyText = (description: string) => optional(id(description));
const stringList = (description: string) => optional(s.array(description, s.nonEmptyString("A Webex string value.")));
const createJoinBeforeHostMinutes = optional(
  s.anyOf(
    "How many minutes before the host attendees may join.",
    [0, 5, 10, 15].map((value) => s.literal(value, { description: `Join ${value} minutes before the host.` })),
  ),
);
const updateJoinBeforeHostMinutes = optional(
  s.anyOf(
    "How many minutes before the host attendees may join.",
    [0, 5, 10, 15, 30, 45, 60].map((value) =>
      s.literal(value, { description: `Join ${value} minutes before the host.` }),
    ),
  ),
);
const integrationTags = optional(
  s.array(
    "Integration-defined tags associated with the meeting.",
    s.nonEmptyString("An integration-defined meeting tag of up to 64 characters.", {
      maxLength: 64,
    }),
    { maxItems: 3 },
  ),
);
const rawItem = s.looseObject("The complete resource returned by Webex.", {
  id: s.string("The stable Webex resource ID."),
});
const rawItems = s.array("The resources returned by Webex.", rawItem);
const listOutput = s.actionOutput({
  items: rawItems,
  nextPageUrl: s.nullableString("The Webex URL for the next page, or null when this is the last page."),
  raw: s.looseObject("The complete Webex response body."),
});
const itemOutput = s.actionOutput({
  item: rawItem,
  raw: s.looseObject("The complete Webex response body."),
});
const deleteOutput = s.actionOutput({
  success: s.boolean("Whether Webex accepted the delete operation."),
});
const downloadOutput = s.actionOutput({
  content: s.string("The transcript content returned by Webex."),
  contentType: s.nullableString("The transcript response content type, or null when absent."),
});

const input = (properties: Record<string, ActionJsonSchema>, required: readonly string[] = []) =>
  s.object("The Webex action input.", properties, { required: [...required] });

function action<const TName extends string>(definition: {
  name: TName;
  description: string;
  scope: string | string[];
  inputSchema: ActionJsonSchema;
  outputSchema: ActionJsonSchema;
}) {
  const requiredScopes = typeof definition.scope === "string" ? [definition.scope] : definition.scope;
  return defineProviderAction(service, {
    name: definition.name,
    description: definition.description,
    requiredScopes,
    providerPermissions: requiredScopes,

    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
  });
}

const personFilters = {
  email: nonEmptyText("Filter people by email address."),
  displayName: nonEmptyText("Filter people by display name."),
  id: optional(
    s.array("Filter people by one or more Webex person IDs.", id("A Webex person ID."), {
      minItems: 1,
      maxItems: 85,
    }),
  ),
  roles: stringList("Filter people by one or more Webex role IDs."),
  callingData: bool("Whether to include Webex Calling information."),
  locationId: nonEmptyText("Filter people by Webex Calling location ID."),
  excludeStatus: bool("Whether to exclude the person status from the response."),
  max: max1000,
};

const sharedMeetingFields = {
  title: nonEmptyText("The meeting title."),
  agenda: text("The meeting agenda."),
  password: nonEmptyText("The meeting password."),
  start: dateTime("The meeting start time in ISO 8601 format."),
  end: dateTime("The meeting end time in ISO 8601 format."),
  timezone: nonEmptyText("The meeting timezone, such as America/Los_Angeles."),
  recurrence: nonEmptyText("The meeting recurrence rule in Webex recurrence format."),
  enabledAutoRecordMeeting: bool("Whether Webex should automatically record the meeting."),
  enabledJoinBeforeHost: bool("Whether attendees may join before the host."),
  sendEmail: bool("Whether Webex should send meeting notification email."),
  integrationTags,
};

const createMeetingFields = {
  ...sharedMeetingFields,
  joinBeforeHostMinutes: createJoinBeforeHostMinutes,
  invitees: optional(
    s.array(
      "The meeting invitees.",
      s.object(
        "A Webex meeting invitee.",
        {
          email: s.nonEmptyString("The invitee email address."),
          displayName: s.optional(s.string("The invitee display name.")),
          coHost: s.optional(s.boolean("Whether the invitee is a meeting cohost.")),
          panelist: s.optional(s.boolean("Whether the invitee is a webinar panelist.")),
        },
        { required: ["email"] },
      ),
    ),
  ),
  siteUrl: nonEmptyText("The Webex site URL on which to schedule the meeting."),
};

const updateMeetingFields = {
  ...sharedMeetingFields,
  joinBeforeHostMinutes: updateJoinBeforeHostMinutes,
};

const peopleListInput = input(personFilters);

const messageListInput = input(
  {
    roomId: id("The Webex room ID."),
    parentId: nonEmptyText("Only return replies to this parent message ID."),
    mentionedPeople: optional(
      s.array(
        "Only return messages that mention the authenticated user.",
        id("Use me or the authenticated user's Webex person ID."),
        { minItems: 1, maxItems: 1 },
      ),
    ),
    before: dateTime("Only return messages sent before this time."),
    beforeMessage: nonEmptyText("Only return messages sent before this message ID."),
    max: max1000,
  },
  ["roomId"],
);

const directMessageListInput = input({
  parentId: nonEmptyText("Only return replies to this parent message ID."),
  personId: nonEmptyText("Only return direct messages with this Webex person ID."),
  personEmail: nonEmptyText("Only return direct messages with this email address."),
});

const createMessageInput = input({
  roomId: nonEmptyText("The destination Webex room ID."),
  parentId: nonEmptyText("The parent message ID when sending a threaded reply."),
  toPersonId: nonEmptyText("The destination Webex person ID for a direct message."),
  toPersonEmail: nonEmptyText("The destination email address for a direct message."),
  text: text("The plain-text message content."),
  markdown: text("The Markdown message content."),
  files: optional(
    s.array("A publicly accessible file URL to attach to the message.", s.url("The publicly accessible file URL."), {
      minItems: 1,
      maxItems: 1,
    }),
  ),
  attachments: optional(
    s.array("An Adaptive Card attachment to send.", s.looseObject("A Webex attachment object."), {
      minItems: 1,
      maxItems: 1,
    }),
  ),
});

const updateMessageInput = input(
  {
    messageId: id("The Webex message ID."),
    roomId: id("The Webex room ID containing the message."),
    text: text("The replacement plain-text message content."),
    markdown: text("The replacement Markdown message content."),
  },
  ["messageId", "roomId"],
);

const membershipListInput = input({
  roomId: nonEmptyText("Only return memberships for this room ID."),
  personId: nonEmptyText("Only return memberships for this person ID."),
  personEmail: nonEmptyText("Only return memberships for this email address."),
  max: max1000,
});

export const webexActions: ProviderActionDefinition[] = [
  action({
    name: "list_people",
    description: "List people visible to the authenticated Webex user.",
    scope: "spark:people_read",
    inputSchema: peopleListInput,
    outputSchema: listOutput,
  }),
  action({
    name: "get_person",
    description: "Get a Webex person by ID.",
    scope: "spark:people_read",
    inputSchema: input(
      {
        personId: id("The Webex person ID, or me for the authenticated user."),
        callingData: bool("Whether to include Webex Calling information."),
      },
      ["personId"],
    ),
    outputSchema: itemOutput,
  }),
  action({
    name: "list_messages",
    description: "List messages in a Webex room.",
    scope: "spark:messages_read",
    inputSchema: messageListInput,
    outputSchema: listOutput,
  }),
  action({
    name: "list_direct_messages",
    description: "List direct messages involving the authenticated Webex user.",
    scope: "spark:messages_read",
    inputSchema: directMessageListInput,
    outputSchema: listOutput,
  }),
  action({
    name: "create_message",
    description: "Send a message to a Webex room or person.",
    scope: "spark:messages_write",
    inputSchema: createMessageInput,
    outputSchema: itemOutput,
  }),
  action({
    name: "get_message",
    description: "Get a Webex message by ID.",
    scope: "spark:messages_read",
    inputSchema: inputSchemaWithId("messageId", "The Webex message ID."),
    outputSchema: itemOutput,
  }),
  action({
    name: "update_message",
    description: "Update a Webex message.",
    scope: "spark:messages_write",
    inputSchema: updateMessageInput,
    outputSchema: itemOutput,
  }),
  action({
    name: "delete_message",
    description: "Delete a Webex message.",
    scope: "spark:messages_write",
    inputSchema: inputSchemaWithId("messageId", "The Webex message ID."),
    outputSchema: deleteOutput,
  }),
  action({
    name: "list_rooms",
    description: "List rooms visible to the authenticated Webex user.",
    scope: "spark:rooms_read",
    inputSchema: input({
      teamId: nonEmptyText("Only return rooms belonging to this Webex team ID."),
      type: optional(s.stringEnum("Only return rooms of this type.", ["direct", "group"])),
      orgPublicSpaces: bool("Whether to include organization public spaces."),
      from: dateTime("Only return rooms updated after this time."),
      to: dateTime("Only return rooms updated before this time."),
      sortBy: optional(s.stringEnum("How Webex should sort the rooms.", ["id", "lastactivity", "created"])),
      max: max1000,
    }),
    outputSchema: listOutput,
  }),
  action({
    name: "create_room",
    description: "Create a Webex room.",
    scope: "spark:rooms_write",
    inputSchema: input(
      {
        title: id("The room title."),
        teamId: nonEmptyText("The Webex team ID that owns the room."),
        classificationId: nonEmptyText("The Webex room classification ID."),
        isLocked: bool("Whether the room is locked."),
        isPublic: bool("Whether the room is public within the organization."),
        description: text("The room description."),
        isAnnouncementOnly: bool("Whether only moderators can post messages."),
      },
      ["title"],
    ),
    outputSchema: itemOutput,
  }),
  ...resourceCrudActions({
    resource: "room",
    plural: "rooms",
    idField: "roomId",
    idDescription: "The Webex room ID.",
    readScope: "spark:rooms_read",
    writeScope: "spark:rooms_write",
    updateFields: {
      title: id("The replacement room title."),
      classificationId: nonEmptyText("The replacement room classification ID."),
      teamId: nonEmptyText("The Webex team ID that owns the room."),
      isLocked: bool("Whether the room is locked."),
      isPublic: bool("Whether the room is public within the organization."),
      description: text("The replacement room description."),
      isAnnouncementOnly: bool("Whether only moderators can post messages."),
      isReadOnly: bool("Whether the room is read-only."),
    },
    updateRequired: ["title"],
  }),
  ...collectionActions({
    resource: "membership",
    plural: "memberships",
    idField: "membershipId",
    idDescription: "The Webex room membership ID.",
    readScope: "spark:memberships_read",
    writeScope: "spark:memberships_write",
    listInputSchema: membershipListInput,
    createFields: {
      roomId: id("The Webex room ID."),
      personId: nonEmptyText("The Webex person ID to add."),
      personEmail: nonEmptyText("The email address to add."),
      isModerator: bool("Whether the person should be a room moderator."),
    },
    createRequired: ["roomId"],
    updateFields: {
      isModerator: s.boolean("Whether the member is a room moderator."),
      isRoomHidden: s.boolean("Whether the room is hidden for the member."),
    },
    updateRequired: ["isModerator", "isRoomHidden"],
  }),
  ...collectionActions({
    resource: "team",
    plural: "teams",
    idField: "teamId",
    idDescription: "The Webex team ID.",
    readScope: "spark:teams_read",
    writeScope: "spark:teams_write",
    listFields: { max: max1000 },
    createFields: {
      name: id("The team name."),
      description: text("The team description."),
    },
    createRequired: ["name"],
    updateFields: {
      name: id("The replacement team name."),
      description: text("The replacement team description."),
    },
    updateRequired: ["name"],
  }),
  ...collectionActions({
    resource: "team_membership",
    plural: "team_memberships",
    idField: "membershipId",
    idDescription: "The Webex team membership ID.",
    readScope: "spark:team_memberships_read",
    writeScope: "spark:team_memberships_write",
    listFields: {
      teamId: id("The Webex team ID."),
      max: max1000,
    },
    listRequired: ["teamId"],
    createFields: {
      teamId: id("The Webex team ID."),
      personId: nonEmptyText("The Webex person ID to add."),
      personEmail: nonEmptyText("The email address to add."),
      isModerator: bool("Whether the person should be a team moderator."),
    },
    createRequired: ["teamId"],
    updateFields: {
      isModerator: s.boolean("Whether the member is a team moderator."),
    },
    updateRequired: ["isModerator"],
  }),
  action({
    name: "list_meetings",
    description: "List meetings visible to the authenticated Webex user.",
    scope: "meeting:schedules_read",

    inputSchema: input({
      meetingNumber: nonEmptyText("Filter by Webex meeting number."),
      webLink: nonEmptyText("Filter by Webex meeting link."),
      meetingSeriesId: nonEmptyText("Filter by meeting series ID."),
      from: dateTime("Only return meetings after this time."),
      to: dateTime("Only return meetings before this time."),
      meetingType: optional(
        s.stringEnum("The Webex meeting record type.", ["meetingSeries", "scheduledMeeting", "meeting"]),
      ),
      state: optional(
        s.stringEnum("The Webex meeting state.", [
          "active",
          "scheduled",
          "ready",
          "lobby",
          "inProgress",
          "ended",
          "missed",
          "expired",
        ]),
      ),
      scheduledType: optional(
        s.stringEnum("The scheduled meeting type.", ["meeting", "webinar", "personalRoomMeeting"]),
      ),
      current: bool("Whether to return only the current instance of recurring meetings."),
      siteUrl: nonEmptyText("Filter meetings by Webex site URL."),
      integrationTag: nonEmptyText("Filter meetings by integration tag."),
      max: max100,
    }),
    outputSchema: listOutput,
  }),
  action({
    name: "create_meeting",
    description: "Schedule a Webex meeting.",
    scope: "meeting:schedules_write",

    inputSchema: input(createMeetingFields, ["title", "start", "end"]),
    outputSchema: itemOutput,
  }),
  action({
    name: "get_meeting",
    description: "Get a scheduled or historical Webex meeting by ID.",
    scope: "meeting:schedules_read",

    inputSchema: input(
      {
        meetingId: id("The Webex meeting ID."),
        current: bool("Whether to return the current recurring meeting instance."),
      },
      ["meetingId"],
    ),
    outputSchema: itemOutput,
  }),
  action({
    name: "update_meeting",
    description: "Update a scheduled Webex meeting.",
    scope: "meeting:schedules_write",

    inputSchema: input({ meetingId: id("The Webex meeting ID."), ...updateMeetingFields }, ["meetingId"]),
    outputSchema: itemOutput,
  }),
  action({
    name: "delete_meeting",
    description: "Delete a scheduled Webex meeting.",
    scope: "meeting:schedules_write",
    inputSchema: input(
      {
        meetingId: id("The Webex meeting ID."),
        sendEmail: bool("Whether Webex should send cancellation email."),
      },
      ["meetingId"],
    ),
    outputSchema: deleteOutput,
  }),
  action({
    name: "list_meeting_participants",
    description: "List participants for a Webex meeting.",
    scope: "meeting:participants_read",
    inputSchema: input(
      {
        meetingId: id("The Webex meeting ID."),
        breakoutSessionId: nonEmptyText("Only return participants from this breakout session."),
        meetingStartTimeFrom: dateTime("Only return meetings starting after this time."),
        meetingStartTimeTo: dateTime("Only return meetings starting before this time."),
        joinTimeFrom: dateTime("Only return participants who joined after this time."),
        joinTimeTo: dateTime("Only return participants who joined before this time."),
        max: max100,
      },
      ["meetingId"],
    ),
    outputSchema: listOutput,
  }),
  action({
    name: "get_meeting_participant",
    description: "Get a Webex meeting participant by ID.",
    scope: "meeting:participants_read",
    inputSchema: input(
      {
        participantId: id("The Webex meeting participant ID."),
      },
      ["participantId"],
    ),
    outputSchema: itemOutput,
  }),
  action({
    name: "list_recordings",
    description: "List Webex meeting recordings.",
    scope: "meeting:recordings_read",

    inputSchema: input({
      from: dateTime("Only return recordings created after this time."),
      to: dateTime("Only return recordings created before this time."),
      meetingId: nonEmptyText("Filter recordings by Webex meeting ID."),
      siteUrl: nonEmptyText("Filter recordings by Webex site URL."),
      integrationTag: nonEmptyText("Filter recordings by integration tag."),
      topic: nonEmptyText("Filter recordings by topic."),
      format: optional(s.stringEnum("The recording format.", ["MP4", "ARF"])),
      status: optional(s.stringEnum("The recording status.", ["available", "deleted", "purged"])),
      max: max100,
    }),
    outputSchema: listOutput,
  }),
  action({
    name: "get_recording",
    description: "Get Webex meeting recording details.",
    scope: "meeting:recordings_read",

    inputSchema: input(
      {
        recordingId: id("The Webex recording ID."),
      },
      ["recordingId"],
    ),
    outputSchema: itemOutput,
  }),
  action({
    name: "list_meeting_transcripts",
    description: "List transcripts generated for Webex meetings.",
    scope: "meeting:transcripts_read",
    inputSchema: input({
      from: dateTime("Only return transcripts created after this time."),
      to: dateTime("Only return transcripts created before this time."),
      meetingId: nonEmptyText("Filter transcripts by Webex meeting ID."),
      siteUrl: nonEmptyText("Filter transcripts by Webex site URL."),
      max: max100,
    }),
    outputSchema: listOutput,
  }),
  action({
    name: "download_meeting_transcript",
    description: "Download a Webex meeting transcript as VTT or plain text.",
    scope: "meeting:transcripts_read",
    inputSchema: input(
      {
        transcriptId: id("The Webex meeting transcript ID."),
        format: optional(s.stringEnum("The transcript download format.", ["vtt", "txt"])),
      },
      ["transcriptId"],
    ),
    outputSchema: downloadOutput,
  }),
  action({
    name: "get_meeting_summary",
    description: "Get the AI-generated summary for a Webex meeting.",
    scope: "meeting:summaries_read",
    inputSchema: input(
      {
        meetingId: id("The Webex meeting ID."),
      },
      ["meetingId"],
    ),
    outputSchema: listOutput,
  }),
] satisfies ProviderActionDefinition[];

function resourceCrudActions<const TResource extends string>(definition: {
  resource: TResource;
  plural: string;
  idField: string;
  idDescription: string;
  readScope: string;
  writeScope: string;
  updateFields: Record<string, ActionJsonSchema>;
  updateRequired?: readonly string[];
}) {
  return [
    action({
      name: `get_${definition.resource}`,
      description: `Get a Webex ${definition.resource.replaceAll("_", " ")} by ID.`,
      scope: definition.readScope,
      inputSchema: inputSchemaWithId(definition.idField, definition.idDescription),
      outputSchema: itemOutput,
    }),
    action({
      name: `update_${definition.resource}`,
      description: `Update a Webex ${definition.resource.replaceAll("_", " ")}.`,
      scope: definition.writeScope,
      inputSchema: input({ [definition.idField]: id(definition.idDescription), ...definition.updateFields }, [
        definition.idField,
        ...(definition.updateRequired ?? []),
      ]),
      outputSchema: itemOutput,
    }),
    action({
      name: `delete_${definition.resource}`,
      description: `Delete a Webex ${definition.resource.replaceAll("_", " ")}.`,
      scope: definition.writeScope,
      inputSchema: inputSchemaWithId(definition.idField, definition.idDescription),
      outputSchema: deleteOutput,
    }),
  ] as const;
}

function collectionActions<const TResource extends string, const TPlural extends string>(inputValue: {
  resource: TResource;
  plural: TPlural;
  idField: string;
  idDescription: string;
  readScope: string;
  writeScope: string;
  listFields?: Record<string, ActionJsonSchema>;
  listInputSchema?: ActionJsonSchema;
  listRequired?: readonly string[];
  createFields: Record<string, ActionJsonSchema>;
  createRequired: readonly string[];
  updateFields: Record<string, ActionJsonSchema>;
  updateRequired: readonly string[];
}) {
  return [
    action({
      name: `list_${inputValue.plural}`,
      description: `List Webex ${inputValue.plural.replaceAll("_", " ")}.`,
      scope: inputValue.readScope,
      inputSchema: inputValue.listInputSchema ?? input(inputValue.listFields ?? {}, inputValue.listRequired),
      outputSchema: listOutput,
    }),
    action({
      name: `create_${inputValue.resource}`,
      description: `Create a Webex ${inputValue.resource.replaceAll("_", " ")}.`,
      scope: inputValue.writeScope,
      inputSchema:
        inputValue.resource === "membership" || inputValue.resource === "team_membership"
          ? input(inputValue.createFields, inputValue.createRequired)
          : input(inputValue.createFields, inputValue.createRequired),
      outputSchema: itemOutput,
    }),
    ...resourceCrudActions({
      resource: inputValue.resource,
      plural: inputValue.plural,
      idField: inputValue.idField,
      idDescription: inputValue.idDescription,
      readScope: inputValue.readScope,
      writeScope: inputValue.writeScope,
      updateFields: inputValue.updateFields,
      updateRequired: inputValue.updateRequired,
    }),
  ] as const;
}

function inputSchemaWithId(idField: string, description: string) {
  return input({ [idField]: id(description) }, [idField]);
}
