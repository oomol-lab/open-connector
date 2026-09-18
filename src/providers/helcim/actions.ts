import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "helcim";

const addressInputSchema = s.object(
  "A billing or shipping address for a Helcim customer.",
  {
    name: s.nonEmptyString("The recipient or business name for this address."),
    street1: s.nonEmptyString("The primary street address."),
    street2: s.string("Additional address details such as a unit or suite number."),
    city: s.string("The city for this address."),
    province: s.string("The two-letter province or state code."),
    country: s.string("The ISO 3166-1 alpha-3 country code."),
    postalCode: s.nonEmptyString("The postal or ZIP code."),
    phone: s.string("The contact phone number for this address."),
    email: s.string("The contact email address for this address."),
  },
  { optional: ["street2", "city", "province", "country", "phone", "email"] },
);

const customerFields = {
  customerCode: s.string("The unique customer code, or omit it to let Helcim generate one."),
  contactName: s.string("The customer's primary contact name."),
  businessName: s.string("The customer's business name."),
  cellPhone: s.string("The customer's cell phone number."),
  billingAddress: addressInputSchema,
  shippingAddress: addressInputSchema,
};

const customerInputSchema = s.object("The customer fields accepted by Helcim.", customerFields, {
  optional: ["customerCode", "contactName", "businessName", "cellPhone", "billingAddress", "shippingAddress"],
});

const customerOutputSchema = s.looseObject("A customer returned by Helcim.", {
  id: s.optional(s.integer("The Helcim customer ID.")),
  customerCode: s.optional(s.string("The customer code returned by Helcim.")),
  businessName: s.optional(s.string("The customer's business name.")),
  contactName: s.optional(s.string("The customer's primary contact name.")),
  cellPhone: s.optional(s.string("The customer's cell phone number.")),
  billingAddress: s.optional(s.looseObject("The customer's billing address.")),
  shippingAddress: s.optional(s.looseObject("The customer's shipping address.")),
  cards: s.optional(
    s.array("The non-sensitive stored card metadata returned by Helcim.", s.looseObject("Stored card metadata.")),
  ),
});

const listCustomersAction = defineProviderAction(service, {
  name: "list_customers",
  operationType: "read",
  description: "List or search Helcim customers with page-based pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters used to list Helcim customers.",
    {
      search: s.string("A partial match across customer names, code, city, phone, or email."),
      customerCode: s.string("An exact customer code filter."),
      limit: s.integer("The maximum number of customers to return, up to 100.", {
        minimum: 1,
        maximum: 100,
      }),
      page: s.integer("The one-based result page to return.", { minimum: 1 }),
      includeCards: s.boolean("Whether to include stored card metadata for each customer."),
    },
    { optional: ["search", "customerCode", "limit", "page", "includeCards"] },
  ),
  outputSchema: s.object("The Helcim customer list response.", {
    customers: s.array("The customers returned by Helcim.", customerOutputSchema),
  }),
});

const getCustomerAction = defineProviderAction(service, {
  name: "get_customer",
  operationType: "read",
  description: "Retrieve one Helcim customer by ID.",
  requiredScopes: [],
  inputSchema: s.object("The customer lookup input.", {
    customerId: s.integer("The Helcim customer ID.", { minimum: 1 }),
  }),
  outputSchema: s.object("The Helcim customer response.", {
    customer: customerOutputSchema,
  }),
});

const createCustomerAction = defineProviderAction(service, {
  name: "create_customer",
  operationType: "write",
  description: "Create a Helcim customer using a contact name, business name, or both.",
  requiredScopes: [],
  inputSchema: customerInputSchema,
  outputSchema: s.object("The created Helcim customer response.", {
    customer: customerOutputSchema,
  }),
});

const updateCustomerAction = defineProviderAction(service, {
  name: "update_customer",
  operationType: "write",
  description: "Update an existing Helcim customer.",
  requiredScopes: [],
  inputSchema: s.object(
    "The customer ID and fields to update.",
    {
      customerId: s.integer("The Helcim customer ID.", { minimum: 1 }),
      ...customerFields,
    },
    {
      optional: ["customerCode", "contactName", "businessName", "cellPhone", "billingAddress", "shippingAddress"],
    },
  ),
  outputSchema: s.object("The updated Helcim customer response.", {
    customer: customerOutputSchema,
  }),
});

export const helcimActions: ActionDefinition[] = [
  listCustomersAction,
  getCustomerAction,
  createCustomerAction,
  updateCustomerAction,
];
