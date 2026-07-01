import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "baremetrics";

const sourceIdField = s.nonEmptyString("The Baremetrics source ID from the List Sources endpoint.");
const customerOidField = s.nonEmptyString("Your unique Baremetrics customer ID.");
const planOidField = s.nonEmptyString("Your unique Baremetrics plan ID.");
const subscriptionOidField = s.nonEmptyString("Your unique Baremetrics subscription ID.");
const orderField = s.stringEnum("The order to return Baremetrics results in.", ["asc", "desc"]);
const sortCustomersField = s.stringEnum("The customer field Baremetrics should sort by.", ["ltv", "created"]);
const intervalField = s.stringEnum("The recurring interval for the plan.", ["day", "month", "year"]);
const trialDurationUnitField = s.stringEnum("The unit for the trial duration.", ["day", "month"]);
const sourceSchema = s.looseObject("A Baremetrics source object.");
const customerSchema = s.looseObject("A Baremetrics customer object.");
const planSchema = s.looseObject("A Baremetrics plan object.");
const subscriptionSchema = s.looseObject("A Baremetrics subscription object.");
const chargeSchema = s.looseObject("A Baremetrics charge object.");
const eventSchema = s.looseObject("A Baremetrics event object returned by a mutation endpoint.");
const addonSchema = s.object("A Baremetrics subscription addon.", {
  oid: s.nonEmptyString("Your unique ID for the addon."),
  amount: s.integer("The addon amount in cents."),
  quantity: s.integer("The addon quantity."),
});
const customerOutputSchema = s.object("A Baremetrics customer response.", {
  customer: s.nullable(customerSchema),
  raw: s.looseObject("Raw Baremetrics customer response payload."),
});
const planOutputSchema = s.object("A Baremetrics plan response.", {
  plan: s.nullable(planSchema),
  raw: s.looseObject("Raw Baremetrics plan response payload."),
});
const subscriptionOutputSchema = s.object("A Baremetrics subscription response.", {
  subscription: s.nullable(subscriptionSchema),
  event: s.nullable(eventSchema),
  raw: s.looseObject("Raw Baremetrics subscription response payload."),
});

