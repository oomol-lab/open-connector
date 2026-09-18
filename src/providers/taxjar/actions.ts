import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "taxjar";

const emptyInput = s.actionInput({}, [], "Input parameters for this TaxJar action.");
const rawObject = s.looseObject("Raw object payload returned by TaxJar.");
const nonEmpty = (description: string): JsonSchema => s.nonEmptyString(description);
const money = (description: string): JsonSchema => s.number(description, { minimum: 0 });
const addressSchema = s.object(
  {
    id: nonEmpty("Unique identifier for this nexus address."),
    country: nonEmpty("Country code for the address, using ISO 3166-1 alpha-2 format."),
    zip: nonEmpty("ZIP or postal code for the address."),
    state: nonEmpty("State or province for the address."),
    city: nonEmpty("City for the address."),
    street: nonEmpty("Street address."),
  },
  { optional: ["id", "city", "street"], description: "TaxJar address input." },
);
const taxLineItemSchema = s.object(
  {
    id: nonEmpty("Line item identifier."),
    quantity: s.integer("Number of units for this line item.", { minimum: 1 }),
    unit_price: money("Price per unit for this line item."),
    discount: money("Discount amount applied to this line item."),
    product_tax_code: nonEmpty("TaxJar product tax category code for this item."),
  },
  {
    required: ["quantity", "unit_price"],
    optional: ["id", "discount", "product_tax_code"],
    description: "Tax calculation line item.",
  },
);
const transactionLineItemSchema = s.object(
  {
    id: nonEmpty("Line item identifier."),
    quantity: s.integer("Number of units for this line item.", { minimum: 1 }),
    unit_price: money("Price per unit for this line item."),
    discount: money("Discount amount applied to this line item."),
    sales_tax: money("Sales tax collected for this line item."),
    description: nonEmpty("Description of this line item."),
    product_identifier: nonEmpty("Product identifier, SKU, or other merchant item code."),
  },
  {
    required: ["quantity", "unit_price"],
    optional: ["id", "discount", "sales_tax", "description", "product_identifier"],
    description: "TaxJar transaction line item.",
  },
);
const refundLineItemSchema = s.object(
  {
    id: nonEmpty("Line item identifier."),
    quantity: s.integer("Number of units refunded for this line item.", { minimum: 1 }),
    unit_price: money("Price per unit for this refunded line item."),
    sales_tax: money("Sales tax refunded for this line item."),
    description: nonEmpty("Description of this refunded line item."),
    product_identifier: nonEmpty("Product identifier, SKU, or other merchant item code."),
  },
  {
    required: ["quantity", "unit_price"],
    optional: ["id", "sales_tax", "description", "product_identifier"],
    description: "TaxJar refund line item.",
  },
);
const customerPayload = s.object(
  {
    customer_id: nonEmpty("TaxJar customer identifier."),
    exemption_type: nonEmpty("Customer exemption type, such as wholesale, government, non_profit, or other."),
    name: nonEmpty("Customer name."),
    country: nonEmpty("Customer country code, using ISO 3166-1 alpha-2 format."),
    state: nonEmpty("Customer state or province."),
    zip: nonEmpty("Customer ZIP or postal code."),
    city: nonEmpty("Customer city."),
    street: nonEmpty("Customer street address."),
    exempt_regions: s.array("Customer exempt regions.", addressSchema),
  },
  {
    required: ["customer_id", "exemption_type", "name"],
    optional: ["country", "state", "zip", "city", "street", "exempt_regions"],
    description: "TaxJar customer payload.",
  },
);
const transactionDateRange = s.actionInput(
  {
    from_transaction_date: s.date("Start transaction date in YYYY-MM-DD format."),
    to_transaction_date: s.date("End transaction date in YYYY-MM-DD format."),
    provider: nonEmpty("Optional source provider filter used by TaxJar."),
  },
  ["from_transaction_date", "to_transaction_date"],
  "Input parameters for listing TaxJar transactions.",
);
const orderTransaction = s.object(
  {
    transaction_id: nonEmpty("Unique transaction identifier."),
    transaction_date: s.date("Transaction date in YYYY-MM-DD format."),
    provider: nonEmpty("Optional source provider name."),
    to_country: nonEmpty("Destination country code, using ISO 3166-1 alpha-2 format."),
    to_zip: nonEmpty("Destination ZIP or postal code."),
    to_state: nonEmpty("Destination state or province."),
    to_city: nonEmpty("Destination city."),
    to_street: nonEmpty("Destination street address."),
    amount: money("Order total including shipping and excluding sales tax."),
    shipping: money("Shipping cost for the order."),
    sales_tax: money("Sales tax collected for the order."),
    user_id: nonEmpty("Optional TaxJar user identifier."),
    exemption_type: nonEmpty("Exemption type applied to the order."),
    to_lat: s.number("Destination latitude."),
    to_lng: s.number("Destination longitude."),
    nexus_addresses: s.array("Seller nexus addresses for the transaction.", addressSchema, { minItems: 1 }),
    line_items: s.array("Order line items.", transactionLineItemSchema, { minItems: 1 }),
  },
  {
    required: ["transaction_id", "transaction_date", "to_country", "to_zip", "to_state", "amount", "shipping"],
    optional: [
      "provider",
      "to_city",
      "to_street",
      "sales_tax",
      "user_id",
      "exemption_type",
      "to_lat",
      "to_lng",
      "nexus_addresses",
      "line_items",
    ],
    description: "Input parameters for creating a TaxJar order.",
  },
);
const updateOrderTransaction = s.looseObject(
  "Input parameters for updating a TaxJar order.",
  orderTransaction.properties as Record<string, JsonSchema>,
);
updateOrderTransaction.required = ["transaction_id"];
const refundTransaction = s.object(
  {
    transaction_id: nonEmpty("Unique refund transaction identifier."),
    transaction_date: s.date("Refund transaction date in YYYY-MM-DD format."),
    transaction_reference_id: nonEmpty("Original order transaction identifier."),
    provider: nonEmpty("Optional source provider name."),
    to_country: nonEmpty("Destination country code, using ISO 3166-1 alpha-2 format."),
    to_zip: nonEmpty("Destination ZIP or postal code."),
    to_state: nonEmpty("Destination state or province."),
    to_city: nonEmpty("Destination city."),
    to_street: nonEmpty("Destination street address."),
    amount: money("Refund amount excluding sales tax."),
    shipping: money("Shipping amount refunded."),
    sales_tax: money("Sales tax refunded."),
    line_items: s.array("Refund line items.", refundLineItemSchema, { minItems: 1 }),
  },
  {
    required: [
      "transaction_id",
      "transaction_date",
      "transaction_reference_id",
      "to_country",
      "to_zip",
      "to_state",
      "amount",
    ],
    optional: ["provider", "to_city", "to_street", "shipping", "sales_tax", "line_items"],
    description: "Input parameters for creating a TaxJar refund.",
  },
);
const updateRefundTransaction = s.looseObject(
  "Input parameters for updating a TaxJar refund.",
  refundTransaction.properties as Record<string, JsonSchema>,
);
updateRefundTransaction.required = ["transaction_id"];

