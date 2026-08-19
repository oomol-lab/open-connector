import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "moonclerk";

const moonclerkDateSchema = s.date("The date in YYYY-MM-DD format required by MoonClerk.");
const moonclerkPositiveIdSchema = s.positiveInteger("The MoonClerk numeric identifier.");
const paginationCountSchema = s.integer("The number of rows to return. MoonClerk accepts values from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const paginationOffsetSchema = s.nonNegativeInteger("The starting offset for pagination in the current result set.");

const moneySchema = s.integer("The amount in cents as returned by MoonClerk.");
const nullableMoneySchema = s.nullable(s.integer("The amount in cents as returned by MoonClerk when a value exists."));

const paymentMethodSchema = s.object(
  "The payment method details returned by MoonClerk.",
  {
    type: s.string("The payment method type, such as card."),
    last4: s.string("The last four digits of the payment method."),
    exp_month: s.integer("The payment card expiration month."),
    exp_year: s.integer("The payment card expiration year."),
    brand: s.string("The payment card brand."),
  },
  { optional: ["type", "last4", "exp_month", "exp_year", "brand"] },
);

const addressResponseSchema = s.object(
  "The address response stored in a MoonClerk custom field.",
  {
    line1: s.string("The first address line."),
    line2: s.string("The second address line."),
    city: s.string("The address city."),
    state: s.string("The address state or region."),
    postal_code: s.string("The postal or ZIP code."),
    country: s.string("The country name."),
  },
  { optional: ["line1", "line2", "city", "state", "postal_code", "country"] },
);

const customFieldValueSchema = s.object(
  "One MoonClerk custom field response.",
  {
    id: s.integer("The numeric custom field identifier."),
    type: s.string("The custom field type."),
    response: s.anyOf("The custom field response value.", [
      s.string("A string custom field response."),
      addressResponseSchema,
      s.nullable(s.string("A nullable string custom field response.")),
      s.nullable(addressResponseSchema),
      s.unknown("An unmodeled custom field response."),
    ]),
  },
  { optional: ["id", "type", "response"] },
);

const couponSchema = s.object(
  "The coupon details returned by MoonClerk.",
  {
    code: s.string("The coupon code."),
    duration: s.string("The coupon duration type."),
    amount_off: nullableMoneySchema,
    currency: s.nullableString("The coupon currency."),
    percent_off: s.nullable(s.number("The coupon percent discount when present.")),
    duration_in_months: s.nullableInteger("The number of months the coupon is active."),
    max_redemptions: s.nullableInteger("The coupon redemption limit when present."),
    redeem_by: s.nullable(s.dateTime("The coupon redemption deadline in UTC.")),
  },
  {
    optional: [
      "code",
      "duration",
      "amount_off",
      "currency",
      "percent_off",
      "duration_in_months",
      "max_redemptions",
      "redeem_by",
    ],
  },
);

const discountSchema = s.object(
  "The discount details returned by MoonClerk.",
  {
    coupon: couponSchema,
    starts_at: s.nullable(s.dateTime("The discount start timestamp in UTC.")),
    ends_at: s.nullable(s.dateTime("The discount end timestamp in UTC.")),
  },
  { optional: ["coupon", "starts_at", "ends_at"] },
);

const checkoutSchema = s.object(
  "The checkout details returned by MoonClerk.",
  {
    amount_due: nullableMoneySchema,
    coupon_amount: nullableMoneySchema,
    coupon_code: s.nullableString("The coupon code applied during checkout."),
    date: s.nullable(s.dateTime("The checkout timestamp in UTC.")),
    fee: nullableMoneySchema,
    subtotal: nullableMoneySchema,
    token: s.nullableString("The MoonClerk checkout token."),
    total: nullableMoneySchema,
    trial_period_days: s.nullableInteger("The checkout trial period in days."),
    upfront_amount: nullableMoneySchema,
  },
  {
    optional: [
      "amount_due",
      "coupon_amount",
      "coupon_code",
      "date",
      "fee",
      "subtotal",
      "token",
      "total",
      "trial_period_days",
      "upfront_amount",
    ],
  },
);

const planSchema = s.object(
  "The subscription plan details returned by MoonClerk.",
  {
    id: s.nullableInteger("The MoonClerk plan identifier."),
    plan_reference: s.nullableString("The related Stripe plan reference."),
    amount: nullableMoneySchema,
    amount_description: s.nullableString("The plan amount description."),
    currency: s.nullableString("The plan currency."),
    interval: s.nullableString("The billing interval."),
    interval_count: s.nullableInteger("The billing interval count."),
  },
  {
    optional: ["id", "plan_reference", "amount", "amount_description", "currency", "interval", "interval_count"],
  },
);

const subscriptionSchema = s.object(
  "The subscription details returned by MoonClerk.",
  {
    id: s.nullableInteger("The MoonClerk subscription identifier."),
    subscription_reference: s.nullableString("The related Stripe subscription reference."),
    status: s.nullableString("The subscription status."),
    start: s.nullable(s.dateTime("The subscription start timestamp in UTC.")),
    first_payment_attempt: s.nullable(s.dateTime("The first payment attempt timestamp in UTC.")),
    next_payment_attempt: s.nullable(s.dateTime("The next payment attempt timestamp in UTC.")),
    current_period_start: s.nullable(s.dateTime("The current billing period start in UTC.")),
    current_period_end: s.nullable(s.dateTime("The current billing period end in UTC.")),
    trial_start: s.nullable(s.dateTime("The trial start timestamp in UTC.")),
    trial_end: s.nullable(s.dateTime("The trial end timestamp in UTC.")),
    trial_period_days: s.nullableInteger("The subscription trial period in days."),
    expires_at: s.nullable(s.dateTime("The subscription expiry timestamp in UTC.")),
    canceled_at: s.nullable(s.dateTime("The subscription cancellation timestamp in UTC.")),
    ended_at: s.nullable(s.dateTime("The subscription end timestamp in UTC.")),
    plan: s.nullable(planSchema),
  },
  {
    optional: [
      "id",
      "subscription_reference",
      "status",
      "start",
      "first_payment_attempt",
      "next_payment_attempt",
      "current_period_start",
      "current_period_end",
      "trial_start",
      "trial_end",
      "trial_period_days",
      "expires_at",
      "canceled_at",
      "ended_at",
      "plan",
    ],
  },
);

const formSchema = s.object(
  "The MoonClerk form object.",
  {
    id: moonclerkPositiveIdSchema,
    title: s.string("The MoonClerk form title."),
    access_token: s.string("The public access token for the form."),
    currency: s.string("The form currency."),
    payment_volume: moneySchema,
    successful_checkout_count: s.integer("The number of successful checkouts for the form."),
    created_at: s.dateTime("The form creation timestamp in UTC."),
    updated_at: s.dateTime("The form last update timestamp in UTC."),
  },
  {
    optional: ["access_token", "currency", "payment_volume", "successful_checkout_count", "created_at", "updated_at"],
  },
);

const customerSchema = s.object(
  "The MoonClerk customer object.",
  {
    id: moonclerkPositiveIdSchema,
    account_balance: moneySchema,
    name: s.string("The customer name."),
    email: s.string("The customer email address."),
    payment_method: s.nullable(paymentMethodSchema),
    custom_id: s.nullableString("The custom ID supplied through MoonClerk integrations."),
    customer_reference: s.nullableString("The related Stripe customer reference."),
    discount: s.nullable(discountSchema),
    delinquent: s.boolean("Whether the customer is currently delinquent."),
    management_url: s.nullableString("The MoonClerk management URL for the customer."),
    custom_fields: s.record("The custom fields returned for the customer.", customFieldValueSchema),
    form_id: s.nullableInteger("The associated MoonClerk form ID."),
    checkout: s.nullable(checkoutSchema),
    subscription: s.nullable(subscriptionSchema),
  },
  {
    optional: [
      "account_balance",
      "name",
      "email",
      "payment_method",
      "custom_id",
      "customer_reference",
      "discount",
      "delinquent",
      "management_url",
      "custom_fields",
      "form_id",
      "checkout",
      "subscription",
    ],
  },
);

const paymentSchema = s.object(
  "The MoonClerk payment object.",
  {
    id: moonclerkPositiveIdSchema,
    date: s.dateTime("The payment timestamp in UTC."),
    status: s.string("The payment status."),
    currency: s.string("The payment currency."),
    amount: moneySchema,
    fee: moneySchema,
    amount_refunded: moneySchema,
    amount_description: s.nullableString("The payment amount description."),
    name: s.string("The payer name."),
    email: s.string("The payer email address."),
    payment_method: s.nullable(paymentMethodSchema),
    charge_reference: s.nullableString("The related Stripe charge reference."),
    customer_id: s.nullableInteger("The associated MoonClerk customer ID."),
    customer_reference: s.nullableString("The related Stripe customer reference."),
    invoice_reference: s.nullableString("The related Stripe invoice reference."),
    custom_fields: s.record("The custom fields returned for the payment.", customFieldValueSchema),
    form_id: s.nullableInteger("The associated MoonClerk form ID."),
    custom_id: s.nullableString("The custom ID supplied through MoonClerk integrations."),
    checkout: s.nullable(checkoutSchema),
    coupon: s.nullable(couponSchema),
  },
  {
    optional: [
      "date",
      "status",
      "currency",
      "amount",
      "fee",
      "amount_refunded",
      "amount_description",
      "name",
      "email",
      "payment_method",
      "charge_reference",
      "customer_id",
      "customer_reference",
      "invoice_reference",
      "custom_fields",
      "form_id",
      "custom_id",
      "checkout",
      "coupon",
    ],
  },
);

const customerStatusSchema = s.stringEnum("The MoonClerk customer subscription status filter.", [
  "active",
  "canceled",
  "expired",
  "past_due",
  "pending",
  "unpaid",
]);

const paymentStatusSchema = s.stringEnum("The MoonClerk payment status filter.", ["successful", "refunded", "failed"]);

export const moonclerkActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    description: "List MoonClerk payment forms with official pagination parameters.",
    inputSchema: s.actionInput(
      {
        count: paginationCountSchema,
        offset: paginationOffsetSchema,
      },
      [],
      "Input parameters for listing MoonClerk forms.",
    ),
    outputSchema: s.actionOutput(
      {
        forms: s.array("The forms returned by MoonClerk.", formSchema),
      },
      "The MoonClerk forms list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Retrieve one MoonClerk payment form by its numeric ID.",
    inputSchema: s.actionInput(
      {
        id: moonclerkPositiveIdSchema,
      },
      ["id"],
      "Input parameters for retrieving one MoonClerk form.",
    ),
    outputSchema: s.actionOutput(
      {
        form: formSchema,
      },
      "The MoonClerk form detail response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description:
      "List MoonClerk customers with official filters for form, checkout date, next payment date, and status.",
    inputSchema: s.actionInput(
      {
        count: paginationCountSchema,
        offset: paginationOffsetSchema,
        form_id: moonclerkPositiveIdSchema,
        checkout_from: moonclerkDateSchema,
        checkout_to: moonclerkDateSchema,
        next_payment_from: moonclerkDateSchema,
        next_payment_to: moonclerkDateSchema,
        status: customerStatusSchema,
      },
      [],
      "Input parameters for listing MoonClerk customers.",
    ),
    outputSchema: s.actionOutput(
      {
        customers: s.array("The customers returned by MoonClerk.", customerSchema),
      },
      "The MoonClerk customers list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve one MoonClerk customer by its numeric ID.",
    inputSchema: s.actionInput(
      {
        id: moonclerkPositiveIdSchema,
      },
      ["id"],
      "Input parameters for retrieving one MoonClerk customer.",
    ),
    outputSchema: s.actionOutput(
      {
        customer: customerSchema,
      },
      "The MoonClerk customer detail response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_payments",
    description: "List MoonClerk payments with official filters for form, customer, payment date, and status.",
    inputSchema: s.actionInput(
      {
        count: paginationCountSchema,
        offset: paginationOffsetSchema,
        form_id: moonclerkPositiveIdSchema,
        customer_id: moonclerkPositiveIdSchema,
        date_from: moonclerkDateSchema,
        date_to: moonclerkDateSchema,
        status: paymentStatusSchema,
      },
      [],
      "Input parameters for listing MoonClerk payments.",
    ),
    outputSchema: s.actionOutput(
      {
        payments: s.array("The payments returned by MoonClerk.", paymentSchema),
      },
      "The MoonClerk payments list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_payment",
    description: "Retrieve one MoonClerk payment by its numeric ID.",
    inputSchema: s.actionInput(
      {
        id: moonclerkPositiveIdSchema,
      },
      ["id"],
      "Input parameters for retrieving one MoonClerk payment.",
    ),
    outputSchema: s.actionOutput(
      {
        payment: paymentSchema,
      },
      "The MoonClerk payment detail response.",
    ),
  }),
];
