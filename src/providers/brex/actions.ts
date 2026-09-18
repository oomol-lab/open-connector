import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "brex";

const cursorSchema = s.nonEmptyString("The Brex cursor returned from a previous list response.");
const brexIdSchema = s.nonEmptyString("The Brex resource identifier.");
const limitSchema = s.integer("Maximum number of records to return.", { minimum: 1, maximum: 1000 });
const expenseLimitSchema = s.integer("Maximum number of expenses to return.", { minimum: 1, maximum: 100 });
const expandSchema = s.stringArray("Brex expandable fields to include in the response.", {
  minItems: 1,
  maxItems: 20,
  itemDescription: "One Brex expandable field name.",
});
const idListSchema = (description: string) =>
  s.stringArray(description, { minItems: 1, maxItems: 100, itemDescription: "One Brex resource identifier." });

const rawObjectSchema = s.unknownObject("The raw object returned by Brex.");
const rawListSchema = s.looseObject("The raw paginated response returned by Brex.", {
  next_cursor: s.nullableString("The cursor for the next page returned by Brex."),
  items: s.array("The raw items returned by Brex.", rawObjectSchema),
});

const normalizedMoneyFields = {
  amount: s.nullableInteger("The amount in the smallest denomination of the currency."),
  currency: s.nullableString("The ISO 4217 currency code."),
};

const userSchema = s.object(
  "A normalized Brex user.",
  {
    id: brexIdSchema,
    firstName: s.string("The user's first name."),
    lastName: s.string("The user's last name."),
    email: s.email("The user's email address."),
    status: s.nullableString("The Brex user status."),
    managerId: s.nullableString("The Brex user ID of this user's manager."),
    departmentId: s.nullableString("The Brex department ID assigned to the user."),
    locationId: s.nullableString("The Brex location ID assigned to the user."),
    titleId: s.nullableString("The Brex title ID assigned to the user."),
    remoteDisplayId: s.nullableString("Identifier displayed by the IDP or HR system."),
    raw: rawObjectSchema,
  },
  {
    optional: ["status", "managerId", "departmentId", "locationId", "titleId", "remoteDisplayId"],
  },
);

const companySchema = s.object("A normalized Brex company.", {
  id: brexIdSchema,
  legalName: s.string("The legal name of the company."),
  accountType: s.string("The Brex company account type."),
  raw: rawObjectSchema,
});

const cardAccountSchema = s.object(
  "A normalized Brex card account.",
  {
    id: brexIdSchema,
    status: s.nullableString("The card account status."),
    currentBalanceAmount: normalizedMoneyFields.amount,
    currentBalanceCurrency: normalizedMoneyFields.currency,
    availableBalanceAmount: normalizedMoneyFields.amount,
    availableBalanceCurrency: normalizedMoneyFields.currency,
    accountLimitAmount: normalizedMoneyFields.amount,
    accountLimitCurrency: normalizedMoneyFields.currency,
    statementStartDate: s.nullableString("The current statement period start date."),
    statementEndDate: s.nullableString("The current statement period end date."),
    raw: rawObjectSchema,
  },
  {
    optional: [
      "status",
      "currentBalanceAmount",
      "currentBalanceCurrency",
      "availableBalanceAmount",
      "availableBalanceCurrency",
      "accountLimitAmount",
      "accountLimitCurrency",
      "statementStartDate",
      "statementEndDate",
    ],
  },
);

const transactionSchema = s.object(
  "A normalized Brex card transaction.",
  {
    id: brexIdSchema,
    description: s.string("The transaction description."),
    amount: normalizedMoneyFields.amount,
    currency: normalizedMoneyFields.currency,
    initiatedAtDate: s.string("The transaction initiated date returned by Brex."),
    postedAtDate: s.string("The transaction posted date returned by Brex."),
    type: s.nullableString("The Brex transaction type."),
    cardId: s.nullableString("The Brex card ID used for the transaction."),
    expenseId: s.nullableString("The Brex expense ID related to the transaction."),
    merchantDescriptor: s.nullableString("The merchant descriptor returned by Brex."),
    raw: rawObjectSchema,
  },
  {
    optional: ["amount", "currency", "type", "cardId", "expenseId", "merchantDescriptor"],
  },
);

