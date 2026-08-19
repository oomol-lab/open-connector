import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rollbar";
const rollbarReadScope = "rollbar.project.read";

const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });
const pageSchema = positiveInteger("The 1-based page number to request from Rollbar.");
const limitSchema = s.integer("The number of records to request from Rollbar.", { minimum: 1, maximum: 5000 });
const rawObjectSchema = s.looseObject("The raw JSON object returned by Rollbar.");
const itemLevelSchema = s.stringEnum("One Rollbar item level.", ["debug", "info", "warning", "error", "critical"]);
const itemStatusSchema = s.stringEnum("One Rollbar item status.", ["active", "resolved", "muted", "archived"]);

const itemSummarySchema = s.object("A normalized Rollbar item summary.", {
  id: positiveInteger("The Rollbar item ID."),
  counter: positiveInteger("The Rollbar item counter."),
  projectId: positiveInteger("The Rollbar project ID."),
  title: s.string("The Rollbar item title."),
  environment: s.string("The Rollbar environment name."),
  platform: s.nullableString("The platform returned by Rollbar."),
  framework: s.nullableString("The framework returned by Rollbar."),
  level: s.nullableString("The Rollbar item level."),
  status: s.nullableString("The Rollbar item status."),
  totalOccurrences: positiveInteger("The total occurrence count on the item."),
  uniqueOccurrences: s.nullableInteger("The unique occurrence count."),
  assignedUserId: s.nullableInteger("The assigned user ID."),
  assignedTeamId: s.nullableInteger("The assigned team ID."),
  groupItemId: s.nullableInteger("The group item ID."),
  lastOccurrenceId: positiveInteger("The most recent occurrence ID for the item."),
  lastOccurrenceTimestamp: positiveInteger("The timestamp of the last occurrence."),
  firstOccurrenceTimestamp: positiveInteger("The timestamp of the first occurrence."),
  raw: rawObjectSchema,
});
const occurrenceSchema = s.object("A normalized Rollbar occurrence.", {
  id: positiveInteger("The Rollbar occurrence ID."),
  projectId: positiveInteger("The Rollbar project ID."),
  itemId: positiveInteger("The Rollbar item ID."),
  timestamp: positiveInteger("The occurrence timestamp in milliseconds."),
  version: positiveInteger("The occurrence payload version."),
  billable: s.nullableInteger("Whether the occurrence is billable."),
  data: rawObjectSchema,
  raw: rawObjectSchema,
});
const environmentSchema = s.object("A Rollbar environment summary.", {
  id: positiveInteger("The Rollbar environment ID."),
  projectId: positiveInteger("The Rollbar project ID."),
  environment: s.string("The Rollbar environment name."),
  visible: s.boolean("Whether the environment is visible in Rollbar."),
  raw: rawObjectSchema,
});
const deploySchema = s.object("A normalized Rollbar deploy.", {
  id: positiveInteger("The Rollbar deploy ID."),
  projectId: positiveInteger("The Rollbar project ID."),
  environment: s.string("The environment to which the revision was deployed."),
  revision: s.string("The deployed revision string returned by Rollbar."),
  localUsername: s.nullableString("The local username returned by Rollbar."),
  comment: s.nullableString("The deploy comment returned by Rollbar."),
  status: s.nullableString("The deploy status returned by Rollbar."),
  userId: s.nullableInteger("The Rollbar user ID."),
  startTime: s.nullableInteger("The deploy start timestamp."),
  finishTime: s.nullableInteger("The deploy finish timestamp."),
  raw: rawObjectSchema,
});
const projectSchema = s.object("A normalized Rollbar project.", {
  id: positiveInteger("The Rollbar project ID."),
  accountId: positiveInteger("The Rollbar account ID."),
  status: s.string("The Rollbar project status."),
  name: s.string("The Rollbar project name."),
  dateCreated: positiveInteger("The project creation timestamp."),
  dateModified: positiveInteger("The project last-modified timestamp."),
  settings: s.looseObject("Selected Rollbar project settings."),
  raw: rawObjectSchema,
});

