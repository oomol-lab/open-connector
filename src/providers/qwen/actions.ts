import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "qwen";
export const defaultQwenImageModel = "qwen-image-3.0";

const translationTaskIdSchema = s.nonEmptyString(
  "The opaque Qwen image translation task identifier returned by the selected connection.",
);
const speechTaskIdSchema = s.nonEmptyString(
  "The opaque Qwen speech recognition task identifier returned by the selected connection.",
);
const speechWordSchema = s.object(
  "A recognized word with timing information.",
  {
    text: s.string("The recognized word text."),
    beginTime: s.nonNegativeInteger("The word start time in milliseconds."),
    endTime: s.nonNegativeInteger("The word end time in milliseconds."),
    punctuation: s.string("The punctuation following the word."),
  },
  { required: ["text", "beginTime", "endTime", "punctuation"] },
);
const speechSentenceSchema = s.object(
  "A recognized sentence.",
  {
    text: s.string("The recognized sentence text."),
    beginTime: s.nonNegativeInteger("The sentence start time in milliseconds."),
    endTime: s.nonNegativeInteger("The sentence end time in milliseconds."),
    sentenceId: s.nonNegativeInteger("The sentence index."),
    speakerId: s.nonNegativeInteger("The detected speaker index when diarization is enabled."),
    language: s.string("The detected language code."),
    emotion: s.string("The detected emotion."),
    words: s.array("Recognized words in the sentence.", speechWordSchema),
  },
  {
    required: ["text", "beginTime", "endTime", "sentenceId"],
    optional: ["speakerId", "language", "emotion", "words"],
  },
);
const speechTranscriptSchema = s.object(
  "The transcription for one audio channel.",
  {
    channelId: s.nonNegativeInteger("The zero-based audio channel index."),
    text: s.string("The complete recognized text for the channel."),
    contentDuration: s.nonNegativeInteger("The detected speech duration in milliseconds."),
    sentences: s.array("Recognized sentences for the channel.", speechSentenceSchema),
  },
  { required: ["channelId", "text", "contentDuration", "sentences"] },
);
const qwenAudioTtsModelSchema = s.stringEnum("The Qwen-Audio 3.0 TTS model bound to the voice.", [
  "qwen-audio-3.0-tts-flash",
  "qwen-audio-3.0-tts-plus",
]);
const customVoiceSchema = s.object(
  "A Qwen-Audio custom voice.",
  {
    voiceId: s.nonEmptyString("The custom voice identifier accepted by generate_speech."),
    targetModel: qwenAudioTtsModelSchema,
    status: s.string("The upstream voice status."),
    createdAt: s.string("The upstream voice creation time."),
    modifiedAt: s.string("The upstream voice modification time."),
    voicePrompt: s.string("The voice description used for a designed voice."),
    previewText: s.string("The preview text used for a designed voice."),
  },
  {
    required: ["voiceId"],
    optional: ["targetModel", "status", "createdAt", "modifiedAt", "voicePrompt", "previewText"],
  },
);
const translationReferenceSchema = s.object(
  "A source and target text pair used to guide translation.",
  {
    source: s.nonEmptyString("The source term or sentence."),
    target: s.nonEmptyString("The required or preferred translation."),
  },
  { required: ["source", "target"] },
);
const translationLifecycle = {
  startActionId: "qwen.submit_image_translation",
  statusActionId: "qwen.get_image_translation",
};

