import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "atlas_so";

const nonEmptyString = (description: string): JsonSchema => s.string(description, { minLength: 1 });
const nullableObject = (description: string): JsonSchema => s.nullable(s.looseObject(description));

const paginationInputSchema = s.object(
  "Pagination parameters for Atlas list endpoints.",
  {
    cursor: s.nonNegativeInteger("The Atlas pagination cursor. Atlas defaults this to 0."),
    limit: s.positiveInteger("The maximum number of records to return. Atlas defaults this to 20."),
  },
  { optional: ["cursor", "limit"] },
);

const accountWriteFields = {
  name: s.nullableString("The account name."),
  email: s.nullable(s.email("The account email address.")),
  website: s.nullableString("The account website."),
  externalId: s.nullableString("The external account identifier."),
  customFields: nullableObject("Custom account fields keyed by Atlas custom field name."),
  primaryContactId: s.nullable(s.uuid("The primary contact customer ID for the account.")),
  accountManagerId: s.nullable(s.uuid("The account manager user ID.")),
  secondaryAccountManagerId: s.nullable(s.uuid("The secondary account manager user ID.")),
};
const accountWriteOptionalFields = [
  "name",
  "email",
  "website",
  "externalId",
  "customFields",
  "primaryContactId",
  "accountManagerId",
  "secondaryAccountManagerId",
] as const;
const accountWriteSchema = s.object(
  "Atlas account fields accepted by the account upsert endpoint.",
  accountWriteFields,
  {
    optional: accountWriteOptionalFields,
  },
);

const defaultSendersSchema = s.object(
  "Default sender values for an Atlas customer.",
  {
    sms: s.nullableString("The default SMS sender value."),
    email: s.nullableString("The default email sender value."),
  },
  { optional: ["sms", "email"] },
);

const customerWriteFields = {
  firstName: s.nullableString("The customer's first name."),
  lastName: s.nullableString("The customer's last name."),
  email: s.nullable(s.email("The customer's email address.")),
  phoneNumber: s.nullableString("The customer's phone number."),
  externalUserId: s.nullableString("The external user identifier."),
  customFields: nullableObject("Custom customer fields keyed by Atlas custom field name."),
  defaultSenders: s.nullable(defaultSendersSchema),
};
const customerWriteOptionalFields = [
  "firstName",
  "lastName",
  "email",
  "phoneNumber",
  "externalUserId",
  "customFields",
  "defaultSenders",
] as const;
const customerWriteSchema = s.object(
  "Atlas customer fields accepted by create and update endpoints.",
  customerWriteFields,
  { optional: customerWriteOptionalFields },
);

const customerUpsertSchema = s.object(
  "Atlas customer fields accepted by the customer upsert endpoint.",
  {
    id: s.nullable(s.uuid("The Atlas customer ID.")),
    userId: s.nullableString("The external user identifier used by Atlas upsert."),
    firstName: s.nullableString("The customer's first name."),
    lastName: s.nullableString("The customer's last name."),
    email: s.nullable(s.email("The customer's email address.")),
    phoneNumber: s.nullableString("The customer's phone number."),
    customFields: nullableObject("Custom customer fields keyed by Atlas custom field name."),
    account: nullableObject("The account payload to associate with this customer."),
    alternatePhoneNumbers: s.nullable(
      s.array("Alternate phone numbers for this customer.", nonEmptyString("An alternate phone number.")),
    ),
    alternateEmails: s.nullable(
      s.array("Alternate email addresses for this customer.", s.email("An alternate email.")),
    ),
  },
  {
    optional: [
      "id",
      "userId",
      "firstName",
      "lastName",
      "email",
      "phoneNumber",
      "customFields",
      "account",
      "alternatePhoneNumbers",
      "alternateEmails",
    ],
  },
);

const customerLookupProperties = {
  id: s.nullable(s.uuid("The Atlas customer ID.")),
  email: s.nullable(s.email("The customer's email address.")),
  phoneNumber: s.nullableString("The customer's phone number."),
  userId: s.nullableString("The external user identifier."),
};
const customerLookupSchema = {
  ...s.object("Lookup keys for retrieving an Atlas customer.", customerLookupProperties, {
    optional: ["id", "email", "phoneNumber", "userId"],
  }),
  anyOf: [{ required: ["id"] }, { required: ["email"] }, { required: ["phoneNumber"] }, { required: ["userId"] }],
} satisfies JsonSchema;

