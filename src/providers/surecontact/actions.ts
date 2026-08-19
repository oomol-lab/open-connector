import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "surecontact" as const;

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const emailString = (description: string) => s.email(description);

const pageInput = {
  page: s.integer("Page number to request from SureContact.", { minimum: 1 }),
  perPage: s.integer("Number of records to request per page.", { minimum: 1, maximum: 100 }),
};

const uuidField = (description: string) =>
  s.string(description, {
    minLength: 1,
  });

const paginationSchema = s.looseObject("SureContact pagination metadata.", {
  current_page: s.integer("Current page number returned by SureContact."),
  per_page: s.integer("Number of records per page returned by SureContact."),
  total: s.integer("Total record count returned by SureContact."),
  last_page: s.integer("Last page number returned by SureContact."),
});

const contactSchema = s.looseObject("A SureContact contact record.", {
  uuid: s.string("SureContact contact UUID."),
  email: s.nullable(s.string("Contact email address.")),
  first_name: s.nullable(s.string("Contact first name.")),
  last_name: s.nullable(s.string("Contact last name.")),
  status: s.nullable(s.string("Contact subscription status.")),
});

const listSchema = s.looseObject("A SureContact list record.", {
  uuid: s.string("SureContact list UUID."),
  name: s.string("List name."),
  type: s.nullable(s.string("List type returned by SureContact.")),
  contacts_count: s.nullable(s.integer("Number of contacts in the list.")),
});

const tagSchema = s.looseObject("A SureContact tag record.", {
  uuid: s.string("SureContact tag UUID."),
  name: s.string("Tag name."),
  contacts_count: s.nullable(s.integer("Number of contacts assigned to the tag.")),
});

const customFieldsSchema = s.record(
  "Custom contact fields keyed by SureContact field identifier.",
  s.unknown("Custom contact field value."),
);

const contactWriteFields = {
  email: emailString("Contact email address."),
  firstName: nonEmptyString("Contact first name."),
  lastName: nonEmptyString("Contact last name."),
  phone: nonEmptyString("Contact phone number."),
  status: s.stringEnum("Contact subscription status.", ["subscribed", "unsubscribed", "pending"]),
  customFields: customFieldsSchema,
};

const createContactInputSchema = s.object(
  "Input for creating a SureContact contact.",
  {
    ...contactWriteFields,
    listUuids: s.array("SureContact list UUIDs to attach to the contact.", uuidField("A SureContact list UUID."), {
      minItems: 1,
    }),
    tagUuids: s.array("SureContact tag UUIDs to attach to the contact.", uuidField("A SureContact tag UUID."), {
      minItems: 1,
    }),
  },
  {
    optional: ["firstName", "lastName", "phone", "status", "customFields", "listUuids", "tagUuids"],
  },
);

const updateContactInputSchema = s.object(
  "Input for updating a SureContact contact.",
  {
    contactUuid: uuidField("The SureContact contact UUID to update."),
    ...contactWriteFields,
  },
  {
    optional: ["email", "firstName", "lastName", "phone", "status", "customFields"],
  },
);

const upsertContactInputSchema = s.object(
  "Input for creating or updating a SureContact contact by email.",
  {
    ...contactWriteFields,
    listUuids: s.array("SureContact list UUIDs to attach to the contact.", uuidField("A SureContact list UUID."), {
      minItems: 1,
    }),
    tagUuids: s.array("SureContact tag UUIDs to attach to the contact.", uuidField("A SureContact tag UUID."), {
      minItems: 1,
    }),
  },
  {
    optional: ["firstName", "lastName", "phone", "status", "customFields", "listUuids", "tagUuids"],
  },
);

const contactOutputSchema = s.object("A SureContact contact response.", {
  contact: contactSchema,
  raw: s.unknown("Raw SureContact contact response."),
});

const listContactsInputSchema = s.object(
  "Input for listing SureContact contacts.",
  {
    ...pageInput,
    search: nonEmptyString("Search term used to filter contacts."),
    status: s.stringEnum("Contact status filter.", ["subscribed", "unsubscribed", "pending"]),
    listUuid: uuidField("Return contacts attached to this SureContact list UUID."),
    tagUuid: uuidField("Return contacts attached to this SureContact tag UUID."),
  },
  { optional: ["page", "perPage", "search", "status", "listUuid", "tagUuid"] },
);

const listContactsOutputSchema = s.object("A page of SureContact contacts.", {
  contacts: s.array("Contacts returned by SureContact.", contactSchema),
  pagination: s.nullable(paginationSchema),
  raw: s.unknown("Raw SureContact contacts response."),
});

const attachResourcesInputSchema = s.object("Input for attaching SureContact resources.", {
  contactUuid: uuidField("The SureContact contact UUID."),
  uuids: s.array("SureContact resource UUIDs to attach.", uuidField("A SureContact resource UUID."), {
    minItems: 1,
  }),
});

const listTagsOrListsInputSchema = s.object(
  "Input for listing SureContact resources.",
  {
    ...pageInput,
    search: nonEmptyString("Search term used to filter resources."),
  },
  { optional: ["page", "perPage", "search"] },
);

const getByUuidInputSchema = (description: string, fieldDescription: string) =>
  s.object(description, {
    uuid: uuidField(fieldDescription),
  });

const listOutputSchema = s.object("A page of SureContact lists.", {
  lists: s.array("Lists returned by SureContact.", listSchema),
  pagination: s.nullable(paginationSchema),
  raw: s.unknown("Raw SureContact lists response."),
});

const tagListOutputSchema = s.object("A page of SureContact tags.", {
  tags: s.array("Tags returned by SureContact.", tagSchema),
  pagination: s.nullable(paginationSchema),
  raw: s.unknown("Raw SureContact tags response."),
});

