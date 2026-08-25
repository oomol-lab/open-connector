import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "contentful";

const paginationSkipSchema = s.nonNegativeInteger("Number of Contentful records to skip before returning results.");
const paginationLimitSchema = s.integer("Maximum number of Contentful records to return.", {
  minimum: 1,
  maximum: 1000,
});
const orderSchema = s.nonEmptyString("Sort expression for the Contentful collection request.");
const localizedFieldsSchema = s.looseObject(
  "Entry fields organized by field identifier and locale, for example { title: { 'en-US': 'Hello' } }.",
);
const metadataSchema = s.looseObject("Optional Contentful metadata payload, such as tags.");
const contentfulUserSchema = s.looseObject("Authenticated Contentful user payload.");
const contentfulSpaceSchema = s.looseObject("Contentful space payload.");
const contentfulEnvironmentSchema = s.looseObject("Contentful environment payload.");
const contentfulContentTypeSchema = s.looseObject("Contentful content type payload.");
const contentfulEntrySchema = s.looseObject("Contentful entry payload.");

export const contentfulActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated Contentful user profile for the current personal access token.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for reading the authenticated Contentful user profile.", {}),
    outputSchema: s.object("Contentful authenticated user response wrapper.", {
      user: contentfulUserSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_spaces",
    description: "List Contentful spaces accessible to the current personal access token.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing accessible Contentful spaces.",
      {
        skip: paginationSkipSchema,
        limit: paginationLimitSchema,
        order: orderSchema,
      },
      { optional: ["skip", "limit", "order"] },
    ),
    outputSchema: s.object("Contentful space collection response wrapper.", {
      spaces: s.array("Contentful spaces returned for the request.", contentfulSpaceSchema),
      total: s.nonNegativeInteger("Total number of accessible Contentful spaces."),
      skip: s.nonNegativeInteger("Number of Contentful spaces skipped before this page."),
      limit: s.nonNegativeInteger("Maximum number of Contentful spaces requested for this page."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_environments",
    description: "List Contentful environments inside a specific space.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing environments in a Contentful space.", {
      spaceId: s.nonEmptyString("Contentful space identifier."),
    }),
    outputSchema: s.object("Contentful environment collection response wrapper.", {
      environments: s.array("Contentful environments returned for the space.", contentfulEnvironmentSchema),
      total: s.nonNegativeInteger("Total number of Contentful environments available."),
      skip: s.nonNegativeInteger("Number of Contentful environments skipped before this page."),
      limit: s.nonNegativeInteger("Maximum number of Contentful environments requested for this page."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_content_types",
    description: "List Contentful content types available in a specific environment.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Contentful content types in an environment.",
      {
        spaceId: s.nonEmptyString("Contentful space identifier."),
        environmentId: s.nonEmptyString("Contentful environment identifier."),
        skip: paginationSkipSchema,
        limit: paginationLimitSchema,
        order: orderSchema,
      },
      { optional: ["skip", "limit", "order"] },
    ),
    outputSchema: s.object("Contentful content type collection response wrapper.", {
      contentTypes: s.array("Contentful content types returned for the environment.", contentfulContentTypeSchema),
      total: s.nonNegativeInteger("Total number of Contentful content types available."),
      skip: s.nonNegativeInteger("Number of Contentful content types skipped before this page."),
      limit: s.nonNegativeInteger("Maximum number of Contentful content types requested for this page."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_entries",
    description: "List Contentful entries with common filtering, pagination, and include options.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Contentful entries in an environment.",
      {
        spaceId: s.nonEmptyString("Contentful space identifier."),
        environmentId: s.nonEmptyString("Contentful environment identifier."),
        contentType: s.nonEmptyString("Contentful content type identifier used to filter entries."),
        query: s.nonEmptyString("Full-text search query applied to Contentful entries."),
        locale: s.nonEmptyString("Locale code used when reading Contentful entry fields."),
        select: s.nonEmptyString("Comma-separated list of fields to include in the Contentful response."),
        include: s.integer("Number of linked content levels to include in the Contentful response.", {
          minimum: 0,
          maximum: 10,
        }),
        skip: paginationSkipSchema,
        limit: paginationLimitSchema,
        order: orderSchema,
      },
      { optional: ["contentType", "query", "locale", "select", "include", "skip", "limit", "order"] },
    ),
    outputSchema: s.object(
      "Contentful entry collection response wrapper.",
      {
        entries: s.array("Contentful entries returned for the current page.", contentfulEntrySchema),
        total: s.nonNegativeInteger("Total number of matching Contentful entries."),
        skip: s.nonNegativeInteger("Number of Contentful entries skipped before this page."),
        limit: s.nonNegativeInteger("Maximum number of Contentful entries requested for this page."),
        includes: s.looseObject("Included linked Contentful resources returned with the current page."),
      },
      { optional: ["includes"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_entry",
    description: "Get a single Contentful entry by identifier.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for reading a single Contentful entry.", {
      spaceId: s.nonEmptyString("Contentful space identifier."),
      environmentId: s.nonEmptyString("Contentful environment identifier."),
      entryId: s.nonEmptyString("Contentful entry identifier."),
    }),
    outputSchema: s.object("Contentful single entry response wrapper.", {
      entry: contentfulEntrySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_entry",
    description: "Create a Contentful entry in a specific environment.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating a Contentful entry.",
      {
        spaceId: s.nonEmptyString("Contentful space identifier."),
        environmentId: s.nonEmptyString("Contentful environment identifier."),
        contentType: s.nonEmptyString("Contentful content type identifier for the new entry."),
        fields: localizedFieldsSchema,
        metadata: metadataSchema,
      },
      { optional: ["metadata"] },
    ),
    outputSchema: s.object("Contentful entry creation response wrapper.", {
      entry: contentfulEntrySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_entry",
    description: "Update a Contentful entry using optimistic locking.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating a Contentful entry.",
      {
        spaceId: s.nonEmptyString("Contentful space identifier."),
        environmentId: s.nonEmptyString("Contentful environment identifier."),
        entryId: s.nonEmptyString("Contentful entry identifier."),
        contentType: s.nonEmptyString("Contentful content type identifier for the entry."),
        version: s.positiveInteger("Current Contentful entry version used for optimistic locking."),
        fields: localizedFieldsSchema,
        metadata: metadataSchema,
      },
      { optional: ["metadata"] },
    ),
    outputSchema: s.object("Contentful entry update response wrapper.", {
      entry: contentfulEntrySchema,
    }),
  }),
];
