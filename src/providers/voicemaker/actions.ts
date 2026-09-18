import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "voicemaker";

const voiceSchema = s.looseRequiredObject("A voice returned by Voicemaker.", {
  Engine: s.string("The synthesis engine used by the voice."),
  VoiceId: s.string("The identifier used to synthesize speech with this voice."),
  VoiceGender: s.string("The gender label assigned to the voice."),
  VoiceWebname: s.string("The display name of the voice."),
  Country: s.string("The country code associated with the voice."),
  Language: s.string("The language code supported by the voice."),
  LanguageName: s.string("The display name of the voice language."),
});

export const voicemakerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_voices",
    operationType: "read",
    description: "List Voicemaker text-to-speech voices, optionally filtered by language.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Voicemaker voices.",
      {
        language: s.nonEmptyString("The language code used to filter available voices."),
      },
      { optional: ["language"] },
    ),
    outputSchema: s.object("The available Voicemaker voices.", {
      voices: s.array("The voices matching the requested language.", voiceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "generate_tts",
    operationType: "write",
    description: "Convert text to speech and return the generated audio URL and usage details.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for generating speech with Voicemaker.",
      {
        VoiceId: s.nonEmptyString("The Voicemaker voice identifier used for synthesis."),
        LanguageCode: s.nonEmptyString("The language code used for synthesis."),
        Text: s.nonEmptyString("The text or SSML content to synthesize."),
        OutputFormat: s.nonEmptyString("The generated audio format accepted by Voicemaker."),
        SampleRate: s.nonEmptyString("The requested audio sample rate in hertz."),
        MasterVolume: s.nonEmptyString("The master volume adjustment accepted by Voicemaker."),
        MasterSpeed: s.nonEmptyString("The master speed adjustment accepted by Voicemaker."),
        MasterPitch: s.nonEmptyString("The master pitch adjustment accepted by Voicemaker."),
      },
      {
        optional: ["LanguageCode", "OutputFormat", "SampleRate", "MasterVolume", "MasterSpeed", "MasterPitch"],
      },
    ),
    outputSchema: s.object("The generated Voicemaker speech result.", {
      audioUrl: s.string("The URL of the generated audio file.", { format: "uri" }),
      usedChars: s.integer("The number of characters consumed by this request."),
      remainingChars: s.integer("The remaining account character balance."),
      remainingKeyChars: s.integer("The remaining character balance for this API key."),
    }),
  }),
];
