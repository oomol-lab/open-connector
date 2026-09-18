import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mistral_ai";

interface MistralAiActionSource {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
}

const rawResponseSchema = s.unknown("Raw response data returned by the Mistral API.");
const jsonValueSchema = s.unknown("Any JSON value accepted by the Mistral API.");
const jsonObjectSchema = s.record("Any JSON object accepted by the Mistral API.", jsonValueSchema);
const noInputSchema = s.object({}, { description: "No input parameters are required for this action." });
const deletedResponseSchema = s.object(
  {
    deleted: s.boolean("Whether the resource has been deleted."),
  },
  { required: ["deleted"], description: "Delete action response." },
);

const transitFileOutputSchema = s.object(
  {
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit download URL."),
    sizeBytes: s.nonNegativeInteger("The stored file size in bytes."),
    name: s.nonEmptyString("The downloaded filename."),
    mimeType: s.nonEmptyString("The downloaded file MIME type."),
  },
  { required: ["fileId", "downloadUrl", "sizeBytes", "name", "mimeType"], description: "Downloaded file content." },
);

const downloadFileResponseSchema = s.object(
  {
    content: transitFileOutputSchema,
  },
  { required: ["content"], description: "The output of the file download action." },
);

const uploadableFileSchema = s.anyOf("File content to upload to Mistral.", [
  s.transitFile("A file previously uploaded to the local transit file API."),
  s.object(
    {
      name: s.nonEmptyString("The filename to send to Mistral."),
      mimeType: s.nonEmptyString("The MIME type of the uploaded file."),
      mimetype: s.nonEmptyString("The MIME type of the uploaded file."),
      url: s.url("A public HTTP or HTTPS URL that the connector can fetch and upload."),
    },
    { required: ["name", "url"], description: "A public URL upload source." },
  ),
  s.object(
    {
      name: s.nonEmptyString("The filename to send to Mistral."),
      mimeType: s.nonEmptyString("The MIME type of the uploaded file."),
      mimetype: s.nonEmptyString("The MIME type of the uploaded file."),
      content_base64: s.nonEmptyString("Base64-encoded file content."),
    },
    { required: ["name", "content_base64"], description: "A base64 upload source." },
  ),
]);

const stringArraySchema = s.stringArray("A list of strings.", { minItems: 1 });
const numberArraySchema = s.array("A list of numbers.", s.number("A number."));
const booleanArraySchema = s.array("A list of booleans.", s.boolean("A boolean."));
const modelIdSchema = s.nonEmptyString("Model ID.");
const conversationIdSchema = s.nonEmptyString("Conversation ID.");
const agentIdSchema = s.nonEmptyString("Agent ID.");
const fileIdSchema = s.nonEmptyString("File ID.");
const libraryIdSchema = s.nonEmptyString("Knowledge base library ID.");
const documentIdSchema = s.nonEmptyString("Knowledge base document ID.");
const versionSchema = s.anyOf("Version number or version alias.", [s.nonEmptyString("Version alias."), s.integer()]);
const metadataSchema = jsonObjectSchema;
const toolSchema = s.looseObject("Tool definition accepted by Mistral.");
const responseFormatSchema = s.looseObject("Response format configuration accepted by Mistral.");
const completionArgsSchema = s.looseObject("Completion parameter configuration accepted by Mistral.");
const messageSchema = s.looseObject("A chat message accepted by Mistral.");
const guardrailConfigSchema = s.looseObject("Guardrail configuration accepted by Mistral.");
const documentChunkSchema = s.looseObject("OCR document or image reference accepted by Mistral.");
const attributesSchema = s.record(
  "Knowledge base document attributes.",
  s.anyOf("Attribute value.", [
    s.boolean("Boolean attribute."),
    s.string("String attribute."),
    s.number("Numeric attribute."),
    stringArraySchema,
    numberArraySchema,
    booleanArraySchema,
  ]),
);

