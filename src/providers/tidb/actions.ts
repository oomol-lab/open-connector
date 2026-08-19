import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tidb";

const apiFamilySchema = s.stringEnum("The TiDB Cloud API family to query.", ["starter_essential", "dedicated"]);

const componentTypeSchema = s.stringEnum("The TiDB Dedicated component type to query.", [
  "TIKV",
  "TIDB",
  "TIFLASH",
  "PD",
]);

const pageSizeSchema = s.integer("The maximum number of records to return in one page.", {
  minimum: 1,
  maximum: 100,
});

const paginationOutputSchema = {
  nextPageToken: s.nullable(s.string("The token to retrieve the next page of results, if one is available.")),
  totalSize: s.nullable(s.integer("The total number of matching records, if returned by TiDB.")),
};

const labelsSchema = s.nullable(s.record("The labels returned by TiDB Cloud.", s.string("One label value.")));

const regionSchema = s.looseObject("The TiDB Cloud region payload returned by the API.", {
  name: s.string("The region resource name, if returned by TiDB Cloud."),
  regionId: s.string("The region identifier, if returned by TiDB Cloud."),
  displayName: s.string("The display name of the region, if returned by TiDB Cloud."),
  cloudProvider: s.string("The cloud provider where the region is located, if returned."),
});

const nodeSpecSchema = s.looseObject("The TiDB Cloud Dedicated node spec payload returned by the API.", {
  name: s.string("The node spec resource name, if returned by TiDB Cloud."),
  regionId: s.string("The region ID where the node spec is available."),
  componentType: s.string("The TiDB component type for this node spec."),
  nodeSpecKey: s.string("The node spec key, such as 8C32G."),
  displayName: s.string("The display name of the node spec, if returned."),
});

const clusterSchema = s.looseObject("The TiDB Cloud cluster payload returned by the API.", {
  name: s.string("The cluster resource name, if returned by TiDB Cloud."),
  clusterId: s.string("The TiDB Cloud cluster ID."),
  displayName: s.string("The user-defined display name of the cluster, if returned."),
  state: s.string("The current cluster state, if returned by TiDB Cloud."),
  version: s.string("The TiDB version of the cluster, if returned."),
  regionId: s.string("The region ID for a Dedicated cluster, if returned."),
  region: regionSchema,
  cloudProvider: s.string("The cloud provider where the cluster is located, if returned."),
  servicePlan: s.string("The service plan for a Starter or Essential instance, if returned."),
  labels: labelsSchema,
  createTime: s.string("The cluster creation timestamp, if returned by TiDB Cloud."),
  updateTime: s.string("The cluster update timestamp, if returned by TiDB Cloud."),
});

const apiKeySchema = s.object(
  "One TiDB Cloud API key visible to the connected credential.",
  {
    name: s.nullable(s.string("The API key resource name.")),
    accessKey: s.string("The public access key value."),
    displayName: s.nullable(s.string("The display name of the API key.")),
    role: s.nullable(s.string("The role assigned to the API key.")),
    secretKey: s.nullable(s.string("The masked secret key value returned by TiDB Cloud.")),
  },
  { optional: ["name", "displayName", "role", "secretKey"] },
);

const auditLogSchema = s.looseObject("One TiDB Cloud console audit log entry.", {
  id: s.string("The audit log ID, if returned by TiDB Cloud."),
  eventType: s.string("The audit event type, if returned by TiDB Cloud."),
  result: s.string("The operation result, if returned by TiDB Cloud."),
  operationEmail: s.string("The email address of the user who performed the operation."),
  startTime: s.string("The operation start timestamp, if returned by TiDB Cloud."),
  endTime: s.string("The operation end timestamp, if returned by TiDB Cloud."),
  projectId: s.string("The related project ID, if returned by TiDB Cloud."),
  clusterId: s.string("The related cluster ID, if returned by TiDB Cloud."),
});

const importTaskSchema = s.looseObject("One TiDB Cloud import task payload returned by the API.", {
  name: s.string("The import task resource name, if returned by TiDB Cloud."),
  importId: s.string("The import task ID, if returned by TiDB Cloud."),
  id: s.string("The deprecated import task ID field, if returned by TiDB Cloud."),
  clusterId: s.string("The target cluster ID for the import task."),
  state: s.string("The current import task state, if returned by TiDB Cloud."),
  completePercent: s.integer("The import task completion percentage, if returned."),
  createTime: s.string("The import task creation timestamp, if returned."),
  completeTime: s.nullable(s.string("The import task completion timestamp, if returned.")),
  message: s.string("The import task message, if returned by TiDB Cloud."),
});

