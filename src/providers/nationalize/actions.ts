import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const nameSchema = s.nonEmptyString(
  "A last name or full name to predict. Full names provide the most accurate predictions.",
);
const predictionSchema = s.looseObject("A name-based nationality prediction from Nationalize.", {
  name: s.string("The name echoed by Nationalize."),
  count: s.nullable(s.integer("The number of data points behind the prediction.")),
  country: s.nullable(
    s.array(
      "Country candidates ordered by descending probability; empty or null when unknown.",
      s.looseObject("A candidate country and its probability.", {
        country_id: s.string("The ISO 3166-1 alpha-2 country code."),
        probability: s.number("The probability of this country, between zero and one."),
      }),
    ),
  ),
});
export const nationalizeActions: ActionDefinition[] = [
  defineProviderAction("nationalize", {
    name: "predict_nationality",
    description: "Predict ranked country candidates and probabilities for a last name or full name.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("The name to look up in Nationalize.", { name: nameSchema }, { optional: [] }),
    outputSchema: predictionSchema,
  }),
  defineProviderAction("nationalize", {
    name: "predict_nationality_batch",
    description:
      "Predict country candidates for up to 100 names in input order. Each name consumes one lookup from the quota.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The names to look up in one Nationalize request.",
      {
        names: s.array("The names in the desired result order; duplicates are allowed.", nameSchema, {
          minItems: 1,
          maxItems: 100,
        }),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The batch nationality prediction results.",
      {
        predictions: s.array("Predictions in the same order as the input names.", predictionSchema),
      },
      { optional: [] },
    ),
  }),
];
