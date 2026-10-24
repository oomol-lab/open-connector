import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { defaultQwenImageModel } from "./actions.ts";

export const qwenApiBaseUrl = "https://dashscope.aliyuncs.com/api/v1";
const imagePath = "services/aigc/multimodal-generation/generation";
const voiceCustomizationPath = "services/audio/tts/customization";

export const qwenActionHandlers: ProviderActionHandlers<"qwen", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async extract_text(input, context): Promise<unknown> {
    const payload = await requestJson(context, "POST", imagePath, buildQwenOcrBody(input));
    return normalizeQwenOcrResponse(requiredResponseRecord(payload, "OCR response"));
  },
  async translate_text(input, context): Promise<unknown> {
    const payload = await requestJson(
      context,
      "POST",
      "services/aigc/text-generation/generation",
      buildQwenTranslationBody(input),
    );
    return normalizeQwenTranslationResponse(requiredResponseRecord(payload, "translation response"));
  },
  async create_voice_clone(input, context): Promise<unknown> {
    const payload = await requestJson(context, "POST", voiceCustomizationPath, buildCreateVoiceCloneBody(input));
    return normalizeCreatedVoice(requiredResponseRecord(payload, "voice clone response"));
  },
  async create_designed_voice(input, context): Promise<unknown> {
    const payload = await requestJson(context, "POST", voiceCustomizationPath, buildCreateDesignedVoiceBody(input));
    return normalizeDesignedVoice(requiredResponseRecord(payload, "voice design response"));
  },
  async list_custom_voices(input, context): Promise<unknown> {
    const payload = await requestJson(
      context,
      "POST",
      voiceCustomizationPath,
      buildCustomVoiceManagementBody("list_voice", input),
    );
    return normalizeCustomVoiceList(requiredResponseRecord(payload, "voice list response"), input);
  },
  async get_custom_voice(input, context): Promise<unknown> {
    const voiceId = requiredInputString(input.voiceId, "voiceId");
    const payload = await requestJson(
      context,
      "POST",
      voiceCustomizationPath,
      buildCustomVoiceManagementBody("query_voice", input),
    );
    return normalizeCustomVoice(requiredResponseRecord(payload, "voice query response"), voiceId);
  },
  async delete_custom_voice(input, context): Promise<unknown> {
    const voiceId = requiredInputString(input.voiceId, "voiceId");
    await requestJson(context, "POST", voiceCustomizationPath, buildCustomVoiceManagementBody("delete_voice", input));
    return { voiceId };
  },
  async generate_image(input, context): Promise<unknown> {
    const payload = await requestJson(context, "POST", imagePath, buildQwenImageBody(input));
    return normalizeQwenImageResponse(requiredResponseRecord(payload, "image response"));
  },
  async generate_speech(input, context): Promise<unknown> {
    const payload = await requestJson(
      context,
      "POST",
      "services/audio/tts/SpeechSynthesizer",
      buildQwenSpeechBody(input),
    );
    return normalizeQwenSpeechResponse(requiredResponseRecord(payload, "speech response"));
  },
  async analyze_document(input, context): Promise<unknown> {
    const payload = await requestJson(
      context,
      "POST",
      "services/aigc/text-generation/generation",
      buildQwenDocumentBody(input),
    );
    return normalizeQwenDocumentResponse(requiredResponseRecord(payload, "document response"));
  },
  async submit_speech_recognition(input, context): Promise<unknown> {
    const payload = await requestJson(
      context,
      "POST",
      "services/audio/asr/transcription",
      buildQwenSpeechRecognitionBody(input),
      true,
    );
    const output = requiredResponseRecord(
      requiredResponseRecord(payload, "speech recognition submit response").output,
      "output",
    );
    return { taskId: requiredString(output.task_id, "output.task_id", providerResponseError) };
  },
  async get_speech_recognition(input, context): Promise<unknown> {
    const taskId = requiredInputString(input.taskId, "taskId");
    const payload = await requestJson(context, "GET", `tasks/${encodeURIComponent(taskId)}`);
    return normalizeQwenSpeechRecognitionTask(payload, taskId, context.fetcher, context.signal);
  },
  async submit_image_translation(input, context): Promise<unknown> {
    const payload = await requestJson(
      context,
      "POST",
      "services/aigc/image2image/image-synthesis",
      buildImageTranslationBody(input),
      true,
    );
    const output = requiredResponseRecord(
      requiredResponseRecord(payload, "translation submit response").output,
      "output",
    );
    return { taskId: requiredString(output.task_id, "output.task_id", providerResponseError) };
  },
  async get_image_translation(input, context): Promise<unknown> {
    const taskId = requiredInputString(input.taskId, "taskId");
    const payload = await requestJson(context, "GET", `tasks/${encodeURIComponent(taskId)}`);
    return normalizeImageTranslationTask(payload, taskId);
  },
};

