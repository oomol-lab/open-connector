import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fraudlabspro";

const transactionIdSchema = s.nonEmptyString("The FraudLabs Pro transaction id returned by the Screen Order API.");

const orderScreenInputSchema = s.object(
  "Input parameters for screening an order transaction with FraudLabs Pro.",
  {
    ip: s.nonEmptyString("The customer IP address for the transaction."),
    userOrderId: s.nonEmptyString("The merchant order id for the transaction."),
    email: s.nonEmptyString("The customer email address."),
    amount: s.number("The transaction amount."),
    currency: s.nonEmptyString("The ISO 4217 currency code for the transaction."),
    paymentMode: s.nonEmptyString("The payment method or mode used by the customer."),
    firstName: s.nonEmptyString("The customer first name."),
    lastName: s.nonEmptyString("The customer last name."),
    userPhone: s.nonEmptyString("The customer phone number."),
    emailHash: s.nonEmptyString("The hashed customer email value accepted by FraudLabs Pro."),
    emailDomain: s.nonEmptyString("The customer email domain."),
    binNo: s.nonEmptyString("The payment card BIN or IIN value."),
    quantity: s.positiveInteger("The number of items in the order."),
    couponCode: s.nonEmptyString("The coupon code used for the order."),
    flpChecksum: s.nonEmptyString("The FraudLabs Pro checksum value for the transaction."),
  },
  {
    optional: [
      "firstName",
      "lastName",
      "userPhone",
      "email",
      "emailHash",
      "emailDomain",
      "binNo",
      "userOrderId",
      "amount",
      "quantity",
      "currency",
      "paymentMode",
      "couponCode",
      "flpChecksum",
    ],
  },
);

const fraudlabsproStatusSchema = s.stringEnum("The final action returned by FraudLabs Pro.", [
  "APPROVE",
  "REJECT",
  "REVIEW",
]);

const screenOrderOutputSchema = s.looseRequiredObject("FraudLabs Pro order screening response.", {
  fraudlabspro_id: s.nullable(s.string("The FraudLabs Pro transaction id generated for the screened order.")),
  fraudlabspro_score: s.nullable(s.number("The fraud score returned by FraudLabs Pro.")),
  fraudlabspro_status: s.nullable(fraudlabsproStatusSchema),
  user_order_id: s.nullable(s.string("The merchant order id returned by FraudLabs Pro.")),
});

const getOrderResultInputSchema = s.requiredObject("Input parameters for retrieving a FraudLabs Pro order result.", {
  id: transactionIdSchema,
});

const orderResultOutputSchema = s.looseRequiredObject("FraudLabs Pro order result response.", {
  fraudlabspro_id: s.nullable(s.string("The FraudLabs Pro transaction id.")),
  fraudlabspro_score: s.nullable(s.number("The fraud score returned by FraudLabs Pro.")),
  fraudlabspro_status: s.nullable(fraudlabsproStatusSchema),
  fraudlabspro_rules: s.nullable(
    s.array("The FraudLabs Pro rules triggered by the system.", s.looseObject("A triggered FraudLabs Pro rule.")),
  ),
});

const feedbackOrderInputSchema = s.object(
  "Input parameters for sending merchant feedback to FraudLabs Pro.",
  {
    id: transactionIdSchema,
    action: s.stringEnum("The feedback action to apply to the transaction.", ["APPROVE", "REJECT", "REJECT_BLACKLIST"]),
    note: s.nonEmptyString("Optional merchant note explaining the feedback decision."),
  },
  { optional: ["note"] },
);

const feedbackOrderOutputSchema = s.looseObject("FraudLabs Pro feedback response.", {
  status: s.string("The feedback status returned by FraudLabs Pro."),
  message: s.string("The feedback message returned by FraudLabs Pro."),
  error: s.string("The error message returned by FraudLabs Pro when present."),
});

export const fraudlabsproActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "screen_order",
    description: "Screen an order transaction for fraud risk with FraudLabs Pro.",
    requiredScopes: [],
    inputSchema: orderScreenInputSchema,
    outputSchema: screenOrderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_order_result",
    description: "Retrieve a FraudLabs Pro order screening result by transaction id.",
    requiredScopes: [],
    inputSchema: getOrderResultInputSchema,
    outputSchema: orderResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "feedback_order",
    description: "Send approve or reject feedback for a FraudLabs Pro order transaction.",
    requiredScopes: [],
    inputSchema: feedbackOrderInputSchema,
    outputSchema: feedbackOrderOutputSchema,
  }),
];
