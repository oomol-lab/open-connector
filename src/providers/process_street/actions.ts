import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "process_street";
const id = s.nonEmptyString("The Process Street opaque resource ID.");
const cursor = s.nonEmptyString(
  "The opaque pagination cursor returned by Process Street links. Omit it on the first page.",
);
const links = s.array(
  "The Process Street pagination or related-resource links.",
  s.object("A Process Street HATEOAS link.", {}, { additionalProperties: true }),
);
const raw = s.object("The raw Process Street object returned by the API.", {}, { additionalProperties: true });
const normalized = s.object("A normalized Process Street resource.", {}, { additionalProperties: true });
const status = s.stringEnum("The workflow task completion status to write.", ["NotCompleted", "Completed"]);

export const processStreetActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workflows",
    operationType: "read",
    description: "List Process Street workflows with optional name filtering and cursor pagination.",
    inputSchema: s.object(
      { name: s.nonEmptyString("A case-insensitive partial workflow name search."), cursor },
      { optional: ["name", "cursor"] },
    ),
    outputSchema: s.object({
      workflows: s.array("The Process Street workflows returned by the API.", normalized),
      links,
    }),
  }),
  defineProviderAction(service, {
    name: "get_workflow",
    operationType: "read",
    description: "Get one Process Street workflow by workflow ID.",
    inputSchema: s.object({ workflowId: id }),
    outputSchema: s.object({ workflow: normalized }),
  }),
  defineProviderAction(service, {
    name: "create_workflow_run",
    operationType: "write",
    description: "Create one Process Street workflow run from an existing workflow.",
    inputSchema: s.object(
      {
        workflowId: id,
        name: s.nonEmptyString("The new workflow run display name."),
        dueDate: s.dateTime("The optional ISO-8601 UTC due date for the new workflow run."),
        shared: s.boolean("Whether the new workflow run should be shared."),
        referenceId: s.string("The optional idempotency-friendly workflow run reference identifier.", {
          minLength: 1,
          maxLength: 100,
        }),
      },
      { optional: ["name", "dueDate", "shared", "referenceId"] },
    ),
    outputSchema: s.object({ id, links, raw }),
  }),
  defineProviderAction(service, {
    name: "list_workflow_runs",
    operationType: "read",
    description: "List Process Street workflow runs with optional workflow, status, and cursor filters.",
    inputSchema: s.object(
      {
        workflowId: id,
        status: s.array("The workflow run statuses to include.", s.stringEnum(["Active", "Completed", "Archived"]), {
          minItems: 1,
        }),
        cursor,
      },
      { optional: ["workflowId", "status", "cursor"] },
    ),
    outputSchema: s.object({
      workflowRuns: s.array("The Process Street workflow runs returned by the API.", normalized),
      links,
    }),
  }),
  defineProviderAction(service, {
    name: "get_workflow_run",
    operationType: "read",
    description: "Get one Process Street workflow run by workflow run ID.",
    inputSchema: s.object({ workflowRunId: id }),
    outputSchema: s.object({ workflowRun: normalized }),
  }),
  defineProviderAction(service, {
    name: "list_workflow_tasks",
    operationType: "read",
    description: "List Process Street tasks for one workflow run.",
    inputSchema: s.object({ workflowRunId: id, cursor }, { optional: ["cursor"] }),
    outputSchema: s.object({ tasks: s.array("The Process Street tasks returned by the API.", normalized), links }),
  }),
  defineProviderAction(service, {
    name: "update_workflow_task",
    operationType: "write",
    description: "Update one Process Street workflow task status and optional due date by workflow run ID and task ID.",
    inputSchema: s.object(
      {
        workflowRunId: id,
        taskId: id,
        status,
        dueDate: s.dateTime("The optional ISO-8601 UTC due date to assign to the task."),
      },
      { optional: ["dueDate"] },
    ),
    outputSchema: s.object({ ok: s.boolean("Whether the Process Street task update request succeeded.") }),
  }),
  defineProviderAction(service, {
    name: "list_workflow_form_fields",
    operationType: "read",
    description: "List Process Street workflow form field definitions for one workflow.",
    inputSchema: s.object({ workflowId: id, cursor }, { optional: ["cursor"] }),
    outputSchema: s.object({
      fields: s.array("The Process Street form field definitions returned by the API.", normalized),
      links,
    }),
  }),
  defineProviderAction(service, {
    name: "list_workflow_run_form_fields",
    operationType: "read",
    description: "List Process Street workflow run form field values for one workflow run.",
    inputSchema: s.object({ workflowRunId: id, cursor }, { optional: ["cursor"] }),
    outputSchema: s.object({
      fields: s.array("The Process Street workflow run form field values returned by the API.", normalized),
      links,
    }),
  }),
  defineProviderAction(service, {
    name: "update_workflow_run_form_fields",
    operationType: "write",
    description: "Batch update Process Street workflow run form field values for one workflow run.",
    inputSchema: s.object({
      workflowRunId: id,
      fields: s.array(
        "The Process Street form field update entries to write.",
        s.object(
          {
            id,
            value: s.string("A single string value to assign to the field."),
            values: s.array(
              "Multiple string values to assign to the field.",
              s.string("One Process Street form field value."),
            ),
            timeHidden: s.boolean("Whether a date field should hide the time component."),
            dataSetRowId: id,
          },
          { optional: ["value", "values", "timeHidden", "dataSetRowId"] },
        ),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.object({
      fields: s.array("The Process Street workflow run form field values returned by the API.", normalized),
      links,
    }),
  }),
];
