import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kustomer";

const trimmedNonEmptyString = (description: string, options: { maxLength?: number } = {}) =>
  s.string({ minLength: 1, description, ...options });

const nullableTrimmedString = (description: string, options: { maxLength?: number } = {}) =>
  s.nullable(s.string({ description, ...options }));

const includeSchema = trimmedNonEmptyString(
  "Comma-separated includes. Kustomer documents company as the supported include for customer lookup endpoints.",
);

const customerResourceSchema = s.looseObject(
  "A raw Kustomer JSON:API customer resource object, including type, id, attributes, relationships, and links when returned.",
);
const includedResourceSchema = s.looseObject(
  "A raw Kustomer JSON:API included resource object, such as an included company.",
);
const metaSchema = s.looseObject("Kustomer response metadata such as pagination totals.");
const linksSchema = s.looseObject("Kustomer JSON:API links returned with the response.");
const includedSchema = s.array(
  "Kustomer JSON:API included resources returned when include parameters are used.",
  includedResourceSchema,
);

const singleCustomerOutputSchema = s.object(
  "A Kustomer response containing one customer resource.",
  {
    data: s.anyOf("The Kustomer customer resource or resources returned by the endpoint.", [
      customerResourceSchema,
      s.array("The Kustomer customer resources returned by a multi-ID lookup.", customerResourceSchema),
    ]),
    meta: metaSchema,
    links: linksSchema,
    included: includedSchema,
  },
  { optional: ["meta", "links", "included"] },
);

const customerListOutputSchema = s.object(
  "A Kustomer response containing a page of customer resources.",
  {
    data: s.array("The Kustomer customer resources returned on this page.", customerResourceSchema),
    meta: metaSchema,
    links: linksSchema,
    included: includedSchema,
  },
  { optional: ["meta", "links", "included"] },
);

const customerSearchOutputSchema = s.object(
  "A Kustomer response containing customer search results.",
  {
    data: s.array(
      "The Kustomer customer resources returned on this page, or customer IDs when idsOnly is true.",
      s.anyOf("One Kustomer customer search result.", [
        customerResourceSchema,
        s.string("Customer ID returned when idsOnly is true.", { minLength: 1 }),
      ]),
    ),
    meta: metaSchema,
    links: linksSchema,
    included: includedSchema,
  },
  { optional: ["meta", "links", "included"] },
);

const dateRangeSchema = (description: string) =>
  s.object(
    description,
    {
      gt: s.dateTime("Return customers with a timestamp greater than this ISO 8601 value."),
      gte: s.dateTime("Return customers with a timestamp greater than or equal to this ISO 8601 value."),
      lt: s.dateTime("Return customers with a timestamp less than this ISO 8601 value."),
      lte: s.dateTime("Return customers with a timestamp less than or equal to this ISO 8601 value."),
    },
    { optional: ["gt", "gte", "lt", "lte"] },
  );

const customerFilterSchema = s.object(
  "Kustomer customer list filters for createdAt and updatedAt timestamp ranges.",
  {
    createdAt: dateRangeSchema("Filter customers by creation timestamp."),
    updatedAt: dateRangeSchema("Filter customers by last update timestamp."),
  },
  { optional: ["createdAt", "updatedAt"] },
);

const listCustomersInputSchema = s.object(
  "Pagination, sorting, and timestamp filters for listing Kustomer customers.",
  {
    filter: customerFilterSchema,
    sort: s.stringEnum("Sort customers by createdAt or updatedAt, with '-' for descending order.", [
      "createdAt",
      "-createdAt",
      "updatedAt",
      "-updatedAt",
    ]),
    page: s.positiveInteger("Page number of customer results to return."),
    pageSize: s.positiveInteger("Number of customer results to return per page."),
  },
  { optional: ["filter", "sort", "page", "pageSize"] },
);

const getCustomerInputSchema = s.object(
  "Parameters for retrieving a Kustomer customer by ID.",
  {
    id: trimmedNonEmptyString("Kustomer customer ID. A comma-separated list can retrieve multiple customers."),
    include: includeSchema,
  },
  { optional: ["include"] },
);

