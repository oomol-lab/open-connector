import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const printavoApiBaseUrl = "https://www.printavo.com/api/v2";

export interface PrintavoActionContext {
  token: string;
  email: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type PrintavoRequestPhase = "validate" | "execute";
type PrintavoActionHandler = (input: Record<string, unknown>, context: PrintavoActionContext) => Promise<unknown>;

const identifyQuery = `
query PrintavoIdentify {
  user {
    id
    name
    email
    phone
    timeZone
    account {
      id
      companyName
      companyEmail
      phone
      website
      locale
      logoUrl
    }
  }
}`;

const accountQuery = `
query PrintavoAccount {
  account {
    id
    companyName
    companyEmail
    phone
    website
    locale
    logoUrl
  }
}`;

const pageInfoSelection = `
pageInfo {
  hasNextPage
  hasPreviousPage
  startCursor
  endCursor
}`;

const contactSelection = `
id
firstName
lastName
fullName
email
phone
fax
orderCount
customer {
  id
  companyName
  publicUrl
}`;

const contactsQuery = `
query PrintavoContacts(
  $first: Int
  $last: Int
  $after: String
  $before: String
  $query: String
  $primaryOnly: Boolean
) {
  contacts(
    first: $first
    last: $last
    after: $after
    before: $before
    query: $query
    primaryOnly: $primaryOnly
  ) {
    ${pageInfoSelection}
    totalNodes
    totalAmount
    nodes {
      ${contactSelection}
    }
  }
}`;

const customersQuery = `
query PrintavoCustomers($first: Int, $last: Int, $after: String, $before: String) {
  customers(first: $first, last: $last, after: $after, before: $before) {
    ${pageInfoSelection}
    totalNodes
    totalAmount
    nodes {
      id
      companyName
      publicUrl
      orderCount
      taxExempt
      salesTax
      primaryContact {
        id
        fullName
        email
      }
    }
  }
}`;

const tasksQuery = `
query PrintavoTasks(
  $first: Int
  $last: Int
  $after: String
  $before: String
  $assigneeId: ID
  $completed: Boolean
  $dueAfter: ISO8601DateTime
  $dueBefore: ISO8601DateTime
) {
  tasks(
    first: $first
    last: $last
    after: $after
    before: $before
    assigneeId: $assigneeId
    completed: $completed
    dueAfter: $dueAfter
    dueBefore: $dueBefore
  ) {
    ${pageInfoSelection}
    totalNodes
    totalAmount
    nodes {
      id
      name
      completed
      dueAt
      completedAt
      sourcePresetTaskGroupTitle
      assignedTo {
        id
        name
        email
        phone
        timeZone
      }
    }
  }
}`;

const orderSelection = `
id
visualId
nickname
total
subtotal
amountPaid
amountOutstanding
paidInFull
customerDueAt
dueAt
startAt
publicUrl
url
tags
contact {
  id
  fullName
  email
}
status {
  id
  name
  type
  color
}`;

const ordersQuery = `
query PrintavoOrders(
  $first: Int
  $last: Int
  $after: String
  $before: String
  $query: String
  $statusIds: [ID!]
  $excludeStatusIds: [ID!]
  $tags: [String!]
  $inProductionAfter: ISO8601DateTime
  $inProductionBefore: ISO8601DateTime
) {
  orders(
    first: $first
    last: $last
    after: $after
    before: $before
    query: $query
    statusIds: $statusIds
    excludeStatusIds: $excludeStatusIds
    tags: $tags
    inProductionAfter: $inProductionAfter
    inProductionBefore: $inProductionBefore
  ) {
    ${pageInfoSelection}
    nodes {
      __typename
      ... on Invoice {
        ${orderSelection}
      }
      ... on Quote {
        ${orderSelection}
      }
    }
  }
}`;

export const printavoActionHandlers: ProviderActionHandlers<"printavo", PrintavoActionHandler> = {
  identify(_input, context) {
    return executeIdentify(context);
  },
  get_account(_input, context) {
    return executeGetAccount(context);
  },
  list_contacts(input, context) {
    return executeListContacts(input, context);
  },
  list_customers(input, context) {
    return executeListCustomers(input, context);
  },
  list_tasks(input, context) {
    return executeListTasks(input, context);
  },
  list_orders(input, context) {
    return executeListOrders(input, context);
  },
};

export async function validatePrintavoCredential(
  input: Pick<PrintavoActionContext, "token" | "email" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  const output = await executeIdentify(input, "validate");
  const accountName = optionalRawString(output.account.companyName);
  const userName = optionalRawString(output.user.name);
  const userEmail = optionalRawString(output.user.email);
  const userId = readProviderString(output.user.id, "user.id");

  return {
    profile: {
      accountId: userId,
      displayName: accountName ?? userName ?? userEmail ?? "Printavo API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: printavoApiBaseUrl,
      validationQuery: "user",
      email: input.email,
      userId,
      userEmail,
      accountId: output.account.id,
      accountName,
    }),
  };
}

