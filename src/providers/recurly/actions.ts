import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "recurly";

const recurlyId = s.string("A Recurly resource ID.", { minLength: 1, maxLength: 13 });
const accountId = s.nonEmptyString("The Recurly account ID or code.");
const planId = s.nonEmptyString("The Recurly plan ID or code.");
const subscriptionId = s.nonEmptyString("The Recurly subscription ID or UUID.");
const rawObject = (description: string) => s.looseObject(description);

const idsSchema = s.array(
  "Recurly resource IDs to fetch in one list call. Do not combine ids with other filters.",
  s.nonEmptyString("A Recurly resource ID."),
  { minItems: 1, maxItems: 200 },
);
const limitSchema = s.integer("The maximum number of Recurly records to return.", { minimum: 1, maximum: 200 });
const orderSchema = s.stringEnum("The Recurly sort order.", ["asc", "desc"]);
const sortSchema = s.stringEnum("The Recurly timestamp field used for sorting.", ["created_at", "updated_at"]);
const beginTimeSchema = s.dateTime(
  "Inclusively filter records by this ISO 8601 begin time when sorting by created_at or updated_at.",
);
const endTimeSchema = s.dateTime(
  "Inclusively filter records by this ISO 8601 end time when sorting by created_at or updated_at.",
);
const nextPathSchema = s.nonEmptyString(
  "The next path returned by a previous Recurly list response, such as /accounts?cursor=...",
);

const accountSchema = s.object("A normalized Recurly account.", {
  id: recurlyId,
  code: s.nullableString("The account code."),
  email: s.nullableString("The account email address when returned by Recurly."),
  firstName: s.nullableString("The account first name when returned by Recurly."),
  lastName: s.nullableString("The account last name when returned by Recurly."),
  company: s.nullableString("The account company name when returned by Recurly."),
  state: s.nullableString("The Recurly account state."),
  hasLiveSubscription: s.nullableBoolean(
    "Whether the account has an active, canceled, future, or paused subscription.",
  ),
  hasPastDueInvoice: s.nullableBoolean("Whether the account has a past-due invoice."),
  createdAt: s.nullableString("When the account was created."),
  updatedAt: s.nullableString("When the account was last changed."),
  raw: rawObject("The raw account object returned by Recurly."),
});

const planSchema = s.object("A normalized Recurly plan.", {
  id: recurlyId,
  code: s.nonEmptyString("The plan code."),
  name: s.nonEmptyString("The plan name."),
  state: s.nullableString("The Recurly plan state."),
  pricingModel: s.nullableString("The Recurly plan pricing model."),
  intervalUnit: s.nullableString("The plan billing interval unit."),
  intervalLength: s.nullableInteger("The number of interval units in each billing period."),
  createdAt: s.nullableString("When the plan was created."),
  updatedAt: s.nullableString("When the plan was last changed."),
  raw: rawObject("The raw plan object returned by Recurly."),
});

const subscriptionSchema = s.object("A normalized Recurly subscription.", {
  id: recurlyId,
  uuid: s.nullableString("The subscription UUID."),
  state: s.nullableString("The Recurly subscription state."),
  accountId: s.nullableString("The ID of the account attached to the subscription."),
  accountCode: s.nullableString("The code of the account attached to the subscription."),
  planId: s.nullableString("The ID of the plan attached to the subscription."),
  planCode: s.nullableString("The code of the plan attached to the subscription."),
  currency: s.nullableString("The subscription currency code."),
  unitAmount: s.nullableNumber("The subscription unit price."),
  quantity: s.nullableInteger("The subscription quantity."),
  currentPeriodEndsAt: s.nullableString("When the current billing period ends."),
  createdAt: s.nullableString("When the subscription was created."),
  updatedAt: s.nullableString("When the subscription was last changed."),
  raw: rawObject("The raw subscription object returned by Recurly."),
});

const listPageOutputSchema = {
  hasMore: s.boolean("Whether Recurly has more records after this page."),
  next: s.nullableString("The Recurly path for the next page when present."),
};