function buildQwenOcrBody(input: Record<string, unknown>): Record<string, unknown> {
  const task = optionalString(input.task) ?? "text_recognition";
  const resultSchema = optionalRecord(input.resultSchema);
  if (resultSchema && task !== "key_information_extraction")
    throw inputError("resultSchema requires task key_information_extraction");
  return {
    model: "qwen3.5-ocr",
    input: {
      messages: [
        {
          role: "user",
          content: [
            compactObject({
              image: requiredInputString(input.fileUrl, "fileUrl"),
              enable_rotate: optionalBoolean(input.enableRotate) ?? false,
              min_pixels: optionalInteger(input.minPixels),
              max_pixels: optionalInteger(input.maxPixels),
            }),
          ],
        },
      ],
    },
    parameters: {
      ocr_options: compactObject({
        task,
        task_config: resultSchema ? { result_schema: resultSchema } : undefined,
      }),
    },
  };
}

function normalizeQwenOcrResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "output");
  const choices = objectArray(output.choices, "output.choices", providerResponseError);
  const message = requiredResponseRecord(choices[0]?.message, "output.choices.message");
  const content = objectArray(message.content, "output.choices.message.content", providerResponseError)[0];
  const usage = requiredResponseRecord(payload.usage, "usage");
  return compactObject({
    content: requiredString(content?.text, "output.choices.message.content.text", providerResponseError),
    details: optionalRecord(content?.ocr_result),
    model: optionalString(payload.model) ?? "qwen3.5-ocr",
    inputTokens: optionalInteger(usage.input_tokens) ?? 0,
    outputTokens: optionalInteger(usage.output_tokens) ?? 0,
    imageTokens: optionalInteger(usage.image_tokens) ?? 0,
  });
}

function buildQwenTranslationBody(input: Record<string, unknown>): Record<string, unknown> {
  const terms = optionalInputObjectArray(input.terms, "terms")?.map((item) => ({
    source: requiredInputString(item.source, "terms.source"),
    target: requiredInputString(item.target, "terms.target"),
  }));
  const translationMemory = optionalInputObjectArray(input.translationMemory, "translationMemory")?.map((item) => ({
    source: requiredInputString(item.source, "translationMemory.source"),
    target: requiredInputString(item.target, "translationMemory.target"),
  }));
  return {
    model: optionalString(input.model) ?? "qwen-mt-flash",
    input: { messages: [{ role: "user", content: requiredInputString(input.text, "text") }] },
    parameters: {
      result_format: "message",
      translation_options: compactObject({
        source_lang: optionalString(input.sourceLanguage) ?? "auto",
        target_lang: requiredInputString(input.targetLanguage, "targetLanguage"),
        terms,
        tm_list: translationMemory,
        domains: optionalString(input.domainPrompt),
      }),
    },
  };
}

function normalizeQwenTranslationResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "output");
  const choices = objectArray(output.choices, "output.choices", providerResponseError);
  const message = requiredResponseRecord(choices[0]?.message, "output.choices.message");
  const usage = requiredResponseRecord(payload.usage, "usage");
  return {
    text: requiredString(message.content, "output.choices.message.content", providerResponseError),
    model: optionalString(output.model_name) ?? optionalString(payload.model) ?? "qwen-mt-flash",
    inputTokens: optionalInteger(usage.input_tokens) ?? 0,
    outputTokens: optionalInteger(usage.output_tokens) ?? 0,
  };
}

export function buildCreateVoiceCloneBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    model: "voice-enrollment",
    input: compactObject({
      action: "create_voice",
      target_model: optionalString(input.targetModel) ?? "qwen-audio-3.0-tts-flash",
      prefix: requiredInputString(input.prefix, "prefix"),
      url: requiredInputString(input.audioUrl, "audioUrl"),
      language_hints: optionalStringArray(input.languageHints),
      max_prompt_audio_length: optionalNumber(input.maxPromptAudioLength),
      enable_preprocess: optionalBoolean(input.enablePreprocess),
      enable_volume_normalization:
        typeof input.enableVolumeNormalization === "boolean" ? String(input.enableVolumeNormalization) : undefined,
    }),
  };
}

export function buildCreateDesignedVoiceBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    model: "voice-enrollment",
    input: compactObject({
      action: "create_voice",
      target_model: optionalString(input.targetModel) ?? "qwen-audio-3.0-tts-flash",
      prefix: requiredInputString(input.prefix, "prefix"),
      voice_prompt: requiredInputString(input.voicePrompt, "voicePrompt"),
      preview_text: requiredInputString(input.previewText, "previewText"),
      language_hints: optionalStringArray(input.languageHints),
    }),
    parameters: {
      sample_rate: optionalInteger(input.sampleRate) ?? 24000,
      response_format: optionalString(input.responseFormat) ?? "wav",
    },
  };
}

export function buildCustomVoiceManagementBody(
  action: "list_voice" | "query_voice" | "delete_voice",
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    model: "voice-enrollment",
    input: compactObject({
      action,
      prefix: action === "list_voice" ? optionalString(input.prefix) : undefined,
      page_index: action === "list_voice" ? (optionalInteger(input.pageIndex) ?? 0) : undefined,
      page_size: action === "list_voice" ? (optionalInteger(input.pageSize) ?? 10) : undefined,
      voice_id: action === "list_voice" ? undefined : requiredInputString(input.voiceId, "voiceId"),
    }),
  };
}

export function normalizeCreatedVoice(payload: Record<string, unknown>): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "voice output");
  return { voiceId: requiredString(output.voice_id, "output.voice_id", providerResponseError) };
}

export function normalizeDesignedVoice(payload: Record<string, unknown>): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "voice design output");
  const previewAudio = requiredResponseRecord(output.preview_audio, "output.preview_audio");
  return {
    voiceId: requiredString(output.voice_id, "output.voice_id", providerResponseError),
    previewAudio: requiredString(previewAudio.data, "output.preview_audio.data", providerResponseError),
    sampleRate: optionalInteger(previewAudio.sample_rate) ?? 0,
    responseFormat: requiredString(
      previewAudio.response_format,
      "output.preview_audio.response_format",
      providerResponseError,
    ),
  };
}

export function normalizeCustomVoiceList(
  payload: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "voice list output");
  const voices = objectArray(output.voice_list, "output.voice_list", providerResponseError).map((voice) =>
    normalizeCustomVoiceFields(
      voice,
      requiredString(voice.voice_id, "output.voice_list.voice_id", providerResponseError),
    ),
  );
  return {
    voices,
    pageIndex: optionalInteger(output.page_index) ?? optionalInteger(input.pageIndex) ?? 0,
    pageSize: optionalInteger(output.page_size) ?? optionalInteger(input.pageSize) ?? 10,
    totalCount: optionalInteger(output.total_count) ?? voices.length,
  };
}

export function normalizeCustomVoice(payload: Record<string, unknown>, voiceId: string): Record<string, unknown> {
  return normalizeCustomVoiceFields(requiredResponseRecord(payload.output, "voice query output"), voiceId);
}

function normalizeCustomVoiceFields(voice: Record<string, unknown>, voiceId: string): Record<string, unknown> {
  return compactObject({
    voiceId,
    targetModel: optionalString(voice.target_model),
    status: optionalString(voice.status),
    createdAt: optionalString(voice.gmt_create),
    modifiedAt: optionalString(voice.gmt_modified),
    voicePrompt: optionalString(voice.voice_prompt),
    previewText: optionalString(voice.preview_text),
    resourceUrl: optionalString(voice.resource_link),
  });
}

export function buildQwenDocumentBody(input: Record<string, unknown>): Record<string, unknown> {
  const documentUrls = optionalStringArray(input.documentUrls);
  const text = optionalString(input.text);
  if ((documentUrls?.length ? 1 : 0) + (text ? 1 : 0) !== 1)
    throw inputError("exactly one of documentUrls or text is required");
  const instruction = requiredInputString(input.instruction, "instruction");
  const userContent = documentUrls
    ? [
        { type: "text", text: instruction },
        {
          type: "doc_url",
          doc_url: documentUrls,
          file_parsing_strategy: optionalString(input.fileParsingStrategy) ?? "auto",
        },
      ]
    : `${instruction}\n\n${text}`;
  return {
    model: "qwen-doc-turbo",
    input: {
      messages: [
        {
          role: "system",
          content: optionalString(input.systemPrompt) ?? "You are a helpful assistant.",
        },
        { role: "user", content: userContent },
      ],
    },
  };
}

