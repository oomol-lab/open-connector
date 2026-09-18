import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "krispcall";

const rawObjectSchema = s.looseObject("The raw object returned by KrispCall.");
const nullableStringSchema = s.nullable(s.string("The string value returned by KrispCall."));
const metadataSchema = s.requiredObject("The pagination metadata returned by KrispCall.", {
  size: s.nullable(s.integer("The response page size returned by KrispCall.")),
  page: s.nullable(s.integer("The response page number returned by KrispCall.")),
  totalCount: s.nullable(s.integer("The total number of matching records returned by KrispCall.")),
  raw: rawObjectSchema,
});

const workspaceSchema = s.looseObject("A normalized KrispCall workspace.", {
  id: nullableStringSchema,
  title: nullableStringSchema,
  name: nullableStringSchema,
  status: nullableStringSchema,
  kycVerified: s.nullable(s.boolean("Whether KrispCall marks the workspace KYC as verified.")),
  raw: rawObjectSchema,
});

const contactSchema = s.looseObject("A normalized KrispCall contact.", {
  id: nullableStringSchema,
  contact: nullableStringSchema,
  name: nullableStringSchema,
  email: nullableStringSchema,
  company: nullableStringSchema,
  address: nullableStringSchema,
  country: nullableStringSchema,
  status: nullableStringSchema,
  visibility: nullableStringSchema,
  blocked: s.nullable(s.boolean("Whether KrispCall marks the contact as blocked.")),
  favourite: s.nullable(s.boolean("Whether KrispCall marks the contact as a favourite.")),
  secondaryPhone: s.array(
    "The secondary phone numbers returned for the contact.",
    s.string("A secondary phone number."),
  ),
  secondaryEmail: s.array(
    "The secondary email addresses returned for the contact.",
    s.string("A secondary email address."),
  ),
  tags: s.array("The tag names returned for the contact.", s.string("A tag name.")),
  raw: rawObjectSchema,
});

const memberSchema = s.looseObject("A normalized KrispCall workspace member.", {
  id: nullableStringSchema,
  email: nullableStringSchema,
  firstName: nullableStringSchema,
  lastName: nullableStringSchema,
  dateOfBirth: nullableStringSchema,
  gender: nullableStringSchema,
  workspace: rawObjectSchema,
  raw: rawObjectSchema,
});

const pageInputSchema = s.object(
  "The pagination input for a KrispCall list query.",
  {
    page: s.positiveInteger("The one-based page number to request from KrispCall."),
    size: s.positiveInteger("The number of records to request from KrispCall."),
  },
  { optional: ["page", "size"] },
);

const contactIdInputSchema = s.requiredObject("The KrispCall contact lookup input.", {
  id: s.nonEmptyString("The KrispCall contact identifier."),
});

const contactFieldsSchema = {
  contact: s.nonEmptyString("The primary phone number for the KrispCall contact."),
  country: s.string("The ISO country code for the contact phone number."),
  name: s.string("The contact name."),
  email: s.email("The contact email address."),
  company: s.string("The contact company name."),
  address: s.string("The contact address."),
  tags: s.stringArray("The contact tags to send to KrispCall.", {
    itemDescription: "A contact tag.",
  }),
  secondaryPhone: s.stringArray("The secondary phone numbers to send to KrispCall.", {
    itemDescription: "A secondary phone number.",
  }),
  secondaryEmail: s.stringArray("The secondary email addresses to send to KrispCall.", {
    itemDescription: "A secondary email address.",
  }),
};

const getWorkspaceAction = defineProviderAction(service, {
  name: "get_workspace",
  operationType: "read",
  description: "Get the connected KrispCall workspace profile.",
  requiredScopes: [],
  inputSchema: s.requiredObject("This action does not require input fields.", {}),
  outputSchema: s.requiredObject("The connected KrispCall workspace profile.", {
    workspace: workspaceSchema,
    raw: rawObjectSchema,
  }),
});

const listContactsAction = defineProviderAction(service, {
  name: "list_contacts",
  operationType: "read",
  description: "List contacts in the connected KrispCall workspace.",
  requiredScopes: [],
  inputSchema: pageInputSchema,
  outputSchema: s.requiredObject("The KrispCall contact list response.", {
    contacts: s.array("The contacts returned by KrispCall.", contactSchema),
    metadata: s.nullable(metadataSchema),
    raw: rawObjectSchema,
  }),
});

const getContactAction = defineProviderAction(service, {
  name: "get_contact",
  operationType: "read",
  description: "Get one KrispCall contact by identifier.",
  requiredScopes: [],
  inputSchema: contactIdInputSchema,
  outputSchema: s.requiredObject("The KrispCall contact detail response.", {
    contact: contactSchema,
    raw: rawObjectSchema,
  }),
});

const createContactAction = defineProviderAction(service, {
  name: "create_contact",
  operationType: "write",
  description: "Create a contact in the connected KrispCall workspace.",
  requiredScopes: [],
  inputSchema: s.object("The KrispCall contact fields to create.", contactFieldsSchema, {
    optional: ["country", "name", "email", "company", "address", "tags", "secondaryPhone", "secondaryEmail"],
  }),
  outputSchema: s.requiredObject("The KrispCall create contact response.", {
    contact: contactSchema,
    raw: rawObjectSchema,
  }),
});

const updateContactAction = defineProviderAction(service, {
  name: "update_contact",
  operationType: "write",
  description: "Update a KrispCall contact by identifier.",
  requiredScopes: [],
  inputSchema: s.object(
    "The KrispCall contact fields to update.",
    {
      id: s.nonEmptyString("The KrispCall contact identifier."),
      ...contactFieldsSchema,
    },
    {
      optional: [
        "contact",
        "country",
        "name",
        "email",
        "company",
        "address",
        "tags",
        "secondaryPhone",
        "secondaryEmail",
      ],
    },
  ),
  outputSchema: s.requiredObject("The KrispCall update contact response.", {
    contact: contactSchema,
    raw: rawObjectSchema,
  }),
});

const deleteContactAction = defineProviderAction(service, {
  name: "delete_contact",
  operationType: "destructive",
  description: "Delete a KrispCall contact by identifier.",
  requiredScopes: [],
  inputSchema: contactIdInputSchema,
  outputSchema: s.requiredObject("The KrispCall delete contact response.", {
    result: s.unknown("The data value returned by KrispCall for the delete operation."),
    raw: rawObjectSchema,
  }),
});

const listMembersAction = defineProviderAction(service, {
  name: "list_members",
  operationType: "read",
  description: "List members in the connected KrispCall workspace.",
  requiredScopes: [],
  inputSchema: pageInputSchema,
  outputSchema: s.requiredObject("The KrispCall workspace member list response.", {
    members: s.array("The members returned by KrispCall.", memberSchema),
    metadata: s.nullable(metadataSchema),
    raw: rawObjectSchema,
  }),
});

const getMemberAction = defineProviderAction(service, {
  name: "get_member",
  operationType: "read",
  description: "Get one KrispCall workspace member by identifier.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The KrispCall member lookup input.", {
    id: s.nonEmptyString("The KrispCall member identifier."),
  }),
  outputSchema: s.requiredObject("The KrispCall workspace member detail response.", {
    member: memberSchema,
    raw: rawObjectSchema,
  }),
});

export const krispcallActions: readonly ActionDefinition[] = [
  getWorkspaceAction,
  listContactsAction,
  getContactAction,
  createContactAction,
  updateContactAction,
  deleteContactAction,
  listMembersAction,
  getMemberAction,
];
