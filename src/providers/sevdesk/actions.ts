import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sevdesk";

const contactIdField = s.positiveInteger("The sevdesk contact identifier.");
const embedField = s.array(
  "Nested resource names to expand through sevdesk's embed query parameter.",
  s.string({ description: "One nested sevdesk resource name to embed.", minLength: 1 }),
  { minItems: 1 },
);

const contactReferenceInputSchema = s.object("A sevdesk contact reference object.", {
  id: s.positiveInteger("The referenced sevdesk contact identifier."),
  objectName: s.literal("Contact", { description: "The sevdesk model name for a contact reference." }),
});

const categoryReferenceInputSchema = s.object("A sevdesk contact category reference object.", {
  id: s.positiveInteger("The referenced sevdesk category identifier."),
  objectName: s.literal("Category", { description: "The sevdesk model name for a category reference." }),
});

const contactReferenceOutputSchema = s.object("A sevdesk contact reference object.", {
  id: s.string("The referenced sevdesk contact identifier."),
  objectName: s.string("The sevdesk model name for the contact reference."),
});

const categoryReferenceOutputSchema = s.object("A sevdesk contact category reference object.", {
  id: s.string("The referenced sevdesk category identifier."),
  objectName: s.string("The sevdesk model name for the category reference."),
});

const sevdeskContactSchema = s.looseObject("A sevdesk contact object.", {
  id: s.string("The sevdesk contact identifier."),
  objectName: s.string("The sevdesk model name for the contact."),
  name: s.nullable(s.string("The organization name when the contact is a company.")),
  status: s.nullable(s.string("The sevdesk status code returned for the contact.")),
  customerNumber: s.nullable(s.string("The customer number returned by sevdesk.")),
  surename: s.nullable(s.string("The first name returned by sevdesk.")),
  familyname: s.nullable(s.string("The last name returned by sevdesk.")),
  titel: s.nullable(s.string("The non-academic title returned by sevdesk.")),
  category: s.nullable(categoryReferenceOutputSchema),
  parent: s.nullable(contactReferenceOutputSchema),
  description: s.nullable(s.string("The description stored on the contact.")),
  academicTitle: s.nullable(s.string("The academic title stored on the contact.")),
  gender: s.nullable(s.string("The gender value stored on the contact.")),
  name2: s.nullable(s.string("The secondary name stored on the contact.")),
  birthday: s.nullable(s.string("The birthday stored on the contact.")),
  vatNumber: s.nullable(s.string("The VAT number stored on the contact.")),
  bankAccount: s.nullable(s.string("The bank account stored on the contact.")),
  bankNumber: s.nullable(s.string("The bank number stored on the contact.")),
  defaultCashbackTime: s.nullable(s.string("The default cashback time returned by sevdesk.")),
  defaultCashbackPercent: s.nullable(s.string("The default cashback percentage returned by sevdesk.")),
  defaultTimeToPay: s.nullable(s.string("The default payment time returned by sevdesk.")),
  taxNumber: s.nullable(s.string("The tax number stored on the contact.")),
  taxOffice: s.nullable(s.string("The tax office stored on the contact.")),
  exemptVat: s.nullable(s.string("The VAT exemption flag returned by sevdesk.")),
  defaultDiscountAmount: s.nullable(s.string("The default discount amount returned by sevdesk.")),
  defaultDiscountPercentage: s.nullable(s.string("The default discount percentage flag returned by sevdesk.")),
  buyerReference: s.nullable(s.string("The buyer reference stored on the contact.")),
  governmentAgency: s.nullable(s.string("The government agency flag returned by sevdesk.")),
});

