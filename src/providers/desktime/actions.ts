import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "desktime";

const date = s.date("The DeskTime date in YYYY-MM-DD format.");
const period = s.stringEnum("The DeskTime tracking period to return for employee data.", ["day", "month"]);
const employeeId = s.positiveInteger(
  "The DeskTime employee ID. When omitted, DeskTime returns the API key owner's employee data.",
);
const projectName = s.string({ minLength: 1, description: "The project name to create in DeskTime." });
const taskName = s.string({
  minLength: 1,
  description: "The optional task name to create under the new DeskTime project.",
});
const rawData = s.looseObject("The raw JSON object returned by DeskTime.");
const projectTask = s.object(
  {
    id: s.nullableInteger("The DeskTime task ID when returned."),
    name: s.nullableString("The DeskTime task name when returned."),
    raw: s.looseObject("The raw task object returned by DeskTime."),
  },
  { required: ["id", "name", "raw"], description: "A normalized DeskTime project task." },
);
const project = s.object(
  {
    id: s.nullableInteger("The DeskTime project ID when returned."),
    name: s.nullableString("The DeskTime project name when returned."),
    createdAt: s.nullableString("The project creation date or timestamp returned by DeskTime."),
    tasks: s.array(projectTask, { description: "The tasks returned for the DeskTime project." }),
    raw: s.looseObject("The raw project object returned by DeskTime."),
  },
  { required: ["id", "name", "createdAt", "tasks", "raw"], description: "A normalized DeskTime project." },
);

export type DeskTimeActionName = "get_company" | "list_employees" | "get_employee" | "list_projects" | "create_project";

export const desktimeActions: Array<ProviderActionDefinition<DeskTimeActionName>> = [
  defineProviderAction(service, {
    name: "get_company",
    description: "Retrieve DeskTime company account settings and timezone information.",
    inputSchema: s.actionInput({}, [], "The input payload for retrieving DeskTime company data."),
    outputSchema: s.actionOutput({ data: rawData }, "The response returned when retrieving DeskTime company data."),
  }),
  defineProviderAction(service, {
    name: "list_employees",
    description: "Retrieve all DeskTime company employees with optional day or month tracking data.",
    inputSchema: s.object(
      {
        date,
        period,
      },
      { optional: ["date", "period"], description: "The input payload for retrieving DeskTime company employees." },
    ),
    outputSchema: s.actionOutput(
      { data: rawData },
      "The response returned when retrieving DeskTime company employees.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_employee",
    description: "Retrieve DeskTime tracking data for one employee or the API key owner.",
    inputSchema: s.object(
      {
        employeeId,
        date,
      },
      { optional: ["employeeId", "date"], description: "The input payload for retrieving one DeskTime employee." },
    ),
    outputSchema: s.actionOutput({ data: rawData }, "The response returned when retrieving one DeskTime employee."),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List active DeskTime projects and their related tasks.",
    inputSchema: s.actionInput({}, [], "The input payload for listing DeskTime projects."),
    outputSchema: s.actionOutput(
      {
        data: rawData,
        projects: s.array(project, { description: "The normalized active DeskTime projects." }),
      },
      "The response returned when listing DeskTime projects.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a DeskTime project and optionally create an associated task.",
    inputSchema: s.object(
      {
        project: projectName,
        task: taskName,
      },
      { required: ["project"], optional: ["task"], description: "The input payload for creating a DeskTime project." },
    ),
    outputSchema: s.actionOutput(
      {
        data: rawData,
        project,
      },
      "The response returned after creating a DeskTime project.",
    ),
  }),
];
