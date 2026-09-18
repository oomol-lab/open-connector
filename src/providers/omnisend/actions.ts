import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "omnisend";

const contactStatusSchema = s.stringEnum(["subscribed", "unsubscribed", "nonSubscribed"], {
  description: "Contact subscription status filter.",
});
const sortDirectionSchema = s.stringEnum(["asc", "desc"], { description: "Sort direction accepted by Omnisend." });
const contactSortSchema = s.stringEnum(["createdAt", "updatedAt"], {
  description: "Contact sort field accepted by Omnisend.",
});
const segmentSortSchema = s.stringEnum(["createdAt", "name"], {
  description: "Segment sort field accepted by Omnisend.",
});
const genderSchema = s.stringEnum(["m", "f"], { description: "Contact gender accepted by Omnisend." });
const identifierTypeSchema = s.stringEnum(["email", "phone"], {
  description: "Contact identifier type accepted by Omnisend.",
});

const cursorFields = {
  after: s.nonEmptyString("Opaque cursor for fetching the next page."),
  before: s.nonEmptyString("Opaque cursor for fetching the previous page."),
};

const pagingOutputSchema = s.looseObject("Cursor-based pagination metadata returned by Omnisend.", {
  hasMore: s.boolean("Whether more results are available beyond the current page."),
  cursors: s.looseObject("Cursor values for navigating between pages.", {
    after: s.nullable(s.string("Opaque cursor for fetching the next page.")),
    before: s.nullable(s.string("Opaque cursor for fetching the previous page.")),
  }),
});

const contactOutputSchema = s.looseObject("Contact resource returned by Omnisend.");
const segmentOutputSchema = s.looseObject("Segment resource returned by Omnisend.");

const consentSchema = s.object(
  {
    createdAt: s.dateTime("Consent collection timestamp in RFC3339 format. Defaults to current time if not provided."),
    ip: s.nonEmptyString("IP address at time of consent."),
    source: s.nonEmptyString("Source of consent."),
    userAgent: s.nonEmptyString("User agent at time of consent."),
  },
  { required: [], description: "Consent record for a contact channel." },
);

const channelSchema = s.object(
  {
    status: contactStatusSchema,
    statusChangedAt: s.dateTime("Timestamp when the channel status last changed."),
  },
  { required: ["status"], description: "Channel subscription details accepted by Omnisend." },
);

const contactIdentifierSchema = s.object(
  {
    id: s.nonEmptyString(
      "Identifier value. For email, provide an email address. For phone, provide an E.164 phone number.",
    ),
    type: identifierTypeSchema,
    channels: s.record("Communication channels keyed by channel name.", channelSchema),
    consent: consentSchema,
    sendWelcomeMessage: s.boolean(
      "Whether to send a welcome message for this identifier when the workflow is enabled.",
    ),
    source: s.nonEmptyString("Source of the identifier."),
  },
  {
    required: ["id", "type"],
    description: "A unique Omnisend contact identifier.",
  },
);

const contactBodyProperties = {
  address: s.nonEmptyString("Street, house number, apartment number."),
  birthdate: s.date("Contact birthdate in YYYY-MM-DD format."),
  city: s.nonEmptyString("Contact city."),
  country: s.nonEmptyString("Country name. Used to derive ISO country code when countryCode is not provided."),
  countryCode: s.string({ description: "ISO 3166-1 alpha-2 country code.", minLength: 2, maxLength: 2 }),
  createdAt: s.dateTime('Contact creation timestamp. Omnisend stores it as the "externalCreated" custom property.'),
  customProperties: s.looseObject("Custom contact properties defined for the brand."),
  firstName: s.nonEmptyString("Contact first name."),
  gender: genderSchema,
  identifiers: s.array("Contact identifiers, such as email or phone.", contactIdentifierSchema, { minItems: 1 }),
  lastName: s.nonEmptyString("Contact last name."),
  postalCode: s.nonEmptyString("Postal or zip code."),
  state: s.nonEmptyString("State or region."),
  tags: s.array("Labels assigned to the contact.", s.nonEmptyString("Tag name."), { maxItems: 100 }),
};

const contactBodyFieldNames = [
  "address",
  "birthdate",
  "city",
  "country",
  "countryCode",
  "createdAt",
  "customProperties",
  "firstName",
  "gender",
  "identifiers",
  "lastName",
  "postalCode",
  "state",
  "tags",
];

const listContactsInputSchema = {
  ...s.object(
    {
      limit: s.integer("Number of contacts per page. Range: 1-250.", { minimum: 1, maximum: 250 }),
      ...cursorFields,
      sort: contactSortSchema,
      direction: sortDirectionSchema,
      email: s.email("Filter by email address."),
      phone: s.nonEmptyString("Filter by phone number."),
      status: contactStatusSchema,
      segmentID: s.nonEmptyString("Filter by segment ID."),
      tag: s.nonEmptyString("Filter by tag. Cannot be combined with status."),
      updatedAtFrom: s.dateTime("Filter contacts updated at or after this RFC3339 timestamp."),
    },
    {
      required: [],
      description: "Query parameters for listing Omnisend contacts.",
    },
  ),
  not: {
    anyOf: [
      { required: ["after", "before"] },
      { required: ["tag", "status"] },
      { required: ["updatedAtFrom", "email"] },
      { required: ["updatedAtFrom", "phone"] },
      { required: ["updatedAtFrom", "status"] },
      { required: ["updatedAtFrom", "segmentID"] },
      { required: ["updatedAtFrom", "tag"] },
    ],
  },
} satisfies JsonSchema;