function mistralInput(
  description: string,
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema {
  return s.object(properties, {
    required,
    additionalProperties: true,
    description,
  });
}

const listConversationsInputSchema = mistralInput("Lists conversations with pagination and metadata filters.", {
  page: s.integer("Page number, starting from 0.", { minimum: 0 }),
  page_size: s.integer("The number of items returned per page.", { minimum: 1 }),
  metadata: metadataSchema,
});

const startConversationInputSchema = mistralInput(
  "Input parameters for creating a conversation.",
  {
    inputs: s.anyOf("Conversation initial input.", [
      s.string("Plain text input."),
      s.array("Structured input entries.", jsonObjectSchema),
    ]),
    stream: s.boolean("Whether to use streaming responses. This connector only supports false or omitted."),
    store: s.boolean("Whether to persist the conversation."),
    handoff_execution: s.stringEnum("Handoff execution method.", ["client", "server"]),
    instructions: s.string("Conversation-level instructions."),
    tools: s.array("Tools available for this conversation.", toolSchema),
    completion_args: completionArgsSchema,
    guardrails: s.array("Guardrails to apply.", guardrailConfigSchema),
    name: s.string("Conversation name."),
    description: s.string("Conversation description."),
    metadata: metadataSchema,
    agent_id: agentIdSchema,
    agent_version: versionSchema,
    model: s.string("Direct model identifier to use."),
  },
  ["inputs"],
);

const appendConversationInputSchema = mistralInput(
  "Input parameters for appending content to a conversation.",
  {
    conversation_id: conversationIdSchema,
    inputs: s.anyOf("Input to append to the conversation.", [
      s.string("Plain text input."),
      s.array("Structured input entries.", jsonObjectSchema),
    ]),
    completion_args: completionArgsSchema,
    handoff_execution: s.stringEnum("Handoff execution method.", ["client", "server"]),
    store: s.boolean("Whether to persist storage."),
    tool_confirmations: s.array("Tool call confirmations.", jsonObjectSchema),
  },
  ["conversation_id", "inputs"],
);

const restartConversationInputSchema = mistralInput(
  "Input parameters for restarting a conversation.",
  {
    conversation_id: conversationIdSchema,
    from_entry_id: s.nonEmptyString("Entry ID to restart from."),
    inputs: s.anyOf("Input to continue after restarting.", [
      s.string("Plain text input."),
      s.array("Structured input entries.", jsonObjectSchema),
    ]),
    completion_args: completionArgsSchema,
    handoff_execution: s.stringEnum("Handoff execution method.", ["client", "server"]),
    guardrails: s.array("Guardrails to apply.", guardrailConfigSchema),
    metadata: metadataSchema,
    store: s.boolean("Whether to persist storage."),
    stream: s.boolean("Whether to use streaming responses. This connector only supports false or omitted."),
    agent_version: versionSchema,
  },
  ["conversation_id", "from_entry_id"],
);

const listAgentsInputSchema = mistralInput("List agents with pagination and filters.", {
  page: s.integer("Page number, starting from 0.", { minimum: 0 }),
  page_size: s.integer("The number of items returned per page.", { minimum: 1 }),
  deployment_chat: s.boolean("Whether to return only deployment_chat agents."),
  sources: stringArraySchema,
  name: s.string("Filter by agent name."),
  search: s.string("Search by name or ID."),
  id: s.string("Filter by exact agent ID."),
  metadata: metadataSchema,
});

const createAgentInputSchema = mistralInput(
  "Create a Mistral agent.",
  {
    model: s.nonEmptyString("The default model used by the agent."),
    name: s.nonEmptyString("Agent name."),
    instructions: s.string("Agent instructions."),
    tools: s.array("Tools available to the agent.", toolSchema),
    completion_args: completionArgsSchema,
    guardrails: s.array("Guardrails to apply.", guardrailConfigSchema),
    description: s.string("Agent description."),
    handoffs: stringArraySchema,
    metadata: metadataSchema,
    version_message: s.string("Version message for this update."),
  },
  ["model", "name"],
);

const updateAgentInputSchema = mistralInput(
  "Update a Mistral agent and create a new version.",
  {
    agent_id: agentIdSchema,
    model: s.string("Updated model."),
    name: s.string("Updated agent name."),
    instructions: s.string("Updated instructions."),
    tools: s.array("Updated tool list.", toolSchema),
    completion_args: completionArgsSchema,
    guardrails: s.array("Guardrails to apply.", guardrailConfigSchema),
    description: s.string("Updated description."),
    handoffs: stringArraySchema,
    metadata: metadataSchema,
    deployment_chat: s.boolean("Whether to enable deployment chat."),
    version_message: s.string("Version message for this update."),
  },
  ["agent_id"],
);

const getAgentInputSchema = mistralInput(
  "Get an agent.",
  {
    agent_id: agentIdSchema,
    agent_version: versionSchema,
  },
  ["agent_id"],
);

const listAgentVersionsInputSchema = mistralInput(
  "List versions for an agent.",
  {
    agent_id: agentIdSchema,
    page: s.integer("Page number, starting from 0.", { minimum: 0 }),
    page_size: s.integer("The number of items returned per page.", { minimum: 1 }),
  },
  ["agent_id"],
);

const createChatCompletionInputSchema = mistralInput(
  "Input parameters for chat completion.",
  {
    model: modelIdSchema,
    messages: s.array("List of chat messages.", messageSchema, { minItems: 1 }),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 1.5 }),
    top_p: s.number("Nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
    max_tokens: s.integer("The maximum number of generated tokens.", { minimum: 0 }),
    stream: s.boolean("Whether to use streaming responses. This connector only supports false or omitted."),
    stop: s.anyOf("Stop generating conditions.", [s.string("Single stop word."), stringArraySchema]),
    random_seed: s.integer("Random seed.", { minimum: 0 }),
    metadata: metadataSchema,
    response_format: responseFormatSchema,
    tools: s.array("Tools available for the request.", toolSchema),
    tool_choice: s.unknown("Tool calling strategy."),
    presence_penalty: s.number("Presence penalty.", { minimum: -2, maximum: 2 }),
    frequency_penalty: s.number("Frequency penalty.", { minimum: -2, maximum: 2 }),
    n: s.integer("Number of candidates.", { minimum: 1 }),
    prediction: s.looseObject("Predictive optimization configuration."),
    parallel_tool_calls: s.boolean("Whether to enable parallel tool invocation."),
    prompt_mode: s.string("Prompt mode."),
    reasoning_effort: s.stringEnum("Reasoning strength.", ["high", "none"]),
    guardrails: s.array("Guardrail configurations.", jsonObjectSchema),
    safe_prompt: s.boolean("Whether to inject safety prompts."),
  },
  ["model", "messages"],
);

