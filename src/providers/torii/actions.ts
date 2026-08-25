import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "torii";

const nonEmptyStringSchema = (description: string): JsonSchema => s.nonEmptyString(description);
const positiveIntegerSchema = (description: string): JsonSchema =>
  s.positiveInteger(description, { maximum: 2147483647 });

const pageSizeSchema = s.integer("The maximum number of results to return.", {
  minimum: 1,
  maximum: 1000,
});
const cursorSchema = nonEmptyStringSchema("The Torii nextCursor value returned from the previous page.");
const fieldsSchema = nonEmptyStringSchema("A comma-separated list of fields to return.");
const querySchema = nonEmptyStringSchema("A free-text search query.");
const sortSchema = nonEmptyStringSchema("A comma-separated list of fields to sort by, suffixed with :asc or :desc.");
const jsonQuerySchema = (description: string): JsonSchema =>
  s.anyOf(description, [
    nonEmptyStringSchema(`${description} Provide a JSON-encoded string.`),
    s.looseObject(`${description} Provide a JSON object and the connector will encode it.`),
    s.array(
      `${description} Provide a JSON array and the connector will encode it.`,
      s.looseObject("A Torii filter or aggregation object."),
    ),
  ]);

const paginationInputFields = {
  fields: fieldsSchema,
  q: querySchema,
  sort: sortSchema,
  size: pageSizeSchema,
  cursor: cursorSchema,
  aggs: jsonQuerySchema("Torii aggregation configuration."),
  filters: jsonQuerySchema("Torii filters expression."),
};

const apiVersionSchema = s.stringEnum("The Torii contracts API version header to send.", ["1.0", "1.1"]);

const toriiObjectSchema = (description: string, properties: Record<string, JsonSchema> = {}): JsonSchema =>
  s.looseObject(description, properties);

const organizationSchema = toriiObjectSchema("A Torii organization object.", {
  id: s.integer("The Torii organization identifier."),
  companyName: s.string("The organization company name."),
  domain: s.string("The organization domain."),
  creationTime: s.string("The organization creation timestamp."),
});

const appSchema = toriiObjectSchema("A Torii app object.", {
  id: s.integer("The Torii app identifier."),
  name: s.string("The app name."),
  state: s.string("The app lifecycle state."),
  url: s.string("The app URL."),
  category: s.string("The app category."),
});

const userSchema = toriiObjectSchema("A Torii user object.", {
  id: s.integer("The Torii user identifier."),
  firstName: s.string("The user's first name."),
  lastName: s.string("The user's last name."),
  email: s.string("The user's primary email address."),
  lifecycleStatus: s.string("The user's lifecycle status."),
});

const contractSchema = toriiObjectSchema("A Torii contract object.", {
  id: s.integer("The Torii contract identifier."),
  idApp: s.integer("The Torii app identifier linked to the contract."),
  name: s.string("The contract name."),
  status: s.string("The contract status."),
});

const transactionSchema = toriiObjectSchema("A Torii transaction object.", {
  id: s.integer("The Torii transaction identifier."),
  idApp: s.integer("The Torii app identifier linked to the transaction."),
  transactionDate: s.string("The transaction date."),
  amount: toriiObjectSchema("The transaction amount object."),
  source: s.string("The transaction source."),
  description: s.string("The transaction description."),
});

const workflowSchema = toriiObjectSchema("A Torii workflow object.", {
  id: s.integer("The Torii workflow identifier."),
  version: s.string("The workflow schema version."),
  name: s.string("The workflow name."),
  type: s.string("The workflow type."),
});

const listOutputSchema = (description: string, itemName: string, itemSchema: JsonSchema): JsonSchema =>
  s.object(description, {
    [itemName]: s.array(`The ${itemName} returned by Torii.`, itemSchema),
    count: s.nullable(s.integer("The number of results returned in this response.")),
    total: s.nullable(s.integer("The total number of matching results.")),
    nextCursor: s.nullable(s.string("The cursor for the next result page, or null when there are no more results.")),
    raw: s.looseObject("The raw Torii response object."),
  });

