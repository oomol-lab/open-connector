import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "booqable";

const resourceSchema = s.looseObject("A Booqable JSON:API resource object.", {
  id: s.nonEmptyString("The Booqable resource id."),
  type: s.nonEmptyString("The Booqable JSON:API resource type."),
  attributes: s.looseObject("The Booqable resource attributes."),
  relationships: s.looseObject("The Booqable resource relationships."),
});
const includedSchema = s.array("JSON:API resources sideloaded by Booqable for this request.", resourceSchema);
const linksSchema = s.looseObject("JSON:API links returned by Booqable.");
const metaSchema = s.looseObject("JSON:API metadata returned by Booqable.");
const fieldsSchema = s.record(
  'Booqable fields keyed by resource type, for example { customers: "id,name" }.',
  s.nonEmptyString("Comma-separated Booqable field names for one resource type."),
);
const extraFieldsSchema = s.record(
  'Booqable extra fields keyed by resource type, for example { companies: "subscription" }.',
  s.nonEmptyString("Comma-separated Booqable extra field names for one resource type."),
);
const filterSchema = s.looseObject("Booqable filter object. Nested operators are encoded as filter[field][operator].");
const metaInputSchema = s.looseObject(
  "Booqable meta aggregation object. Arrays are encoded with bracket query parameters.",
);

const listInputFields = {
  fields: fieldsSchema,
  filter: filterSchema,
  include: s.nonEmptyString("Comma-separated Booqable relationships to sideload."),
  meta: metaInputSchema,
  pageNumber: s.positiveInteger("The Booqable page number to request."),
  pageSize: s.positiveInteger("The number of Booqable records to request per page."),
  sort: s.nonEmptyString("Booqable sort expression such as created_at or -created_at."),
};
const listInputOptionalKeys = ["fields", "filter", "include", "meta", "pageNumber", "pageSize", "sort"];
const singleInputFields = {
  fields: fieldsSchema,
  include: s.nonEmptyString("Comma-separated Booqable relationships to sideload."),
};
const singleInputOptionalKeys = ["fields", "include"];
const searchInputSchema = s.object("Advanced search request for a Booqable resource.", {
  search: s.looseObject(
    "The Booqable advanced-search JSON body, usually containing filter.conditions and optional fields.",
  ),
});
const companyInputSchema = s.object(
  "Fetch the current Booqable company for the connected access token.",
  {
    fields: fieldsSchema,
    extraFields: extraFieldsSchema,
  },
  { optional: ["fields", "extraFields"] },
);

function collectionOutput(key: string, description: string) {
  return s.object(description, {
    [key]: s.array(`Booqable ${key} resources returned by the request.`, resourceSchema),
    included: includedSchema,
    links: linksSchema,
    meta: metaSchema,
  });
}

function singleOutput(key: string, description: string) {
  return s.object(description, {
    [key]: resourceSchema,
    included: includedSchema,
    meta: metaSchema,
  });
}

export const booqableActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_company",
    operationType: "read",
    description: "Fetch the current Booqable company connected to the access token.",
    inputSchema: companyInputSchema,
    outputSchema: singleOutput("company", "The current Booqable company response."),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Booqable customers with optional fields, filters, includes, and paging.",
    inputSchema: s.object("List Booqable customers.", listInputFields, { optional: listInputOptionalKeys }),
    outputSchema: collectionOutput("customers", "The Booqable customers list response."),
  }),
  defineProviderAction(service, {
    name: "search_customers",
    operationType: "read",
    description: "Run a Booqable advanced search over customers.",
    inputSchema: searchInputSchema,
    outputSchema: collectionOutput("customers", "The Booqable customers search response."),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Fetch one Booqable customer by id.",
    inputSchema: s.object(
      "Fetch one Booqable customer.",
      {
        customerId: s.nonEmptyString("The Booqable customer id."),
        ...singleInputFields,
      },
      { optional: singleInputOptionalKeys },
    ),
    outputSchema: singleOutput("customer", "The Booqable customer response."),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List Booqable orders with optional fields, filters, includes, and paging.",
    inputSchema: s.object("List Booqable orders.", listInputFields, { optional: listInputOptionalKeys }),
    outputSchema: collectionOutput("orders", "The Booqable orders list response."),
  }),
  defineProviderAction(service, {
    name: "search_orders",
    operationType: "read",
    description: "Run a Booqable advanced search over orders.",
    inputSchema: searchInputSchema,
    outputSchema: collectionOutput("orders", "The Booqable orders search response."),
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description: "Fetch one Booqable order by id.",
    inputSchema: s.object(
      "Fetch one Booqable order.",
      {
        orderId: s.nonEmptyString("The Booqable order id."),
        ...singleInputFields,
      },
      { optional: singleInputOptionalKeys },
    ),
    outputSchema: singleOutput("order", "The Booqable order response."),
  }),
  defineProviderAction(service, {
    name: "list_product_groups",
    operationType: "read",
    description: "List Booqable product groups with optional fields, filters, includes, and paging.",
    inputSchema: s.object("List Booqable product groups.", listInputFields, { optional: listInputOptionalKeys }),
    outputSchema: collectionOutput("productGroups", "The Booqable product groups list response."),
  }),
  defineProviderAction(service, {
    name: "search_product_groups",
    operationType: "read",
    description: "Run a Booqable advanced search over product groups.",
    inputSchema: searchInputSchema,
    outputSchema: collectionOutput("productGroups", "The Booqable product groups search response."),
  }),
  defineProviderAction(service, {
    name: "get_product_group",
    operationType: "read",
    description: "Fetch one Booqable product group by id.",
    inputSchema: s.object(
      "Fetch one Booqable product group.",
      {
        productGroupId: s.nonEmptyString("The Booqable product group id."),
        ...singleInputFields,
      },
      { optional: singleInputOptionalKeys },
    ),
    outputSchema: singleOutput("productGroup", "The Booqable product group response."),
  }),
];
