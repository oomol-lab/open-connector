import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "printavo";

const rawObjectSchema = s.looseObject("The raw Printavo object selected by the connector query.");

const paginationProperties = {
  first: s.positiveInteger("Return the first n records from the connection."),
  last: s.positiveInteger("Return the last n records from the connection."),
  after: s.nonEmptyString("Return records after this cursor."),
  before: s.nonEmptyString("Return records before this cursor."),
};

const pageInfoSchema = s.requiredObject("Printavo cursor pagination metadata.", {
  hasNextPage: s.boolean("Whether another page exists after the returned page."),
  hasPreviousPage: s.boolean("Whether another page exists before the returned page."),
  startCursor: s.nullableString("The cursor for the first returned edge."),
  endCursor: s.nullableString("The cursor for the last returned edge."),
});

const userSchema = s.requiredObject("A Printavo user selected by the connector.", {
  id: s.string("The Printavo user ID."),
  name: s.nullableString("The user's display name."),
  email: s.nullableString("The user's email address."),
  phone: s.nullableString("The user's phone number."),
  timeZone: s.nullableString("The user's timezone."),
  raw: rawObjectSchema,
});

const accountSchema = s.requiredObject("A Printavo account selected by the connector.", {
  id: s.string("The Printavo account ID."),
  companyName: s.nullableString("The account company name."),
  companyEmail: s.nullableString("The account company email address."),
  phone: s.nullableString("The account phone number."),
  website: s.nullableString("The account website."),
  locale: s.nullableString("The account locale."),
  logoUrl: s.nullableString("The account logo URL."),
  raw: rawObjectSchema,
});

const contactReferenceSchema = s.requiredObject("A Printavo contact reference.", {
  id: s.string("The Printavo contact ID."),
  fullName: s.nullableString("The contact full name."),
  email: s.nullableString("The contact email address."),
});

const customerReferenceSchema = s.requiredObject("A Printavo customer reference.", {
  id: s.string("The Printavo customer ID."),
  companyName: s.nullableString("The customer company name."),
  publicUrl: s.nullableString("The customer public URL."),
});

const contactSchema = s.requiredObject("A Printavo contact selected by the connector.", {
  id: s.string("The Printavo contact ID."),
  firstName: s.nullableString("The contact first name."),
  lastName: s.nullableString("The contact last name."),
  fullName: s.nullableString("The contact full name."),
  email: s.nullableString("The contact email address."),
  phone: s.nullableString("The contact phone number."),
  fax: s.nullableString("The contact fax number."),
  orderCount: s.nullableInteger("The number of orders associated with the contact."),
  customer: s.nullable(customerReferenceSchema),
  raw: rawObjectSchema,
});

const customerSchema = s.requiredObject("A Printavo customer selected by the connector.", {
  id: s.string("The Printavo customer ID."),
  companyName: s.nullableString("The customer company name."),
  publicUrl: s.nullableString("The customer public URL."),
  orderCount: s.nullableInteger("The number of orders associated with the customer."),
  taxExempt: s.nullableBoolean("Whether the customer is tax exempt."),
  salesTax: s.nullableNumber("The customer sales tax value."),
  primaryContact: s.nullable(contactReferenceSchema),
  raw: rawObjectSchema,
});

const taskSchema = s.requiredObject("A Printavo task selected by the connector.", {
  id: s.string("The Printavo task ID."),
  name: s.string("The task name."),
  completed: s.boolean("Whether the task is complete."),
  dueAt: s.nullableString("The task due datetime."),
  completedAt: s.nullableString("The task completion datetime."),
  sourcePresetTaskGroupTitle: s.nullableString("The title of the preset task group that created the task."),
  assignedTo: s.nullable(userSchema),
  raw: rawObjectSchema,
});

const statusSchema = s.requiredObject("A Printavo order status selected by the connector.", {
  id: s.string("The Printavo status ID."),
  name: s.nullableString("The status name."),
  type: s.nullableString("The status type."),
  color: s.nullableString("The status color."),
});