const commonListInputFields = {
  ids: idsSchema,
  limit: limitSchema,
  order: orderSchema,
  sort: sortSchema,
  beginTime: beginTimeSchema,
  endTime: endTimeSchema,
  nextPath: nextPathSchema,
};
const commonListOptionalFields = ["ids", "limit", "order", "sort", "beginTime", "endTime", "nextPath"] as const;

const addressSchema = s.object(
  "A basic Recurly address object.",
  {
    street1: s.string("The first street address line.", { minLength: 1, maxLength: 255 }),
    street2: s.string("The second street address line.", { minLength: 1, maxLength: 255 }),
    city: s.string("The address city.", { minLength: 1, maxLength: 255 }),
    region: s.string("The address region or state.", { minLength: 1, maxLength: 255 }),
    postalCode: s.string("The postal code.", { minLength: 1, maxLength: 20 }),
    country: s.string("The ISO 3166-1 alpha-2 country code.", { minLength: 2, maxLength: 2 }),
    phone: s.string("The address phone number.", { minLength: 1, maxLength: 30 }),
  },
  { optional: ["street1", "street2", "city", "region", "postalCode", "country", "phone"] },
);

const accountMutableFields = {
  username: s.string("A secondary value for the account.", { minLength: 1, maxLength: 255 }),
  email: s.email("The email address used for account communication."),
  firstName: s.string("The account first name.", { minLength: 1, maxLength: 255 }),
  lastName: s.string("The account last name.", { minLength: 1, maxLength: 255 }),
  company: s.string("The account company name.", { minLength: 1, maxLength: 100 }),
  vatNumber: s.string("The VAT number of the account.", { minLength: 1, maxLength: 20 }),
  taxExempt: s.boolean("Whether the account should be exempt from tax."),
  preferredLocale: s.nonEmptyString("The locale Recurly should use for account emails."),
  preferredTimeZone: s.nonEmptyString("The IANA time zone name Recurly should use for account emails."),
  address: addressSchema,
};
const accountMutableOptionalFields = [
  "username",
  "email",
  "firstName",
  "lastName",
  "company",
  "vatNumber",
  "taxExempt",
  "preferredLocale",
  "preferredTimeZone",
  "address",
] as const;

const accountCreateInputSchema = s.object(
  "Fields for creating a Recurly account.",
  {
    code: s.string("The unique account code. This cannot be changed after creation.", { minLength: 1, maxLength: 50 }),
    ...accountMutableFields,
  },
  { optional: accountMutableOptionalFields },
);

const accountUpdateInputSchema = s.object(
  "Fields for updating a Recurly account.",
  {
    accountId,
    ...accountMutableFields,
  },
  { optional: accountMutableOptionalFields },
);

const planCurrencySchema = s.object("A fixed-price Recurly plan currency.", {
  currency: s.string("The 3-letter ISO 4217 currency code.", { minLength: 3, maxLength: 3 }),
  unitAmount: s.number("The unit price for this currency."),
});

const planCreateInputSchema = s.object(
  "Fields for creating a fixed-price Recurly plan.",
  {
    code: s.string("The unique plan code.", { minLength: 1, maxLength: 50 }),
    name: s.string("The plan name.", { minLength: 1, maxLength: 255 }),
    currencies: s.array("The fixed-price currencies for this plan.", planCurrencySchema, { minItems: 1 }),
    intervalUnit: s.stringEnum("Unit for the plan billing interval.", ["days", "months"]),
    intervalLength: s.integer("The number of interval units in each billing period.", { minimum: 1 }),
    trialUnit: s.stringEnum("Unit for the trial interval.", ["days", "months"]),
    trialLength: s.integer("The number of trial units.", { minimum: 0 }),
    description: s.nonEmptyString("The plan description."),
  },
  { optional: ["intervalUnit", "intervalLength", "trialUnit", "trialLength", "description"] },
);

