import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { coinbaseAccountReadScope } from "./scopes.ts";

const service = "coinbase";

const accountSummarySchema = s.looseObject("One brokerage account returned by Coinbase.");
const listAccountsOutputSchema = s.object("Brokerage account list returned by Coinbase.", {
  accounts: s.array("Ordered brokerage accounts returned by Coinbase.", accountSummarySchema),
  has_next: s.boolean("Whether more accounts are available after this page."),
  cursor: s.string("Cursor returned by Coinbase for the next page, when present."),
  size: s.integer("Number of accounts returned in this page."),
});
const getAccountOutputSchema = s.object("Single brokerage account payload returned by Coinbase.", {
  account: s.looseObject("The brokerage account returned by Coinbase."),
});

export const coinbaseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Coinbase Advanced Trade brokerage accounts that the connected credential can access.",
    requiredScopes: [coinbaseAccountReadScope],
    inputSchema: s.object(
      "Input parameters for listing Coinbase brokerage accounts.",
      {
        limit: s.integer("Maximum number of accounts to return per page.", { minimum: 1, maximum: 250 }),
        cursor: s.nonEmptyString("Pagination cursor returned by Coinbase from a previous page."),
      },
      { optional: ["limit", "cursor"] },
    ),
    outputSchema: listAccountsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Get one Coinbase Advanced Trade brokerage account by UUID.",
    requiredScopes: [coinbaseAccountReadScope],
    inputSchema: s.object(
      "Input parameters for retrieving one Coinbase brokerage account.",
      {
        account_uuid: s.nonEmptyString("Brokerage account UUID returned by Coinbase."),
      },
      { required: ["account_uuid"] },
    ),
    outputSchema: getAccountOutputSchema,
  }),
];
