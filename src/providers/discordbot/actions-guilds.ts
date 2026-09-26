import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { auditLogReasonSchema, binaryFileSchema, rawObjectSchema, snowflakeSchema, successSchema } from "./schemas.ts";

const service = "discordbot";

const imageDataSchema = (description: string): JsonSchema =>
  s.nullableString(`${description} Pass a data URI such as data:image/png;base64,..., or null to remove it.`);
const snowflakeArraySchema = (description: string, options: { maxItems?: number } = {}): JsonSchema =>
  s.array(description, snowflakeSchema, options);
const memberListLimitSchema = s.integer("The maximum number of members to return. Discord defaults to 1.", {
  minimum: 1,
  maximum: 1000,
});
const deleteMessageSecondsSchema = s.integer(
  "How many seconds of the banned user's recent messages to delete, from 0 to 604800 (7 days).",
  { minimum: 0, maximum: 604800 },
);
const pruneDaysSchema = s.integer(
  "The number of days of inactivity that qualifies a member for pruning. Discord defaults to 7.",
  {
    minimum: 1,
    maximum: 30,
  },
);
const roleColorsSchema = s.looseObject(
  "The role colors object with primary_color, secondary_color, and tertiary_color.",
  {
    primary_color: s.integer("The primary RGB color value."),
    secondary_color: s.nullableInteger("The secondary RGB color value for a gradient role."),
    tertiary_color: s.nullableInteger("The tertiary RGB color value for a holographic role."),
  },
);
const roleFieldSchemas: Record<string, JsonSchema> = {
  name: s.string("The role name.", { maxLength: 100 }),
  permissions: s.string("The role permissions as a bitwise value encoded as a string."),
  color: s.integer("The deprecated RGB color value. Prefer colors."),
  colors: roleColorsSchema,
  hoist: s.boolean("Whether members with the role are displayed separately in the member list."),
  icon: imageDataSchema("The role icon image, for guilds with the ROLE_ICONS feature."),
  unicode_emoji: s.nullableString("The role's standard unicode emoji, for guilds with the ROLE_ICONS feature."),
  mentionable: s.boolean("Whether anyone can mention the role."),
  audit_log_reason: auditLogReasonSchema,
};