const expenseSchema = s.object(
  "A normalized Brex expense.",
  {
    id: brexIdSchema,
    memo: s.nullableString("The expense memo."),
    status: s.nullableString("The expense status."),
    paymentStatus: s.nullableString("The expense payment status."),
    category: s.nullableString("The Brex expense category."),
    userId: s.nullableString("The Brex user ID associated with the expense."),
    budgetId: s.nullableString("The Brex budget ID associated with the expense."),
    merchantDescriptor: s.nullableString("The merchant descriptor returned by Brex."),
    purchasedAt: s.nullableString("The time the purchase was made."),
    updatedAt: s.nullableString("The last time the expense was updated."),
    billingAmount: normalizedMoneyFields.amount,
    billingCurrency: normalizedMoneyFields.currency,
    originalAmount: normalizedMoneyFields.amount,
    originalCurrency: normalizedMoneyFields.currency,
    purchasedAmount: normalizedMoneyFields.amount,
    purchasedCurrency: normalizedMoneyFields.currency,
    raw: rawObjectSchema,
  },
  {
    optional: [
      "memo",
      "status",
      "paymentStatus",
      "category",
      "userId",
      "budgetId",
      "merchantDescriptor",
      "purchasedAt",
      "updatedAt",
      "billingAmount",
      "billingCurrency",
      "originalAmount",
      "originalCurrency",
      "purchasedAmount",
      "purchasedCurrency",
    ],
  },
);

const budgetSchema = s.object(
  "A normalized Brex budget.",
  {
    id: brexIdSchema,
    accountId: s.string("The Brex account this budget belongs to."),
    name: s.string("The budget name."),
    description: s.nullableString("The budget description."),
    parentBudgetId: s.nullableString("The parent budget ID."),
    ownerUserIds: s.stringArray("User IDs of the budget owners.", { itemDescription: "One Brex user ID." }),
    periodRecurrenceType: s.string("The budget recurrence period type."),
    startDate: s.nullableString("The date when the budget starts counting."),
    endDate: s.nullableString("The date when the budget stops counting."),
    amount: normalizedMoneyFields.amount,
    currency: normalizedMoneyFields.currency,
    status: s.string("The Brex budget status."),
    limitType: s.nullableString("Whether the budget amount blocks spend."),
    raw: rawObjectSchema,
  },
  {
    optional: ["description", "parentBudgetId", "startDate", "endDate", "amount", "currency", "limitType"],
  },
);

const listUsersInputSchema = s.actionInput(
  {
    cursor: cursorSchema,
    limit: limitSchema,
    email: s.email("Filter users by a single email address."),
    remoteDisplayId: s.nonEmptyString("Filter users by one remote display ID."),
    expand: expandSchema,
  },
  [],
  "Input for listing Brex users.",
);

const listTransactionsInputSchema = s.actionInput(
  {
    cursor: cursorSchema,
    limit: limitSchema,
    userIds: idListSchema("Brex user IDs to filter transactions by."),
    postedAtStart: s.dateTime("Return transactions posted on or after this RFC 3339 timestamp."),
    expand: expandSchema,
  },
  [],
  "Input for listing Brex primary card transactions.",
);

const listExpensesInputSchema = s.actionInput(
  {
    cursor: cursorSchema,
    limit: expenseLimitSchema,
    expand: expandSchema,
    userIds: idListSchema("Brex user IDs to filter expenses by."),
    parentExpenseIds: idListSchema("Parent expense IDs to filter itemized expenses by."),
    budgetIds: idListSchema("Brex budget IDs to filter expenses by."),
    spendingEntityIds: idListSchema("Brex spending entity IDs to filter expenses by."),
    expenseType: s.stringArray("Brex expense types to filter by.", {
      minItems: 1,
      maxItems: 20,
      itemDescription: "One Brex expense type.",
    }),
    status: s.stringArray("Brex expense statuses to filter by.", {
      minItems: 1,
      maxItems: 20,
      itemDescription: "One Brex status.",
    }),
    paymentStatus: s.stringArray("Brex expense payment statuses to filter by.", {
      minItems: 1,
      maxItems: 20,
      itemDescription: "One Brex payment status.",
    }),
    purchasedAtStart: s.dateTime("Return expenses purchased on or after this RFC 3339 timestamp."),
    purchasedAtEnd: s.dateTime("Return expenses purchased on or before this RFC 3339 timestamp."),
    updatedAtStart: s.dateTime("Return expenses updated on or after this RFC 3339 timestamp."),
    updatedAtEnd: s.dateTime("Return expenses updated on or before this RFC 3339 timestamp."),
    paymentPostedAtStart: s.dateTime("Return expenses with payment posted on or after this RFC 3339 timestamp."),
    paymentPostedAtEnd: s.dateTime("Return expenses with payment posted on or before this RFC 3339 timestamp."),
    loadCustomFields: s.boolean("Whether Brex should load custom fields for expenses."),
  },
  [],
  "Input for listing Brex expenses.",
);

