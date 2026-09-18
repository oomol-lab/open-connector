import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sonarcloud";

const pageInputProperties = {
  page: s.positiveInteger("The 1-based page number to return."),
  pageSize: s.positiveInteger("The number of records to return per page.", { maximum: 500 }),
};

const pagingSchema = s.requiredObject("Pagination metadata returned by SonarQube Cloud.", {
  pageIndex: s.integer("The 1-based page number returned by SonarQube Cloud."),
  pageSize: s.integer("The page size returned by SonarQube Cloud."),
  total: s.integer("The total number of matching records."),
});

const projectSchema = s.requiredObject("A SonarQube Cloud project visible to the connected token.", {
  organization: s.string("The organization key that owns the project."),
  key: s.string("The unique project key."),
  name: s.string("The project display name."),
  qualifier: s.string("The SonarQube component qualifier for the project."),
  visibility: s.string("The project visibility."),
  lastAnalysisDate: s.nullableString(
    "The timestamp of the latest analysis, or null when the project has not been analyzed.",
  ),
  revision: s.nullableString("The source revision from the latest analysis, or null when unavailable."),
});

const issueImpactSchema = s.requiredObject("A software-quality impact reported for an issue.", {
  softwareQuality: s.string("The affected software quality."),
  severity: s.string("The impact severity."),
});

const issueSchema = s.requiredObject("A normalized SonarQube Cloud code issue.", {
  key: s.string("The unique issue key."),
  project: s.string("The project key containing the issue."),
  component: s.string("The component key containing the issue."),
  rule: s.string("The coding rule key that raised the issue."),
  status: s.string("The current issue status."),
  message: s.string("The issue message."),
  line: s.nullableInteger("The source line containing the issue, or null when unavailable."),
  assignee: s.nullableString("The login of the assigned user, or null when the issue is unassigned."),
  author: s.nullableString("The source-control author, or null when unavailable."),
  effort: s.nullableString("The remediation effort, or null when unavailable."),
  creationDate: s.nullableString("The issue creation timestamp, or null when unavailable."),
  updateDate: s.nullableString("The issue update timestamp, or null when unavailable."),
  cleanCodeAttribute: s.nullableString("The clean-code attribute assigned to the issue, or null when unavailable."),
  cleanCodeAttributeCategory: s.nullableString("The clean-code attribute category, or null when unavailable."),
  tags: s.array("The tags assigned to the issue.", s.string("An issue tag.")),
  impacts: s.array("The software-quality impacts reported for the issue.", issueImpactSchema),
});

const measurePeriodSchema = s.requiredObject("A new-code period value for one metric.", {
  index: s.integer("The period index."),
  value: s.string("The metric value within this period."),
  bestValue: s.nullableBoolean("Whether this is the metric's best value, or null when unspecified."),
});

const measureSchema = s.requiredObject("One metric value returned for the requested component.", {
  metric: s.string("The metric key."),
  value: s.nullableString("The overall metric value, or null when only period values are available."),
  bestValue: s.nullableBoolean("Whether this is the metric's best value, or null when unspecified."),
  periods: s.array("The new-code period values returned for this metric.", measurePeriodSchema),
});

const metricDefinitionSchema = s.requiredObject("Metadata describing one requested metric.", {
  key: s.string("The metric key."),
  name: s.string("The metric display name."),
  description: s.nullableString("The metric description, or null when unavailable."),
  domain: s.nullableString("The metric domain, or null when unavailable."),
  type: s.string("The SonarQube metric value type."),
  higherValuesAreBetter: s.nullableBoolean("Whether higher values are better, or null when unspecified."),
  qualitative: s.nullableBoolean("Whether the metric is qualitative, or null when unspecified."),
  hidden: s.nullableBoolean("Whether the metric is hidden, or null when unspecified."),
});

const analysisPeriodSchema = s.requiredObject("The active new-code period returned for the component.", {
  index: s.integer("The period index."),
  mode: s.nullableString("The period mode, or null when unavailable."),
  date: s.nullableString("The period start timestamp, or null when unavailable."),
  parameter: s.nullableString("The period parameter, or null when unavailable."),
});

function forbidBranchAndPullRequest(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    not: {
      required: ["branch", "pullRequest"],
    },
  };
}