const getCustomerByEmailInputSchema = s.object(
  "Parameters for retrieving a Kustomer customer by email address.",
  {
    email: trimmedNonEmptyString("Customer email address."),
    include: includeSchema,
  },
  { optional: ["include"] },
);

const getCustomerByExternalIdInputSchema = s.object(
  "Parameters for retrieving a Kustomer customer by external ID.",
  {
    externalId: trimmedNonEmptyString("External customer ID from another system."),
    include: includeSchema,
  },
  { optional: ["include"] },
);

const getCustomerByPhoneInputSchema = s.object(
  "Parameters for retrieving a Kustomer customer by phone number.",
  {
    phone: trimmedNonEmptyString("Customer phone number."),
    include: includeSchema,
  },
  { optional: ["include"] },
);

const customerEmailSchema = s.object(
  "A Kustomer customer email contact object.",
  {
    email: s.email("Customer email address."),
    type: s.stringEnum("The email label.", ["home", "work", "other"]),
    verified: s.boolean("Whether this email address is verified."),
  },
  { optional: ["type", "verified"] },
);

const customerPhoneSchema = s.object(
  "A Kustomer customer phone contact object.",
  {
    phone: trimmedNonEmptyString("Customer phone number."),
    type: s.stringEnum("The phone label.", ["mobile", "home", "work", "fax", "other"]),
    verified: s.boolean("Whether this phone number is verified."),
  },
  { optional: ["type", "verified"] },
);

const customerWhatsappSchema = s.object(
  "A Kustomer customer WhatsApp contact object.",
  {
    phone: trimmedNonEmptyString("Customer WhatsApp phone number."),
    type: s.stringEnum("The WhatsApp label.", ["mobile"]),
    verified: s.boolean("Whether this WhatsApp number is verified."),
  },
  { optional: ["type", "verified"] },
);

const customerExternalIdSchema = s.object(
  "A Kustomer external ID object.",
  {
    externalId: trimmedNonEmptyString("External customer ID from another system."),
    verified: s.boolean("Whether this external ID is verified."),
  },
  { optional: ["verified"] },
);

const customerFacebookIdSchema = s.object(
  "A Kustomer customer Facebook identity object.",
  {
    pageId: trimmedNonEmptyString("Facebook page ID.", { maxLength: 255 }),
    userId: trimmedNonEmptyString("Facebook user ID.", { maxLength: 255 }),
    name: trimmedNonEmptyString("Facebook user display name.", { maxLength: 255 }),
  },
  { optional: ["name"] },
);

const customerInstagramIdSchema = s.object(
  "A Kustomer customer Instagram identity object.",
  {
    pageId: trimmedNonEmptyString("Instagram page ID.", { maxLength: 255 }),
    threadId: trimmedNonEmptyString("Instagram thread ID.", { maxLength: 255 }),
    username: trimmedNonEmptyString("Instagram username.", { maxLength: 255 }),
    instagramId: trimmedNonEmptyString("Instagram user ID.", { maxLength: 255 }),
  },
  { optional: ["instagramId"] },
);

const customerUrlSchema = s.object(
  "A Kustomer customer URL object.",
  {
    url: s.url("Customer URL."),
    type: s.stringEnum("The URL label.", ["website", "blog", "other"]),
  },
  { optional: ["type"] },
);

const customerLocationSchema = s.object(
  "A Kustomer customer location object.",
  {
    type: s.nullable(s.stringEnum("The location label.", ["home", "work", "other"])),
    name: nullableTrimmedString("Location display name."),
    address: nullableTrimmedString("Location street address.", { maxLength: 256 }),
    address2: nullableTrimmedString("Additional location street address.", { maxLength: 256 }),
    address3: nullableTrimmedString("Additional location street address.", { maxLength: 256 }),
    latitude: s.nullable(s.number("Location latitude.")),
    longitude: s.nullable(s.number("Location longitude.")),
    countryCode: s.nullable(s.string({ description: "Two-letter country code.", minLength: 2, maxLength: 2 })),
    countryName: nullableTrimmedString("Country name.", { maxLength: 64 }),
    regionCode: nullableTrimmedString("Region code.", { maxLength: 2 }),
    regionName: nullableTrimmedString("Region name.", { maxLength: 128 }),
    cityName: nullableTrimmedString("City name.", { maxLength: 128 }),
    zipCode: nullableTrimmedString("Postal code.", { maxLength: 30 }),
    areaCode: nullableTrimmedString("Area code.", { maxLength: 30 }),
  },
  {
    optional: [
      "type",
      "name",
      "address",
      "address2",
      "address3",
      "latitude",
      "longitude",
      "countryCode",
      "countryName",
      "regionCode",
      "regionName",
      "cityName",
      "zipCode",
      "areaCode",
    ],
  },
);

