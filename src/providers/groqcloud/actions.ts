import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "groqcloud";

export type GroqcloudActionName =
  | "list_models"
  | "get_model"
  | "create_chat_completion"
  | "create_audio_transcription"
  | "create_audio_translation";

const nullSchema: JsonSchema = { type: "null", description: "Null value." };
const unknownJsonValueSchema = s.unknown("Any JSON value accepted by the upstream API.");
const jsonObjectSchema = s.record("Any JSON object.", unknownJsonValueSchema);
const noInputSchema = s.object("No input parameters are required for this action.", {});
const groqcloudModelSchema = s.looseObject("A GroqCloud model record.", {
  id: s.string("The model identifier."),
  object: s.string("The object type returned by the API."),
  created: s.integer("The Unix timestamp when the model was created."),
  owned_by: s.string("The organization that owns the model."),
  active: s.boolean("Whether the model is currently active."),
  context_window: s.integer("The model context window size."),
  max_completion_tokens: s.integer("The maximum completion tokens supported by the model."),
});
const listModelsOutputSchema = s.looseObject("The response payload for listing GroqCloud models.", {
  object: s.string("The top-level object type."),
  data: s.array("The list of available GroqCloud models.", groqcloudModelSchema),
});
const getModelInputSchema = s.object("The input payload for retrieving a GroqCloud model.", {
  model: s.nonEmptyString("The exact GroqCloud model identifier to retrieve."),
});
const chatMessageContentSchema = s.union(
  [
    s.string("Plain text message content."),
    s.array("Structured message content blocks.", jsonObjectSchema),
    nullSchema,
  ],
  { description: "The message content sent to the model." },
);
const chatMessageSchema = s.object(
  "A message in the OpenAI-compatible chat completion request.",
  {
    role: s.stringEnum("The role of the message author.", ["system", "user", "assistant", "tool"]),
    content: chatMessageContentSchema,
    name: s.string("The optional participant name for the message."),
    tool_call_id: s.string("The identifier of the tool call that this tool message responds to."),
    tool_calls: s.array("Tool calls emitted by the assistant.", jsonObjectSchema),
  },
  {
    required: ["role"],
    additionalProperties: true,
  },
);
const responseFormatSchema = s.object(
  "Response format configuration.",
  {
    type: s.stringEnum("The requested response format type.", ["text", "json_object", "json_schema"]),
    json_schema: jsonObjectSchema,
  },
  {
    optional: ["type", "json_schema"],
    additionalProperties: true,
  },
);
const toolChoiceSchema = s.union(
  [s.stringEnum("A predefined tool selection mode.", ["none", "auto", "required"]), jsonObjectSchema],
  { description: "Tool selection strategy for the request." },
);
const chatCompletionInputSchema = s.object(
  "The input payload for creating a non-streaming GroqCloud chat completion.",
  {
    model: s.nonEmptyString("The GroqCloud model identifier to use."),
    messages: s.array("The ordered conversation history sent to the model.", chatMessageSchema, { minItems: 1 }),
    frequency_penalty: s.number("The frequency penalty applied to repeated tokens.", { minimum: -2, maximum: 2 }),
    logit_bias: jsonObjectSchema,
    logprobs: s.boolean("Whether to include token-level log probabilities."),
    max_completion_tokens: s.positiveInteger("The maximum number of completion tokens to generate."),
    max_tokens: s.positiveInteger("The deprecated maximum token field accepted by OpenAI-compatible clients."),
    n: s.positiveInteger("The number of chat completions to generate."),
    parallel_tool_calls: s.boolean("Whether the model may call tools in parallel."),
    presence_penalty: s.number("The presence penalty applied to newly introduced tokens.", { minimum: -2, maximum: 2 }),
    response_format: responseFormatSchema,
    seed: s.integer("A seed for deterministic sampling."),
    stop: s.union(
      [s.string("A single stop sequence."), s.array("A list of stop sequences.", s.string("A stop sequence."))],
      { description: "One or more sequences where generation should stop." },
    ),
    stream: s.boolean(
      "Whether to request a streaming response. This connector only accepts false or an omitted value.",
    ),
    temperature: s.number("The sampling temperature.", { minimum: 0, maximum: 2 }),
    tool_choice: toolChoiceSchema,
    tools: s.array("Tools available to the model.", jsonObjectSchema),
    top_logprobs: s.nonNegativeInteger("The number of top token log probabilities to include."),
    top_p: s.number("The nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
    user: s.string("An end-user identifier for monitoring or abuse detection."),
  },
  {
    required: ["model", "messages"],
    additionalProperties: true,
  },
);
const chatCompletionChoiceSchema = s.looseObject("A chat completion choice.", {
  index: s.integer("The choice index."),
  message: chatMessageSchema,
  finish_reason: s.nullableString("The reason generation finished for this choice."),
  logprobs: s.nullable(jsonObjectSchema),
});
const usageSchema = s.looseObject("Token usage information.", {
  prompt_tokens: s.integer("The number of prompt tokens consumed."),
  completion_tokens: s.integer("The number of completion tokens generated."),
  total_tokens: s.integer("The total number of tokens consumed."),
});
const chatCompletionOutputSchema = s.looseObject("The response payload for a GroqCloud chat completion.", {
  id: s.string("The chat completion identifier."),
  object: s.string("The object type returned by the API."),
  created: s.integer("The Unix timestamp when the completion was created."),
  model: s.string("The model used to generate the completion."),
  choices: s.array("The generated completion choices.", chatCompletionChoiceSchema),
  usage: usageSchema,
  system_fingerprint: s.string("The backend system fingerprint for the completion."),
});

const audioModelSchema = s.stringEnum("The GroqCloud speech-to-text model identifier.", [
  "whisper-large-v3",
  "whisper-large-v3-turbo",
]);
const translationModelSchema = s.stringEnum(
  "The GroqCloud speech-to-text model identifier. Only whisper-large-v3 supports translation.",
  ["whisper-large-v3"],
);
const audioFileSchema: JsonSchema = {
  ...s.object(
    "The audio source. Provide url for GroqCloud to fetch the audio, or content_base64 to upload the bytes inline.",
    {
      name: s.nonEmptyString(
        "The file name reported to GroqCloud, including the audio file extension. Required with content_base64.",
      ),
      mimetype: s.string("The MIME type of the audio file, such as audio/mpeg."),
      url: s.nonEmptyString("A public URL that GroqCloud downloads the audio from."),
      content_base64: s.nonEmptyString("The base64-encoded audio content to upload."),
    },
    { optional: ["name", "mimetype", "url", "content_base64"] },
  ),
  anyOf: [{ required: ["url"] }, { required: ["content_base64", "name"] }],
  not: { required: ["url", "content_base64"] },
};
const audioResponseFormatSchema = s.stringEnum(
  "The transcript format to return. This connector returns structured payloads, so the plain text format is not offered.",
  ["json", "verbose_json"],
);
const audioTemperatureSchema = s.number("The sampling temperature applied to the transcription.", {
  minimum: 0,
  maximum: 1,
});
const audioPromptSchema = s.string("Optional context or style guidance for the transcript, limited to 224 tokens.");
const transcriptionInputSchema = s.object(
  "The input payload for transcribing audio with GroqCloud.",
  {
    model: audioModelSchema,
    file: audioFileSchema,
    language: s.string("The ISO-639-1 code of the spoken language, such as en, which improves accuracy and latency."),
    prompt: audioPromptSchema,
    response_format: audioResponseFormatSchema,
    temperature: audioTemperatureSchema,
    timestamp_granularities: s.array(
      "The timestamp detail to include. Requires response_format to be verbose_json.",
      s.stringEnum("A timestamp granularity.", ["word", "segment"]),
      { minItems: 1 },
    ),
  },
  { required: ["model", "file"] },
);
const translationInputSchema = s.object(
  "The input payload for translating audio into English with GroqCloud.",
  {
    model: translationModelSchema,
    file: audioFileSchema,
    prompt: audioPromptSchema,
    response_format: audioResponseFormatSchema,
    temperature: audioTemperatureSchema,
  },
  { required: ["model", "file"] },
);
const audioSegmentSchema = s.looseObject("A transcribed segment of the audio.", {
  id: s.integer("The segment index."),
  seek: s.integer("The seek offset of the segment."),
  start: s.number("The segment start time in seconds."),
  end: s.number("The segment end time in seconds."),
  text: s.string("The transcribed text for the segment."),
  tokens: s.array("The token identifiers for the segment.", s.integer("A token identifier.")),
  temperature: s.number("The sampling temperature used for the segment."),
  avg_logprob: s.number("The average log probability of the segment."),
  compression_ratio: s.number("The compression ratio of the segment."),
  no_speech_prob: s.number("The probability that the segment contains no speech."),
});
const audioWordSchema = s.looseObject("A transcribed word with timestamps.", {
  word: s.string("The transcribed word."),
  start: s.number("The word start time in seconds."),
  end: s.number("The word end time in seconds."),
});
const audioTranscriptOutputSchema = s.looseObject("The transcript payload returned by GroqCloud.", {
  text: s.string("The full transcript text."),
  language: s.string("The detected or requested language of the audio."),
  duration: s.number("The audio duration in seconds."),
  segments: s.array("The transcribed segments, returned for the verbose_json format.", audioSegmentSchema),
  words: s.array("The transcribed words, returned when word timestamp granularity is requested.", audioWordSchema),
  x_groq: jsonObjectSchema,
});

export const groqcloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "List the GroqCloud models available to the current API key.",
    inputSchema: noInputSchema,
    outputSchema: listModelsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_model",
    description: "Fetch metadata for one GroqCloud model.",
    inputSchema: getModelInputSchema,
    outputSchema: groqcloudModelSchema,
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Create a non-streaming GroqCloud OpenAI-compatible chat completion.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: chatCompletionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_audio_transcription",
    description:
      "Transcribe an audio file into text in its original language using a GroqCloud Whisper model. Supply the audio inline as base64 or as a public URL that GroqCloud downloads.",
    inputSchema: transcriptionInputSchema,
    outputSchema: audioTranscriptOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_audio_translation",
    description:
      "Translate an audio file into English text using a GroqCloud Whisper model. Supply the audio inline as base64 or as a public URL that GroqCloud downloads.",
    inputSchema: translationInputSchema,
    outputSchema: audioTranscriptOutputSchema,
  }),
];
