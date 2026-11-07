import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "alipay";
const orderId = s.nonEmptyString("Merchant order number used when creating the payment.", {
  maxLength: 64,
});
const tradeId = s.nonEmptyString(
  "Alipay transaction number. Takes precedence when both transaction identifiers are supplied.",
  { maxLength: 64 },
);
const refundId = s.nonEmptyString(
  "Merchant refund request number, unique within the transaction. Reuse the same number and amount when retrying this refund.",
  { maxLength: 64 },
);
const extra = s.looseObject(
  "Additional documented business parameters, such as goods_detail or query_options. Do not include credentials, public protocol parameters, or fields declared separately by this action.",
);
const commonOutput = {
  code: s.string(
    "Alipay API result code. 10000 indicates a successful API request, not necessarily a completed payment or refund.",
  ),
  msg: s.string("Alipay API result message."),
  trade_no: s.string("Alipay transaction number."),
  out_trade_no: s.string("Merchant order number."),
};
const paymentInput = s.object(
  "Parameters for generating a signed Alipay payment URL.",
  {
    out_trade_no: s.nonEmptyString(
      "Unique merchant order number containing only letters, digits, or underscores. Reuse it for the same order.",
      { maxLength: 64, pattern: "^[A-Za-z0-9_]+$" },
    ),
    total_amount: s.string("Order total in CNY, from 0.01 to 100000000, with at most two decimal places.", {
      pattern: "^(?:0\\.(?:0[1-9]|[1-9][0-9]?)|[1-9][0-9]{0,7}(?:\\.[0-9]{1,2})?|100000000(?:\\.0{1,2})?)$",
    }),
    subject: s.nonEmptyString("Order title, up to 256 characters. Do not include /, =, or &.", {
      maxLength: 256,
      pattern: "^[^/=&]+$",
    }),
    return_url: s.string(
      "HTTP or HTTPS URL to redirect the buyer after payment. A redirect does not prove payment success.",
      { format: "uri", pattern: "^https?://", maxLength: 256 },
    ),
    notify_url: s.string(
      "HTTP or HTTPS URL where Alipay sends payment notifications. Your receiving service must verify signatures and order details.",
      { format: "uri", pattern: "^https?://", maxLength: 256 },
    ),
    extra_biz_content: extra,
  },
  { optional: ["return_url", "notify_url", "extra_biz_content"] },
);
const paymentOutput = s.requiredObject("Locally generated signed URL. The buyer must open it to initiate payment.", {
  payment_url: s.string("Signed Alipay checkout URL. Generating this URL does not create or settle a transaction."),
  out_trade_no: s.string("Merchant order number included in the payment URL."),
});
const queryInput = s.requireAnyProperty(
  s.object(
    "Identify an Alipay transaction using at least one order identifier.",
    {
      out_trade_no: orderId,
      trade_no: tradeId,
      extra_biz_content: extra,
    },
    { optional: ["out_trade_no", "trade_no", "extra_biz_content"] },
  ),
  ["out_trade_no", "trade_no"],
);

export const alipayActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_web_payment",
    description:
      "Generate a signed Alipay desktop checkout URL locally. The buyer must open the URL and complete payment; use query_payment to verify the transaction status.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: paymentInput,
    outputSchema: paymentOutput,
  }),
  defineProviderAction(service, {
    name: "create_mobile_payment",
    description:
      "Generate a signed Alipay mobile website checkout URL locally. The buyer must open the URL and complete payment; use query_payment to verify the transaction status.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: paymentInput,
    outputSchema: paymentOutput,
  }),
  defineProviderAction(service, {
    name: "query_payment",
    description:
      "Query an Alipay transaction and return its verified business response. Check trade_status and the order amount before treating a payment as complete.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: queryInput,
    outputSchema: s.looseObject(
      "Verified Alipay transaction response, including additional upstream fields.",
      {
        ...commonOutput,
        trade_status: s.string(
          "Transaction state: WAIT_BUYER_PAY, TRADE_CLOSED, TRADE_SUCCESS, or TRADE_FINISHED. TRADE_SUCCESS and TRADE_FINISHED indicate successful payment.",
        ),
        total_amount: s.string("Original order total in CNY."),
        buyer_pay_amount: s.string("Amount paid by the buyer in CNY, when returned."),
        receipt_amount: s.string("Amount received by the merchant in CNY, when returned."),
      },
      { required: ["code", "msg"] },
    ),
  }),
  defineProviderAction(service, {
    name: "refund_payment",
    description:
      "Request a full or partial Alipay refund. Reuse out_request_no and refund_amount on retries. fund_change=Y confirms success; otherwise use query_refund to check the outcome.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "Parameters for one idempotent Alipay refund request.",
        {
          out_trade_no: orderId,
          trade_no: tradeId,
          out_request_no: refundId,
          refund_amount: s.string(
            "Refund amount in CNY, greater than zero with at most two decimal places. It must not exceed the remaining refundable amount.",
            {
              maxLength: 16,
              pattern: "^(?:0\\.(?:0[1-9]|[1-9][0-9]?)|[1-9][0-9]*(?:\\.[0-9]{1,2})?)$",
            },
          ),
          refund_reason: s.string("Reason for the refund, shown in payment records.", {
            maxLength: 256,
          }),
          extra_biz_content: extra,
        },
        { optional: ["out_trade_no", "trade_no", "refund_reason", "extra_biz_content"] },
      ),
      ["out_trade_no", "trade_no"],
    ),
    outputSchema: s.looseObject(
      "Verified Alipay refund response. A successful request code alone does not confirm refund completion.",
      {
        ...commonOutput,
        fund_change: s.string(
          "Y confirms a successful refund. N or an absent value requires query_refund to confirm the result.",
        ),
        refund_fee: s.string("Refund amount returned by Alipay in CNY."),
      },
      { required: ["code", "msg"] },
    ),
  }),
  defineProviderAction(service, {
    name: "query_refund",
    description:
      "Query an Alipay refund request. Only refund_status=REFUND_SUCCESS confirms a successful refund. Allow at least 10 seconds after requesting the refund before querying.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "Identify the transaction and refund request to query.",
        {
          out_trade_no: orderId,
          trade_no: tradeId,
          out_request_no: s.nonEmptyString(
            "Refund request number used for the original refund. For a refund made outside this connector without a request number, use its merchant order number.",
            { maxLength: 64 },
          ),
          extra_biz_content: extra,
        },
        { optional: ["out_trade_no", "trade_no", "extra_biz_content"] },
      ),
      ["out_trade_no", "trade_no"],
    ),
    outputSchema: s.looseObject(
      "Verified Alipay refund query response. Missing refund_status does not confirm a successful refund.",
      {
        ...commonOutput,
        out_request_no: s.string("Merchant refund request number."),
        refund_status: s.string(
          "REFUND_SUCCESS confirms refund completion. This field can be absent when the request was not received, failed, or has not finished processing.",
        ),
        refund_amount: s.string("Queried refund amount in CNY."),
        total_amount: s.string("Original order total in CNY."),
      },
      { required: ["code", "msg"] },
    ),
  }),
];
