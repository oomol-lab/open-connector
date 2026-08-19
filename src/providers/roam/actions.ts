import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "roam";

const emptyInputSchema = s.actionInput({}, [], "No input parameters are required for this action.");
const rawPayloadSchema = s.unknown("The raw JSON payload returned by Roam HQ.");

const groupSchema = s.looseObject("A public, non-archived Roam HQ group.", {
  addressId: s.string("The Roam group address ID."),
  roamId: s.integer("The numeric Roam ID."),
  accountId: s.integer("The numeric account ID."),
  groupType: s.string("The group type reported by Roam HQ."),
  name: s.string("The group display name."),
  accessMode: s.string("The group access mode."),
  groupManagement: s.string("The group management setting."),
  enforceThreadedMode: s.boolean("Whether threaded mode is enforced for the group."),
  dateCreated: s.string("The timestamp when the group was created."),
  imageUrl: s.url("The group image URL."),
});

const senderSchema = s.object(
  "Optional bot sender identity for a Roam HQ message.",
  {
    id: s.string("The internal bot sender ID.", { minLength: 1, maxLength: 16 }),
    name: s.nonEmptyString("The user-visible bot sender name."),
    imageUrl: s.url("The bot sender image URL."),
  },
  { optional: ["name", "imageUrl"] },
);

const sendMessageInputSchema = s.object(
  "Input payload for sending a Roam HQ group message.",
  {
    groupId: s.uuid("The Roam HQ group address ID to send the message to."),
    text: s.nonEmptyString("The message text to send."),
    markdown: s.boolean("Whether Roam HQ should interpret the text as Markdown."),
    sender: senderSchema,
  },
  { optional: ["markdown", "sender"] },
);

const sendMessageOutputSchema = s.actionOutput(
  {
    chatId: s.string("The chat ID returned by Roam HQ."),
    status: s.string("The send status returned by Roam HQ."),
    raw: rawPayloadSchema,
  },
  "The normalized Roam HQ send-message response.",
);

const paginationInputSchema = s.object(
  "Input pagination parameters for Roam HQ list actions.",
  {
    limit: s.positiveInteger("The maximum number of items to request.", { maximum: 100 }),
    cursor: s.nonEmptyString("The opaque pagination cursor returned by a previous response."),
  },
  { optional: ["limit", "cursor"] },
);

const listRecordingsInputSchema = s.object(
  "Input parameters for listing Roam HQ meeting recordings.",
  {
    after: s.nonEmptyString("The UTC date or RFC 3339 datetime to begin listing recordings."),
    before: s.nonEmptyString("The UTC date or RFC 3339 datetime until which to list recordings."),
    limit: s.positiveInteger("The maximum number of recordings to request.", { maximum: 100 }),
    cursor: s.nonEmptyString("The opaque pagination cursor returned by a previous response."),
  },
  { optional: ["after", "before", "limit", "cursor"] },
);

const recordingSchema = s.looseObject("A Roam HQ meeting recording.", {
  recordingId: s.uuid("The unique recording ID."),
  location: s.string("The Roam room where the recording took place."),
  startTime: s.dateTime("The timestamp when the recording began."),
  endTime: s.dateTime("The timestamp when the recording ended."),
  videoUrl: s.url("The downloadable video URL for the recording."),
});

const magicastSchema = s.looseObject("A Roam HQ magicast.", {
  id: s.uuid("The unique magicast ID."),
  name: s.string("The magicast display name."),
  createdAt: s.dateTime("The timestamp when the magicast was created."),
  ownerId: s.uuid("The address ID of the magicast owner."),
  coverImageUrl: s.url("The magicast cover image thumbnail URL."),
});

const getMagicastInputSchema = s.actionInput(
  {
    id: s.uuid("The magicast ID."),
  },
  ["id"],
  "Input parameters for retrieving a Roam HQ magicast.",
);

export const roamActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_groups",
    description: "List public, non-archived groups in the authenticated Roam HQ organization.",
    requiredScopes: ["groups:read"],
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        groups: s.array("The groups returned by Roam HQ.", groupSchema),
        raw: rawPayloadSchema,
      },
      "The normalized Roam HQ group list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a message to a single Roam HQ group as a bot.",
    requiredScopes: ["chat:send_message"],
    inputSchema: sendMessageInputSchema,
    outputSchema: sendMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_recordings",
    description: "List Roam HQ meeting recordings with optional date filtering and pagination.",
    requiredScopes: ["recordings:read"],
    inputSchema: listRecordingsInputSchema,
    outputSchema: s.actionOutput(
      {
        recordings: s.array("The recordings returned by Roam HQ.", recordingSchema),
        nextCursor: s.nullable(s.string("The cursor for the next page of recordings.")),
        raw: rawPayloadSchema,
      },
      "The normalized Roam HQ recording list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_magicasts",
    description: "List Roam HQ magicasts in reverse chronological order.",
    requiredScopes: ["magicast:read"],
    inputSchema: paginationInputSchema,
    outputSchema: s.actionOutput(
      {
        magicasts: s.array("The magicasts returned by Roam HQ.", magicastSchema),
        nextCursor: s.nullable(s.string("The cursor for the next page of magicasts.")),
        raw: rawPayloadSchema,
      },
      "The normalized Roam HQ magicast list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_magicast",
    description: "Retrieve a Roam HQ magicast by ID.",
    requiredScopes: ["magicast:read"],
    inputSchema: getMagicastInputSchema,
    outputSchema: s.actionOutput(
      {
        magicast: magicastSchema,
        raw: rawPayloadSchema,
      },
      "The normalized Roam HQ magicast response.",
    ),
  }),
];
