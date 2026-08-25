import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "active_trail";

const nonEmptyStringSchema = (description: string) => s.string({ description, minLength: 1 });
const positiveIntegerSchema = (description: string) => s.integer(description, { minimum: 1 });
const pageSchema = s.integer("The zero-based page number requested from ActiveTrail.", { minimum: 0 });
const limitSchema = s.integer("The maximum number of records to request from ActiveTrail.", {
  minimum: 1,
  maximum: 100,
});

const customerStateSchema = s.stringEnum("The ActiveTrail CustomerStates filter used by contact list endpoints.", [
  "ALL",
  "ACTIVE",
  "INACTIVE",
  "CUSTOMER_REQUEST",
  "BOUNCED",
  "SPAM_COMPLIENT",
  "QUARANTINED",
]);

const apiStatusSchema = s.stringEnum("The ActiveTrail contact status value.", [
  "None",
  "Subscribed",
  "Unsubscribed",
  "Pending",
]);

const dateTimeStringSchema = (description: string) => s.string({ description, minLength: 1 });
const rawObjectSchema = s.looseObject("The raw object returned by ActiveTrail.");

const balanceBucketSchema = s.looseObject("One ActiveTrail balance bucket.", {
  credits: s.number("The remaining credits in this balance bucket."),
  percent: s.number("The balance percentage reported by ActiveTrail."),
  alert_type: s.string("The ActiveTrail alert type for this balance bucket."),
});

const balanceOutputSchema = s.object("The ActiveTrail account balance response.", {
  email: balanceBucketSchema,
  sms: balanceBucketSchema,
  coupons: s.looseObject("The coupon balance information returned by ActiveTrail."),
  data: rawObjectSchema,
});

const groupSchema = s.object("A normalized ActiveTrail group record.", {
  id: s.integer("The ActiveTrail group ID."),
  name: s.string("The ActiveTrail group name."),
  active_counter: s.nullable(s.integer("The number of active contacts in the group when returned.")),
  counter: s.nullable(s.integer("The total number of contacts in the group when returned.")),
  created: s.nullable(s.string("The group creation timestamp when returned.")),
  last_generated: s.nullable(s.string("The last dynamic-group generation timestamp when returned.")),
  data: rawObjectSchema,
});

const contactSchema = s.object("A normalized ActiveTrail contact record.", {
  id: s.integer("The ActiveTrail contact ID."),
  state: s.nullable(s.string("The ActiveTrail contact state when returned.")),
  is_optined: s.nullable(s.boolean("Whether the contact is opted in when returned.")),
  email: s.nullable(s.string("The contact email address when returned.")),
  sms: s.nullable(s.string("The contact SMS value when returned.")),
  first_name: s.nullable(s.string("The contact first name when returned.")),
  last_name: s.nullable(s.string("The contact last name when returned.")),
  data: rawObjectSchema,
});

const emptyInputSchema = s.object("The empty input payload for this ActiveTrail action.", {});

const listContactsInputSchema = s.object(
  "Input parameters for listing ActiveTrail contacts.",
  {
    customer_state: customerStateSchema,
    search_term: s.string("Text used to filter ActiveTrail contacts."),
    from_date: dateTimeStringSchema("Only include contacts changed on or after this date."),
    to_date: dateTimeStringSchema("Only include contacts changed on or before this date."),
    page: pageSchema,
    limit: limitSchema,
  },
  {
    optional: ["customer_state", "search_term", "from_date", "to_date", "page", "limit"],
  },
);

const listGroupsInputSchema = s.object(
  "Input parameters for listing ActiveTrail groups.",
  {
    search_term: s.string("Text used to filter ActiveTrail groups."),
    page: pageSchema,
    limit: limitSchema,
  },
  { optional: ["search_term", "page", "limit"] },
);

const idInputSchema = (description: string, idDescription: string) =>
  s.object(
    description,
    {
      id: positiveIntegerSchema(idDescription),
    },
    { required: ["id"] },
  );

const groupPayloadSchema = s.object(
  "Input parameters for creating an ActiveTrail group.",
  {
    name: nonEmptyStringSchema("The group name."),
  },
  { required: ["name"] },
);

const updateGroupInputSchema = s.object(
  "Input parameters for updating an ActiveTrail group.",
  {
    id: positiveIntegerSchema("The ActiveTrail group ID."),
    name: nonEmptyStringSchema("The updated group name."),
  },
  { required: ["id", "name"] },
);

const contactPayloadProperties = {
  subscribe_ip: s.string("The subscribe IP address recorded for the contact."),
  status: apiStatusSchema,
  sms_status: apiStatusSchema,
  email: s.email("The contact email address."),
  sms: s.string("The contact SMS value."),
  first_name: s.string("The contact first name."),
  last_name: s.string("The contact last name."),
  anniversary: dateTimeStringSchema("The contact anniversary timestamp."),
  birthday: dateTimeStringSchema("The contact birthday timestamp."),
  city: s.string("The contact city."),
  fax: s.string("The contact fax number."),
  phone1: s.string("The contact primary phone number."),
  phone2: s.string("The contact secondary phone number."),
  street: s.string("The contact street address."),
  zip_code: s.string("The contact ZIP or postal code."),
};

const contactPayloadOptionalFields = [
  "subscribe_ip",
  "status",
  "sms_status",
  "email",
  "sms",
  "first_name",
  "last_name",
  "anniversary",
  "birthday",
  "city",
  "fax",
  "phone1",
  "phone2",
  "street",
  "zip_code",
] as const;

