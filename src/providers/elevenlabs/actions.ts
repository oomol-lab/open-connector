import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "elevenlabs" as const;

const emptyInputSchema = s.object("No input is required for this action.", {});
const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const anyObject = (description: string) => s.looseObject(description);

const textToSpeechOutputFormatSchema = s.stringEnum(
  "The output audio format. ElevenLabs formats are named as codec_sample_rate_bitrate, such as mp3_44100_128.",
  [
    "alaw_8000",
    "mp3_22050_32",
    "mp3_24000_48",
    "mp3_44100_128",
    "mp3_44100_192",
    "mp3_44100_32",
    "mp3_44100_64",
    "mp3_44100_96",
    "opus_48000_128",
    "opus_48000_192",
    "opus_48000_32",
    "opus_48000_64",
    "opus_48000_96",
    "pcm_16000",
    "pcm_22050",
    "pcm_24000",
    "pcm_32000",
    "pcm_44100",
    "pcm_48000",
    "pcm_8000",
    "ulaw_8000",
    "wav_16000",
    "wav_22050",
    "wav_24000",
    "wav_32000",
    "wav_44100",
    "wav_48000",
    "wav_8000",
  ],
);

const soundEffectOutputFormatSchema = s.stringEnum("The output audio format for generated sound effects.", [
  "mp3_22050_32",
  "mp3_24000_48",
  "mp3_44100_32",
  "mp3_44100_64",
  "mp3_44100_96",
  "mp3_44100_128",
  "mp3_44100_192",
  "pcm_8000",
  "pcm_16000",
  "pcm_22050",
  "pcm_24000",
  "pcm_32000",
  "pcm_44100",
  "pcm_48000",
  "ulaw_8000",
  "alaw_8000",
  "opus_48000_32",
  "opus_48000_64",
  "opus_48000_96",
  "opus_48000_128",
  "opus_48000_192",
]);

const downloadableFileSchema = s.object("A downloadable file uploaded to local transit storage.", {
  fileId: s.string("The local transit file identifier."),
  name: s.string("The generated file name."),
  mimeType: s.string("The MIME type of the uploaded file."),
  downloadUrl: s.string("The local transit URL for downloading the uploaded file."),
  sizeBytes: s.integer("The uploaded file size in bytes."),
});

const invoiceDiscountSchema = s.object(
  "An invoice discount summary.",
  {
    discountAmountOff: s.number("The discount amount applied to the invoice."),
    discountPercentOff: s.number("The discount percentage applied to the invoice."),
  },
  { optional: ["discountAmountOff", "discountPercentOff"] },
);

const invoiceSchema = s.object(
  "A billing invoice summary.",
  {
    amountDueCents: s.integer("The amount due in cents."),
    nextPaymentAttemptUnix: s.integer("The Unix timestamp of the next payment attempt."),
    discounts: s.array("The discounts applied to the invoice.", invoiceDiscountSchema),
    subtotalCents: s.integer("The invoice subtotal in cents."),
    taxCents: s.integer("The invoice tax amount in cents."),
    paymentIntentStatus: s.string("The payment intent status."),
    discountAmountOff: s.number("The total discount amount applied."),
    discountPercentOff: s.number("The total discount percentage applied."),
  },
  {
    optional: ["subtotalCents", "taxCents", "paymentIntentStatus", "discountAmountOff", "discountPercentOff"],
  },
);

const pendingSubscriptionChangeSchema = s.object(
  "A pending subscription change.",
  {
    kind: s.string("The pending change kind."),
    nextTier: s.string("The next subscription tier."),
    nextBillingPeriod: s.string("The next billing period."),
    timestampSeconds: s.integer("The Unix timestamp when the change takes effect."),
  },
  { optional: ["kind", "nextTier", "nextBillingPeriod", "timestampSeconds"] },
);

