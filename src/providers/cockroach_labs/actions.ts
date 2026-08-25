import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cockroach_labs";

const clusterIdSchema = s.nonEmptyString("CockroachDB Cloud cluster ID.");
const pageSchema = s.nonEmptyString("Opaque pagination page token returned by CockroachDB Cloud.");
const paginationLimitSchema = s.positiveInteger("Maximum number of records to return.");
const asOfTimeSchema = s.dateTime("Read data as of this RFC 3339 timestamp when supported.");
const sortOrderSchema = s.stringEnum(["ASC", "DESC"], {
  description: "Pagination sort order.",
});
const cloudProviderSchema = s.stringEnum(["GCP", "AWS", "AZURE"], {
  description: "Cloud provider to filter by.",
});

const paginationInputFields = {
  page: pageSchema,
  limit: paginationLimitSchema,
  asOfTime: asOfTimeSchema,
  sortOrder: sortOrderSchema,
};

const paginationOptionalFields = ["page", "limit", "asOfTime", "sortOrder"];

const paginationSchema = s.object(
  "CockroachDB Cloud keyset pagination metadata.",
  {
    nextPage: s.string("Token for the next page when returned by CockroachDB Cloud."),
    previousPage: s.string("Token for the previous page when returned by CockroachDB Cloud."),
  },
  { optional: ["nextPage", "previousPage"] },
);

const rawObjectSchema = s.looseObject("Raw CockroachDB Cloud object returned by the API.");

const organizationSchema = s.looseObject("CockroachDB Cloud organization information.", {
  id: s.string("CockroachDB Cloud organization ID."),
  label: s.string("CockroachDB Cloud organization label."),
  name: s.string("CockroachDB Cloud organization name."),
  created_at: s.string("Organization creation timestamp."),
});

const clusterSchema = s.looseObject("CockroachDB Cloud cluster record.", {
  id: s.string("CockroachDB Cloud cluster ID."),
  name: s.string("CockroachDB Cloud cluster name."),
  state: s.string("Cluster lifecycle state."),
  cloud_provider: s.string("Cluster cloud provider."),
  plan: s.string("Cluster plan."),
  regions: s.array("Cluster regions returned by CockroachDB Cloud.", rawObjectSchema),
});

const availableRegionSchema = s.looseObject("CockroachDB Cloud available region record.", {
  name: s.string("Cloud provider region name."),
  location: s.string("Human-readable region location."),
  provider: s.string("Cloud provider for this region."),
  serverless: s.boolean("Whether this region supports serverless clusters."),
  distance: s.number("Distance in miles based on the caller IP address."),
});

const nodeSchema = s.looseObject("CockroachDB Cloud cluster node record.", {
  name: s.string("Node name."),
  region_name: s.string("Region where the node runs."),
  status: s.string("Node status."),
});

const databaseSchema = s.looseObject("CockroachDB Cloud database record.", {
  name: s.string("Database name."),
  table_count: s.string("Table count returned by CockroachDB Cloud when present."),
});

const sqlUserSchema = s.looseObject("CockroachDB Cloud SQL user record.", {
  name: s.string("SQL username."),
});

export const cockroachLabsActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get information about the caller's CockroachDB Cloud organization.",
    inputSchema: s.object("Input payload for getting CockroachDB Cloud organization information.", {}),
    outputSchema: s.object("CockroachDB Cloud organization response.", {
      organization: organizationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_clusters",
    description: "List CockroachDB Cloud clusters in the organization.",
    inputSchema: s.object(
      "Input parameters for listing CockroachDB Cloud clusters.",
      {
        showInactive: s.boolean("Whether to include deleted or failed clusters when allowed."),
        sortBy: s.stringEnum(["NAME", "CREATED_AT", "DELETED_AT"], {
          description: "Field used to sort clusters.",
        }),
        ...paginationInputFields,
      },
      { optional: ["showInactive", "sortBy", ...paginationOptionalFields] },
    ),
    outputSchema: s.object("CockroachDB Cloud cluster list response.", {
      clusters: s.array("Clusters returned by CockroachDB Cloud.", clusterSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_cluster",
    description: "Get extended information about a CockroachDB Cloud cluster.",
    inputSchema: s.object(
      "Input parameters for getting a CockroachDB Cloud cluster.",
      {
        clusterId: clusterIdSchema,
      },
      { required: ["clusterId"] },
    ),
    outputSchema: s.object("CockroachDB Cloud cluster response.", {
      cluster: clusterSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_available_regions",
    description: "List cloud regions available for new CockroachDB Cloud clusters and nodes.",
    inputSchema: s.object(
      "Input parameters for listing CockroachDB Cloud available regions.",
      {
        provider: cloudProviderSchema,
        serverless: s.boolean("Whether to only show regions available for serverless clusters."),
        ...paginationInputFields,
      },
      { optional: ["provider", "serverless", ...paginationOptionalFields] },
    ),
    outputSchema: s.object("CockroachDB Cloud available region list response.", {
      regions: s.array("Regions returned by CockroachDB Cloud.", availableRegionSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_cluster_nodes",
    description: "List nodes for a CockroachDB Cloud cluster.",
    inputSchema: s.object(
      "Input parameters for listing CockroachDB Cloud cluster nodes.",
      {
        clusterId: clusterIdSchema,
        regionName: s.nonEmptyString("Optional region name used to filter cluster nodes."),
        ...paginationInputFields,
      },
      { optional: ["regionName", ...paginationOptionalFields] },
    ),
    outputSchema: s.object("CockroachDB Cloud cluster node list response.", {
      nodes: s.array("Nodes returned by CockroachDB Cloud.", nodeSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_databases",
    description: "List databases for a CockroachDB Cloud cluster.",
    inputSchema: s.object(
      "Input parameters for listing CockroachDB Cloud databases.",
      {
        clusterId: clusterIdSchema,
        ...paginationInputFields,
      },
      { optional: paginationOptionalFields },
    ),
    outputSchema: s.object("CockroachDB Cloud database list response.", {
      databases: s.array("Databases returned by CockroachDB Cloud.", databaseSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_sql_users",
    description: "List SQL users for a CockroachDB Cloud cluster.",
    inputSchema: s.object(
      "Input parameters for listing CockroachDB Cloud SQL users.",
      {
        clusterId: clusterIdSchema,
        ...paginationInputFields,
      },
      { optional: paginationOptionalFields },
    ),
    outputSchema: s.object("CockroachDB Cloud SQL user list response.", {
      users: s.array("SQL users returned by CockroachDB Cloud.", sqlUserSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
];