async function executeIdentify(
  context: Pick<PrintavoActionContext, "token" | "email" | "fetcher" | "signal">,
  phase: PrintavoRequestPhase = "execute",
): Promise<{ user: Record<string, unknown>; account: Record<string, unknown> }> {
  const data = await printavoGraphql(identifyQuery, {}, context, phase);
  const user = requireDataObject(data, "user");
  const account = requireDataObject(user, "account");
  return {
    user: normalizeUser(user),
    account: normalizeAccount(account),
  };
}

async function executeGetAccount(context: PrintavoActionContext): Promise<Record<string, unknown>> {
  const data = await printavoGraphql(accountQuery, {}, context, "execute");
  return { account: normalizeAccount(requireDataObject(data, "account")) };
}

async function executeListContacts(
  input: Record<string, unknown>,
  context: PrintavoActionContext,
): Promise<Record<string, unknown>> {
  const connection = await executeConnectionQuery(
    contactsQuery,
    {
      ...paginationVariables(input),
      query: optionalRawString(input.query),
      primaryOnly: optionalBoolean(input.primaryOnly),
    },
    "contacts",
    context,
  );
  return {
    ...connectionSummary(connection),
    contacts: connectionNodes(connection).map(normalizeContact),
  };
}

async function executeListCustomers(
  input: Record<string, unknown>,
  context: PrintavoActionContext,
): Promise<Record<string, unknown>> {
  const connection = await executeConnectionQuery(customersQuery, paginationVariables(input), "customers", context);
  return {
    ...connectionSummary(connection),
    customers: connectionNodes(connection).map(normalizeCustomer),
  };
}

async function executeListTasks(
  input: Record<string, unknown>,
  context: PrintavoActionContext,
): Promise<Record<string, unknown>> {
  const connection = await executeConnectionQuery(
    tasksQuery,
    {
      ...paginationVariables(input),
      assigneeId: optionalRawString(input.assigneeId),
      completed: optionalBoolean(input.completed),
      dueAfter: optionalRawString(input.dueAfter),
      dueBefore: optionalRawString(input.dueBefore),
    },
    "tasks",
    context,
  );
  return {
    ...connectionSummary(connection),
    tasks: connectionNodes(connection).map(normalizeTask),
  };
}

async function executeListOrders(
  input: Record<string, unknown>,
  context: PrintavoActionContext,
): Promise<Record<string, unknown>> {
  const connection = await executeConnectionQuery(
    ordersQuery,
    {
      ...paginationVariables(input),
      query: optionalRawString(input.query),
      statusIds: readStringArray(input.statusIds),
      excludeStatusIds: readStringArray(input.excludeStatusIds),
      tags: readStringArray(input.tags),
      inProductionAfter: optionalRawString(input.inProductionAfter),
      inProductionBefore: optionalRawString(input.inProductionBefore),
    },
    "orders",
    context,
  );
  return {
    pageInfo: normalizePageInfo(connection.pageInfo),
    orders: connectionNodes(connection).map(normalizeOrder),
  };
}

async function executeConnectionQuery(
  query: string,
  variables: Record<string, unknown>,
  dataField: string,
  context: PrintavoActionContext,
): Promise<Record<string, unknown>> {
  const data = await printavoGraphql(query, variables, context, "execute");
  return requireDataObject(data, dataField);
}

