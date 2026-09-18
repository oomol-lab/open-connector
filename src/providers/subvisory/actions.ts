import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "subvisory";

const idSchema = s.nonEmptyString("Unique Subvisory resource ID.");
const billingCycleSchema = s.stringEnum("How often the subscription is billed.", [
  "weekly",
  "monthly",
  "quarterly",
  "biannual",
  "yearly",
  "custom",
]);
const subscriptionStatusSchema = s.stringEnum("Current subscription status.", [
  "active",
  "trial",
  "paused",
  "cancelled",
  "lifetime",
]);
const costSchema = s.anyOf("Cost per billing cycle as a string or number.", [
  s.nonEmptyString("Cost per billing cycle as a decimal string."),
  s.number("Cost per billing cycle as a number."),
]);
const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableUrlOrEmptySchema = (description: string) =>
  s.anyOf(description, [
    s.url(description),
    s.literal("", { description: "Empty string clears the value." }),
    { type: "null" },
  ]);
const emptyInputSchema = s.object("No input parameters are required.", {});
const idInputSchema = s.object("Input parameters for a Subvisory resource lookup.", { id: idSchema });

const subscriptionFields: Record<string, JsonSchema> = {
  name: s.string("Subscription name.", { minLength: 1, maxLength: 200 }),
  cost: costSchema,
  currency: s.string({ description: "ISO 4217 currency code.", minLength: 3, maxLength: 3, default: "USD" }),
  billingCycle: { ...billingCycleSchema, default: "monthly" },
  customCycleDays: s.positiveInteger("Number of days per cycle when billingCycle is custom."),
  startDate: s.nonEmptyString("ISO 8601 date or timestamp accepted by Subvisory."),
  status: { ...subscriptionStatusSchema, default: "active" },
  categoryId: nullableStringSchema("Category ID, or null to unassign."),
  paymentMethodId: nullableStringSchema("Payment method ID, or null to unassign."),
  notes: nullableStringSchema("Free-text notes, or null to clear it."),
  cancellationReason: nullableStringSchema("Reason for cancellation, or null to clear it."),
  logoUrl: nullableUrlOrEmptySchema("Custom logo URL, empty string, or null."),
  url: nullableUrlOrEmptySchema("Service URL, empty string, or null."),
  autoRenew: s.boolean({ description: "Whether the subscription auto-renews.", default: true }),
};

const createSubscriptionInputSchema = s.object(
  "Input parameters for creating a Subvisory subscription.",
  subscriptionFields,
  {
    optional: [
      "currency",
      "billingCycle",
      "customCycleDays",
      "status",
      "categoryId",
      "paymentMethodId",
      "notes",
      "cancellationReason",
      "logoUrl",
      "url",
      "autoRenew",
    ],
  },
);

const updateSubscriptionInputSchema = s.object(
  "Input parameters for updating a Subvisory subscription.",
  { id: idSchema, ...subscriptionFields },
  { optional: Object.keys(subscriptionFields) },
);

const categoryFields = {
  name: s.string("Category name.", { minLength: 1, maxLength: 100 }),
  color: s.string({ description: "Hex color code for UI display.", pattern: "^#[0-9a-fA-F]{6}$", default: "#6366f1" }),
  icon: nullableStringSchema("Icon identifier, or null to clear it."),
  isDefault: s.boolean({ description: "Whether this is a default category.", default: false }),
  sortOrder: s.integer({ description: "Sort position for UI ordering.", default: 0 }),
};

const createCategoryInputSchema = s.object("Input parameters for creating a Subvisory category.", categoryFields, {
  optional: ["color", "icon", "isDefault", "sortOrder"],
});
const updateCategoryInputSchema = s.object(
  "Input parameters for updating a Subvisory category.",
  { id: idSchema, ...categoryFields },
  { optional: Object.keys(categoryFields) },
);

const paymentMethodFields = {
  label: s.string("Display label for the payment method.", { minLength: 1, maxLength: 100 }),
  type: nullableStringSchema("Payment type such as credit_card or bank_transfer, or null to clear it."),
  icon: nullableStringSchema("Icon identifier, or null to clear it."),
  sortOrder: s.integer({ description: "Sort position for UI ordering.", default: 0 }),
};