const createFimCompletionInputSchema = mistralInput(
  "Input parameters for FIM completion.",
  {
    model: modelIdSchema,
    prompt: s.string("The prefix content to complete."),
    suffix: s.string("Completed suffix context."),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 1.5 }),
    top_p: s.number("Nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
    max_tokens: s.integer("The maximum number of generated tokens.", { minimum: 0 }),
    min_tokens: s.integer("Minimum number of generated tokens.", { minimum: 0 }),
    stream: s.boolean("Whether to use streaming responses. This connector only supports false or omitted."),
    stop: s.anyOf("Stop generating conditions.", [s.string("Single stop word."), stringArraySchema]),
    random_seed: s.integer("Random seed.", { minimum: 0 }),
  },
  ["model", "prompt"],
);

const createAgentsCompletionInputSchema = mistralInput(
  "Input parameters for agent completion.",
  {
    agent_id: agentIdSchema,
    messages: s.array("Messages sent to the agent.", messageSchema, { minItems: 1 }),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 1.5 }),
    top_p: s.number("Nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
    max_tokens: s.integer("The maximum number of generated tokens.", { minimum: 0 }),
    stream: s.boolean("Whether to use streaming responses. This connector only supports false or omitted."),
    stop: s.anyOf("Stop generating conditions.", [s.string("Single stop word."), stringArraySchema]),
    random_seed: s.integer("Random seed.", { minimum: 0 }),
    metadata: metadataSchema,
    response_format: responseFormatSchema,
    tools: s.array("Tools added in this request.", toolSchema),
    tool_choice: s.unknown("Tool calling strategy."),
    presence_penalty: s.number("Presence penalty.", { minimum: -2, maximum: 2 }),
    frequency_penalty: s.number("Frequency penalty.", { minimum: -2, maximum: 2 }),
    n: s.integer("Number of candidates.", { minimum: 1 }),
    prediction: s.looseObject("Predictive optimization configuration."),
    parallel_tool_calls: s.boolean("Whether to enable parallel tool invocation."),
    prompt_mode: s.string("Prompt mode."),
    reasoning_effort: s.stringEnum("Reasoning strength.", ["high", "none"]),
  },
  ["agent_id", "messages"],
);

