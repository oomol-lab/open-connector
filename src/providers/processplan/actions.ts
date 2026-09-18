import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "processplan";
const upstreamObject = s.looseObject(
  "A ProcessPlan object whose documented fields depend on the configured process template.",
);
const listFields = {
  take: s.positiveInteger("The maximum number of records to return."),
  skip: s.nonNegativeInteger("The number of records to skip before returning results."),
  filter: s.string("A ProcessPlan list filter expression."),
};

export const processplanActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_process_templates",
    operationType: "read",
    description: "List ProcessPlan process templates that the current user can start.",
    inputSchema: s.object("Pagination and filtering options for process templates.", listFields),
    outputSchema: s.requiredObject("The ProcessPlan process template list.", {
      processTemplates: s.array("The process templates available to start.", upstreamObject),
    }),
  }),
  defineProviderAction(service, {
    name: "start_process",
    operationType: "write",
    description: "Start a ProcessPlan process from a template and optionally populate its fields.",
    inputSchema: s.object(
      "The template and optional initial field values for a new process.",
      {
        processTemplateId: s.nonEmptyString("The ProcessPlan process template ID to start."),
        fields: s.record(
          "Initial process field values keyed by the field names configured in ProcessPlan.",
          s.unknown("The value assigned to the ProcessPlan field."),
        ),
      },
      { required: ["processTemplateId"] },
    ),
    outputSchema: s.requiredObject("The newly started ProcessPlan process instance.", {
      processInstance: upstreamObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_process_instances",
    operationType: "read",
    description: "List ProcessPlan process instances, optionally limited to one template and status.",
    inputSchema: s.object("Filters for ProcessPlan process instances.", {
      processTemplateId: s.nonEmptyString("The process template ID whose instances should be listed."),
      status: s.stringEnum("The process instance status to list, or all for the unfiltered list endpoint.", [
        "all",
        "pending",
        "completed",
      ]),
      ...listFields,
    }),
    outputSchema: s.requiredObject("The ProcessPlan process instance list.", {
      processInstances: s.array("The matching process instances.", upstreamObject),
    }),
  }),
  defineProviderAction(service, {
    name: "list_my_pending_tasks",
    operationType: "read",
    description: "List pending ProcessPlan tasks assigned to the current API token user.",
    inputSchema: s.object("Pagination and filtering options for pending tasks.", listFields),
    outputSchema: s.requiredObject("The current user's pending ProcessPlan task list.", {
      tasks: s.array("The pending tasks assigned to the current user.", upstreamObject),
    }),
  }),
];
