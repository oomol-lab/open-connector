import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "openai";

interface OpenAiActionSource {
  name: OpenAiActionName;
  readonly operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  followUpActions?: string[];
}

const jsonObject = s.record(true, { description: "Any JSON object." });
const stringMetadata = s.record(s.string({ description: "Metadata field value." }), {
  description: "String metadata fields attached to the request.",
});
const noInput = input("No input parameters are required for this action.", {});
const responseInclude = s.array(s.string({ description: "One response field path to include." }), {
  minItems: 1,
  description: "Additional response fields to include in the result.",
});
const inputItemsInclude = s.array(s.string({ description: "One input item field path to include." }), {
  minItems: 1,
  description: "Additional input item fields to include in the result.",
});
const audioUploadFile = s.object(
  {
    name: s.string({ minLength: 1, description: "The filename to report when uploading the audio file." }),
    mimetype: s.string({ description: "The MIME type of the audio file." }),
    url: s.string({ description: "A public URL pointing to the audio file." }),
    content_base64: s.string({ minLength: 1, description: "The base64-encoded audio content to upload." }),
  },
  { required: ["name"], description: "The audio file source to upload." },
);
const model = s.object(
  {
    id: s.string({ description: "The model identifier." }),
    object: s.string({ description: "The object type returned by the API." }),
    created: s.integer({ description: "The Unix timestamp when the model was created." }),
    owned_by: s.string({ description: "The organization or user that owns the model." }),
    root: s.string({ description: "The root model identifier for a derived model." }),
    parent: s.nullable(s.string({ description: "The immediate parent model identifier, if any." })),
    permission: s.array(jsonObject, { description: "The permission entries returned for the model." }),
  },
  {
    required: ["id", "object", "created", "owned_by"],
    additionalProperties: true,
    description: "An OpenAI model entry.",
  },
);
const responsePayload = s.object(
  {
    id: s.string({ description: "The response identifier." }),
    object: s.string({ description: "The top-level object type." }),
    created_at: s.integer({ description: "The Unix timestamp when the response was created." }),
    status: s.string({ description: "The response status." }),
    model: s.string({ description: "The model that generated the response." }),
    output: s.array(jsonObject, { description: "The raw output items returned by the response." }),
    output_text: s.string({ description: "The aggregated plain text extracted from the output items." }),
    usage: jsonObject,
    error: s.nullable(jsonObject),
    incomplete_details: s.nullable(jsonObject),
    previous_response_id: s.nullable(
      s.string({ description: "The previous response ID referenced by this response." }),
    ),
    store: s.boolean({ description: "Whether the response is stored by the upstream platform." }),
    expire_at: s.integer({ description: "The Unix timestamp when the stored response expires." }),
  },
  {
    required: ["id", "output"],
    additionalProperties: true,
    description: "The response payload returned by the OpenAI Responses API.",
  },
);
const responseInputContentBlock = s.union([
  s.object(
    {
      type: s.literal("input_text", { description: "The content type. Must be input_text." }),
      text: s.string({ description: "The text content sent to the model." }),
    },
    { required: ["type", "text"], description: "A text content block for a response input message." },
  ),
  s.object(
    {
      type: s.literal("input_image", { description: "The content type. Must be input_image." }),
      image_url: s.string({ description: "A remote image URL or a data URL containing the image bytes." }),
      detail: s.stringEnum(["auto", "low", "high", "original"], { description: "The requested image detail level." }),
    },
    { required: ["type", "image_url"], description: "An image content block for a response input message." },
  ),
  s.object(
    {
      type: s.literal("input_file", { description: "The content type. Must be input_file." }),
      file_id: s.string({ description: "The uploaded file ID to reference." }),
      file_data: s.string({ description: "The inline file data encoded as base64 or supplied as a data URL." }),
      filename: s.string({ description: "The filename to report for inline file data." }),
    },
    { required: ["type"], description: "A file content block for a response input message." },
  ),
]);
const responseInputMessage = s.object(
  {
    role: s.stringEnum(["system", "user", "assistant", "developer"], {
      description: "The role of the message author.",
    }),
    content: s.union([
      s.string({ description: "Plain text content for a simple message." }),
      s.array(responseInputContentBlock, { minItems: 1, description: "Structured multimodal content blocks." }),
    ]),
  },
  { required: ["role", "content"], description: "A message in the Responses API input array." },
);
const responseInputValue = s.union([
  s.string({ description: "A plain text prompt." }),
  s.array(responseInputMessage, { minItems: 1, description: "An ordered array of conversation messages." }),
]);
const responseText = s.object(
  {
    format: s.union([
      s.object(
        { type: s.literal("json_object", { description: "The format type. Must be json_object." }) },
        { required: ["type"], description: "A flexible JSON object output format." },
      ),
      s.object(
        {
          type: s.literal("json_schema", { description: "The format type. Must be json_schema." }),
          name: s.string({ description: "The schema name reported to the model." }),
          schema: jsonObject,
          strict: s.boolean({ description: "Whether the model must strictly follow the declared schema." }),
        },
        { required: ["type", "name", "schema"], description: "A JSON Schema output format." },
      ),
    ]),
  },
  { description: "Text output configuration for the response." },
);
const createResponseInput = input(
  "The input payload for creating a non-streaming OpenAI response.",
  {
    model: s.string({ description: "The model to use for the response." }),
    input: responseInputValue,
    instructions: s.string({ description: "A top-level instruction string applied before the input." }),
    max_output_tokens: s.integer({ minimum: 1, description: "The maximum number of output tokens to generate." }),
    metadata: stringMetadata,
    previous_response_id: s.string({ description: "The ID of a previous response to continue from." }),
    store: s.boolean({ description: "Whether the response may be stored by the upstream platform." }),
    temperature: s.number({ minimum: 0, maximum: 2, description: "The sampling temperature." }),
    text: responseText,
    top_p: s.number({ minimum: 0, maximum: 1, description: "The nucleus sampling threshold." }),
    user: s.string({ description: "An end-user identifier passed through to the upstream API." }),
    stream: s.boolean({
      description: "Whether to request a streaming response. This connector only accepts false or an omitted value.",
    }),
  },
  ["model", "input"],
);
const embeddingInput = s.union([
  s.string({ description: "A single input string to embed." }),
  s.array(s.string({ description: "One input string." }), { minItems: 1, description: "A batch of input strings." }),
  s.array(s.integer({ description: "A single token ID." }), {
    minItems: 1,
    description: "A tokenized input sequence.",
  }),
  s.array(s.array(s.integer({ description: "A single token ID." }), { minItems: 1 }), {
    minItems: 1,
    description: "A batch of tokenized input sequences.",
  }),
]);
const embeddingsOutput = s.object(
  {
    object: s.string({ description: "The top-level object type." }),
    data: s.array(jsonObject, { description: "The embedding items returned by the API." }),
    model: s.string({ description: "The model that generated the embeddings." }),
    usage: jsonObject,
  },
  {
    required: ["object", "data", "model", "usage"],
    additionalProperties: true,
    description: "The response payload for creating OpenAI embeddings.",
  },
);
const moderationInputItem = s.object(
  {
    type: s.stringEnum(["text", "image_url"], { description: "The moderation input type." }),
    text: s.string({ description: "The text content when the input type is text." }),
    image_url: s.union([s.string({ description: "A direct image URL." }), jsonObject]),
  },
  { required: ["type"], description: "A multimodal moderation input item." },
);
const imageData = s.object(
  {
    b64_json: s.string({ description: "The generated image encoded as base64." }),
    url: s.string({ description: "The signed image URL returned by the API." }),
    revised_prompt: s.string({ description: "The prompt potentially revised by the model before generation." }),
  },
  { additionalProperties: true, description: "One generated image item returned by the API." },
);
const audioTextResponse = s.object(
  {
    text: s.string({ description: "The transcribed or translated text." }),
    language: s.string({ description: "The detected or returned language code." }),
    duration: s.number({ description: "The duration of the processed audio in seconds." }),
    segments: s.array(jsonObject, { description: "The segment-level timing details." }),
    words: s.array(jsonObject, { description: "The word-level timing details." }),
    logprobs: s.array(jsonObject, { description: "The token log probabilities, if requested." }),
    usage: jsonObject,
  },
  { additionalProperties: true, description: "The normalized payload returned by an OpenAI audio text endpoint." },
);
const batchObject = s.object(
  {
    id: s.string({ description: "The batch identifier." }),
    object: s.string({ description: "The object type returned by the API." }),
    endpoint: s.string({ description: "The endpoint executed for each batch request." }),
    input_file_id: s.string({ description: "The input file identifier used by the batch." }),
    output_file_id: s.string({ description: "The output file identifier created by the batch." }),
    error_file_id: s.string({ description: "The error file identifier created by the batch." }),
    completion_window: s.string({ description: "The completion window requested for the batch." }),
    status: s.string({ description: "The current status of the batch." }),
    metadata: stringMetadata,
    request_counts: jsonObject,
    errors: s.unknown("The batch errors returned by the API."),
    created_at: s.integer({ description: "The Unix timestamp when the batch was created." }),
    in_progress_at: s.integer({ description: "The Unix timestamp when the batch started processing." }),
    finalizing_at: s.integer({ description: "The Unix timestamp when the batch started finalizing." }),
    completed_at: s.integer({ description: "The Unix timestamp when the batch completed." }),
    cancelling_at: s.integer({ description: "The Unix timestamp when the batch started cancelling." }),
    cancelled_at: s.integer({ description: "The Unix timestamp when the batch was cancelled." }),
    failed_at: s.integer({ description: "The Unix timestamp when the batch failed." }),
    expired_at: s.integer({ description: "The Unix timestamp when the batch expired." }),
    expires_at: s.integer({ description: "The Unix timestamp when the batch will expire." }),
  },
  { required: ["id"], additionalProperties: true, description: "An OpenAI batch object." },
);

