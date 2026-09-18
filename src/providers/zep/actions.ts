import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zep";
const metadataSchema = s.looseObject("Arbitrary metadata attached to a Zep resource.");
const timeZoneSchema = s.nullableString("The IANA time zone, or null when no time zone is set.");
const roleSchema = s.stringEnum(["norole", "system", "assistant", "user", "function", "tool"], {
  description: "The role of the message sender.",
});
const projectSchema = s.looseRequiredObject(
  "A Zep project.",
  {
    created_at: s.string("The timestamp when the project was created."),
    default_time_zone: timeZoneSchema,
    description: s.string("The project description."),
    name: s.string("The project name."),
    uuid: s.string("The unique identifier of the project."),
  },
  {
    optional: ["created_at", "default_time_zone", "description", "name", "uuid"],
  },
);
const userSchema = s.looseRequiredObject(
  "A Zep user.",
  {
    created_at: s.string("The timestamp when the user was created."),
    deleted_at: s.nullableString("The timestamp when the user was deleted, or null for an active user."),
    disable_default_ontology: s.boolean("Whether the default ontology is disabled for the user's graph."),
    email: s.string("The user's email address."),
    first_name: s.string("The user's first name."),
    id: s.integer("The internal numeric identifier of the user."),
    last_name: s.string("The user's last name."),
    metadata: metadataSchema,
    project_uuid: s.string("The unique identifier of the user's Zep project."),
    session_count: s.integer("The deprecated session count returned by Zep when present."),
    time_zone: timeZoneSchema,
    updated_at: s.string("The deprecated user update timestamp returned by Zep when present."),
    user_id: s.string("The application-defined unique identifier of the user."),
    uuid: s.string("The opaque unique identifier of the user."),
  },
  {
    optional: [
      "created_at",
      "deleted_at",
      "disable_default_ontology",
      "email",
      "first_name",
      "id",
      "last_name",
      "metadata",
      "project_uuid",
      "session_count",
      "time_zone",
      "updated_at",
      "user_id",
      "uuid",
    ],
  },
);
const threadSchema = s.looseRequiredObject(
  "A Zep conversation thread.",
  {
    created_at: s.string("The timestamp when the thread was created."),
    project_uuid: s.string("The unique identifier of the thread's Zep project."),
    thread_id: s.string("The application-defined unique identifier of the thread."),
    user_id: s.string("The application-defined identifier of the associated user."),
    user_uuid: s.string("The opaque identifier of the associated user."),
    uuid: s.string("The opaque unique identifier of the thread."),
  },
  {
    optional: ["created_at", "project_uuid", "thread_id", "user_id", "user_uuid", "uuid"],
  },
);
const messageProperties = {
  content: s.string("The message content."),
  role: roleSchema,
  created_at: s.string("The timestamp when the message was created."),
  metadata: metadataSchema,
  name: s.string("The customizable name of the message sender."),
  processed: s.boolean("Whether Zep has processed the message."),
  uuid: s.string("The unique identifier of the message."),
};
const messageInputSchema = s.object(
  "A message to add to a Zep conversation thread.",
  {
    ...messageProperties,
    content: s.string({
      maxLength: 4096,
      description: "The message content, limited to 4,096 characters.",
    }),
  },
  { optional: ["created_at", "metadata", "name", "processed", "uuid"] },
);
const messageSchema = s.looseRequiredObject("A message in a Zep conversation thread.", messageProperties, {
  optional: ["created_at", "metadata", "name", "processed", "uuid"],
});
const userIdSchema = s.nonEmptyString("The application-defined unique identifier of the user.", { maxLength: 500 });
const threadIdSchema = s.nonEmptyString("The application-defined unique identifier of the thread.", { maxLength: 500 });
const userMutationFields = {
  email: s.string("The email address of the user."),
  first_name: s.string("The first name of the user."),
  last_name: s.string("The last name of the user."),
  metadata: metadataSchema,
  time_zone: s.nullableString("The user's IANA time zone. Null leaves it unset at creation or clears it on update."),
  disable_default_ontology: s.boolean("Whether to disable the default ontology for the user's graph."),
};
const optionalUserMutationFields = [
  "email",
  "first_name",
  "last_name",
  "metadata",
  "time_zone",
  "disable_default_ontology",
];
const successSchema = s.looseRequiredObject(
  "The acknowledgement returned by Zep.",
  { message: s.string("The acknowledgement message returned by Zep.") },
  { optional: ["message"] },
);

