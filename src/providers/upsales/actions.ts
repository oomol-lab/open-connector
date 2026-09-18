import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "upsales" as const;

const idField = (description: string) => s.positiveInteger(description);
const limitField = s.integer("Maximum number of records to return, from 1 to 2000.", {
  minimum: 1,
  maximum: 2000,
});
const offsetField = s.nonNegativeInteger("Number of records to skip before returning results.");
const filtersField = s.record(
  "Additional Upsales filter query parameters keyed by official API field name, such as user.id or scoreUpdateDate.",
  s.unknown("The filter value to send as an Upsales query parameter."),
);
const rawPayloadField = s.unknown("Raw Upsales response payload.");
const rawEntitySchema = s.looseObject("Raw Upsales entity fields returned by the API.");
const companyPayloadSchema = s.looseObject(
  "Upsales company JSON payload using official account fields such as name, phone, webpage, users, or custom.",
);
const contactPayloadSchema = s.looseObject(
  "Upsales contact JSON payload using official contact fields such as firstName, lastName, name, email, phone, title, active, client, or custom.",
);

const paginatedInputShape = {
  limit: limitField,
  offset: offsetField,
  filters: filtersField,
};

const getCurrentUserInputSchema = s.object("No input is required to read the current Upsales user.", {});

const listUsersInputSchema = s.object("Request parameters for listing Upsales users.", paginatedInputShape, {
  optional: ["limit", "offset", "filters"],
});

const getUserInputSchema = s.object("Request parameters for reading one Upsales user.", {
  id: idField("The Upsales user ID."),
});

const listCompaniesInputSchema = s.object(
  "Request parameters for listing Upsales companies.",
  {
    ...paginatedInputShape,
    includeExternal: s.boolean("Whether to include external companies in the result set."),
  },
  {
    optional: ["limit", "offset", "filters", "includeExternal"],
  },
);

const getCompanyInputSchema = s.object("Request parameters for reading one Upsales company.", {
  id: idField("The Upsales company ID."),
});

const createCompanyInputSchema = s.object("Request parameters for creating an Upsales company.", {
  company: companyPayloadSchema,
});

const updateCompanyInputSchema = s.object("Request parameters for updating an Upsales company.", {
  id: idField("The Upsales company ID."),
  company: companyPayloadSchema,
});

const deleteCompanyInputSchema = s.object("Request parameters for deleting an Upsales company.", {
  id: idField("The Upsales company ID."),
});

const listContactsInputSchema = s.object("Request parameters for listing Upsales contacts.", paginatedInputShape, {
  optional: ["limit", "offset", "filters"],
});

const getContactInputSchema = s.object("Request parameters for reading one Upsales contact.", {
  id: idField("The Upsales contact ID."),
});

const createContactInputSchema = s.object(
  "Request parameters for creating an Upsales contact.",
  {
    contact: contactPayloadSchema,
    usingFirstnameLastname: s.boolean(
      "Whether Upsales should interpret firstName and lastName fields when creating the contact.",
    ),
  },
  {
    optional: ["usingFirstnameLastname"],
  },
);

const updateContactInputSchema = s.object(
  "Request parameters for updating an Upsales contact.",
  {
    id: idField("The Upsales contact ID."),
    contact: contactPayloadSchema,
    usingFirstnameLastname: s.boolean(
      "Whether Upsales should interpret firstName and lastName fields when updating the contact.",
    ),
  },
  {
    optional: ["usingFirstnameLastname"],
  },
);

const deleteContactInputSchema = s.object("Request parameters for deleting an Upsales contact.", {
  id: idField("The Upsales contact ID."),
});

const currentUserOutputSchema = s.object("Current Upsales user response.", {
  user: rawEntitySchema,
  raw: rawPayloadField,
});

const listUsersOutputSchema = s.object("Upsales users list response.", {
  users: s.array("Upsales users returned by the API.", rawEntitySchema),
  raw: rawPayloadField,
});

const userOutputSchema = s.object("Single Upsales user response.", {
  user: rawEntitySchema,
  raw: rawPayloadField,
});

const listCompaniesOutputSchema = s.object("Upsales companies list response.", {
  companies: s.array("Upsales companies returned by the API.", rawEntitySchema),
  raw: rawPayloadField,
});

const companyOutputSchema = s.object("Single Upsales company response.", {
  company: rawEntitySchema,
  raw: rawPayloadField,
});

const listContactsOutputSchema = s.object("Upsales contacts list response.", {
  contacts: s.array("Upsales contacts returned by the API.", rawEntitySchema),
  raw: rawPayloadField,
});

const contactOutputSchema = s.object("Single Upsales contact response.", {
  contact: rawEntitySchema,
  raw: rawPayloadField,
});

const deleteOutputSchema = s.object("Upsales delete response.", {
  success: s.boolean("Whether the delete request completed with a successful HTTP status."),
  raw: rawPayloadField,
});

export const upsalesActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Read the Upsales user associated with the authenticated API token.",
    requiredScopes: [],
    inputSchema: getCurrentUserInputSchema,
    outputSchema: currentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Upsales users with optional pagination and official query filters.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Read one Upsales user by ID.",
    requiredScopes: [],
    inputSchema: getUserInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_companies",
    operationType: "read",
    description: "List Upsales companies with optional pagination and official query filters.",
    requiredScopes: [],
    followUpActions: ["upsales.get_company", "upsales.create_contact"],
    inputSchema: listCompaniesInputSchema,
    outputSchema: listCompaniesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Read one Upsales company by ID.",
    requiredScopes: [],
    followUpActions: ["upsales.update_company", "upsales.delete_company"],
    inputSchema: getCompanyInputSchema,
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_company",
    operationType: "write",
    description: "Create an Upsales company using the official accounts endpoint.",
    requiredScopes: [],
    followUpActions: ["upsales.get_company"],
    inputSchema: createCompanyInputSchema,
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_company",
    operationType: "write",
    description: "Update an Upsales company by ID using the official accounts endpoint.",
    requiredScopes: [],
    followUpActions: ["upsales.get_company"],
    inputSchema: updateCompanyInputSchema,
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_company",
    operationType: "destructive",
    description: "Delete an Upsales company by ID.",
    requiredScopes: [],
    inputSchema: deleteCompanyInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Upsales contacts with optional pagination and official query filters.",
    requiredScopes: [],
    followUpActions: ["upsales.get_contact", "upsales.update_contact"],
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Read one Upsales contact by ID.",
    requiredScopes: [],
    followUpActions: ["upsales.update_contact", "upsales.delete_contact"],
    inputSchema: getContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create an Upsales contact using the official contacts endpoint.",
    requiredScopes: [],
    followUpActions: ["upsales.get_contact"],
    inputSchema: createContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update an Upsales contact by ID using the official contacts endpoint.",
    requiredScopes: [],
    followUpActions: ["upsales.get_contact"],
    inputSchema: updateContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete an Upsales contact by ID.",
    requiredScopes: [],
    inputSchema: deleteContactInputSchema,
    outputSchema: deleteOutputSchema,
  }),
];