export const discordbotGuildActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_guild",
    operationType: "read",
    description: "Get a Discord guild by ID, optionally including approximate member and presence counts.",
    inputSchema: guildSchema("Input parameters for getting a guild.", {
      with_counts: s.boolean("Whether to include approximate_member_count and approximate_presence_count."),
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_preview",
    operationType: "read",
    description:
      "Get the public preview of a Discord guild. The bot must be in the guild unless the guild is discoverable.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "modify_guild",
    operationType: "write",
    description: "Update a Discord guild's settings. Requires the MANAGE_GUILD permission.",
    inputSchema: guildSchema("Input parameters for updating a guild. Only the provided fields are changed.", {
      name: s.string("The guild name.", { minLength: 2, maxLength: 100 }),
      verification_level: s.nullableInteger("The verification level.", { minimum: 0, maximum: 4 }),
      default_message_notifications: s.nullableInteger("The default message notification level.", {
        minimum: 0,
        maximum: 1,
      }),
      explicit_content_filter: s.nullableInteger("The explicit content filter level.", { minimum: 0, maximum: 2 }),
      afk_channel_id: s.nullableString("The AFK voice channel id, or null to clear it."),
      afk_timeout: s.withEnum(s.integer("The AFK timeout in seconds."), [60, 300, 900, 1800, 3600]),
      icon: imageDataSchema("The guild icon."),
      splash: imageDataSchema("The invite splash image, for guilds with the INVITE_SPLASH feature."),
      discovery_splash: imageDataSchema("The discovery splash image, for guilds with the DISCOVERABLE feature."),
      banner: imageDataSchema("The guild banner, for guilds with the BANNER feature."),
      system_channel_id: s.nullableString("The channel id for system messages such as welcomes, or null to clear it."),
      system_channel_flags: s.integer("The system channel flags bitfield."),
      rules_channel_id: s.nullableString("The rules channel id for Community guilds, or null to clear it."),
      public_updates_channel_id: s.nullableString(
        "The channel id where Community guild moderators receive Discord notices, or null to clear it.",
      ),
      safety_alerts_channel_id: s.nullableString(
        "The channel id where Community guild moderators receive safety alerts, or null to clear it.",
      ),
      preferred_locale: s.nullableString("The preferred locale of a Community guild, such as en-US."),
      features: s.stringArray("The complete list of enabled guild feature strings."),
      description: s.nullableString("The guild description."),
      premium_progress_bar_enabled: s.boolean("Whether the boost progress bar is shown."),
      audit_log_reason: auditLogReasonSchema,
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_guild_channels",
    operationType: "read",
    description: "List channels in a Discord guild. Threads are not included.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The guild channels response.", {
      channels: s.array("The channels returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_guild_channel",
    operationType: "write",
    description: "Create a channel in a Discord guild. Requires the MANAGE_CHANNELS permission.",
    inputSchema: guildSchema(
      "Input parameters for creating a guild channel.",
      {
        name: s.string("The channel name.", { minLength: 1, maxLength: 100 }),
        type: s.integer("The channel type, such as 0 for text, 2 for voice, 4 for category, or 15 for forum."),
        topic: s.string("The channel topic.", { maxLength: 1024 }),
        bitrate: s.integer("The bitrate in bits per second for voice and stage channels.", { minimum: 8000 }),
        user_limit: s.integer("The user limit for voice and stage channels.", { minimum: 0 }),
        rate_limit_per_user: s.integer("The slowmode delay in seconds.", { minimum: 0, maximum: 21600 }),
        position: s.integer("The sorting position of the channel."),
        permission_overwrites: s.array("The channel permission overwrites.", rawObjectSchema),
        parent_id: s.string("The parent category id."),
        nsfw: s.boolean("Whether the channel is age-restricted."),
        rtc_region: s.nullableString("The voice region id for voice and stage channels, or null for automatic."),
        video_quality_mode: s.integer("The camera video quality mode for voice and stage channels."),
        default_auto_archive_duration: s.withEnum(
          s.integer("The default thread auto-archive duration in minutes."),
          [60, 1440, 4320, 10080],
        ),
        default_reaction_emoji: rawObjectSchema,
        available_tags: s.array("The tags available in forum and media channels.", rawObjectSchema),
        default_sort_order: s.integer("The default sort order for forum and media posts."),
        default_forum_layout: s.integer("The default forum layout view."),
        default_thread_rate_limit_per_user: s.integer("The initial slowmode delay in seconds for new threads."),
        flags: s.integer("The channel flags bitfield."),
        audit_log_reason: auditLogReasonSchema,
      },
      ["name"],
    ),
    outputSchema: s.requiredObject("The created channel response.", { channel: rawObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "modify_guild_channel_positions",
    operationType: "write",
    description:
      "Reorder or re-parent channels in a Discord guild. Requires the MANAGE_CHANNELS permission. Only one entry per request may change parent_id.",
    inputSchema: guildSchema(
      "Input parameters for changing channel positions.",
      {
        positions: s.array(
          "The channels to move.",
          s.object(
            "A channel position change.",
            {
              id: snowflakeSchema,
              position: s.nullableInteger("The new sorting position."),
              lock_permissions: s.nullableBoolean(
                "Whether to sync permission overwrites with the new parent category.",
              ),
              parent_id: s.nullableString("The new parent category id, or null to move the channel out of a category."),
              flags: s.nullableInteger("The channel flags bitfield."),
            },
            { required: ["id"] },
          ),
          { minItems: 1 },
        ),
      },
      ["positions"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "list_active_guild_threads",
    operationType: "read",
    description: "List all active public and private threads in a Discord guild.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The active threads response.", {
      threads: s.array("The active thread channels.", rawObjectSchema),
      members: s.array("A thread member object for each returned thread the bot has joined.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_guild_member",
    operationType: "read",
    description: "Get a member of a Discord guild by user ID.",
    inputSchema: guildSchema("Input parameters containing a guild id and user id.", { user_id: snowflakeSchema }, [
      "user_id",
    ]),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_guild_members",
    operationType: "read",
    description:
      "List members of a Discord guild in ascending user ID order. Requires the GUILD_MEMBERS privileged intent. Pass the last user id as after to fetch the next page.",
    inputSchema: guildSchema("Input parameters for listing guild members.", {
      limit: memberListLimitSchema,
      after: s.string("Return members with a user id greater than this id."),
    }),
    outputSchema: s.requiredObject("The guild members response.", {
      members: s.array("The guild members returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_guild_members",
    operationType: "read",
    description: "Search members of a Discord guild whose username or nickname starts with a query string.",
    inputSchema: guildSchema(
      "Input parameters for searching guild members.",
      {
        query: s.string("The prefix to match against usernames and nicknames.", { minLength: 1 }),
        limit: memberListLimitSchema,
      },
      ["query"],
    ),
    outputSchema: s.requiredObject("The matching guild members response.", {
      members: s.array("The guild members returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "add_guild_member",
    operationType: "write",
    description:
      "Add a user to a Discord guild using an OAuth2 access token that user granted to this bot's application with the guilds.join scope.",
    inputSchema: guildSchema(
      "Input parameters for adding a guild member.",
      {
        user_id: snowflakeSchema,
        access_token: s.string("The user's OAuth2 access token with the guilds.join scope.", { minLength: 1 }),
        nick: s.string("The nickname to give the member. Requires MANAGE_NICKNAMES."),
        roles: snowflakeArraySchema("The role ids to assign. Requires MANAGE_ROLES."),
        mute: s.boolean("Whether the member is muted in voice channels. Requires MUTE_MEMBERS."),
        deaf: s.boolean("Whether the member is deafened in voice channels. Requires DEAFEN_MEMBERS."),
      },
      ["user_id", "access_token"],
    ),
    outputSchema: s.requiredObject("The add guild member response.", {
      already_member: s.boolean("Whether the user was already a member of the guild."),
      member: s.nullable(rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "modify_guild_member",
    operationType: "write",
    description:
      "Update a Discord guild member's nickname, roles, voice state, or timeout. Each field requires its own permission.",
    inputSchema: guildSchema(
      "Input parameters for updating a guild member. Only the provided fields are changed.",
      {
        user_id: snowflakeSchema,
        nick: s.nullableString("The member nickname, or null to reset it. Requires MANAGE_NICKNAMES."),
        roles: s.nullable(snowflakeArraySchema("The complete list of role ids for the member. Requires MANAGE_ROLES.")),
        mute: s.nullableBoolean("Whether the member is muted in voice channels. Requires MUTE_MEMBERS."),
        deaf: s.nullableBoolean("Whether the member is deafened in voice channels. Requires DEAFEN_MEMBERS."),
        channel_id: s.nullableString(
          "The voice channel id to move the member to, or null to disconnect them from voice. Requires MOVE_MEMBERS.",
        ),
        communication_disabled_until: s.nullable(
          s.dateTime("When the member's timeout ends, up to 28 days in the future. Requires MODERATE_MEMBERS."),
        ),
        flags: s.nullableInteger("The guild member flags bitfield."),
        audit_log_reason: auditLogReasonSchema,
      },
      ["user_id"],
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "modify_current_member",
    operationType: "write",
    description: "Update the bot's own member profile in a Discord guild.",
    inputSchema: guildSchema("Input parameters for updating the bot's guild member profile.", {
      nick: s.nullableString("The bot's nickname in the guild, or null to reset it. Requires CHANGE_NICKNAME."),
      avatar: imageDataSchema("The bot's guild-specific avatar."),
      banner: imageDataSchema("The bot's guild-specific banner."),
      bio: s.nullableString("The bot's guild-specific bio."),
      audit_log_reason: auditLogReasonSchema,
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "add_guild_member_role",
    operationType: "write",
    description: "Add a role to a Discord guild member. Requires the MANAGE_ROLES permission.",
    inputSchema: memberRoleSchema("Input parameters for adding a role to a guild member."),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "remove_guild_member_role",
    operationType: "write",
    description: "Remove a role from a Discord guild member. Requires the MANAGE_ROLES permission.",
    inputSchema: memberRoleSchema("Input parameters for removing a role from a guild member."),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "remove_guild_member",
    operationType: "destructive",
    description: "Kick a member from a Discord guild. Requires the KICK_MEMBERS permission.",
    inputSchema: guildSchema(
      "Input parameters for removing a guild member.",
      { user_id: snowflakeSchema, audit_log_reason: auditLogReasonSchema },
      ["user_id"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "list_guild_bans",
    operationType: "read",
    description:
      "List bans in a Discord guild in ascending user ID order. Requires the BAN_MEMBERS permission. If both before and after are set, Discord only uses before.",
    inputSchema: guildSchema("Input parameters for listing guild bans.", {
      limit: s.integer("The maximum number of bans to return. Discord defaults to 1000.", {
        minimum: 1,
        maximum: 1000,
      }),
      before: s.string("Return bans for user ids lower than this id."),
      after: s.string("Return bans for user ids greater than this id."),
    }),
    outputSchema: s.requiredObject("The guild bans response.", {
      bans: s.array("The ban objects returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_guild_ban",
    operationType: "read",
    description: "Get the ban for a user in a Discord guild. Requires the BAN_MEMBERS permission.",
    inputSchema: guildSchema("Input parameters containing a guild id and user id.", { user_id: snowflakeSchema }, [
      "user_id",
    ]),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_guild_ban",
    operationType: "destructive",
    description:
      "Ban a user from a Discord guild and optionally delete their recent messages. Requires the BAN_MEMBERS permission.",
    inputSchema: guildSchema(
      "Input parameters for banning a user.",
      {
        user_id: snowflakeSchema,
        delete_message_seconds: deleteMessageSecondsSchema,
        audit_log_reason: auditLogReasonSchema,
      },
      ["user_id"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "remove_guild_ban",
    operationType: "write",
    description: "Lift a user's ban from a Discord guild. Requires the BAN_MEMBERS permission.",
    inputSchema: guildSchema(
      "Input parameters for removing a ban.",
      { user_id: snowflakeSchema, audit_log_reason: auditLogReasonSchema },
      ["user_id"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "bulk_guild_ban",
    operationType: "destructive",
    description:
      "Ban up to 200 users from a Discord guild at once. Requires the BAN_MEMBERS and MANAGE_GUILD permissions.",
    inputSchema: guildSchema(
      "Input parameters for banning several users.",
      {
        user_ids: snowflakeArraySchema("The user ids to ban.", { maxItems: 200 }),
        delete_message_seconds: deleteMessageSecondsSchema,
        audit_log_reason: auditLogReasonSchema,
      },
      ["user_ids"],
    ),
    outputSchema: s.requiredObject("The bulk ban result.", {
      banned_users: s.stringArray("The user ids that were banned."),
      failed_users: s.stringArray("The user ids that could not be banned or were already banned."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_guild_roles",
    operationType: "read",
    description: "List roles in a Discord guild.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The guild roles response.", {
      roles: s.array("The roles returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_guild_role",
    operationType: "read",
    description: "Get a role in a Discord guild by ID.",
    inputSchema: guildSchema("Input parameters containing a guild id and role id.", { role_id: snowflakeSchema }, [
      "role_id",
    ]),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_role_member_counts",
    operationType: "read",
    description: "Get the number of members holding each role in a Discord guild, excluding @everyone.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The role member counts response.", {
      member_counts: s.record("Member counts keyed by role id.", s.integer("The number of members with the role.")),
    }),
  }),
  defineProviderAction(service, {
    name: "create_guild_role",
    operationType: "write",
    description: "Create a role in a Discord guild. Requires the MANAGE_ROLES permission.",
    inputSchema: guildSchema(
      "Input parameters for creating a role. Omitted fields use Discord defaults.",
      roleFieldSchemas,
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "modify_guild_role_positions",
    operationType: "write",
    description: "Reorder roles in a Discord guild. Requires the MANAGE_ROLES permission.",
    inputSchema: guildSchema(
      "Input parameters for changing role positions.",
      {
        positions: s.array(
          "The roles to move.",
          s.object(
            "A role position change.",
            { id: snowflakeSchema, position: s.nullableInteger("The new sorting position.") },
            { required: ["id"] },
          ),
          { minItems: 1 },
        ),
        audit_log_reason: auditLogReasonSchema,
      },
      ["positions"],
    ),
    outputSchema: s.requiredObject("The guild roles after reordering.", {
      roles: s.array("All roles in the guild.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "modify_guild_role",
    operationType: "write",
    description: "Update a role in a Discord guild. Requires the MANAGE_ROLES permission.",
    inputSchema: guildSchema(
      "Input parameters for updating a role. Only the provided fields are changed.",
      { role_id: snowflakeSchema, ...roleFieldSchemas },
      ["role_id"],
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "delete_guild_role",
    operationType: "destructive",
    description: "Delete a role from a Discord guild. Requires the MANAGE_ROLES permission.",
    inputSchema: guildSchema(
      "Input parameters for deleting a role.",
      { role_id: snowflakeSchema, audit_log_reason: auditLogReasonSchema },
      ["role_id"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_prune_count",
    operationType: "read",
    description:
      "Count how many inactive members a prune would remove from a Discord guild. Requires the MANAGE_GUILD and KICK_MEMBERS permissions.",
    inputSchema: guildSchema("Input parameters for counting prunable members.", {
      days: pruneDaysSchema,
      include_roles: snowflakeArraySchema(
        "Role ids whose holders may also be pruned. By default members with any role are skipped.",
      ),
    }),
    outputSchema: s.requiredObject("The prune count response.", {
      pruned: s.integer("The number of members that would be removed."),
    }),
  }),
  defineProviderAction(service, {
    name: "begin_guild_prune",
    operationType: "destructive",
    description:
      "Remove inactive members from a Discord guild. Requires the MANAGE_GUILD and KICK_MEMBERS permissions. Set compute_prune_count to false for large guilds.",
    inputSchema: guildSchema("Input parameters for pruning members.", {
      days: pruneDaysSchema,
      compute_prune_count: s.boolean("Whether Discord returns the number of pruned members. Discord defaults to true."),
      include_roles: snowflakeArraySchema(
        "Role ids whose holders may also be pruned. By default members with any role are skipped.",
      ),
      audit_log_reason: auditLogReasonSchema,
    }),
    outputSchema: s.requiredObject("The prune response.", {
      pruned: s.nullableInteger("The number of members removed, or null when compute_prune_count is false."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_guild_voice_regions",
    operationType: "read",
    description: "List voice regions available to a Discord guild, including VIP regions when the guild has them.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The voice regions response.", {
      regions: s.array("The voice region objects returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_guild_invites",
    operationType: "read",
    description: "List invites for a Discord guild. Requires the MANAGE_GUILD or VIEW_AUDIT_LOG permission.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The guild invites response.", {
      invites: s.array("The invite objects returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_guild_integrations",
    operationType: "read",
    description: "List integrations attached to a Discord guild, up to 50. Requires the MANAGE_GUILD permission.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The guild integrations response.", {
      integrations: s.array("The integration objects returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_guild_integration",
    operationType: "destructive",
    description:
      "Delete an integration from a Discord guild, removing its webhooks and kicking its bot. Requires the MANAGE_GUILD permission.",
    inputSchema: guildSchema(
      "Input parameters for deleting a guild integration.",
      { integration_id: snowflakeSchema, audit_log_reason: auditLogReasonSchema },
      ["integration_id"],
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_widget_settings",
    operationType: "read",
    description: "Get the widget settings of a Discord guild. Requires the MANAGE_GUILD permission.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "modify_guild_widget",
    operationType: "write",
    description: "Update the widget settings of a Discord guild. Requires the MANAGE_GUILD permission.",
    inputSchema: guildSchema("Input parameters for updating guild widget settings.", {
      enabled: s.boolean("Whether the widget is enabled."),
      channel_id: s.nullableString("The channel the widget invite points to, or null for none."),
      audit_log_reason: auditLogReasonSchema,
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_widget",
    operationType: "read",
    description: "Get the public widget JSON of a Discord guild, including online members and voice channels.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_vanity_url",
    operationType: "read",
    description:
      "Get the vanity invite code and its use count for a Discord guild. Requires the MANAGE_GUILD permission.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The vanity URL response.", {
      code: s.nullableString("The vanity invite code, or null when none is set."),
      uses: s.integer("The number of times the vanity invite was used."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_guild_widget_png",
    operationType: "read",
    description: "Get a Discord guild widget PNG.",
    inputSchema: guildSchema("Input for retrieving a Discord guild widget PNG.", {
      style: s.stringEnum(["shield", "banner1", "banner2", "banner3", "banner4"], {
        description: "The visual style to use for the guild widget PNG.",
      }),
    }),
    outputSchema: binaryFileSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_welcome_screen",
    operationType: "read",
    description:
      "Get the welcome screen of a Discord guild. Requires the MANAGE_GUILD permission when the welcome screen is disabled.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "modify_guild_welcome_screen",
    operationType: "write",
    description: "Update the welcome screen of a Discord guild. Requires the MANAGE_GUILD permission.",
    inputSchema: guildSchema(
      "Input parameters for updating the welcome screen. Only the provided fields are changed.",
      {
        enabled: s.nullableBoolean("Whether the welcome screen is enabled."),
        welcome_channels: s.nullable(
          s.array(
            "The channels shown on the welcome screen, each with channel_id, description, emoji_id, and emoji_name.",
            rawObjectSchema,
            { maxItems: 5 },
          ),
        ),
        description: s.nullableString("The server description shown on the welcome screen."),
        audit_log_reason: auditLogReasonSchema,
      },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_onboarding",
    operationType: "read",
    description: "Get the onboarding configuration of a Discord guild.",
    inputSchema: guildSchema("Input parameters containing a guild id."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "modify_guild_onboarding",
    operationType: "write",
    description:
      "Replace the onboarding configuration of a Discord guild. Requires the MANAGE_GUILD and MANAGE_ROLES permissions.",
    inputSchema: guildSchema("Input parameters for updating guild onboarding.", {
      prompts: s.array("The onboarding prompt objects.", rawObjectSchema),
      default_channel_ids: snowflakeArraySchema("The channel ids members are opted into automatically."),
      enabled: s.boolean("Whether onboarding is enabled."),
      mode: s.withEnum(
        s.integer("The onboarding mode: 0 counts only default channels, 1 also counts questions."),
        [0, 1],
      ),
      audit_log_reason: auditLogReasonSchema,
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "modify_guild_incident_actions",
    operationType: "write",
    description:
      "Pause invites or direct messages in a Discord guild for up to 24 hours. Requires the MANAGE_GUILD permission.",
    inputSchema: guildSchema("Input parameters for updating guild incident actions.", {
      invites_disabled_until: s.nullable(
        s.dateTime("When invites are enabled again, up to 24 hours in the future. Null re-enables them now."),
      ),
      dms_disabled_until: s.nullable(
        s.dateTime("When direct messages are enabled again, up to 24 hours in the future. Null re-enables them now."),
      ),
    }),
    outputSchema: rawObjectSchema,
  }),
];

function guildSchema(
  description: string,
  properties: Record<string, JsonSchema> = {},
  required: string[] = [],
): JsonSchema {
  return s.object(description, { guild_id: snowflakeSchema, ...properties }, { required: ["guild_id", ...required] });
}

function memberRoleSchema(description: string): JsonSchema {
  return guildSchema(
    description,
    { user_id: snowflakeSchema, role_id: snowflakeSchema, audit_log_reason: auditLogReasonSchema },
    ["user_id", "role_id"],
  );
}