const baseSubscriptionSchema = {
  tier: s.string("The subscription tier."),
  status: s.string("The subscription status."),
  currency: s.string("The billing currency."),
  billingPeriod: s.string("The billing period."),
  characterCount: s.integer("The used character count."),
  characterLimit: s.integer("The maximum character count."),
  canExtendCharacterLimit: s.boolean("Whether the character limit can be extended."),
  allowedToExtendCharacterLimit: s.boolean("Whether the user is currently allowed to extend the character limit."),
  nextCharacterCountResetUnix: s.integer("The Unix timestamp of the next character count reset."),
  voiceLimit: s.integer("The custom voice limit."),
  maxVoiceAddEdits: s.integer("The maximum allowed voice add/edit operations."),
  voiceAddEditCounter: s.integer("The number of used voice add/edit operations."),
  professionalVoiceLimit: s.integer("The professional voice limit."),
  canExtendVoiceLimit: s.boolean("Whether the voice limit can be extended."),
  canUseInstantVoiceCloning: s.boolean("Whether instant voice cloning is enabled."),
  canUseProfessionalVoiceCloning: s.boolean("Whether professional voice cloning is enabled."),
  characterRefreshPeriod: s.string("The character refresh period."),
  canUseDelayedPaymentMethods: s.boolean("Whether delayed payment methods are available."),
};

const baseSubscriptionOptionalFields = [
  "currency",
  "billingPeriod",
  "nextCharacterCountResetUnix",
  "characterRefreshPeriod",
  "canUseDelayedPaymentMethods",
] as const;

const subscriptionSchema = s.object(
  "An ElevenLabs subscription summary.",
  {
    ...baseSubscriptionSchema,
    hasOpenInvoices: s.boolean("Whether there are open invoices."),
    openInvoices: s.array("The list of open invoices.", invoiceSchema),
    nextInvoice: s.nullable(invoiceSchema),
    pendingSubscriptionChange: s.nullable(pendingSubscriptionChangeSchema),
  },
  {
    optional: [...baseSubscriptionOptionalFields, "nextInvoice", "pendingSubscriptionChange"],
  },
);

const userSubscriptionSchema = s.object("An ElevenLabs user subscription summary.", baseSubscriptionSchema, {
  optional: baseSubscriptionOptionalFields,
});

const userInfoSchema = s.object(
  "The current ElevenLabs user profile.",
  {
    userId: s.string("The unique user identifier."),
    createdAt: s.integer("The Unix timestamp when the user was created."),
    firstName: s.string("The user's first name."),
    isNewUser: s.boolean("Whether the user is new."),
    canUseDelayedPaymentMethods: s.boolean("Whether delayed payment methods are available."),
    isOnboardingCompleted: s.boolean("Whether onboarding is completed."),
    isOnboardingChecklistCompleted: s.boolean("Whether the onboarding checklist is completed."),
    isApiKeyHashed: s.boolean("Whether the API key is stored in hashed form."),
    subscription: userSubscriptionSchema,
  },
  { optional: ["firstName"] },
);

const modelLanguageSchema = s.object("A language supported by an ElevenLabs model.", {
  languageId: s.string("The language identifier."),
  name: s.string("The language name."),
});

