import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "manus";

const nonEmptyString = (description: string): JsonSchema => s.string(description, { minLength: 1 });

const orderSchema = s.stringEnum("Sort direction for cursor-paginated results.", ["asc", "desc"]);
const agentProfileSchema = s.stringEnum("Manus agent profile to use for this task turn.", [
  "manus-1.6",
  "manus-1.6-lite",
  "manus-1.6-max",
]);
const shareVisibilitySchema = s.stringEnum("Task sharing visibility.", ["private", "team", "public"]);
const taskScopeSchema = s.stringEnum("Task list scope filter.", ["all", "agent_subtask", "project", "standard"]);
const slidesFormatSchema = s.stringEnum("Slides attachment format returned in task messages.", ["html", "pptx"]);

const contentPartSchema = s.unknownObject("One Manus message content part.");
const messageContentSchema = s.oneOf(
  [
    nonEmptyString("Plain text message content."),
    s.array("Structured message content parts.", contentPartSchema, { minItems: 1 }),
  ],
  { description: "Plain text or structured Manus content parts." },
);
const stringArraySchema = (description: string, itemDescription: string): JsonSchema =>
  s.array(description, nonEmptyString(itemDescription), { minItems: 1 });

const messageInputFields = {
  content: messageContentSchema,
  connectors: stringArraySchema("Connector IDs to enable for the message.", "Manus connector ID."),
  enable_skills: stringArraySchema("Skill IDs to enable for the message.", "Manus skill ID."),
  force_skills: stringArraySchema("Skill IDs the agent must invoke.", "Manus skill ID."),
};

const messageInputSchema = s.object("Manus task message.", messageInputFields, {
  optional: ["connectors", "enable_skills", "force_skills"],
});
const structuredOutputSchema = s.unknownObject("JSON Schema for Manus structured output extraction.");

const taskSummarySchema = s.looseRequiredObject(
  "Manus task object with current status and metadata.",
  {
    id: s.string("Unique identifier for the task."),
    status: s.stringEnum("Current task status.", ["running", "stopped", "waiting", "error"]),
    created_at: s.integer("Unix timestamp in seconds when the task was created."),
    updated_at: s.integer("Unix timestamp in seconds when the task was last updated."),
    task_type: s.stringEnum("Type of the task.", ["standard", "project", "agent_subtask"]),
    share_visibility: shareVisibilitySchema,
    title: s.string("Title of the task."),
    credit_usage: s.integer("Total credits consumed by the task."),
    task_url: s.url("URL to view the task in the Manus web app."),
    created_by_api_key: s.nullable(s.unknownObject("API key metadata when this task was created via API.")),
    agent_profile: agentProfileSchema,
  },
  { optional: ["credit_usage", "task_url", "created_by_api_key", "agent_profile", "share_visibility"] },
);

const projectSchema = s.looseRequiredObject("Manus project.", {
  id: s.string("Unique identifier for the project."),
  name: s.string("Display name of the project."),
  created_at: s.integer("Unix timestamp in seconds when the project was created."),
  instruction: s.string("Default instruction applied to tasks in this project."),
});
const skillSchema = s.looseRequiredObject(
  "Manus skill that extends agent capabilities.",
  {
    id: s.string("Unique identifier for the skill."),
    name: s.string("Display name of the skill."),
    description: s.string("What the skill does and when it is useful."),
    owner_type: s.stringEnum("Skill owner type.", ["personal", "official", "team", "project"]),
    creator_info: s.unknownObject("Information about who created the skill."),
    created_at: s.integer("Unix timestamp in seconds when the skill was created."),
    updated_at: s.integer("Unix timestamp in seconds when the skill was last updated."),
  },
  { optional: ["description", "creator_info", "created_at", "updated_at"] },
);
const connectorSchema = s.looseRequiredObject(
  "Manus connector available to the current user.",
  {
    id: s.string("Unique identifier for the connector."),
    name: s.string("Display name of the connector."),
    type: s.stringEnum("Connector type.", ["builtin", "byok", "mcp"]),
    description: s.string("Human-readable description of the connector."),
    category: s.string("Category grouping for the connector."),
  },
  { optional: ["description", "category"] },
);
const agentSchema = s.looseRequiredObject("Manus custom agent.", {
  id: s.string("Unique identifier for the agent."),
  task_id: s.string("Task ID associated with this agent."),
  nickname: s.string("Display name of the agent."),
  about: s.string("Description or bio of the agent."),
});
const browserClientSchema = s.looseRequiredObject("Online Manus browser client.", {
  client_id: s.string("Unique identifier for the browser client."),
  client_name: s.string("Display name of the browser client."),
  ua: s.string("User-Agent string for the browser client."),
});

