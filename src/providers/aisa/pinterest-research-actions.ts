import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const pinterestResearchActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "get_dataforseo_pinterest_pin_counts",
    description:
      "Count Pinterest saves for up to ten webpage URLs through DataForSEO. Each URL is billed separately; inspect task status codes for partial failures.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Webpage URLs whose Pinterest saves should be counted.",
      {
        targets: s.array(
          "Up to ten absolute webpage URLs, including http:// or https://.",
          s.string("An absolute webpage URL.", { format: "uri", pattern: "^https?://" }),
          { minItems: 1, maxItems: 10 },
        ),
        tag: s.optional(s.string("A caller-defined task identifier returned with the result.", { maxLength: 255 })),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The DataForSEO response with Pinterest saves and task statuses.",
      {
        status_code: s.optional(s.integer("The overall DataForSEO status code.")),
        status_message: s.optional(s.string("The overall DataForSEO status message.")),
        tasks: s.optional(
          s.nullable(
            s.array(
              "Task responses, including any task errors.",
              s.looseObject("One task with its status and per-URL Pinterest pin counts."),
            ),
          ),
        ),
      },
      { required: [] },
    ),
  }),
];

export const pinterestResearchRoutes: Record<string, AisaActionRoute> = {
  get_dataforseo_pinterest_pin_counts: {
    method: "POST",
    path: "/apis/v1/dataforseo/business_data/social_media/pinterest/live",
    query: {},
    body: { targets: "targets", tag: "tag" },
    bodyArray: true,
  },
};