const actions: OpenAiActionSource[] = [
  action(
    "list_models",
    "read",
    "List the OpenAI models available to the current API key.",
    noInput,
    s.object(
      {
        object: s.string({ description: "The top-level object type." }),
        data: s.array(model, { description: "The list of available models." }),
      },
      {
        required: ["object", "data"],
        additionalProperties: true,
        description: "The response payload for listing OpenAI models.",
      },
    ),
    ["openai.get_model"],
  ),
  action(
    "get_model",
    "read",
    "Retrieve the metadata for a single OpenAI model by ID.",
    input(
      "The input payload for retrieving a single OpenAI model.",
      {
        model: s.string({ description: "The exact model identifier to retrieve." }),
      },
      ["model"],
    ),
    model,
  ),
  action(
    "create_response",
    "write",
    "Create a non-streaming OpenAI response through the Responses API.",
    createResponseInput,
    responsePayload,
  ),
  action(
    "get_response",
    "read",
    "Retrieve one stored OpenAI response by its identifier.",
    input(
      "The input payload for retrieving one stored OpenAI response.",
      {
        response_id: s.string({ description: "The response identifier." }),
        include: responseInclude,
      },
      ["response_id"],
    ),
    responsePayload,
  ),
  action(
    "list_input_items",
    "read",
    "List the stored input items for one OpenAI response.",
    input(
      "The input payload for listing stored response input items.",
      {
        response_id: s.string({ description: "The response identifier whose input items should be listed." }),
        after: s.string({ description: "Return items after this item identifier." }),
        include: inputItemsInclude,
        limit: s.integer({ minimum: 1, description: "The maximum number of input items to return." }),
        order: s.stringEnum(["asc", "desc"], { description: "The sort order for returned items." }),
      },
      ["response_id"],
    ),
    s.object(
      {
        object: s.string({ description: "The object type returned by the API." }),
        data: s.array(jsonObject, { description: "The returned input items." }),
        first_id: s.string({ description: "The first item identifier in the page." }),
        last_id: s.string({ description: "The last item identifier in the page." }),
        has_more: s.boolean({ description: "Whether more input items are available." }),
      },
      {
        required: ["data"],
        additionalProperties: true,
        description: "The response payload for listing stored response input items.",
      },
    ),
  ),
  action(
    "get_input_token_counts",
    "read",
    "Count how many input tokens a Responses-style OpenAI request would consume.",
    input("The input payload for counting input tokens for a Responses-style request.", {
      model: s.string({ description: "The model used for counting the input tokens." }),
      input: responseInputValue,
      instructions: s.string({ description: "Top-level instructions to include in the token count." }),
      previous_response_id: s.string({ description: "A previous response identifier to continue counting from." }),
      text: responseText,
      truncation: s.string({ description: "The truncation mode to apply before counting." }),
    }),
    s.object(
      {
        object: s.string({ description: "The object type returned by the API." }),
        input_tokens: s.integer({ description: "The number of input tokens the request would consume." }),
      },
      {
        required: ["input_tokens"],
        additionalProperties: true,
        description: "The token count payload returned by the Responses input token count API.",
      },
    ),
  ),
  action(
    "create_embeddings",
    "write",
    "Create embeddings with an OpenAI embedding model.",
    input(
      "The input payload for creating OpenAI embeddings.",
      {
        input: embeddingInput,
        model: s.string({ description: "The embedding model to use." }),
        dimensions: s.integer({ minimum: 1, description: "The number of embedding dimensions to request." }),
        encoding_format: s.stringEnum(["float", "base64"], { description: "The embedding encoding format to return." }),
        user: s.string({ description: "An end-user identifier passed through to the upstream API." }),
      },
      ["input", "model"],
    ),
    embeddingsOutput,
  ),
  action(
    "create_moderation",
    "write",
    "Classify text or image inputs with the OpenAI Moderations API.",
    input(
      "The input payload for creating an OpenAI moderation request.",
      {
        input: s.union([
          s.string({ description: "A single text input." }),
          s.array(s.union([s.string({ description: "One text input." }), moderationInputItem]), {
            minItems: 1,
            description: "A batch of moderation inputs.",
          }),
        ]),
        model: s.string({ description: "The moderation model to use." }),
      },
      ["input"],
    ),
    s.object(
      {
        id: s.string({ description: "The moderation request identifier." }),
        model: s.string({ description: "The moderation model used for the request." }),
        results: s.array(jsonObject, { description: "The moderation results for each input." }),
      },
      {
        required: ["id", "model", "results"],
        additionalProperties: true,
        description: "The response payload for creating an OpenAI moderation request.",
      },
    ),
  ),
  action(
    "create_image",
    "write",
    "Generate images with the OpenAI image generation API.",
    input(
      "The input payload for creating one or more OpenAI images.",
      {
        prompt: s.string({ description: "The prompt used to generate the image." }),
        model: s.string({ description: "The image generation model to use." }),
        background: s.stringEnum(["auto", "opaque", "transparent"], {
          description: "The background treatment to request for generated images.",
        }),
        moderation: s.string({ description: "The moderation level applied to the generation." }),
        n: s.integer({ minimum: 1, description: "The number of images to generate." }),
        output_compression: s.integer({
          minimum: 0,
          maximum: 100,
          description: "The output compression level to apply.",
        }),
        output_format: s.stringEnum(["png", "jpeg", "webp"], { description: "The image output format to request." }),
        partial_images: s.integer({
          minimum: 0,
          description: "The number of partial images to stream before completion.",
        }),
        quality: s.string({ description: "The image quality to request." }),
        response_format: s.stringEnum(["b64_json", "url"], { description: "The image payload format to return." }),
        size: s.string({ description: "The requested image size." }),
        stream: s.boolean({
          description:
            "Whether to request a streaming image generation response. This connector only accepts false or an omitted value.",
        }),
        user: s.string({ description: "An end-user identifier passed through to the upstream API." }),
      },
      ["prompt"],
    ),
    s.object(
      {
        created: s.integer({ description: "The Unix timestamp when the image response was created." }),
        data: s.array(imageData, { description: "The generated image items returned by the API." }),
        usage: jsonObject,
      },
      {
        required: ["data"],
        additionalProperties: true,
        description: "The response payload for creating OpenAI images.",
      },
    ),
  ),
  action(
    "create_speech",
    "write",
    "Synthesize speech audio from text with the OpenAI audio speech API.",
    input(
      "The input payload for creating OpenAI speech audio.",
      {
        model: s.string({ description: "The text-to-speech model to use." }),
        input: s.string({ description: "The text to synthesize into speech." }),
        voice: s.union([s.string({ description: "A built-in voice name." }), jsonObject]),
        instructions: s.string({ description: "Optional voice instructions that guide the synthesis style." }),
        response_format: s.stringEnum(["mp3", "opus", "aac", "flac", "wav", "pcm"], {
          description: "The audio format to return.",
        }),
        speed: s.number({ minimum: 0.25, maximum: 4, description: "The playback speed multiplier." }),
        stream_format: s.stringEnum(["audio", "sse"], {
          description: "The speech response delivery format. This connector only accepts audio or an omitted value.",
        }),
      },
      ["model", "input", "voice"],
    ),
    output("The normalized speech audio payload returned by the connector.", {
      content_base64: s.string({ description: "The synthesized audio encoded as base64." }),
      content_type: s.string({ description: "The MIME type of the synthesized audio." }),
    }),
  ),
  action(
    "create_audio_transcription",
    "write",
    "Transcribe one uploaded audio file with the OpenAI audio transcription API.",
    input(
      "The input payload for creating an OpenAI audio transcription.",
      {
        file: audioUploadFile,
        model: s.string({ description: "The transcription model to use." }),
        chunking_strategy: jsonObject,
        include: s.array(s.string({ description: "One additional response field to include." }), {
          minItems: 1,
          description: "Additional response fields to include.",
        }),
        language: s.string({ description: "The language code of the source audio." }),
        prompt: s.string({ description: "A guiding prompt for the transcription." }),
        response_format: s.string({ description: "The response format to return." }),
        stream: s.boolean({
          description:
            "Whether to request a streaming transcription response. This connector only accepts false or an omitted value.",
        }),
        temperature: s.number({ minimum: 0, maximum: 1, description: "The sampling temperature." }),
        timestamp_granularities: s.array(s.stringEnum(["word", "segment"]), {
          minItems: 1,
          description: "The timestamp granularities to include.",
        }),
      },
      ["file", "model"],
    ),
    audioTextResponse,
  ),
  action(
    "create_audio_translation",
    "write",
    "Translate one uploaded audio file into English with the OpenAI audio translation API.",
    input(
      "The input payload for creating an OpenAI audio translation.",
      {
        file: audioUploadFile,
        model: s.string({ description: "The translation model to use." }),
        prompt: s.string({ description: "A guiding prompt for the translation." }),
        response_format: s.string({ description: "The response format to return." }),
        temperature: s.number({ minimum: 0, maximum: 1, description: "The sampling temperature." }),
      },
      ["file", "model"],
    ),
    audioTextResponse,
  ),
  action(
    "create_batch",
    "write",
    "Create an OpenAI batch job from an uploaded input file.",
    input(
      "The input payload for creating an OpenAI batch.",
      {
        input_file_id: s.string({ description: "The uploaded input file identifier to process." }),
        endpoint: s.string({ description: "The API endpoint executed for each batch item." }),
        completion_window: s.string({ description: "The requested completion window, such as `24h`." }),
        metadata: stringMetadata,
      },
      ["input_file_id", "endpoint", "completion_window"],
    ),
    batchObject,
  ),
  action("get_batch", "read", "Fetch one OpenAI batch job by its identifier.", batchIdInput(), batchObject),
  action(
    "cancel_batch",
    "destructive",
    "Cancel one in-progress OpenAI batch job by its identifier.",
    batchIdInput(),
    batchObject,
  ),
];