export function normalizeQwenDocumentResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "output");
  const choices = objectArray(output.choices, "output.choices", providerResponseError);
  const message = requiredResponseRecord(choices[0]?.message, "output.choices.message");
  const usage = optionalRecord(payload.usage);
  return {
    content: requiredString(message.content, "output.choices.message.content", providerResponseError),
    model: optionalString(payload.model) ?? "qwen-doc-turbo",
    inputTokens: optionalInteger(usage?.input_tokens) ?? 0,
    outputTokens: optionalInteger(usage?.output_tokens) ?? 0,
  };
}

export function buildQwenSpeechRecognitionBody(input: Record<string, unknown>): Record<string, unknown> {
  const vocabulary = optionalInputObjectArray(input.vocabulary, "vocabulary");
  const vocabularyMap = vocabulary
    ? Object.fromEntries(
        vocabulary.map((item) => [
          requiredInputString(item.text, "vocabulary.text"),
          requiredHotwordWeight(item.weight),
        ]),
      )
    : undefined;
  const context = optionalInputObjectArray(input.context, "context")?.flatMap((turn) => [
    {
      role: "user",
      content: [{ type: "input_text", text: requiredInputString(turn.userText, "context.userText") }],
    },
    {
      role: "assistant",
      content: [{ type: "text", text: requiredInputString(turn.assistantText, "context.assistantText") }],
    },
  ]);
  const speakerCount = optionalInteger(input.speakerCount);
  if (speakerCount !== undefined && optionalBoolean(input.diarizationEnabled) !== true)
    throw inputError("speakerCount requires diarizationEnabled");
  return {
    model: "qwen-audio-3.0-asr-flash-filetrans",
    input: compactObject({ file_urls: [requiredInputString(input.fileUrl, "fileUrl")], context }),
    parameters: compactObject({
      language_hints: optionalStringArray(input.languageHints),
      channel_id: optionalIntegerArray(input.channelIds, "channelIds") ?? [0],
      vocabulary_id: optionalString(input.vocabularyId),
      vocabulary: vocabularyMap,
      special_word_filter: optionalString(input.specialWordFilter),
      diarization_enabled: optionalBoolean(input.diarizationEnabled) ?? false,
      speaker_count: speakerCount,
    }),
  };
}

export async function normalizeQwenSpeechRecognitionTask(
  payload: unknown,
  fallbackTaskId: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = requiredResponseRecord(payload, "speech recognition task response");
  const output = requiredResponseRecord(response.output, "output");
  const taskId = optionalString(output.task_id) ?? fallbackTaskId;
  const status = requiredString(output.task_status, "output.task_status", providerResponseError);
  if (status === "PENDING" || status === "RUNNING") return { taskId, state: "processing" };
  if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
    return compactObject({
      taskId,
      state: status === "FAILED" ? "failed" : status === "CANCELED" ? "cancelled" : "expired",
      error: compactObject({ code: optionalString(output.code), message: optionalString(output.message) }),
    });
  }
  if (status !== "SUCCEEDED") throw providerResponseError(`Qwen returned an unknown task status: ${status}`);
  const results = objectArray(output.results, "output.results", providerResponseError);
  const succeeded = results.find((result) => optionalString(result.subtask_status) === "SUCCEEDED");
  if (!succeeded) {
    return compactObject({
      taskId,
      state: "failed",
      error: compactObject({ code: optionalString(results[0]?.code), message: optionalString(results[0]?.message) }),
    });
  }
  const transcriptionUrl = requiredString(
    succeeded.transcription_url,
    "output.results.transcription_url",
    providerResponseError,
  );
  const transcription = await runProviderRequest(
    { label: "Qwen transcription download", signal, timeoutMs: 180_000 },
    async (requestSignal) => {
      const response = await fetcher(transcriptionUrl, {
        headers: { accept: "application/json" },
        signal: requestSignal,
      });
      const body = await readProviderJsonBody(response, {
        emptyBody: {},
        invalidJsonMessage: "Qwen returned an invalid transcription JSON response",
      });
      if (!response.ok)
        throw new ProviderRequestError(502, `Qwen transcription download failed with HTTP ${response.status}`);
      return body;
    },
  );
  const record = requiredResponseRecord(transcription, "transcription");
  const usage = optionalRecord(response.usage);
  return {
    taskId,
    state: "succeeded",
    transcriptionUrl,
    fileUrl: requiredString(record.file_url, "transcription.file_url", providerResponseError),
    duration: optionalInteger(usage?.duration) ?? 0,
    transcripts: normalizeSpeechTranscripts(record.transcripts),
  };
}

