import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "griptape";

const rawObjectSchema = s.looseObject("A raw Griptape Cloud object.");
const rawValueSchema = s.unknown("A raw Griptape Cloud JSON value.");
const idArraySchema = (description: string) =>
  s.array(description, s.string("One Griptape Cloud resource ID.", { minLength: 1 }));
const paginationInputSchema = {
  page: s.positiveInteger("The page number to request."),
  page_size: s.positiveInteger("The number of records to request per page."),
};
const paginationSchema = s.looseObject("Pagination metadata returned by Griptape Cloud.", {
  page_number: s.number("The current page number."),
  page_size: s.number("The number of records per page."),
  total_count: s.number("The total number of records."),
  total_pages: s.number("The total number of pages."),
  next_page: s.number("The next page number, if one exists."),
  previous_page: s.number("The previous page number, if one exists."),
});
const organizationSchema = s.looseObject("A Griptape Cloud organization.", {
  organization_id: s.string("The Griptape Cloud organization ID.", { minLength: 1 }),
  name: s.string("The organization name."),
  description: s.string("The organization description."),
  default_bucket_id: s.string("The default bucket ID for the organization."),
  entitlement: s.string("The organization entitlement tier."),
  created_at: s.dateTime("The organization creation timestamp."),
  created_by: s.string("The user that created the organization."),
  updated_at: s.dateTime("The organization update timestamp."),
  model_config: rawObjectSchema,
});
const assistantSchema = s.looseObject("A Griptape Cloud assistant.", {
  assistant_id: s.string("The Griptape Cloud assistant ID.", { minLength: 1 }),
  name: s.string("The assistant name."),
  description: s.string("The assistant description."),
  input: s.string("Default input instructions for the assistant."),
  model: s.string("The model configured for the assistant."),
  organization_id: s.string("The organization ID that owns the assistant."),
  knowledge_base_ids: idArraySchema("Knowledge base IDs attached to the assistant."),
  retriever_ids: idArraySchema("Retriever IDs attached to the assistant."),
  ruleset_ids: idArraySchema("Ruleset IDs attached to the assistant."),
  structure_ids: idArraySchema("Structure IDs attached to the assistant."),
  tool_ids: idArraySchema("Tool IDs attached to the assistant."),
  created_at: s.dateTime("The assistant creation timestamp."),
  created_by: s.string("The user that created the assistant."),
  updated_at: s.dateTime("The assistant update timestamp."),
});
const assistantRunStatusSchema = s.stringEnum("The assistant run status.", [
  "QUEUED",
  "STARTING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "ERROR",
  "CANCELLED",
]);
const assistantRunSchema = s.looseObject("A Griptape Cloud assistant run.", {
  assistant_run_id: s.string("The Griptape Cloud assistant run ID.", { minLength: 1 }),
  assistant_id: s.string("The assistant ID associated with this run.", { minLength: 1 }),
  args: s.array("Arguments passed to the assistant run.", s.string("One assistant run argument.")),
  input: s.string("Input text passed to the assistant run."),
  output: rawValueSchema,
  model: s.string("The model used for the assistant run."),
  status: assistantRunStatusSchema,
  status_detail: rawValueSchema,
  stream: s.boolean("Whether the assistant run was requested as a streaming run."),
  thread_id: s.string("The thread ID associated with the assistant run."),
  knowledge_base_ids: idArraySchema("Knowledge base IDs used by the assistant run."),
  retriever_ids: idArraySchema("Retriever IDs used by the assistant run."),
  ruleset_ids: idArraySchema("Ruleset IDs used by the assistant run."),
  structure_ids: idArraySchema("Structure IDs used by the assistant run."),
  tool_ids: idArraySchema("Tool IDs used by the assistant run."),
  completed_at: s.nullable(s.dateTime("The assistant run completion timestamp.")),
  created_at: s.dateTime("The assistant run creation timestamp."),
  created_by: s.string("The user that created the assistant run."),
  updated_at: s.dateTime("The assistant run update timestamp."),
});
const assistantEventSchema = s.looseObject("A Griptape Cloud assistant event.", {
  event_id: s.string("The Griptape Cloud event ID.", { minLength: 1 }),
  assistant_run_id: s.string("The assistant run ID associated with this event.", { minLength: 1 }),
  type: s.string("The event type."),
  origin: s.string("The event origin."),
  payload: rawValueSchema,
  timestamp: s.number("The event timestamp."),
  created_at: s.dateTime("The event creation timestamp."),
});
const assistantInputProperties = {
  name: s.string("The assistant name.", { minLength: 1, maxLength: 200 }),
  description: s.string("The assistant description.", { minLength: 1, maxLength: 200 }),
  input: s.string("Default input instructions for the assistant."),
  model: s.string("The model to use for the assistant."),
  knowledge_base_ids: idArraySchema("Knowledge base IDs to attach to the assistant."),
  retriever_ids: idArraySchema("Retriever IDs to attach to the assistant."),
  ruleset_ids: idArraySchema("Ruleset IDs to attach to the assistant."),
  structure_ids: idArraySchema("Structure IDs to attach to the assistant."),
  tool_ids: idArraySchema("Tool IDs to attach to the assistant."),
};
const assistantRunInputProperties = {
  input: s.string("Input text for the assistant run."),
  args: s.array("Arguments for the assistant run.", s.string("One assistant run argument.")),
  model: s.string("The model to use for this run."),
  new_thread: s.boolean("Whether Griptape Cloud should create a new thread for this run."),
  thread_id: s.string("The existing thread ID to associate with this run.", { minLength: 1 }),
  knowledge_base_ids: idArraySchema("Knowledge base IDs to use for this run."),
  additional_knowledge_base_ids: idArraySchema("Additional knowledge base IDs for this run."),
  retriever_ids: idArraySchema("Retriever IDs to use for this run."),
  additional_retriever_ids: idArraySchema("Additional retriever IDs for this run."),
  ruleset_ids: idArraySchema("Ruleset IDs to use for this run."),
  additional_ruleset_ids: idArraySchema("Additional ruleset IDs for this run."),
  structure_ids: idArraySchema("Structure IDs to use for this run."),
  additional_structure_ids: idArraySchema("Additional structure IDs for this run."),
  tool_ids: idArraySchema("Tool IDs to use for this run."),
  additional_tool_ids: idArraySchema("Additional tool IDs for this run."),
};

