import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
const taskGuid = s.string("The Feishu task GUID or task ID.", { minLength: 1 });
const tasklistGuid = s.string("The Feishu tasklist GUID.", { minLength: 1 });
const pageSize = s.positiveInteger("The maximum number of results on this page.", {
  maximum: 100,
});
const pageToken = s.string("The token returned by the previous page.", { minLength: 1 });
const userIdType = s.stringEnum("The identifier type used for user fields.", ["open_id", "union_id", "user_id"]);
const timeValue = s.string(
  "An RFC 3339 date-time or Unix timestamp in milliseconds. Date-only values create all-day times.",
  { minLength: 1 },
);
const member = s.object(
  "A Feishu task member.",
  {
    id: s.string("A user open_id or application ID.", { minLength: 1 }),
    type: s.stringEnum("The member type.", ["user", "app"]),
    role: s.stringEnum("The member role.", ["assignee", "follower"]),
  },
  {
    optional: [],
  },
);
const tasklistMember = s.object(
  "A Feishu tasklist member.",
  {
    id: s.string("A user open_id or application ID.", { minLength: 1 }),
    type: s.stringEnum("The member type.", ["user", "app"]),
    role: s.stringEnum("The tasklist permission granted to the member.", ["editor", "viewer"]),
  },
  {
    optional: [],
  },
);
const taskItem = s.looseRequiredObject(
  "A Feishu task object.",
  {},
  {
    optional: [],
  },
);
const tasklistItem = s.looseRequiredObject(
  "A Feishu tasklist object.",
  {},
  {
    optional: [],
  },
);
const taskOutput = s.object(
  "A normalized task result.",
  { task: taskItem },
  {
    optional: [],
  },
);
const tasklistOutput = s.object(
  "A normalized tasklist result.",
  { tasklist: tasklistItem },
  {
    optional: [],
  },
);
const taskPageOutput = s.object(
  "A normalized page of tasks.",
  {
    items: s.array("The returned task objects.", taskItem),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
const tasklistPageOutput = s.object(
  "A normalized page of tasklists.",
  {
    items: s.array("The returned tasklist objects.", tasklistItem),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
export function createFeishuTaskActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "list_tasks",
      description: "List Feishu tasks related to the caller with server-side status filters.",
      requiredScopes: ["task:task:read"],
      providerPermissions: ["task:task:read"],
      inputSchema: s.object(
        "Configure task filters and pagination.",
        {
          completed: s.boolean("Whether to return completed tasks."),
          type: s.stringEnum("The caller's relationship to returned tasks.", [
            "my_tasks",
            "assigned",
            "created",
            "followed",
          ]),
          pageSize,
          pageToken,
          userIdType,
        },
        {
          optional: ["completed", "type", "pageSize", "pageToken", "userIdType"],
        },
      ),
      outputSchema: taskPageOutput,
    }),
    defineProviderAction(service, {
      name: "search_tasks",
      description: "Search Feishu tasks by text, members, completion state, and due range.",
      requiredScopes: ["task:task:read"],
      providerPermissions: ["task:task:read"],
      inputSchema: s.object(
        "Describe task search criteria.",
        {
          query: s.string("Text to find in task summaries and descriptions."),
          creatorIds: s.array(
            "Creator user IDs used to filter tasks.",
            s.string("A creator user ID.", { minLength: 1 }),
          ),
          assigneeIds: s.array(
            "Assignee user IDs used to filter tasks.",
            s.string("An assignee user ID.", { minLength: 1 }),
          ),
          followerIds: s.array(
            "Follower user IDs used to filter tasks.",
            s.string("A follower user ID.", { minLength: 1 }),
          ),
          completed: s.boolean("Whether to return completed tasks."),
          dueStart: timeValue,
          dueEnd: timeValue,
          pageToken,
          userIdType,
        },
        {
          optional: [
            "query",
            "creatorIds",
            "assigneeIds",
            "followerIds",
            "completed",
            "dueStart",
            "dueEnd",
            "pageToken",
            "userIdType",
          ],
        },
      ),
      outputSchema: taskPageOutput,
    }),
    defineProviderAction(service, {
      name: "get_task",
      description: "Get one Feishu task by GUID.",
      requiredScopes: ["task:task:read"],
      providerPermissions: ["task:task:read"],
      inputSchema: s.object(
        "Identify the task.",
        { taskGuid, userIdType },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: taskOutput,
    }),
    defineProviderAction(service, {
      name: "create_task",
      description: "Create a Feishu task with members, dates, reminders, and tasklist membership.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Describe the task to create.",
        {
          summary: s.string("The task summary.", { minLength: 1 }),
          description: s.string("The task description."),
          start: timeValue,
          due: timeValue,
          members: s.array("The assignees and followers.", member),
          tasklistGuids: s.array(
            "Tasklists that should contain the task.",
            s.string("A tasklist GUID.", { minLength: 1 }),
          ),
          reminderOffsetsMinutes: s.array(
            "Reminder offsets in minutes relative to the due time.",
            s.integer("A reminder offset in minutes."),
          ),
          clientToken: s.string("An idempotency token for task creation.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: [
            "description",
            "start",
            "due",
            "members",
            "tasklistGuids",
            "reminderOffsetsMinutes",
            "clientToken",
            "userIdType",
          ],
        },
      ),
      outputSchema: taskOutput,
    }),
    defineProviderAction(service, {
      name: "update_task",
      description: "Update the editable attributes of a Feishu task.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Identify the task and provide fields to change.",
        {
          taskGuid,
          summary: s.string("The new task summary.", { minLength: 1 }),
          description: s.string("The new task description."),
          start: timeValue,
          due: timeValue,
          clearStart: s.boolean("Whether to clear the task start time."),
          clearDue: s.boolean("Whether to clear the task due time."),
          userIdType,
        },
        {
          optional: ["summary", "description", "start", "due", "clearStart", "clearDue", "userIdType"],
        },
      ),
      outputSchema: taskOutput,
    }),
    defineProviderAction(service, {
      name: "complete_task",
      description: "Mark a Feishu task as completed.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Identify the task to complete.",
        { taskGuid, userIdType },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: taskOutput,
    }),
    defineProviderAction(service, {
      name: "reopen_task",
      description: "Reopen a completed Feishu task.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Identify the task to reopen.",
        { taskGuid, userIdType },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: taskOutput,
    }),
    defineProviderAction(service, {
      name: "manage_task_assignees",
      description: "Add or remove assignees on a Feishu task.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Choose the task, operation, and assignee IDs.",
        {
          taskGuid,
          operation: s.stringEnum("Whether to add or remove assignees.", ["add", "remove"]),
          assigneeIds: s.array(
            "User open_ids or application IDs to change.",
            s.string("A member identifier.", { minLength: 1 }),
            { minItems: 1 },
          ),
          clientToken: s.string("An idempotency token for an add operation.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: ["clientToken", "userIdType"],
        },
      ),
      outputSchema: taskOutput,
    }),
    defineProviderAction(service, {
      name: "manage_task_followers",
      description: "Add or remove followers on a Feishu task.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Choose the task, operation, and follower IDs.",
        {
          taskGuid,
          operation: s.stringEnum("Whether to add or remove followers.", ["add", "remove"]),
          followerIds: s.array(
            "User open_ids or application IDs to change.",
            s.string("A member identifier.", { minLength: 1 }),
            { minItems: 1 },
          ),
          clientToken: s.string("An idempotency token for an add operation.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: ["clientToken", "userIdType"],
        },
      ),
      outputSchema: taskOutput,
    }),
    defineProviderAction(service, {
      name: "set_task_ancestor",
      description: "Set or clear the ancestor of a Feishu task.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Identify the task and optionally its new ancestor.",
        {
          taskGuid,
          ancestorGuid: s.string("The ancestor task GUID. Omit this field to make the task independent.", {
            minLength: 1,
          }),
          userIdType,
        },
        {
          optional: ["ancestorGuid", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The updated task ancestry.",
        {
          taskGuid,
          ancestorGuid: s.nullable(s.string("The ancestor task GUID, or null when cleared.")),
          raw: s.looseRequiredObject(
            "The raw Feishu response data.",
            {},
            {
              optional: [],
            },
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_related_tasks",
      description: "List tasks related to the authorized Feishu user, with optional bounded auto-pagination.",
      requiredScopes: ["task:task:read"],
      providerPermissions: ["task:task:read"],
      inputSchema: s.object(
        "Configure related-task pagination.",
        {
          includeCompleted: s.boolean("Whether completed tasks should be included."),
          pageToken: s.string("The updated_at cursor in microseconds returned by the previous page.", { minLength: 1 }),
          fetchAll: s.boolean("Whether to fetch subsequent pages automatically."),
          maxPages: s.positiveInteger("The maximum number of pages to fetch.", {
            maximum: 40,
          }),
          userIdType,
        },
        {
          optional: ["includeCompleted", "pageToken", "fetchAll", "maxPages", "userIdType"],
        },
      ),
      outputSchema: taskPageOutput,
    }),
    defineProviderAction(service, {
      name: "add_task_comment",
      description: "Add a text comment to a Feishu task.",
      requiredScopes: ["task:comment:write"],
      providerPermissions: ["task:comment:write"],
      inputSchema: s.object(
        "Identify the task and provide comment text.",
        {
          taskGuid,
          content: s.string("The comment text.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: s.object(
        "The created comment.",
        {
          comment: s.looseRequiredObject(
            "A Feishu task comment object.",
            {},
            {
              optional: [],
            },
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "manage_task_reminders",
      description: "List, add, or remove reminders on a Feishu task.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Choose the task and reminder operation.",
        {
          taskGuid,
          operation: s.stringEnum("The reminder operation.", ["list", "add", "remove"]),
          offsetsMinutes: s.array(
            "Reminder offsets in minutes relative to the task due time.",
            s.integer("A reminder offset in minutes."),
          ),
          reminderIds: s.array("Reminder IDs to remove.", s.string("A reminder ID.", { minLength: 1 })),
          userIdType,
        },
        {
          optional: ["offsetsMinutes", "reminderIds", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The task and its current reminder objects.",
        {
          task: taskItem,
          reminders: s.array(
            "The current task reminders.",
            s.looseRequiredObject(
              "A Feishu task reminder.",
              {},
              {
                optional: [],
              },
            ),
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_tasklist",
      description: "Create a Feishu tasklist.",
      requiredScopes: ["task:tasklist:write"],
      providerPermissions: ["task:tasklist:write"],
      inputSchema: s.object(
        "Describe the tasklist.",
        {
          name: s.string("The tasklist name.", { minLength: 1 }),
          members: s.array("Initial tasklist members.", tasklistMember),
          userIdType,
        },
        {
          optional: ["members", "userIdType"],
        },
      ),
      outputSchema: tasklistOutput,
    }),
    defineProviderAction(service, {
      name: "search_tasklists",
      description: "Search Feishu tasklists by name and ownership.",
      requiredScopes: ["task:tasklist:read"],
      providerPermissions: ["task:tasklist:read"],
      inputSchema: s.object(
        "Describe tasklist search criteria.",
        {
          query: s.string("Text to find in tasklist names."),
          ownerIds: s.array(
            "Owner user IDs used to filter tasklists.",
            s.string("An owner user ID.", { minLength: 1 }),
          ),
          pageToken,
          userIdType,
        },
        {
          optional: ["query", "ownerIds", "pageToken", "userIdType"],
        },
      ),
      outputSchema: tasklistPageOutput,
    }),
    defineProviderAction(service, {
      name: "add_task_to_tasklist",
      description: "Add a Feishu task to a tasklist.",
      requiredScopes: ["task:task:write"],
      providerPermissions: ["task:task:write"],
      inputSchema: s.object(
        "Identify the task and tasklist.",
        { taskGuid, tasklistGuid, userIdType },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: taskOutput,
    }),
    defineProviderAction(service, {
      name: "manage_tasklist_members",
      description: "Add or remove members on a Feishu tasklist.",
      requiredScopes: ["task:tasklist:write"],
      providerPermissions: ["task:tasklist:write"],
      inputSchema: s.object(
        "Choose the tasklist, operation, and members.",
        {
          tasklistGuid,
          operation: s.stringEnum("Whether to add or remove members.", ["add", "remove"]),
          members: s.array("Members to add or remove.", tasklistMember, { minItems: 1 }),
          userIdType,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: tasklistOutput,
    }),
  ];
}
