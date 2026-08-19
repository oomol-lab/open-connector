import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lightfield";

const pageLimit = s.integer("Maximum number of records to return. Lightfield allows 1 to 25.", {
  minimum: 1,
  maximum: 25,
});
const pageOffset = s.integer("Number of records to skip for offset pagination.", { minimum: 0 });
const filterValueSchema = s.anyOf("A Lightfield list filter value.", [
  s.string("A string filter value."),
  s.number("A numeric filter value."),
  s.boolean("A boolean filter value."),
]);
const filtersSchema = s.record(
  "Lightfield filter query parameters keyed by raw field expression, such as $email[contains].",
  filterValueSchema,
);

const listInputSchema = s.object(
  "Pagination and filtering parameters for a Lightfield list endpoint.",
  {
    limit: pageLimit,
    offset: pageOffset,
    filters: filtersSchema,
  },
  { optional: ["limit", "offset", "filters"] },
);

const customObjectListInputSchema = s.object(
  "Pagination and filtering parameters for listing a custom object type.",
  {
    entitySlug: s.nonEmptyString("The custom object type slug."),
    limit: pageLimit,
    offset: pageOffset,
    filters: filtersSchema,
  },
  { optional: ["limit", "offset", "filters"] },
);

const idInputSchema = s.object(
  "Identifier for retrieving a Lightfield record.",
  {
    id: s.nonEmptyString("The Lightfield record ID to retrieve."),
  },
  { required: ["id"] },
);

const customObjectRetrieveInputSchema = s.object(
  "Identifier for retrieving a custom object record.",
  {
    entitySlug: s.nonEmptyString("The custom object type slug."),
    id: s.nonEmptyString("The Lightfield record ID to retrieve."),
  },
  { required: ["entitySlug", "id"] },
);

const apiKeyMetadataSchema = s.object(
  "Metadata for the current Lightfield API key.",
  {
    active: s.boolean("Whether Lightfield reported the API key as active."),
    scopes: s.array("Granted public scopes for the API key.", s.string("A granted scope.")),
    subjectType: s.stringEnum("Whether the API key belongs to a user or workspace.", ["user", "workspace"]),
    tokenType: s.stringEnum("Credential family reported by Lightfield.", ["api_key"]),
  },
  { required: ["active", "scopes", "subjectType", "tokenType"] },
);

const fieldSchema = s.looseObject("A typed Lightfield field value.", {
  value: s.unknown("The field value returned by Lightfield."),
  valueType: s.string("The Lightfield field value type."),
});

const relationshipSchema = s.looseObject("A Lightfield relationship value.", {
  cardinality: s.string("Whether the relationship is has_one or has_many."),
  objectType: s.string("The related object type."),
  values: s.array("Related record IDs.", s.string("A related record ID.")),
});

const recordSchema = s.looseObject("A Lightfield CRM record with dynamic fields and relationships.", {
  id: s.string("Unique Lightfield record ID."),
  createdAt: s.string("ISO 8601 timestamp when the record was created."),
  updatedAt: s.nullableString("ISO 8601 timestamp when the record was last updated."),
  externalId: s.nullableString("External identifier for the record."),
  httpLink: s.nullableString("URL for viewing the record in the Lightfield web app."),
  fields: s.record("Dynamic Lightfield fields keyed by field slug.", fieldSchema),
  relationships: s.record("Dynamic Lightfield relationships keyed by relationship slug.", relationshipSchema),
});

const objectDefinitionSchema = s.object(
  "A Lightfield custom object definition.",
  {
    label: s.string("Human-readable custom object label."),
    objectType: s.string("Slug used to reference the custom object type in the API."),
  },
  { required: ["label", "objectType"] },
);

const listRecordsOutputSchema = s.object(
  "A normalized Lightfield list response.",
  {
    records: s.array("Records returned by Lightfield.", recordSchema),
    object: s.string("The upstream response object type."),
    totalCount: s.number("Total number of records matching the query."),
  },
  { required: ["records", "object", "totalCount"] },
);

const retrieveRecordOutputSchema = s.object(
  "A normalized Lightfield retrieve response.",
  {
    record: recordSchema,
  },
  { required: ["record"] },
);

export const lightfieldActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_api_key_metadata",
    description: "Validate the current Lightfield API key and return its subject and scopes.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for validating the current API key.", {}),
    outputSchema: apiKeyMetadataSchema,
  }),
  defineProviderAction(service, {
    name: "list_object_definitions",
    description: "List custom object types available to the current Lightfield API key.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing Lightfield custom object types.", {}),
    outputSchema: s.object(
      "Lightfield custom object definitions response.",
      {
        definitions: s.array("Custom object definitions returned by Lightfield.", objectDefinitionSchema),
      },
      { required: ["definitions"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_custom_object_records",
    description: "List records for a Lightfield custom object type with optional filters.",
    requiredScopes: [],
    inputSchema: customObjectListInputSchema,
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_custom_object_record",
    description: "Get one Lightfield custom object record by object type and record ID.",
    requiredScopes: [],
    inputSchema: customObjectRetrieveInputSchema,
    outputSchema: retrieveRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Lightfield accounts with optional pagination and filters.",
    requiredScopes: ["accounts:read"],
    inputSchema: listInputSchema,
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Get one Lightfield account by ID.",
    requiredScopes: ["accounts:read"],
    inputSchema: idInputSchema,
    outputSchema: retrieveRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Lightfield contacts with optional pagination and filters.",
    requiredScopes: ["contacts:read"],
    inputSchema: listInputSchema,
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one Lightfield contact by ID.",
    requiredScopes: ["contacts:read"],
    inputSchema: idInputSchema,
    outputSchema: retrieveRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_opportunities",
    description: "List Lightfield opportunities with optional pagination and filters.",
    requiredScopes: ["opportunities:read"],
    inputSchema: listInputSchema,
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_opportunity",
    description: "Get one Lightfield opportunity by ID.",
    requiredScopes: ["opportunities:read"],
    inputSchema: idInputSchema,
    outputSchema: retrieveRecordOutputSchema,
  }),
];
