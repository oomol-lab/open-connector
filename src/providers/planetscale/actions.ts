import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "planetscale";

const organizationName = s.nonEmptyString("PlanetScale organization name slug.");
const databaseName = s.nonEmptyString("PlanetScale database name slug.");
const branchName = s.nonEmptyString("PlanetScale branch name.");

const organizationSchema = s.looseRequiredObject("A PlanetScale organization.", {
  id: s.nonEmptyString("Organization ID."),
  name: s.nonEmptyString("Organization name slug."),
});

const databaseSchema = s.looseRequiredObject("A PlanetScale database.", {
  id: s.nonEmptyString("Database ID."),
  name: s.nonEmptyString("Database name."),
  ready: s.boolean("Whether the database is ready for use."),
  default_branch: s.nonEmptyString("Default branch name."),
});

const branchSchema = s.looseRequiredObject("A PlanetScale database branch.", {
  id: s.nonEmptyString("Branch ID."),
  name: s.nonEmptyString("Branch name."),
  ready: s.boolean("Whether the branch is ready to serve queries."),
  production: s.boolean("Whether this is a production branch."),
});

const paginationFields = {
  current_page: s.integer("Current page number."),
  next_page: s.nullable(s.integer("Next page number, or null on the last page.")),
  total_count: s.integer("Total number of matching resources."),
  total_pages: s.integer("Total number of pages."),
};

const organizationPaginationFields = {
  type: s.nonEmptyString("Response type; PlanetScale returns list for paginated responses."),
  current_page: s.integer("Current page number."),
  per_page: s.integer("Maximum number of resources per page."),
  next_page: s.nullable(s.integer("Next page number, or null on the last page.")),
  next_page_url: s.nullable(s.string("Next page URL, or null on the last page.")),
  prev_page: s.nullable(s.integer("Previous page number, or null on the first page.")),
  prev_page_url: s.nullable(s.string("Previous page URL, or null on the first page.")),
};

const listInputFields = {
  page: s.positiveInteger("Page number to return."),
  perPage: s.integer("Number of resources per page.", { minimum: 1, maximum: 100 }),
};

const databaseTargetFields = {
  organization: organizationName,
  database: databaseName,
};

const branchTargetFields = {
  ...databaseTargetFields,
  branch: branchName,
};

export const planetScaleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List PlanetScale organizations available to the connected service token.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing PlanetScale organizations.", listInputFields, {
      optional: ["page", "perPage"],
    }),
    outputSchema: s.looseRequiredObject("A paginated list of PlanetScale organizations.", {
      ...organizationPaginationFields,
      data: s.array("Organizations on this page.", organizationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get one PlanetScale organization by name.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a PlanetScale organization.", {
      organization: organizationName,
    }),
    outputSchema: organizationSchema,
  }),
  defineProviderAction(service, {
    name: "list_databases",
    description: "List databases in a PlanetScale organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing PlanetScale databases.",
      {
        organization: organizationName,
        query: s.nonEmptyString("Search term used to filter databases by name."),
        ...listInputFields,
      },
      { optional: ["query", "page", "perPage"] },
    ),
    outputSchema: s.looseRequiredObject("A paginated list of PlanetScale databases.", {
      ...paginationFields,
      data: s.array("Databases on this page.", databaseSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_database",
    description: "Get one PlanetScale database by organization and database name.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a PlanetScale database.", databaseTargetFields),
    outputSchema: databaseSchema,
  }),
  defineProviderAction(service, {
    name: "create_database",
    description: "Create a MySQL or PostgreSQL database in a PlanetScale organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a PlanetScale database.",
      {
        organization: organizationName,
        name: databaseName,
        kind: s.stringEnum("Database engine kind.", ["mysql", "postgresql"]),
        region: s.nonEmptyString("Region slug; PlanetScale uses the organization default when omitted."),
        clusterSize: s.nonEmptyString("PlanetScale cluster size name, such as PS_10."),
        replicas: s.anyOf("Number of replicas; use 0 for non-HA or 2 or more for HA.", [
          s.literal(0, { description: "No replicas for a non-HA database." }),
          s.integer("Replica count for an HA database.", { minimum: 2 }),
        ]),
        majorVersion: s.nonEmptyString("PostgreSQL major version; ignored for MySQL databases."),
      },
      { optional: ["kind", "region", "replicas", "majorVersion"] },
    ),
    outputSchema: databaseSchema,
  }),
  defineProviderAction(service, {
    name: "delete_database",
    description: "Delete a PlanetScale database.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a PlanetScale database.", databaseTargetFields),
    outputSchema: s.object("Normalized PlanetScale database deletion result.", {
      deleted: s.boolean("Whether PlanetScale accepted the deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_branches",
    description: "List branches in a PlanetScale database.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing PlanetScale database branches.",
      {
        ...databaseTargetFields,
        query: s.nonEmptyString("Search term used to filter branches by name."),
        production: s.boolean("Filter branches by production status."),
        safeMigrations: s.boolean("Filter branches by safe-migrations status."),
        order: s.stringEnum("Branch creation-time order.", ["asc", "desc"]),
        ...listInputFields,
      },
      { optional: ["query", "production", "safeMigrations", "order", "page", "perPage"] },
    ),
    outputSchema: s.looseRequiredObject("A paginated list of PlanetScale branches.", {
      ...paginationFields,
      data: s.array("Branches on this page.", branchSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_branch",
    description: "Get one PlanetScale database branch.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a PlanetScale branch.", branchTargetFields),
    outputSchema: branchSchema,
  }),
  defineProviderAction(service, {
    name: "create_branch",
    description: "Create a branch in a PlanetScale database.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a PlanetScale branch.",
      {
        ...databaseTargetFields,
        name: branchName,
        parentBranch: s.nonEmptyString("Parent branch name; the database default is used when omitted."),
        region: s.nonEmptyString("Region slug; the database default is used when omitted."),
        deletionProtected: s.boolean("Whether deletion protection is enabled for the new branch."),
      },
      { optional: ["parentBranch", "region", "deletionProtected"] },
    ),
    outputSchema: branchSchema,
  }),
  defineProviderAction(service, {
    name: "delete_branch",
    description: "Delete a PlanetScale database branch, optionally including descendants.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for deleting a PlanetScale branch.",
      {
        ...branchTargetFields,
        deleteDescendants: s.boolean("Whether to recursively delete descendant branches."),
      },
      { optional: ["deleteDescendants"] },
    ),
    outputSchema: s.object("Normalized PlanetScale branch deletion result.", {
      deleted: s.boolean("Whether PlanetScale accepted the deletion."),
    }),
  }),
];
