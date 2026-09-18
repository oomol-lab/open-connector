import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "qianfan";

const emptyInputSchema = s.actionInput({}, [], "No input parameters are required for this action.");
const passthroughObjectSchema = s.unknownObject("Additional upstream-compatible request fields.");

const messageSchema = s.looseObject("A message in a Qianfan chat-style request.", {
  role: s.stringEnum("The role of the message author.", ["system", "user", "assistant", "tool", "developer"]),
  content: s.unknown("The message content."),
  name: s.string("The optional participant name for the message."),
  tool_call_id: s.string("The identifier of the tool call that this tool message responds to."),
  tool_calls: s.array(s.unknownObject("A tool call requested by the model."), {
    description: "The tool calls requested by an assistant message.",
  }),
});

const usageSchema = s.looseObject("Token usage metadata returned by the API.", {
  prompt_tokens: s.integer("The number of prompt tokens consumed."),
  completion_tokens: s.integer("The number of completion tokens generated."),
  total_tokens: s.integer("The total number of tokens consumed."),
  input_tokens: s.integer("The number of input tokens consumed."),
  output_tokens: s.integer("The number of output tokens generated."),
});

const modelListOutputSchema = s.looseObject("The response payload for listing Qianfan models.", {
  object: s.string("The top-level object type."),
  data: s.array(
    s.looseObject("A Qianfan model entry.", {
      id: s.string("The model identifier."),
      object: s.string("The object type returned by the API."),
      created: s.integer("The Unix timestamp when the model metadata was created."),
      owned_by: s.string("The organization or owner that provides the model."),
    }),
    { description: "The list of available models." },
  ),
});

const completionInputSchema = s.looseObject("The input payload for the Qianfan completion action.", {
  model: s.string("The Qianfan FIM model identifier to use."),
  prompt: s.string("The non-empty prefix text that the model should continue from.", { minLength: 1 }),
  suffix: s.string("The optional suffix text used for fill-in-the-middle completion."),
  max_tokens: s.positiveInteger("The maximum number of tokens to generate."),
  temperature: s.number("The sampling temperature for generation."),
  top_p: s.number("The nucleus sampling threshold."),
  stop: s.stringArray("Up to four stop sequences that stop generation.", { maxItems: 4 }),
  stream: s.boolean("Whether to request a streaming response. This connector only accepts false or omission."),
  stream_options: passthroughObjectSchema,
  user_id: s.string("The end-user identifier for tracing requests."),
});

const completionOutputSchema = s.looseObject("The response payload for a completion action.", {
  id: s.string("The completion identifier."),
  object: s.string("The object type returned by the API."),
  created: s.integer("The Unix timestamp when the completion was created."),
  model: s.string("The model that generated the completion."),
  choices: s.array(s.unknownObject("A generated completion choice."), { description: "The completion choices." }),
  usage: usageSchema,
});

