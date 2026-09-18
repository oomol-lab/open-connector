import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "enigma";

const entityTypeSchema = s.stringEnum(
  "The Enigma entity type to search or retrieve: brand, operating location, or legal entity.",
  ["BRAND", "OPERATING_LOCATION", "LEGAL_ENTITY"],
);
const listTypeSchema = s.stringEnum("The Enigma list type used when creating or returning a list.", [
  "LIST_GENERATION",
  "ENRICHMENT",
]);
const searchFieldSchema = s.stringEnum("An Enigma list search field identifier.", [
  "NAME",
  "PERSON_FIRST_NAME",
  "PERSON_LAST_NAME",
  "WEBSITE",
  "ADDRESS_STREET1",
  "ADDRESS_STREET2",
  "ADDRESS_CITY",
  "ADDRESS_STATE",
  "ADDRESS_POSTAL_CODE",
]);

const jsonObjectSchema = s.looseObject("A loose JSON object.");
const addressInputSchema = s.looseObject("An official Enigma GraphQL address input object.", {
  id: s.string("The Enigma address identifier to search for directly."),
  street1: s.string("The first street-address line used to narrow the search."),
  street2: s.string("The second street-address line, such as suite or unit number."),
  city: s.string("The city used to narrow the search."),
  state: s.string("The state or region used to narrow the search."),
  postalCode: s.string("The postal code used to narrow the search."),
});
const tinInputSchema = s.looseObject("An official Enigma GraphQL TIN input object.", {
  tin: s.string("The taxpayer identification number to search with."),
  tinType: s.stringEnum("The TIN type Enigma should use for the search.", ["EIN", "SSN", "ITIN", "TIN"]),
});
const personInputSchema = s.looseObject("An official Enigma GraphQL person input object.", {
  firstName: s.string("The person's first name."),
  lastName: s.string("The person's last name."),
  dateOfBirth: s.date("The person's date of birth."),
  address: addressInputSchema,
  tin: tinInputSchema,
});
const conditionsSchema = s.looseObject("The official Enigma GraphQL conditions object.", {
  filter: jsonObjectSchema,
  orderBy: s.stringArray("The order-by expressions Enigma should apply."),
  limit: s.positiveInteger("The maximum number of matches to return."),
  pageToken: s.string("The opaque Enigma page token used to continue pagination."),
});
const outputSpecSchema = s.looseObject("The official Enigma GraphQL output specification.", {
  filename: s.string("The output file name Enigma should generate."),
  format: s.stringEnum("The export file format Enigma should generate.", ["PARQUET", "CSV"]),
});
const searchInputProperties = {
  prompt: s.string("A natural-language prompt used by Enigma semantic search."),
  id: s.string("The Enigma GraphQL entity ID to look up directly."),
  name: s.string("The business or entity name to search for."),
  address: addressInputSchema,
  addresses: s.array("Multiple address candidates used to narrow the search.", addressInputSchema),
  person: personInputSchema,
  phoneNumber: s.string("A complete phone number used to narrow the search."),
  website: s.string("A website URL or domain used to narrow the search."),
  conditions: conditionsSchema,
  tin: tinInputSchema,
  matchThreshold: s.number("The minimum Enigma match confidence to keep.", { minimum: 0, maximum: 1 }),
  entityType: entityTypeSchema,
  engine: s.string("The Enigma search engine override to use for the query."),
  output: outputSpecSchema,
  enrichmentIdsS3Path: s.string("The Enigma-supported S3 parquet path containing internal_id values."),
};

const searchInputSchema = s.looseObject(
  "Input parameters for the Enigma GraphQL search query. Provide at least one of prompt, id, name, website, or phoneNumber; entityType is required with id.",
  searchInputProperties,
);
const listSearchInputSchema = s.looseObject("The official Enigma list search input object.", {
  entityType: entityTypeSchema,
  conditions: conditionsSchema,
  prompt: s.string("A natural-language prompt used to create the list."),
  matchThreshold: s.number("The minimum match confidence Enigma should keep.", { minimum: 0, maximum: 1 }),
});
const fieldAliasSchema = s.looseObject("A field alias definition.", {
  fullyQualifiedName: s.string("The fully qualified Enigma field path."),
  aliasName: s.string("The alias name to show for the field."),
});
const columnMappingSchema = s.looseObject("A column mapping definition.", {
  columnName: s.string("The input column name to map."),
  searchField: searchFieldSchema,
});
const kybAddressSchema = s.looseObject("A KYB address object accepted by the Enigma v2 API.", {
  streetAddress1: s.string("The primary business street address."),
  streetAddress2: s.string("The secondary business street address."),
  city: s.string("The business city."),
  state: s.string("The business state or region."),
  postalCode: s.string("The business postal code."),
});
const kybPersonSchema = s.looseObject("A person object accepted by the Enigma v2 API.", {
  firstName: s.string("The person's first name."),
  lastName: s.string("The person's last name."),
  ssn: s.string("The person's Social Security Number."),
});
const enigmaObjectOutput = s.looseObject("The Enigma response payload.");