const modelSchema = s.object(
  "An ElevenLabs model summary.",
  {
    modelId: s.string("The unique model identifier."),
    name: s.string("The model name."),
    description: s.string("The model description."),
    languages: s.array("The supported languages.", modelLanguageSchema),
    canBeFinetuned: s.boolean("Whether the model can be finetuned."),
    canDoTextToSpeech: s.boolean("Whether the model supports text-to-speech."),
    canDoVoiceConversion: s.boolean("Whether the model supports voice conversion."),
    canUseStyle: s.boolean("Whether the model supports style control."),
    canUseSpeakerBoost: s.boolean("Whether the model supports speaker boost."),
    servesProVoices: s.boolean("Whether the model serves professional voices."),
    tokenCostFactor: s.number("The token cost factor for the model."),
    concurrencyGroup: s.string("The concurrency group."),
    maxCharactersRequestFreeUser: s.integer("The maximum request length for free users."),
    maxCharactersRequestSubscribedUser: s.integer("The maximum request length for subscribed users."),
    maximumTextLengthPerRequest: s.integer("The maximum text length per request."),
    requiresAlphaAccess: s.boolean("Whether alpha access is required."),
    modelRates: anyObject("The pricing information for the model."),
  },
  {
    optional: [
      "name",
      "description",
      "languages",
      "canBeFinetuned",
      "canDoTextToSpeech",
      "canDoVoiceConversion",
      "canUseStyle",
      "canUseSpeakerBoost",
      "servesProVoices",
      "tokenCostFactor",
      "concurrencyGroup",
      "maxCharactersRequestFreeUser",
      "maxCharactersRequestSubscribedUser",
      "maximumTextLengthPerRequest",
      "requiresAlphaAccess",
      "modelRates",
    ],
  },
);

const verifiedLanguageSchema = s.object(
  "A verified language supported by a voice.",
  {
    language: s.string("The language name."),
    modelId: s.string("The model identifier for the language."),
    accent: s.string("The accent label."),
    locale: s.string("The locale code."),
  },
  { optional: ["language", "modelId", "accent", "locale"] },
);

const voiceSchema = s.object(
  "An ElevenLabs voice summary.",
  {
    voiceId: s.string("The unique voice identifier."),
    name: s.string("The voice name."),
    category: s.string("The voice category."),
    description: s.string("The voice description."),
    previewUrl: s.string("The preview audio URL."),
    labels: s.record("The custom labels on the voice.", s.string("One voice label value.")),
    settings: anyObject("The voice settings."),
    availableForTiers: s.array(
      "The subscription tiers that can access the voice.",
      s.string("One available tier name."),
    ),
    verifiedLanguages: s.array("The verified languages supported by the voice.", verifiedLanguageSchema),
    sharing: anyObject("The voice sharing metadata."),
    fineTuning: anyObject("The voice fine-tuning metadata."),
    permissionOnResource: s.string("The permission level on the voice resource."),
    isOwner: s.boolean("Whether the current user owns the voice."),
    isLegacy: s.boolean("Whether the voice is a legacy voice."),
  },
  {
    optional: [
      "description",
      "previewUrl",
      "labels",
      "settings",
      "availableForTiers",
      "verifiedLanguages",
      "sharing",
      "fineTuning",
      "permissionOnResource",
      "isOwner",
      "isLegacy",
    ],
  },
);

const voiceSearchCategorySchema = s.stringEnum("The voice category to filter by.", [
  "premade",
  "cloned",
  "generated",
  "professional",
]);

const voiceSearchTypeSchema = s.stringEnum("The voice type to filter by.", [
  "personal",
  "community",
  "default",
  "workspace",
  "non-default",
  "non-community",
  "saved",
]);

const voiceSearchSortSchema = s.stringEnum("The field used to sort voices.", ["created_at_unix", "name"]);

const voiceFineTuningStateSchema = s.stringEnum("The voice fine-tuning state to filter by.", [
  "draft",
  "not_verified",
  "not_started",
  "queued",
  "fine_tuning",
  "fine_tuned",
  "failed",
  "delayed",
]);

const sortDirectionSchema = s.stringEnum("The direction used to sort results.", ["asc", "desc"]);

const voiceSettingsSchema = s.object(
  "The voice settings returned by ElevenLabs.",
  {
    stability: s.nullable(s.number("The stability control value.")),
    similarityBoost: s.nullable(s.number("The similarity boost value.")),
    style: s.nullable(s.number("The style control value.")),
    useSpeakerBoost: s.nullable(s.boolean("Whether speaker boost is enabled.")),
    speed: s.nullable(s.number("The voice speed multiplier.")),
  },
  { optional: ["stability", "similarityBoost", "style", "useSpeakerBoost", "speed"] },
);