export const rollbarActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Rollbar project by project ID.",
    requiredScopes: [rollbarReadScope],
    providerPermissions: ["read"],
    inputSchema: s.object("The input payload for getting a Rollbar project.", {
      projectId: positiveInteger("The Rollbar project ID."),
    }),
    outputSchema: s.object("The response returned by the Rollbar get_project action.", { project: projectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_items",
    description: "List Rollbar items in the connected project with optional filters.",
    requiredScopes: [rollbarReadScope],
    providerPermissions: ["read"],
    inputSchema: s.object(
      "The input payload for listing Rollbar items.",
      {
        assignedUser: s.nonEmptyString("Filter by assigned Rollbar username, or use assigned or unassigned."),
        assignedTeam: s.stringArray("Filter by one or more assigned Rollbar team names.", { minItems: 1 }),
        environment: s.stringArray("Filter by one or more Rollbar environments.", { minItems: 1 }),
        framework: s.stringArray("Filter by one or more Rollbar frameworks.", { minItems: 1 }),
        itemIds: s.array("Filter by one or more Rollbar item IDs.", positiveInteger("One item ID."), {
          minItems: 1,
        }),
        level: s.array("Filter by one or more Rollbar item levels.", itemLevelSchema, { minItems: 1 }),
        page: pageSchema,
        query: s.nonEmptyString("Search query in the same format as the Rollbar Items page."),
        status: s.array("Filter by one or more Rollbar item statuses.", itemStatusSchema, { minItems: 1 }),
        isSnoozed: s.boolean("Whether to include only snoozed items or to exclude them."),
      },
      {
        optional: [
          "assignedUser",
          "assignedTeam",
          "environment",
          "framework",
          "itemIds",
          "level",
          "page",
          "query",
          "status",
          "isSnoozed",
        ],
      },
    ),
    outputSchema: s.object("The response returned by the Rollbar list_items action.", {
      page: pageSchema,
      totalCount: s.nullableInteger("The total number of matching items when Rollbar returns it."),
      items: s.array("The Rollbar items returned by the request.", itemSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get one Rollbar item by item ID.",
    requiredScopes: [rollbarReadScope],
    providerPermissions: ["read"],
    inputSchema: s.object("The input payload for getting a Rollbar item.", {
      itemId: positiveInteger("The Rollbar item ID."),
    }),
    outputSchema: s.object("The response returned by the Rollbar get_item action.", { item: itemSummarySchema }),
  }),
  defineProviderAction(service, {
    name: "list_item_occurrences",
    description: "List occurrences for one Rollbar item.",
    requiredScopes: [rollbarReadScope],
    providerPermissions: ["read"],
    inputSchema: s.object(
      "The input payload for listing Rollbar occurrences for an item.",
      {
        itemId: positiveInteger("The Rollbar item ID."),
        lastId: positiveInteger("The last occurrence ID from the previous page."),
        page: pageSchema,
        limit: limitSchema,
      },
      { optional: ["lastId", "page", "limit"] },
    ),
    outputSchema: s.object("The response returned by the Rollbar list_item_occurrences action.", {
      page: pageSchema,
      occurrences: s.array("The occurrences returned by Rollbar.", occurrenceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_occurrence",
    description: "Get one Rollbar occurrence by occurrence ID.",
    requiredScopes: [rollbarReadScope],
    providerPermissions: ["read"],
    inputSchema: s.object("The input payload for getting a Rollbar occurrence.", {
      occurrenceId: positiveInteger("The Rollbar occurrence ID."),
    }),
    outputSchema: s.object("The response returned by the Rollbar get_occurrence action.", {
      occurrence: occurrenceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_environments",
    description: "List environments in the connected Rollbar project.",
    requiredScopes: [rollbarReadScope],
    providerPermissions: ["read"],
    inputSchema: s.object(
      "The input payload for listing Rollbar environments.",
      { page: pageSchema, limit: limitSchema },
      {
        optional: ["page", "limit"],
      },
    ),
    outputSchema: s.object("The response returned by the Rollbar list_environments action.", {
      page: pageSchema,
      environments: s.array("The environments returned by Rollbar.", environmentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_deploys",
    description: "List deploys in the connected Rollbar project.",
    requiredScopes: [rollbarReadScope],
    providerPermissions: ["read"],
    inputSchema: s.object(
      "The input payload for listing Rollbar deploys.",
      { page: pageSchema, limit: limitSchema },
      {
        optional: ["page", "limit"],
      },
    ),
    outputSchema: s.object("The response returned by the Rollbar list_deploys action.", {
      page: pageSchema,
      deploys: s.array("The deploys returned by Rollbar.", deploySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_deploy",
    description: "Get one Rollbar deploy by deploy ID.",
    requiredScopes: [rollbarReadScope],
    providerPermissions: ["read"],
    inputSchema: s.object("The input payload for getting a Rollbar deploy.", {
      deployId: positiveInteger("The Rollbar deploy ID."),
    }),
    outputSchema: s.object("The response returned by the Rollbar get_deploy action.", { deploy: deploySchema }),
  }),
];
