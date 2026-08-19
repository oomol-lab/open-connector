import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sage_sales_management" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const idSchema = s.positiveInteger("The Sage Sales Management resource identifier.");
const rawPayloadSchema = s.unknown("The raw Sage Sales Management response payload.");

const listInputSchema = s.object(
  "Filters, ordering, and pagination for listing Sage Sales Management resources.",
  {
    page: s.nonNegativeInteger("The zero-based page number to request."),
    count: s.positiveInteger("The number of records to return in the page."),
    where: nonEmptyString("The official Sage Sales Management SQL-like where filter."),
    order: nonEmptyString("The official Sage Sales Management order expression."),
    lang: nonEmptyString("The response language code requested from Sage Sales Management."),
    extraFieldDescription: s.boolean(
      "Whether Sage Sales Management should include extra field descriptions in each record.",
    ),
  },
  {
    optional: ["page", "count", "where", "order", "lang", "extraFieldDescription"],
  },
);

const idInputSchema = s.object("The Sage Sales Management resource identifier input.", {
  id: idSchema,
});

function writeInputSchema(resourceName: string) {
  return s.object(`Fields for creating a Sage Sales Management ${resourceName}.`, {
    data: s.looseObject(`Official Sage Sales Management ${resourceName} fields to send as the request body.`),
  });
}

function updateInputSchema(resourceName: string) {
  return s.object(`Fields for updating a Sage Sales Management ${resourceName}.`, {
    id: idSchema,
    data: s.looseObject(`Official Sage Sales Management ${resourceName} fields to send as the request body.`),
  });
}

const schemaOutputSchema = s.object("A Sage Sales Management resource schema response.", {
  schema: s.looseObject("The official Sage Sales Management schema object."),
  raw: rawPayloadSchema,
});

function listOutputSchema(resourceName: string, outputKey: string) {
  return s.object(`The Sage Sales Management ${resourceName} list response.`, {
    [outputKey]: s.array(
      `The Sage Sales Management ${resourceName} records returned by the API.`,
      s.looseObject(`One Sage Sales Management ${resourceName} record.`),
    ),
    raw: rawPayloadSchema,
  });
}

function recordOutputSchema(resourceName: string, outputKey: string) {
  return s.object(`The Sage Sales Management ${resourceName} response.`, {
    [outputKey]: s.looseObject(`The Sage Sales Management ${resourceName} record.`),
    raw: rawPayloadSchema,
  });
}

const deleteOutputSchema = s.object("The Sage Sales Management delete response.", {
  ok: s.boolean("Whether Sage Sales Management accepted the delete request."),
  status: s.integer("The HTTP status returned by Sage Sales Management."),
  raw: rawPayloadSchema,
});

const getAccountsSchemaAction = defineProviderAction(service, {
  name: "get_accounts_schema",
  description: "Get the Sage Sales Management Accounts schema metadata.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting the Accounts schema.", {}),
  outputSchema: schemaOutputSchema,
});

const listAccountsAction = defineProviderAction(service, {
  name: "list_accounts",
  description: "List Sage Sales Management accounts with optional filters and pagination.",
  requiredScopes: [],
  inputSchema: listInputSchema,
  outputSchema: listOutputSchema("account", "accounts"),
});

const getAccountAction = defineProviderAction(service, {
  name: "get_account",
  description: "Get one Sage Sales Management account by ID.",
  requiredScopes: [],
  inputSchema: idInputSchema,
  outputSchema: recordOutputSchema("account", "account"),
});

const createAccountAction = defineProviderAction(service, {
  name: "create_account",
  description: "Create one Sage Sales Management account.",
  requiredScopes: [],
  inputSchema: writeInputSchema("account"),
  outputSchema: recordOutputSchema("account", "account"),
});

const updateAccountAction = defineProviderAction(service, {
  name: "update_account",
  description: "Update one Sage Sales Management account by ID.",
  requiredScopes: [],
  inputSchema: updateInputSchema("account"),
  outputSchema: recordOutputSchema("account", "account"),
});

