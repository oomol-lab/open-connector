import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const nameSchema = s.nonEmptyString("The full name or first name to estimate age for.");
const countrySchema = s.string("An ISO 3166-1 alpha-2 country code to scope the prediction.", {
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Za-z]{2}$",
});
const predictionSchema = s.looseObject(
  "An age estimate returned by Agify.",
  {
    name: s.string("The name echoed exactly as submitted."),
    age: s.nullable(s.integer("Estimated age in years, or null when no prediction is available.")),
    count: s.integer("The number of data points behind the estimate."),
    country_id: s.string("The country code when the prediction is localized."),
  },
  { required: ["name", "age", "count"] },
);

export const agifyActions: ProviderActionDefinition[] = [
  defineProviderAction("agify", {
    name: "predict_age",
    operationType: "read",
    description: "Estimate age from a full name or first name, optionally scoped to a country.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for a single age estimate.",
      {
        name: nameSchema,
        country_id: countrySchema,
      },
      { optional: ["country_id"] },
    ),
    outputSchema: predictionSchema,
  }),
  defineProviderAction("agify", {
    name: "predict_age_batch",
    operationType: "read",
    description:
      "Estimate ages for up to 100 names in input order, optionally scoped to one country. Each name consumes quota.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for batch age estimates.",
      {
        names: s.array("One to 100 names in the desired result order.", nameSchema, {
          minItems: 1,
          maxItems: 100,
        }),
        country_id: countrySchema,
      },
      { optional: ["country_id"] },
    ),
    outputSchema: s.requiredObject("The batch age estimates.", {
      predictions: s.array("Age estimates in the same order as the input names.", predictionSchema),
    }),
  }),
];