const okBaseFields = {
  ok: s.boolean("Whether the request was successful."),
  request_id: s.string("Unique identifier for this API request."),
};
const taskCreateOutputSchema = s.looseRequiredObject(
  "Result returned after creating a Manus task.",
  {
    ...okBaseFields,
    task_id: s.string("Unique identifier for the created task."),
    task_title: s.string("Title for the created task."),
    task_url: s.url("URL to view the task in the Manus web app."),
    share_url: s.url("Public share URL when the task is shareable."),
    share_visibility: shareVisibilitySchema,
  },
  { optional: ["share_url", "share_visibility"] },
);
const taskUpdateOutputSchema = s.looseRequiredObject(
  "Result returned after updating a Manus task.",
  {
    ...okBaseFields,
    task_id: s.string("The ID of the updated task."),
    task_title: s.string("The current title of the task."),
    task_url: s.url("URL to view the task in the Manus web app."),
    share_url: s.url("Public share URL when the task is shareable."),
    share_visibility: shareVisibilitySchema,
  },
  { optional: ["share_url", "share_visibility"] },
);
const okOutputSchema = s.looseRequiredObject("Standard Manus success response.", okBaseFields);
const taskIdOutputSchema = s.looseRequiredObject("Manus response containing a task ID.", {
  ...okBaseFields,
  task_id: s.string("Unique identifier for the task."),
});
const taskConfirmOutputSchema = s.looseRequiredObject("Result returned after confirming a pending Manus task action.", {
  ...okBaseFields,
  task_id: s.string("The ID of the confirmed task."),
  confirmed: s.boolean("Whether the pending action confirmation was accepted."),
});
const taskDeleteOutputSchema = s.looseRequiredObject("Result returned after deleting a Manus task.", {
  ...okBaseFields,
  id: s.string("The ID of the deleted task."),
  deleted: s.boolean("Whether the task was deleted."),
});
const taskDetailOutputSchema = s.looseRequiredObject("Task detail response from Manus.", {
  ...okBaseFields,
  task: taskSummarySchema,
});
const taskListOutputSchema = s.looseRequiredObject(
  "Cursor-paginated Manus task list response.",
  {
    ...okBaseFields,
    data: s.array("Tasks matching the filter criteria.", taskSummarySchema),
    has_more: s.boolean("Whether more tasks are available."),
    next_cursor: s.string("Cursor to fetch the next page."),
  },
  { optional: ["next_cursor"] },
);
const taskMessagesOutputSchema = s.looseRequiredObject(
  "Cursor-paginated Manus task event response.",
  {
    ...okBaseFields,
    task_id: s.string("The task ID these messages belong to."),
    messages: s.array(
      "Task event objects representing conversation and agent activity.",
      s.unknownObject("Manus task event."),
    ),
    has_more: s.boolean("Whether more messages are available."),
    next_cursor: s.string("Cursor to fetch the next page."),
  },
  { optional: ["next_cursor"] },
);
const projectCreateOutputSchema = s.looseRequiredObject("Result returned after creating a Manus project.", {
  ...okBaseFields,
  project: projectSchema,
});
const projectListOutputSchema = s.looseRequiredObject("Manus project list response.", {
  ...okBaseFields,
  data: s.array("Project objects.", projectSchema),
});
const connectorListOutputSchema = s.looseRequiredObject("Manus connector list response.", {
  ...okBaseFields,
  data: s.array("Connector objects installed in the user account.", connectorSchema),
});
const skillListOutputSchema = s.looseRequiredObject("Manus skill list response.", {
  ...okBaseFields,
  data: s.array("Skill objects available to the user.", skillSchema),
});
const agentListOutputSchema = s.looseRequiredObject("Manus agent list response.", {
  ...okBaseFields,
  data: s.array("Agent objects.", agentSchema),
});
const agentDetailOutputSchema = s.looseRequiredObject("Manus agent detail response.", {
  ...okBaseFields,
  agent: agentSchema,
});
const browserClientListOutputSchema = s.looseRequiredObject("Manus online browser client list response.", {
  ...okBaseFields,
  data: s.array("Online browser clients available to the current account.", browserClientSchema),
});

