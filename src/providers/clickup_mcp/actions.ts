import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clickup_mcp";
const readScope = ["read"];
const writeScope = ["write"];
const resultSchema = s.object("The ClickUp MCP tool response.", {
  result: s.unknown("The normalized structured result, text, or MCP content returned by ClickUp."),
});

function action(
  name: string,
  description: string,
  requiredScopes: string[],
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes,
    inputSchema: s.object(`Arguments for the ClickUp MCP ${name} tool.`, properties, {
      optional: Object.keys(properties).filter((key) => !required.includes(key)),
    }),
    outputSchema: resultSchema,
  });
}

const taskReferenceFields: Record<string, JsonSchema> = {
  task_id: s.nonEmptyString("The ClickUp task ID, including a custom ID when configured."),
};

export const clickupMcpActions: ActionDefinition[] = [
  action(
    "search_workspace",
    "Search tasks, Lists, Folders, and Docs across the authorized ClickUp Workspaces.",
    readScope,
    {
      keywords: s.nonEmptyString("Keywords to search for."),
      count: s.number("The maximum number of results to return on this page."),
      cursor: s.string("The cursor returned by the previous page."),
      workspace_id: s.string("The Workspace ID when the connection authorizes multiple Workspaces.", {
        pattern: "^\\d+$",
      }),
    },
  ),
  action(
    "get_task",
    "Get one ClickUp task, optionally including normally summarized sections.",
    readScope,
    {
      ...taskReferenceFields,
      include: s.array(
        "Sections to expand in the response.",
        s.stringEnum("One task section.", [
          "attachments",
          "checklists",
          "custom_fields",
          "dependencies",
          "description",
          "linked_tasks",
          "subtasks",
          "watchers",
        ]),
      ),
      expand_statuses: s.boolean("Whether to include the statuses available for this task's List."),
      workspace_id: s.string("The Workspace ID when the connection authorizes multiple Workspaces.", {
        pattern: "^\\d+$",
      }),
    },
    ["task_id"],
  ),
  action(
    "get_workspace_hierarchy",
    "Get the authorized ClickUp Workspace hierarchy of Spaces, Folders, and Lists.",
    readScope,
    {
      cursor: s.string("The cursor returned by the previous page."),
      limit: s.number("The maximum number of Spaces to return.", { minimum: 1, maximum: 50 }),
      max_depth: s.stringEnum("The hierarchy depth: Spaces only, Folders, or Lists.", ["0", "1", "2"]),
      space_ids: s.array("Only return these Space IDs.", s.nonEmptyString("One Space ID.")),
      workspace_id: s.string("The Workspace ID when the connection authorizes multiple Workspaces.", {
        pattern: "^\\d+$",
      }),
    },
  ),
  action("get_workspace_members", "List members and guests in an authorized ClickUp Workspace.", readScope, {
    workspace_id: s.string("The Workspace ID when the connection authorizes multiple Workspaces.", {
      pattern: "^\\d+$",
    }),
  }),
  action(
    "create_task",
    "Create a task in a ClickUp List.",
    writeScope,
    {
      name: s.nonEmptyString("The task name."),
      list_id: s.nonEmptyString("The destination ClickUp List ID."),
      markdown_description: s.string("The task description in Markdown."),
      assignees: s.array("ClickUp user IDs to assign.", s.nonEmptyString("One user ID.")),
      due_date: s.string("The due date as YYYY-MM-DD or YYYY-MM-DD HH:MM."),
      start_date: s.string("The start date as YYYY-MM-DD or YYYY-MM-DD HH:MM."),
      priority: s.stringEnum("The task priority.", ["urgent", "high", "normal", "low"]),
      status: s.nonEmptyString("A status available in the destination List."),
      tags: s.array("Existing tag names to apply.", s.nonEmptyString("One tag name.")),
      workspace_id: s.string("The Workspace ID when the connection authorizes multiple Workspaces.", {
        pattern: "^\\d+$",
      }),
    },
    ["name", "list_id"],
  ),
  action(
    "update_task",
    "Update the properties of an existing ClickUp task.",
    writeScope,
    {
      ...taskReferenceFields,
      name: s.nonEmptyString("The updated task name."),
      markdown_description: s.string("The updated task description in Markdown."),
      assignees: s.array("Replacement ClickUp user IDs.", s.nonEmptyString("One user ID.")),
      due_date: s.string("The updated due date, or `none` to clear it."),
      start_date: s.string("The updated start date, or `none` to clear it."),
      priority: s.stringEnum("The updated task priority, or `none` to clear it.", [
        "urgent",
        "high",
        "normal",
        "low",
        "none",
      ]),
      status: s.nonEmptyString("The updated task status."),
      workspace_id: s.string("The Workspace ID when the connection authorizes multiple Workspaces.", {
        pattern: "^\\d+$",
      }),
    },
    ["task_id"],
  ),
  action(
    "create_task_comment",
    "Add a comment to a ClickUp task.",
    writeScope,
    {
      entity_type: s.stringEnum("The type of ClickUp entity receiving the comment.", ["task", "list", "view"]),
      entity_id: s.nonEmptyString("The target task, List, or view ID."),
      comment_text: s.string("The comment text, with Markdown supported unless it contains a mention.", {
        minLength: 1,
        maxLength: 40_000,
      }),
      reply_to_id: s.string("The parent comment ID when creating a threaded reply."),
      notify_all: s.boolean("Whether to notify every assignee."),
      workspace_id: s.string("The Workspace ID when the connection authorizes multiple Workspaces.", {
        pattern: "^\\d+$",
      }),
    },
    ["comment_text"],
  ),
  action(
    "send_chat_message",
    "Send a message to a ClickUp Chat channel.",
    writeScope,
    {
      channel_id: s.nonEmptyString("The ClickUp Chat channel ID."),
      content: s.nonEmptyString("The message content."),
      parent_message_id: s.string("The parent message ID when sending a threaded reply."),
      type: s.stringEnum("The chat item type.", ["message", "post"]),
      content_format: s.stringEnum("The content format.", ["text/md", "text/plain"]),
      workspace_id: s.string("The Workspace ID when the connection authorizes multiple Workspaces.", {
        pattern: "^\\d+$",
      }),
    },
    ["channel_id", "content"],
  ),
];