const contactWriteFields = {
  name: s.nullable(s.string("The organization name. When set, sevdesk treats the contact as an organization.")),
  status: s.nullable(s.integer("The sevdesk contact status code, such as 100, 500, or 1000.")),
  customerNumber: s.nullable(s.string("The customer number to store on the contact.")),
  parent: s.nullable(contactReferenceInputSchema),
  surename: s.nullable(s.string("The first name for a person contact.")),
  familyname: s.nullable(s.string("The last name for a person contact.")),
  titel: s.nullable(s.string("The non-academic title for the contact.")),
  category: s.nullable(categoryReferenceInputSchema),
  description: s.nullable(s.string("The free-form description stored on the contact.")),
  academicTitle: s.nullable(s.string("The academic title for the contact.")),
  gender: s.nullable(s.string("The gender value for the contact.")),
  name2: s.nullable(s.string("The second name for a person contact.")),
  birthday: s.nullable(s.date("The birthday for a person contact in YYYY-MM-DD format.")),
  vatNumber: s.nullable(s.string("The VAT number stored on the contact.")),
  bankAccount: s.nullable(s.string("The bank account number (IBAN) stored on the contact.")),
  bankNumber: s.nullable(s.string("The bank number stored on the contact.")),
  defaultCashbackTime: s.nullable(s.integer("The default cashback time in days for this contact.")),
  defaultCashbackPercent: s.nullable(s.number("The default cashback percent for this contact.")),
  defaultTimeToPay: s.nullable(s.integer("The default time to pay in days for this contact.")),
  taxNumber: s.nullable(s.string("The tax number stored on the contact.")),
  taxOffice: s.nullable(s.string("The tax office stored on the contact.")),
  exemptVat: s.nullable(s.boolean("Whether the contact is exempt from VAT.")),
  defaultDiscountAmount: s.nullable(s.number("The default discount amount applied to this contact.")),
  defaultDiscountPercentage: s.nullable(
    s.boolean("Whether the default discount amount is interpreted as a percentage."),
  ),
  buyerReference: s.nullable(s.string("The buyer reference stored on the contact.")),
  governmentAgency: s.nullable(s.boolean("Whether the contact represents a government agency.")),
};

const createContactFields = {
  ...contactWriteFields,
  category: categoryReferenceInputSchema,
};

const contactWriteOptionalFields = [
  "name",
  "status",
  "customerNumber",
  "parent",
  "surename",
  "familyname",
  "titel",
  "category",
  "description",
  "academicTitle",
  "gender",
  "name2",
  "birthday",
  "vatNumber",
  "bankAccount",
  "bankNumber",
  "defaultCashbackTime",
  "defaultCashbackPercent",
  "defaultTimeToPay",
  "taxNumber",
  "taxOffice",
  "exemptVat",
  "defaultDiscountAmount",
  "defaultDiscountPercentage",
  "buyerReference",
  "governmentAgency",
];

export const sevdeskActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List sevdesk contacts with optional customer number, pagination, and embed options.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing sevdesk contacts.",
      {
        depth: s.stringEnum("Whether to return only organizations or both organizations and persons.", ["0", "1"]),
        customerNumber: s.string({ description: "The customer number to filter contacts by.", minLength: 1 }),
        limit: s.integer("The maximum number of contacts to return.", { minimum: 1, maximum: 1000 }),
        offset: s.nonNegativeInteger("The number of contacts to skip before returning results."),
        countAll: s.boolean("Whether sevdesk should include the total number of matching contacts."),
        embed: embedField,
      },
      { optional: ["depth", "customerNumber", "limit", "offset", "countAll", "embed"] },
    ),
    outputSchema: s.actionOutput(
      {
        contacts: s.array("The contacts returned by sevdesk.", sevdeskContactSchema),
        total: s.nullable(s.integer("The total number of matching contacts when sevdesk returns it.")),
      },
      "The normalized sevdesk contact list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one sevdesk contact by its identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for reading a single sevdesk contact.",
      {
        contactId: contactIdField,
        embed: embedField,
      },
      { optional: ["embed"] },
    ),
    outputSchema: s.actionOutput({ contact: sevdeskContactSchema }, "The normalized sevdesk contact lookup response."),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a new sevdesk contact using the official contact payload fields.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for creating a sevdesk contact.", createContactFields, {
      optional: contactWriteOptionalFields.filter((field) => field !== "category"),
    }),
    outputSchema: s.actionOutput(
      { contact: sevdeskContactSchema },
      "The normalized sevdesk contact creation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update an existing sevdesk contact using the official contact update payload fields.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating a sevdesk contact.",
      {
        contactId: contactIdField,
        ...contactWriteFields,
      },
      { optional: contactWriteOptionalFields },
    ),
    outputSchema: s.actionOutput({ contact: sevdeskContactSchema }, "The normalized sevdesk contact update response."),
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a sevdesk contact by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { contactId: contactIdField },
      ["contactId"],
      "Input parameters for deleting a sevdesk contact.",
    ),
    outputSchema: s.actionOutput(
      { deleted: s.boolean("Whether the requested contact was deleted successfully.") },
      "The normalized sevdesk contact deletion response.",
    ),
  }),
];