const chatCompletionInputSchema = s.looseObject("The input payload for the Qianfan chat completion action.", {
  model: s.string("The Qianfan model identifier to use."),
  messages: s.array(messageSchema, { description: "The ordered conversation messages.", minItems: 1 }),
  max_tokens: s.positiveInteger("The maximum number of tokens to generate."),
  temperature: s.number("The sampling temperature for generation.", { minimum: 0, maximum: 2 }),
  top_p: s.number("The nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
  frequency_penalty: s.number("The frequency penalty applied to repeated tokens.", { minimum: -2, maximum: 2 }),
  presence_penalty: s.number("The presence penalty applied to newly introduced tokens.", { minimum: -2, maximum: 2 }),
  stop: s.union([s.string("A single stop sequence."), s.stringArray("A list of stop sequences.")]),
  stream: s.boolean("Whether to request a streaming response. This connector only accepts false or omission."),
  stream_options: passthroughObjectSchema,
  response_format: passthroughObjectSchema,
  tools: s.array(s.unknownObject("A tool available to the model."), {
    description: "The tools available to the model.",
  }),
  tool_choice: s.unknown("How the model should choose tools."),
  user: s.string("An end-user identifier for tracing and abuse monitoring."),
});

const chatCompletionOutputSchema = s.looseObject("The response payload for the chat completion action.", {
  id: s.string("The completion identifier."),
  object: s.string("The object type returned by the API."),
  created: s.integer("The Unix timestamp when the completion was created."),
  model: s.string("The model that generated the completion."),
  choices: s.array(s.unknownObject("A generated completion choice."), { description: "The completion choices." }),
  usage: usageSchema,
});

const embeddingsInputSchema = s.looseObject("The input payload for the embeddings action.", {
  model: s.string("The embedding model identifier."),
  input: s.union([s.string("A single input string to embed."), s.stringArray("A list of input strings to embed.")], {
    description: "One or more input strings to embed.",
  }),
  encoding_format: s.string("The output encoding format for embeddings."),
  dimensions: s.positiveInteger("The target embedding dimension count."),
  user: s.string("An end-user identifier for tracing and abuse monitoring."),
});

const embeddingsOutputSchema = s.looseObject("The response payload for the embeddings action.", {
  object: s.string("The top-level object type."),
  data: s.array(s.unknownObject("A single embedding result item."), {
    description: "The list of embedding result items.",
  }),
  model: s.string("The embedding model used for the response."),
  usage: usageSchema,
});

const rerankInputSchema = s.looseObject("The input payload for the rerank action.", {
  model: s.string("The rerank model identifier."),
  query: s.string("The search query used to score the candidate documents."),
  documents: s.stringArray("The ordered candidate documents to rank.", { minItems: 1 }),
  top_n: s.positiveInteger("The maximum number of ranked documents to return."),
  return_documents: s.boolean("Whether to include the ranked document text in the response."),
  max_chunks_per_doc: s.positiveInteger("The maximum number of chunks to evaluate per document."),
  user: s.string("An end-user identifier for tracing and abuse monitoring."),
});

const rerankOutputSchema = s.looseObject("The response payload for the rerank action.", {
  id: s.string("The rerank request identifier."),
  results: s.array(s.unknownObject("A ranked document result."), { description: "The ranked document results." }),
  model: s.string("The rerank model used for the response."),
  usage: usageSchema,
});

const aiSearchInputSchema = s.looseObject("The input payload for the Qianfan AI search chat completion action.", {
  model: s.string("The AI search model identifier to use."),
  messages: s.array(messageSchema, { description: "The ordered conversation messages.", minItems: 1 }),
  stream: s.boolean("Whether to request a streaming response. This connector only accepts false or omission."),
});

const aiSearchOutputSchema = s.looseObject("The response payload for the Qianfan AI search chat completion action.", {
  code: s.integer("The upstream status code."),
  message: s.string("The upstream status message."),
  request_Id: s.string("The upstream request identifier."),
  choices: s.array(s.unknown("A generated AI search choice."), { description: "The generated AI search choices." }),
  references: s.array(s.unknown("A search reference."), { description: "The search references returned by the API." }),
  entities: s.array(s.unknown("A detected entity."), { description: "The detected entities returned by the API." }),
  followup_queries: s.stringArray("The follow-up queries returned by the API."),
  usage: s.unknown("Usage information for the AI search request."),
  is_safe: s.boolean("Whether the response passed safety checks."),
});

const ocrInputSchema = s.looseObject("The input payload for a Qianfan OCR action.", {
  file: s.string("The image or document URL, or another upstream-supported file descriptor string."),
  model: s.string("The OCR model identifier."),
  fileType: s.integer("The file type declared to the upstream API."),
});

const ocrOutputSchema = s.looseObject("The response payload for a Qianfan OCR action.", {
  id: s.string("The OCR request identifier."),
  result: s.unknown("The OCR result returned by the API."),
});

const imageGenerationInputSchema = s.looseObject("The input payload for an image generation action.", {
  model: s.string("The image model identifier to use."),
  prompt: s.string("The prompt used to generate the image."),
  n: s.positiveInteger("The number of images to generate."),
  seed: s.integer("The random seed used for generation."),
  size: s.string("The output image size, for example 1024x1024."),
  response_format: s.string("The response format requested from the upstream API."),
});

const imageGenerationOutputSchema = s.looseObject("The response payload for an image generation action.", {
  id: s.string("The image generation identifier."),
  created: s.integer("The Unix timestamp when the image was created."),
  data: s.array(s.unknownObject("A generated image result item."), { description: "The generated image results." }),
});

const createVideoTaskInputSchema = s.looseObject("The input payload for creating a video generation task.", {
  model: s.string("The video model identifier to use."),
  content: s.array(s.unknownObject("A video generation content item."), {
    description: "The ordered content items for generation.",
    minItems: 1,
  }),
  duration: s.positiveInteger("The requested video duration in seconds."),
  prompt_extend: s.boolean("Whether the upstream prompt extension feature should be enabled."),
  watermark: s.boolean("Whether a watermark should be added."),
});

const createVideoTaskOutputSchema = s.looseObject("The response payload for creating a video generation task.", {
  id: s.string("The request identifier."),
  task_id: s.string("The generated video task identifier."),
});

const videoTaskInputSchema = s.actionInput(
  {
    task_id: s.string("The video task identifier.", { minLength: 1 }),
  },
  ["task_id"],
  "The input payload for a single video task action.",
);

const videoTaskOutputSchema = s.looseObject("The response payload for a video generation task.", {
  id: s.string("The request identifier."),
  task_id: s.string("The video task identifier."),
  model: s.string("The video model identifier."),
  status: s.string("The current task status."),
  content: s.array(s.unknownObject("A video generation content item."), {
    description: "The video task content items.",
  }),
});

const listVideoTasksInputSchema = s.looseObject("The input payload for listing video generation tasks.", {
  page_num: s.positiveInteger("The page number to fetch."),
  page_size: s.positiveInteger("The number of tasks per page."),
  status: s.string("Filter by task status."),
  task_ids: s.stringArray("Filter by task identifiers."),
  model_name: s.string("Filter by model name."),
  start_time: s.string("Filter tasks created after this time."),
  end_time: s.string("Filter tasks created before this time."),
});

const fileObjectSchema = s.looseObject("A Qianfan file object.", {
  id: s.string("The file identifier."),
  bytes: s.integer("The file size in bytes."),
  object: s.string("The object type returned by the API."),
  purpose: s.string("The declared purpose of the file."),
  filename: s.string("The file name stored by the API."),
  created_at: s.integer("The Unix timestamp when the file was created."),
});

const uploadFileInputSchema = s.looseObject("The input payload for uploading a Qianfan file.", {
  file: s.transitFile("The file uploaded through POST /api/files to send to Qianfan."),
  purpose: s.string("The declared purpose of the uploaded file."),
});

const listFilesInputSchema = s.actionInput({
  after: s.string("Return files after this file identifier."),
  limit: s.positiveInteger("The maximum number of files to return."),
  order: s.stringEnum("The order in which files should be returned.", ["asc", "desc"]),
  purpose: s.string("Filter by file purpose."),
});

const fileIdInputSchema = s.actionInput(
  {
    file_id: s.string("The file identifier.", { minLength: 1 }),
  },
  ["file_id"],
  "The input payload for a file lookup action.",
);

const fileContentOutputSchema = s.actionOutput({
  content: s.string("The raw file content returned by the API."),
  content_type: s.string("The response content type returned by the API."),
});

const batchObjectSchema = s.looseObject("A Qianfan batch object.", {
  id: s.string("The batch identifier."),
  object: s.string("The object type returned by the API."),
  status: s.string("The current batch status."),
  endpoint: s.string("The endpoint executed by the batch."),
  input_file_id: s.string("The input file identifier."),
  output_file_id: s.string("The output file identifier."),
  error_file_id: s.string("The error file identifier."),
  completion_window: s.string("The completion window requested for the batch."),
  metadata: passthroughObjectSchema,
});

const createBatchInputSchema = s.looseObject("The input payload for creating a Qianfan batch.", {
  input_file_id: s.string("The input file identifier used by the batch."),
  endpoint: s.string("The endpoint executed for each batch item."),
  completion_window: s.string("The completion window requested for the batch."),
  metadata: passthroughObjectSchema,
  replace: s.boolean("Whether an existing output should be replaced."),
});

const batchIdInputSchema = s.actionInput(
  {
    batch_id: s.string("The batch identifier.", { minLength: 1 }),
  },
  ["batch_id"],
  "The input payload for a batch lookup action.",
);

const responseInputSchema = s.looseObject("The input payload for creating a Qianfan stored response.", {
  model: s.string("The Qianfan model identifier to use."),
  input: s.unknown("The text or structured input items sent to the model."),
  instructions: s.string("An optional system instruction inserted before the input."),
  stream: s.boolean("Whether to request a streaming response. This connector only accepts false or omission."),
});

const responseObjectSchema = s.looseObject("The response object returned by the Qianfan responses API.", {
  id: s.string("The response identifier."),
  object: s.string("The object type returned by the API."),
  status: s.string("The current response status."),
  model: s.string("The model that produced the response."),
  output: s.array(s.unknown("A response output item."), { description: "The response output items." }),
  usage: usageSchema,
});

const responseIdInputSchema = s.actionInput(
  {
    response_id: s.string("The response identifier.", { minLength: 1 }),
  },
  ["response_id"],
  "The input payload for a response lookup action.",
);

const deleteResponseOutputSchema = s.looseObject("The response payload for deleting a stored response.", {
  id: s.string("The deleted response identifier."),
  object: s.string("The object type returned by the API."),
  deleted: s.boolean("Whether the response was deleted successfully."),
});

const listResponseInputItemsInputSchema = s.actionInput(
  {
    response_id: s.string("The response identifier.", { minLength: 1 }),
    after: s.string("Return items after this item identifier."),
    before: s.string("Return items before this item identifier."),
    limit: s.integer("The maximum number of items to return.", { minimum: 1, maximum: 100 }),
    order: s.stringEnum("The order in which input items should be returned.", ["asc", "desc"]),
  },
  ["response_id"],
  "The input payload for listing stored response input items.",
);

const listResponseInputItemsOutputSchema = s.looseObject(
  "The response payload for listing stored response input items.",
  {
    object: s.string("The object type returned by the API."),
    data: s.array(s.unknown("A stored response context item."), { description: "The stored response context items." }),
    first_id: s.string("The first item identifier in the page."),
    last_id: s.string("The last item identifier in the page."),
    has_more: s.boolean("Whether more items are available."),
  },
);

function action(input: {
  name: QianfanActionName;
  operationType: ProviderActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  asyncLifecycle?: ProviderActionDefinition["asyncLifecycle"];
}): ProviderActionDefinition {
  return defineProviderAction(service, input);
}

export const qianfanActions: ProviderActionDefinition[] = [
  action({
    name: "list_models",
    operationType: "read",
    description: "List the models available to the current Baidu Qianfan API key.",
    inputSchema: emptyInputSchema,
    outputSchema: modelListOutputSchema,
  }),
  action({
    name: "create_completion",
    operationType: "write",
    description: "Create a non-streaming fill-in-the-middle completion with Baidu Qianfan.",
    inputSchema: completionInputSchema,
    outputSchema: completionOutputSchema,
  }),
  action({
    name: "create_chat_completion",
    operationType: "read",
    description: "Create a non-streaming OpenAI-compatible chat completion with Baidu Qianfan.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: chatCompletionOutputSchema,
  }),
  action({
    name: "create_ai_search_completion",
    operationType: "read",
    description: "Create a non-streaming AI search chat completion with Baidu Qianfan.",
    inputSchema: aiSearchInputSchema,
    outputSchema: aiSearchOutputSchema,
  }),
  action({
    name: "create_embeddings",
    operationType: "write",
    description: "Generate embedding vectors for one or more input strings with Baidu Qianfan.",
    inputSchema: embeddingsInputSchema,
    outputSchema: embeddingsOutputSchema,
  }),
  action({
    name: "rerank",
    operationType: "read",
    description: "Score and rank candidate documents against a query with a Baidu Qianfan rerank model.",
    inputSchema: rerankInputSchema,
    outputSchema: rerankOutputSchema,
  }),
  action({
    name: "run_paddleocr_vl",
    operationType: "write",
    description: "Run the Baidu Qianfan PaddleOCR-VL endpoint on a document or image.",
    inputSchema: ocrInputSchema,
    outputSchema: ocrOutputSchema,
  }),
  action({
    name: "run_pp_structure_v3",
    operationType: "write",
    description: "Run the Baidu Qianfan PP-StructureV3 OCR endpoint on a document or image.",
    inputSchema: ocrInputSchema,
    outputSchema: ocrOutputSchema,
  }),
  action({
    name: "create_image_generation",
    operationType: "write",
    description: "Generate images with the Baidu Qianfan general image generation endpoint.",
    inputSchema: imageGenerationInputSchema,
    outputSchema: imageGenerationOutputSchema,
  }),
  action({
    name: "create_air_image_generation",
    operationType: "write",
    description: "Generate images with the Baidu Qianfan MuseSteamer Air image endpoint.",
    inputSchema: imageGenerationInputSchema,
    outputSchema: imageGenerationOutputSchema,
  }),
  action({
    name: "create_video_generation_task",
    operationType: "write",
    description: "Create a Baidu Qianfan video generation task.",
    inputSchema: createVideoTaskInputSchema,
    outputSchema: createVideoTaskOutputSchema,
    asyncLifecycle: {
      startActionId: "qianfan.create_video_generation_task",
      statusActionId: "qianfan.get_video_generation_task",
      cancelActionId: "qianfan.cancel_video_generation_task",
    },
  }),
  action({
    name: "get_video_generation_task",
    operationType: "read",
    description: "Fetch a Baidu Qianfan video generation task by its task identifier.",
    inputSchema: videoTaskInputSchema,
    outputSchema: videoTaskOutputSchema,
  }),
  action({
    name: "cancel_video_generation_task",
    operationType: "destructive",
    description: "Cancel a Baidu Qianfan video generation task by its task identifier.",
    inputSchema: videoTaskInputSchema,
    outputSchema: videoTaskOutputSchema,
  }),
  action({
    name: "list_video_generation_tasks",
    operationType: "read",
    description: "List Baidu Qianfan video generation tasks with optional filters.",
    inputSchema: listVideoTasksInputSchema,
    outputSchema: s.looseObject("The response payload for listing video generation tasks.", {
      id: s.string("The request identifier."),
      total: s.integer("The total number of matching tasks."),
      items: s.array(videoTaskOutputSchema, { description: "The matching video generation tasks." }),
    }),
  }),
  action({
    name: "upload_file",
    operationType: "write",
    description: "Upload a file to Baidu Qianfan for batch or other file-based APIs.",
    inputSchema: uploadFileInputSchema,
    outputSchema: fileObjectSchema,
  }),
  action({
    name: "list_files",
    operationType: "read",
    description: "List files stored in Baidu Qianfan with optional filters.",
    inputSchema: listFilesInputSchema,
    outputSchema: s.looseObject("The response payload for listing Qianfan files.", {
      data: s.array(fileObjectSchema, { description: "The matching file objects." }),
    }),
  }),
  action({
    name: "get_file_content",
    operationType: "read",
    description: "Fetch the raw content of a Baidu Qianfan file by its identifier.",
    inputSchema: fileIdInputSchema,
    outputSchema: fileContentOutputSchema,
  }),
  action({
    name: "create_batch",
    operationType: "write",
    description: "Create a Baidu Qianfan batch prediction job from an uploaded input file.",
    inputSchema: createBatchInputSchema,
    outputSchema: batchObjectSchema,
    asyncLifecycle: {
      startActionId: "qianfan.create_batch",
      statusActionId: "qianfan.get_batch",
      cancelActionId: "qianfan.cancel_batch",
    },
  }),
  action({
    name: "cancel_batch",
    operationType: "destructive",
    description: "Cancel a Baidu Qianfan batch prediction job by its identifier.",
    inputSchema: batchIdInputSchema,
    outputSchema: batchObjectSchema,
  }),
  action({
    name: "get_batch",
    operationType: "read",
    description: "Fetch a Baidu Qianfan batch prediction job by its identifier.",
    inputSchema: batchIdInputSchema,
    outputSchema: batchObjectSchema,
  }),
  action({
    name: "list_batches",
    operationType: "read",
    description: "List Baidu Qianfan batch prediction jobs with optional pagination.",
    inputSchema: s.actionInput({
      after: s.string("Return batches after this batch identifier."),
      limit: s.positiveInteger("The maximum number of batches to return."),
    }),
    outputSchema: s.looseObject("The response payload for listing Qianfan batches.", {
      object: s.string("The object type returned by the API."),
      data: s.array(batchObjectSchema, { description: "The matching batch objects." }),
      first_id: s.string("The first batch identifier in the page."),
      last_id: s.string("The last batch identifier in the page."),
      has_more: s.boolean("Whether more batches are available."),
    }),
  }),
  action({
    name: "create_response",
    operationType: "write",
    description: "Create a non-streaming stored response with the Baidu Qianfan responses API.",
    inputSchema: responseInputSchema,
    outputSchema: responseObjectSchema,
  }),
  action({
    name: "get_response",
    operationType: "read",
    description: "Fetch a previously stored Baidu Qianfan response by its identifier.",
    inputSchema: responseIdInputSchema,
    outputSchema: responseObjectSchema,
  }),
  action({
    name: "delete_response",
    operationType: "destructive",
    description: "Delete a previously stored Baidu Qianfan response by its identifier.",
    inputSchema: responseIdInputSchema,
    outputSchema: deleteResponseOutputSchema,
  }),
  action({
    name: "list_response_input_items",
    operationType: "read",
    description: "List the stored context items for a previously created Baidu Qianfan response.",
    inputSchema: listResponseInputItemsInputSchema,
    outputSchema: listResponseInputItemsOutputSchema,
  }),
];

export type QianfanActionName =
  | "list_models"
  | "create_completion"
  | "create_chat_completion"
  | "create_ai_search_completion"
  | "create_embeddings"
  | "rerank"
  | "run_paddleocr_vl"
  | "run_pp_structure_v3"
  | "create_image_generation"
  | "create_air_image_generation"
  | "create_video_generation_task"
  | "get_video_generation_task"
  | "cancel_video_generation_task"
  | "list_video_generation_tasks"
  | "upload_file"
  | "list_files"
  | "get_file_content"
  | "create_batch"
  | "cancel_batch"
  | "get_batch"
  | "list_batches"
  | "create_response"
  | "get_response"
  | "delete_response"
  | "list_response_input_items";
