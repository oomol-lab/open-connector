import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "alt_text_generator_ai" as const;

const publicImageUrlSchema = s.url("The publicly reachable HTTP or HTTPS URL of the image to describe.");

export const altTextGeneratorAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "generate_alt_text",
    operationType: "read",
    description: "Generate concise, accessibility-friendly alt text for a publicly reachable image URL.",
    requiredScopes: [],
    inputSchema: s.object("Input for generating alt text from a public image URL.", {
      imageUrl: publicImageUrlSchema,
    }),
    outputSchema: s.object("Generated alt text for the image.", {
      altText: s.nonEmptyString("The alt text generated for the image."),
    }),
  }),
];
