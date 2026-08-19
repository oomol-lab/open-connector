import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stabilityai";

const outputFormatSchema = s.stringEnum("The output audio format returned by Stability AI.", ["mp3", "wav"]);
const modelSchema = s.stringEnum("The Stable Audio model to use for generation.", [
  "stable-audio-2",
  "stable-audio-2.5",
]);

const generatedFileSchema = s.requiredObject("A generated audio file stored in local transit storage.", {
  fileId: s.string("The local transit file identifier."),
  downloadUrl: s.url("The local URL for downloading the generated file."),
  sizeBytes: s.integer("The generated file size in bytes."),
  name: s.string("The generated file name."),
  mimeType: s.string("The generated file MIME type."),
});

export const stabilityaiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "text_to_audio",
    description: "Generate audio from a text prompt with Stability AI and store the generated file locally.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        prompt: s.string("The text description used to generate audio.", { minLength: 1, maxLength: 10000 }),
        duration: s.number("The requested duration of the generated audio in seconds.", {
          minimum: 1,
          maximum: 190,
        }),
        seed: s.integer("The randomness seed used for generation. Use 0 or omit it for a random seed.", {
          minimum: 0,
          maximum: 4294967294,
        }),
        steps: s.integer(
          "The number of sampling steps requested from Stability AI. Use 30-100 for stable-audio-2 and 4-8 for stable-audio-2.5.",
        ),
        cfgScale: s.number("How strongly the generation should follow the prompt text.", {
          minimum: 1,
          maximum: 25,
        }),
        model: modelSchema,
        outputFormat: outputFormatSchema,
      },
      ["prompt"],
      "The text-to-audio generation request.",
    ),
    outputSchema: s.object(
      "The generated Stability AI audio response.",
      {
        file: generatedFileSchema,
        model: modelSchema,
        outputFormat: outputFormatSchema,
        contentType: s.string("The MIME type returned by Stability AI."),
        seed: s.integer("The seed returned by Stability AI for this generation."),
        finishReason: s.string("The completion reason returned by Stability AI."),
      },
      { required: ["file", "model", "outputFormat", "contentType"] },
    ),
  }),
];
