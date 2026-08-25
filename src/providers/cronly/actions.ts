import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cronly";

const resourceIdSchema = s.integer("The numeric Cronly resource ID.");

const projectSchema = s.looseRequiredObject("A project returned by Cronly.", {
  id: resourceIdSchema,
  name: s.nonEmptyString("The project name."),
  company_id: s.integer("The Cronly company ID that owns the project."),
});

const monitorSchema = s.looseRequiredObject("A job monitor returned by Cronly.", {
  id: resourceIdSchema,
  name: s.nonEmptyString("The monitor name."),
  company_id: s.integer("The Cronly company ID that owns the monitor."),
  timezone: s.nonEmptyString("The timezone used to evaluate the monitor schedule."),
  schedule: s.nonEmptyString("The cron schedule expression."),
  duration: s.integer("The expected maximum job duration."),
});

const deleteResultSchema = s.object("A normalized Cronly delete result.", {
  deleted: s.boolean("Whether Cronly accepted the delete request."),
  id: resourceIdSchema,
});

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  description: "List projects in the connected Cronly company.",
  requiredScopes: [],
  inputSchema: s.object("This Cronly action does not require input.", {}),
  outputSchema: s.object("The Cronly project list response.", {
    projects: s.array("The projects returned by Cronly.", projectSchema),
  }),
});

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  description: "Get one Cronly project by ID.",
  requiredScopes: [],
  inputSchema: s.object("The Cronly project lookup input.", { id: resourceIdSchema }),
  outputSchema: s.object("The Cronly project response.", { project: projectSchema }),
});

const createProjectAction = defineProviderAction(service, {
  name: "create_project",
  description: "Create a project in the connected Cronly company.",
  requiredScopes: [],
  inputSchema: s.object("The new Cronly project fields.", {
    name: s.nonEmptyString("The project name."),
  }),
  outputSchema: s.object("The created Cronly project response.", { project: projectSchema }),
});

const deleteProjectAction = defineProviderAction(service, {
  name: "delete_project",
  description: "Delete one Cronly project by ID.",
  requiredScopes: [],
  inputSchema: s.object("The Cronly project delete input.", { id: resourceIdSchema }),
  outputSchema: deleteResultSchema,
});

const listMonitorsAction = defineProviderAction(service, {
  name: "list_monitors",
  description: "List job monitors in the connected Cronly company.",
  requiredScopes: [],
  inputSchema: s.object("This Cronly action does not require input.", {}),
  outputSchema: s.object("The Cronly monitor list response.", {
    monitors: s.array("The job monitors returned by Cronly.", monitorSchema),
  }),
});

const getMonitorAction = defineProviderAction(service, {
  name: "get_monitor",
  description: "Get one Cronly job monitor by ID.",
  requiredScopes: [],
  inputSchema: s.object("The Cronly monitor lookup input.", { id: resourceIdSchema }),
  outputSchema: s.object("The Cronly monitor response.", { monitor: monitorSchema }),
});

const createMonitorAction = defineProviderAction(service, {
  name: "create_monitor",
  description: "Create a job monitor in the connected Cronly company.",
  requiredScopes: [],
  inputSchema: s.object(
    "The new Cronly job monitor fields.",
    {
      name: s.nonEmptyString("The monitor name."),
      timezone: s.nonEmptyString("The timezone used to evaluate the cron schedule."),
      schedule: s.nonEmptyString("The cron schedule expression."),
      duration: s.integer("The expected maximum job duration."),
      project_id: s.integer("The project ID used to group this monitor."),
    },
    { optional: ["project_id"] },
  ),
  outputSchema: s.object("The created Cronly monitor response.", { monitor: monitorSchema }),
});

const deleteMonitorAction = defineProviderAction(service, {
  name: "delete_monitor",
  description: "Delete one Cronly job monitor by ID.",
  requiredScopes: [],
  inputSchema: s.object("The Cronly monitor delete input.", { id: resourceIdSchema }),
  outputSchema: deleteResultSchema,
});

export const cronlyActions: ActionDefinition[] = [
  listProjectsAction,
  getProjectAction,
  createProjectAction,
  deleteProjectAction,
  listMonitorsAction,
  getMonitorAction,
  createMonitorAction,
  deleteMonitorAction,
];
