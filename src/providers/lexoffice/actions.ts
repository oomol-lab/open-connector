import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lexoffice";

export type LexofficeActionName =
  | "get_profile"
  | "list_contacts"
  | "get_contact"
  | "create_contact"
  | "update_contact"
  | "list_articles"
  | "get_article"
  | "create_article"
  | "update_article"
  | "list_voucherlist";

const uuid = (description: string): JsonSchema => s.uuid(description);
const optionalUuid = (description: string): JsonSchema => s.uuid(description);
const page = s.nonNegativeInteger("The 0-based page number to retrieve.");
const pageSize = s.integer({
  minimum: 1,
  maximum: 250,
  description: "The page size to request. Lexoffice allows up to 250.",
});
const date = s.string({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "The date value in YYYY-MM-DD format.",
});
const articleType = s.stringEnum(["PRODUCT", "SERVICE"], {
  description: "The Lexoffice article type.",
});
const leadingPrice = s.stringEnum(["NET", "GROSS"], {
  description: "The leading article price type.",
});

const emptyRole = s.object({}, { description: "An empty role object expected by Lexoffice." });
const stringList = s.array(s.nonEmptyString("One string value."), {
  description: "A list of string values.",
});

const address = s.object(
  "A Lexoffice address payload used for billing or shipping addresses.",
  {
    supplement: s.string("Additional address information."),
    street: s.string("Street and street number."),
    zip: s.string("ZIP or postal code."),
    city: s.string("City name."),
    countryCode: s.string({
      minLength: 2,
      maxLength: 2,
      description: "The ISO 3166 alpha-2 country code.",
    }),
  },
  { optional: ["supplement", "street", "zip", "city"] },
);

const companyContactPerson = s.object(
  "A Lexoffice company contact person object.",
  {
    salutation: s.string("The salutation of the contact person."),
    firstName: s.string("The first name of the contact person."),
    lastName: s.nonEmptyString("The last name of the contact person."),
    primary: s.boolean("Whether the contact person is the primary contact."),
    emailAddress: s.string("The email address of the contact person."),
    phoneNumber: s.string("The phone number of the contact person."),
  },
  { optional: ["salutation", "firstName", "primary", "emailAddress", "phoneNumber"] },
);

const company = s.object(
  "The Lexoffice company object used for company contacts.",
  {
    allowTaxFreeInvoices: s.boolean("Whether tax-free invoices are allowed for this company."),
    name: s.nonEmptyString("The company name."),
    taxNumber: s.string("The tax number of the company."),
    vatRegistrationId: s.string("The VAT registration ID of the company."),
    contactPersons: s.array(companyContactPerson, {
      description: "The contact persons attached to the company.",
    }),
  },
  { optional: ["allowTaxFreeInvoices", "taxNumber", "vatRegistrationId", "contactPersons"] },
);

const person = s.object(
  "The Lexoffice person object used for private-person contacts.",
  {
    salutation: s.string("The salutation of the person."),
    firstName: s.string("The first name of the person."),
    lastName: s.nonEmptyString("The last name of the person."),
  },
  { optional: ["salutation", "firstName"] },
);

const addresses = s.object(
  "The address collections attached to the contact.",
  {
    billing: s.array(address, { description: "The billing addresses." }),
    shipping: s.array(address, { description: "The shipping addresses." }),
  },
  { optional: ["billing", "shipping"] },
);

const xRechnung = s.object(
  "The XRechnung attributes attached to the contact.",
  {
    buyerReference: s.string("The Leitweg-ID of the customer."),
    vendorNumberAtCustomer: s.string("Your vendor number as used by the customer."),
  },
  { optional: ["buyerReference", "vendorNumberAtCustomer"] },
);

const categorizedStringLists = s.object(
  "The categorized contact values grouped by Lexoffice field name.",
  {
    business: stringList,
    office: stringList,
    private: stringList,
    other: stringList,
  },
  { optional: ["business", "office", "private", "other"] },
);

const phoneNumberLists = s.object(
  "The categorized phone numbers grouped by Lexoffice field name.",
  {
    business: stringList,
    office: stringList,
    mobile: stringList,
    private: stringList,
    fax: stringList,
    other: stringList,
  },
  { optional: ["business", "office", "mobile", "private", "fax", "other"] },
);

