import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "leiga";

const projectRecordSchema = s.object("A normalized Leiga project record.", {
  id: s.positiveInteger("The Leiga project ID."),
  pname: s.nullable(s.string("The Leiga project name.")),
  pkey: s.nullable(s.string("The Leiga project key.")),
  archived: s.nullable(s.integer("Whether the project is archived, where 1 means yes and 0 means no.")),
  owner: s.nullable(s.looseObject("The owner object returned by Leiga when available.")),
  raw: s.looseObject("The raw project object returned by Leiga."),
});

const issueRecordSchema = s.object("A normalized Leiga issue record.", {
  id: s.nullable(s.integer("The internal Leiga issue ID when available.")),
  issueId: s.nullable(s.integer("The internal Leiga issue ID from detail endpoints when available.")),
  issueNo: s.nullable(s.string("The issue number returned by Leiga.")),
  summary: s.nullable(s.string("The issue summary returned by Leiga.")),
  description: s.nullable(s.string("The issue description returned by Leiga.")),
  statusName: s.nullable(s.string("The issue status name returned by Leiga.")),
  projectId: s.nullable(s.integer("The project ID associated with the issue when available.")),
  raw: s.looseObject("The raw issue object returned by Leiga."),
});

const issueFieldSchema = s.object("One field definition from a Leiga issue schema.", {
  fieldId: s.nonEmptyString("The field identifier."),
  fieldName: s.nonEmptyString("The field display name."),
  fieldType: s.nonEmptyString("The field type returned by Leiga."),
  required: s.boolean("Whether Leiga marks the field as required."),
  options: s.nullable(s.array("The optional field choices returned by Leiga.", s.unknown("One raw option entry."))),
});

export const leigaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Leiga projects using the official project list filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Leiga projects.",
      {
        id: s.positiveInteger("Filter projects by one project ID."),
        pname: s.nonEmptyString("Filter projects by project name."),
        pkey: s.nonEmptyString("Filter projects by project key."),
        archived: s.integer("Filter by archived status where 1 means archived and 0 means active.", {
          minimum: 0,
          maximum: 1,
        }),
      },
      { optional: ["id", "pname", "pkey", "archived"] },
    ),
    outputSchema: s.object("The response returned when listing Leiga projects.", {
      projects: s.array("The normalized Leiga projects that matched the filters.", projectRecordSchema),
      total: s.integer("The total number of returned projects."),
      raw: s.looseObject("The raw project list response returned by Leiga."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Fetch one Leiga project by its official numeric projectId.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one Leiga project by ID.", {
      projectId: s.positiveInteger("The official Leiga project ID."),
    }),
    outputSchema: s.object("The response returned when fetching one Leiga project by ID.", {
      project: projectRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_project_by_key",
    description: "Fetch one Leiga project by its official project key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one Leiga project by key.", {
      projectKey: s.nonEmptyString("The official Leiga project key."),
    }),
    outputSchema: s.object("The response returned when fetching one Leiga project by key.", {
      project: projectRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_issues",
    description: "List Leiga issues for one project using the official issue query body.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Leiga issues.",
      {
        projectId: s.positiveInteger("The official Leiga project ID."),
        pageNumber: s.positiveInteger("The page number to request from Leiga."),
        pageSize: s.positiveInteger("The number of issues to request from Leiga."),
        summary: s.nonEmptyString("An optional summary keyword filter."),
        orderBy: s.nonEmptyString("The field name used for sorting."),
        sort: s.stringEnum("The sort direction returned by Leiga.", ["ASC", "DESC"]),
        statusTypes: s.array(
          "The optional list of issue status type IDs to filter by.",
          s.positiveInteger("One issue status type ID."),
          { minItems: 1 },
        ),
        showedCustomFieldCodes: s.array(
          "The optional custom field codes that should be included in the response.",
          s.nonEmptyString("One custom field code."),
          { minItems: 1 },
        ),
      },
      { optional: ["summary", "orderBy", "sort", "statusTypes", "showedCustomFieldCodes"] },
    ),
    outputSchema: s.object("The response returned when listing Leiga issues.", {
      total: s.integer("The total number of issues returned by Leiga for this query."),
      issues: s.array("The normalized Leiga issues in the current page.", issueRecordSchema),
      raw: s.looseObject("The raw issue list response returned by Leiga."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_issue_by_number",
    description: "Fetch one Leiga issue by its official issueNo identifier.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one Leiga issue by issue number.", {
      issueNo: s.nonEmptyString("The official Leiga issue number such as CORE-1."),
    }),
    outputSchema: s.object("The response returned when fetching one Leiga issue by issue number.", {
      issue: issueRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_issue_schema",
    description: "Fetch the Leiga issue field schema for one project.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching the Leiga issue schema.", {
      projectId: s.positiveInteger("The official Leiga project ID."),
    }),
    outputSchema: s.object("The response returned when fetching the Leiga issue schema.", {
      schema: s.object("The normalized Leiga issue schema object.", {
        id: s.nullable(s.integer("The issue schema ID when Leiga returns it as a number.")),
        name: s.nullable(s.string("The issue schema name.")),
        fields: s.array("The issue field definitions returned by Leiga.", issueFieldSchema),
        raw: s.looseObject("The raw issue schema object returned by Leiga."),
      }),
    }),
  }),
];