const createPaymentMethodInputSchema = s.object(
  "Input parameters for creating a Subvisory payment method.",
  paymentMethodFields,
  { optional: ["type", "icon", "sortOrder"] },
);
const updatePaymentMethodInputSchema = s.object(
  "Input parameters for updating a Subvisory payment method.",
  { id: idSchema, ...paymentMethodFields },
  { optional: Object.keys(paymentMethodFields) },
);

const listOutputSchema = (description: string) =>
  s.looseObject(description, {
    description,
  });
const objectOutputSchema = (description: string) => s.looseObject(description);
const successOnlyOutputSchema = s.object("Subvisory success response.", {
  success: s.literal(true, { description: "Indicates the operation succeeded." }),
});

export const subvisoryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_subscriptions",
    operationType: "read",
    description: "List all subscriptions from Subvisory.",
    inputSchema: emptyInputSchema,
    outputSchema: listOutputSchema("Subvisory subscription list response."),
  }),
  defineProviderAction(service, {
    name: "create_subscription",
    operationType: "write",
    description: "Create a subscription in Subvisory.",
    inputSchema: createSubscriptionInputSchema,
    outputSchema: objectOutputSchema("Subvisory subscription response."),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    operationType: "read",
    description: "Retrieve a Subvisory subscription by ID.",
    inputSchema: idInputSchema,
    outputSchema: objectOutputSchema("Subvisory subscription response."),
  }),
  defineProviderAction(service, {
    name: "update_subscription",
    operationType: "write",
    description: "Update a Subvisory subscription.",
    inputSchema: updateSubscriptionInputSchema,
    outputSchema: objectOutputSchema("Subvisory subscription response."),
  }),
  defineProviderAction(service, {
    name: "delete_subscription",
    operationType: "destructive",
    description: "Delete a Subvisory subscription.",
    inputSchema: idInputSchema,
    outputSchema: successOnlyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_categories",
    operationType: "read",
    description: "List all Subvisory categories.",
    inputSchema: emptyInputSchema,
    outputSchema: listOutputSchema("Subvisory category list response."),
  }),
  defineProviderAction(service, {
    name: "create_category",
    operationType: "write",
    description: "Create a category in Subvisory.",
    inputSchema: createCategoryInputSchema,
    outputSchema: objectOutputSchema("Subvisory category response."),
  }),
  defineProviderAction(service, {
    name: "get_category",
    operationType: "read",
    description: "Retrieve a Subvisory category by ID.",
    inputSchema: idInputSchema,
    outputSchema: objectOutputSchema("Subvisory category response."),
  }),
  defineProviderAction(service, {
    name: "update_category",
    operationType: "write",
    description: "Update a Subvisory category.",
    inputSchema: updateCategoryInputSchema,
    outputSchema: objectOutputSchema("Subvisory category response."),
  }),
  defineProviderAction(service, {
    name: "delete_category",
    operationType: "destructive",
    description: "Delete a Subvisory category.",
    inputSchema: idInputSchema,
    outputSchema: successOnlyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_payment_methods",
    operationType: "read",
    description: "List all Subvisory payment methods.",
    inputSchema: emptyInputSchema,
    outputSchema: listOutputSchema("Subvisory payment method list response."),
  }),
  defineProviderAction(service, {
    name: "create_payment_method",
    operationType: "write",
    description: "Create a payment method in Subvisory.",
    inputSchema: createPaymentMethodInputSchema,
    outputSchema: objectOutputSchema("Subvisory payment method response."),
  }),
  defineProviderAction(service, {
    name: "get_payment_method",
    operationType: "read",
    description: "Retrieve a Subvisory payment method by ID.",
    inputSchema: idInputSchema,
    outputSchema: objectOutputSchema("Subvisory payment method response."),
  }),
  defineProviderAction(service, {
    name: "update_payment_method",
    operationType: "write",
    description: "Update a Subvisory payment method.",
    inputSchema: updatePaymentMethodInputSchema,
    outputSchema: objectOutputSchema("Subvisory payment method response."),
  }),
  defineProviderAction(service, {
    name: "delete_payment_method",
    operationType: "destructive",
    description: "Delete a Subvisory payment method.",
    inputSchema: idInputSchema,
    outputSchema: successOnlyOutputSchema,
  }),
];
