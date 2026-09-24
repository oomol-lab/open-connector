import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "proworkflow";

const idSchema = (description: string) => s.integer(description, { minimum: 1 });
const dateSchema = (description: string) => s.string(description, { format: "date" });
const statusSchema = s.stringEnum("The ProWorkflow work-state filter.", ["active", "complete", "deleted", "all"]);
const resourceSchema = s.looseObject("A ProWorkflow resource returned by the API.");
const metaSchema = s.looseObject("Pagination metadata returned by ProWorkflow.");

const listOutputSchema = s.requiredObject("A paginated ProWorkflow list response.", {
  status: s.string("The response status returned by ProWorkflow."),
  data: s.array("Resources returned by ProWorkflow.", resourceSchema),
  meta: metaSchema,
});

const detailOutputSchema = s.requiredObject("A ProWorkflow resource response.", {
  status: s.string("The response status returned by ProWorkflow."),
  data: resourceSchema,
});

const updateOutputSchema = s.looseRequiredObject(
  "The ProWorkflow update response.",
  {
    status: s.string("The response status returned by ProWorkflow."),
    message: s.string("The update result message returned by ProWorkflow."),
    data: s.looseObject("Additional update result data returned by ProWorkflow."),
  },
  { optional: ["message", "data"] },
);

const listInputProperties = {
  fields: s.nonEmptyString("Comma-separated response fields to request from ProWorkflow."),
  q: s.nonEmptyString("A fuzzy search term."),
  status: statusSchema,
  sortOrder: s.stringEnum("The result sort direction.", ["asc", "desc"]),
  pageNumber: s.integer("The one-based page number. Provide pageSize with this field.", {
    minimum: 1,
  }),
  pageSize: s.integer("The number of results per page. Provide pageNumber with this field.", {
    minimum: 1,
  }),
  includeTotalRows: s.boolean("Whether ProWorkflow should calculate the total result count."),
};

const projectUpdateProperties = {
  title: s.nonEmptyString("The new project title."),
  number: s.nonEmptyString("The new project number or reference code."),
  description: s.string("The new project description."),
  startDate: dateSchema("The new project start date."),
  dueDate: dateSchema("The new project due date."),
  completedDate: dateSchema("The new project completion date."),
  priorityId: idSchema("The new project priority ID."),
  managerId: idSchema("The contact ID of the new project manager."),
  companyId: idSchema("The client company ID for the project."),
  notification: s.boolean("Whether project notifications are enabled."),
};

const itemUpdateProperties = {
  name: s.nonEmptyString("The new project item name."),
  code: s.nonEmptyString("The new project item code."),
  description: s.string("The new project item description."),
  startDate: dateSchema("The new project item start date."),
  dueDate: dateSchema("The new project item due date."),
  completedDate: dateSchema("The new project item completion date."),
  status: s.stringEnum("The new project item work state.", ["active", "complete"]),
  priorityId: idSchema("The new project item priority ID."),
  percentComplete: s.number("The manually recorded completion percentage.", {
    minimum: 0,
    maximum: 100,
  }),
};

export const proworkflowActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List and search ProWorkflow projects with optional pagination and sorting.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing ProWorkflow projects.",
      {
        ...listInputProperties,
        sortBy: s.stringEnum("The project field used for sorting.", [
          "id",
          "number",
          "title",
          "startdate",
          "duedate",
          "completedate",
          "companyname",
          "categoryname",
          "priority",
        ]),
        companyId: s.nonEmptyString("A company ID or comma-separated company IDs to filter by."),
      },
      {
        optional: [
          "fields",
          "q",
          "status",
          "sortBy",
          "sortOrder",
          "pageNumber",
          "pageSize",
          "includeTotalRows",
          "companyId",
        ],
      },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get one ProWorkflow project by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for retrieving a ProWorkflow project.",
      {
        projectId: idSchema("The ProWorkflow project ID."),
        fields: s.nonEmptyString(
          "Comma-separated fields to return, including explicitly named sub-resources when needed.",
        ),
      },
      { optional: ["fields"] },
    ),
    outputSchema: detailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_project",
    operationType: "write",
    description: "Update selected fields on a ProWorkflow project.",
    requiredScopes: [],
    inputSchema: s.object(
      "Fields to update on a ProWorkflow project.",
      { projectId: idSchema("The ProWorkflow project ID."), ...projectUpdateProperties },
      {
        optional: [
          "title",
          "number",
          "description",
          "startDate",
          "dueDate",
          "completedDate",
          "priorityId",
          "managerId",
          "companyId",
          "notification",
        ],
      },
    ),
    outputSchema: updateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_project_items",
    operationType: "read",
    description: "List and search ProWorkflow project items with optional pagination and sorting.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing ProWorkflow project items.",
      {
        ...listInputProperties,
        sortBy: s.stringEnum("The project item field used for sorting.", [
          "id",
          "name",
          "code",
          "priority",
          "startdate",
          "duedate",
          "completedate",
          "status",
          "sortorder",
        ]),
        projectId: s.nonEmptyString("A project ID or comma-separated project IDs to filter by."),
      },
      {
        optional: [
          "fields",
          "q",
          "status",
          "sortBy",
          "sortOrder",
          "pageNumber",
          "pageSize",
          "includeTotalRows",
          "projectId",
        ],
      },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project_item",
    operationType: "read",
    description: "Get one ProWorkflow project item by ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Parameters for retrieving a ProWorkflow project item.", {
      itemId: idSchema("The ProWorkflow project item ID."),
    }),
    outputSchema: detailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_project_item",
    operationType: "write",
    description: "Update selected fields on a ProWorkflow project item.",
    requiredScopes: [],
    inputSchema: s.object(
      "Fields to update on a ProWorkflow project item.",
      { itemId: idSchema("The ProWorkflow project item ID."), ...itemUpdateProperties },
      {
        optional: [
          "name",
          "code",
          "description",
          "startDate",
          "dueDate",
          "completedDate",
          "status",
          "priorityId",
          "percentComplete",
        ],
      },
    ),
    outputSchema: updateOutputSchema,
  }),
];
