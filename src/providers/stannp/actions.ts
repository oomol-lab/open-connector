import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stannp";

const paginationInputSchema: Record<string, JsonSchema> = {
  offset: s.nonNegativeInteger("Number of records to skip before returning results."),
  limit: s.positiveInteger("Maximum number of records to return."),
};

const recipientSchema = s.looseObject("A Stannp recipient record.", {
  id: s.string("Stannp recipient ID."),
  account_id: s.string("Stannp account ID that owns the recipient."),
  title: s.string("Recipient title."),
  firstname: s.string("Recipient first name."),
  lastname: s.string("Recipient last name."),
  company: s.string("Recipient company name."),
  job_title: s.string("Recipient job title."),
  address1: s.string("Recipient address line 1."),
  address2: s.string("Recipient address line 2."),
  address3: s.string("Recipient address line 3."),
  city: s.string("Recipient city or town."),
  county: s.string("Recipient county, province, or state."),
  country: s.string("Recipient ISO 3166-1 alpha-2 country code."),
  postcode: s.string("Recipient postal code or ZIP code."),
  dps: s.string("Recipient delivery point suffix when returned by Stannp."),
  email: s.string("Recipient email address."),
  phone_number: s.string("Recipient phone number."),
  ref_id: s.string("External reference ID for matching the recipient."),
  blacklist: s.anyOf("Whether the recipient has been block listed.", [
    s.boolean("Recipient block-list flag as a boolean."),
    s.string("Recipient block-list flag as returned by Stannp."),
  ]),
  created: s.string("Timestamp when the recipient was created."),
  updated: s.string("Timestamp when the recipient was last updated."),
});

const groupSchema = s.looseObject("A Stannp recipient group record.", {
  id: s.string("Stannp group ID."),
  account_id: s.string("Stannp account ID that owns the group."),
  name: s.string("Group name."),
  created: s.string("Timestamp when the group was created."),
  recipients: s.string("Number of recipients in the group as returned by Stannp."),
  valid: s.string("Number of valid recipients in the group as returned by Stannp."),
  international: s.string("Number of international recipients in the group."),
  skipped: s.string("Number of skipped recipients in the group."),
  status: s.string("Group calculation or import status."),
  import_progress: s.string("Group import progress as returned by Stannp."),
  is_seeds: s.string("Whether this group is a seed group as returned by Stannp."),
});

const addressSchema = s.looseObject("A normalized postal address returned by Stannp.", {
  company: s.string("Company name."),
  address1: s.string("Address line 1."),
  address2: s.string("Address line 2."),
  address3: s.string("Address line 3."),
  city: s.string("City or town."),
  county: s.string("County, province, or state."),
  postcode: s.string("Postal code or ZIP code."),
  country: s.string("ISO 3166-1 alpha-2 country code."),
  reference_id: s.anyOf("Stannp address reference ID.", [
    s.string("Stannp address reference ID as a string."),
    s.integer("Stannp address reference ID as a number."),
  ]),
  dps: s.string("Delivery point suffix when returned by Stannp."),
  udprn: s.string("Unique delivery point reference number when returned by Stannp."),
  is_valid: s.boolean("Whether Stannp considers the address valid."),
});

const recipientWriteFields: Record<string, JsonSchema> = {
  groupId: s.positiveInteger("Optional group ID to add the new recipient to."),
  title: s.nonEmptyString("Recipient title, such as Mr, Mrs, or Dr."),
  firstname: s.nonEmptyString("Recipient first name."),
  lastname: s.nonEmptyString("Recipient last name."),
  company: s.nonEmptyString("Recipient company name."),
  jobTitle: s.nonEmptyString("Recipient job title."),
  address1: s.nonEmptyString("Recipient address line 1."),
  address2: s.nonEmptyString("Recipient address line 2."),
  address3: s.nonEmptyString("Recipient address line 3."),
  city: s.nonEmptyString("Recipient city."),
  county: s.nonEmptyString("Recipient county, province, or state."),
  postcode: s.nonEmptyString("Recipient postal code or ZIP code."),
  country: s.nonEmptyString("Recipient ISO 3166-1 alpha-2 country code."),
  email: s.email("Recipient email address."),
  phoneNumber: s.nonEmptyString("Recipient phone number."),
  refId: s.nonEmptyString("External reference ID for matching a recipient across systems."),
  onDuplicate: s.stringEnum("Duplicate handling mode when Stannp finds an existing recipient.", [
    "update",
    "ignore",
    "duplicate",
  ]),
  testLevel: s.stringEnum("Duplicate detection strategy used by Stannp.", ["email", "fullname", "initial", "ref_id"]),
  customFields: s.record(
    "Custom Stannp recipient fields to send as top-level recipient parameters.",
    s.unknown("A custom recipient field value."),
  ),
};

const validateAddressInputSchema = s.object(
  "Input for validating a postal address with Stannp.",
  {
    company: s.nonEmptyString("Company name."),
    address1: s.nonEmptyString("Address line 1."),
    address2: s.nonEmptyString("Address line 2."),
    address3: s.nonEmptyString("Address line 3."),
    city: s.nonEmptyString("Address city."),
    postcode: s.nonEmptyString("Address postal code. Recommended for accurate validation."),
    country: s.nonEmptyString("ISO 3166-1 alpha-2 country code. Recommended for accurate validation."),
    state: s.nonEmptyString("Two-letter US state abbreviation."),
    province: s.nonEmptyString("Two-letter Canadian province abbreviation."),
    zipcode: s.nonEmptyString("US or Canadian ZIP/postal code. Required by Stannp if city is absent."),
  },
  {
    optional: ["company", "address2", "address3", "city", "postcode", "country", "state", "province", "zipcode"],
  },
);

