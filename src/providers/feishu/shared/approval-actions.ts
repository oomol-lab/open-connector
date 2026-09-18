import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuApprovalProviderPermissions = {
  approvalRead: "approval:approval:read",
  instanceRead: "approval:instance:read",
  instanceWrite: "approval:instance:write",
  taskRead: "approval:task:read",
  taskWrite: "approval:task:write",
};
const approvalCodeField = s.nonEmptyString("The approval definition code.");
const instanceCodeField = s.nonEmptyString("The approval instance code.");
const taskIdField = s.nonEmptyString("The approval task ID.");
const userIdTypeField = s.stringEnum("The type used by all user IDs in this request.", [
  "open_id",
  "union_id",
  "user_id",
]);
const localeField = s.string("The response locale, for example `zh-CN` or `en-US`.");
const commentField = s.string("An optional approval comment.", { maxLength: 500 });
const rawObjectSchema = s.looseObject("The raw Approval object returned by Feishu.");
const writeResultSchema = s.object(
  "The completed approval operation.",
  {
    success: s.boolean("Whether Feishu accepted the operation."),
    result: rawObjectSchema,
  },
  {
    optional: [],
  },
);
const pageFields = {
  pageSize: s.positiveInteger("The number of results per page.", { maximum: 100 }),
  pageToken: s.string("The pagination token from a previous response."),
};
const listOutputSchema = s.object(
  "A normalized page of Approval objects.",
  {
    items: s.array("The objects returned for this page.", rawObjectSchema),
    pageToken: s.string("The next pagination token."),
    hasMore: s.boolean("Whether another page is available."),
    total: s.nonNegativeInteger("The total count reported by Feishu."),
  },
  {
    optional: [],
  },
);
const formSchema = s.array(
  "Approval form controls; the provider serializes this array for Feishu.",
  s.looseObject("One form control value with its ID, type, and value."),
);
const nodeUsersSchema = s.array(
  "User assignments for approval definition nodes.",
  s.object(
    "One node-to-users assignment.",
    {
      key: s.nonEmptyString("The custom node ID or node ID."),
      value: s.array("The assigned user open IDs.", s.nonEmptyString("A user open ID."), {
        minItems: 1,
      }),
    },
    {
      optional: [],
    },
  ),
);
const instanceTaskFields = {
  instanceCode: instanceCodeField,
  taskId: taskIdField,
};
const timeFilterFields = {
  definitionCode: approvalCodeField,
  startTimestamp: s.nonEmptyString("The inclusive start time as a Unix timestamp in seconds."),
  endTimestamp: s.nonEmptyString("The inclusive end time as a Unix timestamp in seconds."),
  locale: localeField,
  userIdType: userIdTypeField,
  ...pageFields,
};
export function createFeishuApprovalActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "search_approvals",
      operationType: "read",
      description: "Search approval definitions the connected user can initiate.",
      requiredScopes: [feishuApprovalProviderPermissions.approvalRead],
      providerPermissions: [feishuApprovalProviderPermissions.approvalRead],
      inputSchema: s.object(
        "Configure the approval definition search.",
        {
          keyword: s.string("Text matched against launchable approvals."),
          locale: localeField,
          ...pageFields,
        },
        {
          optional: ["keyword", "locale", "pageSize", "pageToken"],
        },
      ),
      outputSchema: listOutputSchema,
    }),
    defineProviderAction(service, {
      name: "get_approval",
      operationType: "read",
      description: "Get an approval definition, form snapshot, and approval nodes.",
      requiredScopes: [feishuApprovalProviderPermissions.approvalRead],
      providerPermissions: [feishuApprovalProviderPermissions.approvalRead],
      inputSchema: s.object(
        "Identify the approval definition.",
        {
          approvalCode: approvalCodeField,
          locale: localeField,
        },
        {
          optional: ["locale"],
        },
      ),
      outputSchema: s.object(
        "The approval definition.",
        {
          approval: rawObjectSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_approval_instance",
      operationType: "write",
      description: "Create an approval instance from structured form controls.",
      requiredScopes: [feishuApprovalProviderPermissions.instanceWrite],
      providerPermissions: [feishuApprovalProviderPermissions.instanceWrite],
      inputSchema: s.object(
        "Configure the approval instance.",
        {
          approvalCode: approvalCodeField,
          form: formSchema,
          nodeApprovers: nodeUsersSchema,
          nodeCcUsers: nodeUsersSchema,
          idempotencyKey: s.nonEmptyString("A tenant-unique key that prevents duplicate approval instances."),
        },
        {
          optional: ["form", "nodeApprovers", "nodeCcUsers", "idempotencyKey"],
        },
      ),
      outputSchema: s.object(
        "The created approval instance.",
        {
          instanceCode: instanceCodeField,
          instanceLink: s.string("The URL for opening the approval instance."),
          instance: rawObjectSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_approval_instance",
      operationType: "read",
      description: "Get an approval instance with its nodes, tasks, form, and history.",
      requiredScopes: [feishuApprovalProviderPermissions.instanceRead],
      providerPermissions: [feishuApprovalProviderPermissions.instanceRead],
      inputSchema: s.object(
        "Identify the approval instance.",
        {
          instanceCode: instanceCodeField,
          locale: localeField,
          userIdType: userIdTypeField,
        },
        {
          optional: ["locale", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The approval instance.",
        {
          instance: rawObjectSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "cancel_approval_instance",
      operationType: "destructive",
      description: "Recall an approval instance initiated by the connected user.",
      requiredScopes: [feishuApprovalProviderPermissions.instanceWrite],
      providerPermissions: [feishuApprovalProviderPermissions.instanceWrite],
      inputSchema: s.object(
        "Identify the approval instance to recall.",
        {
          instanceCode: instanceCodeField,
        },
        {
          optional: [],
        },
      ),
      outputSchema: writeResultSchema,
    }),
    defineProviderAction(service, {
      name: "add_approval_cc",
      operationType: "write",
      description: "Add CC recipients to an active approval instance.",
      requiredScopes: [feishuApprovalProviderPermissions.instanceWrite],
      providerPermissions: [feishuApprovalProviderPermissions.instanceWrite],
      inputSchema: s.object(
        "Identify the instance and CC recipients.",
        {
          instanceCode: instanceCodeField,
          userIds: s.array("The users to add as CC recipients.", s.nonEmptyString("A user ID."), {
            minItems: 1,
          }),
          comment: commentField,
          userIdType: userIdTypeField,
        },
        {
          optional: ["comment", "userIdType"],
        },
      ),
      outputSchema: writeResultSchema,
    }),
    defineProviderAction(service, {
      name: "list_initiated_approval_instances",
      operationType: "read",
      description: "List approval instances initiated by the connected user.",
      requiredScopes: [feishuApprovalProviderPermissions.instanceRead],
      providerPermissions: [feishuApprovalProviderPermissions.instanceRead],
      inputSchema: s.object("Filter and page initiated approval instances.", timeFilterFields),
      outputSchema: listOutputSchema,
    }),
    defineProviderAction(service, {
      name: "list_approval_tasks",
      operationType: "read",
      description: "List approval tasks grouped by pending, completed, initiated, or CC status.",
      requiredScopes: [feishuApprovalProviderPermissions.taskRead],
      providerPermissions: [feishuApprovalProviderPermissions.taskRead],
      inputSchema: s.object(
        "Filter and page approval tasks.",
        {
          topic: s.stringEnum("The approval task group to query.", [
            "pending",
            "completed",
            "initiated",
            "cc_unread",
            "cc_read",
          ]),
          ...timeFilterFields,
        },
        {
          optional: [
            "definitionCode",
            "startTimestamp",
            "endTimestamp",
            "locale",
            "userIdType",
            "pageSize",
            "pageToken",
          ],
        },
      ),
      outputSchema: listOutputSchema,
    }),
    defineProviderAction(service, {
      name: "approve_approval_task",
      operationType: "write",
      description: "Approve a pending approval task with optional form controls.",
      requiredScopes: [feishuApprovalProviderPermissions.taskWrite],
      providerPermissions: [feishuApprovalProviderPermissions.taskWrite],
      inputSchema: s.object(
        "Identify and approve the task.",
        {
          ...instanceTaskFields,
          form: formSchema,
          comment: commentField,
        },
        {
          optional: ["form", "comment"],
        },
      ),
      outputSchema: writeResultSchema,
    }),
    defineProviderAction(service, {
      name: "reject_approval_task",
      operationType: "destructive",
      description: "Reject a pending approval task.",
      requiredScopes: [feishuApprovalProviderPermissions.taskWrite],
      providerPermissions: [feishuApprovalProviderPermissions.taskWrite],
      inputSchema: s.object(
        "Identify and reject the task.",
        {
          ...instanceTaskFields,
          comment: commentField,
        },
        {
          optional: ["comment"],
        },
      ),
      outputSchema: writeResultSchema,
    }),
    defineProviderAction(service, {
      name: "transfer_approval_task",
      operationType: "write",
      description: "Transfer a pending approval task to another user.",
      requiredScopes: [feishuApprovalProviderPermissions.taskWrite],
      providerPermissions: [feishuApprovalProviderPermissions.taskWrite],
      inputSchema: s.object(
        "Identify the task and its new owner.",
        {
          ...instanceTaskFields,
          transferUserId: s.nonEmptyString("The user ID receiving the task."),
          comment: commentField,
          userIdType: userIdTypeField,
        },
        {
          optional: ["comment", "userIdType"],
        },
      ),
      outputSchema: writeResultSchema,
    }),
    defineProviderAction(service, {
      name: "add_sign_approval_task",
      operationType: "write",
      description: "Add users before, after, or alongside the current approval task.",
      requiredScopes: [feishuApprovalProviderPermissions.taskWrite],
      providerPermissions: [feishuApprovalProviderPermissions.taskWrite],
      inputSchema: s.object(
        "Identify the task and configure the added approvers.",
        {
          ...instanceTaskFields,
          userIds: s.array("The users to add as approvers.", s.nonEmptyString("A user ID."), {
            minItems: 1,
          }),
          addSignType: s.stringEnum("Where the added approval occurs.", ["before", "after", "parallel"]),
          approvalMethod: s.stringEnum("How multiple added users approve.", ["any", "all", "sequential"]),
          comment: commentField,
          userIdType: userIdTypeField,
        },
        {
          optional: ["approvalMethod", "comment", "userIdType"],
        },
      ),
      outputSchema: writeResultSchema,
    }),
    defineProviderAction(service, {
      name: "rollback_approval_task",
      operationType: "destructive",
      description: "Roll back an approval task to one or more earlier nodes.",
      requiredScopes: [feishuApprovalProviderPermissions.taskWrite],
      providerPermissions: [feishuApprovalProviderPermissions.taskWrite],
      inputSchema: s.object(
        "Identify the task and rollback target nodes.",
        {
          ...instanceTaskFields,
          nodeIds: s.array(
            "The node IDs to roll back to; use START for the initiation node.",
            s.nonEmptyString("A target node ID."),
            { minItems: 1 },
          ),
          comment: commentField,
        },
        {
          optional: ["comment"],
        },
      ),
      outputSchema: writeResultSchema,
    }),
    defineProviderAction(service, {
      name: "remind_approval_tasks",
      operationType: "write",
      description: "Send reminders for one or more tasks in an approval instance.",
      requiredScopes: [feishuApprovalProviderPermissions.instanceWrite],
      providerPermissions: [feishuApprovalProviderPermissions.instanceWrite],
      inputSchema: s.object(
        "Identify the instance and tasks to remind.",
        {
          instanceCode: instanceCodeField,
          taskIds: s.array("The task IDs to remind.", taskIdField, { minItems: 1 }),
          comment: commentField,
        },
        {
          optional: ["comment"],
        },
      ),
      outputSchema: writeResultSchema,
    }),
  ];
}
