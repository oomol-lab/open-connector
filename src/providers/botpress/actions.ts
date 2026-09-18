import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "botpress";

const nextTokenSchema = s.nonEmptyString("The Botpress meta.nextToken value from the previous response.");
const tagsSchema = s.record("Botpress tags to filter by.", s.nonEmptyString("A Botpress tag value."));
const metaSchema = s.object(
  "Pagination metadata returned by Botpress.",
  {
    nextToken: s.string("The token to use to retrieve the next page of results."),
  },
  { optional: ["nextToken"] },
);

const workspaceSchema = s.looseObject("A Botpress workspace.", {
  id: s.string("The Botpress workspace ID."),
  name: s.string("The workspace name."),
  ownerId: s.string("The workspace owner ID."),
  createdAt: s.string("The timestamp when the workspace was created."),
  updatedAt: s.string("The timestamp when the workspace was last updated."),
  botCount: s.integer("The number of bots in the workspace."),
  billingVersion: s.string("The Botpress billing version for the workspace."),
  plan: s.string("The Botpress plan for the workspace."),
  blocked: s.boolean("Whether the workspace is blocked."),
  spendingLimit: s.number("The configured workspace spending limit."),
  about: s.string("The workspace about text when returned."),
  profilePicture: s.string("The workspace profile picture URL when returned."),
  contactEmail: s.string("The workspace contact email when returned."),
  website: s.string("The workspace website URL when returned."),
  socialAccounts: s.array(
    "The workspace social accounts returned by Botpress.",
    s.looseObject("A Botpress workspace social account."),
  ),
  isPublic: s.boolean("Whether the workspace is public."),
  handle: s.string("The public workspace handle when returned."),
  activeTrialId: s.nullable(s.string("The active workspace trial ID.")),
});

const botSummarySchema = s.looseObject("A Botpress bot summary.", {
  id: s.string("The Botpress bot ID."),
  createdAt: s.string("The timestamp when the bot was created."),
  updatedAt: s.string("The timestamp when the bot was last updated."),
  name: s.string("The bot name."),
  deployedAt: s.string("The timestamp when the bot was last deployed."),
  tags: tagsSchema,
  type: s.string("The Botpress bot type."),
});

const botDetailsSchema = s.looseObject("A Botpress bot details object.", {
  id: s.string("The Botpress bot ID."),
  createdAt: s.string("The timestamp when the bot was created."),
  updatedAt: s.string("The timestamp when the bot was last updated."),
  name: s.string("The bot name."),
  description: s.string("The bot description when returned."),
  deployedAt: s.string("The timestamp when the bot was last deployed."),
  dev: s.boolean("Whether this is a development bot."),
  tags: tagsSchema,
  type: s.string("The Botpress bot type when returned."),
  status: s.string("The current bot status when returned."),
  integrations: s.record(
    "Bot integrations keyed by integration name or alias.",
    s.looseObject("A Botpress bot integration object."),
  ),
  plugins: s.record("Bot plugins keyed by plugin name or alias.", s.looseObject("A Botpress bot plugin object.")),
});

export const botpressActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    operationType: "read",
    description: "List Botpress workspaces accessible to the connected API token.",
    inputSchema: s.object(
      "Input for listing Botpress workspaces.",
      {
        nextToken: nextTokenSchema,
        handle: s.nonEmptyString("The Botpress workspace handle to filter by."),
      },
      { optional: ["nextToken", "handle"] },
    ),
    outputSchema: s.object("Botpress workspaces result.", {
      workspaces: s.array("The workspaces returned by Botpress.", workspaceSchema),
      meta: metaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_bots",
    operationType: "read",
    description: "List Botpress bots in the connected workspace.",
    inputSchema: s.object(
      "Input for listing Botpress bots in the connected workspace.",
      {
        dev: s.boolean("Whether to return development bots instead of production bots."),
        tags: tagsSchema,
        nextToken: nextTokenSchema,
        sortField: s.stringEnum("The Botpress field to sort by.", ["createdAt", "updatedAt"]),
        sortDirection: s.stringEnum("The Botpress sort direction.", ["asc", "desc"]),
      },
      { optional: ["dev", "tags", "nextToken", "sortField", "sortDirection"] },
    ),
    outputSchema: s.object("Botpress bots result.", {
      bots: s.array("The bots returned by Botpress.", botSummarySchema),
      meta: metaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_bot",
    operationType: "read",
    description: "Get details for one Botpress bot in the connected workspace.",
    inputSchema: s.object("Input identifying one Botpress bot.", {
      botId: s.nonEmptyString("The Botpress bot ID."),
    }),
    outputSchema: s.object("Botpress bot result.", {
      bot: botDetailsSchema,
    }),
  }),
];