const deleteAccountAction = defineProviderAction(service, {
  name: "delete_account",
  description: "Delete one Sage Sales Management account by ID.",
  requiredScopes: [],
  inputSchema: idInputSchema,
  outputSchema: deleteOutputSchema,
});

const getContactsSchemaAction = defineProviderAction(service, {
  name: "get_contacts_schema",
  description: "Get the Sage Sales Management Contacts schema metadata.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting the Contacts schema.", {}),
  outputSchema: schemaOutputSchema,
});

const listContactsAction = defineProviderAction(service, {
  name: "list_contacts",
  description: "List Sage Sales Management contacts with optional filters and pagination.",
  requiredScopes: [],
  inputSchema: listInputSchema,
  outputSchema: listOutputSchema("contact", "contacts"),
});

const getContactAction = defineProviderAction(service, {
  name: "get_contact",
  description: "Get one Sage Sales Management contact by ID.",
  requiredScopes: [],
  inputSchema: idInputSchema,
  outputSchema: recordOutputSchema("contact", "contact"),
});

const createContactAction = defineProviderAction(service, {
  name: "create_contact",
  description: "Create one Sage Sales Management contact.",
  requiredScopes: [],
  inputSchema: writeInputSchema("contact"),
  outputSchema: recordOutputSchema("contact", "contact"),
});

const updateContactAction = defineProviderAction(service, {
  name: "update_contact",
  description: "Update one Sage Sales Management contact by ID.",
  requiredScopes: [],
  inputSchema: updateInputSchema("contact"),
  outputSchema: recordOutputSchema("contact", "contact"),
});

const deleteContactAction = defineProviderAction(service, {
  name: "delete_contact",
  description: "Delete one Sage Sales Management contact by ID.",
  requiredScopes: [],
  inputSchema: idInputSchema,
  outputSchema: deleteOutputSchema,
});

const getOpportunitiesSchemaAction = defineProviderAction(service, {
  name: "get_opportunities_schema",
  description: "Get the Sage Sales Management Opportunities schema metadata.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting the Opportunities schema.", {}),
  outputSchema: schemaOutputSchema,
});

const listOpportunitiesAction = defineProviderAction(service, {
  name: "list_opportunities",
  description: "List Sage Sales Management opportunities with optional filters and pagination.",
  requiredScopes: [],
  inputSchema: listInputSchema,
  outputSchema: listOutputSchema("opportunity", "opportunities"),
});

const getOpportunityAction = defineProviderAction(service, {
  name: "get_opportunity",
  description: "Get one Sage Sales Management opportunity by ID.",
  requiredScopes: [],
  inputSchema: idInputSchema,
  outputSchema: recordOutputSchema("opportunity", "opportunity"),
});

const createOpportunityAction = defineProviderAction(service, {
  name: "create_opportunity",
  description: "Create one Sage Sales Management opportunity.",
  requiredScopes: [],
  inputSchema: writeInputSchema("opportunity"),
  outputSchema: recordOutputSchema("opportunity", "opportunity"),
});

const updateOpportunityAction = defineProviderAction(service, {
  name: "update_opportunity",
  description: "Update one Sage Sales Management opportunity by ID.",
  requiredScopes: [],
  inputSchema: updateInputSchema("opportunity"),
  outputSchema: recordOutputSchema("opportunity", "opportunity"),
});

const deleteOpportunityAction = defineProviderAction(service, {
  name: "delete_opportunity",
  description: "Delete one Sage Sales Management opportunity by ID.",
  requiredScopes: [],
  inputSchema: idInputSchema,
  outputSchema: deleteOutputSchema,
});

export const sageSalesManagementActions: ActionDefinition[] = [
  getAccountsSchemaAction,
  listAccountsAction,
  getAccountAction,
  createAccountAction,
  updateAccountAction,
  deleteAccountAction,
  getContactsSchemaAction,
  listContactsAction,
  getContactAction,
  createContactAction,
  updateContactAction,
  deleteContactAction,
  getOpportunitiesSchemaAction,
  listOpportunitiesAction,
  getOpportunityAction,
  createOpportunityAction,
  updateOpportunityAction,
  deleteOpportunityAction,
];