export const taxjarActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "calculate_sales_tax_for_order",
    operationType: "read",
    description: "Calculate TaxJar sales tax for an order.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        from_country: nonEmpty("Origin country code, using ISO 3166-1 alpha-2 format."),
        from_zip: nonEmpty("Origin ZIP or postal code."),
        from_state: nonEmpty("Origin state or province."),
        from_city: nonEmpty("Origin city."),
        from_street: nonEmpty("Origin street address."),
        to_country: nonEmpty("Destination country code, using ISO 3166-1 alpha-2 format."),
        to_zip: nonEmpty("Destination ZIP or postal code."),
        to_state: nonEmpty("Destination state or province."),
        to_city: nonEmpty("Destination city."),
        to_street: nonEmpty("Destination street address."),
        amount: money("Order amount excluding shipping."),
        shipping: money("Shipping cost for the order."),
        customer_id: nonEmpty("TaxJar customer identifier, if known."),
        exemption_type: nonEmpty("Exemption type for the order."),
        nexus_addresses: s.array("Seller nexus addresses to consider for the tax calculation.", addressSchema, {
          minItems: 1,
        }),
        line_items: s.array("Line items in the order.", taxLineItemSchema, { minItems: 1 }),
      },
      ["from_country", "from_zip", "from_state", "to_country", "to_zip", "to_state", "amount", "shipping"],
      "Input parameters for calculating TaxJar sales tax for an order.",
    ),
    outputSchema: s.actionOutput({ tax: rawObject }, "TaxJar tax calculation result."),
  }),
  defineProviderAction(service, {
    name: "show_tax_rates_for_location",
    operationType: "read",
    description: "Retrieve TaxJar sales tax rates for a location.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        zip: nonEmpty("ZIP or postal code for the location."),
        country: nonEmpty("Country code for the location, using ISO 3166-1 alpha-2 format."),
        state: nonEmpty("State or province for the location."),
        city: nonEmpty("City for the location."),
        street: nonEmpty("Street address for rooftop-level rates when available."),
      },
      ["zip"],
      "Input parameters for retrieving TaxJar rates for a location.",
    ),
    outputSchema: s.actionOutput({ rate: rawObject }, "TaxJar rate response."),
  }),
  defineProviderAction(service, {
    name: "list_tax_categories",
    operationType: "read",
    description: "List TaxJar product tax categories and codes.",
    requiredScopes: [],
    inputSchema: emptyInput,
    outputSchema: s.actionOutput(
      { categories: s.array("Product tax categories returned by TaxJar.", rawObject) },
      "TaxJar product tax category list.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_nexus_regions",
    operationType: "read",
    description: "List TaxJar nexus regions for the account.",
    requiredScopes: [],
    inputSchema: emptyInput,
    outputSchema: s.actionOutput(
      { regions: s.array("Nexus regions returned by TaxJar.", rawObject) },
      "TaxJar nexus region list.",
    ),
  }),
  defineProviderAction(service, {
    name: "summarize_tax_rates_for_all_regions",
    operationType: "read",
    description: "Retrieve TaxJar minimum and average sales tax rates by region.",
    requiredScopes: [],
    inputSchema: emptyInput,
    outputSchema: s.actionOutput(
      { summary_rates: s.array("Summary rates returned by TaxJar.", rawObject) },
      "TaxJar summary rate list.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List TaxJar customer identifiers.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        page: s.integer("Page number to retrieve.", { minimum: 1 }),
        per_page: s.integer("Number of customers per page.", { minimum: 1, maximum: 100 }),
      },
      [],
      "Input parameters for listing TaxJar customers.",
    ),
    outputSchema: s.actionOutput(
      { customers: s.stringArray("Customer identifiers returned by TaxJar.") },
      "TaxJar customer list.",
    ),
  }),
  defineProviderAction(service, {
    name: "show_customer",
    operationType: "read",
    description: "Retrieve a TaxJar customer by identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { customer_id: nonEmpty("TaxJar customer identifier.") },
      ["customer_id"],
      "Input parameters for a TaxJar customer lookup.",
    ),
    outputSchema: s.actionOutput({ customer: rawObject }, "TaxJar customer response."),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    operationType: "write",
    description: "Create a TaxJar customer for exemption management.",
    requiredScopes: [],
    inputSchema: customerPayload,
    outputSchema: s.actionOutput({ customer: rawObject }, "TaxJar customer response."),
  }),
  defineProviderAction(service, {
    name: "update_customer",
    operationType: "write",
    description: "Update an existing TaxJar customer.",
    requiredScopes: [],
    inputSchema: customerPayload,
    outputSchema: s.actionOutput({ customer: rawObject }, "TaxJar customer response."),
  }),
  defineProviderAction(service, {
    name: "delete_customer",
    operationType: "destructive",
    description: "Delete a TaxJar customer by identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { customer_id: nonEmpty("TaxJar customer identifier.") },
      ["customer_id"],
      "Input parameters for a TaxJar customer lookup.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the TaxJar customer delete request succeeded."),
        customer_id: nonEmpty("TaxJar customer identifier that was deleted."),
        response: rawObject,
      },
      "TaxJar customer delete result.",
      ["deleted", "customer_id"],
    ),
  }),
  defineProviderAction(service, {
    name: "list_order_transactions",
    operationType: "read",
    description: "List TaxJar order transaction identifiers within a date range.",
    requiredScopes: [],
    inputSchema: transactionDateRange,
    outputSchema: s.actionOutput(
      { orders: s.stringArray("Order transaction identifiers returned by TaxJar.") },
      "TaxJar order transaction list.",
    ),
  }),
  defineProviderAction(service, {
    name: "show_order_transaction",
    operationType: "read",
    description: "Retrieve a TaxJar order transaction by identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { transaction_id: nonEmpty("TaxJar transaction identifier.") },
      ["transaction_id"],
      "Input parameters for a TaxJar transaction lookup.",
    ),
    outputSchema: s.actionOutput({ order: rawObject }, "TaxJar order transaction response."),
  }),
  defineProviderAction(service, {
    name: "create_order_transaction",
    operationType: "write",
    description: "Create a TaxJar order transaction for reporting and filing.",
    requiredScopes: [],
    inputSchema: orderTransaction,
    outputSchema: s.actionOutput({ order: rawObject }, "TaxJar order transaction response."),
  }),
  defineProviderAction(service, {
    name: "update_order_transaction",
    operationType: "write",
    description: "Update an existing TaxJar order transaction.",
    requiredScopes: [],
    inputSchema: updateOrderTransaction,
    outputSchema: s.actionOutput({ order: rawObject }, "TaxJar order transaction response."),
  }),
  defineProviderAction(service, {
    name: "delete_order_transaction",
    operationType: "destructive",
    description: "Delete a TaxJar order transaction by identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { transaction_id: nonEmpty("TaxJar transaction identifier.") },
      ["transaction_id"],
      "Input parameters for a TaxJar transaction lookup.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the TaxJar transaction delete request succeeded."),
        transaction_id: nonEmpty("TaxJar transaction identifier that was deleted."),
        response: rawObject,
      },
      "TaxJar transaction delete result.",
      ["deleted", "transaction_id"],
    ),
  }),
  defineProviderAction(service, {
    name: "list_refund_transactions",
    operationType: "read",
    description: "List TaxJar refund transaction identifiers within a date range.",
    requiredScopes: [],
    inputSchema: transactionDateRange,
    outputSchema: s.actionOutput(
      { refunds: s.stringArray("Refund transaction identifiers returned by TaxJar.") },
      "TaxJar refund transaction list.",
    ),
  }),
  defineProviderAction(service, {
    name: "show_refund_transaction",
    operationType: "read",
    description: "Retrieve a TaxJar refund transaction by identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { transaction_id: nonEmpty("TaxJar transaction identifier.") },
      ["transaction_id"],
      "Input parameters for a TaxJar transaction lookup.",
    ),
    outputSchema: s.actionOutput({ refund: rawObject }, "TaxJar refund transaction response."),
  }),
  defineProviderAction(service, {
    name: "create_refund_transaction",
    operationType: "destructive",
    description: "Create a TaxJar refund transaction.",
    requiredScopes: [],
    inputSchema: refundTransaction,
    outputSchema: s.actionOutput({ refund: rawObject }, "TaxJar refund transaction response."),
  }),
  defineProviderAction(service, {
    name: "update_refund_transaction",
    operationType: "destructive",
    description: "Update an existing TaxJar refund transaction.",
    requiredScopes: [],
    inputSchema: updateRefundTransaction,
    outputSchema: s.actionOutput({ refund: rawObject }, "TaxJar refund transaction response."),
  }),
  defineProviderAction(service, {
    name: "delete_refund_transaction",
    operationType: "destructive",
    description: "Delete a TaxJar refund transaction by identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { transaction_id: nonEmpty("TaxJar transaction identifier.") },
      ["transaction_id"],
      "Input parameters for a TaxJar transaction lookup.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the TaxJar transaction delete request succeeded."),
        transaction_id: nonEmpty("TaxJar transaction identifier that was deleted."),
        response: rawObject,
      },
      "TaxJar transaction delete result.",
      ["deleted", "transaction_id"],
    ),
  }),
  defineProviderAction(service, {
    name: "validate_vat_number",
    operationType: "read",
    description: "Validate a VAT identification number with TaxJar.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { vat_number: nonEmpty("VAT identification number to validate.") },
      ["vat_number"],
      "Input parameters for validating a VAT number with TaxJar.",
    ),
    outputSchema: s.actionOutput({ validation: rawObject }, "TaxJar VAT validation response."),
  }),
];