const createTaskInputSchema = {
  ...s.object(
    "Input parameters for creating a Manus task.",
    {
      ...messageInputFields,
      message: messageInputSchema,
      project_id: nonEmptyString("Project ID to associate this task with."),
      locale: nonEmptyString("Locale for the task output language, such as `en` or `zh-CN`."),
      interactive_mode: s.boolean("Whether the agent may pause to ask follow-up questions."),
      hide_in_task_list: s.boolean("Whether to hide the task from the Manus web app task list."),
      share_visibility: shareVisibilitySchema,
      agent_profile: agentProfileSchema,
      title: nonEmptyString("Custom title for the task."),
      structured_output_schema: structuredOutputSchema,
    },
    {
      optional: [
        "content",
        "message",
        "connectors",
        "enable_skills",
        "force_skills",
        "project_id",
        "locale",
        "interactive_mode",
        "hide_in_task_list",
        "share_visibility",
        "agent_profile",
        "title",
        "structured_output_schema",
      ],
    },
  ),
  anyOf: [{ required: ["message"] }, { required: ["content"] }],
} satisfies JsonSchema;

const sendMessageInputSchema = {
  ...s.object(
    "Input parameters for sending a follow-up Manus task message.",
    {
      task_id: nonEmptyString("The task ID to send the message to."),
      ...messageInputFields,
      message: messageInputSchema,
      agent_profile: agentProfileSchema,
      structured_output_schema: structuredOutputSchema,
    },
    {
      optional: [
        "content",
        "message",
        "connectors",
        "enable_skills",
        "force_skills",
        "agent_profile",
        "structured_output_schema",
      ],
    },
  ),
  anyOf: [{ required: ["message"] }, { required: ["content"] }],
} satisfies JsonSchema;