const historyFeedbackSchema = s.object(
  "The feedback attached to a history item.",
  {
    thumbsUp: s.boolean("Whether the feedback is positive."),
    feedback: s.string("The textual feedback content."),
    emotions: s.boolean("Whether the feedback mentions emotions."),
    inaccurateClone: s.boolean("Whether the feedback reports an inaccurate clone."),
    glitches: s.boolean("Whether the feedback reports glitches."),
    audioQuality: s.boolean("Whether the feedback mentions audio quality."),
    other: s.boolean("Whether the feedback mentions other issues."),
    reviewStatus: s.string("The review status."),
  },
  {
    optional: [
      "thumbsUp",
      "feedback",
      "emotions",
      "inaccurateClone",
      "glitches",
      "audioQuality",
      "other",
      "reviewStatus",
    ],
  },
);

const historyItemSchema = s.object(
  "An ElevenLabs history item summary.",
  {
    historyItemId: s.string("The unique history item identifier."),
    requestId: s.string("The originating request identifier."),
    voiceId: s.string("The voice identifier used for generation."),
    modelId: s.string("The model identifier used for generation."),
    voiceName: s.string("The voice name used for generation."),
    voiceCategory: s.string("The voice category used for generation."),
    text: s.string("The input text that was synthesized."),
    dateUnix: s.integer("The Unix timestamp when the history item was created."),
    characterCountChangeFrom: s.integer("The input character count before processing."),
    characterCountChangeTo: s.integer("The final synthesized character count."),
    contentType: s.string("The audio content type."),
    state: s.string("The history item state."),
    source: s.string("The generation source."),
    settings: anyObject("The synthesis settings used for the generation."),
    feedback: historyFeedbackSchema,
    shareLinkId: s.nullable(s.string("The public share link identifier.")),
  },
  {
    optional: [
      "requestId",
      "voiceId",
      "modelId",
      "voiceName",
      "voiceCategory",
      "text",
      "characterCountChangeFrom",
      "characterCountChangeTo",
      "contentType",
      "source",
      "settings",
      "feedback",
      "shareLinkId",
    ],
  },
);

const voiceSettingsInputSchema = s.looseObject("The voice settings overrides for synthesis.", {
  stability: s.number("The stability control value.", { minimum: 0, maximum: 1 }),
  similarityBoost: s.number("The similarity boost value.", { minimum: 0, maximum: 1 }),
  style: s.number("The style control value.", { minimum: 0, maximum: 1 }),
  useSpeakerBoost: s.boolean("Whether speaker boost should be enabled."),
});

const pronunciationDictionaryLocatorSchema = s.object(
  "A pronunciation dictionary locator.",
  {
    pronunciationDictionaryId: s.string("The pronunciation dictionary identifier."),
    versionId: s.string("The pronunciation dictionary version identifier."),
  },
  { optional: ["versionId"] },
);

const characterAlignmentSchema = s.object("Character-level timing information for generated audio.", {
  characters: s.array("The generated characters.", s.string("One generated character.")),
  characterStartTimesSeconds: s.array(
    "The start time in seconds for each character.",
    s.number("One character start time in seconds."),
  ),
  characterEndTimesSeconds: s.array(
    "The end time in seconds for each character.",
    s.number("One character end time in seconds."),
  ),
});