export const baremetricsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sources",
    description: "List Baremetrics sources available to the current API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Baremetrics sources.", {}),
    outputSchema: s.object("Baremetrics sources returned by the API.", {
      sources: s.array("Baremetrics sources available to this API key.", sourceSchema),
      raw: s.looseObject("Raw Baremetrics list sources response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List customers for a Baremetrics source with optional search and ordering.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Baremetrics customers.",
      {
        sourceId: sourceIdField,
        search: s.nonEmptyString("Search customers by Baremetrics oid, email, notes, or name."),
        sort: sortCustomersField,
        order: orderField,
      },
      { optional: ["search", "sort", "order"] },
    ),
    outputSchema: s.object("Baremetrics customers returned by the API.", {
      customers: s.array("Baremetrics customers matching the request.", customerSchema),
      raw: s.looseObject("Raw Baremetrics list customers response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a customer record in a Baremetrics API source.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Baremetrics customer.",
      {
        sourceId: sourceIdField,
        oid: customerOidField,
        name: s.nonEmptyString("The customer name."),
        email: s.email("The customer's email address."),
        notes: s.string("Your own notes for this customer."),
        created: s.nonEmptyString("Unix timestamp for when the customer was created."),
      },
      { optional: ["name", "email", "notes", "created"] },
    ),
    outputSchema: customerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_customer",
    description: "Update basic information for a Baremetrics customer.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Baremetrics customer.",
      {
        sourceId: sourceIdField,
        customerOid: customerOidField,
        name: s.nonEmptyString("The updated customer name."),
        email: s.email("The updated customer email address."),
        notes: s.string("Updated notes for this customer."),
        created: s.nonEmptyString("Unix timestamp for when the customer was created."),
      },
      { optional: ["name", "email", "notes", "created"] },
    ),
    outputSchema: customerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_plans",
    description: "List plans for a Baremetrics source with optional search.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Baremetrics plans.",
      {
        sourceId: sourceIdField,
        search: s.nonEmptyString("Search plans by Baremetrics name or oid."),
      },
      { optional: ["search"] },
    ),
    outputSchema: s.object("Baremetrics plans returned by the API.", {
      plans: s.array("Baremetrics plans matching the request.", planSchema),
      raw: s.looseObject("Raw Baremetrics list plans response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_plan",
    description: "Create a plan for use in Baremetrics subscription records.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Baremetrics plan.",
      {
        sourceId: sourceIdField,
        oid: planOidField,
        name: s.nonEmptyString("The internal name for this plan."),
        currency: s.nonEmptyString("The ISO currency code for this plan, such as usd."),
        amount: s.integer("The plan amount in cents."),
        interval: intervalField,
        intervalCount: s.integer("How many intervals are included in each billing period.", { minimum: 1 }),
        trialDuration: s.integer("The trial duration to use with trialDurationUnit.", { minimum: 0 }),
        trialDurationUnit: trialDurationUnitField,
      },
      { optional: ["trialDuration", "trialDurationUnit"] },
    ),
    outputSchema: planOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_plan",
    description: "Update the name of a Baremetrics plan.",
    requiredScopes: [],
    inputSchema: s.object("Input for updating a Baremetrics plan.", {
      sourceId: sourceIdField,
      planOid: planOidField,
      name: s.nonEmptyString("The new name for this plan."),
    }),
    outputSchema: planOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    description: "List subscriptions for a Baremetrics source with optional customer and ordering filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Baremetrics subscriptions.",
      {
        sourceId: sourceIdField,
        customerOid: customerOidField,
        order: orderField,
      },
      { optional: ["customerOid", "order"] },
    ),
    outputSchema: s.object("Baremetrics subscriptions returned by the API.", {
      subscriptions: s.array("Baremetrics subscriptions matching the request.", subscriptionSchema),
      raw: s.looseObject("Raw Baremetrics list subscriptions response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_subscription",
    description: "Create a subscription in a Baremetrics API source.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Baremetrics subscription.",
      {
        sourceId: sourceIdField,
        oid: subscriptionOidField,
        startedAt: s.nonEmptyString("Unix timestamp for when the subscription started."),
        canceledAt: s.nonEmptyString("Unix timestamp for when the subscription was or should be canceled."),
        planOid: planOidField,
        customerOid: customerOidField,
        addons: s.array("Addons attached to this subscription.", addonSchema),
        quantity: s.integer("The subscription quantity.", { minimum: 1 }),
        discount: s.integer("Discount amount in the same currency as the plan."),
      },
      { optional: ["canceledAt", "addons", "quantity", "discount"] },
    ),
    outputSchema: subscriptionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_subscription",
    description: "Update plan, addon, quantity, or discount data for a Baremetrics subscription.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Baremetrics subscription.",
      {
        sourceId: sourceIdField,
        subscriptionOid: subscriptionOidField,
        planOid: planOidField,
        occurredAt: s.nonEmptyString("Unix timestamp for when this subscription change occurred."),
        addons: s.array("Addons attached to this subscription.", addonSchema),
        quantity: s.integer("The subscription quantity.", { minimum: 1 }),
        discount: s.integer("Discount amount in the same currency as the plan."),
      },
      { optional: ["occurredAt", "addons", "quantity", "discount"] },
    ),
    outputSchema: subscriptionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_subscription",
    description: "Cancel a Baremetrics subscription at a documented cancellation timestamp.",
    requiredScopes: [],
    inputSchema: s.object("Input for canceling a Baremetrics subscription.", {
      sourceId: sourceIdField,
      subscriptionOid: subscriptionOidField,
      canceledAt: s.nonEmptyString("Unix timestamp for when the subscription was canceled."),
    }),
    outputSchema: subscriptionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_charges",
    description: "List charges for a Baremetrics source with optional time and entity filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Baremetrics charges.",
      {
        sourceId: sourceIdField,
        start: s.nonEmptyString("Unix timestamp for the start of the charge window."),
        end: s.nonEmptyString("Unix timestamp for the end of the charge window."),
        subscriptionOid: subscriptionOidField,
        customerOid: customerOidField,
      },
      { optional: ["start", "end", "subscriptionOid", "customerOid"] },
    ),
    outputSchema: s.object("Baremetrics charges returned by the API.", {
      charges: s.array("Baremetrics charges matching the request.", chargeSchema),
      raw: s.looseObject("Raw Baremetrics list charges response payload."),
    }),
  }),
];

export type BaremetricsActionName = (typeof baremetricsActions)[number]["name"];
