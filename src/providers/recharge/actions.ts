import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "recharge" as const;

const nonEmptyString = (description: string) =>
  s.string(description, {
    minLength: 1,
  });

const idSchema = nonEmptyString("The Recharge resource ID.");
const cursorSchema = nonEmptyString("The Recharge cursor returned as next_cursor or previous_cursor.");
const includeSchema = s.array(
  "Related Recharge resources to include, joined as a comma-separated include query parameter.",
  nonEmptyString("One Recharge include value."),
);
const idsSchema = s.array("Recharge resource IDs to request as a comma-separated ids query parameter.", idSchema);
const dateFilterSchema = s.string("A Recharge date or datetime filter value.");
const sortBySchema = nonEmptyString("The Recharge sort_by expression, such as id-desc.");
const limitSchema = s.integer("The number of records to request. Recharge allows up to 250.", {
  minimum: 1,
  maximum: 250,
});
const statusSchema = nonEmptyString("The Recharge status filter value or comma-separated status list.");
const resourceSchema = s.looseObject("A Recharge resource object returned by the API.");

const cursorFields = {
  limit: limitSchema,
  cursor: cursorSchema,
  include: includeSchema,
  ids: idsSchema,
  sortBy: sortBySchema,
  createdAtMin: dateFilterSchema,
  createdAtMax: dateFilterSchema,
  updatedAtMin: dateFilterSchema,
  updatedAtMax: dateFilterSchema,
};

const customerListInputSchema = s.object(
  "Query parameters for listing Recharge customers.",
  {
    ...cursorFields,
    email: s.email("Customer email address to filter by."),
  },
  {
    optional: [
      "limit",
      "cursor",
      "include",
      "ids",
      "sortBy",
      "createdAtMin",
      "createdAtMax",
      "updatedAtMin",
      "updatedAtMax",
      "email",
    ],
  },
);

const subscriptionListInputSchema = s.object(
  "Query parameters for listing Recharge subscriptions.",
  {
    ...cursorFields,
    addressId: idSchema,
    customerId: idSchema,
    productTitle: nonEmptyString("Subscription product title to filter by."),
    status: statusSchema,
  },
  {
    optional: [
      "limit",
      "cursor",
      "include",
      "ids",
      "sortBy",
      "createdAtMin",
      "createdAtMax",
      "updatedAtMin",
      "updatedAtMax",
      "addressId",
      "customerId",
      "productTitle",
      "status",
    ],
  },
);

const orderListInputSchema = s.object(
  "Query parameters for listing Recharge orders.",
  {
    ...cursorFields,
    addressId: idSchema,
    chargeId: idSchema,
    customerId: idSchema,
    externalOrderId: nonEmptyString("External ecommerce order ID to filter by."),
    processedAtMin: dateFilterSchema,
    processedAtMax: dateFilterSchema,
    status: statusSchema,
  },
  {
    optional: [
      "limit",
      "cursor",
      "include",
      "ids",
      "sortBy",
      "createdAtMin",
      "createdAtMax",
      "updatedAtMin",
      "updatedAtMax",
      "addressId",
      "chargeId",
      "customerId",
      "externalOrderId",
      "processedAtMin",
      "processedAtMax",
      "status",
    ],
  },
);

const chargeListInputSchema = s.object(
  "Query parameters for listing Recharge charges.",
  {
    ...cursorFields,
    addressId: idSchema,
    customerId: idSchema,
    discountCode: nonEmptyString("Discount code to filter charges by."),
    discountId: idSchema,
    externalOrderId: nonEmptyString("External ecommerce order ID to filter charges by."),
    purchaseItemId: idSchema,
    scheduledAt: dateFilterSchema,
    scheduledAtMin: dateFilterSchema,
    scheduledAtMax: dateFilterSchema,
    processedAtMin: dateFilterSchema,
    processedAtMax: dateFilterSchema,
    status: statusSchema,
  },
  {
    optional: [
      "limit",
      "cursor",
      "include",
      "ids",
      "sortBy",
      "createdAtMin",
      "createdAtMax",
      "updatedAtMin",
      "updatedAtMax",
      "addressId",
      "customerId",
      "discountCode",
      "discountId",
      "externalOrderId",
      "purchaseItemId",
      "scheduledAt",
      "scheduledAtMin",
      "scheduledAtMax",
      "processedAtMin",
      "processedAtMax",
      "status",
    ],
  },
);

