import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rewiser";

const transactionTypeSchema = s.stringEnum("The transaction type.", ["Expense", "Income"]);
const transactionSchema = s.looseObject(
  "A Rewiser transaction. Documented transaction fields are exposed directly while additional provider fields are preserved.",
  {
    id: s.string("The transaction identifier."),
    name: s.string("The transaction name or description."),
    amount: s.number("The transaction amount."),
    type: transactionTypeSchema,
    created_at: s.string("The timestamp when the transaction was created."),
    folder_id: s.string("The identifier of the folder containing the transaction."),
    is_paid: s.boolean("Whether the transaction has been paid."),
    planned_date: s.string("The planned transaction date."),
    note: s.nullable(s.string("The optional transaction note.")),
  },
);

const createTransactionSchema = s.object(
  "A transaction to create in Rewiser.",
  {
    folder_id: s.nonEmptyString("The identifier of the target Rewiser folder."),
    type: transactionTypeSchema,
    name: s.nonEmptyString("The transaction name or description."),
    amount: s.number("The positive transaction amount.", { exclusiveMinimum: 0 }),
    planned_date: s.nonEmptyString("The planned transaction date in a format accepted by Rewiser."),
    is_paid: s.boolean("Whether the transaction has already been paid."),
    paid_date: s.nonEmptyString("The payment date as an ISO 8601 date string."),
    note: s.string("An optional note for the transaction."),
    repeat_type: s.nullable(
      s.stringEnum("The optional recurrence interval.", ["monthly", "weekly", "yearly", "daily"]),
    ),
  },
  { optional: ["is_paid", "paid_date", "note", "repeat_type"] },
);

export const rewiserActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_folders",
    operationType: "read",
    description: "List the Rewiser folders available to the authenticated user.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Rewiser folders.", {}),
    outputSchema: s.object("The folders returned by Rewiser.", {
      folders: s.array(
        "The available Rewiser folders.",
        s.object("A Rewiser folder option.", {
          key: s.string("The folder identifier."),
          label: s.string("The folder display label."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_recent_transactions",
    operationType: "read",
    description: "Get recent Rewiser transactions, optionally filtered by transaction type or folder.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for recent Rewiser transactions.",
      {
        type: transactionTypeSchema,
        folder_id: s.nonEmptyString("The folder identifier used when folder_mode is single."),
        folder_mode: s.stringEnum("Whether to search all folders or one specific folder.", ["all", "single"]),
      },
      { optional: ["type", "folder_id", "folder_mode"] },
    ),
    outputSchema: s.object("Recent transactions returned by Rewiser.", {
      success: s.boolean("Whether Rewiser completed the request successfully."),
      count: s.integer("The number of transactions returned.", { minimum: 0 }),
      timestamp: s.string("The server timestamp for the response."),
      transactions: s.array("The recent transactions.", transactionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_multiple_transactions",
    operationType: "write",
    description: "Create one or more Rewiser transactions in a single request.",
    requiredScopes: [],
    inputSchema: s.object("Transactions to create in Rewiser.", {
      transactions: s.array("The transactions to create.", createTransactionSchema, {
        minItems: 1,
      }),
    }),
    outputSchema: s.object("The batch creation result returned by Rewiser.", {
      success: s.boolean("Whether Rewiser completed the batch request successfully."),
      request_id: s.string("The identifier assigned to the batch request."),
      inserted_count: s.integer("The number of transactions inserted.", { minimum: 0 }),
      failed_count: s.integer("The number of transactions that failed.", { minimum: 0 }),
      duplicate_count: s.integer("The number of duplicate transactions detected.", {
        minimum: 0,
      }),
      skipped_count: s.integer("The number of transactions skipped.", { minimum: 0 }),
      total_processed: s.integer("The total number of transactions processed.", { minimum: 0 }),
      timestamp: s.string("The server timestamp for the response."),
      inserted: s.array("Transactions inserted by Rewiser.", transactionSchema),
      duplicates: s.array(
        "Duplicate details returned by Rewiser.",
        s.looseObject("A duplicate transaction result returned by Rewiser."),
      ),
      skipped: s.array(
        "Skipped transaction details returned by Rewiser.",
        s.looseObject("A skipped transaction result returned by Rewiser."),
      ),
      rate_limit_info: s.looseObject("Rate-limit counters and reset details returned by Rewiser."),
      raw: s.looseObject("The complete Rewiser batch response."),
    }),
  }),
];
