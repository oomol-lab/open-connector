import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gemini";

const jsonObjectSchema = s.looseObject("A JSON-like object with arbitrary string keys.");

const modelSummarySchema = s.object(
  "A Gemini model summary record.",
  {
    name: s.string("The model resource name."),
    version: s.string("The model version string."),
    topK: s.integer("The default top-K sampling value."),
    topP: s.number("The default top-P sampling value."),
    thinking: s.boolean("Whether the model supports thinking mode."),
    baseModelId: s.string("The base model identifier."),
    description: s.string("The model description."),
    displayName: s.string("The human-readable model display name."),
    temperature: s.number("The default temperature value."),
    maxTemperature: s.number("The maximum allowed temperature."),
    inputTokenLimit: s.integer("The maximum input token count."),
    outputTokenLimit: s.integer("The maximum output token count."),
    supportedGenerationMethods: s.stringArray("The generation methods supported by the model."),
  },
  { required: ["name", "version"] },
);

const safetySettingSchema = s.requiredObject("A Gemini content safety setting.", {
  category: s.string("The harm category name."),
  threshold: s.string("The blocking threshold level."),
});

const downloadableFileSchema = s.requiredObject("A downloadable file with a transit URL.", {
  name: s.string("The file name."),
  mimetype: s.string("The MIME type."),
  downloadUrl: s.url("The local transit URL for downloading the file."),
});

const generationInputProperties: Record<string, JsonSchema> = {
  model: s.string("The model name to use."),
  top_k: s.integer("The top-K sampling parameter."),
  top_p: s.number("The top-P sampling parameter."),
  temperature: s.number("The sampling temperature."),
  safety_settings: s.array("The safety settings to apply.", safetySettingSchema),
  max_output_tokens: s.integer("The maximum number of output tokens."),
  system_instruction: s.string("The system instruction prepended to the prompt."),
};

const aspectRatioSchema = s.stringEnum("The image aspect ratio.", [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
]);

export const geminiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "List the available Gemini and Veo models.",
    inputSchema: s.actionInput(
      {
        filter_prefix: s.string("The model name prefix to filter by."),
      },
      [],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput(
      {
        raw: s.object(
          "The raw API response.",
          {
            models: s.array("The raw model records.", modelSummarySchema),
            nextPageToken: s.string("The token for fetching the next page."),
          },
          { required: ["models"] },
        ),
        models: s.array("The parsed model records.", modelSummarySchema),
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "generate_content",
    description: "Generate text or speech audio with Gemini models.",
    inputSchema: s.actionInput(
      {
        ...generationInputProperties,
        prompt: s.nonEmptyString("The text prompt to send to the model."),
        voice_name: s.string("The voice name for speech audio output."),
        stop_sequences: s.stringArray("The sequences that stop generation."),
      },
      ["prompt"],
      "The input payload for this action.",
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        raw: jsonObjectSchema,
        text: s.string("The generated text content."),
        mime_type: s.string("The MIME type of the response."),
        audio_data: s.string("The base64-encoded audio data."),
        candidates: s.array("The candidate responses.", jsonObjectSchema),
        usage_metadata: jsonObjectSchema,
        message: s.string("The execution status message."),
      },
      { required: ["raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "embed_content",
    description: "Generate Gemini embeddings for text content.",
    inputSchema: s.actionInput(
      {
        text: s.nonEmptyString("The text to generate embeddings for."),
        model: s.string("The embedding model name to use."),
        title: s.string("The optional title for the embedding content."),
        task_type: s.string("The task type hint for the embedding model."),
        output_dimensionality: s.integer("The desired embedding dimensionality."),
      },
      ["text"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput(
      {
        embedding: s.array("The embedding vector values.", s.number("An embedding vector value.")),
        dimensions: s.integer("The number of embedding dimensions."),
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "count_tokens",
    description: "Count the Gemini token usage for input text.",
    inputSchema: s.actionInput(
      {
        text: s.nonEmptyString("The text to count tokens for."),
        model: s.string("The model name to use for tokenization."),
      },
      ["text"],
      "The input payload for this action.",
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        total_tokens: s.integer("The total token count."),
        token_details: s.array(
          "The per-modality token count breakdown.",
          s.requiredObject("A per-modality token count entry.", {
            modality: s.string("The content modality."),
            token_count: s.integer("The token count for this modality."),
          }),
        ),
      },
      { required: ["total_tokens"] },
    ),
  }),
  defineProviderAction(service, {
    name: "generate_image",
    description: "Generate an image with Gemini and return a transit URL.",
    inputSchema: s.actionInput(
      {
        ...generationInputProperties,
        prompt: s.nonEmptyString("The text prompt describing the image to generate."),
        timeout: s.number("The request timeout in milliseconds."),
        image_size: s.stringEnum("The target image resolution.", ["1K", "2K", "4K"]),
        aspect_ratio: aspectRatioSchema,
      },
      ["prompt"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput(
      {
        image: downloadableFileSchema,
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "generate_videos",
    description: "Start a Gemini Veo video generation operation.",
    inputSchema: s.actionInput(
      {
        seed: s.integer("The random seed for reproducibility."),
        model: s.string("The Veo model name to use."),
        prompt: s.nonEmptyString("The text prompt describing the video to generate."),
        resolution: s.stringEnum("The video resolution.", ["720p", "1080p"]),
        aspect_ratio: s.stringEnum("The video aspect ratio.", ["16:9", "9:16"]),
        negative_prompt: s.string("The negative prompt describing content to avoid."),
        duration_seconds: {
          type: "integer",
          enum: [4, 5, 6, 7, 8],
          description: "The video duration in seconds.",
        },
        person_generation: s.stringEnum("The person generation policy.", ["dont_allow", "allow_adult", "allow_all"]),
      },
      ["prompt"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput(
      {
        raw: jsonObjectSchema,
        operation_name: s.string("The long-running operation name."),
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_videos_operation",
    description: "Fetch the current status for a Gemini Veo operation.",
    inputSchema: s.actionInput(
      {
        operation_name: s.nonEmptyString("The long-running Veo operation name."),
      },
      ["operation_name"],
      "The input payload for this action.",
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        done: s.boolean("Whether the Veo operation has finished."),
        error: s.requiredObject("The operation error payload.", {
          code: s.integer("The API error code returned for the operation."),
          message: s.string("The API error message returned for the operation."),
        }),
        response: jsonObjectSchema,
        video_urls: s.stringArray("The generated video URLs when the operation succeeds."),
      },
      { required: ["done", "video_urls"] },
    ),
  }),
  defineProviderAction(service, {
    name: "wait_for_video",
    description: "Poll a Gemini Veo operation and return the finished video via transit URL.",
    inputSchema: s.actionInput(
      {
        operation_name: s.nonEmptyString("The long-running Veo operation name."),
      },
      ["operation_name"],
      "The input payload for this action.",
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        success: s.boolean("Whether the polling completed with a finished video."),
        video_file: downloadableFileSchema,
        rai_filtering: s.object(
          "Responsible AI filtering details for the operation.",
          {
            message: s.string("The Responsible AI filtering summary message."),
            filtered: s.boolean("Whether any outputs were filtered."),
            filter_reasons: s.stringArray("The Responsible AI filter reasons."),
            filtered_count: s.integer("The number of filtered outputs."),
          },
          { required: ["message", "filtered_count"] },
        ),
      },
      { required: ["success"] },
    ),
  }),
];