const exportTaskSchema = s.looseObject("One TiDB Cloud export task payload returned by the API.", {
  name: s.string("The export task resource name, if returned by TiDB Cloud."),
  exportId: s.string("The export task ID, if returned by TiDB Cloud."),
  clusterId: s.string("The cluster ID for the export task."),
  displayName: s.string("The display name of the export task, if returned."),
  state: s.string("The current export task state, if returned by TiDB Cloud."),
  createTime: s.string("The export task creation timestamp, if returned."),
  updateTime: s.nullable(s.string("The export task update timestamp, if returned.")),
  completeTime: s.nullable(s.string("The export task completion timestamp, if returned.")),
});

const branchSchema = s.looseObject("One TiDB Cloud Starter or Essential branch payload.", {
  name: s.string("The branch resource name, if returned by TiDB Cloud."),
  branchId: s.string("The branch ID, if returned by TiDB Cloud."),
  displayName: s.string("The user-defined branch display name, if returned."),
  clusterId: s.string("The cluster ID to which the branch belongs."),
  parentId: s.string("The parent branch ID, if returned by TiDB Cloud."),
  state: s.string("The current branch state, if returned by TiDB Cloud."),
  createTime: s.string("The branch creation timestamp, if returned."),
  updateTime: s.string("The branch update timestamp, if returned."),
});

const listTasksInputSchema = s.object(
  "The input payload for listing TiDB Cloud import or export tasks.",
  {
    apiFamily: apiFamilySchema,
    clusterId: s.string("The TiDB Cloud cluster ID whose tasks should be listed."),
    pageSize: { ...pageSizeSchema, description: "The maximum number of tasks to return." },
    pageToken: s.string("The pagination token from a previous task list response."),
    orderBy: s.string("The official TiDB Cloud sorting expression, such as createTime desc."),
  },
  { optional: ["pageSize", "pageToken", "orderBy"] },
);

const listServerlessTasksInputSchema = s.object(
  "The input payload for listing TiDB Cloud Starter or Essential tasks.",
  {
    clusterId: s.string("The TiDB Cloud Starter or Essential cluster ID whose tasks to list."),
    pageSize: { ...pageSizeSchema, description: "The maximum number of tasks to return." },
    pageToken: s.string("The pagination token from a previous task list response."),
    orderBy: s.string("The official TiDB Cloud sorting expression, such as createTime desc."),
  },
  { optional: ["pageSize", "pageToken", "orderBy"] },
);

