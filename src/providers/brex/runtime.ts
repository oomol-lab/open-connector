import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const brexApiBaseUrl = "https://api.brex.com";
const brexValidationPath = "/v2/users/me";
const brexDefaultRequestTimeoutMs = 30_000;

type BrexRequestPhase = "validate" | "execute";
type BrexActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BrexActionHandler = (input: Record<string, unknown>, context: BrexActionContext) => Promise<unknown>;

interface BrexRequestInput {
  path: string;
  method: "GET";
  apiKey: string;
  fetcher: ProviderFetch;
  phase: BrexRequestPhase;
  signal?: AbortSignal;
  query?: URLSearchParams;
}

export const brexActionHandlers: ProviderActionHandlers<"brex", BrexActionHandler> = {
  async get_current_user(_input, context) {
    const user = await requestBrexJson({
      path: "/v2/users/me",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return {
      user: normalizeBrexUser(user),
      raw: user,
    };
  },
  async get_company(_input, context) {
    const company = await requestBrexJson({
      path: "/v2/company",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return {
      company: normalizeBrexCompany(company),
      raw: company,
    };
  },
  async list_users(input, context) {
    const response = await requestBrexJson({
      path: "/v2/users",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
      query: buildBrexQuery(input, [
        ["cursor", "cursor"],
        ["limit", "limit"],
        ["email", "email"],
        ["remoteDisplayId", "remote_display_id"],
        ["expand", "expand[]", "array"],
      ]),
    });
    const page = asBrexList(response, "users");
    return {
      items: page.items.map(normalizeBrexUser),
      nextCursor: page.nextCursor,
      raw: response,
    };
  },
  async list_card_accounts(_input, context) {
    const response = await requestBrexJson({
      path: "/v2/accounts/card",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    const page = Array.isArray(response)
      ? { items: response, nextCursor: null }
      : asBrexList(response, "card accounts");
    return {
      items: page.items.map(normalizeBrexCardAccount),
      nextCursor: page.nextCursor,
      raw: response,
    };
  },
  async list_primary_card_transactions(input, context) {
    const response = await requestBrexJson({
      path: "/v2/transactions/card/primary",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
      query: buildBrexQuery(input, [
        ["cursor", "cursor"],
        ["limit", "limit"],
        ["userIds", "user_ids", "array"],
        ["postedAtStart", "posted_at_start"],
        ["expand", "expand[]", "array"],
      ]),
    });
    const page = asBrexList(response, "transactions");
    return {
      items: page.items.map(normalizeBrexTransaction),
      nextCursor: page.nextCursor,
      raw: response,
    };
  },
  async list_expenses(input, context) {
    const response = await requestBrexJson({
      path: "/v1/expenses",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
      query: buildBrexQuery(input, [
        ["cursor", "cursor"],
        ["limit", "limit"],
        ["expand", "expand[]", "array"],
        ["userIds", "user_id[]", "array"],
        ["parentExpenseIds", "parent_expense_id[]", "array"],
        ["budgetIds", "budget_id[]", "array"],
        ["spendingEntityIds", "spending_entity_id[]", "array"],
        ["expenseType", "expense_type[]", "array"],
        ["status", "status[]", "array"],
        ["paymentStatus", "payment_status[]", "array"],
        ["purchasedAtStart", "purchased_at_start"],
        ["purchasedAtEnd", "purchased_at_end"],
        ["updatedAtStart", "updated_at_start"],
        ["updatedAtEnd", "updated_at_end"],
        ["paymentPostedAtStart", "payment_posted_at_start"],
        ["paymentPostedAtEnd", "payment_posted_at_end"],
        ["loadCustomFields", "load_custom_fields"],
      ]),
    });
    const page = asBrexList(response, "expenses");
    return {
      items: page.items.map(normalizeBrexExpense),
      nextCursor: page.nextCursor,
      raw: response,
    };
  },
  async get_expense(input, context) {
    const expense = await requestBrexJson({
      path: `/v1/expenses/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
      query: buildBrexQuery(input, [
        ["expand", "expand[]", "array"],
        ["loadCustomFields", "load_custom_fields"],
      ]),
    });
    return {
      expense: normalizeBrexExpense(expense),
      raw: expense,
    };
  },
  async list_budgets(input, context) {
    const response = await requestBrexJson({
      path: "/v2/budgets",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
      query: buildBrexQuery(input, [
        ["cursor", "cursor"],
        ["limit", "limit"],
      ]),
    });
    const page = asBrexList(response, "budgets");
    return {
      items: page.items.map(normalizeBrexBudget),
      nextCursor: page.nextCursor,
      raw: response,
    };
  },
  async get_budget(input, context) {
    const budget = await requestBrexJson({
      path: `/v2/budgets/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return {
      budget: normalizeBrexBudget(budget),
      raw: budget,
    };
  },
};

export async function validateBrexCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const user = await requestBrexJson({
    path: brexValidationPath,
    method: "GET",
    apiKey: trimmedApiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const userRecord = optionalRecord(user);
  if (!userRecord) {
    throw new ProviderRequestError(502, "invalid Brex user response");
  }
  const userId = pickString(userRecord, "id");
  const email = pickString(userRecord, "email");
  const userName = buildUserName(userRecord);

  return {
    profile: {
      accountId: userId ?? "brex:user_token",
      displayName: email ?? userName ?? "Brex User Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      userId,
      userEmail: email,
      userName,
      validationEndpoint: brexValidationPath,
    }),
  };
}

async function requestBrexJson(input: BrexRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, brexDefaultRequestTimeoutMs);
  try {
    const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${brexApiBaseUrl}/`);
    if (input.query) {
      for (const [key, value] of input.query.entries()) {
        url.searchParams.append(key, value);
      }
    }

    const response = await input.fetcher(url.toString(), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });

    const body = await readBrexBody(response);
    if (!response.ok) {
      throw createBrexError(response, body, input.phase);
    }
    return body;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Brex API request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Brex API request failed");
  } finally {
    timeout.cleanup();
  }
}

async function readBrexBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBrexError(response: Response, body: unknown, phase: BrexRequestPhase): ProviderRequestError {
  const message = extractBrexErrorMessage(body) ?? `Brex API request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, body);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, body);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, body);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, body);
}

function extractBrexErrorMessage(body: unknown): string | undefined {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }
  const record = optionalRecord(body);
  if (!record) {
    return undefined;
  }
  return pickString(record, "message") ?? pickString(record, "type") ?? pickString(record, "code");
}

type QueryMapping = readonly [inputKey: string, queryKey: string, kind?: "array"];

function buildBrexQuery(input: Record<string, unknown>, mappings: readonly QueryMapping[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const [inputKey, queryKey, kind] of mappings) {
    const value = input[inputKey];
    if (value == null) {
      continue;
    }
    if (kind === "array") {
      if (!Array.isArray(value)) {
        continue;
      }
      for (const item of value) {
        query.append(queryKey, String(item));
      }
      continue;
    }
    query.set(queryKey, String(value));
  }
  return query;
}

function asBrexList(
  value: unknown,
  name: string,
): { items: Array<Record<string, unknown>>; nextCursor: string | null } {
  const record = optionalRecord(value);
  if (!record || !Array.isArray(record.items)) {
    throw new ProviderRequestError(502, `invalid Brex ${name} response`);
  }
  return {
    items: record.items.map((item) => optionalRecord(item) ?? {}),
    nextCursor: nullableStringField(record, "next_cursor"),
  };
}

function normalizeBrexUser(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return compactBrexOutput({
    id: pickString(record, "id") ?? "",
    firstName: pickString(record, "first_name") ?? "",
    lastName: pickString(record, "last_name") ?? "",
    email: pickString(record, "email") ?? "",
    status: nullableStringField(record, "status"),
    managerId: nullableStringField(record, "manager_id"),
    departmentId: nullableStringField(record, "department_id"),
    locationId: nullableStringField(record, "location_id"),
    titleId: nullableStringField(record, "title_id"),
    remoteDisplayId: nullableStringField(record, "remote_display_id"),
    raw: record,
  });
}

function normalizeBrexCompany(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return compactBrexOutput({
    id: pickString(record, "id") ?? "",
    legalName: pickString(record, "legal_name") ?? "",
    accountType: pickString(record, "accountType") ?? "",
    raw: record,
  });
}

function normalizeBrexCardAccount(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const currentBalance = optionalRecord(record.current_balance);
  const availableBalance = optionalRecord(record.available_balance);
  const accountLimit = optionalRecord(record.account_limit);
  const statementPeriod = optionalRecord(record.current_statement_period);
  return compactBrexOutput({
    id: pickString(record, "id") ?? "",
    status: nullableStringField(record, "status"),
    currentBalanceAmount: pickInteger(currentBalance, "amount"),
    currentBalanceCurrency: nullableStringField(currentBalance, "currency"),
    availableBalanceAmount: pickInteger(availableBalance, "amount"),
    availableBalanceCurrency: nullableStringField(availableBalance, "currency"),
    accountLimitAmount: pickInteger(accountLimit, "amount"),
    accountLimitCurrency: nullableStringField(accountLimit, "currency"),
    statementStartDate: nullableStringField(statementPeriod, "start_date"),
    statementEndDate: nullableStringField(statementPeriod, "end_date"),
    raw: record,
  });
}

function normalizeBrexTransaction(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const amount = optionalRecord(record.amount);
  const merchant = optionalRecord(record.merchant);
  return compactBrexOutput({
    id: pickString(record, "id") ?? "",
    description: pickString(record, "description") ?? "",
    amount: pickInteger(amount, "amount"),
    currency: nullableStringField(amount, "currency"),
    initiatedAtDate: pickString(record, "initiated_at_date") ?? "",
    postedAtDate: pickString(record, "posted_at_date") ?? "",
    type: nullableStringField(record, "type"),
    cardId: nullableStringField(record, "card_id"),
    expenseId: nullableStringField(record, "expense_id"),
    merchantDescriptor: nullableStringField(merchant, "raw_descriptor"),
    raw: record,
  });
}

function normalizeBrexExpense(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const billingAmount = optionalRecord(record.billing_amount);
  const originalAmount = optionalRecord(record.original_amount);
  const purchasedAmount = optionalRecord(record.purchased_amount);
  const merchant = optionalRecord(record.merchant);
  return compactBrexOutput({
    id: pickString(record, "id") ?? "",
    memo: nullableStringField(record, "memo"),
    status: nullableStringField(record, "status"),
    paymentStatus: nullableStringField(record, "payment_status"),
    category: nullableStringField(record, "category"),
    userId: nullableStringField(record, "user_id"),
    budgetId: nullableStringField(record, "budget_id"),
    merchantDescriptor: nullableStringField(merchant, "raw_descriptor"),
    purchasedAt: nullableStringField(record, "purchased_at"),
    updatedAt: nullableStringField(record, "updated_at"),
    billingAmount: pickInteger(billingAmount, "amount"),
    billingCurrency: nullableStringField(billingAmount, "currency"),
    originalAmount: pickInteger(originalAmount, "amount"),
    originalCurrency: nullableStringField(originalAmount, "currency"),
    purchasedAmount: pickInteger(purchasedAmount, "amount"),
    purchasedCurrency: nullableStringField(purchasedAmount, "currency"),
    raw: record,
  });
}

function normalizeBrexBudget(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const amount = optionalRecord(record.amount);
  return compactBrexOutput({
    id: pickString(record, "budget_id") ?? "",
    accountId: pickString(record, "account_id") ?? "",
    name: pickString(record, "name") ?? "",
    description: nullableStringField(record, "description"),
    parentBudgetId: nullableStringField(record, "parent_budget_id"),
    ownerUserIds: pickStringArray(record.owner_user_ids),
    periodRecurrenceType: pickString(record, "period_recurrence_type") ?? "",
    startDate: nullableStringField(record, "start_date"),
    endDate: nullableStringField(record, "end_date"),
    amount: pickInteger(amount, "amount"),
    currency: nullableStringField(amount, "currency"),
    status: pickString(record, "spend_budget_status") ?? "",
    limitType: nullableStringField(record, "limit_type"),
    raw: record,
  });
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function pickString(record: Record<string, unknown> | undefined, fieldName: string): string | undefined {
  const value = record?.[fieldName];
  return typeof value === "string" ? value : undefined;
}

function nullableStringField(record: Record<string, unknown> | undefined, fieldName: string): string | null {
  if (!record || record[fieldName] == null) {
    return null;
  }
  return typeof record[fieldName] === "string" ? record[fieldName] : String(record[fieldName]);
}

function pickInteger(record: Record<string, unknown> | undefined, fieldName: string): number | null {
  const value = record?.[fieldName];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function buildUserName(user: Record<string, unknown>): string | undefined {
  const firstName = pickString(user, "first_name");
  const lastName = pickString(user, "last_name");
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return combined || undefined;
}

function compactBrexOutput<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined && child !== null)) as T;
}