const customerSocialSchema = s.object(
  "A Kustomer customer social identity object.",
  {
    type: s.stringEnum("The social network type.", ["twitter", "facebook", "instagram", "linkedin", "pinterest"]),
    username: trimmedNonEmptyString("Customer social username."),
    userid: trimmedNonEmptyString("Customer social user ID."),
    url: s.url("Customer social profile URL."),
    verified: s.boolean("Whether this social identity is verified."),
  },
  { optional: ["userid", "url", "verified"] },
);

const customerSentimentSchema = s.object("Kustomer customer sentiment score.", {
  polarity: s.anyOf("Sentiment polarity.", [
    s.literal(-1, { description: "Negative sentiment." }),
    s.literal(0, { description: "Neutral sentiment." }),
    s.literal(1, { description: "Positive sentiment." }),
  ]),
  confidence: s.number("Sentiment confidence score between -1 and 1.", {
    minimum: -1,
    maximum: 1,
  }),
});

const customerPayloadSchema = s.object(
  "Kustomer customer attributes accepted by create and update customer endpoints.",
  {
    name: s.nullable(trimmedNonEmptyString("Customer display name.")),
    company: s.nullable(trimmedNonEmptyString("Kustomer company ID to link to this customer.")),
    externalId: s.nullable(trimmedNonEmptyString("Primary external customer ID.")),
    username: s.nullable(trimmedNonEmptyString("Customer username.")),
    signedUpAt: s.nullable(s.dateTime("Timestamp when the customer signed up.")),
    lastActivityAt: s.nullable(s.dateTime("Timestamp of the customer's last activity.")),
    lastCustomerActivityAt: s.nullable(s.dateTime("Timestamp of the customer's last tracked customer activity.")),
    lastSeenAt: s.nullable(s.dateTime("Timestamp when the customer was last seen.")),
    avatarUrl: s.nullable(s.url("Customer avatar URL.")),
    externalIds: s.array("External IDs to attach to this customer.", customerExternalIdSchema, { maxItems: 10 }),
    sharedExternalIds: s.array("Shared external IDs to attach to this customer.", customerExternalIdSchema, {
      maxItems: 10,
    }),
    emails: s.array("Email addresses to attach to this customer.", customerEmailSchema, { maxItems: 10 }),
    sharedEmails: s.array("Shared email addresses to attach to this customer.", customerEmailSchema, {
      maxItems: 10,
    }),
    phones: s.array("Phone numbers to attach to this customer.", customerPhoneSchema, { maxItems: 10 }),
    sharedPhones: s.array("Shared phone numbers to attach to this customer.", customerPhoneSchema, { maxItems: 10 }),
    whatsapps: s.array("WhatsApp numbers to attach to this customer.", customerWhatsappSchema, { maxItems: 10 }),
    facebookIds: s.array("Facebook identities to attach to this customer.", customerFacebookIdSchema, {
      maxItems: 10,
    }),
    instagramIds: s.array("Instagram identities to attach to this customer.", customerInstagramIdSchema, {
      maxItems: 10,
    }),
    socials: s.array("Social identities to attach to this customer.", customerSocialSchema, { maxItems: 10 }),
    sharedSocials: s.array("Shared social identities to attach to this customer.", customerSocialSchema, {
      maxItems: 10,
    }),
    urls: s.array("URLs to attach to this customer.", customerUrlSchema, { maxItems: 10 }),
    locations: s.array("Locations to attach to this customer.", customerLocationSchema, { maxItems: 10 }),
    locale: s.nullable(trimmedNonEmptyString("Customer locale, such as en_US.")),
    timeZone: s.nullable(trimmedNonEmptyString("Customer time zone, such as America/New_York.")),
    tags: s.array("Kustomer tag IDs or names to attach to this customer.", trimmedNonEmptyString("Tag ID or name."), {
      maxItems: 20,
    }),
    sentiment: customerSentimentSchema,
    custom: s.looseObject("Kustomer custom attributes keyed by custom attribute name."),
    birthdayAt: s.nullable(s.dateTime("Customer birthday timestamp.")),
    gender: s.nullable(s.stringEnum("Customer gender.", ["m", "f"])),
    createdAt: s.dateTime("Timestamp when the customer was created."),
    importedAt: s.dateTime("Timestamp when the customer was imported."),
    rev: s.number("Kustomer customer revision number."),
    defaultLang: s.nullable(trimmedNonEmptyString("Customer default language code.")),
  },
  {
    optional: [
      "name",
      "company",
      "externalId",
      "username",
      "signedUpAt",
      "lastActivityAt",
      "lastCustomerActivityAt",
      "lastSeenAt",
      "avatarUrl",
      "externalIds",
      "sharedExternalIds",
      "emails",
      "sharedEmails",
      "phones",
      "sharedPhones",
      "whatsapps",
      "facebookIds",
      "instagramIds",
      "socials",
      "sharedSocials",
      "urls",
      "locations",
      "locale",
      "timeZone",
      "tags",
      "sentiment",
      "custom",
      "birthdayAt",
      "gender",
      "createdAt",
      "importedAt",
      "rev",
      "defaultLang",
    ],
  },
);