const getContactInputSchema = s.object(
  {
    contactID: s.nonEmptyString("Omnisend contact ID."),
  },
  { required: ["contactID"], description: "Path parameters for fetching an Omnisend contact." },
);

const upsertContactInputSchema = s.object(contactBodyProperties, {
  required: ["identifiers"],
  description: "Contact payload for creating or updating an Omnisend contact.",
});

function updateContactSchema(description: string, identityField: "contactID" | "email"): JsonSchema {
  return {
    ...s.object(
      {
        [identityField]:
          identityField === "email"
            ? s.email("Contact email address used to select the Omnisend contact.")
            : s.nonEmptyString("Omnisend contact ID."),
        ...contactBodyProperties,
      },
      { required: [identityField], description },
    ),
    anyOf: contactBodyFieldNames.map((field) => ({ required: [field] })),
  };
}

const tagBatchInputSchema = s.object(
  {
    contactIDs: s.array("Omnisend contact IDs.", s.nonEmptyString("Omnisend contact ID."), {
      minItems: 1,
      maxItems: 250,
    }),
    tags: s.array("Tags to add or remove.", s.nonEmptyString("Tag name."), {
      minItems: 1,
      maxItems: 100,
    }),
  },
  { required: ["contactIDs", "tags"], description: "Contact IDs and tags for a batch tag operation." },
);

const listSegmentsInputSchema = {
  ...s.object(
    {
      limit: s.integer("Number of segments per page. Range: 1-50.", { minimum: 1, maximum: 50 }),
      ...cursorFields,
      sort: segmentSortSchema,
      direction: sortDirectionSchema,
    },
    { required: [], description: "Query parameters for listing Omnisend segments." },
  ),
  not: {
    anyOf: [{ required: ["after", "before"] }],
  },
} satisfies JsonSchema;

const getSegmentInputSchema = s.object(
  {
    segmentID: s.string({
      description: "Omnisend segment ID. Omnisend documents segment IDs as 24-character hexadecimal strings.",
      minLength: 24,
      maxLength: 24,
    }),
  },
  { required: ["segmentID"], description: "Path parameters for fetching an Omnisend segment." },
);

const listContactsOutputSchema = s.object(
  {
    contacts: s.array("Contact resources returned by Omnisend.", contactOutputSchema),
    paging: pagingOutputSchema,
  },
  { required: ["contacts", "paging"], description: "Paginated contacts response returned by Omnisend." },
);

const tagOperationOutputSchema = s.object(
  {
    success: s.boolean("Whether Omnisend accepted the tag operation."),
  },
  { required: ["success"], description: "Result of an Omnisend batch tag operation." },
);

const listSegmentsOutputSchema = s.object(
  {
    segments: s.array("Segment resources returned by Omnisend.", segmentOutputSchema),
    paging: pagingOutputSchema,
  },
  { required: ["segments", "paging"], description: "Paginated segments response returned by Omnisend." },
);

export const omnisendActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Omnisend contacts with documented filters and cursor pagination.",
    requiredScopes: ["contacts.read"],
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Fetch a single Omnisend contact by ID.",
    requiredScopes: ["contacts.read"],
    inputSchema: getContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_contact",
    operationType: "write",
    description: "Create a new Omnisend contact or update an existing contact matched by email.",
    requiredScopes: ["contacts.write"],
    inputSchema: upsertContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact_by_id",
    operationType: "write",
    description: "Update an existing Omnisend contact selected by contact ID.",
    requiredScopes: ["contacts.write"],
    inputSchema: updateContactSchema("Contact payload for updating an Omnisend contact by ID.", "contactID"),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact_by_email",
    operationType: "write",
    description: "Update an existing Omnisend contact selected by email address.",
    requiredScopes: ["contacts.write"],
    inputSchema: updateContactSchema("Contact payload for updating an Omnisend contact by email.", "email"),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_tags",
    operationType: "write",
    description: "Add tags to multiple Omnisend contacts in a batch.",
    requiredScopes: ["contacts.write"],
    inputSchema: tagBatchInputSchema,
    outputSchema: tagOperationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_tags",
    operationType: "destructive",
    description: "Remove tags from multiple Omnisend contacts in a batch.",
    requiredScopes: ["contacts.write"],
    inputSchema: tagBatchInputSchema,
    outputSchema: tagOperationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_segments",
    operationType: "read",
    description: "List Omnisend segments with sorting and cursor pagination.",
    requiredScopes: ["segments.read"],
    inputSchema: listSegmentsInputSchema,
    outputSchema: listSegmentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_segment",
    operationType: "read",
    description: "Fetch a single Omnisend segment by ID.",
    requiredScopes: ["segments.read"],
    inputSchema: getSegmentInputSchema,
    outputSchema: segmentOutputSchema,
  }),
];
