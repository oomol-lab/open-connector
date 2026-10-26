import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const page = s.integer("Page number, starting at 1. Defaults to 1.", {
  minimum: 1,
  maximum: 10000,
});
const promptType = s.stringEnum("Benchmark preset. Defaults to long (10,000 input tokens, one query).", [
  "medium",
  "long",
  "100k",
  "vision_single_image",
  "medium_parallel",
]);
const slug = s.string("Model or API provider slug from the corresponding list action.", {
  minLength: 1,
  not: { enum: [".", ".."] },
});
const period = {
  window: s.stringEnum("Lookback period. Defaults to 90d.", ["7d", "30d", "90d"]),
  interval: s.stringEnum("Aggregation interval. Defaults to daily for 7d/30d, weekly for 90d.", [
    "daily",
    "weekly",
    "monthly",
  ]),
  prompt_type: promptType,
};
const model = s.looseObject("Model metadata, evaluations, pricing and performance. Unmeasured values remain null.", {
  id: s.string("Stable model ID."),
  name: s.string("Model display name."),
  slug: s.string("Model URL slug; it may change over time."),
  model_creator: s.nullable(s.looseObject("Model creator identity.", {})),
  evaluations: s.looseObject("Benchmark scores and capability indices.", {}),
  pricing: s.looseObject("Model pricing reported by Artificial Analysis.", {}),
});
const provider = s.looseObject("API provider identity and available model data.", {
  id: s.string("Stable API provider ID."),
  name: s.string("API provider display name."),
  slug: s.string("API provider URL slug."),
});
const pagination = s.object(
  "Pagination metadata; request the next page while has_more is true.",
  {
    page: s.integer("Current page number."),
    page_size: s.integer("Number of items per page."),
    total_pages: s.integer("Total number of pages."),
    has_more: s.boolean("Whether more pages are available."),
  },
  {
    optional: [],
    additionalProperties: true,
  },
);
function output(data: JsonSchema, paginated = false, versioned = false) {
  const properties: Record<string, JsonSchema> = {
    tier: s.string("Subscription tier serving this response."),
    data,
  };
  if (paginated) properties.pagination = pagination;
  if (versioned) properties.intelligence_index_version = s.number("Major.minor version of the Intelligence Index.");
  return s.object(
    "Artificial Analysis response. Credit https://artificialanalysis.ai when displaying or sharing data.",
    properties,
    {
      optional: [],
      additionalProperties: true,
    },
  );
}
const detailInput = s.object(
  "Model or provider lookup parameters.",
  { slug, prompt_type: promptType },
  {
    optional: ["prompt_type"],
  },
);
const performanceInput = s.object(
  "Performance history parameters.",
  { slug, ...period },
  {
    optional: Object.keys(period),
  },
);
const history = s.looseObject(
  "Identity and performance series grouped by model or API provider, preserving endpoint labels.",
  {
    id: s.string("Stable model or API provider ID."),
    name: s.string("Model or API provider display name."),
    slug: s.string("Model or API provider URL slug."),
  },
);
interface ArtificialAnalysisEndpoint {
  path: string;
  action: ActionDefinition;
}
function endpoint(
  name: string,
  path: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ArtificialAnalysisEndpoint {
  return {
    path,
    action: defineProviderAction("artificial_analysis", {
      name,
      description,
      operationType: "read",
      requiredScopes: [],
      inputSchema,
      outputSchema,
    }),
  };
}
const endpoints = [
  endpoint(
    "list_free_models",
    "/language/models/free",
    "List public language model benchmarks, median performance and input/output prices. Available to every API tier; returns the Free field set even with a paid key.",
    s.object(
      "Free model list parameters.",
      { page },
      {
        optional: ["page"],
      },
    ),
    output(s.array("Language models on this page.", model), true, true),
  ),
  endpoint(
    "list_models",
    "/language/models",
    "List language model evaluations, pricing and performance with the full paid field set. Requires Pro or Commercial; use list_free_models with a Free key.",
    s.object(
      "Model list parameters.",
      { page, prompt_type: promptType },
      {
        optional: ["page", "prompt_type"],
      },
    ),
    output(s.array("Language models on this page.", model), true, true),
  ),
  endpoint(
    "get_model",
    "/language/models/{slug}",
    "Get one language model's evaluations, pricing and performance. Requires Pro or Commercial.",
    detailInput,
    output(model, false, true),
  ),
  endpoint(
    "get_model_performance",
    "/language/models/{slug}/performance",
    "Get language model performance over time, grouped by API provider. Requires Commercial.",
    performanceInput,
    output(history),
  ),
  endpoint(
    "list_providers",
    "/language/providers",
    "List language model API providers. Requires Commercial.",
    s.object(
      "Provider list parameters.",
      { page },
      {
        optional: ["page"],
      },
    ),
    output(s.array("API providers on this page.", provider), true),
  ),
  endpoint(
    "get_provider",
    "/language/providers/{slug}",
    "Get an API provider and its language model pricing and performance. Requires Commercial.",
    detailInput,
    output(provider),
  ),
  endpoint(
    "get_provider_performance",
    "/language/providers/{slug}/performance",
    "Get an API provider's performance over time, grouped by model. Requires Commercial.",
    performanceInput,
    output(history),
  ),
  endpoint(
    "get_provider_measurements",
    "/language/providers/{slug}/measurements",
    "Get raw model measurements for an API provider. Requires Commercial and an explicit provider grant. Dates earlier than one month ago are clamped by the API.",
    s.object(
      "Raw measurement parameters.",
      {
        slug,
        prompt_type: promptType,
        start_date: s.string("Earliest measurement date (YYYY-MM-DD). Defaults to one month ago.", {
          format: "date",
        }),
      },
      {
        optional: ["prompt_type", "start_date"],
      },
    ),
    output(
      s.looseObject("API provider identity and raw measurements grouped by model.", {
        id: s.string("Stable API provider ID."),
        name: s.string("API provider display name."),
        slug: s.string("API provider URL slug."),
        models: s.array(
          "Models and their raw measurement data.",
          s.looseObject("Model metadata and measurements.", {}),
        ),
      }),
    ),
  ),
];
export const artificialAnalysisActions: ActionDefinition[] = endpoints.map((item) => item.action);
export const artificialAnalysisEndpointByName: Map<string, ArtificialAnalysisEndpoint> = new Map(
  endpoints.map((item) => [item.action.name, item]),
);
