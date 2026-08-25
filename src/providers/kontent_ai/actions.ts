import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kontent_ai";

const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableBooleanSchema = (description: string) => s.nullable(s.boolean(description));

const identifierTypeSchema = s.stringEnum("How to address a Kontent.ai resource.", ["id", "codename", "externalId"]);

const continuationTokenInputSchema = s.nonEmptyString(
  "The x-continuation token returned by a previous Kontent.ai list response.",
);
const continuationTokenOutputSchema = nullableStringSchema(
  "The next pagination.continuation_token value when Kontent.ai returns one.",
);

const listInputSchema = (description: string) =>
  s.object(
    description,
    {
      continuationToken: continuationTokenInputSchema,
    },
    { optional: ["continuationToken"] },
  );

const getByIdentifierInputSchema = s.object("Input parameters for retrieving one Kontent.ai resource by identifier.", {
  identifier: s.nonEmptyString("The Kontent.ai resource identifier value."),
  identifierType: identifierTypeSchema,
});

const rawObjectSchema = s.looseObject("The raw Kontent.ai object.");

const resourceSummarySchema = s.object("A normalized Kontent.ai resource summary.", {
  id: nullableStringSchema("The Kontent.ai resource UUID when returned."),
  name: nullableStringSchema("The Kontent.ai display name when returned."),
  codename: nullableStringSchema("The Kontent.ai codename when returned."),
  externalId: nullableStringSchema("The Kontent.ai external_id value when returned."),
  raw: rawObjectSchema,
});

const languageSchema = s.object("A normalized Kontent.ai language.", {
  id: nullableStringSchema("The Kontent.ai language UUID when returned."),
  name: nullableStringSchema("The language display name when returned."),
  codename: nullableStringSchema("The Kontent.ai language codename when returned."),
  externalId: nullableStringSchema("The Kontent.ai external_id value when returned."),
  isActive: nullableBooleanSchema("Whether the language is active when returned."),
  isDefault: nullableBooleanSchema("Whether the language is the environment default when returned."),
  raw: rawObjectSchema,
});

const listOutputSchema = (description: string, key: "items" | "types" | "languages") => {
  const itemSchema = key === "languages" ? languageSchema : resourceSummarySchema;
  return s.object(description, {
    [key]: s.array(`The Kontent.ai ${key} returned by the API.`, itemSchema),
    continuationToken: continuationTokenOutputSchema,
    raw: s.looseObject("The raw Kontent.ai list response."),
  });
};

export const kontentAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_content_items",
    description: "List content items in a Kontent.ai environment.",
    requiredScopes: [],
    inputSchema: listInputSchema("Input parameters for listing Kontent.ai content items."),
    outputSchema: listOutputSchema("The Kontent.ai content item list response.", "items"),
  }),
  defineProviderAction(service, {
    name: "get_content_item",
    description: "Retrieve one content item from a Kontent.ai environment.",
    requiredScopes: [],
    inputSchema: getByIdentifierInputSchema,
    outputSchema: s.object("The Kontent.ai content item response.", {
      item: resourceSummarySchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_content_types",
    description: "List content types in a Kontent.ai environment.",
    requiredScopes: [],
    inputSchema: listInputSchema("Input parameters for listing Kontent.ai content types."),
    outputSchema: listOutputSchema("The Kontent.ai content type list response.", "types"),
  }),
  defineProviderAction(service, {
    name: "get_content_type",
    description: "Retrieve one content type from a Kontent.ai environment.",
    requiredScopes: [],
    inputSchema: getByIdentifierInputSchema,
    outputSchema: s.object("The Kontent.ai content type response.", {
      type: resourceSummarySchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_languages",
    description: "List languages in a Kontent.ai environment.",
    requiredScopes: [],
    inputSchema: listInputSchema("Input parameters for listing Kontent.ai languages."),
    outputSchema: listOutputSchema("The Kontent.ai language list response.", "languages"),
  }),
  defineProviderAction(service, {
    name: "get_language",
    description: "Retrieve one language from a Kontent.ai environment.",
    requiredScopes: [],
    inputSchema: getByIdentifierInputSchema,
    outputSchema: s.object("The Kontent.ai language response.", {
      language: languageSchema,
      raw: rawObjectSchema,
    }),
  }),
];