function normalizeSpeechTranscripts(value: unknown): Record<string, unknown>[] {
  return objectArray(value, "transcription.transcripts", providerResponseError).map((transcript) => ({
    channelId: optionalInteger(transcript.channel_id) ?? 0,
    text: optionalString(transcript.text) ?? "",
    contentDuration: optionalInteger(transcript.content_duration_in_milliseconds) ?? 0,
    sentences: objectArray(transcript.sentences, "transcription.transcripts.sentences", providerResponseError).map(
      (sentence) =>
        compactObject({
          text: optionalString(sentence.text) ?? "",
          beginTime: optionalInteger(sentence.begin_time) ?? 0,
          endTime: optionalInteger(sentence.end_time) ?? 0,
          sentenceId: optionalInteger(sentence.sentence_id) ?? 0,
          speakerId: optionalInteger(sentence.speaker_id),
          language: optionalString(sentence.language),
          emotion: optionalString(sentence.emotion),
          words: Array.isArray(sentence.words)
            ? objectArray(sentence.words, "transcription.transcripts.sentences.words", providerResponseError).map(
                (word) => ({
                  text: optionalString(word.text) ?? "",
                  beginTime: optionalInteger(word.begin_time) ?? 0,
                  endTime: optionalInteger(word.end_time) ?? 0,
                  punctuation: optionalString(word.punctuation) ?? "",
                }),
              )
            : undefined,
        }),
    ),
  }));
}

export function buildQwenSpeechBody(input: Record<string, unknown>): Record<string, unknown> {
  const format = optionalString(input.format) ?? "mp3";
  if (input.bitRate !== undefined && format !== "opus") throw inputError("bitRate requires format opus");
  return {
    model: optionalString(input.model) ?? "qwen-audio-3.0-tts-flash",
    input: compactObject({
      text: requiredInputString(input.text, "text"),
      voice: optionalString(input.voice) ?? "longanhuan_v3.6",
      format,
      sample_rate: optionalInteger(input.sampleRate) ?? 22050,
      volume: optionalInteger(input.volume),
      rate: optionalNumber(input.rate),
      pitch: optionalNumber(input.pitch),
      instruction: optionalString(input.instruction),
      language_hints: optionalStringArray(input.languageHints),
      enable_ssml: optionalBoolean(input.enableSsml),
      seed: optionalInteger(input.seed),
      bit_rate: optionalInteger(input.bitRate),
      enable_aigc_tag: optionalBoolean(input.enableAigcTag),
    }),
  };
}

export function normalizeQwenSpeechResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "speech output");
  const audio = requiredResponseRecord(output.audio, "speech output.audio");
  return compactObject({
    audioUrl: requiredString(audio.url, "output.audio.url", providerResponseError),
    expiresAt: optionalInteger(audio.expires_at),
  });
}

export function buildQwenImageBody(input: Record<string, unknown>): Record<string, unknown> {
  const images = optionalStringArray(input.images) ?? [];
  if (images.length > 0 && optionalString(input.promptExtendMode) === "agent")
    throw inputError("promptExtendMode agent is only supported without reference images");
  return {
    model: optionalString(input.model) ?? defaultQwenImageModel,
    input: {
      messages: [
        {
          role: "user",
          content: [...images.map((image) => ({ image })), { text: requiredInputString(input.prompt, "prompt") }],
        },
      ],
    },
    parameters: compactObject({
      size: optionalString(input.size),
      n: optionalInteger(input.imageCount) ?? 1,
      negative_prompt: optionalString(input.negativePrompt),
      prompt_extend: optionalBoolean(input.promptExtend) ?? true,
      prompt_extend_mode: optionalString(input.promptExtendMode) ?? "direct",
      enable_thinking: optionalBoolean(input.enableThinking) ?? true,
      watermark: optionalBoolean(input.watermark) ?? false,
      seed: optionalInteger(input.seed),
    }),
  };
}

export function normalizeQwenImageResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "output");
  const usage = requiredResponseRecord(payload.usage, "usage");
  const images = objectArray(output.choices, "output.choices", providerResponseError).flatMap((choice) => {
    const message = optionalRecord(choice.message);
    return message
      ? objectArray(message.content, "output.choices.message.content", providerResponseError).flatMap((item) => {
          const image = optionalString(item.image);
          return image ? [image] : [];
        })
      : [];
  });
  if (images.length === 0) throw providerResponseError("Qwen returned no generated images");
  return compactObject({
    images,
    imageCount: optionalInteger(usage.output_image_count) ?? images.length,
    width: optionalInteger(usage.output_width),
    height: optionalInteger(usage.output_height),
    inputImageCount: optionalInteger(usage.input_image_count) ?? 0,
  });
}

