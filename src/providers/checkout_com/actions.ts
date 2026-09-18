import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "checkout_com";

function trimmedString(description: string, options: { maxLength?: number } = {}) {
  return s.nonEmptyString(description, {
    ...options,
  });
}

const customerIdSchema = trimmedString("The Checkout.com customer ID.");
const customerIdentifierSchema = trimmedString("The Checkout.com customer ID or email address.", {
  maxLength: 255,
});
const customerEmailSchema = s.email("The customer's email address.", {
  maxLength: 255,
});
const customerNameSchema = trimmedString("The customer's name.", { maxLength: 255 });
const phoneSchema = s.object(
  "The customer's phone number.",
  {
    country_code: trimmedString("The international country calling code.", { maxLength: 7 }),
    number: trimmedString("The phone number.", { maxLength: 25 }),
  },
  { optional: ["country_code", "number"] },
);
const metadataValueSchema = s.union(
  [
    s.string("A customer metadata string value.", { maxLength: 100 }),
    s.number("A customer metadata number value."),
    s.boolean("A customer metadata boolean value."),
  ],
  { description: "A primitive customer metadata value." },
);
const metadataSchema = {
  ...s.record("Customer metadata with up to 10 key-value pairs.", metadataValueSchema),
  maxProperties: 10,
  propertyNames: {
    type: "string",
    maxLength: 100,
    description: "A customer metadata key with at most 100 characters.",
  },
};
const defaultInstrumentSchema = trimmedString("The payment instrument ID to set as the customer's default instrument.");
const customerInputProperties = {
  email: customerEmailSchema,
  name: customerNameSchema,
  phone: phoneSchema,
  metadata: metadataSchema,
  default: defaultInstrumentSchema,
};

const createCustomerAction = defineProviderAction(service, {
  name: "create_customer",
  operationType: "write",
  description: "Create a Checkout.com customer for storing reusable customer details.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for creating a Checkout.com customer.", customerInputProperties, {
    optional: ["name", "phone", "metadata", "default"],
  }),
  outputSchema: s.object("The created Checkout.com customer reference.", {
    customer_id: s.string("The unique ID of the created customer."),
  }),
});

const getCustomerAction = defineProviderAction(service, {
  name: "get_customer",
  operationType: "read",
  description: "Get a Checkout.com customer and their linked payment instruments by ID or email.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for retrieving a Checkout.com customer.", {
    identifier: customerIdentifierSchema,
  }),
  outputSchema: s.object("The retrieved Checkout.com customer.", {
    customer: s.object(
      "Customer details returned by Checkout.com.",
      {
        id: s.string("The unique Checkout.com customer ID."),
        email: s.string("The customer's email address."),
        default: s.string("The customer's default payment instrument ID."),
        name: s.string("The customer's name."),
        phone: s.looseObject("The customer's phone number."),
        metadata: s.looseObject("The metadata attached to the customer."),
        instruments: s.array(
          "The payment instruments linked to the customer.",
          s.looseObject("A linked payment instrument returned by Checkout.com."),
        ),
      },
      {
        optional: ["default", "name", "phone", "metadata", "instruments"],
        additionalProperties: true,
      },
    ),
  }),
});

const updateCustomerAction = defineProviderAction(service, {
  name: "update_customer",
  operationType: "write",
  description: "Update stored details for a Checkout.com customer.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for updating a Checkout.com customer.",
    { customer_id: customerIdSchema, ...customerInputProperties },
    { optional: ["email", "name", "phone", "metadata", "default"] },
  ),
  outputSchema: s.object("Confirmation that the Checkout.com customer was updated.", {
    updated: s.boolean("Whether Checkout.com accepted the customer update."),
  }),
});

const deleteCustomerAction = defineProviderAction(service, {
  name: "delete_customer",
  operationType: "destructive",
  description: "Delete a Checkout.com customer and all linked payment instruments.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for deleting a Checkout.com customer.", {
    customer_id: customerIdSchema,
  }),
  outputSchema: s.object("Confirmation that the Checkout.com customer was deleted.", {
    deleted: s.boolean("Whether Checkout.com accepted the customer deletion."),
  }),
});

export const checkoutComActions: ActionDefinition[] = [
  createCustomerAction,
  getCustomerAction,
  updateCustomerAction,
  deleteCustomerAction,
];