const contactRoles = s.object(
  "The Lexoffice roles object. Each present key activates the corresponding role.",
  {
    customer: s.object(
      { number: s.integer("The generated customer number.") },
      { description: "The customer role details returned by Lexoffice." },
    ),
    vendor: s.object(
      { number: s.integer("The generated vendor number.") },
      { description: "The vendor role details returned by Lexoffice." },
    ),
  },
  { optional: ["customer", "vendor"] },
);

const contactRolesInput = s.object(
  "The Lexoffice role payload used when creating or updating a contact.",
  {
    customer: emptyRole,
    vendor: emptyRole,
  },
  { optional: ["customer", "vendor"] },
);

const contact = s.object(
  "A Lexoffice contact object.",
  {
    id: uuid("The Lexoffice contact identifier."),
    organizationId: uuid("The Lexoffice organization identifier."),
    version: s.integer("The contact version used for optimistic locking."),
    roles: contactRoles,
    company,
    person,
    addresses,
    xRechnung,
    emailAddresses: categorizedStringLists,
    phoneNumbers: phoneNumberLists,
    note: s.string("The optional contact note."),
    archived: s.boolean("Whether the contact is archived."),
  },
  {
    optional: ["company", "person", "addresses", "xRechnung", "emailAddresses", "phoneNumbers", "note", "archived"],
  },
);

const contactMutation: JsonSchema = {
  ...s.object(
    "The Lexoffice contact payload used for creating or updating a contact.",
    {
      version: s.nonNegativeInteger("The optimistic-locking version. Use 0 for POST and the latest value for PUT."),
      roles: contactRolesInput,
      company,
      person,
      addresses,
      xRechnung,
      emailAddresses: categorizedStringLists,
      phoneNumbers: phoneNumberLists,
      note: s.string({
        maxLength: 1000,
        description: "The optional contact note with a maximum length of 1000 characters.",
      }),
    },
    {
      optional: ["company", "person", "addresses", "xRechnung", "emailAddresses", "phoneNumbers", "note"],
    },
  ),
  oneOf: [
    { required: ["company"], not: { required: ["person"] } },
    { required: ["person"], not: { required: ["company"] } },
  ],
};

const price: JsonSchema = {
  ...s.object(
    "The Lexoffice article price object.",
    {
      netPrice: s.number("The net price of the article."),
      grossPrice: s.number("The gross price of the article."),
      leadingPrice,
      taxRate: s.number("The article tax rate accepted by Lexoffice."),
    },
    { optional: ["netPrice", "grossPrice"] },
  ),
  allOf: [
    { if: { properties: { leadingPrice: { const: "NET" } } }, then: { required: ["netPrice"] } },
    { if: { properties: { leadingPrice: { const: "GROSS" } } }, then: { required: ["grossPrice"] } },
  ],
};

const article = s.object(
  "A Lexoffice article object.",
  {
    id: uuid("The Lexoffice article identifier."),
    title: s.nonEmptyString("The title of the article."),
    description: s.string("The article description."),
    type: articleType,
    articleNumber: s.string("The article number."),
    gtin: s.string("The Global Trade Item Number of the article."),
    note: s.string("The internal article note."),
    unitName: s.nonEmptyString("The unit name of the article."),
    price,
    version: s.integer("The article version used for optimistic locking."),
  },
  { optional: ["description", "articleNumber", "gtin", "note"] },
);

const articleMutation = s.object(
  "The Lexoffice article payload used for creating or updating an article.",
  {
    title: s.nonEmptyString("The title of the article."),
    description: s.string("The article description."),
    type: articleType,
    articleNumber: s.string("The article number."),
    gtin: s.string("The Global Trade Item Number of the article."),
    note: s.string("The internal article note."),
    unitName: s.nonEmptyString("The unit name of the article."),
    price,
    version: s.nonNegativeInteger("The article version used for optimistic locking."),
  },
  { optional: ["description", "articleNumber", "gtin", "note", "version"] },
);

const actionResult = s.object("The Lexoffice action result envelope.", {
  id: uuid("The Lexoffice resource identifier."),
  resourceUri: s.nonEmptyString("The canonical Lexoffice resource URI."),
  createdDate: s.dateTime("The RFC 3339 timestamp returned by Lexoffice."),
  updatedDate: s.dateTime("The RFC 3339 timestamp returned by Lexoffice."),
  version: s.nonNegativeInteger("The latest version returned by Lexoffice."),
});

