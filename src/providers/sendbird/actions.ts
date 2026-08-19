import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sendbird" as const;

const looseObjectSchema = s.looseObject("An object returned by the official Sendbird API.");
const metadataSchema = s.record("A metadata object whose keys and values are strings.", s.string("A metadata value."));
const stringArraySchema = s.stringArray("A list of non-empty strings.", {
  itemDescription: "A non-empty string value.",
});
const limitField = s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 });
const tokenField = s.string("The pagination token returned by the previous response.");
const userIdField = s.nonEmptyString("The Sendbird user ID.");
const channelUrlField = s.nonEmptyString("The unique URL of the target group channel.");
const messageIdField = s.nonNegativeInteger("The numeric identifier of the Sendbird message.");
const timestampField = s.nonNegativeInteger("A Unix timestamp in milliseconds.");

const sendbirdUserSchema = s.looseRequiredObject("A Sendbird user object.", {
  user_id: s.string("The unique ID of the user."),
});

const sendbirdMemberSchema = s.looseRequiredObject("A Sendbird group channel member.", {
  user_id: s.string("The unique ID of the member."),
});

const sendbirdMessageSchema = s.looseRequiredObject("A Sendbird group channel message.", {
  message_id: s.nonNegativeInteger("The unique message ID."),
});

const sendbirdGroupChannelSchema = s.looseRequiredObject("A Sendbird group channel.", {
  channel_url: s.string("The unique URL of the group channel."),
});

const sendbirdBannedMemberSchema = s.looseRequiredObject("A banned user record returned by Sendbird.", {
  user_id: s.string("The unique ID of the banned user."),
});

const successSchema = s.object("A successful Sendbird write response.", {
  success: s.boolean("Whether the request succeeded."),
});

const moderationResultSchema = s.looseObject("The moderation result returned by Sendbird.");
const unreadCountsSchema = s.looseObject("The unread item counts returned by Sendbird.");
const sessionTokenSchema = s.looseObject("The issued Sendbird session token.");

const groupChannelCountsSchema = s.object("The aggregated group channel counts by join status.", {
  total: s.nonNegativeInteger("The total count of joined and invited group channels."),
  joined: s.nonNegativeInteger("The number of channels the user has joined."),
  invited: s.nonNegativeInteger("The number of channels the user has been invited to."),
  invited_by_friend: s.nonNegativeInteger("The number of channels the user was invited to by a friend."),
  invited_by_non_friend: s.nonNegativeInteger("The number of channels the user was invited to by a non-friend."),
});

