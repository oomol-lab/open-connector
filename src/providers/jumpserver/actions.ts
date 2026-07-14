import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jumpserver";

export const jumpServerMcpToolNames = [
  "assets_assets_list",
  "assets_nodes_list",
  "accounts_accounts_list",
  "users_users_list",
  "perms_asset_permissions_list",
  "terminal_sessions_list",
] as const;

export type JumpServerActionName = (typeof jumpServerMcpToolNames)[number];

interface JumpServerActionMetadata {
  description: string;
  resource: string;
  followUpActions?: string[];
}

const actionMetadata: Record<JumpServerActionName, JumpServerActionMetadata> = {
  assets_assets_list: {
    description: "List assets visible to the configured JumpServer token, with optional pagination and search.",
    resource: "assets",
    followUpActions: ["jumpserver.assets_nodes_list", "jumpserver.accounts_accounts_list"],
  },
  assets_nodes_list: {
    description: "List asset nodes visible to the configured JumpServer token.",
    resource: "asset nodes",
    followUpActions: ["jumpserver.assets_assets_list"],
  },
  accounts_accounts_list: {
    description: "List managed accounts visible to the configured JumpServer token.",
    resource: "managed accounts",
    followUpActions: ["jumpserver.assets_assets_list"],
  },
  users_users_list: {
    description: "List JumpServer users visible to the configured token.",
    resource: "users",
    followUpActions: ["jumpserver.perms_asset_permissions_list"],
  },
  perms_asset_permissions_list: {
    description: "List asset permission rules visible to the configured JumpServer token.",
    resource: "asset permission rules",
    followUpActions: ["jumpserver.assets_assets_list", "jumpserver.users_users_list"],
  },
  terminal_sessions_list: {
    description: "List historical and active terminal sessions visible to the configured JumpServer token.",
    resource: "terminal sessions",
    followUpActions: ["jumpserver.assets_assets_list", "jumpserver.users_users_list"],
  },
};

const listInputSchema = s.object(
  "Common JumpServer list filters. Availability of matching records depends on the Bearer token permissions.",
  {
    limit: s.positiveInteger("Maximum number of records to return."),
    offset: s.nonNegativeInteger("Number of records to skip before returning results."),
    search: s.string("Search text applied to fields supported by this JumpServer resource."),
  },
  { optional: ["limit", "offset", "search"] },
);

function listOutputSchema(resource: string): JsonSchema {
  return s.object(
    `A paginated list of JumpServer ${resource}.`,
    {
      count: s.nonNegativeInteger("Total number of matching records."),
      next: s.nullableString("URL for the next page when one exists."),
      previous: s.nullableString("URL for the previous page when one exists."),
      results: s.array(`Matching JumpServer ${resource}.`, s.unknownObject(`One JumpServer ${resource} record.`)),
    },
    { required: ["count", "results"], optional: ["next", "previous"], additionalProperties: true },
  );
}

export const jumpServerActions: ActionDefinition[] = jumpServerMcpToolNames.map((name) =>
  defineProviderAction(service, {
    name,
    description: actionMetadata[name].description,
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema(actionMetadata[name].resource),
    followUpActions: actionMetadata[name].followUpActions,
  }),
);
