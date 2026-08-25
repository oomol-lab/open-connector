import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "loyverse";

const emptyInputSchema = s.object("This action does not require any input.", {});
const idField = (description: string) => s.nonEmptyString(description);
const idListField = (description: string) =>
  s.array(description, s.nonEmptyString("One Loyverse resource ID."), { minItems: 1 });
const receiptNumberListField = s.array(
  "Receipt numbers used to filter Loyverse receipt results.",
  s.nonEmptyString("One Loyverse receipt number."),
  { minItems: 1 },
);
const limitField = s.positiveInteger("The maximum number of records to return. Loyverse allows up to 250.", {
  maximum: 250,
  default: 50,
});
const cursorField = s.nonEmptyString("The pagination cursor returned by a previous Loyverse list call.");
const createdAtMinField = s.dateTime("Only include resources created at or after this timestamp.");
const createdAtMaxField = s.dateTime("Only include resources created at or before this timestamp.");
const updatedAtMinField = s.dateTime("Only include resources updated at or after this timestamp.");
const updatedAtMaxField = s.dateTime("Only include resources updated at or before this timestamp.");
const loyverseRecordSchema = s.looseObject("A Loyverse API object returned without reshaping.");
const cursorOutputField = s.nullableString(
  "The cursor to pass to the next list request, or null when there is no next page.",
);

function listOutputSchema(description: string, propertyName: string) {
  return s.object(description, {
    [propertyName]: s.array(`The Loyverse ${propertyName} returned by the API.`, loyverseRecordSchema),
    cursor: cursorOutputField,
    raw: s.looseObject("The raw Loyverse response payload."),
  });
}

function itemOutputSchema(description: string, propertyName: string) {
  return s.object(description, {
    [propertyName]: loyverseRecordSchema,
  });
}

const commonListInputSchema = (description: string, idsName: string) =>
  s.object(
    description,
    {
      ids: idListField(`Limit results to these Loyverse ${idsName}.`),
      createdAtMin: createdAtMinField,
      createdAtMax: createdAtMaxField,
      updatedAtMin: updatedAtMinField,
      updatedAtMax: updatedAtMaxField,
      limit: limitField,
      cursor: cursorField,
      showDeleted: s.boolean("Whether to include soft-deleted Loyverse records."),
    },
    {
      optional: [
        "ids",
        "createdAtMin",
        "createdAtMax",
        "updatedAtMin",
        "updatedAtMax",
        "limit",
        "cursor",
        "showDeleted",
      ],
    },
  );

const simpleIdInputSchema = (description: string) =>
  s.object("The input payload for reading one Loyverse resource.", {
    id: idField(description),
  });

const listCustomersInputSchema = s.object(
  "The input payload for listing Loyverse customers.",
  {
    ids: idListField("Limit results to these Loyverse customer IDs."),
    email: s.email("Filter customers by email address."),
    createdAtMin: createdAtMinField,
    createdAtMax: createdAtMaxField,
    updatedAtMin: updatedAtMinField,
    updatedAtMax: updatedAtMaxField,
    limit: limitField,
    cursor: cursorField,
  },
  {
    optional: ["ids", "email", "createdAtMin", "createdAtMax", "updatedAtMin", "updatedAtMax", "limit", "cursor"],
  },
);

const listReceiptsInputSchema = s.object(
  "The input payload for listing Loyverse receipts.",
  {
    receiptNumbers: receiptNumberListField,
    sinceReceiptNumber: idField("Show receipts after the receipt with this number."),
    beforeReceiptNumber: idField("Show receipts before the receipt with this number."),
    storeId: idField("Filter receipts to one Loyverse store ID."),
    order: idField("Filter receipts by Loyverse order value."),
    source: idField("Filter receipts by source name."),
    createdAtMin: createdAtMinField,
    createdAtMax: createdAtMaxField,
    updatedAtMin: updatedAtMinField,
    updatedAtMax: updatedAtMaxField,
    limit: limitField,
    cursor: cursorField,
  },
  {
    optional: [
      "receiptNumbers",
      "sinceReceiptNumber",
      "beforeReceiptNumber",
      "storeId",
      "order",
      "source",
      "createdAtMin",
      "createdAtMax",
      "updatedAtMin",
      "updatedAtMax",
      "limit",
      "cursor",
    ],
  },
);

export const loyverseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_merchant",
    description: "Get merchant profile information for the connected Loyverse account.",
    inputSchema: emptyInputSchema,
    outputSchema: itemOutputSchema("The Loyverse merchant profile response.", "merchant"),
  }),
  defineProviderAction(service, {
    name: "list_stores",
    description: "List stores in the connected Loyverse account.",
    inputSchema: commonListInputSchema("The input payload for listing Loyverse stores.", "store IDs"),
    outputSchema: listOutputSchema("The Loyverse stores list response.", "stores"),
  }),
  defineProviderAction(service, {
    name: "get_store",
    description: "Get one Loyverse store by ID.",
    inputSchema: simpleIdInputSchema("The Loyverse store ID."),
    outputSchema: itemOutputSchema("The Loyverse store response.", "store"),
  }),
  defineProviderAction(service, {
    name: "list_items",
    description: "List items in the connected Loyverse account.",
    inputSchema: commonListInputSchema("The input payload for listing Loyverse items.", "item IDs"),
    outputSchema: listOutputSchema("The Loyverse items list response.", "items"),
  }),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get one Loyverse item by ID.",
    inputSchema: simpleIdInputSchema("The Loyverse item ID."),
    outputSchema: itemOutputSchema("The Loyverse item response.", "item"),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List item categories in the connected Loyverse account.",
    inputSchema: commonListInputSchema("The input payload for listing Loyverse categories.", "category IDs"),
    outputSchema: listOutputSchema("The Loyverse categories list response.", "categories"),
  }),
  defineProviderAction(service, {
    name: "get_category",
    description: "Get one Loyverse category by ID.",
    inputSchema: simpleIdInputSchema("The Loyverse category ID."),
    outputSchema: itemOutputSchema("The Loyverse category response.", "category"),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List customers in the connected Loyverse account.",
    inputSchema: listCustomersInputSchema,
    outputSchema: listOutputSchema("The Loyverse customers list response.", "customers"),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Get one Loyverse customer by ID.",
    inputSchema: simpleIdInputSchema("The Loyverse customer ID."),
    outputSchema: itemOutputSchema("The Loyverse customer response.", "customer"),
  }),
  defineProviderAction(service, {
    name: "list_receipts",
    description: "List receipts in the connected Loyverse account.",
    inputSchema: listReceiptsInputSchema,
    outputSchema: listOutputSchema("The Loyverse receipts list response.", "receipts"),
  }),
  defineProviderAction(service, {
    name: "get_receipt",
    description: "Get one Loyverse receipt by receipt number.",
    inputSchema: s.object("The input payload for reading one Loyverse receipt.", {
      receiptNumber: idField("The Loyverse receipt number."),
    }),
    outputSchema: itemOutputSchema("The Loyverse receipt response.", "receipt"),
  }),
];