export const zepActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Retrieve the Zep project associated with the connected API key.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: s.looseRequiredObject("The Zep project information response.", { project: projectSchema }),
  }),
  defineProviderAction(service, {
    name: "create_user",
    operationType: "write",
    description: "Create a Zep user that can own conversation threads and graph memory.",
    inputSchema: s.object(
      "The input for creating a Zep user.",
      { user_id: userIdSchema, ...userMutationFields },
      { optional: optionalUserMutationFields },
    ),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Zep users with pagination, search, and ordering controls.",
    inputSchema: s.object(
      "The filters and pagination options for listing Zep users.",
      {
        pageNumber: s.positiveInteger("The page number for pagination, starting from 1."),
        pageSize: s.integer("The number of users to retrieve per page."),
        search: s.string("The term used to filter users by user ID, name, or email."),
        order_by: s.stringEnum(["created_at", "user_id", "email"], {
          description: "The field used to order users.",
        }),
        asc: s.boolean("Whether to sort results in ascending order."),
      },
      { optional: ["pageNumber", "pageSize", "search", "order_by", "asc"] },
    ),
    outputSchema: s.looseRequiredObject("A paginated Zep user response.", {
      row_count: s.integer("The number of users returned in this page."),
      total_count: s.integer("The total number of users."),
      users: s.array("The users in this page.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Retrieve one Zep user by its application-defined identifier.",
    inputSchema: s.requiredObject("The input identifying a Zep user.", {
      user_id: userIdSchema,
    }),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    operationType: "write",
    description: "Update the profile, metadata, time zone, or ontology setting of a Zep user.",
    inputSchema: s.object(
      "The input for updating a Zep user.",
      { user_id: userIdSchema, ...userMutationFields },
      { optional: optionalUserMutationFields },
    ),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description: "Delete a Zep user and the threads and graph artifacts associated with that user.",
    inputSchema: s.requiredObject("The input identifying a Zep user.", {
      user_id: userIdSchema,
    }),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "create_thread",
    operationType: "write",
    description: "Create a conversation thread for an existing Zep user.",
    inputSchema: s.requiredObject("The input for creating a Zep thread.", {
      thread_id: threadIdSchema,
      user_id: s.nonEmptyString("The identifier of the existing user associated with the thread.", { maxLength: 500 }),
    }),
    outputSchema: threadSchema,
  }),
  defineProviderAction(service, {
    name: "list_threads",
    operationType: "read",
    description: "List Zep conversation threads with pagination and ordering controls.",
    inputSchema: s.object(
      "The pagination and sorting options for listing Zep threads.",
      {
        page_number: s.positiveInteger("The page number for pagination, starting from 1."),
        page_size: s.integer("The number of threads to retrieve per page."),
        order_by: s.stringEnum(["created_at", "updated_at", "user_id", "thread_id"], {
          description: "The field used to order threads.",
        }),
        asc: s.boolean("Whether to sort results in ascending order."),
      },
      { optional: ["page_number", "page_size", "order_by", "asc"] },
    ),
    outputSchema: s.looseRequiredObject("A paginated Zep thread response.", {
      response_count: s.integer("The number of threads returned in this page."),
      threads: s.array("The threads in this page.", threadSchema),
      total_count: s.integer("The total number of threads."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_thread",
    operationType: "destructive",
    description: "Delete a Zep conversation thread and its thread-specific memory.",
    inputSchema: s.requiredObject("The input identifying a Zep thread.", {
      thread_id: threadIdSchema,
    }),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "add_thread_messages",
    operationType: "write",
    description:
      "Add chat messages to a Zep thread, ingest them into the user's graph, and optionally return current context.",
    inputSchema: s.object(
      "The input for adding messages to a Zep thread and its user graph.",
      {
        thread_id: s.nonEmptyString("The unique identifier of the target thread.", { maxLength: 500 }),
        messages: s.array("The messages to add in chronological order.", messageInputSchema, {
          minItems: 1,
          maxItems: 30,
        }),
        ignore_roles: s.array("The roles to retain as messages but ignore for graph-memory extraction.", roleSchema),
        return_context: s.boolean("Whether to return context relevant to the most recent messages."),
        strict_ontology: s.boolean(
          "Whether to prevent extraction of generic entities that do not match the configured ontology.",
        ),
      },
      { optional: ["ignore_roles", "return_context", "strict_ontology"] },
    ),
    outputSchema: s.looseRequiredObject(
      "The result of adding messages to a Zep thread.",
      {
        context: s.string("The context relevant to the most recent messages, when requested."),
        message_uuids: s.array(
          "The unique identifiers assigned to the added messages.",
          s.string("A message unique identifier."),
        ),
        task_id: s.string("The identifier of the upstream graph-processing task."),
      },
      { optional: ["context", "message_uuids", "task_id"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_thread_messages",
    operationType: "read",
    description: "Retrieve messages from a Zep thread with cursor or recent-message controls.",
    inputSchema: s.object(
      "The input for retrieving messages from a Zep thread.",
      {
        thread_id: s.nonEmptyString("The unique identifier of the target thread.", { maxLength: 500 }),
        limit: s.integer("The maximum number of messages to return."),
        cursor: s.integer("The pagination cursor."),
        lastn: s.integer("The number of most recent messages to return, overriding limit and cursor."),
      },
      { optional: ["limit", "cursor", "lastn"] },
    ),
    outputSchema: s.looseRequiredObject(
      "A paginated Zep thread message response.",
      {
        messages: s.array("The messages returned for the thread.", messageSchema),
        row_count: s.integer("The number of messages returned."),
        thread_created_at: s.string("The thread creation timestamp."),
        total_count: s.integer("The total number of messages in the thread."),
        user_id: s.string("The application-defined identifier of the thread's user."),
        user_uuid: s.string("The opaque identifier of the thread's user."),
      },
      {
        optional: ["messages", "row_count", "thread_created_at", "total_count", "user_id", "user_uuid"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_thread_context",
    operationType: "read",
    description: "Retrieve the most relevant context from a user's graph for the current Zep thread.",
    inputSchema: s.object(
      "The input for retrieving assembled user context for a Zep thread.",
      {
        thread_id: s.nonEmptyString("The unique identifier of the current thread.", { maxLength: 500 }),
        template_id: s.string("The optional context template identifier used for rendering."),
      },
      { optional: ["template_id"] },
    ),
    outputSchema: s.looseRequiredObject("The assembled Zep context response.", {
      context: s.string("The context block containing relevant facts, entities, and messages from the user graph."),
    }),
  }),
];