export const stannpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_balance",
    operationType: "read",
    description: "Retrieve the Stannp account balance for the connected regional account.",
    inputSchema: s.actionInput({}, [], "No input is required for this Stannp action."),
    outputSchema: s.actionOutput(
      {
        balance: s.string("Current account balance as returned by Stannp."),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp account balance output.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_recipients",
    operationType: "read",
    description: "List Stannp recipients, optionally filtered by group and paginated.",
    inputSchema: s.actionInput(
      {
        groupId: s.positiveInteger("Optional group ID to filter recipients."),
        ...paginationInputSchema,
      },
      [],
      "Input for listing Stannp recipients.",
    ),
    outputSchema: s.actionOutput(
      {
        recipients: s.array("Recipients returned by Stannp.", recipientSchema),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp recipient list output.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_recipient",
    operationType: "read",
    description: "Retrieve a single Stannp recipient by ID.",
    inputSchema: s.actionInput(
      {
        recipientId: s.positiveInteger("ID of the Stannp recipient to retrieve."),
      },
      ["recipientId"],
      "Input for retrieving one Stannp recipient.",
    ),
    outputSchema: s.actionOutput(
      {
        recipient: recipientSchema,
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp recipient output.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_recipient",
    operationType: "write",
    description: "Create a Stannp recipient and optionally add it to a group.",
    inputSchema: s.actionInput(recipientWriteFields, [], "Input for creating a Stannp recipient."),
    outputSchema: s.actionOutput(
      {
        recipientId: s.string("Created recipient ID as returned by Stannp."),
        valid: s.nullableBoolean("Whether Stannp marked the recipient as valid."),
        created: s.nullableString("Creation timestamp returned by Stannp."),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp recipient creation output.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_recipient",
    operationType: "destructive",
    description: "Permanently delete a Stannp recipient by ID.",
    inputSchema: s.actionInput(
      {
        recipientId: s.positiveInteger("ID of the Stannp recipient to delete."),
      },
      ["recipientId"],
      "Input for deleting a Stannp recipient.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether Stannp reported the recipient deletion as successful."),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp recipient deletion output.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description: "List Stannp recipient groups with optional offset and limit pagination.",
    inputSchema: s.actionInput(paginationInputSchema, [], "Input for listing Stannp recipient groups."),
    outputSchema: s.actionOutput(
      {
        groups: s.array("Recipient groups returned by Stannp.", groupSchema),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp group list output.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_group",
    operationType: "write",
    description: "Create an empty Stannp recipient group.",
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("Name of the new Stannp recipient group."),
      },
      ["name"],
      "Input for creating a Stannp recipient group.",
    ),
    outputSchema: s.actionOutput(
      {
        groupId: s.string("Created group ID as returned by Stannp."),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp group creation output.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_recipients_to_group",
    operationType: "write",
    description: "Add one or more existing Stannp recipients to a recipient group.",
    inputSchema: s.actionInput(
      {
        groupId: s.positiveInteger("ID of the Stannp group to update."),
        recipientIds: s.array(
          "Stannp recipient IDs to add to the group.",
          s.positiveInteger("A Stannp recipient ID."),
          {
            minItems: 1,
          },
        ),
      },
      ["groupId", "recipientIds"],
      "Input for adding recipients to a Stannp group.",
    ),
    outputSchema: s.actionOutput(
      {
        addedCount: s.nullableInteger("Number of recipients Stannp reported as added."),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp group recipient-add output.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_recipients_from_group",
    operationType: "destructive",
    description: "Remove one or more existing Stannp recipients from a recipient group.",
    inputSchema: s.actionInput(
      {
        groupId: s.positiveInteger("ID of the Stannp group to update."),
        recipientIds: s.array(
          "Stannp recipient IDs to remove from the group.",
          s.positiveInteger("A Stannp recipient ID."),
          {
            minItems: 1,
          },
        ),
      },
      ["groupId", "recipientIds"],
      "Input for removing recipients from a Stannp group.",
    ),
    outputSchema: s.actionOutput(
      {
        removedCount: s.nullableInteger("Number of recipients Stannp reported as removed."),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp group recipient-remove output.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_group",
    operationType: "destructive",
    description: "Delete a Stannp recipient group, optionally deleting its recipients.",
    inputSchema: s.actionInput(
      {
        groupId: s.positiveInteger("ID of the Stannp recipient group to delete."),
        deleteRecipients: s.boolean("Whether Stannp should completely delete recipients in the group."),
      },
      ["groupId"],
      "Input for deleting a Stannp recipient group.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether Stannp reported the group deletion as successful."),
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp group deletion output.",
    ),
  }),
  defineProviderAction(service, {
    name: "validate_address",
    operationType: "read",
    description: "Validate and normalize a UK, US, or Canadian postal address with Stannp.",
    inputSchema: validateAddressInputSchema,
    outputSchema: s.actionOutput(
      {
        isValid: s.boolean("Whether Stannp considers the address valid."),
        address: addressSchema,
        raw: s.unknown("Raw Stannp response data."),
      },
      "Stannp address validation output.",
    ),
  }),
];