const listSessionsInputSchema = s.object(
  "Filters and pagination parameters for listing Atlas session recordings.",
  {
    cursor: s.nonNegativeInteger("The Atlas pagination cursor. Atlas defaults this to 0."),
    limit: s.positiveInteger("The maximum number of records to return. Atlas defaults this to 20."),
    externalId: s.uuid("The Atlas external session recording ID filter."),
    email: s.email("The customer email address filter."),
    pageUrl: nonEmptyString("The page URL filter."),
    startedBefore: s.dateTime("Return sessions that started before this timestamp."),
    startedAfter: s.dateTime("Return sessions that started after this timestamp."),
  },
  { optional: ["cursor", "limit", "externalId", "email", "pageUrl", "startedBefore", "startedAfter"] },
);

const accountSchema = s.looseObject("An Atlas account resource.", {
  id: s.uuid("The Atlas account ID."),
  name: s.nullableString("The account name."),
  email: s.nullableString("The account email address."),
  website: s.nullableString("The account website."),
  externalId: s.nullableString("The external account identifier."),
  customFields: nullableObject("Custom account fields returned by Atlas."),
});
const customerSchema = s.looseObject("An Atlas customer resource.", {
  id: s.uuid("The Atlas customer ID."),
  companyId: s.nullable(s.uuid("The associated Atlas account ID.")),
  firstName: s.nullableString("The customer's first name."),
  lastName: s.nullableString("The customer's last name."),
  email: s.nullable(s.email("The customer's email address.")),
  phoneNumber: s.nullableString("The customer's phone number."),
  externalUserId: s.nullableString("The external user identifier."),
  customFields: nullableObject("Custom customer fields returned by Atlas."),
  createdAt: s.dateTime("The timestamp when the customer was created."),
  defaultSenders: s.nullable(defaultSendersSchema),
});
const sessionSchema = s.looseObject("An Atlas session recording resource.", {
  id: s.uuid("The Atlas session recording ID."),
  customerId: s.uuid("The Atlas customer ID associated with this session."),
  startTime: s.dateTime("The timestamp when the session started."),
  lastActivity: s.dateTime("The timestamp of the last recorded session activity."),
  info: nullableObject("Atlas session recording metadata."),
});

const listMetadataSchema = {
  total: s.nullableInteger("The total number of available records when Atlas returns it."),
  cursor: s.nullableInteger("The cursor returned by Atlas for the current page."),
  limit: s.nullableInteger("The page size returned by Atlas."),
  raw: s.looseObject("Raw Atlas list response payload."),
};

export const atlasSoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    operationType: "read",
    description: "List Atlas accounts visible to the current API key.",
    inputSchema: paginationInputSchema,
    outputSchema: s.object("Atlas account list response.", {
      accounts: s.array("The Atlas accounts returned by the API.", accountSchema),
      ...listMetadataSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Retrieve a single Atlas account by ID.",
    inputSchema: s.object(
      "The input payload for retrieving an Atlas account.",
      { id: s.uuid("The Atlas account ID.") },
      { required: ["id"] },
    ),
    outputSchema: s.object("Atlas account retrieve response.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_account",
    operationType: "write",
    description: "Create or update an Atlas account using the account upsert endpoint.",
    inputSchema: accountWriteSchema,
    outputSchema: s.object("Atlas account upsert response.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Atlas customers visible to the current API key.",
    inputSchema: paginationInputSchema,
    outputSchema: s.object("Atlas customer list response.", {
      customers: s.array("The Atlas customers returned by the API.", customerSchema),
      ...listMetadataSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve a single Atlas customer by ID.",
    inputSchema: s.object(
      "The input payload for retrieving an Atlas customer.",
      { id: s.uuid("The Atlas customer ID.") },
      { required: ["id"] },
    ),
    outputSchema: s.object("Atlas customer retrieve response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_customer",
    operationType: "read",
    description: "Retrieve a single Atlas customer by ID, email, phone number, or user ID.",
    inputSchema: customerLookupSchema,
    outputSchema: s.object("Atlas customer lookup response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    operationType: "write",
    description: "Create an Atlas customer.",
    inputSchema: customerWriteSchema,
    outputSchema: s.object("Atlas customer create response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_customer",
    operationType: "write",
    description: "Update an Atlas customer by ID.",
    inputSchema: s.object(
      "The input payload for updating an Atlas customer.",
      {
        id: s.uuid("The Atlas customer ID."),
        ...customerWriteFields,
      },
      {
        required: ["id"],
      },
    ),
    outputSchema: s.object("Atlas customer update response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_customer",
    operationType: "write",
    description: "Create or update an Atlas customer using the customer upsert endpoint.",
    inputSchema: customerUpsertSchema,
    outputSchema: s.object("Atlas customer upsert response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_sessions",
    operationType: "read",
    description: "List Atlas session recordings with optional customer and date filters.",
    inputSchema: listSessionsInputSchema,
    outputSchema: s.object("Atlas session recording list response.", {
      sessions: s.array("The Atlas session recordings returned by the API.", sessionSchema),
      ...listMetadataSchema,
    }),
  }),
];
