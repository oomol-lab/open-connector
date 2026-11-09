import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mumble";

const phoneSchema = s.nonEmptyString(
  "The customer's phone number in international digits without a leading plus sign.",
  { pattern: "^[0-9]+$" },
);

const acknowledgementSchema = s.object("A Mumble operation acknowledgement.", {
  success: s.boolean("Whether Mumble completed the operation successfully."),
  message: s.nullable(s.string("The operation message returned by Mumble.")),
});

const customerSchema = s.looseObject("A customer record returned by Mumble, including account-defined custom fields.");

const customerFields = {
  name: s.string("The customer's display name."),
  email: s.string("The customer's email address.", { format: "email" }),
  source: s.string("A comma-separated list of label names to attach to the customer."),
  botToken: s.string("The bot identifier, AI, or turn_off value assigned to the customer."),
  marketingAttribution: s.looseObject("Official Mumble marketing attribution fields using upstream snake_case keys."),
};

const createCustomerAction = defineProviderAction(service, {
  name: "create_customer",
  operationType: "write",
  description: "Create a customer in the Mumble WhatsApp customer database.",
  inputSchema: s.object(
    "The input payload for creating a Mumble customer.",
    { customerPhone: phoneSchema, ...customerFields },
    { optional: ["name", "email", "source", "botToken", "marketingAttribution"] },
  ),
  outputSchema: acknowledgementSchema,
});

const updateCustomerAction = defineProviderAction(service, {
  name: "update_customer",
  operationType: "write",
  description: "Update standard or account-defined fields on an existing Mumble customer.",
  inputSchema: s.object(
    "The input payload for updating a Mumble customer.",
    {
      customerPhone: phoneSchema,
      ...customerFields,
      customFields: s.looseObject("Account-defined customer fields whose keys are sent directly to Mumble."),
    },
    {
      optional: ["name", "email", "source", "botToken", "marketingAttribution", "customFields"],
    },
  ),
  outputSchema: acknowledgementSchema,
});

const getCustomerAction = defineProviderAction(service, {
  name: "get_customer",
  operationType: "read",
  description: "Get one Mumble customer and its custom fields by phone number.",
  inputSchema: s.object("The Mumble customer to retrieve.", { customerPhone: phoneSchema }),
  outputSchema: s.object("The response returned for one Mumble customer.", {
    customer: customerSchema,
  }),
});

const listCustomersAction = defineProviderAction(service, {
  name: "list_customers",
  operationType: "read",
  description: "List one page of customers from the Mumble customer database.",
  inputSchema: s.object(
    "The input payload for listing Mumble customers.",
    { page: s.integer("The one-based page number to retrieve.", { minimum: 1 }) },
    { optional: ["page"] },
  ),
  outputSchema: s.object("A page of Mumble customers.", {
    customers: s.array("The customers on this page.", customerSchema),
    total: s.nullable(s.integer("The total number of customers when provided.")),
    currentPage: s.nullable(s.integer("The current page number when provided.")),
    perPage: s.nullable(s.integer("The number of customers per page when provided.")),
    totalPages: s.nullable(s.integer("The total number of pages when provided.")),
  }),
});

const deleteCustomerAction = defineProviderAction(service, {
  name: "delete_customer",
  operationType: "destructive",
  description: "Permanently delete a customer from Mumble.",
  inputSchema: s.object("The Mumble customer to delete.", { customerPhone: phoneSchema }),
  outputSchema: acknowledgementSchema,
});

const labelNameSchema = s.nonEmptyString("The Mumble label name.");

const createLabelAction = defineProviderAction(service, {
  name: "create_label",
  operationType: "write",
  description: "Create a reusable customer label in Mumble.",
  inputSchema: s.object("The Mumble label to create.", { labelName: labelNameSchema }),
  outputSchema: acknowledgementSchema,
});

const listLabelsAction = defineProviderAction(service, {
  name: "list_labels",
  operationType: "read",
  description: "List all customer labels in the Mumble account.",
  inputSchema: s.object("The input payload for listing Mumble labels.", {}),
  outputSchema: s.object("The Mumble label list.", {
    labels: s.array("The labels returned by Mumble.", s.string("One label name returned by Mumble.")),
  }),
});

const deleteLabelAction = defineProviderAction(service, {
  name: "delete_label",
  operationType: "destructive",
  description: "Delete a customer label from Mumble.",
  inputSchema: s.object("The Mumble label to delete.", { labelName: labelNameSchema }),
  outputSchema: acknowledgementSchema,
});

export const mumbleActions: readonly ActionDefinition[] = [
  createCustomerAction,
  updateCustomerAction,
  getCustomerAction,
  listCustomersAction,
  deleteCustomerAction,
  createLabelAction,
  listLabelsAction,
  deleteLabelAction,
];
