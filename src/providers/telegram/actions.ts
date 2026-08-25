import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "telegram";

const chatIdSchema: JsonSchema = s.union(
  [
    s.integer("A numeric Telegram chat identifier."),
    s.stringPattern("^-?\\d+$", { description: "A numeric Telegram chat identifier encoded as a string." }),
    s.stringPattern("^@[A-Za-z0-9_]+$", { description: "A Telegram @username for a public chat or channel." }),
  ],
  { description: "The target Telegram chat ID or channel username." },
);
const parseModeSchema = s.stringEnum("The parse mode used for message entities.", ["Markdown", "MarkdownV2", "HTML"]);
const looseObject = (description: string) => s.looseObject(description);
const replyMarkupSchema = s.union(
  [s.nonEmptyString("A JSON-serialized object string."), looseObject("A Telegram reply markup object.")],
  { description: "A Telegram reply markup object or JSON object string." },
);

const telegramUserSchema = looseObject("A Telegram user or bot record.");
const telegramChatSchema = looseObject("A Telegram chat record.");
const telegramMessageSchema = looseObject("A normalized Telegram message record.");
const telegramUpdateSchema = looseObject("A Telegram update payload.");
const telegramChatMemberSchema = looseObject("A Telegram chat member record.");
const telegramBusinessConnectionSchema = looseObject("A Telegram business connection record.");
const telegramChatInviteLinkSchema = looseObject("A Telegram chat invite link record.");
const successSchema = s.actionOutput(
  {
    success: s.literal(true, { description: "Whether the Telegram Bot API request succeeded." }),
  },
  "A success response payload.",
);
const messageIdSchema = s.positiveInteger("A Telegram message identifier.");
const messageIdsSchema = s.array("The identifiers of 1-100 Telegram messages.", messageIdSchema, {
  minItems: 1,
  maxItems: 100,
});
const businessConnectionIdSchema = s.nonEmptyString("The unique identifier of the Telegram business connection.");
const chatPermissionsSchema = s.actionInput({
  canSendMessages: s.boolean("Whether users may send text messages, contacts, giveaways, and locations."),
  canSendAudios: s.boolean("Whether users may send audio files."),
  canSendDocuments: s.boolean("Whether users may send documents."),
  canSendPhotos: s.boolean("Whether users may send photos."),
  canSendVideos: s.boolean("Whether users may send videos."),
  canSendVideoNotes: s.boolean("Whether users may send video notes."),
  canSendVoiceNotes: s.boolean("Whether users may send voice notes."),
  canSendPolls: s.boolean("Whether users may send polls."),
  canSendOtherMessages: s.boolean("Whether users may send animations, games, stickers, and other media."),
  canAddWebPagePreviews: s.boolean("Whether users may add web page previews."),
  canChangeInfo: s.boolean("Whether users may change chat information."),
  canInviteUsers: s.boolean("Whether users may invite new users."),
  canPinMessages: s.boolean("Whether users may pin messages."),
  canManageTopics: s.boolean("Whether users may create and manage forum topics."),
});
const messageIdsOutputSchema = s.actionOutput({
  messageIds: s.array("The returned message identifiers.", messageIdSchema),
});
const chatInviteLinkOptionsSchema = {
  name: s.string("The invite link name.", { maxLength: 32 }),
  expireDate: s.integer("The Unix timestamp when the link expires."),
  memberLimit: s.integer("The maximum number of simultaneous members using the link.", {
    minimum: 1,
    maximum: 99999,
  }),
  createsJoinRequest: s.boolean("Whether users joining through the link require administrator approval."),
};

