import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rocket_chat";

const emptyInputSchema = s.object("Input parameters for the Rocket.Chat action.", {});
const looseRocketChatObject = s.looseObject("Rocket.Chat object returned by the API.");
const looseRocketChatArray = s.array("Rocket.Chat objects returned by the API.", looseRocketChatObject);
const messageObjectSchema = s.looseObject("Rocket.Chat message object returned by the API.", {
  _id: s.nonEmptyString("The Rocket.Chat message ID."),
  rid: s.nonEmptyString("The room ID that owns the message."),
  msg: s.string("The message text."),
});
const fieldsSchema = s.record(
  "Rocket.Chat fields projection object. Use 1 to include and 0 to exclude each property.",
  s.integer("Whether to include or exclude this field.", { minimum: 0, maximum: 1 }),
);
const sortSchema = s.record("Rocket.Chat sort object. Use 1 for ascending and -1 for descending.", {
  type: "integer",
  enum: [-1, 1],
  description: "The sort direction.",
});
const attachmentFieldSchema = s.object(
  "Rocket.Chat attachment field.",
  {
    title: s.nonEmptyString("The attachment field title."),
    value: s.string("The attachment field value."),
    short: s.boolean("Whether this field should be displayed as a short field."),
  },
  { optional: ["short"] },
);
const attachmentSchema = s.looseObject("Rocket.Chat message attachment.", {
  audio_url: s.url("Audio URL for the attachment."),
  author_icon: s.url("Icon URL displayed next to the author name."),
  author_link: s.url("URL linked from the author name."),
  author_name: s.string("Attachment author name."),
  collapsed: s.boolean("Whether the attachment should render collapsed."),
  color: s.string("Attachment accent color."),
  fields: s.array("Attachment fields.", attachmentFieldSchema),
  image_url: s.url("Image URL for the attachment."),
  message_link: s.url("URL linked from the attachment timestamp."),
  text: s.string("Attachment text."),
  thumb_url: s.url("Thumbnail URL for the attachment."),
  title: s.string("Attachment title."),
  title_link: s.url("URL linked from the attachment title."),
  title_link_download: s.boolean("Whether title_link should download when clicked."),
  ts: s.string("Attachment timestamp string."),
  video_url: s.url("Video URL for the attachment."),
});

const listRoomsInputSchema = s.object(
  "Input parameters for listing opened Rocket.Chat rooms.",
  {
    updatedSince: s.dateTime("Only return room updates and removals since this ISO date-time."),
  },
  { optional: ["updatedSince"] },
);

const getRoomInputSchema = {
  ...s.object(
    "Input parameters for retrieving one Rocket.Chat room.",
    {
      roomId: s.nonEmptyString("The room ID. Required if roomName is omitted."),
      roomName: s.nonEmptyString("The room name. Required if roomId is omitted."),
      fields: fieldsSchema,
    },
    { optional: ["roomId", "roomName", "fields"] },
  ),
  anyOf: [{ required: ["roomId"] }, { required: ["roomName"] }],
};

const listChannelMessagesInputSchema = s.object(
  "Input parameters for listing Rocket.Chat public channel messages.",
  {
    roomId: s.nonEmptyString("The public channel room ID."),
    count: s.positiveInteger("The number of messages to return."),
    offset: s.nonNegativeInteger("The number of messages to skip."),
    sort: sortSchema,
    mentionIds: s.array(
      "User IDs that must be mentioned by returned messages.",
      s.nonEmptyString("A mentioned user ID."),
    ),
    starredIds: s.array(
      "User IDs that must have starred returned messages.",
      s.nonEmptyString("A user ID for starred-message filtering."),
    ),
    pinned: s.boolean("Whether to return only pinned messages."),
  },
  { optional: ["count", "offset", "sort", "mentionIds", "starredIds", "pinned"] },
);

const getMessageInputSchema = s.object("Input parameters for retrieving one Rocket.Chat message.", {
  msgId: s.nonEmptyString("The message ID."),
});