const createEmbeddingsInputSchema = mistralInput(
  "Generate embeddings.",
  {
    model: modelIdSchema,
    input: s.anyOf("Text to embed.", [s.string("Single text."), stringArraySchema]),
    metadata: metadataSchema,
    output_dimension: s.positiveInteger("Output vector dimensions."),
    output_dtype: s.stringEnum("Output vector data type.", ["float", "int8", "uint8", "binary", "ubinary"]),
    encoding_format: s.stringEnum("Vector encoding format.", ["float", "base64"]),
  },
  ["model", "input"],
);

const createModerationInputSchema = mistralInput(
  "Moderate text.",
  {
    model: modelIdSchema,
    input: s.anyOf("Text pending review.", [s.string("Single text."), stringArraySchema]),
  },
  ["model", "input"],
);

const createChatModerationInputSchema = mistralInput(
  "Moderate chat messages.",
  {
    model: modelIdSchema,
    input: s.anyOf("Chat content pending review.", [
      s.array("Messages for a single chat session.", messageSchema),
      s.array("Multiple chat sessions.", s.array("A chat session.", messageSchema)),
    ]),
  },
  ["model", "input"],
);

const createOcrInputSchema = mistralInput(
  "Input parameters for OCR.",
  {
    model: modelIdSchema,
    id: s.string("Custom ID for this OCR request."),
    document: documentChunkSchema,
    pages: s.array("Only process specified pages.", s.integer("Page number, starting from 0.", { minimum: 0 })),
    include_image_base64: s.boolean("Whether to include extracted image base64 data."),
    image_limit: s.integer("Maximum number of images to extract."),
    image_min_size: s.integer("Minimum image size to extract."),
    bbox_annotation_format: responseFormatSchema,
    document_annotation_format: responseFormatSchema,
    document_annotation_prompt: s.string("Prompt for structured document extraction."),
    confidence_scores_granularity: s.stringEnum("Confidence granularity.", ["word", "page"]),
    table_format: s.stringEnum("Table output format.", ["markdown", "html"]),
    extract_header: s.boolean("Whether to extract the header."),
    extract_footer: s.boolean("Whether to extract the footer."),
    bbox_annotation_format_prompt: s.string("Prompt for bbox structured extraction."),
    document_annotation_prompt_extra: s.string("Additional document prompt words."),
  },
  ["model", "document"],
);

const createAudioTranscriptionInputSchema = mistralInput(
  "Input parameters for audio transcription.",
  {
    file: uploadableFileSchema,
    file_id: fileIdSchema,
    context_bias: s.array("Context bias phrases.", s.string("Bias phrase.")),
    diarize: s.boolean("Whether to diarize speakers."),
    language: s.string("Audio language code."),
    model: modelIdSchema,
    temperature: s.number("Sampling temperature."),
    timestamp_granularities: s.array(
      "Timestamp granularities to include.",
      s.stringEnum("Timestamp granularity.", ["segment", "word"]),
    ),
  },
  ["model"],
);

const listFilesInputSchema = mistralInput("List files.", {
  after: s.string("The previous page cursor file ID."),
  limit: s.integer("Maximum number of files.", { minimum: 1 }),
  order: s.stringEnum("Sort direction.", ["asc", "desc"]),
});