const subscriptionCreateInputSchema = s.object(
  "Fields for creating a Recurly subscription for an existing account.",
  {
    planCode: s.string("The code of the Recurly plan to subscribe to.", { minLength: 1, maxLength: 50 }),
    currency: s.string("The 3-letter ISO 4217 currency code.", { minLength: 3, maxLength: 3 }),
    accountCode: s.string("The existing Recurly account code.", { minLength: 1, maxLength: 50 }),
    quantity: s.integer("The subscription quantity.", { minimum: 1 }),
    unitAmount: s.number("The subscription unit amount."),
    collectionMethod: s.stringEnum("The collection method for the subscription.", ["automatic", "manual"]),
    poNumber: s.string("The purchase order number for manual invoicing.", { minLength: 1, maxLength: 50 }),
  },
  { optional: ["quantity", "unitAmount", "collectionMethod", "poNumber"] },
);

export const recurlyActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Recurly accounts with pagination and common filters.",
    inputSchema: s.object(
      "Query parameters for listing Recurly accounts.",
      {
        ...commonListInputFields,
        email: s.string("Filter for accounts with this exact email address."),
        subscriber: s.boolean("Filter for accounts with or without an active, canceled, or future subscription."),
        pastDue: s.literal(true, { description: "Filter for accounts with an invoice in the past_due state." }),
      },
      { optional: [...commonListOptionalFields, "email", "subscriber", "pastDue"] },
    ),
    outputSchema: s.object("The normalized Recurly account list response.", {
      accounts: s.array("Accounts returned by Recurly.", accountSchema),
      ...listPageOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve one Recurly account by ID or code.",
    inputSchema: s.object("Path parameters for retrieving a Recurly account.", { accountId }),
    outputSchema: s.object("The normalized Recurly account response.", { account: accountSchema }),
  }),
  defineProviderAction(service, {
    name: "create_account",
    description: "Create a Recurly account from JSON-friendly account fields.",
    inputSchema: accountCreateInputSchema,
    outputSchema: s.object("The normalized created Recurly account.", { account: accountSchema }),
  }),
  defineProviderAction(service, {
    name: "update_account",
    description: "Update basic profile fields on a Recurly account.",
    inputSchema: accountUpdateInputSchema,
    outputSchema: s.object("The normalized updated Recurly account.", { account: accountSchema }),
  }),
  defineProviderAction(service, {
    name: "list_plans",
    description: "List Recurly plans with pagination and common filters.",
    inputSchema: s.object(
      "Query parameters for listing Recurly plans.",
      {
        ...commonListInputFields,
        state: s.stringEnum("Filter plans by state.", ["active", "inactive"]),
      },
      { optional: [...commonListOptionalFields, "state"] },
    ),
    outputSchema: s.object("The normalized Recurly plan list response.", {
      plans: s.array("Plans returned by Recurly.", planSchema),
      ...listPageOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_plan",
    description: "Retrieve one Recurly plan by ID or code.",
    inputSchema: s.object("Path parameters for retrieving a Recurly plan.", { planId }),
    outputSchema: s.object("The normalized Recurly plan response.", { plan: planSchema }),
  }),
  defineProviderAction(service, {
    name: "create_plan",
    description: "Create a fixed-price Recurly plan with one or more currencies.",
    inputSchema: planCreateInputSchema,
    outputSchema: s.object("The normalized created Recurly plan.", { plan: planSchema }),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    description: "List Recurly subscriptions with pagination and common filters.",
    inputSchema: s.object(
      "Query parameters for listing Recurly subscriptions.",
      {
        ...commonListInputFields,
        state: s.stringEnum("Filter subscriptions by state.", [
          "active",
          "canceled",
          "expired",
          "future",
          "in_trial",
          "live",
        ]),
      },
      { optional: [...commonListOptionalFields, "state"] },
    ),
    outputSchema: s.object("The normalized Recurly subscription list response.", {
      subscriptions: s.array("Subscriptions returned by Recurly.", subscriptionSchema),
      ...listPageOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    description: "Retrieve one Recurly subscription by ID or UUID.",
    inputSchema: s.object("Path parameters for retrieving a Recurly subscription.", { subscriptionId }),
    outputSchema: s.object("The normalized Recurly subscription response.", { subscription: subscriptionSchema }),
  }),
  defineProviderAction(service, {
    name: "create_subscription",
    description: "Create a Recurly subscription for an existing account and plan.",
    inputSchema: subscriptionCreateInputSchema,
    outputSchema: s.object("The normalized created Recurly subscription.", { subscription: subscriptionSchema }),
  }),
];
