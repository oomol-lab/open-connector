import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";

const service = "cloudflare";
const accountId = s.string("The account ID. Defaults to the connection account, or the only accessible account.");
const databaseId = s.nonEmptyString("The D1 database ID.");
const name = s.nonEmptyString("The D1 database name.");
const replicationMode = s.stringEnum("The D1 read replication mode.", ["auto", "disabled"]);
const record = s.looseObject("The Cloudflare resource, including additional upstream fields.");
const result = s.requiredObject("The action result.", { result: record });

export const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_d1_databases",
    description: "List D1 databases in an account.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["D1 Read"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        name,
        page: s.integer("The result page number.", { minimum: 1 }),
        perPage: s.integer("The number of results per page.", { minimum: 10, maximum: 10000 }),
      },
      { optional: ["accountId", "name", "page", "perPage"] },
    ),
    outputSchema: s.requiredObject("The action result.", {
      items: s.array("The returned resources.", record),
      resultInfo: s.looseObject("Upstream pagination metadata, including cursors."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_d1_database",
    description: "Read D1 database settings and metadata.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["D1 Read"],
    inputSchema: s.object("The action parameters.", { accountId, databaseId }, { optional: ["accountId"] }),
    outputSchema: result,
  }),
  defineProviderAction(service, {
    name: "create_d1_database",
    description: "Create a D1 database.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["D1 Write"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        name,
        jurisdiction: s.stringEnum("The required data jurisdiction.", ["eu", "fedramp", "us"]),
        primaryLocationHint: s.stringEnum("The preferred primary region when no jurisdiction is supplied.", [
          "wnam",
          "enam",
          "weur",
          "eeur",
          "apac",
          "oc",
        ]),
        replicationMode,
      },
      { optional: ["accountId", "jurisdiction", "primaryLocationHint", "replicationMode"] },
    ),
    outputSchema: result,
  }),
  defineProviderAction(service, {
    name: "update_d1_database",
    description: "Configure read replication for a D1 database.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["D1 Write"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, databaseId, replicationMode },
      { optional: ["accountId"] },
    ),
    outputSchema: result,
  }),
  defineProviderAction(service, {
    name: "delete_d1_database",
    description: "Delete a D1 database.",
    operationType: "destructive",
    requiredScopes: [],
    providerPermissions: ["D1 Write"],
    inputSchema: s.object("The action parameters.", { accountId, databaseId }, { optional: ["accountId"] }),
    outputSchema: result,
  }),
  defineProviderAction(service, {
    name: "query_d1_database",
    description: "Execute an ordered batch of one or more SQL statements on D1.",
    operationType: "destructive",
    requiredScopes: [],
    providerPermissions: ["D1 Read", "D1 Write"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        databaseId,
        batch: s.array(
          "SQL statements in execution order.",
          s.object(
            "A SQL statement and its positional parameters.",
            {
              sql: s.nonEmptyString("SQL to execute."),
              params: s.array("Positional parameters in binding order.", s.string("A bound parameter value.")),
            },
            { optional: ["params"] },
          ),
          { minItems: 1 },
        ),
      },
      { optional: ["accountId"] },
    ),
    outputSchema: s.requiredObject("The action result.", {
      results: s.array("D1 results for the submitted statements.", record),
    }),
  }),
];