const getExpenseInputSchema = s.actionInput(
  {
    id: brexIdSchema,
    expand: expandSchema,
    loadCustomFields: s.boolean("Whether Brex should load custom fields for the expense."),
  },
  ["id"],
  "Input for retrieving one Brex expense.",
);

const paginationInputSchema = s.actionInput(
  {
    cursor: cursorSchema,
    limit: limitSchema,
  },
  [],
  "Input for a Brex paginated list request.",
);

const getByIdInputSchema = s.actionInput(
  {
    id: brexIdSchema,
  },
  ["id"],
  "Input for retrieving one Brex resource.",
);

const paginatedUsersOutputSchema = s.actionOutput(
  {
    items: s.array("Brex users returned for the requested page.", userSchema),
    nextCursor: s.nullableString("The cursor for the next page of Brex users."),
    raw: rawListSchema,
  },
  "Brex user list output.",
);

const paginatedCardAccountsOutputSchema = s.actionOutput(
  {
    items: s.array("Brex card accounts returned by the API.", cardAccountSchema),
    nextCursor: s.nullableString("The cursor for the next page if Brex returns one."),
    raw: rawObjectSchema,
  },
  "Brex card account list output.",
);

const paginatedTransactionsOutputSchema = s.actionOutput(
  {
    items: s.array("Brex primary card transactions returned for the requested page.", transactionSchema),
    nextCursor: s.nullableString("The cursor for the next page of transactions."),
    raw: rawListSchema,
  },
  "Brex primary card transaction list output.",
);

const paginatedExpensesOutputSchema = s.actionOutput(
  {
    items: s.array("Brex expenses returned for the requested page.", expenseSchema),
    nextCursor: s.nullableString("The cursor for the next page of expenses."),
    raw: rawListSchema,
  },
  "Brex expense list output.",
);

const paginatedBudgetsOutputSchema = s.actionOutput(
  {
    items: s.array("Brex budgets returned for the requested page.", budgetSchema),
    nextCursor: s.nullableString("The cursor for the next page of budgets."),
    raw: rawListSchema,
  },
  "Brex budget list output.",
);

export const brexActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the Brex user associated with the connected user token.",
    inputSchema: s.actionInput({}, [], "No input is required for this Brex action."),
    outputSchema: s.actionOutput(
      {
        user: userSchema,
        raw: rawObjectSchema,
      },
      "Brex current user output.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Retrieve the Brex company associated with the connected user token.",
    inputSchema: s.actionInput({}, [], "No input is required for this Brex action."),
    outputSchema: s.actionOutput(
      {
        company: companySchema,
        raw: rawObjectSchema,
      },
      "Brex company output.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Brex users with optional email, remote display ID, and cursor filters.",
    inputSchema: listUsersInputSchema,
    outputSchema: paginatedUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_card_accounts",
    operationType: "read",
    description: "List Brex card accounts for the connected company.",
    inputSchema: s.actionInput({}, [], "No input is required for this Brex action."),
    outputSchema: paginatedCardAccountsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_primary_card_transactions",
    operationType: "read",
    description: "List settled transactions across all Brex card accounts with optional user and date filters.",
    inputSchema: listTransactionsInputSchema,
    outputSchema: paginatedTransactionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_expenses",
    operationType: "read",
    description: "List Brex expenses with documented filters and cursor pagination.",
    inputSchema: listExpensesInputSchema,
    outputSchema: paginatedExpensesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_expense",
    operationType: "read",
    description: "Retrieve one Brex expense by ID.",
    inputSchema: getExpenseInputSchema,
    outputSchema: s.actionOutput(
      {
        expense: expenseSchema,
        raw: rawObjectSchema,
      },
      "Brex expense output.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_budgets",
    operationType: "read",
    description: "List Brex budgets with cursor pagination.",
    inputSchema: paginationInputSchema,
    outputSchema: paginatedBudgetsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_budget",
    operationType: "read",
    description: "Retrieve one Brex budget by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: s.actionOutput(
      {
        budget: budgetSchema,
        raw: rawObjectSchema,
      },
      "Brex budget output.",
    ),
  }),
];