export const manusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_task",
    description:
      "Create a new asynchronous Manus task from a message and optional project, connector, skill, sharing, or structured-output settings.",
    followUpActions: ["manus.list_task_messages", "manus.get_task"],
    inputSchema: createTaskInputSchema,
    outputSchema: taskCreateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Retrieve a Manus task's current status and metadata.",
    inputSchema: s.object("Input parameters for retrieving a Manus task.", {
      task_id: nonEmptyString("The task ID to retrieve, including supported Manus shortcuts."),
    }),
    outputSchema: taskDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Manus tasks with optional scope filters and cursor pagination.",
    inputSchema: s.object(
      "Input parameters for listing Manus tasks.",
      {
        limit: s.integer("Number of tasks to return per page, from 1 to 100.", { minimum: 1, maximum: 100 }),
        cursor: nonEmptyString("Pagination cursor from the previous response."),
        order: orderSchema,
        scope: taskScopeSchema,
        agent_id: nonEmptyString("Agent ID used when scope is `agent_subtask`."),
        project_id: nonEmptyString("Project ID used when scope is `project`."),
      },
      { optional: ["limit", "cursor", "order", "scope", "agent_id", "project_id"] },
    ),
    outputSchema: taskListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_task_messages",
    description: "List Manus task event messages with cursor pagination.",
    inputSchema: s.object(
      "Input parameters for listing Manus task messages.",
      {
        task_id: nonEmptyString("The task ID to list messages for."),
        limit: s.integer("Number of messages to return per page, from 1 to 200.", { minimum: 1, maximum: 200 }),
        cursor: nonEmptyString("Pagination cursor from the previous response."),
        order: orderSchema,
        verbose: s.boolean("Whether to include detailed tool, plan, and explanation events."),
        slides_format: slidesFormatSchema,
      },
      { optional: ["limit", "cursor", "order", "verbose", "slides_format"] },
    ),
    outputSchema: taskMessagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a follow-up message to an existing Manus task.",
    followUpActions: ["manus.list_task_messages"],
    inputSchema: sendMessageInputSchema,
    outputSchema: taskIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "stop_task",
    description: "Stop a running Manus task.",
    inputSchema: s.object("Input parameters for stopping a Manus task.", {
      task_id: nonEmptyString("The running task ID to stop."),
    }),
    outputSchema: okOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Permanently delete a stopped Manus task. Stop a running task before deleting it.",
    inputSchema: s.object("Input parameters for deleting a Manus task.", {
      task_id: nonEmptyString("The task ID to delete."),
    }),
    outputSchema: taskDeleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a Manus task title, sharing visibility, or task-list visibility.",
    inputSchema: s.object(
      "Input parameters for updating Manus task metadata.",
      {
        task_id: nonEmptyString("The task ID to update."),
        title: nonEmptyString("New title for the task."),
        share_visibility: shareVisibilitySchema,
        enable_visible_in_task_list: s.boolean("Whether the task appears in the Manus web app task list."),
      },
      { optional: ["title", "share_visibility", "enable_visible_in_task_list"] },
    ),
    outputSchema: taskUpdateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "confirm_task_action",
    description:
      "Confirm a pending Manus task action from a waiting status event. Use send_message instead for messageAskUser events.",
    followUpActions: ["manus.list_task_messages"],
    inputSchema: s.object(
      "Input parameters for confirming a pending Manus task action.",
      {
        task_id: nonEmptyString("The task ID with a pending action."),
        event_id: nonEmptyString("The waiting_for_event_id value from the status update event."),
        input: s.unknownObject("Optional input for the pending action, matching the event confirm_input_schema."),
      },
      { optional: ["input"] },
    ),
    outputSchema: taskConfirmOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Manus project for grouping tasks under shared instructions.",
    inputSchema: s.object(
      "Input parameters for creating a Manus project.",
      {
        name: nonEmptyString("Display name for the project."),
        instruction: nonEmptyString("Default instruction applied to tasks in this project."),
      },
      { optional: ["instruction"] },
    ),
    outputSchema: projectCreateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Manus projects available to the current account.",
    inputSchema: s.object("Input parameters for listing Manus projects.", {}),
    outputSchema: projectListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_connectors",
    description: "List Manus connectors installed in the current account.",
    inputSchema: s.object("Input parameters for listing Manus connectors.", {}),
    outputSchema: connectorListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_skills",
    description: "List Manus skills available to the current account or project.",
    inputSchema: s.object(
      "Input parameters for listing Manus skills.",
      {
        project_id: nonEmptyString("Project ID used to include project-specific skills."),
      },
      { optional: ["project_id"] },
    ),
    outputSchema: skillListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_agents",
    description: "List Manus custom agents in the current account.",
    inputSchema: s.object("Input parameters for listing Manus agents.", {}),
    outputSchema: agentListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_agent",
    description: "Retrieve a Manus custom agent by ID.",
    inputSchema: s.object("Input parameters for retrieving a Manus agent.", {
      agent_id: nonEmptyString("The agent ID to retrieve."),
    }),
    outputSchema: agentDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_agent",
    description: "Update a Manus custom agent's display name or description.",
    inputSchema: s.object(
      "Input parameters for updating a Manus agent.",
      {
        agent_id: nonEmptyString("The agent ID to update."),
        nickname: nonEmptyString("New display name for the agent."),
        about: nonEmptyString("New description or bio for the agent."),
      },
      { optional: ["nickname", "about"] },
    ),
    outputSchema: agentDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_online_browser_clients",
    description: "List online Manus browser clients that can be selected when confirming browser connection events.",
    inputSchema: s.object("Input parameters for listing online Manus browser clients.", {}),
    outputSchema: browserClientListOutputSchema,
  }),
];
