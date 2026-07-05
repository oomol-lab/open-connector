import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dadata_ru";

const countSchema = s.integer({
  description: "The maximum number of suggestions to return.",
  minimum: 1,
  maximum: 20,
});
const looseDataSchema = s.record(
  "A provider-defined suggestion data object with arbitrary string keys.",
  s.unknown("A provider-defined suggestion data value."),
);
const suggestionSchema = s.looseObject("One DaData suggestion item.", {
  value: s.string("The display value for the suggestion."),
  unrestricted_value: s.string("The full unrestricted value for the suggestion."),
  data: looseDataSchema,
});
const suggestionsResponseSchema = s.looseRequiredObject("The DaData suggestions response.", {
  suggestions: s.array("The ordered suggestion results.", suggestionSchema),
});
const commonSuggestionInputSchema = s.object(
  "The input payload for a DaData suggestion request.",
  {
    query: s.string({
      description: "The search text to send to DaData.",
      minLength: 1,
      maxLength: 300,
    }),
    count: countSchema,
  },
  { required: ["query"], optional: ["count"] },
);
const addressSuggestionInputSchema = s.object(
  "The input payload for a DaData address suggestion request.",
  {
    query: s.string({
      description: "The address search text to send to DaData.",
      minLength: 1,
      maxLength: 300,
    }),
    count: countSchema,
    language: s.stringEnum("The language for returned address suggestions.", ["ru", "en"]),
  },
  { required: ["query"], optional: ["count", "language"] },
);

export type DadataRuActionName = "suggest_address" | "suggest_party" | "suggest_bank" | "suggest_fio" | "suggest_email";

export const dadataRuActions: Array<ProviderActionDefinition<DadataRuActionName>> = [
  defineProviderAction(service, {
    name: "suggest_address",
    description: "Suggest Russian postal addresses from partial text using DaData's Suggestions API.",
    requiredScopes: [],
    inputSchema: addressSuggestionInputSchema,
    outputSchema: suggestionsResponseSchema,
  }),
  defineProviderAction(service, {
    name: "suggest_party",
    description:
      "Suggest Russian organizations and individual entrepreneurs from partial text using DaData's Suggestions API.",
    requiredScopes: [],
    inputSchema: commonSuggestionInputSchema,
    outputSchema: suggestionsResponseSchema,
  }),
  defineProviderAction(service, {
    name: "suggest_bank",
    description: "Suggest Russian banks from partial text using DaData's Suggestions API.",
    requiredScopes: [],
    inputSchema: commonSuggestionInputSchema,
    outputSchema: suggestionsResponseSchema,
  }),
  defineProviderAction(service, {
    name: "suggest_fio",
    description: "Suggest Russian full names from partial text using DaData's Suggestions API.",
    requiredScopes: [],
    inputSchema: commonSuggestionInputSchema,
    outputSchema: suggestionsResponseSchema,
  }),
  defineProviderAction(service, {
    name: "suggest_email",
    description: "Suggest email addresses from partial text using DaData's Suggestions API.",
    requiredScopes: [],
    inputSchema: commonSuggestionInputSchema,
    outputSchema: suggestionsResponseSchema,
  }),
];
