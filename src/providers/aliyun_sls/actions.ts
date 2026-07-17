import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aliyun_sls";

const endpointSchema = s.nonEmptyString(
  "The regional Simple Log Service endpoint, such as cn-hangzhou.log.aliyuncs.com. Defaults to the endpoint configured on the connection.",
);

const projectNameSchema = s.nonEmptyString(
  "The Simple Log Service Project name. It may be omitted only when the connection resource scope has exactly one candidate Project for the selected endpoint.",
);

const logstoreNameSchema = s.nonEmptyString(
  "The Simple Log Service Logstore name. It may be omitted only when the selected Project has exactly one allowed Logstore in the connection resource scope.",
);

const offsetSchema = s.nonNegativeInteger("The zero-based offset at which to start the page.", { default: 0 });
const listProjectSizeSchema = s.integer("The number of Projects to return. The maximum is 500.", {
  minimum: 1,
  maximum: 500,
  default: 100,
});
const listLogstoreSizeSchema = s.integer("The number of Logstores to return. The maximum is 500.", {
  minimum: 1,
  maximum: 500,
  default: 200,
});

const projectSchema = s.object("One normalized Simple Log Service Project.", {
  endpoint: s.string("The regional endpoint from which this Project was returned."),
  projectName: s.string("The Project name."),
  region: s.string("The Alibaba Cloud region that owns the Project."),
  description: s.string("The Project description."),
  status: s.string("The Project status."),
  createTime: s.string("The Project creation time returned by Simple Log Service."),
  lastModifyTime: s.string("The Project last modification time returned by Simple Log Service."),
  resourceGroupId: s.nullableString("The Alibaba Cloud resource group ID, or null when absent."),
  dataRedundancyType: s.nullableString("The Project data redundancy type, or null when absent."),
  recycleBinEnabled: s.nullableBoolean("Whether the Project recycle bin is enabled, or null when absent."),
  internetEndpoint: s.nullableString("The Project public endpoint, or null when absent."),
  internalEndpoint: s.nullableString("The Project internal endpoint, or null when absent."),
});

const listProjectsOutputSchema = s.object("A page of Projects visible through the selected regional endpoint.", {
  endpoint: s.string("The regional endpoint queried by this action."),
  count: s.nonNegativeInteger("The number of Projects returned in this page."),
  total: s.nonNegativeInteger("The total number of matching Projects reported for this result."),
  projects: s.array("The matching Projects.", projectSchema),
});

const regionResultSchema = s.object("One successfully queried regional endpoint.", {
  endpoint: s.string("The regional endpoint that was queried."),
  count: s.nonNegativeInteger("The number of unique Projects returned from this endpoint."),
});

const regionFailureSchema = s.object("One regional endpoint that could not be queried.", {
  endpoint: s.string("The regional endpoint that failed."),
  status: s.integer("The normalized HTTP-style error status."),
  message: s.string("The failure message returned by the connector or Simple Log Service."),
});

const listLogstoresOutputSchema = s.object("A page of Logstores in one Project.", {
  endpoint: s.string("The regional endpoint queried by this action."),
  project: s.string("The Project containing the returned Logstores."),
  count: s.nonNegativeInteger("The number of Logstores returned in this page."),
  total: s.nonNegativeInteger("The total number of matching Logstores reported for this result."),
  logstores: s.array("The matching Logstore names.", s.string("One Logstore name.")),
});

const queryTargetProperties: Record<string, JsonSchema> = {
  endpoint: endpointSchema,
  project: projectNameSchema,
  logstore: logstoreNameSchema,
};

const queryTimeProperties: Record<string, JsonSchema> = {
  from: s.nonNegativeInteger(
    "The inclusive start of the query interval as a Unix timestamp in seconds. Simple Log Service evaluates [from, to).",
  ),
  to: s.nonNegativeInteger(
    "The exclusive end of the query interval as a Unix timestamp in seconds. It must be greater than from.",
  ),
  query: s.string("An optional Simple Log Service search or analytic statement."),
};

export type AliyunSlsActionName =
  | "list_projects"
  | "list_projects_across_regions"
  | "list_logstores"
  | "query_logs"
  | "get_histograms";