const uploadFileInputSchema = mistralInput(
  "Upload a file to Mistral.",
  {
    file: uploadableFileSchema,
    purpose: s.string("File usage, such as fine-tune, batch, or ocr."),
    visibility: s.string("File visibility, such as workspace or user."),
    expiry: s.integer("The number of hours before the file expires."),
  },
  ["file"],
);

const getFileSignedUrlInputSchema = mistralInput(
  "Get a file signed URL.",
  {
    file_id: fileIdSchema,
    expiry: s.integer("The number of hours the signed link remains valid.", { minimum: 1 }),
  },
  ["file_id"],
);

const getFineTuningJobsInputSchema = mistralInput("List fine-tuning jobs.", {
  page: s.integer("Page number, starting from 0.", { minimum: 0 }),
  page_size: s.integer("The number of items returned per page.", { minimum: 1 }),
  model: s.string("Filter by base model."),
  status: s.string("Filter by task status."),
  suffix: s.string("Filter by model suffix."),
  wandb_name: s.string("Filter by Weights & Biases run name."),
  wandb_project: s.string("Filter by Weights & Biases project."),
  created_after: s.string("Only tasks created after this time are returned."),
  created_before: s.string("Only tasks created before this time are returned."),
  created_by_me: s.boolean("Whether to return only tasks created by the current caller."),
});

const listBatchJobsInputSchema = mistralInput("List batch jobs.", {
  page: s.integer("Page number, starting from 0.", { minimum: 0 }),
  page_size: s.integer("The number of items returned per page.", { minimum: 1 }),
  model: s.string("Filter by model."),
  status: s.string("Filter by task status."),
  agent_id: agentIdSchema,
  metadata: s.string("Filter by metadata string."),
  created_after: s.string("Only tasks created after this time are returned."),
  created_by_me: s.boolean("Whether to return only tasks created by the current caller."),
});

const listLibrariesInputSchema = mistralInput("List libraries.", {
  limit: s.integer("Maximum number of libraries.", { minimum: 1 }),
  page_token: s.string("Pagination token."),
});

const createLibraryInputSchema = mistralInput(
  "Create a library.",
  {
    name: s.nonEmptyString("Library name."),
    description: s.string("Library description."),
    chunk_size: s.integer("Document chunk size."),
  },
  ["name"],
);

const updateLibraryInputSchema = mistralInput(
  "Update a library.",
  {
    library_id: libraryIdSchema,
    name: s.string("Updated library name."),
    description: s.string("Updated library description."),
  },
  ["library_id"],
);

const listLibraryDocumentsInputSchema = mistralInput(
  "List library documents.",
  {
    library_id: libraryIdSchema,
    page: s.integer("Page number, starting from 0.", { minimum: 0 }),
    page_size: s.integer("The number of items returned per page.", { minimum: 1 }),
    search: s.string("Document search keywords."),
    filters_attributes: s.string("Property filter expression."),
    sort_by: s.string("Sort field."),
    sort_order: s.stringEnum("Sort direction.", ["asc", "desc"]),
  },
  ["library_id"],
);

const uploadLibraryDocumentInputSchema = mistralInput(
  "Upload a document to a library.",
  {
    library_id: libraryIdSchema,
    file: uploadableFileSchema,
  },
  ["library_id", "file"],
);

const updateLibraryDocumentInputSchema = mistralInput(
  "Update a library document.",
  {
    library_id: libraryIdSchema,
    document_id: documentIdSchema,
    name: s.string("Updated document name."),
    attributes: attributesSchema,
  },
  ["library_id", "document_id"],
);

const createLibraryShareInputSchema = mistralInput(
  "Create or update a library share.",
  {
    library_id: libraryIdSchema,
    level: s.stringEnum("Sharing permission level.", ["Viewer", "Editor"]),
    org_id: s.string("Organization ID."),
    share_with_uuid: s.nonEmptyString("The UUID of the shared object."),
    share_with_type: s.nonEmptyString("The entity type of the shared object."),
  },
  ["library_id", "level", "share_with_uuid", "share_with_type"],
);