export const telegramActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    description: "Validate the bot token and return the bot profile from Telegram Bot API.",
    inputSchema: s.actionInput({}),
    outputSchema: telegramUserSchema,
  }),
  defineProviderAction(service, {
    name: "get_webhook_info",
    description: "Return the webhook status configured for the bot.",
    inputSchema: s.actionInput({}),
    outputSchema: looseObject("Telegram webhook status information."),
  }),
  defineProviderAction(service, {
    name: "get_updates",
    description: "Poll pending updates for the bot. Use this only when webhook delivery is disabled or for debugging.",
    inputSchema: s.actionInput({
      offset: s.integer("The update ID offset to start polling from."),
      limit: s.integer("The maximum number of updates to return.", { minimum: 1, maximum: 100 }),
      timeout: s.integer("The long-polling timeout in seconds.", { minimum: 0, maximum: 50 }),
      allowedUpdates: s.stringArray("The update types to receive."),
    }),
    outputSchema: s.actionOutput({
      updates: s.array("The updates returned by Telegram.", telegramUpdateSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a text message to a chat, group, supergroup, channel, or forum topic.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        text: s.string("The text of the message to send.", { minLength: 1, maxLength: 4096 }),
        businessConnectionId: businessConnectionIdSchema,
        parseMode: parseModeSchema,
        disableNotification: s.boolean("Whether to send the message silently."),
        protectContent: s.boolean("Whether to protect the sent message from forwarding and saving."),
        disableWebPagePreview: s.boolean("Whether to disable link previews in the message."),
        messageThreadId: s.positiveInteger("The forum topic ID for the target message thread."),
        replyToMessageId: s.positiveInteger("The message ID to reply to."),
      },
      ["chatId", "text"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "copy_message",
    description: "Copy one message without linking back to the original message.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        fromChatId: chatIdSchema,
        messageId: messageIdSchema,
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        caption: s.string("A replacement media caption.", { maxLength: 1024 }),
        parseMode: parseModeSchema,
        showCaptionAboveMedia: s.boolean("Whether to show the replacement caption above the media."),
        disableNotification: s.boolean("Whether to copy the message silently."),
        protectContent: s.boolean("Whether to protect the copied message from forwarding and saving."),
      },
      ["chatId", "fromChatId", "messageId"],
    ),
    outputSchema: s.actionOutput({
      messageId: messageIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "copy_messages",
    description: "Copy 1-100 messages without links to the originals while preserving album grouping.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        fromChatId: chatIdSchema,
        messageIds: messageIdsSchema,
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to deliver the messages silently."),
        protectContent: s.boolean("Whether to protect the messages from forwarding and saving."),
        removeCaption: s.boolean("Whether to remove captions from copied messages."),
      },
      ["chatId", "fromChatId", "messageIds"],
    ),
    outputSchema: messageIdsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "forward_messages",
    description: "Forward 1-100 messages while preserving links and album grouping.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        fromChatId: chatIdSchema,
        messageIds: messageIdsSchema,
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to deliver the messages silently."),
        protectContent: s.boolean("Whether to protect the messages from forwarding and saving."),
      },
      ["chatId", "fromChatId", "messageIds"],
    ),
    outputSchema: messageIdsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_messages",
    description: "Delete 1-100 messages from one Telegram chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        messageIds: messageIdsSchema,
      },
      ["chatId", "messageIds"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "set_message_reaction",
    description: "Replace the bot's chosen reaction on a Telegram message.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        messageId: messageIdSchema,
        reaction: s.array(
          "The reaction types to set; an empty array removes the reaction.",
          looseObject("A Telegram ReactionType object."),
          {
            maxItems: 1,
          },
        ),
        isBig: s.boolean("Whether to display a large reaction animation."),
      },
      ["chatId", "messageId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "send_chat_action",
    description: "Show a temporary typing, upload, recording, or location activity status in a chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        action: s.stringEnum("The activity status to broadcast.", [
          "typing",
          "upload_photo",
          "record_video",
          "upload_video",
          "record_voice",
          "upload_voice",
          "upload_document",
          "choose_sticker",
          "find_location",
          "record_video_note",
          "upload_video_note",
        ]),
        businessConnectionId: businessConnectionIdSchema,
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
      },
      ["chatId", "action"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "send_video",
    description: "Send an MPEG-4 video by URL or Telegram file_id.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        video: s.nonEmptyString("The HTTP URL or Telegram file_id of the MPEG-4 video to send."),
        businessConnectionId: businessConnectionIdSchema,
        caption: s.string("The media caption.", { maxLength: 1024 }),
        parseMode: parseModeSchema,
        duration: s.nonNegativeInteger("The media duration in seconds."),
        width: s.positiveInteger("The video width."),
        height: s.positiveInteger("The video height."),
        cover: s.nonEmptyString("The HTTP URL or Telegram file_id of the video cover."),
        startTimestamp: s.nonNegativeInteger("The start timestamp shown for the video."),
        showCaptionAboveMedia: s.boolean("Whether to show the caption above the video."),
        hasSpoiler: s.boolean("Whether to cover the video with a spoiler animation."),
        supportsStreaming: s.boolean("Whether the video supports streaming."),
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to send the media silently."),
        protectContent: s.boolean("Whether to protect the media from forwarding and saving."),
      },
      ["chatId", "video"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_audio",
    description: "Send an MP3 or M4A audio track by URL or Telegram file_id.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        audio: s.nonEmptyString("The HTTP URL or Telegram file_id of the MP3 or M4A audio to send."),
        businessConnectionId: businessConnectionIdSchema,
        caption: s.string("The media caption.", { maxLength: 1024 }),
        parseMode: parseModeSchema,
        duration: s.nonNegativeInteger("The media duration in seconds."),
        performer: s.string("The audio performer."),
        title: s.string("The audio track name."),
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to send the media silently."),
        protectContent: s.boolean("Whether to protect the media from forwarding and saving."),
      },
      ["chatId", "audio"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_voice",
    description: "Send a playable voice message by URL or Telegram file_id.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        voice: s.nonEmptyString("The HTTP URL or Telegram file_id of the OGG, MP3, or M4A voice message."),
        businessConnectionId: businessConnectionIdSchema,
        caption: s.string("The media caption.", { maxLength: 1024 }),
        parseMode: parseModeSchema,
        duration: s.nonNegativeInteger("The media duration in seconds."),
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to send the media silently."),
        protectContent: s.boolean("Whether to protect the media from forwarding and saving."),
      },
      ["chatId", "voice"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_animation",
    description: "Send a GIF or silent MPEG-4 animation by URL or Telegram file_id.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        animation: s.nonEmptyString("The HTTP URL or Telegram file_id of the GIF or silent MPEG-4 animation."),
        businessConnectionId: businessConnectionIdSchema,
        caption: s.string("The media caption.", { maxLength: 1024 }),
        parseMode: parseModeSchema,
        duration: s.nonNegativeInteger("The media duration in seconds."),
        width: s.positiveInteger("The animation width."),
        height: s.positiveInteger("The animation height."),
        showCaptionAboveMedia: s.boolean("Whether to show the caption above the animation."),
        hasSpoiler: s.boolean("Whether to cover the animation with a spoiler animation."),
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to send the media silently."),
        protectContent: s.boolean("Whether to protect the media from forwarding and saving."),
      },
      ["chatId", "animation"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_media_group",
    description: "Send an album containing 2-10 photos, videos, documents, or audio items.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        media: s.array(
          "The InputMedia objects in the album.",
          s.looseRequiredObject("A Telegram InputMedia object.", {
            type: s.stringEnum("The media type.", ["photo", "video", "audio", "document"]),
            media: s.nonEmptyString("The HTTP URL or Telegram file_id of the media."),
          }),
          { minItems: 2, maxItems: 10 },
        ),
        businessConnectionId: businessConnectionIdSchema,
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to send the album silently."),
        protectContent: s.boolean("Whether to protect the album from forwarding and saving."),
      },
      ["chatId", "media"],
    ),
    outputSchema: s.actionOutput({
      messages: s.array("The sent media messages.", telegramMessageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "send_contact",
    description: "Send a phone contact to a Telegram chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        phoneNumber: s.nonEmptyString("The contact phone number."),
        firstName: s.nonEmptyString("The contact first name."),
        lastName: s.string("The contact last name."),
        vcard: s.string("Additional contact data in vCard format.", { maxLength: 2048 }),
        businessConnectionId: businessConnectionIdSchema,
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to send the contact silently."),
        protectContent: s.boolean("Whether to protect the contact from forwarding and saving."),
      },
      ["chatId", "phoneNumber", "firstName"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_venue",
    description: "Send a venue with coordinates, title, address, and optional place identifiers.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        latitude: s.number("The venue latitude.", { minimum: -90, maximum: 90 }),
        longitude: s.number("The venue longitude.", { minimum: -180, maximum: 180 }),
        title: s.nonEmptyString("The venue name."),
        address: s.nonEmptyString("The venue address."),
        foursquareId: s.string("The Foursquare place identifier."),
        foursquareType: s.string("The Foursquare place type."),
        googlePlaceId: s.string("The Google Places identifier."),
        googlePlaceType: s.string("The Google Places type."),
        businessConnectionId: businessConnectionIdSchema,
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to send the venue silently."),
        protectContent: s.boolean("Whether to protect the venue from forwarding and saving."),
      },
      ["chatId", "latitude", "longitude", "title", "address"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_dice",
    description: "Send an animated dice, darts, basketball, football, bowling, or slot-machine emoji.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        emoji: s.stringEnum("The dice animation emoji.", ["🎲", "🎯", "🏀", "⚽", "🎳", "🎰"]),
        businessConnectionId: businessConnectionIdSchema,
        messageThreadId: s.positiveInteger("The target forum topic identifier."),
        disableNotification: s.boolean("Whether to send the animation silently."),
        protectContent: s.boolean("Whether to protect the animation from forwarding."),
      },
      ["chatId"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "get_business_connection",
    description: "Return the current state and granted rights of a Telegram business connection.",
    inputSchema: s.actionInput(
      {
        businessConnectionId: businessConnectionIdSchema,
      },
      ["businessConnectionId"],
    ),
    outputSchema: telegramBusinessConnectionSchema,
  }),
  defineProviderAction(service, {
    name: "read_business_message",
    description: "Mark an incoming message as read on behalf of a connected Telegram business account.",
    inputSchema: s.actionInput(
      {
        businessConnectionId: businessConnectionIdSchema,
        chatId: s.integer("The identifier of the active private chat."),
        messageId: messageIdSchema,
      },
      ["businessConnectionId", "chatId", "messageId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "delete_business_messages",
    description: "Delete one or more messages on behalf of a connected Telegram business account.",
    inputSchema: s.actionInput(
      {
        businessConnectionId: businessConnectionIdSchema,
        messageIds: messageIdsSchema,
      },
      ["businessConnectionId", "messageIds"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "edit_message_text",
    description: "Edit the text of a previously sent message or an inline message.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        messageId: s.positiveInteger("The message ID to edit."),
        inlineMessageId: s.nonEmptyString("The inline message ID to edit."),
        text: s.string("The new message text.", { minLength: 1, maxLength: 4096 }),
        parseMode: parseModeSchema,
        disableWebPagePreview: s.boolean("Whether to disable link previews in the edited message."),
      },
      ["text"],
    ),
    outputSchema: s.actionOutput({
      edited: s.literal(true, { description: "Whether the message edit succeeded." }),
      message: s.nullable(telegramMessageSchema),
      inlineMessageId: s.nullableString("The inline message ID when editing an inline message."),
    }),
  }),
  defineProviderAction(service, {
    name: "send_photo",
    description: "Send a photo by public URL or existing Telegram file_id.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        photo: s.nonEmptyString("The photo URL or existing Telegram file_id to send."),
        caption: s.string("The caption for the photo.", { maxLength: 1024 }),
        parseMode: parseModeSchema,
        disableNotification: s.boolean("Whether to send the photo silently."),
        protectContent: s.boolean("Whether to protect the photo from forwarding and saving."),
        messageThreadId: s.positiveInteger("The forum topic ID for the target message thread."),
        replyToMessageId: s.positiveInteger("The message ID to reply to."),
      },
      ["chatId", "photo"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_document",
    description: "Send a document by public URL or existing Telegram file_id.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        document: s.nonEmptyString("The document URL or existing Telegram file_id to send."),
        caption: s.string("The caption for the document.", { maxLength: 1024 }),
        parseMode: parseModeSchema,
        thumbnail: s.nonEmptyString("An optional thumbnail URL or file identifier."),
        replyMarkup: replyMarkupSchema,
        replyToMessageId: s.positiveInteger("The message ID to reply to."),
        disableNotification: s.boolean("Whether to send the document silently."),
        disableContentTypeDetection: s.boolean("Whether to disable server-side content type detection."),
      },
      ["chatId", "document"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_poll",
    description: "Send a native Telegram poll to a chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        question: s.string("The question shown at the top of the poll.", { minLength: 1, maxLength: 300 }),
        options: s.array("The answer options available in the poll.", s.string({ minLength: 1, maxLength: 100 }), {
          minItems: 2,
          maxItems: 10,
        }),
        type: s.stringEnum("The type of poll to send.", ["regular", "quiz"]),
        isAnonymous: s.boolean("Whether the poll should be anonymous."),
        allowsMultipleAnswers: s.boolean("Whether users can choose multiple answers."),
        correctOptionId: s.integer("The zero-based index of the correct option for quiz polls.", { minimum: 0 }),
        explanation: s.string("The explanation shown for quiz polls.", { maxLength: 200 }),
        explanationParseMode: parseModeSchema,
        openPeriod: s.integer("The number of seconds the poll should stay open.", { minimum: 5, maximum: 600 }),
        closeDate: s.integer("The Unix timestamp when the poll should close."),
        isClosed: s.boolean("Whether the poll should be sent already closed."),
        disableNotification: s.boolean("Whether to send the poll silently."),
        replyToMessageId: s.positiveInteger("The message ID to reply to."),
        replyMarkup: replyMarkupSchema,
      },
      ["chatId", "question", "options"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "get_chat",
    description: "Return metadata for a chat the bot can access.",
    inputSchema: s.actionInput({ chatId: chatIdSchema }, ["chatId"]),
    outputSchema: telegramChatSchema,
  }),
  defineProviderAction(service, {
    name: "get_chat_member",
    description: "Return information about one chat member.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        userId: s.integer("The user ID of the chat member to fetch."),
      },
      ["chatId", "userId"],
    ),
    outputSchema: telegramChatMemberSchema,
  }),
  defineProviderAction(service, {
    name: "get_chat_administrators",
    description: "Return the chat administrators visible to the bot.",
    inputSchema: s.actionInput({ chatId: chatIdSchema }, ["chatId"]),
    outputSchema: s.actionOutput({
      administrators: s.array("The administrators visible to the bot in the chat.", telegramChatMemberSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_chat_members_count",
    description: "Return the number of members in a chat.",
    inputSchema: s.actionInput({ chatId: chatIdSchema }, ["chatId"]),
    outputSchema: s.actionOutput({
      memberCount: s.integer("The number of members currently in the chat."),
    }),
  }),
  defineProviderAction(service, {
    name: "ban_chat_member",
    description: "Ban a user from a group, supergroup, or channel.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        userId: s.integer("The target user identifier."),
        untilDate: s.integer("The Unix timestamp when the ban ends."),
        revokeMessages: s.boolean("Whether to delete all messages from the banned user."),
      },
      ["chatId", "userId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "unban_chat_member",
    description: "Unban a user so they can join the chat again.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        userId: s.integer("The target user identifier."),
        onlyIfBanned: s.boolean("Whether to do nothing when the user is not currently banned."),
      },
      ["chatId", "userId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "restrict_chat_member",
    description: "Set temporary or permanent permissions for one supergroup member.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        userId: s.integer("The target user identifier."),
        permissions: chatPermissionsSchema,
        useIndependentChatPermissions: s.boolean("Whether each media permission is applied independently."),
        untilDate: s.integer("The Unix timestamp when the restrictions end."),
      },
      ["chatId", "userId", "permissions"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "promote_chat_member",
    description: "Promote, update, or demote a supergroup or channel administrator.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        userId: s.integer("The target user identifier."),
        isAnonymous: s.boolean("Whether the administrator is hidden."),
        canManageChat: s.boolean("Whether the administrator can access general chat management features."),
        canDeleteMessages: s.boolean("Whether the administrator can delete other users' messages."),
        canManageVideoChats: s.boolean("Whether the administrator can manage video chats."),
        canRestrictMembers: s.boolean("Whether the administrator can restrict or ban members."),
        canPromoteMembers: s.boolean("Whether the administrator can appoint other administrators."),
        canChangeInfo: s.boolean("Whether the administrator can change chat information."),
        canInviteUsers: s.boolean("Whether the administrator can invite users."),
        canPostStories: s.boolean("Whether the administrator can post stories."),
        canEditStories: s.boolean("Whether the administrator can edit stories."),
        canDeleteStories: s.boolean("Whether the administrator can delete stories."),
        canPostMessages: s.boolean("Whether the administrator can post channel messages."),
        canEditMessages: s.boolean("Whether the administrator can edit channel messages."),
        canPinMessages: s.boolean("Whether the administrator can pin messages."),
        canManageTopics: s.boolean("Whether the administrator can manage forum topics."),
        canManageDirectMessages: s.boolean("Whether the administrator can manage channel direct messages."),
        canManageTags: s.boolean("Whether the administrator can manage member tags."),
      },
      ["chatId", "userId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "set_chat_permissions",
    description: "Set default permissions for all members of a group or supergroup.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        permissions: chatPermissionsSchema,
        useIndependentChatPermissions: s.boolean("Whether each media permission is applied independently."),
      },
      ["chatId", "permissions"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "pin_chat_message",
    description: "Pin a message in a Telegram chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        messageId: messageIdSchema,
        businessConnectionId: businessConnectionIdSchema,
        disableNotification: s.boolean("Whether to suppress the pin notification."),
      },
      ["chatId", "messageId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "unpin_chat_message",
    description: "Unpin one message, or the most recently pinned message, from a Telegram chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        messageId: messageIdSchema,
        businessConnectionId: businessConnectionIdSchema,
      },
      ["chatId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "unpin_all_chat_messages",
    description: "Remove all pinned messages from a Telegram chat.",
    inputSchema: s.actionInput({ chatId: chatIdSchema }, ["chatId"]),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "approve_chat_join_request",
    description: "Approve a user's pending request to join a Telegram chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        userId: s.integer("The user identifier from the join request."),
      },
      ["chatId", "userId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "decline_chat_join_request",
    description: "Decline a user's pending request to join a Telegram chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        userId: s.integer("The user identifier from the join request."),
      },
      ["chatId", "userId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "delete_message",
    description: "Delete a message from a chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        messageId: s.positiveInteger("The message ID to delete."),
      },
      ["chatId", "messageId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "forward_message",
    description: "Forward a message from one chat to another.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        fromChatId: chatIdSchema,
        messageId: s.positiveInteger("The source message ID to forward."),
        disableNotification: s.boolean("Whether to forward the message silently."),
      },
      ["chatId", "fromChatId", "messageId"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "send_location",
    description: "Send a map location to a chat.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        latitude: s.number("The latitude of the location.", { minimum: -90, maximum: 90 }),
        longitude: s.number("The longitude of the location.", { minimum: -180, maximum: 180 }),
        horizontalAccuracy: s.number("The radius of uncertainty for the location, in meters.", {
          minimum: 0,
          maximum: 1500,
        }),
        livePeriod: s.integer("The live location update period in seconds.", { minimum: 60, maximum: 86400 }),
        heading: s.integer("The direction in which the user is moving, in degrees.", { minimum: 1, maximum: 360 }),
        proximityAlertRadius: s.integer("The distance in meters for proximity alerts.", {
          minimum: 1,
          maximum: 100000,
        }),
        disableNotification: s.boolean("Whether to send the location silently."),
        replyToMessageId: s.positiveInteger("The message ID to reply to."),
        replyMarkup: replyMarkupSchema,
      },
      ["chatId", "latitude", "longitude"],
    ),
    outputSchema: telegramMessageSchema,
  }),
  defineProviderAction(service, {
    name: "export_chat_invite_link",
    description: "Export the primary invite link for a Telegram chat.",
    inputSchema: s.actionInput({ chatId: chatIdSchema }, ["chatId"]),
    outputSchema: s.actionOutput({
      inviteLink: s.string("The exported invite link for the chat."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_chat_invite_link",
    description: "Create an additional Telegram chat invite link with optional expiry or approval rules.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        ...chatInviteLinkOptionsSchema,
      },
      ["chatId"],
    ),
    outputSchema: telegramChatInviteLinkSchema,
  }),
  defineProviderAction(service, {
    name: "edit_chat_invite_link",
    description: "Edit an additional Telegram chat invite link created by the bot.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        inviteLink: s.nonEmptyString("The invite link to edit."),
        ...chatInviteLinkOptionsSchema,
      },
      ["chatId", "inviteLink"],
    ),
    outputSchema: telegramChatInviteLinkSchema,
  }),
  defineProviderAction(service, {
    name: "revoke_chat_invite_link",
    description: "Revoke a Telegram chat invite link created by the bot.",
    inputSchema: s.actionInput(
      {
        chatId: chatIdSchema,
        inviteLink: s.nonEmptyString("The invite link to revoke."),
      },
      ["chatId", "inviteLink"],
    ),
    outputSchema: telegramChatInviteLinkSchema,
  }),
  defineProviderAction(service, {
    name: "answer_callback_query",
    description: "Answer an inline keyboard callback query.",
    inputSchema: s.actionInput(
      {
        callbackQueryId: s.nonEmptyString("The callback query ID to answer."),
        text: s.string("The notification text to show to the user.", { maxLength: 200 }),
        showAlert: s.boolean("Whether to show an alert instead of a notification."),
        url: s.url("The URL to open for the callback query."),
        cacheTime: s.integer("The maximum time in seconds that the result may be cached client-side.", { minimum: 0 }),
      },
      ["callbackQueryId"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "set_my_commands",
    description: "Set the bot command list exposed in Telegram clients.",
    inputSchema: s.actionInput(
      {
        commands: s.array(
          "The bot commands to register.",
          s.object({
            command: s.stringPattern("^[a-z0-9_]+$", {
              description: "The command text without the leading slash.",
            }),
            description: s.string("The description shown for the bot command.", { minLength: 1, maxLength: 256 }),
          }),
          { minItems: 1, maxItems: 100 },
        ),
        scope: replyMarkupSchema,
        languageCode: s.string("The language code for localized commands.", { minLength: 2, maxLength: 35 }),
      },
      ["commands"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "set_webhook",
    description: "Configure a webhook endpoint for update delivery.",
    inputSchema: s.actionInput(
      {
        url: s.url("The HTTPS webhook URL that Telegram should deliver updates to."),
        secretToken: s.string("The secret token Telegram should include in webhook requests.", {
          minLength: 1,
          maxLength: 256,
        }),
        maxConnections: s.integer("The maximum number of concurrent webhook connections.", {
          minimum: 1,
          maximum: 100,
        }),
        allowedUpdates: s.stringArray("The update types that should be delivered to the webhook."),
        dropPendingUpdates: s.boolean("Whether to drop all pending updates before setting the webhook."),
      },
      ["url"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "delete_webhook",
    description: "Delete the configured webhook and optionally drop pending updates.",
    inputSchema: s.actionInput({
      dropPendingUpdates: s.boolean("Whether to drop all pending updates when deleting the webhook."),
    }),
    outputSchema: successSchema,
  }),
];
