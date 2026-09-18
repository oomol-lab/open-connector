import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chatbotkit";
const raw = s.looseObject("ChatBotKit resource object.");
const id = s.nonEmptyString("The unique identifier of the resource.");
const listInputProperties = {
  take: s.positiveInteger("The maximum number of items to retrieve."),
  cursor: s.nonEmptyString("The cursor for fetching the next page of results."),
  order: s.stringEnum(["asc", "desc"], { description: "The sort order to use when paginating results." }),
  meta: s.record("String metadata filters encoded into the query string.", s.string("The metadata field value.")),
};
const listInput = s.object(listInputProperties, {
  optional: ["take", "cursor", "order", "meta"],
  description: "ChatBotKit pagination and metadata filters.",
});
const listOutput = (description: string): ReturnType<typeof s.object> =>
  s.object(
    {
      items: s.array(raw, { description }),
      cursor: s.nonEmptyString("The cursor for fetching the next page of results."),
    },
    { optional: ["cursor"], description },
  );
const idOnlyOutput = s.object({ id }, { required: ["id"], description: "ChatBotKit identifier response." });

function action(
  name: string,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: ReturnType<typeof s.object>,
  outputSchema: ReturnType<typeof s.object> = raw,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}

export const chatbotkitActions: ActionDefinition[] = [
  action(
    "fetch_usage",
    "read",
    "Fetch account-wide ChatBotKit usage statistics.",
    s.object({}, { description: "No additional input." }),
    s.looseObject("ChatBotKit usage statistics."),
  ),
  action(
    "list_bots",
    "read",
    "List ChatBotKit bots with optional pagination and metadata filtering.",
    listInput,
    listOutput("Bot items returned by ChatBotKit."),
  ),
  action("fetch_bot", "read", "Fetch a single ChatBotKit bot by ID.", s.object({ botId: id }, { required: ["botId"] })),
  action(
    "create_bot",
    "write",
    "Create a new ChatBotKit bot.",
    s.looseObject("Bot fields accepted by ChatBotKit."),
    idOnlyOutput,
  ),
  action(
    "update_bot",
    "write",
    "Update an existing ChatBotKit bot.",
    s.looseObject({ botId: id }, { description: "Bot update fields accepted by ChatBotKit." }),
    idOnlyOutput,
  ),
  action(
    "list_conversations",
    "read",
    "List ChatBotKit conversations with optional pagination and metadata filtering.",
    listInput,
    listOutput("Conversation items returned by ChatBotKit."),
  ),
  action(
    "fetch_conversation",
    "read",
    "Fetch a single ChatBotKit conversation by ID.",
    s.object({ conversationId: id }, { required: ["conversationId"] }),
  ),
  action(
    "create_conversation",
    "write",
    "Create a new ChatBotKit conversation.",
    s.looseObject("Conversation fields accepted by ChatBotKit."),
    s.looseObject("Created conversation response."),
  ),
  action(
    "list_conversation_messages",
    "read",
    "List messages inside a ChatBotKit conversation.",
    s.object(
      { conversationId: id, ...listInputProperties },
      { required: ["conversationId"], description: "Conversation message list input." },
    ),
    listOutput("Conversation message items returned by ChatBotKit."),
  ),
  action(
    "create_conversation_message",
    "write",
    "Append a message to an existing ChatBotKit conversation.",
    s.looseObject({ conversationId: id }, { description: "Conversation message creation input." }),
    s.looseObject("Created conversation message response."),
  ),
  action(
    "complete_conversation",
    "write",
    "Send a message to a ChatBotKit conversation and receive the next assistant reply.",
    s.looseObject({ conversationId: id }, { description: "Conversation completion input." }),
    s.looseObject("Conversation completion response."),
  ),
  action(
    "list_datasets",
    "read",
    "List ChatBotKit datasets with optional pagination and metadata filtering.",
    listInput,
    listOutput("Dataset items returned by ChatBotKit."),
  ),
  action(
    "fetch_dataset",
    "read",
    "Fetch a single ChatBotKit dataset by ID.",
    s.object({ datasetId: id }, { required: ["datasetId"] }),
  ),
  action(
    "create_dataset",
    "write",
    "Create a new ChatBotKit dataset for knowledge retrieval.",
    s.looseObject("Dataset fields accepted by ChatBotKit."),
    idOnlyOutput,
  ),
  action(
    "update_dataset",
    "write",
    "Update an existing ChatBotKit dataset.",
    s.looseObject({ datasetId: id }, { description: "Dataset update fields accepted by ChatBotKit." }),
    idOnlyOutput,
  ),
  action(
    "list_dataset_records",
    "read",
    "List records inside a ChatBotKit dataset.",
    s.object(
      { datasetId: id, ...listInputProperties },
      { required: ["datasetId"], description: "Dataset record list input." },
    ),
    listOutput("Dataset records returned by ChatBotKit."),
  ),
  action(
    "create_dataset_record",
    "write",
    "Create a new record inside a ChatBotKit dataset.",
    s.looseObject({ datasetId: id }, { description: "Dataset record creation input." }),
    idOnlyOutput,
  ),
  action(
    "search_dataset",
    "read",
    "Run semantic search against a ChatBotKit dataset.",
    s.looseObject({ datasetId: id }, { description: "Dataset search input." }),
    s.object({ items: s.array(raw, { description: "Matching records." }) }),
  ),
  action(
    "list_files",
    "read",
    "List ChatBotKit files with optional pagination and metadata filtering.",
    listInput,
    listOutput("File items returned by ChatBotKit."),
  ),
  action(
    "fetch_file",
    "read",
    "Fetch a single ChatBotKit file by ID.",
    s.object({ fileId: id }, { required: ["fileId"] }),
  ),
  action(
    "create_file",
    "write",
    "Create a new ChatBotKit file resource.",
    s.looseObject("File fields accepted by ChatBotKit."),
    idOnlyOutput,
  ),
  action(
    "upload_file",
    "write",
    "Upload content to an existing ChatBotKit file using official JSON upload modes.",
    s.looseObject({ fileId: id }, { description: "File upload input." }),
    s.looseObject("File upload response."),
  ),
  action(
    "download_file",
    "read",
    "Fetch the download URL for an existing ChatBotKit file.",
    s.object({ fileId: id }, { required: ["fileId"] }),
    s.looseObject("File download response."),
  ),
  action(
    "sync_file",
    "write",
    "Trigger synchronization for an existing ChatBotKit file.",
    s.object({ fileId: id }, { required: ["fileId"] }),
    idOnlyOutput,
  ),
  action(
    "list_dataset_files",
    "read",
    "List files attached to a ChatBotKit dataset.",
    s.object(
      { datasetId: id, ...listInputProperties },
      { required: ["datasetId"], description: "Dataset file list input." },
    ),
    listOutput("Files attached to the dataset."),
  ),
  action(
    "attach_dataset_file",
    "write",
    "Attach an existing ChatBotKit file to a dataset.",
    s.object(
      { datasetId: id, fileId: id, type: s.literal("source", { description: "The attachment type." }) },
      { required: ["datasetId", "fileId", "type"] },
    ),
    idOnlyOutput,
  ),
  action(
    "detach_dataset_file",
    "destructive",
    "Detach a ChatBotKit file from a dataset.",
    s.object(
      { datasetId: id, fileId: id, deleteRecords: s.boolean("Whether associated records should also be deleted.") },
      { required: ["datasetId", "fileId"], description: "Dataset file detach input." },
    ),
    idOnlyOutput,
  ),
];