export const griptapeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List Griptape Cloud organizations accessible to the API key.",
    inputSchema: s.object("The input payload for listing Griptape Cloud organizations.", {}),
    outputSchema: s.object("The response returned when listing Griptape Cloud organizations.", {
      organizations: s.array("Accessible Griptape Cloud organizations.", organizationSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Retrieve one Griptape Cloud organization by ID.",
    inputSchema: s.object("The input payload for retrieving a Griptape Cloud organization.", {
      organization_id: s.string("The Griptape Cloud organization ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("The response returned when retrieving a Griptape Cloud organization.", {
      organization: organizationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_assistants",
    description: "List Griptape Cloud assistants with optional pagination.",
    inputSchema: s.object("The input payload for listing Griptape Cloud assistants.", paginationInputSchema, {
      optional: ["page", "page_size"],
    }),
    outputSchema: s.object("The response returned when listing Griptape Cloud assistants.", {
      assistants: s.array("Griptape Cloud assistants.", assistantSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_assistant",
    description: "Create a Griptape Cloud assistant.",
    inputSchema: s.object("The input payload for creating a Griptape Cloud assistant.", assistantInputProperties, {
      optional: [
        "description",
        "input",
        "model",
        "knowledge_base_ids",
        "retriever_ids",
        "ruleset_ids",
        "structure_ids",
        "tool_ids",
      ],
    }),
    outputSchema: s.object("The response returned when creating a Griptape Cloud assistant.", {
      assistant: assistantSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_assistant",
    description: "Retrieve one Griptape Cloud assistant by ID.",
    inputSchema: s.object("The input payload for retrieving a Griptape Cloud assistant.", {
      assistant_id: s.string("The Griptape Cloud assistant ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("The response returned when retrieving a Griptape Cloud assistant.", {
      assistant: assistantSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_assistant",
    description: "Update a Griptape Cloud assistant.",
    inputSchema: s.object(
      "The input payload for updating a Griptape Cloud assistant.",
      {
        assistant_id: s.string("The Griptape Cloud assistant ID.", { minLength: 1 }),
        ...assistantInputProperties,
      },
      {
        optional: [
          "name",
          "description",
          "input",
          "model",
          "knowledge_base_ids",
          "retriever_ids",
          "ruleset_ids",
          "structure_ids",
          "tool_ids",
        ],
      },
    ),
    outputSchema: s.object("The response returned when updating a Griptape Cloud assistant.", {
      assistant: assistantSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_assistant",
    description: "Delete a Griptape Cloud assistant.",
    inputSchema: s.object("The input payload for deleting a Griptape Cloud assistant.", {
      assistant_id: s.string("The Griptape Cloud assistant ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("The response returned when deleting a Griptape Cloud assistant.", {
      deleted: s.boolean("Whether the assistant was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_assistant_runs",
    description: "List runs for a Griptape Cloud assistant.",
    inputSchema: s.object(
      "The input payload for listing Griptape Cloud assistant runs.",
      {
        assistant_id: s.string("The Griptape Cloud assistant ID.", { minLength: 1 }),
        ...paginationInputSchema,
        status: s.array("Assistant run statuses to filter by.", assistantRunStatusSchema, { minItems: 1 }),
      },
      { optional: ["page", "page_size", "status"] },
    ),
    outputSchema: s.object("The response returned when listing Griptape Cloud assistant runs.", {
      assistant_runs: s.array("Griptape Cloud assistant runs.", assistantRunSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_assistant_run",
    description: "Create a run for a Griptape Cloud assistant.",
    inputSchema: s.object(
      "The input payload for creating a Griptape Cloud assistant run.",
      {
        assistant_id: s.string("The Griptape Cloud assistant ID.", { minLength: 1 }),
        ...assistantRunInputProperties,
      },
      {
        optional: [
          "input",
          "args",
          "model",
          "new_thread",
          "thread_id",
          "knowledge_base_ids",
          "additional_knowledge_base_ids",
          "retriever_ids",
          "additional_retriever_ids",
          "ruleset_ids",
          "additional_ruleset_ids",
          "structure_ids",
          "additional_structure_ids",
          "tool_ids",
          "additional_tool_ids",
        ],
      },
    ),
    outputSchema: s.object("The response returned when creating a Griptape Cloud assistant run.", {
      assistant_run: assistantRunSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_assistant_run",
    description: "Retrieve one Griptape Cloud assistant run by ID.",
    inputSchema: s.object("The input payload for retrieving a Griptape Cloud assistant run.", {
      assistant_run_id: s.string("The Griptape Cloud assistant run ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("The response returned when retrieving a Griptape Cloud assistant run.", {
      assistant_run: assistantRunSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "cancel_assistant_run",
    description: "Cancel a Griptape Cloud assistant run.",
    inputSchema: s.object("The input payload for cancelling a Griptape Cloud assistant run.", {
      assistant_run_id: s.string("The Griptape Cloud assistant run ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("The response returned when cancelling a Griptape Cloud assistant run.", {
      assistant_run: assistantRunSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_assistant_events",
    description: "List non-streaming events for a Griptape Cloud assistant run.",
    inputSchema: s.object(
      "The input payload for listing Griptape Cloud assistant run events.",
      {
        assistant_run_id: s.string("The Griptape Cloud assistant run ID.", { minLength: 1 }),
        limit: s.positiveInteger("The maximum number of events to return."),
        offset: s.nonNegativeInteger("The event offset to start from."),
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object(
      "The response returned when listing Griptape Cloud assistant events.",
      {
        events: s.array("Griptape Cloud assistant events.", assistantEventSchema),
        count: s.number("The number of events returned."),
        limit: s.number("The requested event limit."),
        offset: s.number("The requested event offset."),
        next_offset: s.number("The next event offset, if available."),
        total_count: s.number("The total number of events."),
        raw: rawObjectSchema,
      },
      { optional: ["next_offset"] },
    ),
  }),
];
