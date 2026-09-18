import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "altiria";

const customFieldSchema = s.object(
  "One Altiria contact custom field value.",
  {
    key: s.nonEmptyString("Custom field name."),
    type: s.stringEnum("Custom field type.", ["string", "date", "decimal"]),
    value: s.nonEmptyString("Custom field value."),
  },
  { optional: ["type"] },
);

const includeSchema = s.array(
  "Associated contact resources to include in the response.",
  s.stringEnum("One associated contact resource name.", ["customFields", "groups"]),
  { minItems: 1 },
);

const metadataSchema = s.looseObject("Pagination and other metadata returned by Altiria.");

const smsSchema = s.looseObject("One normalized Altiria SMS message.", {
  id: s.nullable(s.string("Altiria SMS message identifier.")),
  from: s.nullable(s.string("Sender value used for the SMS message.")),
  to: s.nullable(s.string("Recipient phone number.")),
  message: s.nullable(s.string("SMS message body.")),
  campaignId: s.nullable(s.integer("Altiria campaign identifier.")),
  sendingId: s.nullable(s.integer("Altiria sending identifier.")),
  isDelivered: s.nullable(s.boolean("Whether Altiria reports the message as delivered.")),
  isClicked: s.nullable(s.boolean("Whether Altiria reports a shortened link click.")),
  raw: s.looseObject("Raw Altiria SMS object."),
});

const sendSmsOutputSchema = s.requiredObject("The result returned by Altiria after sending SMS.", {
  accepted: s.boolean("Whether Altiria accepted the SMS request."),
  messages: s.array("SMS message records returned by Altiria.", smsSchema),
  raw: s.unknown("Raw Altiria response payload."),
});

const contactSchema = s.looseObject("One normalized Altiria contact.", {
  id: s.nullable(s.integer("Altiria contact identifier.")),
  email: s.nullable(s.string("Contact email address.")),
  phone: s.nullable(s.string("Contact mobile phone number.")),
  landline: s.nullable(s.string("Contact landline phone number.")),
  countryIso: s.nullable(s.string("Two-letter contact country code.")),
  name: s.nullable(s.string("Contact first name.")),
  surname: s.nullable(s.string("Contact surname.")),
  createdAt: s.nullable(s.string("Contact creation timestamp returned by Altiria.")),
  updatedAt: s.nullable(s.string("Contact update timestamp returned by Altiria.")),
  raw: s.looseObject("Raw Altiria contact object."),
});

const groupSchema = s.looseObject("One normalized Altiria contact group.", {
  id: s.nullable(s.integer("Altiria group identifier.")),
  name: s.nullable(s.string("Altiria group name.")),
  raw: s.looseObject("Raw Altiria group object."),
});

const contactWriteFields = {
  email: s.email("Contact email address."),
  phone: s.nonEmptyString("Contact mobile phone number with international prefix."),
  landline: s.nonEmptyString("Contact landline phone number."),
  countryIso: s.string("Two-letter country code required when phone or landline is specified.", {
    minLength: 2,
    maxLength: 2,
  }),
  groupsIds: s.array("Contact group IDs to attach this contact to.", s.integer("One Altiria group ID."), {
    minItems: 1,
  }),
  groupsNames: s.array("Contact group names to attach this contact to.", s.nonEmptyString("One Altiria group name."), {
    minItems: 1,
  }),
  name: s.nonEmptyString("Contact first name."),
  surname: s.nonEmptyString("Contact surname."),
  customFields: s.array("Custom fields to set on this contact.", customFieldSchema, {
    minItems: 1,
  }),
};

const contactWriteOptionalKeys: readonly (keyof typeof contactWriteFields & string)[] = [
  "email",
  "phone",
  "landline",
  "countryIso",
  "groupsIds",
  "groupsNames",
  "name",
  "surname",
  "customFields",
];

const sendSms = defineProviderAction(service, {
  name: "send_sms",
  operationType: "write",
  description: "Send an SMS message through Altiria's REST SMS endpoint.",
  inputSchema: s.object(
    "The input payload for sending an Altiria SMS message.",
    {
      to: s.array(
        "Recipient mobile phone numbers with international prefix.",
        s.nonEmptyString("One recipient mobile phone number."),
        { minItems: 1 },
      ),
      from: s.nonEmptyString("SMS sender value registered or allowed in Altiria."),
      message: s.nonEmptyString("SMS body text to send."),
      notificationUrl: s.anyOf("Delivery notification URL, either shared by all recipients or one URL per recipient.", [
        s.url("One delivery notification URL."),
        s.array("Delivery notification URLs by recipient.", s.url("One delivery URL."), {
          minItems: 1,
        }),
      ]),
      campaignName: s.nonEmptyString("Optional campaign name used in Altiria statistics."),
      tags: s.array("Campaign tags to attach to the send.", s.nonEmptyString("One tag."), {
        minItems: 1,
      }),
      certified: s.boolean("Whether to send the message as certified SMS."),
      splitParts: s.boolean("Whether Altiria should split long SMS messages into SMS parts."),
      flash: s.boolean("Whether to send the message as a Flash SMS."),
      sub: s.array(
        "Substitution variable objects, one per recipient.",
        s.record("Substitution variables for one recipient.", s.unknown("Variable value.")),
        { minItems: 1 },
      ),
    },
    {
      optional: ["notificationUrl", "campaignName", "tags", "certified", "splitParts", "flash", "sub"],
    },
  ),
  outputSchema: sendSmsOutputSchema,
});

