import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sumup";

const supportedCurrencies = [
  "BGN",
  "BRL",
  "CHF",
  "CLP",
  "COP",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HRK",
  "HUF",
  "NOK",
  "PLN",
  "RON",
  "SEK",
  "USD",
] as const;

const addressSchema = s.object(
  "A postal address associated with the SumUp customer.",
  {
    city: s.string("The city name."),
    country: s.string("The ISO 3166-1 alpha-2 country code.", { minLength: 2, maxLength: 2 }),
    line_1: s.string("The first address line."),
    line_2: s.string("The second address line."),
    postal_code: s.string("The postal code."),
    state: s.string("The state or region name."),
  },
  { optional: ["city", "country", "line_1", "line_2", "postal_code", "state"] },
);

const personalDetailsSchema = s.object(
  "Personal details stored for a SumUp customer.",
  {
    first_name: s.string("The customer's first name."),
    last_name: s.string("The customer's last name."),
    email: s.string("The customer's email address."),
    phone: s.string("The customer's phone number."),
    birth_date: s.string("The customer's birth date in YYYY-MM-DD format.", { format: "date" }),
    tax_id: s.string("The customer's tax identification number.", { maxLength: 255 }),
    address: addressSchema,
  },
  {
    optional: ["first_name", "last_name", "email", "phone", "birth_date", "tax_id", "address"],
  },
);

const customerOutputSchema = s.object("A SumUp customer response.", {
  customer: s.looseObject("The customer resource returned by SumUp."),
});

const checkoutOutputSchema = s.object("A SumUp checkout response.", {
  checkout: s.looseObject("The checkout resource returned by SumUp."),
});

const customerIdInput = (description: string) =>
  s.object(description, {
    customer_id: s.nonEmptyString("The merchant-scoped customer identifier."),
  });

const checkoutIdInput = (description: string) =>
  s.object(description, {
    checkout_id: s.nonEmptyString("The unique SumUp checkout identifier."),
  });

const createCustomerAction = defineProviderAction(service, {
  name: "create_customer",
  operationType: "write",
  description: "Create a saved customer in SumUp for future payment workflows.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a SumUp customer.",
    {
      customer_id: s.nonEmptyString("The merchant-defined unique customer identifier."),
      personal_details: personalDetailsSchema,
    },
    { optional: ["personal_details"] },
  ),
  outputSchema: customerOutputSchema,
});

const getCustomerAction = defineProviderAction(service, {
  name: "get_customer",
  operationType: "read",
  description: "Retrieve a saved SumUp customer by its merchant-scoped identifier.",
  requiredScopes: [],
  inputSchema: customerIdInput("The input payload for retrieving a SumUp customer."),
  outputSchema: customerOutputSchema,
});

const updateCustomerAction = defineProviderAction(service, {
  name: "update_customer",
  operationType: "write",
  description: "Update the supplied personal details of a saved SumUp customer.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for updating a SumUp customer.", {
    customer_id: s.nonEmptyString("The merchant-scoped customer identifier."),
    personal_details: personalDetailsSchema,
  }),
  outputSchema: customerOutputSchema,
});

const listPaymentInstrumentsAction = defineProviderAction(service, {
  name: "list_payment_instruments",
  operationType: "read",
  description: "List payment instruments saved for a SumUp customer.",
  requiredScopes: [],
  inputSchema: customerIdInput("The input payload for listing a SumUp customer's payment instruments."),
  outputSchema: s.object("The saved payment instruments returned by SumUp.", {
    payment_instruments: s.array(
      "The customer's saved payment instruments.",
      s.looseObject("One payment instrument returned by SumUp."),
    ),
  }),
});

const createCheckoutAction = defineProviderAction(service, {
  name: "create_checkout",
  operationType: "write",
  description: "Create a SumUp checkout, optionally enabling the SumUp-hosted payment page.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a SumUp checkout.",
    {
      checkout_reference: s.nonEmptyString("The merchant-defined checkout reference.", {
        maxLength: 90,
      }),
      amount: s.number("The amount to charge in major currency units."),
      currency: s.stringEnum("The three-letter ISO 4217 currency code.", supportedCurrencies),
      merchant_code: s.nonEmptyString("The SumUp merchant code receiving the payment."),
      description: s.string("A short description of the checkout."),
      return_url: s.string("The backend callback URL for checkout processing updates.", {
        format: "uri",
      }),
      redirect_url: s.string("The payer redirect URL for SCA or alternative payment methods.", {
        format: "uri",
      }),
      purpose: s.stringEnum("The business purpose of the checkout.", ["CHECKOUT", "SETUP_RECURRING_PAYMENT"]),
      valid_until: s.nullable(s.string("The optional checkout expiration timestamp.", { format: "date-time" })),
      customer_id: s.string("The saved SumUp customer identifier associated with the checkout."),
      hosted_checkout: s.object("Configuration for the SumUp-hosted checkout page.", {
        enabled: s.boolean("Whether SumUp should create a hosted checkout URL."),
      }),
    },
    {
      optional: [
        "description",
        "return_url",
        "redirect_url",
        "purpose",
        "valid_until",
        "customer_id",
        "hosted_checkout",
      ],
    },
  ),
  outputSchema: checkoutOutputSchema,
});

const getCheckoutAction = defineProviderAction(service, {
  name: "get_checkout",
  operationType: "read",
  description: "Retrieve a SumUp checkout and its current payment status.",
  requiredScopes: [],
  inputSchema: checkoutIdInput("The input payload for retrieving a SumUp checkout."),
  outputSchema: checkoutOutputSchema,
});

const listCheckoutsAction = defineProviderAction(service, {
  name: "list_checkouts",
  operationType: "read",
  description: "List SumUp checkouts, optionally filtered by checkout reference.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing SumUp checkouts.",
    {
      checkout_reference: s.string("The checkout reference used to filter results."),
    },
    { optional: ["checkout_reference"] },
  ),
  outputSchema: s.object("The checkout list returned by SumUp.", {
    checkouts: s.array("The matching SumUp checkouts.", s.looseObject("One SumUp checkout.")),
  }),
});

const deactivateCheckoutAction = defineProviderAction(service, {
  name: "deactivate_checkout",
  operationType: "destructive",
  description: "Deactivate a pending SumUp checkout so it can no longer be processed.",
  requiredScopes: [],
  inputSchema: checkoutIdInput("The input payload for deactivating a SumUp checkout."),
  outputSchema: checkoutOutputSchema,
});

export const sumupActions: ActionDefinition[] = [
  createCustomerAction,
  getCustomerAction,
  updateCustomerAction,
  listPaymentInstrumentsAction,
  createCheckoutAction,
  getCheckoutAction,
  listCheckoutsAction,
  deactivateCheckoutAction,
];