export const aliyunSlsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Projects visible through one Alibaba Cloud Simple Log Service regional endpoint.",
    providerPermissions: ["log:ListProject"],
    inputSchema: s.object(
      "Filters and pagination for listing Projects in one region.",
      {
        endpoint: endpointSchema,
        offset: offsetSchema,
        size: listProjectSizeSchema,
        projectName: s.nonEmptyString("A fuzzy Project name filter."),
        resourceGroupId: s.nonEmptyString("An Alibaba Cloud resource group ID filter."),
      },
      { optional: ["endpoint", "offset", "size", "projectName", "resourceGroupId"] },
    ),
    outputSchema: listProjectsOutputSchema,
    followUpActions: ["aliyun_sls.list_logstores"],
  }),
  defineProviderAction(service, {
    name: "list_projects_across_regions",
    description:
      "List all Projects from the explicitly supplied regional endpoints with bounded concurrency and optional partial-failure results.",
    providerPermissions: ["log:ListProject"],
    inputSchema: s.object(
      "Regional endpoints and optional filters for a multi-region Project listing.",
      {
        endpoints: {
          ...s.array(
            "The 1 to 50 distinct regional endpoints to query. Only these regions are covered.",
            endpointSchema,
            {
              minItems: 1,
              maxItems: 50,
            },
          ),
          uniqueItems: true,
        },
        projectName: s.nonEmptyString("A fuzzy Project name filter applied in every region."),
        resourceGroupId: s.nonEmptyString("An Alibaba Cloud resource group ID filter applied in every region."),
        allowPartial: s.boolean({
          description:
            "Whether successful regions should be returned when another region fails. The default false fails the entire action.",
          default: false,
        }),
      },
      { optional: ["projectName", "resourceGroupId", "allowPartial"] },
    ),
    outputSchema: s.object("The unique Projects and per-region outcome for the supplied endpoints.", {
      projects: s.array("Projects deduplicated by region and Project name.", projectSchema),
      total: s.nonNegativeInteger("The number of unique Projects returned."),
      regions: s.array("The regional endpoints queried successfully.", regionResultSchema),
      failures: s.array("Regional endpoints that failed when allowPartial is true.", regionFailureSchema),
      complete: s.boolean("Whether every supplied regional endpoint completed successfully."),
    }),
    followUpActions: ["aliyun_sls.list_logstores"],
  }),
  defineProviderAction(service, {
    name: "list_logstores",
    description: "List Logstores in one Simple Log Service Project.",
    providerPermissions: ["log:ListLogStores"],
    inputSchema: s.object(
      "The Project, endpoint, filters, and pagination for listing Logstores.",
      {
        endpoint: endpointSchema,
        project: projectNameSchema,
        offset: offsetSchema,
        size: listLogstoreSizeSchema,
        logstoreName: s.nonEmptyString("A fuzzy Logstore name filter."),
      },
      { optional: ["endpoint", "project", "offset", "size", "logstoreName"] },
    ),
    outputSchema: listLogstoresOutputSchema,
    followUpActions: ["aliyun_sls.query_logs", "aliyun_sls.get_histograms"],
  }),
  defineProviderAction(service, {
    name: "query_logs",
    description: "Query logs from one Simple Log Service Logstore with the GetLogs API.",
    providerPermissions: ["log:GetLogStoreLogs"],
    inputSchema: s.object(
      "The Logstore target, time range, query, and GetLogs pagination controls.",
      {
        ...queryTargetProperties,
        ...queryTimeProperties,
        offset: s.nonNegativeInteger("The starting row for a search query.", { default: 0 }),
        line: s.integer("The maximum number of logs to return. Simple Log Service accepts 0 to 100.", {
          minimum: 0,
          maximum: 100,
          default: 100,
        }),
        reverse: s.boolean({
          description: "Whether search results should be returned newest first.",
          default: false,
        }),
        powerSql: s.boolean({
          description: "Whether to use the Simple Log Service Exclusive SQL feature.",
          default: false,
        }),
      },
      { optional: ["endpoint", "project", "logstore", "query", "offset", "line", "reverse", "powerSql"] },
    ),
    outputSchema: s.object("The normalized GetLogs response.", {
      endpoint: s.string("The regional endpoint queried by this action."),
      project: s.string("The Project queried by this action."),
      logstore: s.string("The Logstore queried by this action."),
      progress: s.string("The Simple Log Service query progress, such as Complete or Incomplete."),
      count: s.nonNegativeInteger("The number of log entries returned."),
      processedRows: s.nullableInteger("The number of rows processed by the query, or null when unavailable."),
      elapsedMilliseconds: s.nullableInteger("The provider-reported query duration, or null when unavailable."),
      hasSql: s.nullableBoolean("Whether the query included an analytic statement, or null when unavailable."),
      logs: s.array("The returned log entries.", s.looseObject("One Simple Log Service log entry.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_histograms",
    description: "Query the time distribution of matching logs in one Simple Log Service Logstore.",
    providerPermissions: ["log:GetLogStoreLogs"],
    inputSchema: s.object(
      "The Logstore target, time range, and search statement for a histogram query.",
      {
        ...queryTargetProperties,
        ...queryTimeProperties,
      },
      { optional: ["endpoint", "project", "logstore", "query"] },
    ),
    outputSchema: s.object("The normalized GetHistograms response.", {
      endpoint: s.string("The regional endpoint queried by this action."),
      project: s.string("The Project queried by this action."),
      logstore: s.string("The Logstore queried by this action."),
      progress: s.string("The overall Simple Log Service histogram query progress."),
      count: s.nonNegativeInteger("The total number of matching logs across the returned intervals."),
      histograms: s.array(
        "The stable histogram intervals returned by Simple Log Service.",
        s.object("One histogram interval.", {
          from: s.nonNegativeInteger("The inclusive interval start as a Unix timestamp in seconds."),
          to: s.nonNegativeInteger("The exclusive interval end as a Unix timestamp in seconds."),
          count: s.nonNegativeInteger("The number of matching logs in this interval."),
          progress: s.string("The query progress for this interval."),
        }),
      ),
    }),
  }),
];
