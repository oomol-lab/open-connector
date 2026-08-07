import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "discord";

const noInputSchema = s.object({}, { description: "No input parameters are required." });
const rawObjectSchema = s.looseObject({}, { description: "A raw Discord API object." });
const snowflakeSchema = s.string("A Discord snowflake identifier.", { minLength: 1 });
const userSchema = s.looseObject(
  {
    id: snowflakeSchema,
    username: s.string("The username of the user."),
    global_name: s.nullableString("The global display name of the user."),
    email: s.string("The email address of the user."),
  },
  { description: "A Discord user profile." },
);
const binaryFileSchema = s.requiredObject("A binary file payload encoded for transport.", {
  filename: s.string("The file name."),
  mimeType: s.string("The MIME type."),
  sizeBytes: s.integer("The file size in bytes."),
  dataBase64: s.string("The file contents encoded as base64."),
});
const inviteInputSchema = s.object(
  "Input parameters for resolving a Discord invite.",
  {
    invite_code: s.string("The invite code or invite URL to resolve.", { minLength: 1 }),
    code: s.string("The invite code to resolve.", { minLength: 1 }),
    with_counts: s.boolean("Whether to include approximate member and presence counts."),
    with_expiration: s.boolean("Whether to include expiration metadata in the invite response."),
    guild_scheduled_event_id: snowflakeSchema,
  },
  { optional: ["invite_code", "code", "with_counts", "with_expiration", "guild_scheduled_event_id"] },
);

export const discordActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user_application_entitlements",
    description: "Get entitlements for the current OAuth user under a Discord application.",
    requiredScopes: ["discord.entitlements.read"],
    inputSchema: s.object(
      {
        application_id: snowflakeSchema,
        before: snowflakeSchema,
        after: snowflakeSchema,
        limit: s.integer("The maximum number of entitlements to return.", { minimum: 1, maximum: 100 }),
        exclude_ended: s.boolean("Whether to exclude entitlements that have already ended."),
        exclude_deleted: s.boolean("Whether to exclude entitlements marked as deleted."),
      },
      {
        required: ["application_id"],
        optional: ["before", "after", "limit", "exclude_ended", "exclude_deleted"],
      },
    ),
    outputSchema: s.requiredObject("Current-user application entitlements.", {
      entitlements: s.array("The entitlements visible to the current OAuth user.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_my_application_role_connection",
    description: "Read the current OAuth user's role connection data for a Discord application.",
    requiredScopes: ["discord.role_connections.write"],
    inputSchema: applicationInputSchema("Input parameters for reading an application role connection."),
    outputSchema: s.requiredObject("The output payload for this action.", { role_connection: rawObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "update_my_application_role_connection",
    description: "Set the current OAuth user's role connection platform fields or metadata for a Discord application.",
    requiredScopes: ["discord.role_connections.write"],
    inputSchema: s.object(
      "Input parameters for updating an application role connection.",
      {
        application_id: snowflakeSchema,
        platform_name: s.string("A platform display name to show on the user's Discord profile.", { maxLength: 50 }),
        platform_username: s.string("A platform username to show on the user's Discord profile.", { maxLength: 100 }),
        metadata: s.record("Application role connection metadata values.", s.string("A stringified metadata value.")),
      },
      { required: ["application_id"], optional: ["platform_name", "platform_username", "metadata"] },
    ),
    outputSchema: s.requiredObject("The output payload for this action.", { role_connection: rawObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_my_application_role_connection",
    description: "Remove the current OAuth user's role connection data for a Discord application.",
    requiredScopes: ["discord.role_connections.write"],
    inputSchema: applicationInputSchema("Input parameters for deleting an application role connection."),
    outputSchema: s.requiredObject("The output payload for this action.", {
      success: s.boolean("Whether Discord accepted the delete request."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_gateway",
    description: "Get a Discord Gateway URL.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("Discord Gateway URL.", { url: s.string("The WebSocket Gateway URL.") }),
  }),
  defineProviderAction(service, {
    name: "get_guild_template",
    description: "Get a Discord guild template by code.",
    inputSchema: s.requiredObject("Input for retrieving a Discord guild template.", {
      code: s.string("The guild template code.", { minLength: 1 }),
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_widget",
    description: "Get a Discord guild widget as JSON.",
    inputSchema: guildInputSchema("Input for retrieving a Discord guild widget."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_widget_png",
    description: "Get a Discord guild widget PNG.",
    inputSchema: s.object(
      "Input for retrieving a Discord guild widget PNG.",
      {
        guild_id: snowflakeSchema,
        style: s.stringEnum(["shield", "banner1", "banner2", "banner3", "banner4"], {
          description: "The visual style to use for the guild widget PNG.",
        }),
      },
      { required: ["guild_id"], optional: ["style"] },
    ),
    outputSchema: binaryFileSchema,
  }),
  defineProviderAction(service, {
    name: "get_invite",
    description: "Get a Discord invite by code or URL.",
    inputSchema: inviteInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "resolve_invite",
    description: "Resolve a Discord invite code.",
    inputSchema: inviteInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_my_guild_member",
    description: "Get the current OAuth user's member record in a guild.",
    requiredScopes: ["discord.guild_members.read"],
    inputSchema: guildInputSchema("Input for retrieving the current user's member record."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_my_oauth2_authorization",
    description: "Get the current OAuth2 authorization information.",
    inputSchema: noInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_my_user",
    description: "Get the current OAuth user's Discord profile.",
    requiredScopes: ["discord.user.read"],
    inputSchema: noInputSchema,
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "get_openid_connect_userinfo",
    description: "Get the OpenID Connect userinfo payload for the current OAuth user.",
    requiredScopes: ["discord.openid"],
    inputSchema: noInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_public_keys",
    description: "Get Discord OAuth2 public keys.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("Discord OAuth2 public JWK set.", {
      keys: s.array("The public keys returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get the current OAuth user. Discord OAuth tokens can only read @me through this provider.",
    requiredScopes: ["discord.user.read"],
    inputSchema: s.requiredObject("Input for retrieving a Discord user.", { user_id: s.literal("@me") }),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "list_my_connections",
    description: "List the current OAuth user's connected external accounts.",
    requiredScopes: ["discord.connections.read"],
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("Discord user connections.", {
      connections: s.array("The current user's connected external accounts.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_my_guilds",
    description: "List the current OAuth user's guilds.",
    requiredScopes: ["discord.guilds.read"],
    inputSchema: s.object(
      "Input for listing the current user's guilds.",
      {
        before: snowflakeSchema,
        after: snowflakeSchema,
        limit: s.integer("The maximum number of guilds to return.", { minimum: 1, maximum: 200 }),
        with_counts: s.boolean("Whether to include approximate member and presence counts."),
      },
      { optional: ["before", "after", "limit", "with_counts"] },
    ),
    outputSchema: s.requiredObject("Discord guild list.", {
      guilds: s.array("Guilds returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_sticker_packs",
    description: "List public Nitro sticker packs.",
    inputSchema: noInputSchema,
    outputSchema: rawObjectSchema,
  }),
];

function applicationInputSchema(description: string) {
  return s.requiredObject(description, {
    application_id: snowflakeSchema,
  });
}

function guildInputSchema(description: string) {
  return s.requiredObject(description, {
    guild_id: snowflakeSchema,
  });
}