export const enigmaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description:
      "Retrieve the current Enigma account metadata available to the connected API key, including customer, billing, and auto-recharge details.",
    inputSchema: s.object("This action does not require any input fields.", {}),
    outputSchema: s.looseObject("The normalized Enigma account payload."),
  }),
  defineProviderAction(service, {
    name: "search_graphql",
    operationType: "read",
    description:
      "Search Enigma entities through the official GraphQL search query, supporting direct lookups, structured filters, natural-language prompts, and asynchronous output generation.",
    inputSchema: searchInputSchema,
    outputSchema: s.looseObject("The normalized output of the Enigma GraphQL search action.", {
      accepted: s.boolean("Whether Enigma accepted the request as an asynchronous background task."),
      results: s.array("The search results returned by Enigma.", enigmaObjectOutput),
      backgroundTasks: s.array("Background tasks returned for asynchronous search jobs.", enigmaObjectOutput),
    }),
  }),
  defineProviderAction(service, {
    name: "get_business",
    operationType: "read",
    description:
      "Retrieve a single Enigma entity by GraphQL entity ID and entity type, returning the provider entity payload.",
    inputSchema: s.object("Input parameters for retrieving a single Enigma entity by ID.", {
      id: s.nonEmptyString("The Enigma GraphQL entity ID to retrieve."),
      entityType: entityTypeSchema,
    }),
    outputSchema: s.looseObject("The normalized output of the Enigma get_business action.", {
      business: s.unknown("The Enigma entity, or null when nothing matched."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_aggregate_counts",
    operationType: "read",
    description:
      "Run the official Enigma GraphQL aggregate query to count matching entities or related entities for a search request.",
    inputSchema: s.looseObject("Input parameters for the Enigma GraphQL aggregate count query.", {
      ...searchInputProperties,
      countField: s.nonEmptyString("The Enigma field path or supported alias to count."),
      countConditions: conditionsSchema,
    }),
    outputSchema: s.object("The normalized output of the Enigma get_aggregate_counts action.", {
      countField: s.string("The resolved Enigma field path that was counted."),
      count: s.nullableInteger("The aggregate count returned by Enigma."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_lists",
    operationType: "read",
    description:
      "Query user-created Enigma lists with optional name or ID filters and Relay-style pagination controls.",
    inputSchema: s.looseObject("Input parameters for querying Enigma user-created lists.", {
      id: s.string("The Enigma list ID to filter by."),
      name: s.string("The list name to filter by."),
      conditions: conditionsSchema,
      first: s.positiveInteger("The number of items to return when paginating forward."),
      after: s.string("The forward-pagination cursor."),
      last: s.positiveInteger("The number of items to return when paginating backward."),
      before: s.string("The backward-pagination cursor."),
    }),
    outputSchema: s.looseObject("The normalized output of the Enigma search_lists action."),
  }),
  defineProviderAction(service, {
    name: "create_list",
    operationType: "write",
    description:
      "Create a user-managed Enigma list from a search definition or input file, with optional aliases, column ordering, and column mapping.",
    inputSchema: s.looseObject(
      "Input parameters for creating a user-managed Enigma list. Provide either searchInput or inputFileUri.",
      {
        name: s.string("The list name to create."),
        listType: listTypeSchema,
        description: s.string("The optional list description."),
        searchInput: listSearchInputSchema,
        fileFormat: s.string("The output file format Enigma should use for exports."),
        aliases: s.array("Field aliases to configure on the list.", fieldAliasSchema),
        columnOrdering: s.stringArray("The output column ordering for the list."),
        columnMapping: s.array(
          "The column mappings Enigma should use when reading an input file.",
          columnMappingSchema,
        ),
        inputFileUri: s.string("The input file URI Enigma should use to build the list."),
      },
    ),
    outputSchema: s.looseObject("The normalized output of the Enigma create_list action."),
  }),
  defineProviderAction(service, {
    name: "delete_list",
    operationType: "destructive",
    description: "Delete a user-managed Enigma list by ID.",
    inputSchema: s.object("Input parameters for deleting a user-managed Enigma list.", {
      id: s.nonEmptyString("The Enigma list ID to delete."),
    }),
    outputSchema: s.object("The normalized output of the Enigma delete_list action.", {
      id: s.string("The Enigma list ID that was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_background_task",
    operationType: "read",
    description:
      "Retrieve the latest status for an Enigma background task created by an asynchronous GraphQL search or export workflow.",
    inputSchema: s.object("Input parameters for retrieving an Enigma background task.", {
      id: s.nonEmptyString("The Enigma background task UUID to retrieve."),
    }),
    outputSchema: s.looseObject("The normalized output of the Enigma get_background_task action."),
  }),
  defineProviderAction(service, {
    name: "get_list_materialization",
    operationType: "read",
    description:
      "Retrieve an Enigma list materialization by ID, including progress, generated resource URI, metrics, and billing details.",
    inputSchema: s.object("Input parameters for retrieving a list materialization.", {
      id: s.nonEmptyString("The Enigma list materialization ID to retrieve."),
    }),
    outputSchema: s.looseObject("The normalized output of the Enigma get_list_materialization action."),
  }),
  defineProviderAction(service, {
    name: "get_graphql_schema_extended",
    operationType: "read",
    description:
      "Retrieve Enigma's extended GraphQL schema metadata, including types, projections, and data-asset descriptors.",
    inputSchema: s.object("This action does not require any input fields.", {}),
    outputSchema: s.looseObject("The normalized output of the Enigma get_graphql_schema_extended action."),
  }),
  defineProviderAction(service, {
    name: "create_suggestion",
    operationType: "write",
    description:
      "Submit a suggestion to Enigma for data correction or enrichment feedback using the official GraphQL suggestion mutation.",
    inputSchema: s.looseObject("Input parameters for submitting an Enigma suggestion.", {
      suggestedByEmail: s.email("The email address of the person submitting the suggestion."),
      payload: jsonObjectSchema,
      status: s.stringEnum("The suggestion status to set when supported.", ["APPROVED", "REJECTED", "PENDING_REVIEW"]),
      suggestedValue: s.unknown("The JSON value being proposed for the target field."),
      ancestorIdentifier: s.array(
        "Ancestor entities related to the suggestion.",
        s.looseObject("An ancestor entity identifier."),
      ),
      suggestedEntityIdentifier: s.looseObject("The entity identifier the suggestion is attached to."),
      field: s.string("The target field being suggested for update."),
    }),
    outputSchema: s.looseObject("The normalized output of the Enigma create_suggestion action."),
  }),
  defineProviderAction(service, {
    name: "verify_business_v2",
    operationType: "read",
    description:
      "Verify a business with Enigma's KYB v2 API, returning a normalized risk summary and the raw verification payload.",
    inputSchema: s.looseObject("Input parameters for Enigma's KYB v2 business verification API.", {
      package: s.stringEnum("The Enigma KYB package to run.", ["identify", "verify"]),
      attrs: s.anyOf("Additional KYB attributes to request.", [
        s.string("A comma-separated list of KYB attributes."),
        s.stringArray("KYB attributes to request."),
      ]),
      name: s.string("A business name to verify."),
      names: s.stringArray("Up to two business-name candidates to verify.", { maxItems: 2 }),
      tin: s.string("A business TIN or EIN to verify."),
      tins: s.stringArray("Up to one business TIN or EIN candidate to verify.", { maxItems: 1 }),
      address: kybAddressSchema,
      addresses: s.array("Up to two business-address candidates to verify.", kybAddressSchema, { maxItems: 2 }),
      person: kybPersonSchema,
      personsToScreen: s.array("Up to four people to screen against watchlists.", kybPersonSchema, { maxItems: 4 }),
      website: s.string("A business website URL."),
      websites: s.stringArray("Up to one website candidate to verify.", { maxItems: 1 }),
      topN: s.positiveInteger("The maximum number of top matches Enigma should return."),
      matchConfidence: s.number("The minimum match confidence Enigma should keep.", { minimum: 0, maximum: 1 }),
    }),
    outputSchema: s.looseObject("The normalized output of the Enigma verify_business_v2 action."),
  }),
];