const listOutputSingleSchema = s.object("A SureContact list response.", {
  list: listSchema,
  raw: s.unknown("Raw SureContact list response."),
});

const tagOutputSingleSchema = s.object("A SureContact tag response.", {
  tag: tagSchema,
  raw: s.unknown("Raw SureContact tag response."),
});

const createListInputSchema = s.object(
  "Input for creating a SureContact list.",
  {
    name: nonEmptyString("List name."),
    description: nonEmptyString("List description."),
  },
  { optional: ["description"] },
);

const updateListInputSchema = s.object(
  "Input for updating a SureContact list.",
  {
    listUuid: uuidField("The SureContact list UUID to update."),
    name: nonEmptyString("List name."),
    description: nonEmptyString("List description."),
  },
  { optional: ["name", "description"] },
);

const listContactMutationInputSchema = s.object("Input for changing list contact membership.", {
  listUuid: uuidField("The SureContact list UUID."),
  contactUuids: s.array("SureContact contact UUIDs to add or remove.", uuidField("A SureContact contact UUID."), {
    minItems: 1,
  }),
});

const createTagInputSchema = s.object(
  "Input for creating a SureContact tag.",
  {
    name: nonEmptyString("Tag name."),
  },
  { optional: [] },
);

const updateTagInputSchema = s.object(
  "Input for updating a SureContact tag.",
  {
    tagUuid: uuidField("The SureContact tag UUID to update."),
    name: nonEmptyString("Tag name."),
  },
  { optional: ["name"] },
);

const mutationOutputSchema = s.object("SureContact mutation response.", {
  success: s.boolean("Whether SureContact reported the operation as successful."),
  message: s.nullable(s.string("SureContact response message.")),
  raw: s.unknown("Raw SureContact mutation response."),
});

export const surecontactActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List SureContact contacts with optional search, status, list, tag, and pagination filters.",
    requiredScopes: [],
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one SureContact contact by UUID.",
    requiredScopes: [],
    inputSchema: getByUuidInputSchema("Input for retrieving a SureContact contact.", "The SureContact contact UUID."),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact_by_email",
    description: "Retrieve one SureContact contact by email address.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a SureContact contact by email.", {
      email: emailString("The contact email address."),
    }),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a SureContact contact and optionally attach lists or tags.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_contact",
    description: "Create or update a SureContact contact by email address.",
    requiredScopes: [],
    inputSchema: upsertContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a SureContact contact by UUID.",
    requiredScopes: [],
    inputSchema: updateContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a SureContact contact by UUID.",
    requiredScopes: [],
    inputSchema: getByUuidInputSchema("Input for deleting a SureContact contact.", "The SureContact contact UUID."),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "attach_contact_tags",
    description: "Attach one or more SureContact tags to a contact.",
    requiredScopes: [],
    inputSchema: attachResourcesInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "detach_contact_tags",
    description: "Detach one or more SureContact tags from a contact.",
    requiredScopes: [],
    inputSchema: attachResourcesInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "attach_contact_lists",
    description: "Attach one or more SureContact lists to a contact.",
    requiredScopes: [],
    inputSchema: attachResourcesInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "detach_contact_lists",
    description: "Detach one or more SureContact lists from a contact.",
    requiredScopes: [],
    inputSchema: attachResourcesInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List SureContact lists with optional search and pagination filters.",
    requiredScopes: [],
    inputSchema: listTagsOrListsInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Retrieve one SureContact list by UUID.",
    requiredScopes: [],
    inputSchema: getByUuidInputSchema("Input for retrieving a SureContact list.", "The SureContact list UUID."),
    outputSchema: listOutputSingleSchema,
  }),
  defineProviderAction(service, {
    name: "create_list",
    description: "Create a SureContact list.",
    requiredScopes: [],
    inputSchema: createListInputSchema,
    outputSchema: listOutputSingleSchema,
  }),
  defineProviderAction(service, {
    name: "update_list",
    description: "Update a SureContact list by UUID.",
    requiredScopes: [],
    inputSchema: updateListInputSchema,
    outputSchema: listOutputSingleSchema,
  }),
  defineProviderAction(service, {
    name: "delete_list",
    description: "Delete a SureContact list by UUID.",
    requiredScopes: [],
    inputSchema: getByUuidInputSchema("Input for deleting a SureContact list.", "The SureContact list UUID."),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_contacts_to_list",
    description: "Add one or more SureContact contacts to a list.",
    requiredScopes: [],
    inputSchema: listContactMutationInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_contacts_from_list",
    description: "Remove one or more SureContact contacts from a list.",
    requiredScopes: [],
    inputSchema: listContactMutationInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List SureContact tags with optional search and pagination filters.",
    requiredScopes: [],
    inputSchema: listTagsOrListsInputSchema,
    outputSchema: tagListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tag",
    description: "Retrieve one SureContact tag by UUID.",
    requiredScopes: [],
    inputSchema: getByUuidInputSchema("Input for retrieving a SureContact tag.", "The SureContact tag UUID."),
    outputSchema: tagOutputSingleSchema,
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create a SureContact tag.",
    requiredScopes: [],
    inputSchema: createTagInputSchema,
    outputSchema: tagOutputSingleSchema,
  }),
  defineProviderAction(service, {
    name: "update_tag",
    description: "Update a SureContact tag by UUID.",
    requiredScopes: [],
    inputSchema: updateTagInputSchema,
    outputSchema: tagOutputSingleSchema,
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete a SureContact tag by UUID.",
    requiredScopes: [],
    inputSchema: getByUuidInputSchema("Input for deleting a SureContact tag.", "The SureContact tag UUID."),
    outputSchema: mutationOutputSchema,
  }),
];
