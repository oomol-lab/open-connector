import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "simla";

const paginationLimitSchema = {
  ...s.integer("Number of records to return. Simla accepts only 20, 50, or 100."),
  enum: [20, 50, 100],
} satisfies JsonSchema;
const paginationInputProperties = {
  limit: paginationLimitSchema,
  page: s.integer("One-based page number to request.", { minimum: 1 }),
};
const idLookupSchema = s.stringEnum("Which identifier type is supplied in the id field.", ["externalId", "id"]);
const rawObjectSchema = s.looseObject("Raw Simla object payload.");
const rawPayloadSchema = s.looseObject("Raw Simla response payload.");
const paginationOutputSchema = s.looseObject("Simla pagination metadata.");
const genericFilterSchema = s.record(
  "Filter object encoded as Simla filter[...] query parameters.",
  s.unknown("Filter value passed through to Simla."),
);
const entityPatchSchema = s.looseObject("Entity fields passed to Simla.");
const externalIdsSchema = s.array("Simla external identifiers.", s.nonEmptyString("External ID."));
const idsSchema = s.array("Simla internal numeric identifiers.", s.positiveInteger("Internal ID."));

const listOrdersInputSchema = s.object(
  "Request parameters for listing Simla orders.",
  {
    ...paginationInputProperties,
    filter: genericFilterSchema,
  },
  { optional: ["limit", "page", "filter"] },
);

const getOrderInputSchema = s.object(
  "Request parameters for reading one Simla order.",
  {
    id: s.nonEmptyString("Order internal ID or external ID."),
    by: idLookupSchema,
    site: s.nonEmptyString("Optional Simla store symbolic code."),
  },
  { required: ["id"], optional: ["by", "site"] },
);

const createOrderInputSchema = s.object(
  "Request parameters for creating a Simla order.",
  {
    site: s.nonEmptyString("Optional Simla store symbolic code."),
    order: entityPatchSchema,
  },
  { required: ["order"], optional: ["site"] },
);

const editOrderInputSchema = s.object(
  "Request parameters for editing a Simla order.",
  {
    id: s.nonEmptyString("Order internal ID or external ID."),
    by: idLookupSchema,
    site: s.nonEmptyString("Optional Simla store symbolic code."),
    order: entityPatchSchema,
  },
  { required: ["id", "order"], optional: ["by", "site"] },
);

const getOrderStatusesInputSchema = s.object(
  "Request parameters for reading Simla order statuses.",
  {
    ids: idsSchema,
    externalIds: externalIdsSchema,
  },
  { optional: ["ids", "externalIds"] },
);

const listCustomersInputSchema = s.object(
  "Request parameters for listing Simla customers.",
  {
    ...paginationInputProperties,
    filter: genericFilterSchema,
  },
  { optional: ["limit", "page", "filter"] },
);

const getCustomerInputSchema = s.object(
  "Request parameters for reading one Simla customer.",
  {
    id: s.nonEmptyString("Customer internal ID or external ID."),
    by: idLookupSchema,
    site: s.nonEmptyString("Optional Simla store symbolic code."),
  },
  { required: ["id"], optional: ["by", "site"] },
);

const createCustomerInputSchema = s.object(
  "Request parameters for creating a Simla customer.",
  {
    site: s.nonEmptyString("Optional Simla store symbolic code."),
    customer: entityPatchSchema,
  },
  { required: ["customer"], optional: ["site"] },
);

const editCustomerInputSchema = s.object(
  "Request parameters for editing a Simla customer.",
  {
    id: s.nonEmptyString("Customer internal ID or external ID."),
    by: idLookupSchema,
    site: s.nonEmptyString("Optional Simla store symbolic code."),
    customer: entityPatchSchema,
  },
  { required: ["id", "customer"], optional: ["by", "site"] },
);

export const simlaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_orders",
    description: "List Simla orders with optional pagination and filter parameters.",
    inputSchema: listOrdersInputSchema,
    outputSchema: s.object("Paginated Simla orders response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      orders: s.array("Orders returned by Simla.", rawObjectSchema),
      pagination: paginationOutputSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Get full Simla order information by internal ID or external ID.",
    inputSchema: getOrderInputSchema,
    outputSchema: s.object("Simla order response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      order: rawObjectSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_order",
    description: "Create a Simla order using the official order payload object.",
    inputSchema: createOrderInputSchema,
    outputSchema: s.object("Simla order creation response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      id: s.positiveInteger("Internal ID of the created order."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "edit_order",
    description: "Edit a Simla order by internal ID or external ID.",
    inputSchema: editOrderInputSchema,
    outputSchema: s.object("Simla order editing response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      id: s.nullable(s.positiveInteger("Internal ID of the edited order when Simla returns it.")),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_order_statuses",
    description: "Get Simla status information for orders by internal IDs or external IDs.",
    inputSchema: getOrderStatusesInputSchema,
    outputSchema: s.object("Simla order statuses response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      orders: s.array("Order status items returned by Simla.", rawObjectSchema),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Simla customers with optional pagination and filter parameters.",
    inputSchema: listCustomersInputSchema,
    outputSchema: s.object("Paginated Simla customers response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      customers: s.array("Customers returned by Simla.", rawObjectSchema),
      pagination: paginationOutputSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Get full Simla customer information by internal ID or external ID.",
    inputSchema: getCustomerInputSchema,
    outputSchema: s.object("Simla customer response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      customer: rawObjectSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a Simla customer using the official customer payload object.",
    inputSchema: createCustomerInputSchema,
    outputSchema: s.object("Simla customer creation response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      id: s.positiveInteger("Internal ID of the created customer."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "edit_customer",
    description: "Edit a Simla customer by internal ID or external ID.",
    inputSchema: editCustomerInputSchema,
    outputSchema: s.object("Simla customer editing response.", {
      success: s.boolean("Whether Simla reported a successful request."),
      id: s.nullable(s.positiveInteger("Internal ID of the edited customer when Simla returns it.")),
      raw: rawPayloadSchema,
    }),
  }),
];