const sortItem = s.object("One Lexoffice page sort item.", {
  property: s.nonEmptyString("The property used for sorting."),
  direction: s.nonEmptyString("The sort direction returned by Lexoffice."),
  ignoreCase: s.boolean("Whether the sort ignores case."),
  nullHandling: s.nonEmptyString("The null-handling strategy."),
  ascending: s.boolean("Whether the sort order is ascending."),
});

const pageShape = (description: string, contentDescription: string, item: JsonSchema): JsonSchema =>
  s.object(description, {
    content: s.array(item, { description: contentDescription }),
    totalPages: s.nonNegativeInteger("The total number of available pages."),
    totalElements: s.nonNegativeInteger("The total number of matching records."),
    last: s.boolean("Whether this is the last page."),
    sort: s.array(sortItem, { description: "The sort specification returned by Lexoffice." }),
    size: s.nonNegativeInteger("The page size returned by Lexoffice."),
    number: s.nonNegativeInteger("The current 0-based page index."),
    first: s.boolean("Whether this is the first page."),
    numberOfElements: s.nonNegativeInteger("The number of elements in the current page."),
  });

const profile = s.object(
  "The Lexoffice profile object returned by GET /v1/profile.",
  {
    organizationId: uuid("The Lexoffice organization identifier."),
    companyName: s.nonEmptyString("The organization name registered at Lexoffice."),
    created: s.object("The metadata about the established Lexoffice connection.", {
      userId: uuid("The Lexoffice user identifier."),
      userName: s.nonEmptyString("The Lexoffice user who created the connection."),
      userEmail: s.nonEmptyString("The email address of the Lexoffice user."),
      date: s.dateTime("The RFC 3339 timestamp returned by Lexoffice."),
    }),
    connectionId: uuid("The Lexoffice connection identifier."),
    features: s.stringArray("The product features returned by Lexoffice."),
    businessFeatures: s.stringArray("The business features returned by Lexoffice."),
    subscriptionStatus: s.string("The subscription status returned by Lexoffice."),
    taxType: s.string("The configured tax type of the organization."),
    distanceSalesPrinciple: s.string("The configured distance sales principle."),
    smallBusiness: s.boolean("Whether the organization is marked as a small business."),
  },
  {
    optional: [
      "features",
      "businessFeatures",
      "subscriptionStatus",
      "taxType",
      "distanceSalesPrinciple",
      "smallBusiness",
    ],
  },
);

const voucherSummary = s.object("A voucher summary returned by the Lexoffice voucherlist endpoint.", {
  id: uuid("The Lexoffice voucher identifier."),
  voucherType: s.nonEmptyString("The voucher type identifier."),
  voucherStatus: s.nonEmptyString("The voucher status identifier."),
  voucherNumber: s.nonEmptyString("The voucher number."),
  voucherDate: s.dateTime("The RFC 3339 timestamp returned by Lexoffice."),
  createdDate: s.dateTime("The RFC 3339 timestamp returned by Lexoffice."),
  updatedDate: s.dateTime("The RFC 3339 timestamp returned by Lexoffice."),
  dueDate: s.nullable(s.dateTime("The due date timestamp returned by Lexoffice.")),
  contactId: s.nullable(optionalUuid("The Lexoffice contact identifier.")),
  contactName: s.nullable(s.string("The human-readable contact name.")),
  totalAmount: s.number("The total voucher amount."),
  openAmount: s.nullable(s.number("The currently open amount of the voucher.")),
  currency: s.nonEmptyString("The voucher currency."),
  archived: s.boolean("Whether the voucher is archived."),
});

const voucherPage = pageShape(
  "A Lexoffice voucherlist page response.",
  "The vouchers returned by the current page.",
  voucherSummary,
);

const input = (
  properties: Record<string, JsonSchema>,
  required: string[] = [],
  description = "Lexoffice action input.",
): JsonSchema => s.object(properties, { required, description });

const output = (
  properties: Record<string, JsonSchema>,
  required: string[] = Object.keys(properties),
  description = "Lexoffice action output.",
): JsonSchema => s.object(properties, { required, description });

function action(
  name: LexofficeActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema,
    outputSchema,
  });
}