const createCustomerInputSchema = s.object("Parameters for creating a Kustomer customer.", {
  customer: customerPayloadSchema,
});

const updateCustomerInputSchema = s.object(
  "Parameters for updating a Kustomer customer.",
  {
    id: trimmedNonEmptyString("Kustomer customer ID."),
    replace: s.boolean("If true, replace the full resource instead of applying merge semantics."),
    customer: customerPayloadSchema,
  },
  { optional: ["replace"] },
);

const searchCustomersInputSchema = s.object(
  "Parameters for searching Kustomer customers.",
  {
    query: s.looseObject("Kustomer customer search criteria JSON body."),
    page: s.positiveInteger("Page number of search results to return."),
    pageSize: s.positiveInteger("Number of search results to return per page."),
    idsOnly: s.boolean("Return only matching customer IDs."),
    id: trimmedNonEmptyString("Saved search ID used to execute a stored query before searching."),
    withIntelliAggs: s.boolean("Include intelligent aggregation data in search results."),
    trackTotalHits: s.boolean("Track an exact total hit count for the search request."),
  },
  { optional: ["page", "pageSize", "idsOnly", "id", "withIntelliAggs", "trackTotalHits"] },
);

export const kustomerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Kustomer customers with pagination, sorting, and createdAt or updatedAt timestamp filters.",
    requiredScopes: [],
    inputSchema: listCustomersInputSchema,
    outputSchema: customerListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve one Kustomer customer by customer ID.",
    requiredScopes: [],
    inputSchema: getCustomerInputSchema,
    outputSchema: singleCustomerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_customer_by_email",
    description: "Retrieve one Kustomer customer by email address.",
    requiredScopes: [],
    inputSchema: getCustomerByEmailInputSchema,
    outputSchema: singleCustomerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_customer_by_external_id",
    description: "Retrieve one Kustomer customer by external ID.",
    requiredScopes: [],
    inputSchema: getCustomerByExternalIdInputSchema,
    outputSchema: singleCustomerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_customer_by_phone",
    description: "Retrieve one Kustomer customer by phone number.",
    requiredScopes: [],
    inputSchema: getCustomerByPhoneInputSchema,
    outputSchema: singleCustomerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_customers",
    description: "Search Kustomer customers with Kustomer's JSON search criteria DSL.",
    requiredScopes: [],
    inputSchema: searchCustomersInputSchema,
    outputSchema: customerSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a Kustomer customer with common identity, contact, tag, and custom attribute fields.",
    requiredScopes: [],
    inputSchema: createCustomerInputSchema,
    outputSchema: singleCustomerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_customer",
    description: "Update a Kustomer customer with common identity, contact, tag, and custom attribute fields.",
    requiredScopes: [],
    inputSchema: updateCustomerInputSchema,
    outputSchema: singleCustomerOutputSchema,
  }),
];