export type OpenAiActionName =
  | "list_models"
  | "get_model"
  | "create_response"
  | "get_response"
  | "list_input_items"
  | "get_input_token_counts"
  | "create_embeddings"
  | "create_moderation"
  | "create_image"
  | "create_speech"
  | "create_audio_transcription"
  | "create_audio_translation"
  | "create_batch"
  | "get_batch"
  | "cancel_batch";

export const openaiActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    name: source.name,
    operationType: source.operationType,
    description: source.description,
    requiredScopes: [],
    providerPermissions: [],
    followUpActions: source.followUpActions,
    inputSchema: source.inputSchema,
    outputSchema: source.outputSchema,
  }),
);

function action(
  name: OpenAiActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  followUpActions?: string[],
): OpenAiActionSource {
  return { name, operationType, description, inputSchema, outputSchema, followUpActions };
}

function input(description: string, properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.object(properties, { required, additionalProperties: true, description });
}

function output(description: string, properties: Record<string, JsonSchema>): JsonSchema {
  return s.object(properties, { required: Object.keys(properties), additionalProperties: true, description });
}

function batchIdInput(): JsonSchema {
  return input(
    "The input payload for a batch lookup action.",
    {
      batch_id: s.string({ description: "The batch identifier." }),
    },
    ["batch_id"],
  );
}
