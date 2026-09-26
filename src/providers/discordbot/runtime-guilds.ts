import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { DiscordbotActionHandler, DiscordbotContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import {
  booleanString,
  looseArray,
  nullableBoolean,
  nullableInteger,
  nullableRawString,
  nullableString,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  optionalStringArray,
  recordOrEmpty,
  requiredString,
} from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { providerInputError } from "../provider-runtime.ts";
import { discordbotRequest, discordbotRequestJson, discordbotRequestNoContent, requiredPath } from "./runtime.ts";

export const guildActionHandlers: ProviderActionHandlerSubset<"discordbot", DiscordbotActionHandler> = {
  get_guild(input, context) {
    return discordbotRequestJson({
      path: guildPath(input),
      query: { with_counts: booleanString(input.with_counts) },
      context,
    });
  },
  get_guild_preview(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/preview`, context });
  },
  modify_guild(input, context) {
    return discordbotRequestJson({
      method: "PATCH",
      path: guildPath(input),
      body: jsonObject({
        name: optionalString(input.name),
        verification_level: nullableInteger(input.verification_level),
        default_message_notifications: nullableInteger(input.default_message_notifications),
        explicit_content_filter: nullableInteger(input.explicit_content_filter),
        afk_channel_id: nullableString(input.afk_channel_id),
        afk_timeout: optionalInteger(input.afk_timeout),
        icon: nullableString(input.icon),
        splash: nullableString(input.splash),
        discovery_splash: nullableString(input.discovery_splash),
        banner: nullableString(input.banner),
        system_channel_id: nullableString(input.system_channel_id),
        system_channel_flags: optionalInteger(input.system_channel_flags),
        rules_channel_id: nullableString(input.rules_channel_id),
        public_updates_channel_id: nullableString(input.public_updates_channel_id),
        safety_alerts_channel_id: nullableString(input.safety_alerts_channel_id),
        preferred_locale: nullableString(input.preferred_locale),
        features: optionalStringArray(input.features),
        description: nullableRawString(input.description),
        premium_progress_bar_enabled: optionalBoolean(input.premium_progress_bar_enabled),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  list_guild_channels(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/channels`, context }).then((channels) => ({ channels }));
  },
  create_guild_channel(input, context) {
    return discordbotRequestJson({
      method: "POST",
      path: `${guildPath(input)}/channels`,
      body: jsonObject({
        name: requiredString(input.name, "name", providerInputError),
        type: optionalInteger(input.type),
        topic: optionalRawString(input.topic),
        bitrate: optionalInteger(input.bitrate),
        user_limit: optionalInteger(input.user_limit),
        rate_limit_per_user: optionalInteger(input.rate_limit_per_user),
        position: optionalInteger(input.position),
        permission_overwrites: Array.isArray(input.permission_overwrites) ? input.permission_overwrites : undefined,
        parent_id: optionalString(input.parent_id),
        nsfw: optionalBoolean(input.nsfw),
        rtc_region: nullableString(input.rtc_region),
        video_quality_mode: optionalInteger(input.video_quality_mode),
        default_auto_archive_duration: optionalInteger(input.default_auto_archive_duration),
        default_reaction_emoji: optionalRecord(input.default_reaction_emoji),
        available_tags: Array.isArray(input.available_tags) ? input.available_tags : undefined,
        default_sort_order: optionalInteger(input.default_sort_order),
        default_forum_layout: optionalInteger(input.default_forum_layout),
        default_thread_rate_limit_per_user: optionalInteger(input.default_thread_rate_limit_per_user),
        flags: optionalInteger(input.flags),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    }).then((channel) => ({ channel }));
  },
  modify_guild_channel_positions(input, context) {
    return discordbotRequestNoContent({
      method: "PATCH",
      path: `${guildPath(input)}/channels`,
      body: requiredPositions(input.positions).map((position) =>
        jsonObject({
          id: requiredString(position.id, "positions[].id", providerInputError),
          position: nullableInteger(position.position),
          lock_permissions: nullableBoolean(position.lock_permissions),
          parent_id: nullableString(position.parent_id),
          flags: nullableInteger(position.flags),
        }),
      ),
      context,
    });
  },
  list_active_guild_threads(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/threads/active`, context }).then((value) => {
      const response = recordOrEmpty(value);
      return { threads: looseArray(response.threads), members: looseArray(response.members) };
    });
  },
  get_guild_member(input, context) {
    return discordbotRequestJson({ path: memberPath(input), context });
  },
  list_guild_members(input, context) {
    return discordbotRequestJson({
      path: `${guildPath(input)}/members`,
      query: { limit: optionalInteger(input.limit), after: optionalString(input.after) },
      context,
    }).then((members) => ({ members }));
  },
  search_guild_members(input, context) {
    return discordbotRequestJson({
      path: `${guildPath(input)}/members/search`,
      query: {
        query: requiredString(input.query, "query", providerInputError),
        limit: optionalInteger(input.limit),
      },
      context,
    }).then((members) => ({ members }));
  },
  add_guild_member(input, context) {
    return addGuildMember(input, context);
  },
  modify_guild_member(input, context) {
    return discordbotRequestJson({
      method: "PATCH",
      path: memberPath(input),
      body: jsonObject({
        nick: nullableRawString(input.nick),
        roles: input.roles === null ? null : optionalStringArray(input.roles),
        mute: nullableBoolean(input.mute),
        deaf: nullableBoolean(input.deaf),
        channel_id: nullableString(input.channel_id),
        communication_disabled_until: nullableString(input.communication_disabled_until),
        flags: nullableInteger(input.flags),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  modify_current_member(input, context) {
    return discordbotRequestJson({
      method: "PATCH",
      path: `${guildPath(input)}/members/@me`,
      body: jsonObject({
        nick: nullableRawString(input.nick),
        avatar: nullableString(input.avatar),
        banner: nullableString(input.banner),
        bio: nullableRawString(input.bio),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  add_guild_member_role(input, context) {
    return discordbotRequestNoContent({
      method: "PUT",
      path: `${memberPath(input)}/roles/${requiredPath(input.role_id, "role_id")}`,
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  remove_guild_member_role(input, context) {
    return discordbotRequestNoContent({
      method: "DELETE",
      path: `${memberPath(input)}/roles/${requiredPath(input.role_id, "role_id")}`,
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  remove_guild_member(input, context) {
    return discordbotRequestNoContent({
      method: "DELETE",
      path: memberPath(input),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  list_guild_bans(input, context) {
    return discordbotRequestJson({
      path: `${guildPath(input)}/bans`,
      query: {
        limit: optionalInteger(input.limit),
        before: optionalString(input.before),
        after: optionalString(input.after),
      },
      context,
    }).then((bans) => ({ bans }));
  },
  get_guild_ban(input, context) {
    return discordbotRequestJson({ path: banPath(input), context });
  },
  create_guild_ban(input, context) {
    return discordbotRequestNoContent({
      method: "PUT",
      path: banPath(input),
      body: jsonObject({ delete_message_seconds: optionalInteger(input.delete_message_seconds) }),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  remove_guild_ban(input, context) {
    return discordbotRequestNoContent({
      method: "DELETE",
      path: banPath(input),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  bulk_guild_ban(input, context) {
    const userIds = optionalStringArray(input.user_ids);
    if (!userIds || userIds.length === 0) {
      throw providerInputError("user_ids must be a non-empty array of user ids");
    }
    return discordbotRequestJson({
      method: "POST",
      path: `${guildPath(input)}/bulk-ban`,
      body: jsonObject({
        user_ids: userIds,
        delete_message_seconds: optionalInteger(input.delete_message_seconds),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    }).then((value) => {
      const response = recordOrEmpty(value);
      return { banned_users: looseArray(response.banned_users), failed_users: looseArray(response.failed_users) };
    });
  },
  list_guild_roles(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/roles`, context }).then((roles) => ({ roles }));
  },
  get_guild_role(input, context) {
    return discordbotRequestJson({ path: rolePath(input), context });
  },
  get_guild_role_member_counts(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/roles/member-counts`, context }).then((counts) => ({
      member_counts: recordOrEmpty(counts),
    }));
  },
  create_guild_role(input, context) {
    return discordbotRequestJson({
      method: "POST",
      path: `${guildPath(input)}/roles`,
      body: roleBody(input),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  modify_guild_role_positions(input, context) {
    return discordbotRequestJson({
      method: "PATCH",
      path: `${guildPath(input)}/roles`,
      body: requiredPositions(input.positions).map((position) =>
        jsonObject({
          id: requiredString(position.id, "positions[].id", providerInputError),
          position: nullableInteger(position.position),
        }),
      ),
      auditLogReason: input.audit_log_reason,
      context,
    }).then((roles) => ({ roles }));
  },
  modify_guild_role(input, context) {
    return discordbotRequestJson({
      method: "PATCH",
      path: rolePath(input),
      body: roleBody(input),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  delete_guild_role(input, context) {
    return discordbotRequestNoContent({
      method: "DELETE",
      path: rolePath(input),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  get_guild_prune_count(input, context) {
    return discordbotRequestJson({
      path: `${guildPath(input)}/prune`,
      query: {
        days: optionalInteger(input.days),
        include_roles: optionalStringArray(input.include_roles)?.join(","),
      },
      context,
    });
  },
  begin_guild_prune(input, context) {
    return discordbotRequestJson({
      method: "POST",
      path: `${guildPath(input)}/prune`,
      body: jsonObject({
        days: optionalInteger(input.days),
        compute_prune_count: optionalBoolean(input.compute_prune_count),
        include_roles: optionalStringArray(input.include_roles),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  list_guild_voice_regions(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/regions`, context }).then((regions) => ({ regions }));
  },
  list_guild_invites(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/invites`, context }).then((invites) => ({ invites }));
  },
  list_guild_integrations(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/integrations`, context }).then((integrations) => ({
      integrations,
    }));
  },
  delete_guild_integration(input, context) {
    return discordbotRequestNoContent({
      method: "DELETE",
      path: `${guildPath(input)}/integrations/${requiredPath(input.integration_id, "integration_id")}`,
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  get_guild_widget_settings(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/widget`, context });
  },
  modify_guild_widget(input, context) {
    return discordbotRequestJson({
      method: "PATCH",
      path: `${guildPath(input)}/widget`,
      body: jsonObject({
        enabled: optionalBoolean(input.enabled),
        channel_id: nullableString(input.channel_id),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  get_guild_widget(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/widget.json`, context });
  },
  get_guild_vanity_url(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/vanity-url`, context });
  },
  get_guild_widget_png(input, context) {
    return getGuildWidgetPng(input, context);
  },
  get_guild_welcome_screen(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/welcome-screen`, context });
  },
  modify_guild_welcome_screen(input, context) {
    return discordbotRequestJson({
      method: "PATCH",
      path: `${guildPath(input)}/welcome-screen`,
      body: jsonObject({
        enabled: nullableBoolean(input.enabled),
        welcome_channels:
          input.welcome_channels === null
            ? null
            : Array.isArray(input.welcome_channels)
              ? input.welcome_channels
              : undefined,
        description: nullableRawString(input.description),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  get_guild_onboarding(input, context) {
    return discordbotRequestJson({ path: `${guildPath(input)}/onboarding`, context });
  },
  modify_guild_onboarding(input, context) {
    return discordbotRequestJson({
      method: "PUT",
      path: `${guildPath(input)}/onboarding`,
      body: jsonObject({
        prompts: Array.isArray(input.prompts) ? input.prompts : undefined,
        default_channel_ids: optionalStringArray(input.default_channel_ids),
        enabled: optionalBoolean(input.enabled),
        mode: optionalInteger(input.mode),
      }),
      auditLogReason: input.audit_log_reason,
      context,
    });
  },
  modify_guild_incident_actions(input, context) {
    return discordbotRequestJson({
      method: "PUT",
      path: `${guildPath(input)}/incident-actions`,
      body: jsonObject({
        invites_disabled_until: nullableString(input.invites_disabled_until),
        dms_disabled_until: nullableString(input.dms_disabled_until),
      }),
      context,
    });
  },
};

async function addGuildMember(input: Record<string, unknown>, context: DiscordbotContext): Promise<unknown> {
  const response = await discordbotRequest({
    method: "PUT",
    path: memberPath(input),
    body: jsonObject({
      access_token: requiredString(input.access_token, "access_token", providerInputError),
      nick: optionalRawString(input.nick),
      roles: optionalStringArray(input.roles),
      mute: optionalBoolean(input.mute),
      deaf: optionalBoolean(input.deaf),
    }),
    context,
  });
  // Discord answers 204 with no body when the user is already in the guild.
  if (response.status === 204) {
    return { already_member: true, member: null };
  }
  return { already_member: false, member: await response.json() };
}

async function getGuildWidgetPng(input: Record<string, unknown>, context: DiscordbotContext): Promise<unknown> {
  const guildId = requiredString(input.guild_id, "guild_id", providerInputError);
  const response = await discordbotRequest({
    path: `${guildPath(input)}/widget.png`,
    query: { style: optionalString(input.style) },
    context,
    authenticated: false,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    filename: `discord-guild-${guildId}-widget-${optionalString(input.style) ?? "shield"}.png`,
    mimeType: response.headers.get("content-type") ?? "image/png",
    sizeBytes: buffer.byteLength,
    dataBase64: buffer.toString("base64"),
  };
}

function roleBody(input: Record<string, unknown>): Record<string, unknown> {
  return jsonObject({
    name: optionalRawString(input.name),
    permissions: optionalString(input.permissions),
    color: optionalInteger(input.color),
    colors: optionalRecord(input.colors),
    hoist: optionalBoolean(input.hoist),
    icon: nullableString(input.icon),
    unicode_emoji: nullableString(input.unicode_emoji),
    mentionable: optionalBoolean(input.mentionable),
  });
}

function requiredPositions(value: unknown): Record<string, unknown>[] {
  const positions = objectArray(value, "positions", providerInputError);
  if (positions.length === 0) {
    throw providerInputError("positions must not be empty");
  }
  return positions;
}

function guildPath(input: Record<string, unknown>): string {
  return `/guilds/${requiredPath(input.guild_id, "guild_id")}`;
}

function memberPath(input: Record<string, unknown>): string {
  return `${guildPath(input)}/members/${requiredPath(input.user_id, "user_id")}`;
}

function banPath(input: Record<string, unknown>): string {
  return `${guildPath(input)}/bans/${requiredPath(input.user_id, "user_id")}`;
}

function rolePath(input: Record<string, unknown>): string {
  return `${guildPath(input)}/roles/${requiredPath(input.role_id, "role_id")}`;
}
