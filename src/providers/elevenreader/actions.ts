import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "elevenreader";

const emptyInputSchema = s.actionInput({}, [], "No input is required for this action.");
const rawObjectSchema = s.looseObject("Provider-specific metadata returned by ElevenLabs.");
const modelLanguageSchema = s.actionOutput(
  {
    languageId: s.string("The language identifier."),
    name: s.string("The language name."),
  },
  "A language supported by an ElevenLabs speech model.",
);
const modelSchema = s.object(
  "An ElevenLabs speech model summary.",
  {
    modelId: s.string("The unique model identifier."),
    name: s.string("The model name."),
    description: s.string("The model description."),
    languages: s.array("The supported languages.", modelLanguageSchema),
    canDoTextToSpeech: s.boolean("Whether the model supports text-to-speech."),
    canUseStyle: s.boolean("Whether the model supports style control."),
    canUseSpeakerBoost: s.boolean("Whether the model supports speaker boost."),
    maximumTextLengthPerRequest: s.integer("The maximum text length per request."),
    modelRates: rawObjectSchema,
  },
  {
    required: ["modelId"],
    optional: [
      "name",
      "description",
      "languages",
      "canDoTextToSpeech",
      "canUseStyle",
      "canUseSpeakerBoost",
      "maximumTextLengthPerRequest",
      "modelRates",
    ],
  },
);
const voiceSchema = s.object(
  "An ElevenLabs voice summary.",
  {
    voiceId: s.string("The unique voice identifier."),
    name: s.string("The voice name."),
    category: s.string("The voice category."),
    description: s.string("The voice description."),
    previewUrl: s.url("The preview audio URL."),
    labels: s.record("The custom labels on the voice.", s.string("One label value.")),
    settings: rawObjectSchema,
    availableForTiers: s.stringArray("The subscription tiers that can access the voice."),
    highQualityBaseModelIds: s.stringArray("The high-quality base models available for this voice."),
    verifiedLanguages: s.array("The verified languages supported by the voice.", rawObjectSchema),
    sharing: rawObjectSchema,
    fineTuning: rawObjectSchema,
    permissionOnResource: s.string("The permission level on the voice resource."),
    isOwner: s.boolean("Whether the current user owns the voice."),
    isLegacy: s.boolean("Whether the voice is a legacy voice."),
  },
  {
    required: ["voiceId", "name", "category"],
    optional: [
      "description",
      "previewUrl",
      "labels",
      "settings",
      "availableForTiers",
      "highQualityBaseModelIds",
      "verifiedLanguages",
      "sharing",
      "fineTuning",
      "permissionOnResource",
      "isOwner",
      "isLegacy",
    ],
  },
);
const subscriptionSchema = s.object(
  "An ElevenReader subscription summary.",
  {
    tier: s.string("The subscription tier."),
    status: s.string("The subscription status."),
    characterCount: s.integer("The used character count."),
    characterLimit: s.integer("The maximum character count."),
    canExtendCharacterLimit: s.boolean("Whether the character limit can be extended."),
    allowedToExtendCharacterLimit: s.boolean("Whether the user is currently allowed to extend the character limit."),
    nextCharacterCountResetUnix: s.integer("The Unix timestamp of the next character count reset."),
    voiceLimit: s.integer("The custom voice limit."),
    canUseInstantVoiceCloning: s.boolean("Whether instant voice cloning is enabled."),
    canUseProfessionalVoiceCloning: s.boolean("Whether professional voice cloning is enabled."),
  },
  {
    required: [
      "tier",
      "status",
      "characterCount",
      "characterLimit",
      "canExtendCharacterLimit",
      "allowedToExtendCharacterLimit",
    ],
    optional: [
      "nextCharacterCountResetUnix",
      "voiceLimit",
      "canUseInstantVoiceCloning",
      "canUseProfessionalVoiceCloning",
    ],
  },
);
const userSchema = s.actionOutput(
  {
    userId: s.string("The unique user identifier."),
    createdAt: s.integer("The Unix timestamp when the user was created."),
    firstName: s.string("The user's first name."),
    isNewUser: s.boolean("Whether the user is new."),
    isOnboardingCompleted: s.boolean("Whether onboarding is completed."),
    subscription: subscriptionSchema,
  },
  "The current ElevenReader user profile.",
  ["userId", "createdAt", "isNewUser", "isOnboardingCompleted", "subscription"],
);
const generatedFileSchema = s.actionOutput(
  {
    fileId: s.string("The local transit file identifier."),
    downloadUrl: s.url("The local transit file download URL."),
    sizeBytes: s.integer("The generated audio size in bytes."),
    name: s.string("The generated file name."),
    mimeType: s.string("The generated audio MIME type."),
  },
  "A generated audio file stored in local transit file storage.",
);