const orderSchema = s.requiredObject("A Printavo quote or invoice selected by the connector.", {
  id: s.string("The Printavo order ID."),
  type: s.string("The GraphQL type name, such as Invoice or Quote."),
  visualId: s.nullableString("The visible quote or invoice number."),
  nickname: s.nullableString("The order nickname."),
  total: s.nullableNumber("The order total."),
  subtotal: s.nullableNumber("The order subtotal."),
  amountPaid: s.nullableNumber("The amount paid on the order."),
  amountOutstanding: s.nullableNumber("The outstanding amount on the order."),
  paidInFull: s.nullableBoolean("Whether the order is paid in full."),
  customerDueAt: s.nullableString("The customer due date."),
  dueAt: s.nullableString("The production due datetime."),
  startAt: s.nullableString("The production start datetime."),
  publicUrl: s.nullableString("The public order URL."),
  url: s.nullableString("The internal order URL."),
  tags: s.array("Tags attached to the order.", s.string("One Printavo order tag.")),
  contact: s.nullable(contactReferenceSchema),
  status: s.nullable(statusSchema),
  raw: rawObjectSchema,
});

const connectionSummaryProperties = {
  pageInfo: pageInfoSchema,
  totalNodes: s.nullableInteger("The total number of nodes when Printavo returns it."),
  totalAmount: s.nullableNumber("The total dollar amount when Printavo returns it."),
};

export const printavoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "identify",
    operationType: "read",
    description: "Identify the current Printavo API token, user, and account.",
    inputSchema: s.actionInput({}, [], "No input is required to identify a Printavo API token."),
    outputSchema: s.actionOutput(
      { user: userSchema, account: accountSchema },
      "The Printavo identity tied to the connected API token.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Get the Printavo account for the current API token.",
    inputSchema: s.actionInput({}, [], "No input is required to get the current Printavo account."),
    outputSchema: s.actionOutput({ account: accountSchema }, "The current Printavo account."),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Printavo contacts with optional search and cursor pagination.",
    inputSchema: s.actionInput(
      {
        ...paginationProperties,
        query: s.nonEmptyString("Search contacts by Printavo query string."),
        primaryOnly: s.boolean("Whether to return only primary contacts."),
      },
      [],
      "Input for listing Printavo contacts.",
    ),
    outputSchema: s.actionOutput(
      {
        ...connectionSummaryProperties,
        contacts: s.array("Printavo contacts returned by the query.", contactSchema),
      },
      "Printavo contacts returned by the query.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Printavo customers with cursor pagination.",
    inputSchema: s.actionInput(paginationProperties, [], "Cursor pagination parameters for Printavo customers."),
    outputSchema: s.actionOutput(
      {
        ...connectionSummaryProperties,
        customers: s.array("Printavo customers returned by the query.", customerSchema),
      },
      "Printavo customers returned by the query.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    operationType: "read",
    description: "List Printavo tasks with optional assignment, completion, due date, and pagination filters.",
    inputSchema: s.actionInput(
      {
        ...paginationProperties,
        assigneeId: s.nonEmptyString("Only return tasks assigned to this Printavo user ID."),
        completed: s.boolean("Whether to return completed or incomplete tasks."),
        dueAfter: s.dateTime("Only return tasks due after this ISO 8601 datetime."),
        dueBefore: s.dateTime("Only return tasks due before this ISO 8601 datetime."),
      },
      [],
      "Input for listing Printavo tasks.",
    ),
    outputSchema: s.actionOutput(
      {
        ...connectionSummaryProperties,
        tasks: s.array("Printavo tasks returned by the query.", taskSchema),
      },
      "Printavo tasks returned by the query.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description:
      "List Printavo quotes and invoices with optional search, status, tag, production date, and pagination filters.",
    inputSchema: s.actionInput(
      {
        ...paginationProperties,
        query: s.nonEmptyString("Search orders by Printavo query string."),
        statusIds: s.stringArray("Only include orders in these Printavo status IDs.", {
          minItems: 1,
          itemDescription: "One Printavo status ID.",
        }),
        excludeStatusIds: s.stringArray("Exclude orders in these Printavo status IDs.", {
          minItems: 1,
          itemDescription: "One Printavo status ID.",
        }),
        tags: s.stringArray("Only include orders with one of these tags.", {
          minItems: 1,
          itemDescription: "One tag.",
        }),
        inProductionAfter: s.dateTime("Only return orders in production after this datetime."),
        inProductionBefore: s.dateTime("Only return orders in production before this datetime."),
      },
      [],
      "Input for listing Printavo quotes and invoices.",
    ),
    outputSchema: s.actionOutput(
      {
        pageInfo: pageInfoSchema,
        orders: s.array("Printavo quotes and invoices returned by the query.", orderSchema),
      },
      "Printavo quotes and invoices returned by the query.",
    ),
  }),
];
