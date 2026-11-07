import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const pagination = {
  page: s.integer("Page number, starting at 1. Zero is treated as page 1.", { minimum: 0 }),
  per_page: s.integer("Records per page, from 1 to 1000. Defaults to 10.", {
    minimum: 1,
    maximum: 1000,
  }),
};
const pageMetadata = s.looseObject("Pagination metadata. Continue with next_page until it is null.", {
  page: s.number("Current page number."),
  per_page: s.number("Records per page."),
  total_pages: s.number("Total number of pages."),
  next_page: s.nullable(s.number("Next page number, or null on the last page.")),
  prev_page: s.nullable(s.number("Previous page number, or null on the first page.")),
  total_count: s.number("Total record count."),
});
const link = s.looseObject("Payment link settings, status and checkout URL, including additional upstream fields.", {
  id: s.string("Payment link identifier."),
  title: s.string("Payment link title."),
  status: s.string("Link state, such as active, inactive or expired."),
  payment_url: s.string("Hosted checkout URL."),
  amount: s.number("Payment amount."),
  amount_currency: s.string("Payment currency code."),
});
const payment = s.looseObject("Payment details, including upstream customer, refund and settlement fields.", {
  id: s.string("Payment identifier."),
  status: s.string("Payment status. Refunded payments can remain captured; inspect refund_status."),
  amount: s.number("Payment amount."),
  amount_currency: s.string("Payment currency code."),
  refund_status: s.string("Refund status, separate from payment status."),
  settlement_amount: s.string("Settlement amount as a formatted string, possibly containing thousands separators."),
});
const id = s.nonEmptyString("Resource identifier returned by Mamo. Dot path segments are not accepted.");

export const actions: ProviderActionDefinition[] = [
  defineProviderAction("mamo_business", {
    name: "get_business",
    operationType: "read",
    requiredScopes: [],
    description: "Get the business profile and account status associated with the connected Mamo production API key.",
    inputSchema: s.requiredObject("Business profile query.", {}),
    outputSchema: s.looseObject("Mamo business profile.", {
      business_name: s.string("Business display name."),
      business_tag: s.string("Business slug used in payment URLs."),
      website: s.string("Business website."),
      account_status: s.nullable(s.string("Account status, such as Verified or Blocked; null when unverified.")),
    }),
  }),
  defineProviderAction("mamo_business", {
    name: "get_balances",
    operationType: "read",
    requiredScopes: [],
    description: "Get Mamo account balances by wallet, currency and wallet type.",
    inputSchema: s.requiredObject("Account balance query.", {}),
    outputSchema: s.looseObject("Mamo account balances.", {
      wallets: s.array(
        "Account wallets available to the business.",
        s.looseObject("One account wallet.", {
          id: s.string("Wallet identifier."),
          currency: s.string("Wallet currency code."),
          balance: s.number("Wallet balance in its currency."),
          type: s.string("Wallet type, such as main_wallet or debit."),
        }),
      ),
    }),
  }),
  defineProviderAction("mamo_business", {
    name: "list_payment_links",
    operationType: "read",
    requiredScopes: [],
    description:
      "List Mamo payment links newest first, including inactive deleted links. Follow pagination_meta.next_page to fetch more.",
    inputSchema: s.object("Payment link list query.", pagination, {
      optional: ["page", "per_page"],
    }),
    outputSchema: s.looseObject("One page of payment links.", {
      data: s.array("Payment links on this page.", link),
      pagination_meta: pageMetadata,
    }),
  }),
  defineProviderAction("mamo_business", {
    name: "get_payment_link",
    operationType: "read",
    requiredScopes: [],
    description: "Get a Mamo payment link's settings, status and checkout URL.",
    inputSchema: s.requiredObject("Payment link lookup.", { link_id: id }),
    outputSchema: link,
  }),
  defineProviderAction("mamo_business", {
    name: "list_payments",
    operationType: "read",
    requiredScopes: [],
    description:
      "List Mamo payments with date, link and sort filters. Dates cover inclusive whole days in Gulf Standard Time. Follow pagination_meta.next_page to fetch more.",
    inputSchema: s.object(
      "Payment list query.",
      {
        ...pagination,
        start_date: s.string("Include payments created on or after this date, YYYY-MM-DD.", {
          format: "date",
        }),
        end_date: s.string("Include payments created on or before this date, YYYY-MM-DD.", {
          format: "date",
        }),
        link_identifier: s.nonEmptyString("Only include payments made through this payment link."),
        "order_by[field]": s.stringEnum("Payment sort field.", ["created_at"]),
        "order_by[direction]": s.stringEnum("Sort direction. Defaults to desc.", ["asc", "desc"]),
      },
      {
        optional: [
          "page",
          "per_page",
          "start_date",
          "end_date",
          "link_identifier",
          "order_by[field]",
          "order_by[direction]",
        ],
      },
    ),
    outputSchema: s.looseObject("One page of payments.", {
      data: s.array("Payments on this page.", payment),
      pagination_meta: pageMetadata,
    }),
  }),
  defineProviderAction("mamo_business", {
    name: "get_payment",
    operationType: "read",
    requiredScopes: [],
    description: "Get a Mamo payment's status, amounts, refunds and settlement details.",
    inputSchema: s.requiredObject("Payment lookup.", { payment_id: id }),
    outputSchema: payment,
  }),
];
