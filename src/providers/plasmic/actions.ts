import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "plasmic";

const querySchema = s.looseObject(
  "A Plasmic CMS query object serialized into the q query parameter. Use official keys such as where, limit, and offset.",
);
const modelIdSchema = s.nonEmptyString(
  "The Plasmic CMS model ID, such as testimonials, copied from the model schema page.",
);
const readItemsInputSchema = s.object(
  "Input parameters for reading rows from one Plasmic CMS model.",
  {
    modelId: modelIdSchema,
    query: querySchema,
    draft: s.boolean("Whether to pass draft=1 and load draft or unpublished rows. This requires a secret CMS token."),
    locale: s.nonEmptyString("The CMS locale tag used for localized fields, such as ar-JO."),
  },
  { optional: ["query", "draft", "locale"] },
);
const rowDataSchema = s.record(
  "Model-defined Plasmic CMS field values for a row.",
  s.unknown("A model-defined Plasmic CMS field value."),
);
const rowSchema = s.looseObject("A Plasmic CMS row with stable system fields and model-defined data preserved.", {
  id: s.string("The Plasmic CMS row ID."),
  createdAt: s.dateTime("The time Plasmic created the row."),
  updatedAt: s.dateTime("The time Plasmic last updated the row."),
  identifier: s.nullable(s.string("The row identifier configured for the model.")),
  data: s.nullable(rowDataSchema),
  draftData: s.nullable(rowDataSchema),
});

export const plasmicActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_items",
    description: "List rows from a Plasmic CMS model with optional q query filters, draft mode, and locale selection.",
    requiredScopes: [],
    inputSchema: readItemsInputSchema,
    outputSchema: s.looseRequiredObject("Rows returned by the Plasmic CMS query endpoint.", {
      rows: s.array("Rows returned for the requested model query.", rowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "count_items",
    description:
      "Count rows in a Plasmic CMS model using the same q query filters, draft mode, and locale selection as list_items.",
    requiredScopes: [],
    inputSchema: readItemsInputSchema,
    outputSchema: s.looseRequiredObject("The row count returned by the Plasmic CMS count endpoint.", {
      count: s.nonNegativeInteger("The number of rows matching the requested Plasmic CMS query."),
    }),
  }),
];
