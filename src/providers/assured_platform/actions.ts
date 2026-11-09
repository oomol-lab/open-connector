import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "assured_platform";

const taskSchema = s.looseObject("One task returned by Assured Platform.");

const getCurrentUserAction = defineProviderAction(service, {
  name: "get_current_user",
  operationType: "read",
  description: "Get details for the user authenticated by the Assured Platform API key.",
  inputSchema: s.object("The input payload for retrieving the current Assured Platform user.", {}),
  outputSchema: s.object("The current Assured Platform user response.", {
    user: s.looseObject("The authenticated user returned by Assured Platform."),
  }),
});

const listTasksAction = defineProviderAction(service, {
  name: "list_tasks",
  operationType: "read",
  description: "List Assured Platform tasks with optional filtering and offset pagination.",
  inputSchema: s.object(
    "The input payload for listing Assured Platform tasks.",
    {
      limit: s.positiveInteger("The maximum number of tasks to return."),
      offset: s.nonNegativeInteger("The zero-based result offset."),
      search: s.nonEmptyString("The text used to search tasks."),
      status: s.nonEmptyString("The task status used to filter results."),
      taskType: s.stringEnum("The task type used to filter results.", [
        "APPLICATION_REVIEW",
        "CREDENTIALING_REQUEST",
        "ENROLLMENT_REQUEST",
        "EXPIRABLE",
        "GLOBAL",
        "INFORMATION_REQUIRED",
        "PROFILE_INCOMPLETE",
        "PROVIDER_ONBOARDING_DOCUMENT",
        "SIGNATURE",
      ]),
      assigneeId: s.string("The UUID of the task assignee.", { format: "uuid" }),
      clientId: s.string("The UUID of the client associated with the task.", { format: "uuid" }),
      facilityId: s.string("The UUID of the facility associated with the task.", {
        format: "uuid",
      }),
      createdAtAfter: s.string("Return tasks created at or after this timestamp.", {
        format: "date-time",
      }),
      createdAtBefore: s.string("Return tasks created at or before this timestamp.", {
        format: "date-time",
      }),
      dueOnAfter: s.string("Return tasks due at or after this timestamp.", {
        format: "date-time",
      }),
      dueOnBefore: s.string("Return tasks due at or before this timestamp.", {
        format: "date-time",
      }),
      ordering: s.nonEmptyString("The documented Assured Platform ordering expression."),
    },
    {
      optional: [
        "limit",
        "offset",
        "search",
        "status",
        "taskType",
        "assigneeId",
        "clientId",
        "facilityId",
        "createdAtAfter",
        "createdAtBefore",
        "dueOnAfter",
        "dueOnBefore",
        "ordering",
      ],
    },
  ),
  outputSchema: s.object("The paginated Assured Platform task list.", {
    count: s.integer("The total number of matching tasks."),
    next: s.nullable(s.string("The URL for the next result page when one exists.")),
    previous: s.nullable(s.string("The URL for the previous result page when one exists.")),
    tasks: s.array("The tasks returned for this page.", taskSchema),
  }),
});

const getTaskAction = defineProviderAction(service, {
  name: "get_task",
  operationType: "read",
  description: "Get detailed information about one Assured Platform task.",
  inputSchema: s.object("The input payload for retrieving an Assured Platform task.", {
    taskId: s.string("The UUID of the task to retrieve.", { format: "uuid" }),
  }),
  outputSchema: s.object("The Assured Platform task detail response.", {
    task: taskSchema,
  }),
});

export const assuredPlatformActions: readonly ActionDefinition[] = [
  getCurrentUserAction,
  listTasksAction,
  getTaskAction,
];
