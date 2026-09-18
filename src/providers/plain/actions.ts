import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "plain";
const readPermission = ["customer:read"];
const writePermission = ["customer:create", "customer:edit"];

const customerSchema = s.actionOutput({
  id: s.nonEmptyString("The Plain customer ID."),
  externalId: s.nullableString("Your own external identifier stored on the customer."),
  fullName: s.nonEmptyString("The customer's full name."),
  shortName: s.nullableString("The customer's optional short name."),
  email: s.email("The customer's primary email address."),
  emailVerified: s.boolean("Whether the customer's primary email address is verified."),
  avatarUrl: s.nullableString("The customer's avatar URL when Plain has one."),
  createdAt: s.dateTime("The customer's creation timestamp."),
  updatedAt: s.dateTime("The customer's update timestamp."),
});

const pageInfoSchema = s.actionOutput({
  hasNextPage: s.boolean("Whether another page exists after this one."),
  hasPreviousPage: s.boolean("Whether a previous page exists before this one."),
  startCursor: s.nullableString("The start cursor for the current page."),
  endCursor: s.nullableString("The end cursor for the current page."),
});

const customerIdentifierSchema = s.object(
  "The Plain customer identifier to use for exact lookup or mutation matching. Provide exactly one of emailAddress, externalId, or customerId.",
  {
    emailAddress: s.email("The customer's email address in Plain."),
    externalId: s.nonEmptyString("Your own stable external identifier for the customer."),
    customerId: s.nonEmptyString("The Plain customer ID."),
  },
);

const onCreateSchema = s.actionInput(
  {
    fullName: s.nonEmptyString("The customer's full name."),
    email: s.email("The customer's primary email address."),
    emailVerified: s.boolean("Whether Plain should mark the email address as verified."),
    externalId: s.nonEmptyString("Your own stable external identifier for the customer."),
    shortName: s.nonEmptyString("The customer's optional short name."),
  },
  ["fullName", "email"],
);

const onUpdateSchema = s.actionInput({
  fullName: s.nonEmptyString("The customer's new full name."),
  shortName: s.nonEmptyString("The customer's new short name."),
  externalId: s.nonEmptyString("The customer's new external identifier."),
  email: s.email("The customer's replacement email address."),
  emailVerified: s.boolean("Whether Plain should mark the replacement email as verified."),
});

export const plainActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_customer_by_email",
    operationType: "read",
    description: "Fetch one Plain customer by exact email address.",
    providerPermissions: readPermission,
    inputSchema: s.actionInput({ email: s.email("The exact customer email address to look up in Plain.") }, ["email"]),
    outputSchema: s.actionOutput({ customer: customerSchema }),
  }),
  defineProviderAction(service, {
    name: "get_customer_by_external_id",
    operationType: "read",
    description: "Fetch one Plain customer by exact external ID.",
    providerPermissions: readPermission,
    inputSchema: s.actionInput({ externalId: s.nonEmptyString("The exact external ID to look up in Plain.") }, [
      "externalId",
    ]),
    outputSchema: s.actionOutput({ customer: customerSchema }),
  }),
  defineProviderAction(service, {
    name: "search_customers",
    operationType: "read",
    description:
      "Search Plain customers with one human-oriented term across full name, short name, email, and external ID.",
    providerPermissions: readPermission,
    inputSchema: s.actionInput(
      {
        term: s.nonEmptyString("The human search term to match against Plain customers."),
        first: s.positiveInteger("The number of customers to return from the first page."),
        after: s.nonEmptyString("The cursor to continue after when fetching the next page."),
      },
      ["term"],
    ),
    outputSchema: s.actionOutput({
      customers: s.array("The matching Plain customers.", customerSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_customer",
    operationType: "write",
    description: "Create or update one Plain customer using exactly one identifier plus create and update payloads.",
    providerPermissions: writePermission,
    inputSchema: s.actionInput(
      {
        identifier: customerIdentifierSchema,
        onCreate: onCreateSchema,
        onUpdate: onUpdateSchema,
      },
      ["identifier", "onCreate", "onUpdate"],
    ),
    outputSchema: s.actionOutput({
      result: s.stringEnum("Whether Plain created, updated, or left the customer unchanged.", [
        "CREATED",
        "UPDATED",
        "NOOP",
      ]),
      customer: customerSchema,
    }),
  }),
];