const productListInputSchema = s.object(
  "Query parameters for listing Recharge products.",
  {
    ...cursorFields,
    collectionId: idSchema,
    externalProductId: nonEmptyString("External catalog product ID to filter by."),
    title: nonEmptyString("Product title to filter by."),
  },
  {
    optional: [
      "limit",
      "cursor",
      "include",
      "ids",
      "sortBy",
      "createdAtMin",
      "createdAtMax",
      "updatedAtMin",
      "updatedAtMax",
      "collectionId",
      "externalProductId",
      "title",
    ],
  },
);

const getResourceInputSchema = s.object(
  "Path and include parameters for retrieving one Recharge resource.",
  {
    id: idSchema,
    include: includeSchema,
  },
  { optional: ["include"] },
);

function listOutputSchema(description: string, fieldName: string, itemDescription: string) {
  return s.object(description, {
    [fieldName]: s.array(itemDescription, resourceSchema),
    nextCursor: s.nullable(s.string("The cursor for the next page, when Recharge returns one.")),
    previousCursor: s.nullable(s.string("The cursor for the previous page, when Recharge returns one.")),
    raw: s.looseObject("The raw Recharge API response."),
  });
}

function getOutputSchema(description: string, fieldName: string, itemDescription: string) {
  return s.object(description, {
    [fieldName]: s.looseObject(itemDescription),
    raw: s.looseObject("The raw Recharge API response."),
  });
}

export const rechargeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Recharge customers with cursor pagination and common filters.",
    requiredScopes: [],
    inputSchema: customerListInputSchema,
    outputSchema: listOutputSchema(
      "The response returned when listing Recharge customers.",
      "customers",
      "Customers returned by Recharge.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve one Recharge customer by ID.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: getOutputSchema(
      "The response returned when retrieving a Recharge customer.",
      "customer",
      "The Recharge customer.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    operationType: "read",
    description: "List Recharge subscriptions with cursor pagination and common filters.",
    requiredScopes: [],
    inputSchema: subscriptionListInputSchema,
    outputSchema: listOutputSchema(
      "The response returned when listing Recharge subscriptions.",
      "subscriptions",
      "Subscriptions returned by Recharge.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    operationType: "read",
    description: "Retrieve one Recharge subscription by ID.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: getOutputSchema(
      "The response returned when retrieving a Recharge subscription.",
      "subscription",
      "The Recharge subscription.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List Recharge orders with cursor pagination and common filters.",
    requiredScopes: [],
    inputSchema: orderListInputSchema,
    outputSchema: listOutputSchema(
      "The response returned when listing Recharge orders.",
      "orders",
      "Orders returned by Recharge.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description: "Retrieve one Recharge order by ID.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: getOutputSchema(
      "The response returned when retrieving a Recharge order.",
      "order",
      "The Recharge order.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_charges",
    operationType: "read",
    description: "List Recharge charges with cursor pagination and common filters.",
    requiredScopes: [],
    inputSchema: chargeListInputSchema,
    outputSchema: listOutputSchema(
      "The response returned when listing Recharge charges.",
      "charges",
      "Charges returned by Recharge.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_charge",
    operationType: "read",
    description: "Retrieve one Recharge charge by ID.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: getOutputSchema(
      "The response returned when retrieving a Recharge charge.",
      "charge",
      "The Recharge charge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List Recharge products with cursor pagination and common filters.",
    requiredScopes: [],
    inputSchema: productListInputSchema,
    outputSchema: listOutputSchema(
      "The response returned when listing Recharge products.",
      "products",
      "Products returned by Recharge.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Retrieve one Recharge product by ID.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: getOutputSchema(
      "The response returned when retrieving a Recharge product.",
      "product",
      "The Recharge product.",
    ),
  }),
];