async function printavoGraphql(
  query: string,
  variables: Record<string, unknown>,
  context: Pick<PrintavoActionContext, "token" | "email" | "fetcher" | "signal">,
  phase: PrintavoRequestPhase,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(printavoApiBaseUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        email: context.email,
        token: context.token,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
      body: JSON.stringify({ query, variables: compactObject(variables) }),
    });
    const payload = await readPrintavoPayload(response);
    if (!response.ok) {
      throw createPrintavoError(response.status, payload, phase);
    }

    const body = optionalRecord(payload);
    if (!body) {
      throw new ProviderRequestError(502, "Printavo returned an invalid GraphQL response");
    }
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      throw createPrintavoGraphqlError(body.errors, phase);
    }
    const data = optionalRecord(body.data);
    if (!data) {
      throw new ProviderRequestError(502, "Printavo GraphQL response is missing data");
    }
    return data;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Printavo request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Printavo request failed: ${error.message}` : "Printavo request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPrintavoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPrintavoError(status: number, payload: unknown, phase: PrintavoRequestPhase): ProviderRequestError {
  const message = extractPrintavoErrorMessage(payload) ?? `Printavo request failed with status ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function createPrintavoGraphqlError(errors: unknown[], phase: PrintavoRequestPhase): ProviderRequestError {
  const message =
    errors.map(extractGraphqlErrorMessage).filter(Boolean).join("; ") || "Printavo GraphQL request failed";
  return new ProviderRequestError(phase === "validate" ? 400 : 502, message);
}

function extractPrintavoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() === "" ? undefined : payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalRawString(record.error)?.trim() ??
    optionalRawString(record.message)?.trim() ??
    extractGraphqlErrorMessage(Array.isArray(record.errors) ? record.errors[0] : undefined)
  );
}

function extractGraphqlErrorMessage(error: unknown): string | undefined {
  return optionalString(optionalRecord(error)?.message);
}

function paginationVariables(input: Record<string, unknown>): Record<string, unknown> {
  if (input.first != null && input.last != null) {
    throw new ProviderRequestError(400, "first and last cannot be used together");
  }
  return {
    first: input.first,
    last: input.last,
    after: optionalRawString(input.after),
    before: optionalRawString(input.before),
  };
}

function connectionSummary(connection: Record<string, unknown>): Record<string, unknown> {
  return {
    pageInfo: normalizePageInfo(connection.pageInfo),
    totalNodes: typeof connection.totalNodes === "number" ? connection.totalNodes : null,
    totalAmount: optionalNumber(connection.totalAmount) ?? null,
  };
}

function normalizePageInfo(value: unknown): Record<string, unknown> {
  const pageInfo = optionalRecord(value);
  if (!pageInfo) {
    throw new ProviderRequestError(502, "Printavo response is missing pageInfo");
  }
  return {
    hasNextPage: readProviderBoolean(pageInfo.hasNextPage, "pageInfo.hasNextPage"),
    hasPreviousPage: readProviderBoolean(pageInfo.hasPreviousPage, "pageInfo.hasPreviousPage"),
    startCursor: optionalRawString(pageInfo.startCursor) ?? null,
    endCursor: optionalRawString(pageInfo.endCursor) ?? null,
  };
}

function connectionNodes(connection: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(connection.nodes)
    ? connection.nodes.map(optionalRecord).filter((item): item is Record<string, unknown> => item !== undefined)
    : [];
}

function normalizeUser(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readProviderString(value.id, "user.id"),
    name: optionalRawString(value.name) ?? null,
    email: optionalRawString(value.email) ?? null,
    phone: optionalRawString(value.phone) ?? null,
    timeZone: optionalRawString(value.timeZone) ?? null,
    raw: value,
  };
}

function normalizeAccount(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readProviderString(value.id, "account.id"),
    companyName: optionalRawString(value.companyName) ?? null,
    companyEmail: optionalRawString(value.companyEmail) ?? null,
    phone: optionalRawString(value.phone) ?? null,
    website: optionalRawString(value.website) ?? null,
    locale: optionalRawString(value.locale) ?? null,
    logoUrl: optionalRawString(value.logoUrl) ?? null,
    raw: value,
  };
}

