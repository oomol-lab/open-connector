import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "turso";

const resourceSchema = s.object(
  "A normalized Turso Platform API resource.",
  {
    slug: s.nonEmptyString("The resource slug when Turso returns one."),
    name: s.nonEmptyString("The resource name when Turso returns one."),
    type: s.nonEmptyString("The resource type when Turso returns one."),
    location: s.nonEmptyString("The location code when Turso returns one."),
    uuid: s.nonEmptyString("The UUID when Turso returns one."),
    group: s.nonEmptyString("The group name when Turso returns one."),
    hostname: s.nonEmptyString("The database hostname when Turso returns one."),
    code: s.nonEmptyString("The location code when Turso returns one."),
    raw: s.looseObject("The raw Turso resource object returned by the Platform API."),
  },
  { optional: ["slug", "name", "type", "location", "uuid", "group", "hostname", "code"] },
);
const organizationSlugSchema = s.nonEmptyString("The organization slug used in the Turso API path.");
const groupNameSchema = s.nonEmptyString("The Turso group name.");
const databaseNameSchema = s.nonEmptyString("The Turso database name.");

export const tursoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List organizations visible to the current Turso Platform API token.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for listing Turso organizations."),
    outputSchema: s.actionOutput(
      { organizations: s.array("The organizations visible to the current API token.", resourceSchema) },
      "The organizations returned by the Turso Platform API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Retrieve one Turso organization by slug.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { organizationSlug: organizationSlugSchema },
      ["organizationSlug"],
      "The input payload for retrieving one organization.",
    ),
    outputSchema: s.actionOutput(
      { organization: resourceSchema },
      "The organization returned by the Turso Platform API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List available Turso locations that can host groups.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for listing Turso locations."),
    outputSchema: s.actionOutput(
      { locations: s.array("The available Turso locations.", resourceSchema) },
      "The locations returned by the Turso Platform API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Turso groups for one organization.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { organizationSlug: organizationSlugSchema },
      ["organizationSlug"],
      "The input payload for listing Turso groups.",
    ),
    outputSchema: s.actionOutput(
      { groups: s.array("The Turso groups belonging to the organization.", resourceSchema) },
      "The Turso groups returned for one organization.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Retrieve one Turso group by name within an organization.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { organizationSlug: organizationSlugSchema, name: groupNameSchema },
      ["organizationSlug", "name"],
      "The input payload for retrieving one Turso group.",
    ),
    outputSchema: s.actionOutput({ group: resourceSchema }, "The Turso group returned by the Platform API."),
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create a Turso group in one organization with a primary location.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        organizationSlug: organizationSlugSchema,
        name: groupNameSchema,
        location: s.nonEmptyString("The primary Turso location code for the group."),
        extensions: s.anyOf("The extensions to enable for new databases in the group.", [
          s.stringEnum("Enable every supported extension.", ["all"]),
          s.stringArray("The explicit extension names to enable for new databases in the group.", {
            minItems: 1,
            itemDescription: "One Turso extension name.",
          }),
        ]),
      },
      ["organizationSlug", "name", "location"],
      "The input payload for creating a Turso group.",
    ),
    outputSchema: s.actionOutput({ group: resourceSchema }, "The newly created Turso group."),
  }),
  defineProviderAction(service, {
    name: "list_databases",
    description: "List Turso databases for one organization.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { organizationSlug: organizationSlugSchema },
      ["organizationSlug"],
      "The input payload for listing Turso databases.",
    ),
    outputSchema: s.actionOutput(
      { databases: s.array("The Turso databases belonging to the organization.", resourceSchema) },
      "The Turso databases returned for one organization.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_database",
    description: "Retrieve one Turso database by name within an organization.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { organizationSlug: organizationSlugSchema, name: databaseNameSchema },
      ["organizationSlug", "name"],
      "The input payload for retrieving one Turso database.",
    ),
    outputSchema: s.actionOutput({ database: resourceSchema }, "The Turso database returned by the Platform API."),
  }),
  defineProviderAction(service, {
    name: "create_database",
    description: "Create a Turso database in one organization and group.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        organizationSlug: organizationSlugSchema,
        name: databaseNameSchema,
        group: s.nonEmptyString("The Turso group where the database should be created."),
      },
      ["organizationSlug", "name", "group"],
      "The input payload for creating a Turso database.",
    ),
    outputSchema: s.actionOutput({ database: resourceSchema }, "The newly created Turso database."),
  }),
  defineProviderAction(service, {
    name: "delete_database",
    description: "Delete a Turso database from one organization.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { organizationSlug: organizationSlugSchema, name: databaseNameSchema },
      ["organizationSlug", "name"],
      "The input payload for deleting one Turso database.",
    ),
    outputSchema: s.actionOutput(
      { deleted: s.boolean("Whether the connector finished the delete request successfully.") },
      "The normalized delete result returned by the connector.",
    ),
  }),
];
