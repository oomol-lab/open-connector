import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "genderize";

const countryIdSchema = s.string({
  description: "The optional ISO 3166-1 alpha-2 country code used to localize the prediction.",
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Z]{2}$",
});

const nameSchema = s.nonEmptyString("The first name or full name string to classify with Genderize.");

const predictionSchema = s.object(
  "A single gender prediction returned by Genderize.",
  {
    name: s.string("The input name echoed back by Genderize."),
    gender: s.nullable(
      s.stringEnum("The inferred gender, or null when Genderize has no data for the name.", ["male", "female"]),
    ),
    probability: s.number("The probability score returned by Genderize for the inferred gender.", {
      minimum: 0,
      maximum: 1,
    }),
    count: s.nonNegativeInteger("The number of data rows Genderize used for the prediction."),
    country_id: s.string({
      description: "The country code echoed by Genderize when the request was localized.",
      minLength: 2,
      maxLength: 2,
    }),
  },
  { required: ["name", "gender", "probability", "count"] },
);

export const genderizeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "predict_gender",
    description: "Predict the gender probability for a single name, optionally localized to one country.",
    inputSchema: s.actionInput(
      {
        name: nameSchema,
        country_id: countryIdSchema,
      },
      ["name"],
      "The input payload for predicting the gender of a single name.",
    ),
    outputSchema: predictionSchema,
  }),
  defineProviderAction(service, {
    name: "predict_gender_batch",
    description:
      "Predict the gender probability for up to 10 names in a single request, optionally localized to one country.",
    inputSchema: s.actionInput(
      {
        names: s.array("Up to 10 names to classify in one Genderize batch request.", nameSchema, {
          minItems: 1,
          maxItems: 10,
        }),
        country_id: countryIdSchema,
      },
      ["names"],
      "The input payload for predicting the gender of up to 10 names.",
    ),
    outputSchema: s.actionOutput(
      {
        predictions: s.array(
          "The ordered list of gender predictions returned for the requested names.",
          predictionSchema,
          {
            minItems: 1,
            maxItems: 10,
          },
        ),
      },
      "The batch prediction result returned by Genderize.",
    ),
  }),
];