const deleteLibraryShareInputSchema = mistralInput(
  "Remove a library share.",
  {
    library_id: libraryIdSchema,
    org_id: s.string("Organization ID."),
    share_with_uuid: s.nonEmptyString("The UUID of the object to unshare."),
    share_with_type: s.nonEmptyString("The object entity type to unshare."),
  },
  ["library_id", "share_with_uuid", "share_with_type"],
);

const actionSources: MistralAiActionSource[] = [
  {
    name: "list_models",
    operationType: "read",
    description: "List all Mistral models accessible by the current API key.",
    inputSchema: noInputSchema,
  },
  {
    name: "get_model",
    operationType: "read",
    description: "Get details of a single Mistral model by model ID.",
    inputSchema: mistralInput("Get one model.", { model_id: modelIdSchema }, ["model_id"]),
  },
  {
    name: "list_conversations",
    operationType: "read",
    description: "List conversations under the current organization with pagination and metadata filters.",
    inputSchema: listConversationsInputSchema,
  },
  {
    name: "start_conversation",
    operationType: "write",
    description: "Create a new conversation and append initial context.",
    inputSchema: startConversationInputSchema,
  },
  {
    name: "get_conversation",
    operationType: "read",
    description: "Get metadata for a single conversation by ID.",
    inputSchema: mistralInput("Get one conversation.", { conversation_id: conversationIdSchema }, ["conversation_id"]),
  },
  {
    name: "delete_conversation",
    operationType: "destructive",
    description: "Delete the specified conversation.",
    inputSchema: mistralInput("Delete one conversation.", { conversation_id: conversationIdSchema }, [
      "conversation_id",
    ]),
    outputSchema: deletedResponseSchema,
  },
  {
    name: "append_to_conversation",
    operationType: "write",
    description: "Append a new message to an existing conversation.",
    inputSchema: appendConversationInputSchema,
  },
  {
    name: "get_conversation_history",
    operationType: "read",
    description: "Get all history entries in a conversation.",
    inputSchema: mistralInput("Get conversation history.", { conversation_id: conversationIdSchema }, [
      "conversation_id",
    ]),
  },
  {
    name: "get_conversation_messages",
    operationType: "read",
    description: "Get all message entries in a conversation.",
    inputSchema: mistralInput("Get conversation messages.", { conversation_id: conversationIdSchema }, [
      "conversation_id",
    ]),
  },
  {
    name: "restart_conversation",
    operationType: "read",
    description: "Restart a conversation from a historical entry.",
    inputSchema: restartConversationInputSchema,
  },
  {
    name: "list_agents",
    operationType: "read",
    description: "List agents with pagination, name, source, or metadata filters.",
    inputSchema: listAgentsInputSchema,
  },
  {
    name: "create_agent",
    operationType: "write",
    description: "Create a new Mistral agent.",
    inputSchema: createAgentInputSchema,
  },
  {
    name: "get_agent",
    operationType: "read",
    description: "Get a single agent by ID.",
    inputSchema: getAgentInputSchema,
  },
  {
    name: "update_agent",
    operationType: "write",
    description: "Update an agent configuration and create a new version.",
    inputSchema: updateAgentInputSchema,
  },
  {
    name: "delete_agent",
    operationType: "destructive",
    description: "Delete the specified agent.",
    inputSchema: mistralInput("Delete one agent.", { agent_id: agentIdSchema }, ["agent_id"]),
    outputSchema: deletedResponseSchema,
  },
  {
    name: "update_agent_version",
    operationType: "write",
    description: "Switch the current version of an agent.",
    inputSchema: mistralInput(
      "Update the current agent version.",
      { agent_id: agentIdSchema, version: s.integer("The target version number.") },
      ["agent_id", "version"],
    ),
  },
  {
    name: "list_agent_versions",
    operationType: "read",
    description: "List all versions of the specified agent.",
    inputSchema: listAgentVersionsInputSchema,
  },
  {
    name: "get_agent_version",
    operationType: "read",
    description: "Get version details of the specified agent.",
    inputSchema: mistralInput("Get one agent version.", { agent_id: agentIdSchema, version: versionSchema }, [
      "agent_id",
      "version",
    ]),
  },
  {
    name: "create_or_update_agent_alias",
    operationType: "write",
    description: "Create or update an agent version alias.",
    inputSchema: mistralInput(
      "Create or update an agent alias.",
      { agent_id: agentIdSchema, alias: s.nonEmptyString("Agent alias name."), version: s.integer("Version number.") },
      ["agent_id", "alias", "version"],
    ),
  },
  {
    name: "list_agent_aliases",
    operationType: "read",
    description: "List all version aliases for the specified agent.",
    inputSchema: mistralInput("List agent aliases.", { agent_id: agentIdSchema }, ["agent_id"]),
  },
  {
    name: "create_chat_completion",
    operationType: "read",
    description: "Call the Mistral chat completions API.",
    inputSchema: createChatCompletionInputSchema,
  },
  {
    name: "create_fim_completion",
    operationType: "write",
    description: "Call the Mistral FIM completions API.",
    inputSchema: createFimCompletionInputSchema,
  },
  {
    name: "create_agents_completion",
    operationType: "write",
    description: "Call the Mistral agents completions API.",
    inputSchema: createAgentsCompletionInputSchema,
  },
  {
    name: "create_embeddings",
    operationType: "write",
    description: "Generate embeddings with Mistral.",
    inputSchema: createEmbeddingsInputSchema,
  },
  {
    name: "create_moderation",
    operationType: "write",
    description: "Detect text safety risks with Mistral moderation.",
    inputSchema: createModerationInputSchema,
  },
  {
    name: "create_chat_moderation",
    operationType: "write",
    description: "Detect chat message safety risks with Mistral moderation.",
    inputSchema: createChatModerationInputSchema,
  },
  {
    name: "create_ocr",
    operationType: "write",
    description: "Run Mistral OCR on a document or image.",
    inputSchema: createOcrInputSchema,
  },
  {
    name: "create_audio_transcription",
    operationType: "write",
    description: "Upload or reference audio and create a transcription.",
    inputSchema: createAudioTranscriptionInputSchema,
  },
  {
    name: "list_files",
    operationType: "read",
    description: "List all files under the current organization.",
    inputSchema: listFilesInputSchema,
  },
  {
    name: "upload_file",
    operationType: "write",
    description: "Upload a file to Mistral for fine-tuning, batch, or OCR.",
    inputSchema: uploadFileInputSchema,
  },
  {
    name: "retrieve_file",
    operationType: "read",
    description: "Get file metadata by file ID.",
    inputSchema: mistralInput("Retrieve file metadata.", { file_id: fileIdSchema }, ["file_id"]),
  },
  {
    name: "delete_file",
    operationType: "destructive",
    description: "Delete the specified file.",
    inputSchema: mistralInput("Delete one file.", { file_id: fileIdSchema }, ["file_id"]),
  },
  {
    name: "download_file",
    operationType: "read",
    description: "Download Mistral file contents into the local transit file store.",
    inputSchema: mistralInput("Download one file.", { file_id: fileIdSchema }, ["file_id"]),
    outputSchema: downloadFileResponseSchema,
  },
  {
    name: "get_file_signed_url",
    operationType: "read",
    description: "Get a temporary signed download link for a file.",
    inputSchema: getFileSignedUrlInputSchema,
  },
  {
    name: "get_fine_tuning_jobs",
    operationType: "read",
    description: "List fine-tuning jobs with pagination and filters.",
    inputSchema: getFineTuningJobsInputSchema,
  },
  {
    name: "list_batch_jobs",
    operationType: "read",
    description: "List batch jobs with pagination and filters.",
    inputSchema: listBatchJobsInputSchema,
  },
  {
    name: "list_libraries",
    operationType: "read",
    description: "List libraries under the current organization.",
    inputSchema: listLibrariesInputSchema,
  },
  {
    name: "create_library",
    operationType: "write",
    description: "Create a new Mistral library.",
    inputSchema: createLibraryInputSchema,
  },
  {
    name: "get_library",
    operationType: "read",
    description: "Get library details by library ID.",
    inputSchema: mistralInput("Get one library.", { library_id: libraryIdSchema }, ["library_id"]),
  },
  {
    name: "update_library",
    operationType: "write",
    description: "Update a library.",
    inputSchema: updateLibraryInputSchema,
  },
  {
    name: "delete_library",
    operationType: "destructive",
    description: "Delete the specified library.",
    inputSchema: mistralInput("Delete one library.", { library_id: libraryIdSchema }, ["library_id"]),
  },
  {
    name: "list_library_documents",
    operationType: "read",
    description: "List documents under a library.",
    inputSchema: listLibraryDocumentsInputSchema,
  },
  {
    name: "upload_library_document",
    operationType: "write",
    description: "Upload a new document to a library.",
    inputSchema: uploadLibraryDocumentInputSchema,
  },
  {
    name: "get_library_document",
    operationType: "read",
    description: "Get details of a single library document.",
    inputSchema: mistralInput(
      "Get one library document.",
      { library_id: libraryIdSchema, document_id: documentIdSchema },
      ["library_id", "document_id"],
    ),
  },
  {
    name: "update_library_document",
    operationType: "write",
    description: "Update a library document.",
    inputSchema: updateLibraryDocumentInputSchema,
  },
  {
    name: "delete_library_document",
    operationType: "destructive",
    description: "Delete a library document.",
    inputSchema: mistralInput(
      "Delete one library document.",
      { library_id: libraryIdSchema, document_id: documentIdSchema },
      ["library_id", "document_id"],
    ),
    outputSchema: deletedResponseSchema,
  },
  {
    name: "get_document_text_content",
    operationType: "read",
    description: "Get extracted text content for a library document.",
    inputSchema: mistralInput(
      "Get document text content.",
      { library_id: libraryIdSchema, document_id: documentIdSchema },
      ["library_id", "document_id"],
    ),
  },
  {
    name: "get_document_status",
    operationType: "read",
    description: "Get processing status for a library document.",
    inputSchema: mistralInput(
      "Get document processing status.",
      { library_id: libraryIdSchema, document_id: documentIdSchema },
      ["library_id", "document_id"],
    ),
  },
  {
    name: "get_document_signed_url",
    operationType: "read",
    description: "Get a temporary signed link to a library document's original file.",
    inputSchema: mistralInput(
      "Get document signed URL.",
      { library_id: libraryIdSchema, document_id: documentIdSchema },
      ["library_id", "document_id"],
    ),
  },
  {
    name: "get_document_extracted_text_url",
    operationType: "read",
    description: "Get a temporary signed link to a library document's extracted text file.",
    inputSchema: mistralInput(
      "Get document extracted text URL.",
      { library_id: libraryIdSchema, document_id: documentIdSchema },
      ["library_id", "document_id"],
    ),
  },
  {
    name: "reprocess_document",
    operationType: "read",
    description: "Reprocess the specified library document.",
    inputSchema: mistralInput(
      "Reprocess a library document.",
      { library_id: libraryIdSchema, document_id: documentIdSchema },
      ["library_id", "document_id"],
    ),
  },
  {
    name: "list_library_shares",
    operationType: "read",
    description: "List shared access records for a library.",
    inputSchema: mistralInput("List library shares.", { library_id: libraryIdSchema }, ["library_id"]),
  },
  {
    name: "create_library_share",
    operationType: "write",
    description: "Create or update shared access for a library.",
    inputSchema: createLibraryShareInputSchema,
  },
  {
    name: "delete_library_share",
    operationType: "destructive",
    description: "Remove shared access from a library.",
    inputSchema: deleteLibraryShareInputSchema,
  },
];

export const mistralAiActions: ActionDefinition[] = actionSources.map((action) =>
  defineProviderAction(service, {
    name: action.name,
    operationType: action.operationType,
    description: action.description,
    requiredScopes: [],
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema ?? rawResponseSchema,
  }),
);
