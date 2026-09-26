import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { noInputSchema, rawObjectSchema, snowflakeSchema, successSchema } from "./schemas.ts";

const service = "discordbot";

export const discordbotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "test_auth",
    operationType: "read",
    description: "Check whether the configured Discord bot token can call the current application endpoint.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The authentication test result.", {
      auth_ok: s.boolean("Whether authentication succeeded."),
      status_code: s.integer("The HTTP status code returned by the test request."),
      error_body: s.string("The error body returned by the test request."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_my_application",
    operationType: "read",
    description: "Get the Discord application associated with the configured bot token.",
    inputSchema: noInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_application",
    operationType: "read",
    description: "Get a Discord application by ID.",
    inputSchema: applicationInputSchema("Input parameters containing an application id."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_public_keys",
    operationType: "read",
    description: "Get Discord OAuth2 public keys.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The public key response payload.", {
      keys: s.array("The public keys returned by the API.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_gateway",
    operationType: "read",
    description: "Get the public Discord Gateway URL.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The gateway URL response.", {
      url: s.string("The public gateway URL."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_bot_gateway",
    operationType: "read",
    description: "Get the recommended Discord Gateway URL and sharding metadata for the bot.",
    inputSchema: noInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get a Discord user by ID.",
    inputSchema: s.requiredObject("Input parameters containing a user id.", { user_id: snowflakeSchema }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_channel",
    operationType: "read",
    description: "Get a Discord channel by ID.",
    inputSchema: s.requiredObject("Input parameters containing a channel id.", { channel_id: snowflakeSchema }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_messages",
    operationType: "read",
    description: "List messages from a Discord channel.",
    inputSchema: s.object(
      "Input parameters for listing channel messages.",
      {
        channel_id: snowflakeSchema,
        around: snowflakeSchema,
        before: snowflakeSchema,
        after: snowflakeSchema,
        limit: s.integer("The maximum number of messages to return.", { minimum: 1, maximum: 100 }),
      },
      { required: ["channel_id"], optional: ["around", "before", "after", "limit"] },
    ),
    outputSchema: s.requiredObject("The messages response.", {
      messages: s.array("The messages returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_message",
    operationType: "write",
    description: "Create a Discord message in a channel.",
    inputSchema: s.object(
      "Input parameters for creating a message.",
      {
        channel_id: snowflakeSchema,
        content: s.string("The message content.", { maxLength: 2000 }),
        embeds: s.array("The embeds to include.", rawObjectSchema, { maxItems: 10 }),
        components: s.array("The components to include.", rawObjectSchema, { maxItems: 5 }),
        allowed_mentions: rawObjectSchema,
        message_reference: rawObjectSchema,
        tts: s.boolean("Whether the message is a text-to-speech message."),
        flags: s.integer("The message flags."),
      },
      {
        required: ["channel_id"],
        optional: ["content", "embeds", "components", "allowed_mentions", "message_reference", "tts", "flags"],
      },
    ),
    outputSchema: s.requiredObject("The created message response.", { message: rawObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_message",
    operationType: "destructive",
    description: "Delete a Discord message from a channel.",
    inputSchema: s.requiredObject("Input parameters containing a channel id and message id.", {
      channel_id: snowflakeSchema,
      message_id: snowflakeSchema,
    }),
    outputSchema: successSchema,
  }),
];

function applicationInputSchema(description: string) {
  return s.requiredObject(description, { application_id: snowflakeSchema });
}