const messageOutputSchema = s.object("Rocket.Chat message response.", {
  message: messageObjectSchema,
  success: s.boolean("Whether Rocket.Chat reported success."),
});

export const rocketChatActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    description: "Get the authenticated Rocket.Chat profile.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Rocket.Chat profile response.", {
      profile: looseRocketChatObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_rooms",
    description: "List Rocket.Chat rooms opened for the authenticated user.",
    inputSchema: listRoomsInputSchema,
    outputSchema: s.object("Rocket.Chat rooms response.", {
      update: looseRocketChatArray,
      remove: looseRocketChatArray,
      success: s.boolean("Whether Rocket.Chat reported success."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_room",
    description: "Get metadata for one Rocket.Chat room by ID or name.",
    inputSchema: getRoomInputSchema,
    outputSchema: s.object(
      "Rocket.Chat room information response.",
      {
        room: looseRocketChatObject,
        team: looseRocketChatObject,
        parent: looseRocketChatObject,
        success: s.boolean("Whether Rocket.Chat reported success."),
      },
      { optional: ["team", "parent"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_channel_messages",
    description: "List messages in a Rocket.Chat public channel.",
    inputSchema: listChannelMessagesInputSchema,
    outputSchema: s.object("Rocket.Chat channel messages response.", {
      messages: s.array("Rocket.Chat messages.", messageObjectSchema),
      count: s.integer("The number of returned messages."),
      offset: s.integer("The response offset."),
      total: s.integer("The total number of matching messages."),
      success: s.boolean("Whether Rocket.Chat reported success."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Get one Rocket.Chat message by ID.",
    inputSchema: getMessageInputSchema,
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "post_message",
    description: "Post a message to a Rocket.Chat room, channel, or user target.",
    inputSchema: s.object(
      "Input parameters for posting one Rocket.Chat message.",
      {
        roomId: s.nonEmptyString(
          "The room ID, channel name, or username target. Channel names must include the # prefix and usernames can use @.",
        ),
        text: s.string("The message text to send."),
        parseUrls: s.boolean("Whether Rocket.Chat should generate URL previews."),
        alias: s.string("Display alias for the message when the user has impersonation permission."),
        avatar: s.url("Avatar URL for the message when the user has impersonation permission."),
        emoji: s.string("Emoji avatar for the message when the user has impersonation permission."),
        attachments: s.array("Message attachments.", attachmentSchema),
        tmid: s.nonEmptyString("The original message ID for a thread reply."),
        customFields: s.looseObject("Custom message fields configured by the workspace."),
      },
      { optional: ["text", "parseUrls", "alias", "avatar", "emoji", "attachments", "tmid", "customFields"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_message",
    description: "Update an existing Rocket.Chat message.",
    inputSchema: s.object(
      "Input parameters for updating one Rocket.Chat message.",
      {
        roomId: s.nonEmptyString("The room ID where the message is located."),
        msgId: s.nonEmptyString("The message ID to update."),
        text: s.string("The updated message text."),
        previewUrls: s.array("URLs whose previews should be generated.", s.url("A preview URL.")),
        customFields: s.looseObject("Custom message fields configured by the workspace."),
      },
      { optional: ["previewUrls", "customFields"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_message",
    description: "Delete an existing Rocket.Chat message.",
    inputSchema: s.object(
      "Input parameters for deleting one Rocket.Chat message.",
      {
        roomId: s.nonEmptyString("The room ID where the message is located."),
        msgId: s.nonEmptyString("The message ID to delete."),
        asUser: s.boolean("Whether to delete as the user who sent the message."),
      },
      { optional: ["asUser"] },
    ),
    outputSchema: s.looseObject("Rocket.Chat delete message response.", {
      _id: s.nonEmptyString("The deleted message ID."),
      message: looseRocketChatObject,
      success: s.boolean("Whether Rocket.Chat reported success."),
    }),
  }),
];