export const elevenlabsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_info",
    description: "Get the current ElevenLabs user profile together with the embedded subscription snapshot.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      user: userInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user_subscription_info",
    description: "Get the current ElevenLabs subscription details for the authenticated user.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      subscription: subscriptionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_models",
    description: "List the available ElevenLabs models and their text-to-speech capabilities.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      models: s.array("The available ElevenLabs models.", modelSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_voices",
    description: "List the available ElevenLabs voices with their key metadata and settings.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      voices: s.array("The available ElevenLabs voices.", voiceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_voice",
    description: "Get one ElevenLabs voice by voice ID, with optional settings included.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        voiceId: nonEmptyString("The voice ID to retrieve."),
        withSettings: s.boolean("Whether the response should include voice settings."),
      },
      { optional: ["withSettings"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      voice: voiceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_voices",
    description: "Search ElevenLabs voices with v2 pagination, filtering, sorting, and optional total count.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        search: s.string("Search voices by name, description, labels, or category."),
        category: voiceSearchCategorySchema,
        voiceType: voiceSearchTypeSchema,
        sort: voiceSearchSortSchema,
        sortDirection: sortDirectionSchema,
        fineTuningState: voiceFineTuningStateSchema,
        collectionId: s.string("Filter voices by collection ID."),
        voiceIds: s.array("The voice IDs to look up.", nonEmptyString("One voice ID."), {
          maxItems: 100,
        }),
        pageSize: s.integer("The maximum number of voices to return.", {
          minimum: 1,
          maximum: 100,
        }),
        nextPageToken: s.string("The pagination token returned by the previous response."),
        includeTotalCount: s.boolean("Whether to include the total count in the response."),
      },
      {
        optional: [
          "search",
          "category",
          "voiceType",
          "sort",
          "sortDirection",
          "fineTuningState",
          "collectionId",
          "voiceIds",
          "pageSize",
          "nextPageToken",
          "includeTotalCount",
        ],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        voices: s.array("The voices returned by the search.", voiceSchema),
        hasMore: s.boolean("Whether more voices are available after this page."),
        nextPageToken: s.string("The pagination token for the next request."),
        totalCount: s.integer("The total number of matching voices when requested."),
      },
      { optional: ["nextPageToken", "totalCount"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_voice_settings",
    description: "Get the synthesis settings configured for one ElevenLabs voice.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {
      voiceId: nonEmptyString("The voice ID whose settings should be retrieved."),
    }),
    outputSchema: s.object("The output payload for this action.", {
      settings: voiceSettingsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_generated_items",
    description: "List generated ElevenLabs history items with pagination and optional voice filtering.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        pageSize: s.integer("The maximum number of history items to return.", {
          minimum: 1,
          maximum: 1000,
        }),
        voiceId: s.string("Filter history items by voice ID."),
        startAfterHistoryItemId: s.string("The history item ID to continue pagination after."),
      },
      { optional: ["pageSize", "voiceId", "startAfterHistoryItemId"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        history: s.array("The returned history items.", historyItemSchema),
        hasMore: s.boolean("Whether additional history items are available."),
        lastHistoryItemId: s.nullable(s.string("The pagination cursor for the next page.")),
        scannedUntil: s.integer("The Unix timestamp until which the scan completed."),
      },
      { optional: ["lastHistoryItemId", "scannedUntil"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_history_item_by_id",
    description: "Get one ElevenLabs history item by history item ID without downloading its audio.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {
      historyItemId: nonEmptyString("The history item ID to retrieve."),
    }),
    outputSchema: s.object("The output payload for this action.", {
      historyItem: historyItemSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "text_to_speech",
    description:
      "Generate speech audio from text by calling ElevenLabs text-to-speech and uploading the binary result to connector transit storage.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        voiceId: nonEmptyString("The voice ID to use for synthesis."),
        text: nonEmptyString("The input text to synthesize."),
        modelId: s.string("The model ID to use for synthesis."),
        outputFormat: textToSpeechOutputFormatSchema,
        optimizeStreamingLatency: s.integer("The streaming latency optimization level.", {
          minimum: 0,
          maximum: 4,
        }),
        seed: s.integer("The deterministic generation seed."),
        voiceSettings: voiceSettingsInputSchema,
        pronunciationDictionaryLocators: s.array(
          "The pronunciation dictionary locators to apply.",
          pronunciationDictionaryLocatorSchema,
          { maxItems: 3 },
        ),
      },
      {
        optional: [
          "modelId",
          "outputFormat",
          "optimizeStreamingLatency",
          "seed",
          "voiceSettings",
          "pronunciationDictionaryLocators",
        ],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        file: downloadableFileSchema,
        voiceId: s.string("The voice ID used for synthesis."),
        modelId: s.string("The model ID used for synthesis."),
        outputFormat: s.string("The requested output format."),
        contentType: s.string("The response content type from ElevenLabs."),
      },
      { optional: ["modelId"] },
    ),
  }),
  defineProviderAction(service, {
    name: "text_to_speech_with_timestamps",
    description:
      "Generate speech audio with character-level timing, upload the audio to connector transit storage, and return timing metadata.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        voiceId: nonEmptyString("The voice ID to use for synthesis."),
        text: nonEmptyString("The input text to synthesize."),
        modelId: s.string("The model ID to use for synthesis."),
        outputFormat: textToSpeechOutputFormatSchema,
        optimizeStreamingLatency: s.integer("The streaming latency optimization level.", {
          minimum: 0,
          maximum: 4,
        }),
        seed: s.integer("The deterministic generation seed."),
        voiceSettings: voiceSettingsInputSchema,
        pronunciationDictionaryLocators: s.array(
          "The pronunciation dictionary locators to apply.",
          pronunciationDictionaryLocatorSchema,
          { maxItems: 3 },
        ),
      },
      {
        optional: [
          "modelId",
          "outputFormat",
          "optimizeStreamingLatency",
          "seed",
          "voiceSettings",
          "pronunciationDictionaryLocators",
        ],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        file: downloadableFileSchema,
        alignment: s.nullable(characterAlignmentSchema),
        normalizedAlignment: s.nullable(characterAlignmentSchema),
        voiceId: s.string("The voice ID used for synthesis."),
        modelId: s.string("The model ID used for synthesis."),
        outputFormat: s.string("The requested output format."),
        contentType: s.string("The uploaded audio MIME type."),
      },
      { optional: ["alignment", "normalizedAlignment", "modelId"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_sound_effect",
    description:
      "Generate a sound effect from a text prompt and upload the binary audio result to connector transit storage.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        text: nonEmptyString("The prompt text that will be converted into a sound effect."),
        outputFormat: soundEffectOutputFormatSchema,
        loop: s.boolean("Whether to create a smoothly looping sound effect."),
        durationSeconds: s.number("The generated sound duration in seconds.", {
          minimum: 0.5,
          maximum: 30,
        }),
        promptInfluence: s.number("How strongly the generation should follow the prompt.", {
          minimum: 0,
          maximum: 1,
        }),
        modelId: s.string("The ElevenLabs sound generation model ID."),
      },
      {
        optional: ["outputFormat", "loop", "durationSeconds", "promptInfluence", "modelId"],
      },
    ),
    outputSchema: s.object("The output payload for this action.", {
      file: downloadableFileSchema,
      outputFormat: s.string("The requested output format."),
      contentType: s.string("The response content type from ElevenLabs."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_audio_from_history_item",
    description:
      "Download the audio for one ElevenLabs history item and upload the binary result to connector transit storage.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {
      historyItemId: nonEmptyString("The history item ID whose audio should be downloaded."),
    }),
    outputSchema: s.object("The output payload for this action.", {
      file: downloadableFileSchema,
      historyItemId: s.string("The history item ID that was downloaded."),
      contentType: s.string("The response content type from ElevenLabs."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_history_item",
    description: "Delete one ElevenLabs history item by history item ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {
      historyItemId: nonEmptyString("The history item ID to delete."),
    }),
    outputSchema: s.object("The output payload for this action.", {
      status: s.string("The deletion status returned by ElevenLabs."),
    }),
  }),
];