function normalizeContact(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readProviderString(value.id, "contact.id"),
    firstName: optionalRawString(value.firstName) ?? null,
    lastName: optionalRawString(value.lastName) ?? null,
    fullName: optionalRawString(value.fullName) ?? null,
    email: optionalRawString(value.email) ?? null,
    phone: optionalRawString(value.phone) ?? null,
    fax: optionalRawString(value.fax) ?? null,
    orderCount: typeof value.orderCount === "number" ? value.orderCount : null,
    customer: normalizeOptionalCustomerReference(value.customer),
    raw: value,
  };
}

function normalizeCustomer(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readProviderString(value.id, "customer.id"),
    companyName: optionalRawString(value.companyName) ?? null,
    publicUrl: optionalRawString(value.publicUrl) ?? null,
    orderCount: typeof value.orderCount === "number" ? value.orderCount : null,
    taxExempt: optionalBoolean(value.taxExempt) ?? null,
    salesTax: optionalNumber(value.salesTax) ?? null,
    primaryContact: normalizeOptionalContactReference(value.primaryContact),
    raw: value,
  };
}

function normalizeTask(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readProviderString(value.id, "task.id"),
    name: readProviderString(value.name, "task.name"),
    completed: readProviderBoolean(value.completed, "task.completed"),
    dueAt: optionalRawString(value.dueAt) ?? null,
    completedAt: optionalRawString(value.completedAt) ?? null,
    sourcePresetTaskGroupTitle: optionalRawString(value.sourcePresetTaskGroupTitle) ?? null,
    assignedTo: normalizeOptionalUser(value.assignedTo),
    raw: value,
  };
}

function normalizeOrder(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readProviderString(value.id, "order.id"),
    type: readProviderString(value.__typename, "order.__typename"),
    visualId: optionalRawString(value.visualId) ?? null,
    nickname: optionalRawString(value.nickname) ?? null,
    total: optionalNumber(value.total) ?? null,
    subtotal: optionalNumber(value.subtotal) ?? null,
    amountPaid: optionalNumber(value.amountPaid) ?? null,
    amountOutstanding: optionalNumber(value.amountOutstanding) ?? null,
    paidInFull: optionalBoolean(value.paidInFull) ?? null,
    customerDueAt: optionalRawString(value.customerDueAt) ?? null,
    dueAt: optionalRawString(value.dueAt) ?? null,
    startAt: optionalRawString(value.startAt) ?? null,
    publicUrl: optionalRawString(value.publicUrl) ?? null,
    url: optionalRawString(value.url) ?? null,
    tags: readStringArray(value.tags) ?? [],
    contact: normalizeOptionalContactReference(value.contact),
    status: normalizeOptionalStatus(value.status),
    raw: value,
  };
}

function normalizeOptionalUser(value: unknown): Record<string, unknown> | null {
  const user = optionalRecord(value);
  return user ? normalizeUser(user) : null;
}

function normalizeOptionalContactReference(value: unknown): Record<string, unknown> | null {
  const contact = optionalRecord(value);
  return contact
    ? {
        id: readProviderString(contact.id, "contact.id"),
        fullName: optionalRawString(contact.fullName) ?? null,
        email: optionalRawString(contact.email) ?? null,
      }
    : null;
}

function normalizeOptionalCustomerReference(value: unknown): Record<string, unknown> | null {
  const customer = optionalRecord(value);
  return customer
    ? {
        id: readProviderString(customer.id, "customer.id"),
        companyName: optionalRawString(customer.companyName) ?? null,
        publicUrl: optionalRawString(customer.publicUrl) ?? null,
      }
    : null;
}

function normalizeOptionalStatus(value: unknown): Record<string, unknown> | null {
  const status = optionalRecord(value);
  return status
    ? {
        id: readProviderString(status.id, "status.id"),
        name: optionalRawString(status.name) ?? null,
        type: optionalRawString(status.type) ?? null,
        color: optionalRawString(status.color) ?? null,
      }
    : null;
}

function requireDataObject(data: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = optionalRecord(data[field]);
  if (!value) {
    throw new ProviderRequestError(502, `Printavo GraphQL response is missing ${field}`);
  }
  return value;
}

function readProviderString(value: unknown, field: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `Printavo response is missing ${field}`);
  }
  return text;
}

function readProviderBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Printavo response is missing ${field}`);
  }
  return value;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}