const createContactBaseSchema = s.looseRequiredObject(
  "Input parameters for creating an ActiveTrail contact. Either email or sms must be provided. Additional ActiveTrail contact fields are passed through.",
  contactPayloadProperties,
  {
    optional: contactPayloadOptionalFields,
  },
);

const createContactInputSchema = requireEmailOrSms(createContactBaseSchema);

const updateContactBaseSchema = s.looseRequiredObject(
  "Input parameters for updating an ActiveTrail contact. Additional ActiveTrail contact fields are passed through.",
  {
    id: positiveIntegerSchema("The ActiveTrail contact ID."),
    ...contactPayloadProperties,
  },
  {
    optional: contactPayloadOptionalFields,
  },
);

const updateContactInputSchema = requireEmailOrSms(updateContactBaseSchema);

const listGroupMembersInputSchema = s.object(
  "Input parameters for listing ActiveTrail group members.",
  {
    group_id: positiveIntegerSchema("The ActiveTrail group ID."),
    customer_state: customerStateSchema,
    search_term: s.string("Text used to filter group members."),
    from_date: dateTimeStringSchema("Only include members changed on or after this date."),
    to_date: dateTimeStringSchema("Only include members changed on or before this date."),
    page: pageSchema,
    limit: limitSchema,
  },
  {
    optional: ["customer_state", "search_term", "from_date", "to_date", "page", "limit"],
  },
);

const addGroupMemberBaseSchema = s.looseRequiredObject(
  "Input parameters for adding or updating an ActiveTrail group member.",
  {
    group_id: positiveIntegerSchema("The ActiveTrail group ID."),
    ...contactPayloadProperties,
  },
  {
    optional: contactPayloadOptionalFields,
  },
);

const addGroupMemberInputSchema = requireEmailOrSms(addGroupMemberBaseSchema);

const removeGroupMemberInputSchema = s.object(
  "Input parameters for removing a group member.",
  {
    group_id: positiveIntegerSchema("The ActiveTrail group ID."),
    member_id: positiveIntegerSchema("The ActiveTrail contact ID to remove from the group."),
  },
  { required: ["group_id", "member_id"] },
);

const listContactsOutputSchema = s.object("The response returned when listing contacts.", {
  contacts: s.array("The contacts returned by ActiveTrail.", contactSchema),
});

const contactOutputSchema = s.object("The response returned for one ActiveTrail contact.", {
  contact: contactSchema,
});

const listGroupsOutputSchema = s.object("The response returned when listing groups.", {
  groups: s.array("The groups returned by ActiveTrail.", groupSchema),
});

const groupOutputSchema = s.object("The response returned for one ActiveTrail group.", {
  group: groupSchema,
});

const listGroupMembersOutputSchema = s.object("The response returned when listing group members.", {
  count: s.nullable(s.integer("The total count returned by ActiveTrail when present.")),
  contacts: s.array("The group members returned by ActiveTrail.", contactSchema),
  data: rawObjectSchema,
});

const deleteOutputSchema = s.object("The response returned after deleting an ActiveTrail record.", {
  deleted: s.boolean("Whether the delete request was accepted by ActiveTrail."),
  data: s.unknown("The raw delete response returned by ActiveTrail, if any."),
});

export const activeTrailActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_balance",
    description: "Fetch the current ActiveTrail email, SMS, and coupon account balances.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: balanceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List ActiveTrail contacts with optional state, search, date, and pagination filters.",
    requiredScopes: [],
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Fetch one ActiveTrail contact by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for fetching an ActiveTrail contact.", "The ActiveTrail contact ID."),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create an ActiveTrail contact.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update an ActiveTrail contact.",
    requiredScopes: [],
    inputSchema: updateContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete one ActiveTrail contact by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for deleting an ActiveTrail contact.", "The ActiveTrail contact ID."),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List ActiveTrail groups with optional search and pagination filters.",
    requiredScopes: [],
    inputSchema: listGroupsInputSchema,
    outputSchema: listGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Fetch one ActiveTrail group by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for fetching an ActiveTrail group.", "The ActiveTrail group ID."),
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create an ActiveTrail group.",
    requiredScopes: [],
    inputSchema: groupPayloadSchema,
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_group",
    description: "Update an ActiveTrail group name.",
    requiredScopes: [],
    inputSchema: updateGroupInputSchema,
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_group",
    description: "Delete one ActiveTrail group by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for deleting an ActiveTrail group.", "The ActiveTrail group ID."),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_group_members",
    description: "List members in an ActiveTrail group with optional filters.",
    requiredScopes: [],
    inputSchema: listGroupMembersInputSchema,
    outputSchema: listGroupMembersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_group_member",
    description: "Add or update a contact inside an ActiveTrail group.",
    requiredScopes: [],
    inputSchema: addGroupMemberInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_group_member",
    description: "Remove one contact from an ActiveTrail group.",
    requiredScopes: [],
    inputSchema: removeGroupMemberInputSchema,
    outputSchema: deleteOutputSchema,
  }),
];

function requireEmailOrSms(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    anyOf: [
      {
        required: ["email"],
        properties: {
          email: nonEmptyStringSchema("The contact email address."),
        },
      },
      {
        required: ["sms"],
        properties: {
          sms: nonEmptyStringSchema("The contact SMS value."),
        },
      },
    ],
  };
}
