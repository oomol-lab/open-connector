import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ynab";

const planIdSchema = s.nonEmptyString(
  'YNAB plan ID. Use "last-used" for the last used plan, or "default" when default plan selection is enabled.',
);
const lastKnowledgeSchema = s.integer(
  "Starting server knowledge value. When provided, YNAB returns only entities changed since this value.",
);
const ynabObjectSchema = s.looseObject("YNAB object returned by the API.");
const ynabDataSchema = (description: string, properties: Record<string, ReturnType<typeof s.looseObject>>) =>
  s.object(description, {
    data: s.looseObject("YNAB response data.", properties),
  });

const emptyInputSchema = s.object("Input parameters for the YNAB action.", {});
const planInputSchema = s.object("Input parameters for retrieving a YNAB plan resource.", {
  plan_id: planIdSchema,
});
const incrementalPlanInputSchema = s.object(
  "Input parameters for retrieving a YNAB resource with optional delta support.",
  {
    plan_id: planIdSchema,
    last_knowledge_of_server: lastKnowledgeSchema,
  },
  { optional: ["last_knowledge_of_server"] },
);

export const ynabActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve the authenticated YNAB user.",
    inputSchema: emptyInputSchema,
    outputSchema: ynabDataSchema("YNAB authenticated user response.", { user: ynabObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_plans",
    description: "List YNAB plans with summary information.",
    inputSchema: s.object(
      "Input parameters for listing YNAB plans.",
      { include_accounts: s.boolean("Whether to include plan accounts in the response.") },
      { optional: ["include_accounts"] },
    ),
    outputSchema: ynabDataSchema("YNAB plans response.", {
      plans: s.array("Plans returned by YNAB.", ynabObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_plan",
    description: "Retrieve a single YNAB plan with related entities.",
    inputSchema: incrementalPlanInputSchema,
    outputSchema: ynabDataSchema("YNAB plan response.", { plan: ynabObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "get_plan_settings",
    description: "Retrieve settings for a YNAB plan.",
    inputSchema: planInputSchema,
    outputSchema: ynabDataSchema("YNAB plan settings response.", { settings: ynabObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List accounts for a YNAB plan.",
    inputSchema: incrementalPlanInputSchema,
    outputSchema: ynabDataSchema("YNAB accounts response.", {
      accounts: s.array("Accounts returned by YNAB.", ynabObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve a single YNAB account.",
    inputSchema: s.object("Input parameters for retrieving a YNAB account.", {
      plan_id: planIdSchema,
      account_id: s.nonEmptyString("YNAB account ID."),
    }),
    outputSchema: ynabDataSchema("YNAB account response.", { account: ynabObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List categories grouped by category group for a YNAB plan.",
    inputSchema: incrementalPlanInputSchema,
    outputSchema: ynabDataSchema("YNAB categories response.", {
      category_groups: s.array("Category groups returned by YNAB.", ynabObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_category",
    description: "Retrieve a single YNAB category.",
    inputSchema: s.object("Input parameters for retrieving a YNAB category.", {
      plan_id: planIdSchema,
      category_id: s.nonEmptyString("YNAB category ID."),
    }),
    outputSchema: ynabDataSchema("YNAB category response.", { category: ynabObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "get_month_category",
    description: "Retrieve a YNAB category for a specific plan month.",
    inputSchema: s.object("Input parameters for retrieving a YNAB category in a specific month.", {
      plan_id: planIdSchema,
      month: s.nonEmptyString('Plan month in ISO date format, or "current" for the current month.'),
      category_id: s.nonEmptyString("YNAB category ID."),
    }),
    outputSchema: ynabDataSchema("YNAB category response.", { category: ynabObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_months",
    description: "List months for a YNAB plan.",
    inputSchema: incrementalPlanInputSchema,
    outputSchema: ynabDataSchema("YNAB months response.", {
      months: s.array("Months returned by YNAB.", ynabObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_month",
    description: "Retrieve a single YNAB plan month.",
    inputSchema: s.object("Input parameters for retrieving a YNAB month.", {
      plan_id: planIdSchema,
      month: s.nonEmptyString('Plan month in ISO date format, or "current" for the current month.'),
    }),
    outputSchema: ynabDataSchema("YNAB month response.", { month: ynabObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_payees",
    description: "List payees for a YNAB plan.",
    inputSchema: incrementalPlanInputSchema,
    outputSchema: ynabDataSchema("YNAB payees response.", {
      payees: s.array("Payees returned by YNAB.", ynabObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_payee",
    description: "Retrieve a single YNAB payee.",
    inputSchema: s.object("Input parameters for retrieving a YNAB payee.", {
      plan_id: planIdSchema,
      payee_id: s.nonEmptyString("YNAB payee ID."),
    }),
    outputSchema: ynabDataSchema("YNAB payee response.", { payee: ynabObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    description: "List YNAB plan transactions.",
    inputSchema: s.object(
      "Input parameters for listing YNAB transactions.",
      {
        plan_id: planIdSchema,
        since_date: s.date("Only include transactions on or after this ISO date."),
        until_date: s.date("Only include transactions on or before this ISO date."),
        type: s.stringEnum("Optional YNAB transaction filter.", ["uncategorized", "unapproved"]),
        last_knowledge_of_server: lastKnowledgeSchema,
      },
      { optional: ["since_date", "until_date", "type", "last_knowledge_of_server"] },
    ),
    outputSchema: ynabDataSchema("YNAB transactions response.", {
      transactions: s.array("Transactions returned by YNAB.", ynabObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_transaction",
    description: "Retrieve a single YNAB transaction.",
    inputSchema: s.object("Input parameters for retrieving a YNAB transaction.", {
      plan_id: planIdSchema,
      transaction_id: s.nonEmptyString("YNAB transaction ID."),
    }),
    outputSchema: ynabDataSchema("YNAB transaction response.", { transaction: ynabObjectSchema }),
  }),
];
