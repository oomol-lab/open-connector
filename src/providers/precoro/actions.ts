import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "precoro";
const id = s.positiveInteger("The Precoro numeric record ID.");
const idn = s.nonEmptyString("The Precoro company-visible document IDN.");
const looseRecord = s.object("Additional upstream fields returned by Precoro.", {}, { additionalProperties: true });
const pagination = s.object("Pagination metadata returned by Precoro.", {}, { additionalProperties: true });
const page = s.anyOf("The page number to request, or last to request the final page.", [
  s.positiveInteger("A positive page number."),
  s.literal("last", { description: "The last page marker." }),
]);
const commonFilters = {
  modifiedSince: s.nonEmptyString("Return records created or modified since this UTC timestamp."),
  per_page: s.integer("Number of records per page. Precoro supports 10, 20, 50, 100, or 200."),
  page,
  externalIds: s.array(
    "External IDs to pass as repeated external_id[] filters. Precoro supports up to 200 values.",
    s.positiveInteger("One numeric external ID."),
    { maxItems: 200 },
  ),
};
const commonOptional = ["modifiedSince", "per_page", "page", "externalIds"];

function listOutput(description: string, itemDescription: string) {
  return s.object(description, {
    data: s.array("Records returned by Precoro.", s.object(itemDescription, {}, { additionalProperties: true })),
    pagination,
    raw: looseRecord,
  });
}

function recordOutput(description: string, key: string, itemDescription: string) {
  return s.object(description, {
    [key]: s.object(itemDescription, {}, { additionalProperties: true }),
    raw: looseRecord,
  });
}

export const precoroActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_purchase_orders",
    operationType: "read",
    description: "List Precoro purchase orders with pagination and optional status/date filters.",
    inputSchema: s.object(
      "Precoro purchase order list filters.",
      {
        ...commonFilters,
        approvalLeftDate: s.nonEmptyString("Return purchase orders approved on or after this UTC timestamp."),
        approvalRightDate: s.nonEmptyString("Return purchase orders approved on or before this UTC timestamp."),
        statuses: s.array(
          "Purchase order status values to pass as repeated status[] filters.",
          s.integer("One Precoro status value."),
        ),
        logicTypes: s.array(
          "Purchase order logic type values to pass as repeated logicType[] filters.",
          s.integer("One Precoro logic type value."),
        ),
      },
      {
        optional: [...commonOptional, "approvalLeftDate", "approvalRightDate", "statuses", "logicTypes"],
      },
    ),
    outputSchema: listOutput("A page of Precoro purchase orders.", "A Precoro purchase order returned by the API."),
  }),
  defineProviderAction(service, {
    name: "get_purchase_order",
    operationType: "read",
    description: "Get one Precoro purchase order by its company-visible IDN.",
    inputSchema: s.object("Input parameters for getting a Precoro purchase order.", { idn }),
    outputSchema: recordOutput(
      "A Precoro purchase order response.",
      "purchaseOrder",
      "A Precoro purchase order returned by the API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_suppliers",
    operationType: "read",
    description: "List Precoro suppliers with pagination and optional modified-since filtering.",
    inputSchema: s.object("Common Precoro list filters.", commonFilters, { optional: commonOptional }),
    outputSchema: listOutput("A page of Precoro suppliers.", "A Precoro supplier returned by the API."),
  }),
  defineProviderAction(service, {
    name: "get_supplier",
    operationType: "read",
    description: "Get one Precoro supplier by numeric supplier ID.",
    inputSchema: s.object("Input parameters for getting a Precoro supplier.", { id }),
    outputSchema: recordOutput("A Precoro supplier response.", "supplier", "A Precoro supplier returned by the API."),
  }),
  defineProviderAction(service, {
    name: "list_items",
    operationType: "read",
    description: "List Precoro catalog items with pagination and optional modified-since filtering.",
    inputSchema: s.object("Common Precoro list filters.", commonFilters, { optional: commonOptional }),
    outputSchema: listOutput("A page of Precoro catalog items.", "A Precoro item returned by the API."),
  }),
  defineProviderAction(service, {
    name: "get_item",
    operationType: "read",
    description: "Get one Precoro catalog item by numeric item ID.",
    inputSchema: s.object("Input parameters for getting a Precoro catalog item.", { id }),
    outputSchema: recordOutput("A Precoro catalog item response.", "item", "A Precoro item returned by the API."),
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Precoro users visible to the connected API user.",
    inputSchema: s.object("Input parameters for listing Precoro users.", {}),
    outputSchema: listOutput("A page of Precoro users.", "A Precoro user returned by the API."),
  }),
  defineProviderAction(service, {
    name: "list_warehouses",
    operationType: "read",
    description: "List Precoro warehouses configured in the connected company.",
    inputSchema: s.object("Input parameters for listing Precoro warehouses.", {}),
    outputSchema: listOutput("A page of Precoro warehouses.", "A Precoro warehouse returned by the API."),
  }),
];