export function buildImageTranslationBody(input: Record<string, unknown>): Record<string, unknown> {
  const terminologies =
    input.terminologies === undefined
      ? undefined
      : objectArray(input.terminologies, "terminologies", inputError).map((item) => ({
          src: requiredInputString(item.source, "terminologies.source"),
          tgt: requiredInputString(item.target, "terminologies.target"),
        }));
  const ext = compactObject({
    domainHint: optionalString(input.domainHint),
    sensitivities: optionalStringArray(input.sensitivities),
    terminologies,
    config:
      input.skipImageSegmentation === undefined
        ? undefined
        : { skipImgSegment: optionalBoolean(input.skipImageSegmentation) },
  });
  return {
    model: "qwen-mt-image",
    input: compactObject({
      image_url: requiredInputString(input.imageUrl, "imageUrl"),
      source_lang: optionalString(input.sourceLanguage) ?? "auto",
      target_lang: requiredInputString(input.targetLanguage, "targetLanguage"),
      ext: Object.keys(ext).length ? ext : undefined,
    }),
  };
}

export function normalizeImageTranslationTask(payload: unknown, fallbackTaskId: string): Record<string, unknown> {
  const response = requiredResponseRecord(payload, "translation task response");
  const output = requiredResponseRecord(response.output, "output");
  const taskId = optionalString(output.task_id) ?? fallbackTaskId;
  const status = requiredString(output.task_status, "output.task_status", providerResponseError);
  if (status === "PENDING" || status === "RUNNING") return { taskId, state: "processing" };
  if (status === "SUCCEEDED") {
    return {
      taskId,
      state: "succeeded",
      imageUrl: requiredString(output.image_url, "output.image_url", providerResponseError),
    };
  }
  if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
    return compactObject({
      taskId,
      state: status === "FAILED" ? "failed" : status === "CANCELED" ? "cancelled" : "expired",
      error: compactObject({ code: optionalString(output.code), message: optionalString(output.message) }),
    });
  }
  throw providerResponseError(`Qwen returned an unknown image translation task status: ${status}`);
}

export async function validateQwenCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  try {
    await requestJson({ apiKey, fetcher, signal }, "GET", "tasks/connector-credential-validation");
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || error.status !== 404) throw error;
  }
  return {
    profile: { accountId: "qwen:api_key", displayName: "Qwen Model Studio API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: qwenApiBaseUrl },
  };
}

async function requestJson(
  context: ApiKeyProviderContext,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  asynchronous = false,
): Promise<unknown> {
  context.signal?.throwIfAborted();
  return runProviderRequest({ label: "Qwen", signal: context.signal, timeoutMs: 180_000 }, async (signal) => {
    const response = await context.fetcher(new URL(path, `${qwenApiBaseUrl}/`), {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
        ...(asynchronous ? { "x-dashscope-async": "enable" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Qwen returned an invalid JSON response",
    });
    if (!response.ok) handleError(response, payload);
    return payload;
  });
}

function handleError(response: Response, payload: unknown): never {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? `Qwen request failed with HTTP ${response.status}`;
  if (response.status === 400 || response.status === 404 || response.status === 422)
    throw new ProviderRequestError(
      response.status === 404 ? 404 : 400,
      message,
      { status: response.status },
      "invalid_input",
    );
  if (response.status === 429) throw new ProviderRequestError(429, message, { status: response.status });
  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, { status: response.status });
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message, undefined, "invalid_input");
}

function optionalInputObjectArray(value: unknown, field: string): Array<Record<string, unknown>> | undefined {
  return value === undefined ? undefined : objectArray(value, field, inputError);
}

function optionalIntegerArray(value: unknown, field: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw inputError(`${field} must be an array`);
  return value.map((item) => requiredInputInteger(item, field));
}

function requiredInputInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value)) throw inputError(`${field} must be an integer`);
  return value as number;
}

function requiredHotwordWeight(value: unknown): number {
  const weight = requiredInputInteger(value, "vocabulary.weight");
  if ((1 <= weight && weight <= 5) || weight === 50) return weight;
  throw inputError("vocabulary.weight must be from 1 to 5, or 50");
}
