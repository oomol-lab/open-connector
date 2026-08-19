import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "genderapi_io";

const countrySchema = s.string({
  description: "The optional ISO 3166-1 alpha-2 country code used to localize the request.",
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Z]{2}$",
});

const genderSchema: JsonSchema = s.anyOf("The inferred gender value returned by GenderAPI.io.", [
  s.literal("male", { description: "The inferred gender is male." }),
  s.literal("female", { description: "The inferred gender is female." }),
  { type: "null", description: "GenderAPI.io could not determine the gender." },
]);

const genderInferenceOutputSchema = s.object(
  "A normalized gender inference result returned by GenderAPI.io.",
  {
    status: s.literal(true, { description: "Indicates that GenderAPI.io processed the request successfully." }),
    q: s.nonEmptyString("The original query value echoed back by GenderAPI.io."),
    name: s.string("The matched or extracted first name returned by GenderAPI.io."),
    gender: genderSchema,
    country: s.string({
      description: "The country code used or inferred by GenderAPI.io.",
      minLength: 2,
      maxLength: 2,
    }),
    probability: s.integer("The confidence score from 0 to 100 returned by GenderAPI.io.", {
      minimum: 0,
      maximum: 100,
    }),
    total_names: s.nonNegativeInteger("The number of matching name samples used by GenderAPI.io."),
    used_credits: s.nonNegativeInteger("The number of credits consumed by this request."),
    remaining_credits: s.nonNegativeInteger("The credits remaining after this request."),
    expires: s.nonNegativeInteger("The Unix timestamp when the current package expires."),
    duration: s.nonEmptyString("The server-side processing time returned by GenderAPI.io."),
  },
  {
    required: ["status", "q", "probability", "total_names", "used_credits", "remaining_credits", "expires", "duration"],
  },
);

export const genderapiIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_gender_by_first_name",
    description: "Infer the likely gender for one first name with optional country and AI fallback hints.",
    inputSchema: s.actionInput(
      {
        firstName: s.nonEmptyString("The first name to classify with GenderAPI.io."),
        country: countrySchema,
        askToAI: s.boolean("Whether GenderAPI.io should ask its AI model when the name is missing from the database."),
        forceToGenderize: s.boolean(
          "Whether GenderAPI.io should still guess a gender for unusual or non-human-looking names.",
        ),
      },
      ["firstName"],
      "The input payload for inferring gender from a first name.",
    ),
    outputSchema: genderInferenceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_gender_by_email_address",
    description: "Infer the likely gender for one email address after GenderAPI.io extracts a name from it.",
    inputSchema: s.actionInput(
      {
        emailAddress: s.email("The email address to classify with GenderAPI.io."),
        country: countrySchema,
        askToAI: s.boolean(
          "Whether GenderAPI.io should ask its AI model when the extracted name is missing from the database.",
        ),
      },
      ["emailAddress"],
      "The input payload for inferring gender from an email address.",
    ),
    outputSchema: genderInferenceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_gender_by_username",
    description: "Infer the likely gender for one username or nickname with optional country and AI fallback hints.",
    inputSchema: s.actionInput(
      {
        username: s.nonEmptyString("The username or nickname to classify with GenderAPI.io."),
        country: countrySchema,
        askToAI: s.boolean(
          "Whether GenderAPI.io should ask its AI model when the username cannot be resolved from the database.",
        ),
        forceToGenderize: s.boolean("Whether GenderAPI.io should still guess a gender for unusual usernames."),
      },
      ["username"],
      "The input payload for inferring gender from a username or nickname.",
    ),
    outputSchema: genderInferenceOutputSchema,
  }),
];