function defineSendbirdAction<TName extends string>(
  name: TName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ProviderActionDefinition<TName> {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}

const listUsers = defineSendbirdAction(
  "list_users",
  "List Sendbird users with common pagination and filtering controls.",
  s.object(
    "The input payload for listing Sendbird users.",
    {
      limit: limitField,
      token: tokenField,
      order: s.stringEnum("The result ordering returned by Sendbird.", [
        "nickname_alphabetical",
        "created_at",
        "user_id_alphabetical",
      ]),
      user_ids: stringArraySchema,
      nickname: s.string("Filter by an exact nickname match."),
      nickname_contains: s.string("Filter by a nickname substring match."),
      nickname_startswith: s.string("Filter by a nickname prefix supported by the official API."),
      active_mode: s.stringEnum("The official active-mode filter.", ["activated", "deactivated", "all"]),
      show_bot: s.boolean("Whether to include bot users in the results."),
      metadatakey: s.string("The official metadata key filter."),
      metadatavalues_in: stringArraySchema,
      custom_type: s.string("Filter by the user custom type when supported by Sendbird."),
      has_ever_logged_in: s.boolean("Filter by whether the user has logged in when supported by Sendbird."),
    },
    { additionalProperties: true },
  ),
  s.looseObject("The response returned when listing Sendbird users.", {
    users: s.array("The users returned by Sendbird.", sendbirdUserSchema),
    next: s.nullableString("The pagination token for the next page, or null when there is no next page."),
  }),
);

const viewUser = defineSendbirdAction(
  "view_user",
  "Get a single Sendbird user by user ID.",
  s.object("The input payload for getting a Sendbird user.", { user_id: userIdField }),
  sendbirdUserSchema,
);

const createUser = defineSendbirdAction(
  "create_user",
  "Create a Sendbird user with common profile and metadata fields.",
  s.object(
    "The input payload for creating a Sendbird user.",
    {
      user_id: userIdField,
      nickname: s.string("The nickname to assign to the new user."),
      profile_url: s.string("The URL of the user's profile image."),
      metadata: metadataSchema,
      issue_access_token: s.boolean("Whether Sendbird should issue an access token for the user."),
      discovery_keys: stringArraySchema,
      preferred_languages: stringArraySchema,
      is_active: s.boolean("Whether the user should be active."),
      phone_number: s.string("The phone number to store for the user."),
      has_ever_logged_in: s.boolean("Whether the user has logged in before when supported by Sendbird."),
    },
    { required: ["user_id"], additionalProperties: true },
  ),
  sendbirdUserSchema,
);

const updateUser = defineSendbirdAction(
  "update_user",
  "Update a Sendbird user's profile, metadata, or activation settings.",
  s.object(
    "The input payload for updating a Sendbird user.",
    {
      user_id: userIdField,
      nickname: s.string("The new nickname for the user."),
      profile_url: s.string("The new profile image URL."),
      metadata: metadataSchema,
      issue_access_token: s.boolean("Whether Sendbird should issue a new access token for the user."),
      preferred_languages: stringArraySchema,
      is_active: s.boolean("Whether the user should remain active."),
      phone_number: s.string("The phone number to store for the user."),
      has_ever_logged_in: s.boolean("Whether the user has logged in before when supported by Sendbird."),
    },
    { required: ["user_id"], additionalProperties: true },
  ),
  sendbirdUserSchema,
);

const deleteUser = defineSendbirdAction(
  "delete_user",
  "Delete a Sendbird user.",
  s.object(
    "The input payload for deleting a Sendbird user.",
    {
      user_id: userIdField,
      hard_delete: s.boolean("Whether to permanently delete the user and related data."),
    },
    { required: ["user_id"] },
  ),
  successSchema,
);

const issueSessionToken = defineSendbirdAction(
  "issue_session_token",
  "Issue a Sendbird session token for a user.",
  s.object(
    "The input payload for issuing a Sendbird session token.",
    {
      user_id: userIdField,
      expires_at: timestampField,
    },
    { required: ["user_id"] },
  ),
  sessionTokenSchema,
);

const revokeAllSessionTokens = defineSendbirdAction(
  "revoke_all_session_tokens",
  "Revoke all Sendbird session tokens for a user.",
  s.object("The input payload for revoking all session tokens.", { user_id: userIdField }),
  successSchema,
);

const getNumberOfUnreadItems = defineSendbirdAction(
  "get_number_of_unread_items",
  "Get unread message, mention, and invitation counts for a Sendbird user.",
  s.object(
    "The input payload for getting unread item counts.",
    {
      user_id: userIdField,
      item_keys: s.union([s.nonEmptyString("A comma-separated unread item key list."), stringArraySchema], {
        description: "The unread item keys to retrieve.",
      }),
      custom_types: s.union([s.nonEmptyString("A comma-separated custom type list."), stringArraySchema], {
        description: "The custom channel types to filter the counts by.",
      }),
    },
    { required: ["user_id"] },
  ),
  unreadCountsSchema,
);

const getNumberOfChannelsByJoinStatus = defineSendbirdAction(
  "get_number_of_channels_by_join_status",
  "Get Sendbird group channel counts grouped by join status.",
  s.object(
    "The input payload for getting group channel counts by join status.",
    {
      user_id: userIdField,
      super_mode: s.stringEnum("Filter by whether the channel is a supergroup.", ["all", "super", "nonsuper"]),
      public_mode: s.stringEnum("Filter by whether the channel is public.", ["all", "public", "private"]),
      distinct_mode: s.stringEnum("Filter by whether the channel is distinct.", ["all", "distinct", "nondistinct"]),
      hidden_mode: s.string("The hidden-mode filter supported by the official API."),
      unread_filter: s.string("The unread filter supported by the official API."),
      custom_types: stringArraySchema,
      state: s.stringEnum("When provided, only the specified join-state count is requested.", [
        "joined_only",
        "invited_only",
        "invited_by_friend",
        "invited_by_non_friend",
      ]),
    },
    { required: ["user_id"] },
  ),
  groupChannelCountsSchema,
);

const markAllUserMessagesAsRead = defineSendbirdAction(
  "mark_all_user_messages_as_read",
  "Mark all messages as read for a Sendbird user.",
  s.object(
    "The input payload for marking all messages as read.",
    {
      user_id: userIdField,
      channel_urls: stringArraySchema,
    },
    { required: ["user_id"] },
  ),
  successSchema,
);

const leaveGroupChannels = defineSendbirdAction(
  "leave_group_channels",
  "Make a Sendbird user leave one or more joined group channels.",
  s.object(
    "The input payload for leaving group channels.",
    {
      user_id: userIdField,
      should_leave_all: s.boolean("Whether the user should leave all joined group channels."),
      channel_urls: stringArraySchema,
      custom_type: s.string("Restrict the leave operation to channels with this custom type."),
    },
    { required: ["user_id"] },
  ),
  successSchema,
);

const listGroupChannels = defineSendbirdAction(
  "list_group_channels",
  "List Sendbird group channels in the application with common filtering controls.",
  s.object(
    "The input payload for listing group channels.",
    {
      limit: limitField,
      token: tokenField,
      name: s.string("Filter by an exact channel name."),
      show_empty: s.boolean("Whether to include empty channels."),
      show_frozen: s.boolean("Whether to include frozen channels."),
      show_metadata: s.boolean("Whether to include channel metadata."),
      show_member: s.boolean("Whether to include channel members."),
      show_read_receipt: s.boolean("Whether to include read receipts."),
      show_delivery_receipt: s.boolean("Whether to include delivery receipts."),
      show_hidden: s.boolean("Whether to include hidden channels."),
      show_member_info: s.boolean("Whether to include detailed member information when supported by Sendbird."),
      super_mode: s.stringEnum("Filter by whether the channel is a supergroup.", ["all", "super", "nonsuper"]),
      public_mode: s.stringEnum("Filter by whether the channel is public.", ["all", "public", "private"]),
      distinct_mode: s.stringEnum("Filter by whether the channel is distinct.", ["all", "distinct", "nondistinct"]),
      hidden_mode: s.string("The hidden-mode filter supported by Sendbird."),
      custom_types: stringArraySchema,
      channel_urls: stringArraySchema,
      members_include_in: stringArraySchema,
      members_exactly_in: stringArraySchema,
      members_nickname: s.string("Filter channels by a member nickname match."),
      url_contains: s.string("Filter by a substring of the channel URL."),
      created_after: timestampField,
      created_before: timestampField,
      my_member_state: s.stringEnum("Filter by the member state reported by Sendbird.", [
        "all",
        "joined_only",
        "invited_only",
        "invited_by_friend",
        "invited_by_non_friend",
      ]),
    },
    { additionalProperties: true },
  ),
  s.looseObject("The response returned when listing Sendbird group channels.", {
    channels: s.array("The group channels returned by Sendbird.", sendbirdGroupChannelSchema),
    next: s.nullableString("The pagination token for the next page, or null when there is no next page."),
  }),
);

const viewGroupChannel = defineSendbirdAction(
  "view_group_channel",
  "Get a Sendbird group channel by channel URL.",
  s.object(
    "The input payload for getting a group channel.",
    {
      channel_url: channelUrlField,
      show_member: s.boolean("Whether to include the member list."),
      show_metadata: s.boolean("Whether to include channel metadata."),
      show_read_receipt: s.boolean("Whether to include read receipt data."),
      show_delivery_receipt: s.boolean("Whether to include delivery receipt data."),
      show_migration_info: s.boolean("Whether to include migration information when available."),
    },
    { required: ["channel_url"] },
  ),
  sendbirdGroupChannelSchema,
);

const createChannel = defineSendbirdAction(
  "create_channel",
  "Create a Sendbird group channel with common JSON body fields.",
  s.object(
    "The input payload for creating a group channel.",
    {
      name: s.string("The channel name."),
      channel_url: s.string("The custom channel URL to create."),
      user_ids: stringArraySchema,
      operator_ids: stringArraySchema,
      cover_url: s.string("The cover image URL to assign to the channel."),
      custom_type: s.string("The custom type to assign to the channel."),
      data: s.string("The custom data payload to store for the channel."),
      is_distinct: s.boolean("Whether the channel should be distinct."),
      is_public: s.boolean("Whether the channel should be public."),
      is_super: s.boolean("Whether the channel should be a supergroup."),
      is_ephemeral: s.boolean("Whether the channel should be ephemeral."),
      is_discoverable: s.boolean("Whether the channel should be discoverable when supported by Sendbird."),
      access_code: s.string("The access code for a private public channel."),
      strict: s.boolean("Whether Sendbird should fail if a matching channel already exists."),
      message_survival_seconds: s.nonNegativeInteger(
        "The message survival duration in seconds when supported by Sendbird.",
      ),
    },
    { additionalProperties: true },
  ),
  sendbirdGroupChannelSchema,
);

const updateGroupChannel = defineSendbirdAction(
  "update_group_channel",
  "Update a Sendbird group channel with common JSON body fields.",
  s.object(
    "The input payload for updating a group channel.",
    {
      channel_url: channelUrlField,
      name: s.string("The new channel name."),
      cover_url: s.string("The new cover image URL."),
      custom_type: s.string("The custom type to assign to the channel."),
      data: s.string("The custom data payload to store for the channel."),
      operators: stringArraySchema,
      is_distinct: s.boolean("Whether the channel should be distinct."),
      is_public: s.boolean("Whether the channel should be public."),
      is_super: s.boolean("Whether the channel should be a supergroup."),
      is_ephemeral: s.boolean("Whether the channel should be ephemeral."),
      access_code: s.string("The access code to assign to the channel."),
      my_count_preference: s.string("The count preference to store when supported by Sendbird."),
    },
    { required: ["channel_url"], additionalProperties: true },
  ),
  sendbirdGroupChannelSchema,
);

const deleteChannel = defineSendbirdAction(
  "delete_channel",
  "Delete a Sendbird group channel.",
  s.object("The input payload for deleting a group channel.", { channel_url: channelUrlField }),
  successSchema,
);

const listMembersGroupChannel = defineSendbirdAction(
  "list_members_group_channel",
  "List members of a Sendbird group channel.",
  s.object(
    "The input payload for listing group channel members.",
    {
      channel_url: channelUrlField,
      limit: limitField,
      token: tokenField,
      offset: s.nonNegativeInteger("The deprecated offset-based pagination value."),
      order: s.stringEnum("The ordering of the returned members.", ["nickname_alphabetical", "operator_alphabetical"]),
      operator_filter: s.stringEnum("Filter by operator status.", ["all", "operator", "nonoperator"]),
      member_state_filter: s.stringEnum("Filter by membership state.", ["all", "joined_only", "invited_only"]),
      muted_member_filter: s.stringEnum("Filter by whether the member is muted.", ["all", "muted", "unmuted"]),
      nickname_startswith: s.string("Filter by a member nickname prefix."),
    },
    { required: ["channel_url"] },
  ),
  s.looseObject("The response returned when listing group channel members.", {
    members: s.array("The members returned by Sendbird.", sendbirdMemberSchema),
    next: s.nullableString("The pagination token for the next page, or null when there is no next page."),
    total_count: s.nonNegativeInteger("The total number of matching members when Sendbird returns it."),
  }),
);

const addMembersGroupChannel = defineSendbirdAction(
  "add_members_group_channel",
  "Invite members into an existing Sendbird group channel.",
  s.object(
    "The input payload for adding members into a group channel.",
    {
      channel_url: channelUrlField,
      user_ids: stringArraySchema,
      hide_existing_messages: s.boolean("Whether to hide previous messages from the invited users."),
      seconds: s.nonNegativeInteger("The hide-existing-messages duration in seconds when required by Sendbird."),
    },
    { required: ["channel_url", "user_ids"] },
  ),
  sendbirdGroupChannelSchema,
);

const listGroupChannelMessagesInputSchema = {
  ...s.object(
    "The input payload for listing group channel messages.",
    {
      channel_url: channelUrlField,
      message_id: messageIdField,
      message_ts: timestampField,
      prev_limit: s.integer("The number of messages to return before the anchor.", { minimum: 0, maximum: 200 }),
      next_limit: s.integer("The number of messages to return after the anchor.", { minimum: 0, maximum: 200 }),
      include: s.boolean("Whether to include the anchor message."),
      reverse: s.boolean("Whether to reverse the result ordering."),
      sender_id: s.string("Restrict results to a single sender ID."),
      sender_ids: s.union([s.nonEmptyString("A comma-separated sender ID list."), stringArraySchema], {
        description: "Restrict results to the provided sender IDs.",
      }),
      message_type: s.string("Restrict results to the provided Sendbird message types."),
      custom_types: s.union([s.nonEmptyString("A comma-separated custom type list."), stringArraySchema], {
        description: "Restrict results to the provided custom message types.",
      }),
      operator_filter: s.string("Filter by whether the sender is an operator."),
      include_reactions: s.boolean("Whether to include reaction information."),
      including_removed: s.boolean("Whether to include removed messages."),
      include_reply_type: s.string("The reply-type filter supported by Sendbird."),
      include_thread_info: s.boolean("Whether to include thread information."),
      include_poll_details: s.boolean("Whether to include poll details."),
      include_parent_message_info: s.boolean("Whether to include parent message information."),
      with_sorted_metaarray: s.boolean("Whether to include sorted metaarray values."),
    },
    { required: ["channel_url"], additionalProperties: true },
  ),
  anyOf: [{ required: ["message_id"] }, { required: ["message_ts"] }],
};

const listGroupChannelMessages = defineSendbirdAction(
  "list_group_channel_messages",
  "List messages from a Sendbird group channel around a timestamp or message anchor.",
  listGroupChannelMessagesInputSchema,
  s.looseObject("The response returned when listing group channel messages.", {
    messages: s.array("The messages returned by Sendbird.", sendbirdMessageSchema),
    next: s.nullableString("The pagination token for the next page when Sendbird returns one."),
  }),
);

const viewMessage = defineSendbirdAction(
  "view_message",
  "Get a single Sendbird group channel message by message ID.",
  s.object(
    "The input payload for getting a Sendbird message.",
    {
      channel_url: channelUrlField,
      message_id: messageIdField,
      with_sorted_metaarray: s.boolean("Whether to include sorted metaarray values."),
    },
    { required: ["channel_url", "message_id"] },
  ),
  sendbirdMessageSchema,
);

const sendMessage = defineSendbirdAction(
  "send_message",
  "Send a message into a Sendbird group channel.",
  s.object(
    "The input payload for sending a group channel message.",
    {
      channel_url: channelUrlField,
      message_type: s.nonEmptyString("The Sendbird message type to create."),
      message: s.string("The message text content."),
      user_id: s.string("The acting Sendbird user ID."),
      data: s.string("The custom data payload for the message."),
      custom_type: s.string("The custom type assigned to the message."),
      mention_type: s.string("The mention type for the message."),
      mentioned_user_ids: stringArraySchema,
      parent_message_id: s.nonNegativeInteger("The parent message ID when creating a thread reply."),
      is_silent: s.boolean("Whether the message should be silent."),
      is_operator_message: s.boolean("Whether the message should be marked as an operator message."),
      push_notification_delivery_option: s.string("The push notification delivery option to use."),
      translation_target_languages: stringArraySchema,
      metaarray: s.array(
        "The metadata entries to store for the message.",
        s.looseObject("A message metadata entry.", {
          key: s.string("The metadata key."),
          value: s.string("The metadata value."),
          user_id: s.string("The metadata user ID when provided."),
        }),
      ),
    },
    { required: ["channel_url", "message_type"], additionalProperties: true },
  ),
  sendbirdMessageSchema,
);

const updateMessage = defineSendbirdAction(
  "update_message",
  "Update an existing Sendbird group channel message.",
  s.object(
    "The input payload for updating a group channel message.",
    {
      channel_url: channelUrlField,
      message_id: messageIdField,
      message: s.string("The updated message text content."),
      data: s.string("The updated custom data payload."),
      user_id: s.string("The acting Sendbird user ID."),
      custom_type: s.string("The updated custom type."),
      mention_type: s.string("The updated mention type."),
      mentioned_user_ids: stringArraySchema,
      is_silent: s.boolean("Whether the update should be silent."),
      push_notification_delivery_option: s.string("The push notification delivery option to use."),
      sorted_metaarray: s.array("The sorted metaarray payload to store for the message.", looseObjectSchema),
    },
    { required: ["channel_url", "message_id"], additionalProperties: true },
  ),
  sendbirdMessageSchema,
);

const deleteMessage = defineSendbirdAction(
  "delete_message",
  "Delete a Sendbird group channel message.",
  s.object(
    "The input payload for deleting a group channel message.",
    {
      channel_url: channelUrlField,
      message_id: messageIdField,
    },
    { required: ["channel_url", "message_id"] },
  ),
  successSchema,
);

const listBannedMembers = defineSendbirdAction(
  "list_banned_members",
  "List banned users from a Sendbird group channel.",
  s.object(
    "The input payload for listing banned users.",
    {
      channel_url: channelUrlField,
      limit: limitField,
      token: tokenField,
    },
    { required: ["channel_url"] },
  ),
  s.looseObject("The response returned when listing banned users.", {
    banned_list: s.array("The banned users returned by Sendbird.", sendbirdBannedMemberSchema),
    next: s.nullableString("The pagination token for the next page, or null when there is no next page."),
  }),
);

const banUserFromGroupChannel = defineSendbirdAction(
  "ban_user_from_group_channel",
  "Ban a user from a Sendbird group channel.",
  s.object(
    "The input payload for banning a user from a group channel.",
    {
      channel_url: channelUrlField,
      user_id: userIdField,
      seconds: s.nonNegativeInteger("The ban duration in seconds. Omit for a permanent ban."),
      description: s.string("The moderation reason to record."),
      agent_id: s.string("The moderator ID performing the action."),
    },
    { required: ["channel_url", "user_id"] },
  ),
  moderationResultSchema,
);

const unbanUser = defineSendbirdAction(
  "unban_user",
  "Unban a user from a Sendbird group channel.",
  s.object(
    "The input payload for unbanning a user from a group channel.",
    {
      channel_url: channelUrlField,
      banned_user_id: s.nonEmptyString("The banned user ID to unban from the channel."),
    },
    { required: ["channel_url", "banned_user_id"] },
  ),
  moderationResultSchema,
);

const muteUser = defineSendbirdAction(
  "mute_user",
  "Mute a user in a Sendbird group channel.",
  s.object(
    "The input payload for muting a user in a group channel.",
    {
      channel_url: channelUrlField,
      user_id: userIdField,
      seconds: s.nonNegativeInteger(
        "The mute duration in seconds. Use 0 for an indefinite mute when supported by Sendbird.",
      ),
      description: s.string("The moderation reason to record."),
    },
    { required: ["channel_url", "user_id"] },
  ),
  moderationResultSchema,
);

const unmuteUser = defineSendbirdAction(
  "unmute_user",
  "Unmute a user in a Sendbird group channel.",
  s.object(
    "The input payload for unmuting a user in a group channel.",
    {
      channel_url: channelUrlField,
      muted_user_id: s.nonEmptyString("The muted user ID to unmute from the channel."),
    },
    { required: ["channel_url", "muted_user_id"] },
  ),
  moderationResultSchema,
);

export const sendbirdActions: ActionDefinition[] = [
  listUsers,
  viewUser,
  createUser,
  updateUser,
  deleteUser,
  issueSessionToken,
  revokeAllSessionTokens,
  getNumberOfUnreadItems,
  getNumberOfChannelsByJoinStatus,
  markAllUserMessagesAsRead,
  leaveGroupChannels,
  listGroupChannels,
  viewGroupChannel,
  createChannel,
  updateGroupChannel,
  deleteChannel,
  listMembersGroupChannel,
  addMembersGroupChannel,
  listGroupChannelMessages,
  viewMessage,
  sendMessage,
  updateMessage,
  deleteMessage,
  listBannedMembers,
  banUserFromGroupChannel,
  unbanUser,
  muteUser,
  unmuteUser,
];