const getSms = defineProviderAction(service, {
  name: "get_sms",
  operationType: "read",
  description: "Fetch SMS information from Altiria by one or more message identifiers.",
  inputSchema: s.requiredObject("The input payload for fetching Altiria SMS information.", {
    id: s.nonEmptyString("Altiria SMS message identifier, or multiple identifiers separated by commas."),
  }),
  outputSchema: s.requiredObject("SMS messages returned by Altiria.", {
    messages: s.array("SMS message records returned by Altiria.", smsSchema),
    raw: s.unknown("Raw Altiria response payload."),
  }),
});

const listContacts = defineProviderAction(service, {
  name: "list_contacts",
  operationType: "read",
  description: "List contacts from the connected Altiria account.",
  inputSchema: s.object(
    "The input payload for listing Altiria contacts.",
    {
      limit: s.integer("Maximum contacts to return in one request.", { minimum: 1, maximum: 1000 }),
      page: s.integer("Result page to request.", { minimum: 1 }),
      include: includeSchema,
    },
    { optional: ["limit", "page", "include"] },
  ),
  outputSchema: s.requiredObject("Contacts returned by Altiria.", {
    contacts: s.array("Contact records returned by Altiria.", contactSchema),
    meta: s.nullable(metadataSchema),
    raw: s.unknown("Raw Altiria response payload."),
  }),
});

const getContact = defineProviderAction(service, {
  name: "get_contact",
  operationType: "read",
  description: "Fetch one Altiria contact by contact ID.",
  inputSchema: s.object(
    "The input payload for fetching one Altiria contact.",
    {
      id: s.integer("Altiria contact identifier."),
      include: includeSchema,
    },
    { optional: ["include"] },
  ),
  outputSchema: s.requiredObject("Contact returned by Altiria.", {
    contact: contactSchema,
    raw: s.unknown("Raw Altiria response payload."),
  }),
});

const createContact = defineProviderAction(service, {
  name: "create_contact",
  operationType: "write",
  description: "Create a new Altiria contact.",
  inputSchema: s.object("The input payload for creating an Altiria contact.", contactWriteFields, {
    optional: contactWriteOptionalKeys,
  }),
  outputSchema: s.requiredObject("Contact created by Altiria.", {
    contact: contactSchema,
    raw: s.unknown("Raw Altiria response payload."),
  }),
});

const updateContact = defineProviderAction(service, {
  name: "update_contact",
  operationType: "write",
  description: "Update an existing Altiria contact.",
  inputSchema: s.object(
    "The input payload for updating an Altiria contact.",
    {
      id: s.integer("Altiria contact identifier."),
      ...contactWriteFields,
    },
    { optional: contactWriteOptionalKeys },
  ),
  outputSchema: s.requiredObject("Contact updated by Altiria.", {
    contact: contactSchema,
    raw: s.unknown("Raw Altiria response payload."),
  }),
});

const deleteContact = defineProviderAction(service, {
  name: "delete_contact",
  operationType: "destructive",
  description: "Delete one Altiria contact by contact ID.",
  inputSchema: s.requiredObject("The input payload for deleting one Altiria contact.", {
    id: s.integer("Altiria contact identifier."),
  }),
  outputSchema: s.requiredObject("Delete status returned after removing an Altiria contact.", {
    deleted: s.boolean("Whether the contact delete request succeeded."),
  }),
});

const listGroups = defineProviderAction(service, {
  name: "list_groups",
  operationType: "read",
  description: "List contact groups from the connected Altiria account.",
  inputSchema: s.object(
    "The input payload for listing Altiria contact groups.",
    {
      limit: s.integer("Maximum groups to return in one request.", { minimum: 1, maximum: 1000 }),
      page: s.integer("Result page to request.", { minimum: 1 }),
    },
    { optional: ["limit", "page"] },
  ),
  outputSchema: s.requiredObject("Contact groups returned by Altiria.", {
    groups: s.array("Group records returned by Altiria.", groupSchema),
    meta: s.nullable(metadataSchema),
    raw: s.unknown("Raw Altiria response payload."),
  }),
});

export const altiriaActions: ActionDefinition[] = [
  sendSms,
  getSms,
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  listGroups,
];
