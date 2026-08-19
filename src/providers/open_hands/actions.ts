import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "open_hands";

const trimmedString = (description: string) => s.string(description, { minLength: 1 });
const nullableTrimmedString = (description: string) => s.nullable(trimmedString(description));

const startTaskStatusSchema = s.stringEnum("OpenHands start task status.", [
  "WORKING",
  "WAITING_FOR_SANDBOX",
  "PREPARING_REPOSITORY",
  "RUNNING_SETUP_SCRIPT",
  "SETTING_UP_GIT_HOOKS",
  "SETTING_UP_SKILLS",
  "STARTING_CONVERSATION",
  "READY",
  "ERROR",
]);

const sandboxStatusSchema = s.stringEnum("OpenHands sandbox status.", [
  "STARTING",
  "RUNNING",
  "PAUSED",
  "ERROR",
  "MISSING",
]);

const executionStatusSchema = s.nullable(
  s.stringEnum("OpenHands agent execution status when the sandbox is running.", [
    "idle",
    "running",
    "paused",
    "waiting_for_confirmation",
    "finished",
    "error",
    "stuck",
    "deleting",
  ]),
);

const startTaskSchema = s.looseRequiredObject(
  "OpenHands conversation start task.",
  {
    id: trimmedString("Start task ID returned by OpenHands."),
    status: startTaskStatusSchema,
    detail: nullableTrimmedString("Additional start task detail when OpenHands returned one."),
    app_conversation_id: nullableTrimmedString("Conversation ID once the start task reaches READY."),
    sandbox_id: nullableTrimmedString("Sandbox ID once the start task has a sandbox."),
    agent_server_url: nullableTrimmedString("Agent server URL when OpenHands returned one."),
    created_at: s.dateTime("Timestamp when the start task was created."),
    updated_at: s.dateTime("Timestamp when the start task was last updated."),
  },
  { optional: [] },
);

const conversationSchema = s.looseRequiredObject(
  "OpenHands app conversation.",
  {
    id: trimmedString("OpenHands conversation ID."),
    sandbox_id: nullableTrimmedString("Sandbox ID for the conversation."),
    selected_repository: nullableTrimmedString("Repository selected for the conversation."),
    selected_branch: nullableTrimmedString("Branch selected for the conversation."),
    title: nullableTrimmedString("Conversation title."),
    sandbox_status: sandboxStatusSchema,
    execution_status: executionStatusSchema,
    conversation_url: nullableTrimmedString("URL where the conversation can be opened."),
    created_at: s.dateTime("Timestamp when the conversation was created."),
    updated_at: s.dateTime("Timestamp when the conversation was last updated."),
  },
  { optional: [] },
);

const paginationOutputSchema = s.actionOutput(
  {
    next_page_id: s.nullable(trimmedString("Next page ID when OpenHands returned one.")),
  },
  "OpenHands page metadata.",
);

const startTaskOutputSchema = s.actionOutput(
  {
    task: startTaskSchema,
    conversation_url: s.nullable(s.url("OpenHands conversation URL when the conversation ID is available.")),
    raw: s.looseObject("Raw OpenHands response payload."),
  },
  "OpenHands start task response.",
);

const conversationOutputSchema = s.actionOutput(
  {
    conversation: s.nullable(conversationSchema),
    raw: s.looseObject("Raw OpenHands response payload."),
  },
  "OpenHands conversation response.",
);

const conversationLifecycle = {
  startActionId: "open_hands.start_conversation",
  statusActionId: "open_hands.get_start_task",
};

export const openHandsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "start_conversation",
    description: "Start an OpenHands Cloud conversation for a repository task.",
    followUpActions: ["open_hands.get_start_task"],
    asyncLifecycle: conversationLifecycle,
    inputSchema: s.object(
      "Input parameters for starting an OpenHands Cloud conversation.",
      {
        message: trimmedString("Initial task message to send to OpenHands."),
        selected_repository: trimmedString("Repository name in owner/repo format."),
        selected_branch: trimmedString("Branch to use for the conversation."),
        title: trimmedString("Optional title for the conversation."),
        llm_model: trimmedString("Optional OpenHands LLM model identifier."),
        system_message_suffix: trimmedString("Optional extra system instructions appended by OpenHands."),
        run: s.boolean("Whether OpenHands should run the agent after creating the message."),
      },
      { optional: ["selected_repository", "selected_branch", "title", "llm_model", "system_message_suffix", "run"] },
    ),
    outputSchema: startTaskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_start_task",
    description: "Get the status of an OpenHands Cloud conversation start task.",
    asyncLifecycle: conversationLifecycle,
    inputSchema: s.actionInput(
      {
        task_id: s.uuid("Start task ID returned by start_conversation."),
      },
      ["task_id"],
      "Input parameters for getting an OpenHands start task.",
    ),
    outputSchema: startTaskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    description: "Get an OpenHands Cloud conversation by ID.",
    inputSchema: s.actionInput(
      {
        conversation_id: s.uuid("OpenHands conversation ID."),
      },
      ["conversation_id"],
      "Input parameters for getting an OpenHands conversation.",
    ),
    outputSchema: conversationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_conversations",
    description: "List OpenHands Cloud conversations with optional filters.",
    inputSchema: s.object(
      "Input parameters for listing OpenHands conversations.",
      {
        title__contains: trimmedString("Only return conversations whose title contains this text."),
        created_at__gte: s.dateTime("Only return conversations created at or after this time."),
        created_at__lt: s.dateTime("Only return conversations created before this time."),
        updated_at__gte: s.dateTime("Only return conversations updated at or after this time."),
        updated_at__lt: s.dateTime("Only return conversations updated before this time."),
        sandbox_id__eq: trimmedString("Only return conversations for this exact sandbox ID."),
        page_id: trimmedString("Next page ID returned by a previous list response."),
        limit: s.integer("Maximum number of conversations to return.", { minimum: 1, maximum: 100 }),
        include_sub_conversations: s.boolean("Whether to include sub-conversations."),
      },
      {
        optional: [
          "title__contains",
          "created_at__gte",
          "created_at__lt",
          "updated_at__gte",
          "updated_at__lt",
          "sandbox_id__eq",
          "page_id",
          "limit",
          "include_sub_conversations",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        items: s.array("OpenHands conversations on this page.", conversationSchema),
        page: paginationOutputSchema,
        raw: s.looseObject("Raw OpenHands response payload."),
      },
      "OpenHands conversation list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a follow-up user message to an existing OpenHands Cloud conversation.",
    inputSchema: s.object(
      "Input parameters for sending an OpenHands follow-up message.",
      {
        conversation_id: s.uuid("OpenHands conversation ID."),
        message: trimmedString("Follow-up message text to send to the conversation."),
        run: s.boolean("Whether OpenHands should automatically run the agent after sending."),
      },
      { optional: ["run"] },
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether OpenHands accepted the message."),
        sandbox_status: sandboxStatusSchema,
        message: s.nullable(trimmedString("Additional response message when OpenHands returned one.")),
        raw: s.looseObject("Raw OpenHands response payload."),
      },
      "OpenHands send message response.",
    ),
  }),
];
