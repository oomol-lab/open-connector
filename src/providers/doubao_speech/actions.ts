import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "doubao_speech";
const taskIdSchema = s.nonEmptyString("The opaque Doubao Speech task identifier returned by the selected connection.");
const ttsLifecycle = {
  startActionId: "doubao_speech.submit_tts",
  statusActionId: "doubao_speech.get_tts",
};
const sttLifecycle = {
  startActionId: "doubao_speech.submit_stt",
  statusActionId: "doubao_speech.get_stt",
};

const ttsTaskSchema: JsonSchema = s.oneOf(
  [
    s.object(
      "A queued or running speech synthesis task.",
      {
        taskId: taskIdSchema,
        state: s.literal("processing", { description: "The task is processing." }),
        progress: s.number("The task progress percentage when available.", { minimum: 0, maximum: 100 }),
      },
      { required: ["taskId", "state"], optional: ["progress"] },
    ),
    s.object(
      "A completed speech synthesis task.",
      {
        taskId: taskIdSchema,
        state: s.literal("succeeded", { description: "The task succeeded." }),
        audioUrl: s.nonEmptyString("The temporary synthesized audio URL."),
        urlExpiresAt: s.integer("The Unix timestamp when the audio URL expires."),
        requestedTextLength: s.nonNegativeInteger("The requested text length reported by Doubao Speech."),
        synthesizedTextLength: s.nonNegativeInteger("The synthesized text length reported by Doubao Speech."),
      },
      {
        required: ["taskId", "state", "audioUrl"],
        optional: ["urlExpiresAt", "requestedTextLength", "synthesizedTextLength"],
      },
    ),
  ],
  { description: "The normalized Doubao speech synthesis task state." },
);

const utteranceSchema = s.object(
  "A recognized speech segment.",
  {
    text: s.string("The recognized segment text."),
    startTime: s.nonNegativeInteger("The segment start time in milliseconds."),
    endTime: s.nonNegativeInteger("The segment end time in milliseconds."),
  },
  { required: ["text", "startTime", "endTime"] },
);
const sttTaskSchema: JsonSchema = s.oneOf(
  [
    s.object(
      "A queued or running speech recognition task.",
      {
        taskId: taskIdSchema,
        state: s.literal("processing", { description: "The task is queued or processing." }),
        progress: s.number("The task progress percentage when available.", { minimum: 0, maximum: 100 }),
      },
      { required: ["taskId", "state"], optional: ["progress"] },
    ),
    s.object(
      "A completed speech recognition task.",
      {
        taskId: taskIdSchema,
        state: s.literal("succeeded", { description: "The task succeeded." }),
        text: s.string("The complete recognized text."),
        utterances: s.array("Recognized speech segments.", utteranceSchema),
        duration: s.nonNegativeInteger("The source audio duration in milliseconds."),
      },
      { required: ["taskId", "state", "text"], optional: ["utterances", "duration"] },
    ),
  ],
  { description: "The normalized Doubao speech recognition task state." },
);

export const doubaoSpeechActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_tts",
    operationType: "write",
    description: "Submit an asynchronous Doubao Speech 2.0 text-to-speech task.",
    followUpActions: [ttsLifecycle.statusActionId],
    asyncLifecycle: ttsLifecycle,
    inputSchema: s.actionInput(
      {
        text: s.string("The text to synthesize.", { minLength: 1, maxLength: 100000 }),
        voice: s.nonEmptyString("The Doubao Speech speaker ID."),
        format: s.withDefault(s.stringEnum("The synthesized audio format.", ["mp3", "wav", "pcm", "ogg_opus"]), "mp3"),
      },
      ["text", "voice"],
      "A Doubao Speech 2.0 synthesis request.",
    ),
    outputSchema: s.actionOutput({ taskId: taskIdSchema }, "The submitted speech synthesis task handle."),
  }),
  defineProviderAction(service, {
    name: "get_tts",
    operationType: "read",
    description: "Retrieve a Doubao Speech 2.0 text-to-speech task state and output.",
    asyncLifecycle: ttsLifecycle,
    inputSchema: s.actionInput({ taskId: taskIdSchema }, ["taskId"], "A speech synthesis task lookup."),
    outputSchema: ttsTaskSchema,
  }),
  defineProviderAction(service, {
    name: "submit_stt",
    operationType: "write",
    description: "Submit an asynchronous Doubao recording-file speech recognition task.",
    followUpActions: [sttLifecycle.statusActionId],
    asyncLifecycle: sttLifecycle,
    inputSchema: s.actionInput(
      {
        audioUrl: s.nonEmptyString("A public URL for the audio file to recognize."),
        format: s.stringEnum("The audio container format.", ["raw", "wav", "mp3", "ogg"]),
        language: s.string("The recognition language code, such as zh-CN or en-US."),
        enableSpeakerInfo: s.withDefault(s.boolean("Whether to return speaker clustering information."), false),
      },
      ["audioUrl", "format"],
      "A Doubao recording-file speech recognition request.",
    ),
    outputSchema: s.actionOutput({ taskId: taskIdSchema }, "The submitted speech recognition task handle."),
  }),
  defineProviderAction(service, {
    name: "get_stt",
    operationType: "read",
    description: "Retrieve a Doubao recording-file speech recognition task state and output.",
    asyncLifecycle: sttLifecycle,
    inputSchema: s.actionInput({ taskId: taskIdSchema }, ["taskId"], "A speech recognition task lookup."),
    outputSchema: sttTaskSchema,
  }),
];