export const tidbActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_api_keys",
    description: "List TiDB Cloud API keys visible to the connected organization API key.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing TiDB Cloud API keys.",
      {
        projectId: s.integer("The project ID used to filter API keys."),
        pageSize: { ...pageSizeSchema, description: "The maximum number of API keys to return." },
        pageToken: s.string("The pagination token from a previous list_api_keys response."),
      },
      { optional: ["projectId", "pageSize", "pageToken"] },
    ),
    outputSchema: s.object("The output payload for listing TiDB Cloud API keys.", {
      apiKeys: s.array("The API keys returned by TiDB Cloud.", apiKeySchema),
      nextPageToken: paginationOutputSchema.nextPageToken,
    }),
  }),
  defineProviderAction(service, {
    name: "get_api_key",
    description: "Fetch one TiDB Cloud API key by access key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one TiDB Cloud API key.", {
      accessKey: s.string("The public access key value of the TiDB Cloud API key to fetch."),
    }),
    outputSchema: apiKeySchema,
  }),
  defineProviderAction(service, {
    name: "list_audit_logs",
    description: "List TiDB Cloud console audit logs for security and change tracking.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing TiDB Cloud console audit logs.",
      {
        pageSize: { ...pageSizeSchema, description: "The maximum number of audit logs to return." },
        pageToken: s.string("The pagination token from a previous list_audit_logs response."),
        startTime: s.dateTime("Return audit logs created on or after this timestamp."),
        endTime: s.dateTime("Return audit logs created before or at this timestamp."),
        auditEventTypes: s.string("The TiDB Cloud audit event type filter."),
        keyword: s.string("The search keyword used to filter audit logs."),
      },
      { optional: ["pageSize", "pageToken", "startTime", "endTime", "auditEventTypes", "keyword"] },
    ),
    outputSchema: s.object("The output payload for listing TiDB Cloud audit logs.", {
      auditLogs: s.array("The audit logs returned by TiDB Cloud.", auditLogSchema),
      nextPageToken: paginationOutputSchema.nextPageToken,
      totalSize: paginationOutputSchema.totalSize,
    }),
  }),
  defineProviderAction(service, {
    name: "list_clusters",
    description: "List TiDB Cloud Starter, Essential, or Dedicated clusters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing TiDB Cloud clusters.",
      {
        apiFamily: apiFamilySchema,
        projectId: s.string("The project ID used to filter Dedicated clusters."),
        clusterIds: s.array("The Dedicated cluster IDs to include.", s.string("One cluster ID.")),
        regionIds: s.array("The Dedicated region IDs to include.", s.string("One region ID.")),
        clusterStates: s.array("The Dedicated cluster states to include.", s.string("One cluster state.")),
        filter: s.string("The Google AIP filter expression for Starter and Essential clusters."),
        pageSize: { ...pageSizeSchema, description: "The maximum number of clusters to return." },
        pageToken: s.string("The pagination token from a previous list_clusters response."),
        skip: s.integer("The number of clusters to skip before returning results."),
      },
      {
        optional: ["projectId", "clusterIds", "regionIds", "clusterStates", "filter", "pageSize", "pageToken", "skip"],
      },
    ),
    outputSchema: s.object("The output payload for listing TiDB Cloud clusters.", {
      clusters: s.array("The clusters returned by TiDB Cloud.", clusterSchema),
      nextPageToken: paginationOutputSchema.nextPageToken,
      totalSize: paginationOutputSchema.totalSize,
    }),
  }),
  defineProviderAction(service, {
    name: "get_cluster",
    description: "Fetch one TiDB Cloud Starter, Essential, or Dedicated cluster by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for fetching one TiDB Cloud cluster.",
      {
        apiFamily: apiFamilySchema,
        clusterId: s.string("The TiDB Cloud cluster ID to fetch."),
        view: s.stringEnum("The detail level for Starter and Essential clusters.", ["BASIC", "FULL"]),
      },
      { optional: ["view"] },
    ),
    outputSchema: clusterSchema,
  }),
  defineProviderAction(service, {
    name: "list_regions",
    description: "List TiDB Cloud regions available to the connected organization API key.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing TiDB Cloud regions.",
      {
        apiFamily: apiFamilySchema,
        cloudProvider: s.string("The cloud provider used to filter Dedicated regions."),
        projectId: s.string("The project ID used to list Dedicated regions."),
        pageSize: { ...pageSizeSchema, description: "The maximum number of regions to return." },
        pageToken: s.string("The pagination token from a previous list_regions response."),
        skip: s.integer("The number of regions to skip before returning results."),
      },
      { optional: ["cloudProvider", "projectId", "pageSize", "pageToken", "skip"] },
    ),
    outputSchema: s.object("The output payload for listing TiDB Cloud regions.", {
      regions: s.array("The regions returned by TiDB Cloud.", regionSchema),
      nextPageToken: paginationOutputSchema.nextPageToken,
      totalSize: paginationOutputSchema.totalSize,
    }),
  }),
  defineProviderAction(service, {
    name: "show_node_quota",
    description: "List TiDB Cloud Dedicated node quotas for the organization.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Dedicated node quotas.", {}),
    outputSchema: s.object("The output payload for listing Dedicated node quotas.", {
      componentQuotas: s.array(
        "The Dedicated component quotas returned by TiDB Cloud.",
        s.looseObject("One TiDB Cloud Dedicated component quota.", {
          componentType: s.string("The component type for this quota."),
          quota: s.integer("The maximum number of nodes allowed for the component."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "show_cloud_providers",
    description: "List cloud providers available for TiDB Cloud Dedicated clusters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing TiDB Cloud Dedicated cloud providers.",
      {
        projectId: s.string("The project ID used to filter available cloud providers."),
      },
      { optional: ["projectId"] },
    ),
    outputSchema: s.object("The output payload for listing TiDB Cloud cloud providers.", {
      cloudProviders: s.array(
        "The cloud provider identifiers returned by TiDB Cloud.",
        s.stringEnum("One TiDB Cloud cloud provider identifier.", ["aws", "gcp", "azure", "alicloud"]),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_region",
    description: "Fetch one TiDB Cloud Dedicated region by region ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for fetching one TiDB Cloud Dedicated region.",
      {
        regionId: s.string("The TiDB Cloud region ID to fetch, such as aws-us-east-1."),
        projectId: s.string("The project ID used to fetch region details."),
      },
      { optional: ["projectId"] },
    ),
    outputSchema: regionSchema,
  }),
  defineProviderAction(service, {
    name: "list_node_specs",
    description: "List TiDB Cloud Dedicated node specs available in a region.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing TiDB Cloud Dedicated node specs.",
      {
        regionId: s.string("The TiDB Cloud region ID to query, such as aws-us-east-1."),
        componentType: componentTypeSchema,
        projectId: s.string("The project ID used to filter available node specs."),
        clusterId: s.string("The cluster ID used to filter available node specs."),
        pageSize: { ...pageSizeSchema, description: "The maximum number of node specs to return." },
        pageToken: s.string("The pagination token from a previous list_node_specs response."),
        skip: s.integer("The number of node specs to skip before returning results."),
      },
      { optional: ["componentType", "projectId", "clusterId", "pageSize", "pageToken", "skip"] },
    ),
    outputSchema: s.object("The output payload for listing TiDB Cloud Dedicated node specs.", {
      nodeSpecs: s.array("The node specs returned by TiDB Cloud.", nodeSpecSchema),
      nextPageToken: paginationOutputSchema.nextPageToken,
      totalSize: paginationOutputSchema.totalSize,
    }),
  }),
  defineProviderAction(service, {
    name: "get_node_spec",
    description: "Fetch one TiDB Cloud Dedicated node spec by region, component type, and key.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for fetching one TiDB Cloud Dedicated node spec.",
      {
        regionId: s.string("The TiDB Cloud region ID to query, such as aws-us-east-1."),
        componentType: componentTypeSchema,
        nodeSpecKey: s.string("The TiDB Cloud node spec key to fetch, such as 8C32G."),
        projectId: s.string("The project ID used to fetch node spec details."),
        clusterId: s.string("The cluster ID used to fetch node spec details."),
      },
      { optional: ["projectId", "clusterId"] },
    ),
    outputSchema: nodeSpecSchema,
  }),
  defineProviderAction(service, {
    name: "list_imports",
    description: "List TiDB Cloud Starter, Essential, or Dedicated import tasks.",
    requiredScopes: [],
    inputSchema: listTasksInputSchema,
    outputSchema: s.object("The output payload for listing TiDB Cloud import tasks.", {
      imports: s.array("The import tasks returned by TiDB Cloud.", importTaskSchema),
      nextPageToken: paginationOutputSchema.nextPageToken,
      totalSize: paginationOutputSchema.totalSize,
    }),
  }),
  defineProviderAction(service, {
    name: "get_import",
    description: "Fetch one TiDB Cloud Starter, Essential, or Dedicated import task.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one TiDB Cloud import task.", {
      apiFamily: apiFamilySchema,
      clusterId: s.string("The TiDB Cloud cluster ID that contains the import task."),
      importId: s.string("The TiDB Cloud import task ID to fetch."),
    }),
    outputSchema: importTaskSchema,
  }),
  defineProviderAction(service, {
    name: "list_exports",
    description: "List TiDB Cloud Starter or Essential export tasks.",
    requiredScopes: [],
    inputSchema: listServerlessTasksInputSchema,
    outputSchema: s.object("The output payload for listing TiDB Cloud export tasks.", {
      exports: s.array("The export tasks returned by TiDB Cloud.", exportTaskSchema),
      nextPageToken: paginationOutputSchema.nextPageToken,
      totalSize: paginationOutputSchema.totalSize,
    }),
  }),
  defineProviderAction(service, {
    name: "get_export",
    description: "Fetch one TiDB Cloud Starter or Essential export task.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one TiDB Cloud export task.", {
      clusterId: s.string("The TiDB Cloud Starter or Essential cluster ID."),
      exportId: s.string("The TiDB Cloud export task ID to fetch."),
    }),
    outputSchema: exportTaskSchema,
  }),
  defineProviderAction(service, {
    name: "list_branches",
    description: "List TiDB Cloud Starter or Essential branches for a cluster.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing TiDB Cloud Starter or Essential branches.",
      {
        clusterId: s.string("The TiDB Cloud Starter or Essential cluster ID whose branches to list."),
        pageSize: { ...pageSizeSchema, description: "The maximum number of branches to return." },
        pageToken: s.string("The pagination token from a previous list_branches response."),
      },
      { optional: ["pageSize", "pageToken"] },
    ),
    outputSchema: s.object("The output payload for listing TiDB Cloud branches.", {
      branches: s.array("The branches returned by TiDB Cloud.", branchSchema),
      nextPageToken: paginationOutputSchema.nextPageToken,
      totalSize: paginationOutputSchema.totalSize,
    }),
  }),
  defineProviderAction(service, {
    name: "get_branch",
    description: "Fetch one TiDB Cloud Starter or Essential branch by branch ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for fetching one TiDB Cloud Starter or Essential branch.",
      {
        clusterId: s.string("The TiDB Cloud Starter or Essential cluster ID."),
        branchId: s.string("The TiDB Cloud branch ID to fetch."),
        view: s.stringEnum("The detail level for the branch response.", ["BASIC", "FULL"]),
      },
      { optional: ["view"] },
    ),
    outputSchema: branchSchema,
  }),
];
