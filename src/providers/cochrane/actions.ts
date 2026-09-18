import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cochrane";

const reviewIdInputSchema = s.object("A Cochrane review identifier.", {
  reviewId: s.string("The Cochrane review ID or CD number.", { minLength: 1 }),
});

const reviewRecordSchema = s.looseObject("A JSON object returned by the Cochrane Review Document API.");

const translationSchema = s.looseObject("A published Cochrane review translation.", {
  language: s.string("The translation language code."),
  title: s.string("The translated review title."),
  version: s.string("The published translation version."),
  href: s.string("The URL of the published translation.", { format: "uri" }),
});

export const cochraneActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_review_metadata",
    operationType: "read",
    description: "Get JSON metadata for a Cochrane review.",
    inputSchema: reviewIdInputSchema,
    outputSchema: s.object("The Cochrane review metadata response.", {
      metadata: reviewRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_review_versions",
    operationType: "read",
    description: "List JSON metadata for all versions of a Cochrane review.",
    inputSchema: reviewIdInputSchema,
    outputSchema: s.object("The Cochrane review versions response.", {
      versions: s.unknown("The JSON version metadata returned by Cochrane."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_review_roles",
    operationType: "read",
    description: "Get the document roles associated with a Cochrane review.",
    inputSchema: reviewIdInputSchema,
    outputSchema: s.object("The Cochrane review roles response.", {
      roles: s.unknown("The JSON document role data returned by Cochrane."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_review_translations",
    operationType: "read",
    description: "List published translations for a Cochrane review or one of its versions.",
    inputSchema: s.object(
      "A Cochrane review and optional published version.",
      {
        reviewId: s.string("The Cochrane review ID or CD number.", { minLength: 1 }),
        version: s.string("The published review version, such as 7.0.", { minLength: 1 }),
      },
      { optional: ["version"] },
    ),
    outputSchema: s.object("The published Cochrane review translations response.", {
      translations: s.array("The published translations returned by Cochrane.", translationSchema),
    }),
  }),
];