const searchIssuesInputSchema = forbidBranchAndPullRequest(
  s.object(
    "Filters and pagination for searching SonarQube Cloud issues.",
    {
      projectKeys: s.array(
        "The project keys whose issues should be searched.",
        s.nonWhitespaceString("A project key."),
        { minItems: 1 },
      ),
      branch: s.nonWhitespaceString("Optional branch key to search."),
      pullRequest: s.nonWhitespaceString("Optional pull request identifier to search."),
      issueStatuses: s.array(
        "Optional current issue statuses to include.",
        s.stringEnum(["OPEN", "CONFIRMED", "FALSE_POSITIVE", "ACCEPTED", "FIXED"], {
          description: "A current issue status.",
        }),
        { minItems: 1 },
      ),
      impactSeverities: s.array(
        "Optional impact severities to include.",
        s.stringEnum(["INFO", "LOW", "MEDIUM", "HIGH", "BLOCKER"], {
          description: "An impact severity.",
        }),
        { minItems: 1 },
      ),
      softwareQualities: s.array(
        "Optional software qualities to include.",
        s.stringEnum(["MAINTAINABILITY", "RELIABILITY", "SECURITY"], {
          description: "A software quality.",
        }),
        { minItems: 1 },
      ),
      assigned: s.boolean("Whether to return only assigned or only unassigned issues."),
      assignees: s.array(
        "Optional assignee logins to include. Use __me__ for the connected user.",
        s.nonWhitespaceString("An assignee login."),
        { minItems: 1 },
      ),
      createdAfter: s.nonWhitespaceString("Optional inclusive lower bound for the issue creation date."),
      createdBefore: s.nonWhitespaceString("Optional inclusive upper bound for the issue creation date."),
      languages: s.array("Optional programming language keys to include.", s.nonWhitespaceString("A language key."), {
        minItems: 1,
      }),
      tags: s.array("Optional issue tags to include.", s.nonWhitespaceString("An issue tag."), {
        minItems: 1,
      }),
      resolved: s.boolean("Whether to return resolved or unresolved issues."),
      ...pageInputProperties,
    },
    {
      optional: [
        "branch",
        "pullRequest",
        "issueStatuses",
        "impactSeverities",
        "softwareQualities",
        "assigned",
        "assignees",
        "createdAfter",
        "createdBefore",
        "languages",
        "tags",
        "resolved",
        "page",
        "pageSize",
      ],
    },
  ),
);

const getComponentMeasuresInputSchema = forbidBranchAndPullRequest(
  s.object(
    "A component and metric selection for reading SonarQube Cloud measures.",
    {
      componentKey: s.nonWhitespaceString("The project or component key to inspect."),
      metricKeys: s.array("The metric keys to return.", s.nonWhitespaceString("A SonarQube metric key."), {
        minItems: 1,
      }),
      branch: s.nonWhitespaceString("Optional branch key to inspect."),
      pullRequest: s.nonWhitespaceString("Optional pull request identifier to inspect."),
      includeMetricDetails: s.boolean("Whether to include metric definitions in addition to metric values."),
    },
    { optional: ["branch", "pullRequest", "includeMetricDetails"] },
  ),
);

export const sonarCloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List projects visible in a SonarQube Cloud organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing projects in a SonarQube Cloud organization.",
      {
        organization: s.nonWhitespaceString("The organization key whose projects should be returned."),
        query: s.nonWhitespaceString("Optional text matched against project names and keys."),
        projectKeys: s.array(
          "Optional project keys used to restrict the result.",
          s.nonWhitespaceString("A project key."),
          { minItems: 1, maxItems: 1000 },
        ),
        analyzedBefore: s.nonWhitespaceString(
          "Optional date or timestamp used to return projects last analyzed before that value.",
        ),
        provisionedOnly: s.boolean("Whether to return only provisioned projects."),
        ...pageInputProperties,
      },
      {
        optional: ["query", "projectKeys", "analyzedBefore", "provisionedOnly", "page", "pageSize"],
      },
    ),
    outputSchema: s.requiredObject("The paginated SonarQube Cloud projects visible to the connected token.", {
      paging: pagingSchema,
      projects: s.array("The projects returned for this page.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_issues",
    operationType: "read",
    description: "Search and filter code issues across SonarQube Cloud projects.",
    requiredScopes: [],
    inputSchema: searchIssuesInputSchema,
    outputSchema: s.requiredObject("The normalized paginated SonarQube Cloud issues.", {
      paging: pagingSchema,
      issues: s.array("The issues returned for this page.", issueSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_component_measures",
    operationType: "read",
    description: "Read selected code-health measures for a SonarQube Cloud component.",
    requiredScopes: [],
    inputSchema: getComponentMeasuresInputSchema,
    outputSchema: s.requiredObject("The requested measures and metric metadata for a SonarQube Cloud component.", {
      component: s.requiredObject("The measured SonarQube component.", {
        key: s.string("The component key."),
        name: s.string("The component display name."),
        qualifier: s.string("The SonarQube component qualifier."),
        language: s.nullableString("The component language key, or null when it is not language-specific."),
        path: s.nullableString("The component path, or null when unavailable."),
        measures: s.array("The requested metric values.", measureSchema),
      }),
      metrics: s.array("Metric definitions returned when includeMetricDetails is enabled.", metricDefinitionSchema),
      periods: s.array("The active new-code periods returned for the component.", analysisPeriodSchema),
    }),
  }),
];
