import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aivoov";

const pitchRateSchema = s.anyOf("The SSML pitch rate control for this segment.", [
  s.literal("default", { description: "Use AiVOOV's default pitch rate." }),
  s.integer("Integer pitch rate adjustment from -50 to 50.", { minimum: -50, maximum: 50 }),
]);

const speakingRateSchema = s.anyOf("The SSML speaking rate control for this segment.", [
  s.literal("default", { description: "Use AiVOOV's default speaking rate." }),
  s.integer("Integer speaking rate from 20 to 200.", { minimum: 20, maximum: 200 }),
]);

const volumeSchema = s.anyOf("The SSML volume control for this segment.", [
  s.literal("default", { description: "Use AiVOOV's default volume." }),
  s.integer("Integer volume adjustment from -40 to 40.", { minimum: -40, maximum: 40 }),
]);

const voiceSchema = s.looseRequiredObject("One AiVOOV voice returned by the voices endpoint.", {
  voice_id: s.string("The AiVOOV voice identifier."),
  name: s.string("The voice display name."),
  language: s.string("The voice language code."),
});

export const aivoovActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_voices",
    operationType: "read",
    description: "List available AiVOOV voices, optionally filtered by language code.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing AiVOOV voices.",
      {
        languageCode: s.string("The language code used to filter voices.", { minLength: 1 }),
      },
      { optional: ["languageCode"] },
    ),
    outputSchema: s.array("The voices returned by AiVOOV.", voiceSchema),
  }),
  defineProviderAction(service, {
    name: "create_audio",
    operationType: "write",
    description: "Generate base64 audio from one or more voice/text segments.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for generating AiVOOV audio.", {
      segments: s.array(
        "Voice/text segments to render into one audio payload.",
        s.object(
          "One AiVOOV voice/text segment.",
          {
            voiceId: s.string("The AiVOOV voice identifier.", { minLength: 1 }),
            text: s.string("The text to synthesize.", { minLength: 1 }),
            pitchRate: pitchRateSchema,
            speakingRate: speakingRateSchema,
            volume: volumeSchema,
          },
          { optional: ["pitchRate", "speakingRate", "volume"] },
        ),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.looseRequiredObject("The audio generation response returned by AiVOOV.", {
      status: s.boolean("Whether AiVOOV generated the audio successfully."),
      message: s.string("The status message returned by AiVOOV."),
      audio: s.string("The Base64-encoded audio payload returned by AiVOOV."),
    }),
  }),
];
