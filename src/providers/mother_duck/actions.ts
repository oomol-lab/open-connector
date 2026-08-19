import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mother_duck";

const usernameSchema = s.string("The MotherDuck username within the organization.", { minLength: 1, maxLength: 255 });
const tokenIdSchema = s.nonEmptyString("The MotherDuck access token identifier.");
const tokenTypeSchema = s.stringEnum("The MotherDuck token type.", ["read_write", "read_scaling"]);
const ducklingTypeSchema = s.stringEnum("The MotherDuck Duckling type.", ["read_write", "read_scaling"]);
const ducklingStatusSchema = s.nonEmptyString("The MotherDuck Duckling status, such as active or cooldown.");
const instanceSizeSchema = s.stringEnum("The MotherDuck instance size.", [
  "pulse",
  "standard",
  "jumbo",
  "mega",
  "giga",
]);

const tokenSchema = s.object(
  "A MotherDuck access token.",
  {
    id: s.string("The token UUID."),
    name: s.string("The token display name."),
    token: s.string("The newly-created token secret when MotherDuck returns it."),
    expire_at: s.string("The timestamp when the token expires."),
    created_ts: s.string("The timestamp when the token was created."),
    read_only: s.boolean("Whether the token is read-only."),
    token_type: tokenTypeSchema,
    raw: s.looseObject("The raw token object returned by MotherDuck."),
  },
  { optional: ["id", "name", "token", "expire_at", "created_ts", "read_only", "token_type"] },
);

const ducklingSchema = s.object("A MotherDuck Duckling attached to an active account.", {
  id: s.string("The Duckling identifier, such as rw or rs.N."),
  type: ducklingTypeSchema,
  status: ducklingStatusSchema,
});

const activeAccountSchema = s.object("A MotherDuck active account.", {
  username: usernameSchema,
  ducklings: s.array("The active Ducklings for the account.", ducklingSchema),
});

const readWriteConfigSchema = s.object(
  "MotherDuck read-write Duckling configuration.",
  {
    instance_size: instanceSizeSchema,
    cooldown_seconds: s.integer("Cooldown duration in seconds.", { minimum: 60, maximum: 86400 }),
  },
  { optional: ["cooldown_seconds"] },
);

const readScalingConfigSchema = s.object(
  "MotherDuck read-scaling Duckling configuration.",
  {
    instance_size: instanceSizeSchema,
    flock_size: s.number("The number of read-scaling Ducklings.", { minimum: 0, maximum: 64 }),
    cooldown_seconds: s.integer("Cooldown duration in seconds.", { minimum: 60, maximum: 86400 }),
  },
  { optional: ["cooldown_seconds"] },
);

const ducklingConfigSchema = s.object("MotherDuck Duckling configuration for a user.", {
  read_write: readWriteConfigSchema,
  read_scaling: readScalingConfigSchema,
});

export const motherDuckActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_active_accounts",
    description: "List active MotherDuck accounts and their active Ducklings in the organization.",
    inputSchema: s.actionInput({}, [], "No input is required to list active MotherDuck accounts."),
    outputSchema: s.actionOutput(
      {
        accounts: s.array("The active accounts in the organization.", activeAccountSchema),
      },
      "The active MotherDuck accounts returned by the Admin API.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_user",
    description: "Create a MotherDuck member user in the organization.",
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
      },
      ["username"],
      "Input for creating a MotherDuck user.",
    ),
    outputSchema: s.actionOutput(
      {
        username: usernameSchema,
      },
      "The created MotherDuck user.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_user",
    description: "Permanently delete a MotherDuck user and all of their data.",
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
      },
      ["username"],
      "Input for deleting a MotherDuck user.",
    ),
    outputSchema: s.actionOutput(
      {
        username: usernameSchema,
      },
      "The deleted MotherDuck user.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tokens",
    description: "List MotherDuck access tokens for a user.",
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
      },
      ["username"],
      "Input for listing MotherDuck user tokens.",
    ),
    outputSchema: s.actionOutput(
      {
        tokens: s.array("The user's MotherDuck access tokens.", tokenSchema),
      },
      "The MotherDuck access tokens for the user.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_token",
    description: "Create a MotherDuck access token for a user.",
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
        name: s.string("The token display name.", { minLength: 1, maxLength: 255 }),
        ttl: s.number("Token expiration in seconds.", { minimum: 300, maximum: 31536000 }),
        token_type: tokenTypeSchema,
      },
      ["username", "name"],
      "Input for creating a MotherDuck user token.",
    ),
    outputSchema: s.actionOutput(
      {
        token: tokenSchema,
      },
      "The newly-created MotherDuck token.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_token",
    description: "Invalidate a MotherDuck access token for a user.",
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
        token_id: tokenIdSchema,
      },
      ["username", "token_id"],
      "Input for deleting a MotherDuck user token.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether MotherDuck accepted the token deletion request."),
      },
      "The normalized MotherDuck token deletion result.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user_duckling_config",
    description: "Retrieve MotherDuck Duckling configuration for a user.",
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
      },
      ["username"],
      "Input for retrieving a MotherDuck user's Duckling configuration.",
    ),
    outputSchema: s.actionOutput(
      {
        config: ducklingConfigSchema,
      },
      "The MotherDuck Duckling configuration for the user.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_user_duckling_config",
    description: "Set MotherDuck Duckling configuration for a user.",
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
        config: ducklingConfigSchema,
      },
      ["username", "config"],
      "Input for setting a MotherDuck user's Duckling configuration.",
    ),
    outputSchema: s.actionOutput(
      {
        config: ducklingConfigSchema,
      },
      "The updated MotherDuck Duckling configuration for the user.",
    ),
  }),
];
