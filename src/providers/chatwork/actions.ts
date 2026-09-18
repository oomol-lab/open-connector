import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chatwork";
const roomId = s.positiveInteger("The Chatwork room ID.");
const taskId = s.positiveInteger("The Chatwork task ID.");
const accountId = s.positiveInteger("The Chatwork account ID.");
const messageId = s.nonEmptyString("The Chatwork message ID.");
const raw = s.looseObject("Chatwork object returned by the API.");
const empty = s.object({}, { description: "This action does not require additional input." });

export const chatworkActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    operationType: "read",
    description: "Get the authenticated Chatwork profile.",
    requiredScopes: [],
    inputSchema: empty,
    outputSchema: s.object({ profile: raw }),
  }),
  defineProviderAction(service, {
    name: "get_contacts",
    operationType: "read",
    description: "List Chatwork contacts visible to the authenticated account.",
    requiredScopes: [],
    inputSchema: empty,
    outputSchema: s.object({ contacts: s.array(raw, { description: "The Chatwork contacts." }) }),
  }),
  defineProviderAction(service, {
    name: "list_rooms",
    operationType: "read",
    description: "List Chatwork rooms visible to the authenticated account.",
    requiredScopes: [],
    inputSchema: empty,
    outputSchema: s.object({ rooms: s.array(raw, { description: "The Chatwork rooms." }) }),
  }),
  defineProviderAction(service, {
    name: "get_room",
    operationType: "read",
    description: "Get metadata for one Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object({ roomId }, { required: ["roomId"] }),
    outputSchema: s.object({ room: raw }),
  }),
  defineProviderAction(service, {
    name: "list_room_members",
    operationType: "read",
    description: "List all members in one Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object({ roomId }, { required: ["roomId"] }),
    outputSchema: s.object({ members: s.array(raw, { description: "The Chatwork room members." }) }),
  }),
  defineProviderAction(service, {
    name: "list_room_messages",
    operationType: "read",
    description: "List messages in one Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object(
      { roomId, force: s.boolean("Whether to force returning the latest 100 messages.") },
      { required: ["roomId"] },
    ),
    outputSchema: s.object({ messages: s.array(raw, { description: "The Chatwork room messages." }) }),
  }),
  defineProviderAction(service, {
    name: "get_message",
    operationType: "read",
    description: "Get one message from a Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object({ roomId, messageId }, { required: ["roomId", "messageId"] }),
    outputSchema: s.object({ message: raw }),
  }),
  defineProviderAction(service, {
    name: "post_message",
    operationType: "write",
    description: "Post a message to a Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        roomId,
        body: s.nonEmptyString("The message body."),
        selfUnread: s.boolean("Whether the posted message should remain unread for the sender."),
      },
      { required: ["roomId", "body"] },
    ),
    outputSchema: s.object({ messageId }),
  }),
  defineProviderAction(service, {
    name: "update_message",
    operationType: "write",
    description: "Update one message in a Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object(
      { roomId, messageId, body: s.nonEmptyString("The updated message body.") },
      { required: ["roomId", "messageId", "body"] },
    ),
    outputSchema: s.object({ messageId }),
  }),
  defineProviderAction(service, {
    name: "delete_message",
    operationType: "destructive",
    description: "Delete one message in a Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object({ roomId, messageId }, { required: ["roomId", "messageId"] }),
    outputSchema: s.object({ messageId }),
  }),
  defineProviderAction(service, {
    name: "list_my_tasks",
    operationType: "read",
    description: "List Chatwork tasks assigned to the authenticated account.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        assignedByAccountId: accountId,
        status: s.stringEnum(["open", "done"], { description: "The task completion status." }),
      },
      { optional: ["assignedByAccountId", "status"] },
    ),
    outputSchema: s.object({ tasks: s.array(raw, { description: "The Chatwork tasks." }) }),
  }),
  defineProviderAction(service, {
    name: "list_room_tasks",
    operationType: "read",
    description: "List tasks in one Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        roomId,
        accountId,
        assignedByAccountId: accountId,
        status: s.stringEnum(["open", "done"], { description: "The task completion status." }),
      },
      { required: ["roomId"] },
    ),
    outputSchema: s.object({ tasks: s.array(raw, { description: "The Chatwork room tasks." }) }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    operationType: "read",
    description: "Get one task from a Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object({ roomId, taskId }, { required: ["roomId", "taskId"] }),
    outputSchema: s.object({ task: raw }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    operationType: "write",
    description: "Create a task in a Chatwork room.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        roomId,
        body: s.nonEmptyString("The task body."),
        assigneeAccountIds: s.array(accountId, { minItems: 1, description: "The assignee Chatwork account IDs." }),
        limitTime: s.positiveInteger("The Unix timestamp deadline."),
        limitType: s.stringEnum(["none", "date", "time"], { description: "The deadline type." }),
      },
      { required: ["roomId", "body", "assigneeAccountIds"] },
    ),
    outputSchema: s.object({ taskIds: s.array(taskId, { description: "The created Chatwork task IDs." }) }),
  }),
  defineProviderAction(service, {
    name: "update_task_status",
    operationType: "write",
    description: "Update the completion status of one Chatwork task.",
    requiredScopes: [],
    inputSchema: s.object(
      { roomId, taskId, status: s.stringEnum(["open", "done"], { description: "The task completion status." }) },
      { required: ["roomId", "taskId", "status"] },
    ),
    outputSchema: s.object({ taskId }),
  }),
];
