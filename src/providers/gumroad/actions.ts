import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gumroad";

const gumroadIdSchema = s.nonEmptyString("Gumroad resource ID.");
const dateSchema = s.nonEmptyString("Date filter in YYYY-MM-DD format.");
const rawObjectSchema = s.unknownObject("Raw object returned by Gumroad.");
const successSchema = s.boolean("Whether Gumroad reported that the request succeeded.");

const userOutputSchema = s.actionOutput(
  {
    success: successSchema,
    user: rawObjectSchema,
  },
  "Current Gumroad user response.",
);

const productOutputSchema = s.actionOutput(
  {
    success: successSchema,
    product: rawObjectSchema,
  },
  "Single Gumroad product response.",
);

const productsOutputSchema = s.actionOutput(
  {
    success: successSchema,
    products: s.array("Products returned by Gumroad.", rawObjectSchema),
  },
  "Gumroad products list response.",
);

const saleOutputSchema = s.actionOutput(
  {
    success: successSchema,
    sale: rawObjectSchema,
  },
  "Single Gumroad sale response.",
);

const salesOutputSchema = s.actionOutput(
  {
    success: successSchema,
    sales: s.array("Sales returned by Gumroad.", rawObjectSchema),
    next_page_url: s.nullableString("URL for the next sales page when returned."),
    next_page_key: s.nullableString("Page key to pass to the next list_sales request."),
  },
  "Gumroad sales list response.",
);

const subscribersOutputSchema = s.actionOutput(
  {
    success: successSchema,
    subscribers: s.array("Subscribers returned by Gumroad.", rawObjectSchema),
    next_page_url: s.nullableString("URL for the next subscribers page when returned."),
    next_page_key: s.nullableString("Page key to pass to the next list_product_subscribers request."),
  },
  "Gumroad product subscribers response.",
);

export const gumroadActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the authenticated Gumroad user.",
    inputSchema: s.actionInput({}, [], "No input is required to retrieve the authenticated Gumroad user."),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List products owned by the authenticated Gumroad user.",
    inputSchema: s.actionInput({}, [], "No input is required to list Gumroad products."),
    outputSchema: productsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve one Gumroad product by ID.",
    inputSchema: s.actionInput(
      {
        productId: gumroadIdSchema,
      },
      ["productId"],
      "Input for retrieving one Gumroad product.",
    ),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sales",
    description: "List successful Gumroad sales with optional filters and pagination.",
    inputSchema: s.actionInput(
      {
        after: dateSchema,
        before: dateSchema,
        productId: gumroadIdSchema,
        email: s.nonEmptyString("Buyer email address to filter sales by."),
        orderId: s.nonEmptyString("Gumroad order ID to filter sales by."),
        name: s.nonEmptyString("Customer name to filter sales by."),
        licenseKey: s.nonEmptyString("License key to filter sales by."),
        pageKey: s.nonEmptyString("Page key returned by a previous list_sales response."),
      },
      [],
      "Input for listing Gumroad sales.",
    ),
    outputSchema: salesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_sale",
    description: "Retrieve one Gumroad sale by ID.",
    inputSchema: s.actionInput(
      {
        saleId: gumroadIdSchema,
      },
      ["saleId"],
      "Input for retrieving one Gumroad sale.",
    ),
    outputSchema: saleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_product_subscribers",
    description: "List active subscribers for one Gumroad product.",
    inputSchema: s.actionInput(
      {
        productId: gumroadIdSchema,
        email: s.nonEmptyString("Subscriber email address to filter by."),
        paginated: s.boolean("Whether Gumroad should limit the response to a paginated page."),
        pageKey: s.nonEmptyString("Page key returned by a previous subscriber list response."),
      },
      ["productId"],
      "Input for listing active Gumroad subscribers for a product.",
    ),
    outputSchema: subscribersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "mark_sale_as_shipped",
    description: "Mark a Gumroad sale as shipped, optionally including a tracking URL.",
    inputSchema: s.actionInput(
      {
        saleId: gumroadIdSchema,
        trackingUrl: s.url("Tracking URL to attach to the shipment."),
      },
      ["saleId"],
      "Input for marking a Gumroad sale as shipped.",
    ),
    outputSchema: saleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "refund_sale",
    description: "Refund a Gumroad sale, optionally as a partial refund in cents.",
    inputSchema: s.actionInput(
      {
        saleId: gumroadIdSchema,
        amountCents: s.positiveInteger("Partial refund amount in the sale currency's smallest unit."),
      },
      ["saleId"],
      "Input for refunding a Gumroad sale.",
    ),
    outputSchema: saleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "resend_sale_receipt",
    description: "Resend a Gumroad sale receipt to the buyer.",
    inputSchema: s.actionInput(
      {
        saleId: gumroadIdSchema,
      },
      ["saleId"],
      "Input for resending a Gumroad sale receipt.",
    ),
    outputSchema: s.actionOutput(
      {
        success: successSchema,
      },
      "Gumroad sale receipt resend response.",
    ),
  }),
];