export const toriiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_organization",
    description: "Retrieve the Torii organization profile for the current API key.",
    inputSchema: s.object("The input payload for retrieving the current Torii organization.", {}),
    outputSchema: s.object("The response returned when retrieving the current Torii organization.", {
      organization: organizationSchema,
      raw: s.looseObject("The raw Torii response object."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_apps",
    description: "List Torii apps with optional search, filters, and cursor pagination.",
    inputSchema: s.object(
      "The input payload for listing Torii apps.",
      {
        ...paginationInputFields,
        includeLicenses: s.boolean("Whether to include aggregated license summaries for each app."),
      },
      {
        optional: ["fields", "q", "sort", "size", "cursor", "aggs", "filters", "includeLicenses"],
      },
    ),
    outputSchema: listOutputSchema("The response returned when listing Torii apps.", "apps", appSchema),
  }),
  defineProviderAction(service, {
    name: "get_app",
    description: "Retrieve one Torii app by app identifier.",
    inputSchema: s.object(
      "The input payload for retrieving one Torii app.",
      {
        appId: positiveIntegerSchema("The Torii app identifier."),
        fields: fieldsSchema,
        includeLicenses: s.boolean("Whether to include the aggregated license summary for the app."),
      },
      { optional: ["fields", "includeLicenses"] },
    ),
    outputSchema: s.object("The response returned when retrieving one Torii app.", {
      app: appSchema,
      raw: s.looseObject("The raw Torii response object."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Torii users with optional filters, search, and cursor pagination.",
    inputSchema: s.object(
      "The input payload for listing Torii users.",
      {
        email: s.email("The user email address to filter by."),
        lifecycleStatus: s.stringEnum("The user lifecycle status to filter by.", [
          "active",
          "offboarding",
          "offboarded",
        ]),
        isDeletedInIdentitySources: s.boolean("Whether to filter users deleted in identity sources."),
        isExternal: s.boolean("Whether to filter external users."),
        firstName: nonEmptyStringSchema("The first name to filter by."),
        lastName: nonEmptyStringSchema("The last name to filter by."),
        idUsers: nonEmptyStringSchema("A comma-separated list of up to 50 Torii user identifiers."),
        view: s.stringEnum("The Torii users view to query.", [
          "currentEmployees",
          "pastEmployees",
          "allEmployees",
          "currentUsers",
          "pastUsers",
          "allUsers",
          "currentNonHumanUsers",
          "pastNonHumanUsers",
          "allNonHumanUsers",
          "externalUsers",
        ]),
        ...paginationInputFields,
      },
      {
        optional: [
          "email",
          "lifecycleStatus",
          "isDeletedInIdentitySources",
          "isExternal",
          "firstName",
          "lastName",
          "idUsers",
          "view",
          "fields",
          "q",
          "sort",
          "size",
          "cursor",
          "aggs",
          "filters",
        ],
      },
    ),
    outputSchema: listOutputSchema("The response returned when listing Torii users.", "users", userSchema),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve one Torii user by user identifier.",
    inputSchema: s.object("The input payload for retrieving one Torii user.", {
      userId: positiveIntegerSchema("The Torii user identifier."),
    }),
    outputSchema: s.object("The response returned when retrieving one Torii user.", {
      user: userSchema,
      raw: s.looseObject("The raw Torii response object."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contracts",
    description: "List Torii contracts with optional API version, filters, and pagination.",
    inputSchema: s.object(
      "The input payload for listing Torii contracts.",
      {
        apiVersion: apiVersionSchema,
        ...paginationInputFields,
        filterFields: s.looseObject(
          "Exact-match Torii contract filters keyed by contract field or custom field system key.",
        ),
      },
      {
        optional: ["apiVersion", "fields", "q", "sort", "size", "cursor", "aggs", "filters", "filterFields"],
      },
    ),
    outputSchema: listOutputSchema("The response returned when listing Torii contracts.", "contracts", contractSchema),
  }),
  defineProviderAction(service, {
    name: "get_contract",
    description: "Retrieve one Torii contract by contract identifier.",
    inputSchema: s.object(
      "The input payload for retrieving one Torii contract.",
      {
        contractId: positiveIntegerSchema("The Torii contract identifier."),
        apiVersion: apiVersionSchema,
        fields: fieldsSchema,
      },
      { optional: ["apiVersion", "fields"] },
    ),
    outputSchema: s.object("The response returned when retrieving one Torii contract.", {
      contract: contractSchema,
      raw: s.looseObject("The raw Torii response object."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    description: "List recognized Torii expense transactions with optional filters and pagination.",
    inputSchema: s.object(
      "The input payload for listing Torii transactions.",
      {
        idApp: positiveIntegerSchema("The Torii app identifier to filter transactions by."),
        source: nonEmptyStringSchema("The transaction source to filter by."),
        q: s.string("A free-text search query for transaction descriptions.", { minLength: 1, maxLength: 800 }),
        mappingStatus: nonEmptyStringSchema("A comma-separated list of Torii transaction mapping statuses."),
        sort: sortSchema,
        size: pageSizeSchema,
        cursor: cursorSchema,
        fields: fieldsSchema,
      },
      {
        optional: ["idApp", "source", "q", "mappingStatus", "sort", "size", "cursor", "fields"],
      },
    ),
    outputSchema: listOutputSchema(
      "The response returned when listing Torii transactions.",
      "transactions",
      transactionSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "list_workflows",
    description: "List Torii regular workflows for the organization.",
    inputSchema: s.object(
      "The input payload for listing Torii workflows.",
      {
        type: s.stringEnum("The workflow type to query. Torii currently supports regular.", ["regular"]),
      },
      { optional: ["type"] },
    ),
    outputSchema: s.object("The response returned when listing Torii workflows.", {
      workflows: s.array("The workflows returned by Torii.", workflowSchema),
      raw: s.looseObject("The raw Torii response object."),
    }),
  }),
];