export const elevenreaderActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_info",
    description: "Get the current ElevenReader user profile and subscription snapshot.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput({ user: userSchema }, "The current ElevenReader user profile response."),
  }),
  defineProviderAction(service, {
    name: "get_models",
    description: "List available ElevenLabs speech synthesis models for reading text aloud.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        models: s.array("The available speech synthesis models.", modelSchema),
      },
      "The ElevenReader speech model list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_voices",
    description: "Search available ElevenLabs voices with pagination and filters useful for reading text aloud.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        search: s.string("A search term that filters voices by name, description, labels, or category."),
        category: s.stringEnum("The voice category to filter by.", ["premade", "cloned", "generated", "professional"]),
        voiceType: s.stringEnum("The voice type to filter by.", [
          "personal",
          "community",
          "default",
          "workspace",
          "non-default",
          "saved",
        ]),
        sort: s.stringEnum("The field used to sort voices.", ["created_at_unix", "name"]),
        sortDirection: s.stringEnum("The direction used to sort voices.", ["asc", "desc"]),
        pageSize: s.integer("The maximum number of voices to return.", { minimum: 1, maximum: 100 }),
        nextPageToken: s.string("The pagination token returned by the previous response."),
        includeTotalCount: s.boolean("Whether to include the total count in the response."),
      },
      [],
      "Filters for searching ElevenLabs voices.",
    ),
    outputSchema: s.actionOutput(
      {
        voices: s.array("The voices returned by the search.", voiceSchema),
        hasMore: s.boolean("Whether more voices are available after this page."),
        nextPageToken: s.string("The token to pass to the next request for pagination."),
        totalCount: s.integer("The total number of matching voices when requested."),
      },
      "The ElevenReader voice search response.",
      ["voices", "hasMore"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_voice",
    description: "Get one ElevenLabs voice by voice ID before using it to read text aloud.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        voiceId: s.nonEmptyString("The unique voice identifier."),
        withSettings: s.boolean("Whether to include voice settings in the response."),
      },
      ["voiceId"],
      "The voice lookup request.",
    ),
    outputSchema: s.actionOutput({ voice: voiceSchema }, "The ElevenReader voice lookup response."),
  }),
  defineProviderAction(service, {
    name: "read_text",
    description:
      "Convert text to speech with an ElevenLabs voice and store the generated audio in local transit storage.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        voiceId: s.nonEmptyString("The voice ID used to read the text aloud."),
        text: s.nonEmptyString("The text to convert to speech."),
        modelId: s.string("The ElevenLabs model ID to use for speech synthesis."),
        outputFormat: s.string("The ElevenLabs output format, such as mp3_44100_128."),
        optimizeStreamingLatency: s.integer("The latency optimization level accepted by ElevenLabs.", {
          minimum: 0,
          maximum: 4,
        }),
        voiceSettings: rawObjectSchema,
      },
      ["voiceId", "text"],
      "The text-to-speech request for reading text aloud.",
    ),
    outputSchema: s.actionOutput(
      {
        file: generatedFileSchema,
        voiceId: s.string("The voice ID used for generation."),
        modelId: s.string("The model ID used for generation."),
        outputFormat: s.string("The requested output format."),
        contentType: s.string("The response content type from ElevenLabs."),
      },
      "The ElevenReader generated audio response.",
      ["file", "voiceId", "outputFormat", "contentType"],
    ),
  }),
];
