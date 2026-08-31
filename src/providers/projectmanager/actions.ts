import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "projectmanager";
const rawItem = s.looseObject("One ProjectManager object returned by the API.");
const odataInput = s.object(
  "OData query parameters for a ProjectManager collection endpoint.",
  {
    top: s.integer("The number of records to return."),
    skip: s.integer("The number of records to skip before returning records."),
    filter: s.nonEmptyString("The OData filter expression to apply."),
    orderby: s.nonEmptyString("The OData order expression to apply."),
    expand: s.nonEmptyString("The related data to include in the response."),
  },
  { optional: ["top", "skip", "filter", "orderby", "expand"] },
);

export const projectmanagerActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "Query ProjectManager projects with optional OData parameters.",
    inputSchema: odataInput,
    outputSchema: s.object(
      "A ProjectManager collection response normalized for connector callers.",
      {
        items: s.array("The objects returned by ProjectManager.", rawItem),
        raw: s.looseObject("The raw ProjectManager response payload."),
      },
      { optional: ["raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve a ProjectManager project by its unique identifier.",
    inputSchema: s.object("Input parameters for retrieving a Project.", {
      projectId: s.nonEmptyString("The unique identifier of the Project to retrieve."),
    }),
    outputSchema: s.object(
      "A ProjectManager object response normalized for connector callers.",
      {
        item: rawItem,
        raw: s.looseObject("The raw ProjectManager response payload."),
      },
      { optional: ["raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "Query ProjectManager tasks with optional OData parameters.",
    inputSchema: odataInput,
    outputSchema: s.object(
      "A ProjectManager collection response normalized for connector callers.",
      {
        items: s.array("The objects returned by ProjectManager.", rawItem),
        raw: s.looseObject("The raw ProjectManager response payload."),
      },
      { optional: ["raw"] },
    ),
  }),
];
