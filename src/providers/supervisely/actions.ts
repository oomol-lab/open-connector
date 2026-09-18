import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "supervisely";

export type SuperviselyActionName =
  | "get_current_user"
  | "list_teams"
  | "list_workspaces"
  | "list_projects"
  | "get_project"
  | "list_datasets"
  | "get_dataset";

function action(
  name: SuperviselyActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema: s.looseObject(`Input parameters for ${name}.`),
    outputSchema: s.looseObject(`Supervisely response for ${name}.`),
  });
}

export const superviselyActions: ActionDefinition[] = [
  action("get_current_user", "read", "Get the Supervisely user associated with the configured API token."),
  action("list_teams", "read", "List Supervisely teams accessible to the configured API token."),
  action("list_workspaces", "read", "List Supervisely workspaces for a team."),
  action("list_projects", "read", "List Supervisely projects for a workspace."),
  action("get_project", "read", "Get a Supervisely project by ID."),
  action("list_datasets", "read", "List Supervisely datasets for a project."),
  action("get_dataset", "read", "Get a Supervisely dataset by ID."),
];