export const lexofficeActions: ActionDefinition[] = [
  action(
    "get_profile",
    "read",
    "Retrieve the current Lexoffice connection profile and organization metadata.",
    input({}, [], "The input payload for retrieving the current Lexoffice profile."),
    profile,
  ),
  action(
    "list_contacts",
    "read",
    "List Lexoffice contacts with optional filters and page navigation.",
    input(
      {
        email: s.string({
          minLength: 3,
          description: "Filter contacts by email with Lexoffice substring semantics.",
        }),
        name: s.string({
          minLength: 3,
          description: "Filter contacts by name with Lexoffice substring semantics.",
        }),
        number: s.integer("Filter contacts by customer or vendor number."),
        customer: s.boolean("Whether to filter customer contacts."),
        vendor: s.boolean("Whether to filter vendor contacts."),
        page,
        size: pageSize,
      },
      [],
      "The input payload for listing Lexoffice contacts.",
    ),
    pageShape("A Lexoffice contact page response.", "The contacts returned by the current page.", contact),
  ),
  action(
    "get_contact",
    "read",
    "Retrieve one Lexoffice contact by ID.",
    input({ id: uuid("The Lexoffice contact identifier.") }, ["id"]),
    output({ contact }, ["contact"], "The response returned when retrieving one Lexoffice contact."),
  ),
  action(
    "create_contact",
    "write",
    "Create one Lexoffice contact using either a company or person payload.",
    input({ data: contactMutation }, ["data"], "The input payload for creating a Lexoffice contact."),
    output({ result: actionResult }, ["result"], "The response returned when creating a Lexoffice contact."),
  ),
  action(
    "update_contact",
    "write",
    "Update one Lexoffice contact by ID using the latest optimistic-locking version.",
    input(
      {
        id: uuid("The Lexoffice contact identifier."),
        data: contactMutation,
      },
      ["id", "data"],
      "The input payload for updating a Lexoffice contact.",
    ),
    output({ result: actionResult }, ["result"], "The response returned when updating a Lexoffice contact."),
  ),
  action(
    "list_articles",
    "read",
    "List Lexoffice articles with optional articleNumber, GTIN, or type filters.",
    input(
      {
        articleNumber: s.nonEmptyString("Filter articles by article number."),
        gtin: s.nonEmptyString("Filter articles by GTIN."),
        type: articleType,
        page,
        size: pageSize,
      },
      [],
      "The input payload for listing Lexoffice articles.",
    ),
    pageShape("A Lexoffice article page response.", "The articles returned by the current page.", article),
  ),
  action(
    "get_article",
    "read",
    "Retrieve one Lexoffice article by ID.",
    input({ id: uuid("The Lexoffice article identifier.") }, ["id"]),
    output({ article }, ["article"], "The response returned when retrieving one Lexoffice article."),
  ),
  action(
    "create_article",
    "write",
    "Create one Lexoffice article with a NET or GROSS leading price payload.",
    input({ data: articleMutation }, ["data"], "The input payload for creating a Lexoffice article."),
    output({ result: actionResult }, ["result"], "The response returned when creating a Lexoffice article."),
  ),
  action(
    "update_article",
    "write",
    "Update one Lexoffice article by ID using the latest optimistic-locking version.",
    input(
      {
        id: uuid("The Lexoffice article identifier."),
        data: articleMutation,
      },
      ["id", "data"],
      "The input payload for updating a Lexoffice article.",
    ),
    output({ result: actionResult }, ["result"], "The response returned when updating a Lexoffice article."),
  ),
  action(
    "list_voucherlist",
    "read",
    "List Lexoffice voucher metadata using the official voucherlist filters and paging.",
    input(
      {
        voucherType: s.nonEmptyString("A comma-separated Lexoffice voucher type list, or the value any."),
        voucherStatus: s.nonEmptyString("A comma-separated Lexoffice voucher status list, or the value any."),
        archived: s.boolean("Whether archived vouchers should be returned."),
        contactId: optionalUuid("The Lexoffice contact identifier."),
        voucherDateFrom: date,
        voucherDateTo: date,
        createdDateFrom: date,
        createdDateTo: date,
        updatedDateFrom: date,
        updatedDateTo: date,
        voucherNumber: s.nonEmptyString("Filter vouchers by voucher number."),
        size: pageSize,
        page,
        sort: s.nonEmptyString("The Lexoffice sort expression such as voucherDate,DESC or updatedDate,ASC."),
      },
      ["voucherType", "voucherStatus"],
      "The input payload for listing Lexoffice voucher metadata.",
    ),
    voucherPage,
  ),
];