export const qwenActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "extract_text",
    operationType: "read",
    description: "Extract text and structured information from an image with Qwen3.5-OCR.",
    inputSchema: s.actionInput(
      {
        fileUrl: s.url("A publicly accessible image URL."),
        task: s.withDefault(
          s.stringEnum("The OCR task to perform.", [
            "text_recognition",
            "advanced_recognition",
            "key_information_extraction",
            "table_parsing",
            "document_parsing",
            "formula_recognition",
            "multi_lan",
          ]),
          "text_recognition",
        ),
        resultSchema: s.looseObject(
          "Fields to extract for key_information_extraction, keyed by field name with descriptions or nested field definitions.",
        ),
        enableRotate: s.withDefault(s.boolean("Whether to automatically correct image rotation."), false),
        minPixels: s.positiveInteger("The minimum number of image pixels used for model input."),
        maxPixels: s.positiveInteger("The maximum number of image pixels used for model input."),
      },
      ["fileUrl"],
      "A Qwen3.5-OCR extraction request.",
    ),
    outputSchema: s.actionOutput(
      {
        content: s.string("The extracted text or formatted OCR output."),
        details: s.looseObject("Task-specific structured OCR details when returned by Qwen."),
        model: s.nonEmptyString("The Qwen OCR model used for extraction."),
        inputTokens: s.nonNegativeInteger("The number of input tokens billed by Qwen."),
        outputTokens: s.nonNegativeInteger("The number of output tokens billed by Qwen."),
        imageTokens: s.nonNegativeInteger("The number of image input tokens billed by Qwen."),
      },
      "The normalized Qwen OCR result and usage.",
      ["content", "model", "inputTokens", "outputTokens", "imageTokens"],
    ),
  }),
  defineProviderAction(service, {
    name: "translate_text",
    operationType: "read",
    description: "Translate text with Qwen-MT and optional terminology, translation memory, and domain guidance.",
    inputSchema: s.actionInput(
      {
        model: s.withDefault(
          s.stringEnum("The Qwen-MT translation model.", ["qwen-mt-flash", "qwen-mt-plus"]),
          "qwen-mt-flash",
        ),
        text: s.string("The text to translate.", { minLength: 1 }),
        sourceLanguage: s.withDefault(
          s.nonEmptyString("The source language name or code, or auto for automatic detection."),
          "auto",
        ),
        targetLanguage: s.nonEmptyString("The target language name or code."),
        terms: s.array("Required translations for terms appearing in the source text.", translationReferenceSchema),
        translationMemory: s.array(
          "Previously translated sentence pairs whose style and phrasing should be followed.",
          translationReferenceSchema,
        ),
        domainPrompt: s.string("English guidance describing the translation domain and preferred style.", {
          minLength: 1,
        }),
      },
      ["text", "targetLanguage"],
      "A Qwen-MT text translation request.",
    ),
    outputSchema: s.actionOutput(
      {
        text: s.string("The translated text."),
        model: s.nonEmptyString("The Qwen-MT model reported by Qwen."),
        inputTokens: s.nonNegativeInteger("The number of input tokens billed by Qwen."),
        outputTokens: s.nonNegativeInteger("The number of output tokens billed by Qwen."),
      },
      "The translated text and usage.",
      ["text", "model", "inputTokens", "outputTokens"],
    ),
  }),
  defineProviderAction(service, {
    name: "generate_image",
    operationType: "write",
    description: "Generate or edit images with the Qwen Image 3.0 family.",
    inputSchema: s.actionInput(
      {
        model: s.withDefault(
          s.stringEnum("The Qwen Image 3.0 model.", ["qwen-image-3.0", "qwen-image-3.0-pro"]),
          defaultQwenImageModel,
        ),
        prompt: s.string("The image generation or editing prompt.", { minLength: 1 }),
        images: s.array(
          "Reference image URLs or data URLs. Omit for text-to-image generation.",
          s.nonEmptyString("A reference image URL or data URL."),
          { maxItems: 3 },
        ),
        size: s.nonEmptyString("The optional output dimensions as WIDTH*HEIGHT. Omit for model-selected dimensions."),
        imageCount: s.withDefault(s.integer("The number of images to generate.", { minimum: 1, maximum: 6 }), 1),
        negativePrompt: s.string("Content that should not appear in the generated images."),
        promptExtend: s.withDefault(s.boolean("Whether Qwen should enhance the prompt."), true),
        promptExtendMode: s.withDefault(s.stringEnum("The prompt enhancement mode.", ["direct", "agent"]), "direct"),
        enableThinking: s.withDefault(s.boolean("Whether to use reasoning during image generation."), true),
        watermark: s.withDefault(s.boolean("Whether generated images include a watermark."), false),
        seed: s.integer("The random seed.", { minimum: 0, maximum: 2147483647 }),
      },
      ["prompt"],
      "A unified Qwen Image 3.0 generation or editing request.",
    ),
    outputSchema: s.actionOutput(
      {
        images: s.array("The generated temporary image URLs.", s.nonEmptyString("A generated image URL.")),
        imageCount: s.nonNegativeInteger("The number of generated images."),
        width: s.nonNegativeInteger("The output image width in pixels."),
        height: s.nonNegativeInteger("The output image height in pixels."),
        inputImageCount: s.nonNegativeInteger("The number of input images billed by Qwen."),
      },
      "The generated Qwen images and usage.",
      ["images", "imageCount", "inputImageCount"],
    ),
  }),
  defineProviderAction(service, {
    name: "generate_speech",
    operationType: "write",
    description: "Generate speech with Qwen-Audio 3.0 TTS.",
    inputSchema: s.actionInput(
      {
        model: s.withDefault(
          s.stringEnum("The Qwen-Audio 3.0 TTS model.", ["qwen-audio-3.0-tts-flash", "qwen-audio-3.0-tts-plus"]),
          "qwen-audio-3.0-tts-flash",
        ),
        text: s.string("The text to synthesize.", { minLength: 1 }),
        voice: s.withDefault(
          s.nonEmptyString("A system, cloned, or designed Qwen-Audio voice name."),
          "longanhuan_v3.6",
        ),
        format: s.withDefault(s.stringEnum("The generated audio encoding.", ["mp3", "pcm", "wav", "opus"]), "mp3"),
        sampleRate: s.withDefault(
          {
            type: "integer",
            enum: [8000, 16000, 22050, 24000, 44100, 48000],
            description: "The audio sample rate in hertz.",
          },
          22050,
        ),
        volume: s.integer("The output volume from 0 to 100.", { minimum: 0, maximum: 100 }),
        rate: s.number("The speech rate from 0.5 to 2.0.", { minimum: 0.5, maximum: 2 }),
        pitch: s.number("The pitch multiplier from 0.5 to 2.0.", { minimum: 0.5, maximum: 2 }),
        instruction: s.string("A natural-language instruction for dialect, emotion, pace, or role.", {
          minLength: 1,
        }),
        languageHints: s.array(
          "The target language hint; the API currently uses only the first value.",
          s.stringEnum("A supported target language code.", [
            "zh",
            "en",
            "fr",
            "de",
            "ja",
            "ko",
            "ru",
            "pt",
            "th",
            "id",
            "vi",
            "es",
            "it",
            "ms",
            "fil",
            "ar",
          ]),
          { minItems: 1, maxItems: 1 },
        ),
        enableSsml: s.boolean("Whether text contains supported SSML markup."),
        seed: s.integer("The deterministic synthesis seed.", { minimum: 0, maximum: 65535 }),
        bitRate: s.integer("The Opus bit rate in kbps; only valid when format is opus.", {
          minimum: 6,
          maximum: 510,
        }),
        enableAigcTag: s.boolean("Whether to embed an AIGC provenance tag in the generated audio."),
      },
      ["text"],
      "A Qwen-Audio 3.0 speech synthesis request.",
    ),
    outputSchema: s.actionOutput(
      {
        audioUrl: s.nonEmptyString("The temporary generated audio URL."),
        expiresAt: s.nonNegativeInteger("The Unix timestamp when the audio URL expires."),
      },
      "The generated speech audio.",
      ["audioUrl"],
    ),
  }),
  defineProviderAction(service, {
    name: "analyze_document",
    operationType: "read",
    description: "Analyze documents or text with Qwen-Doc-Turbo.",
    inputSchema: s.actionInput(
      {
        instruction: s.string("The extraction, classification, review, or summarization instruction.", {
          minLength: 1,
        }),
        documentUrls: s.array("Public URLs for up to ten documents.", s.nonEmptyString("A public document URL."), {
          minItems: 1,
          maxItems: 10,
        }),
        text: s.string("Plain text to analyze instead of documents.", { minLength: 1 }),
        systemPrompt: s.withDefault(
          s.nonEmptyString("The system instruction defining the model role and behavior."),
          "You are a helpful assistant.",
        ),
        fileParsingStrategy: s.withDefault(
          s.stringEnum("How Qwen parses document URLs.", ["auto", "text_only", "text_and_images"]),
          "auto",
        ),
      },
      ["instruction"],
      "A Qwen-Doc-Turbo analysis request using either documentUrls or text.",
    ),
    outputSchema: s.actionOutput(
      {
        content: s.string("The generated analysis content."),
        model: s.nonEmptyString("The model reported by Qwen."),
        inputTokens: s.nonNegativeInteger("The number of input tokens billed by Qwen."),
        outputTokens: s.nonNegativeInteger("The number of output tokens billed by Qwen."),
      },
      "The Qwen document analysis result and usage.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_voice_clone",
    operationType: "write",
    description: "Create a Qwen-Audio custom voice from a public audio sample.",
    inputSchema: s.actionInput(
      {
        targetModel: s.withDefault(qwenAudioTtsModelSchema, "qwen-audio-3.0-tts-flash"),
        prefix: s.string("An alphanumeric voice-name prefix of at most ten characters.", {
          minLength: 1,
          maxLength: 10,
          pattern: "^[A-Za-z0-9]+$",
        }),
        audioUrl: s.nonEmptyString("A publicly accessible reference audio URL."),
        languageHints: s.array(
          "The sample audio language hint; the API currently uses only the first value.",
          s.stringEnum("A supported sample language code.", [
            "zh",
            "en",
            "fr",
            "de",
            "ja",
            "ko",
            "ru",
            "pt",
            "th",
            "id",
            "vi",
            "it",
            "es",
            "ms",
            "fil",
            "ar",
          ]),
          { minItems: 1, maxItems: 1 },
        ),
        maxPromptAudioLength: s.number("The maximum reference audio duration used, in seconds.", {
          minimum: 3,
          maximum: 30,
        }),
        enablePreprocess: s.boolean("Whether to denoise and enhance the reference audio."),
        enableVolumeNormalization: s.boolean("Whether to normalize reference audio volume."),
      },
      ["prefix", "audioUrl"],
      "A Qwen-Audio voice cloning request.",
    ),
    outputSchema: s.actionOutput(
      { voiceId: s.nonEmptyString("The created voice identifier accepted by generate_speech.") },
      "The created cloned voice.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_designed_voice",
    operationType: "write",
    description: "Create a Qwen-Audio custom voice from a text description.",
    inputSchema: s.actionInput(
      {
        targetModel: s.withDefault(qwenAudioTtsModelSchema, "qwen-audio-3.0-tts-flash"),
        prefix: s.string("An alphanumeric voice-name prefix of at most ten characters.", {
          minLength: 1,
          maxLength: 10,
          pattern: "^[A-Za-z0-9]+$",
        }),
        voicePrompt: s.string("A Chinese or English description of the desired voice.", {
          minLength: 1,
          maxLength: 500,
        }),
        previewText: s.string("Chinese or English text spoken by the preview audio.", {
          minLength: 1,
          maxLength: 200,
        }),
        languageHints: s.array(
          "The preview language hint; the API currently uses only the first value.",
          s.stringEnum("A supported preview language code.", ["zh", "en"]),
          { minItems: 1, maxItems: 1 },
        ),
        sampleRate: {
          type: "integer",
          enum: [16000, 24000, 48000],
          default: 24000,
          description: "The preview audio sample rate in hertz.",
        },
        responseFormat: s.withDefault(s.stringEnum("The preview audio encoding.", ["pcm", "wav", "mp3"]), "wav"),
      },
      ["prefix", "voicePrompt", "previewText"],
      "A Qwen-Audio voice design request.",
    ),
    outputSchema: s.actionOutput(
      {
        voiceId: s.nonEmptyString("The created voice identifier accepted by generate_speech."),
        previewAudio: s.string("The Base64-encoded preview audio."),
        sampleRate: s.positiveInteger("The preview audio sample rate in hertz."),
        responseFormat: s.nonEmptyString("The preview audio encoding."),
      },
      "The created designed voice and preview audio.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_custom_voices",
    operationType: "read",
    description: "List Qwen-Audio cloned and designed voices together.",
    inputSchema: s.actionInput(
      {
        prefix: s.string("An optional voice-name prefix filter.", { minLength: 1, maxLength: 10 }),
        pageIndex: s.nonNegativeInteger("The zero-based page index.", { default: 0 }),
        pageSize: s.positiveInteger("The number of voices requested per page.", { default: 10 }),
      },
      [],
      "A custom voice list request.",
    ),
    outputSchema: s.actionOutput(
      {
        voices: s.array("The custom voices on this page.", customVoiceSchema),
        pageIndex: s.nonNegativeInteger("The zero-based page index."),
        pageSize: s.positiveInteger("The requested page size."),
        totalCount: s.nonNegativeInteger("The total number of matching voices."),
      },
      "A page of Qwen-Audio custom voices.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_custom_voice",
    operationType: "read",
    description: "Get one Qwen-Audio cloned or designed voice.",
    inputSchema: s.actionInput(
      { voiceId: s.nonEmptyString("The custom voice identifier.") },
      ["voiceId"],
      "A custom voice lookup.",
    ),
    outputSchema: s.object(
      "The Qwen-Audio custom voice details.",
      {
        voiceId: s.nonEmptyString("The custom voice identifier accepted by generate_speech."),
        targetModel: qwenAudioTtsModelSchema,
        status: s.string("The upstream voice status."),
        createdAt: s.string("The upstream voice creation time."),
        modifiedAt: s.string("The upstream voice modification time."),
        voicePrompt: s.string("The voice description used for a designed voice."),
        previewText: s.string("The preview text used for a designed voice."),
        resourceUrl: s.nonEmptyString("The upstream reference or preview audio URL."),
      },
      {
        required: ["voiceId"],
        optional: ["targetModel", "status", "createdAt", "modifiedAt", "voicePrompt", "previewText", "resourceUrl"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_custom_voice",
    operationType: "destructive",
    description: "Delete one Qwen-Audio cloned or designed voice.",
    inputSchema: s.actionInput(
      { voiceId: s.nonEmptyString("The custom voice identifier to delete.") },
      ["voiceId"],
      "A custom voice deletion request.",
    ),
    outputSchema: s.actionOutput(
      { voiceId: s.nonEmptyString("The deleted custom voice identifier.") },
      "The deleted custom voice.",
    ),
  }),
  defineProviderAction(service, {
    name: "submit_speech_recognition",
    operationType: "write",
    description: "Submit a Qwen-Audio 3.0 asynchronous audio or video transcription task.",
    followUpActions: ["qwen.get_speech_recognition"],
    asyncLifecycle: {
      startActionId: "qwen.submit_speech_recognition",
      statusActionId: "qwen.get_speech_recognition",
    },
    inputSchema: s.actionInput(
      {
        fileUrl: s.nonEmptyString("A public HTTP or HTTPS URL for the audio or video file."),
        languageHints: s.array(
          "Possible language codes. Omit to let Qwen detect the language.",
          s.nonEmptyString("A BCP-47-style language code supported by Qwen."),
          { maxItems: 4 },
        ),
        channelIds: s.withDefault(
          s.array(
            "Zero-based audio channel indexes to transcribe. Each channel is billed separately.",
            s.nonNegativeInteger("A zero-based audio channel index."),
            { minItems: 1 },
          ),
          [0],
        ),
        vocabularyId: s.nonEmptyString("A precompiled Qwen vocabulary identifier."),
        vocabulary: s.array(
          "Request-specific hotwords and their recognition weights.",
          s.object(
            "A request-specific hotword.",
            {
              text: s.nonEmptyString("The hotword text."),
              weight: s.integer("The hotword weight from 1 to 5, or 50 for a super hotword."),
            },
            { required: ["text", "weight"] },
          ),
          { maxItems: 2000 },
        ),
        context: s.array(
          "Prior conversation turns or domain context used to improve recognition.",
          s.object(
            "One prior conversation turn.",
            {
              userText: s.nonEmptyString("Prior user speech text or domain vocabulary."),
              assistantText: s.nonEmptyString("The corresponding prior assistant response."),
            },
            { required: ["userText", "assistantText"] },
          ),
          { maxItems: 5 },
        ),
        specialWordFilter: s.nonEmptyString("The Qwen special-word filtering configuration string."),
        diarizationEnabled: s.withDefault(s.boolean("Whether to separate speakers in single-channel audio."), false),
        speakerCount: s.integer("The expected speaker count when diarization is enabled.", {
          minimum: 2,
          maximum: 100,
        }),
      },
      ["fileUrl"],
      "A Qwen-Audio 3.0 file transcription request.",
    ),
    outputSchema: s.actionOutput({ taskId: speechTaskIdSchema }, "The submitted speech recognition task handle."),
  }),
  defineProviderAction(service, {
    name: "get_speech_recognition",
    operationType: "read",
    description: "Retrieve a Qwen-Audio 3.0 transcription task and its normalized result.",
    asyncLifecycle: {
      startActionId: "qwen.submit_speech_recognition",
      statusActionId: "qwen.get_speech_recognition",
    },
    inputSchema: s.actionInput({ taskId: speechTaskIdSchema }, ["taskId"], "A speech recognition task lookup."),
    outputSchema: s.oneOf(
      [
        s.object(
          "A queued or running speech recognition task.",
          {
            taskId: speechTaskIdSchema,
            state: s.literal("processing", { description: "The task is queued or running." }),
            progress: s.number("The task progress percentage when available.", { minimum: 0, maximum: 100 }),
          },
          { required: ["taskId", "state"], optional: ["progress"] },
        ),
        s.object(
          "A succeeded speech recognition task.",
          {
            taskId: speechTaskIdSchema,
            state: s.literal("succeeded", { description: "The task succeeded." }),
            transcriptionUrl: s.nonEmptyString("The temporary URL of the original transcription JSON."),
            fileUrl: s.nonEmptyString("The transcribed file URL."),
            duration: s.nonNegativeInteger("The billable speech duration in seconds."),
            transcripts: s.array("Normalized per-channel transcriptions.", speechTranscriptSchema),
          },
          { required: ["taskId", "state", "transcriptionUrl", "fileUrl", "duration", "transcripts"] },
        ),
        s.object(
          "A terminal speech recognition task that did not succeed.",
          {
            taskId: speechTaskIdSchema,
            state: s.stringEnum("The terminal task state.", ["failed", "cancelled", "expired"]),
            error: s.object(
              "The upstream terminal error.",
              { code: s.string("The upstream error code."), message: s.string("The upstream error message.") },
              { optional: ["code", "message"] },
            ),
          },
          { required: ["taskId", "state"], optional: ["error"] },
        ),
      ],
      { description: "The normalized Qwen speech recognition task state." },
    ),
  }),
  defineProviderAction(service, {
    name: "submit_image_translation",
    operationType: "write",
    description: "Submit an asynchronous Qwen image translation task.",
    followUpActions: [translationLifecycle.statusActionId],
    asyncLifecycle: translationLifecycle,
    inputSchema: s.actionInput(
      {
        imageUrl: s.nonEmptyString("A public URL for the image to translate."),
        sourceLanguage: s.withDefault(
          s.stringEnum("The source language, or auto for detection.", [
            "auto",
            "zh",
            "en",
            "ko",
            "ja",
            "ru",
            "es",
            "fr",
            "pt",
            "it",
            "de",
            "vi",
          ]),
          "auto",
        ),
        targetLanguage: s.stringEnum("The target language.", [
          "zh",
          "en",
          "ko",
          "ja",
          "ru",
          "es",
          "fr",
          "pt",
          "it",
          "vi",
          "ms",
          "th",
          "id",
          "ar",
        ]),
        domainHint: s.string("An English domain hint describing the desired translation style.", { maxLength: 2000 }),
        sensitivities: s.array("Exact text values that should not be translated.", s.string("An exact text value."), {
          maxItems: 50,
        }),
        terminologies: s.array(
          "Required terminology translations.",
          s.object(
            "A terminology mapping.",
            { source: s.string("The source term."), target: s.string("The required target term.") },
            { required: ["source", "target"] },
          ),
          { maxItems: 50 },
        ),
        skipImageSegmentation: s.boolean("Whether to translate all text without foreground segmentation."),
      },
      ["imageUrl", "targetLanguage"],
      "A Qwen image translation request.",
    ),
    outputSchema: s.actionOutput({ taskId: translationTaskIdSchema }, "The submitted image translation task handle."),
  }),
  defineProviderAction(service, {
    name: "get_image_translation",
    operationType: "read",
    description: "Retrieve a Qwen image translation task state and output.",
    asyncLifecycle: translationLifecycle,
    inputSchema: s.actionInput({ taskId: translationTaskIdSchema }, ["taskId"], "An image translation task lookup."),
    outputSchema: s.oneOf(
      [
        s.object(
          "A queued or running image translation task.",
          {
            taskId: translationTaskIdSchema,
            state: s.literal("processing", { description: "The task is queued or running." }),
            progress: s.number("The task progress percentage when available.", { minimum: 0, maximum: 100 }),
          },
          { required: ["taskId", "state"], optional: ["progress"] },
        ),
        s.object(
          "A succeeded image translation task.",
          {
            taskId: translationTaskIdSchema,
            state: s.literal("succeeded", { description: "The task succeeded." }),
            imageUrl: s.nonEmptyString("The temporary translated image URL."),
          },
          { required: ["taskId", "state", "imageUrl"] },
        ),
        s.object(
          "A terminal image translation task that did not succeed.",
          {
            taskId: translationTaskIdSchema,
            state: s.stringEnum("The terminal task state.", ["failed", "cancelled", "expired"]),
            error: s.object(
              "The upstream terminal error.",
              { code: s.string("The upstream error code."), message: s.string("The upstream error message.") },
              { optional: ["code", "message"] },
            ),
          },
          { required: ["taskId", "state"], optional: ["error"] },
        ),
      ],
      { description: "The normalized Qwen image translation task state." },
    ),
  }),
];
