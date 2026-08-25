import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "monica_crm" as const;

const resourceSchema = s.looseObject("A resource returned by the Monica API.");
const paginationLinksSchema = s.looseObject("Pagination links returned by Monica.");
const paginationMetaSchema = s.looseObject("Pagination metadata returned by Monica.");
const pageOutputSchema = (description: string, itemDescription: string) =>
  s.requiredObject(description, {
    data: s.array(itemDescription, resourceSchema),
    links: paginationLinksSchema,
    meta: paginationMetaSchema,
  });

const paginationFields = {
  page: s.integer("The page number to return.", { minimum: 1 }),
  limit: s.integer("The number of resources to return per page.", {
    minimum: 1,
    maximum: 100,
  }),
};

const resourceIdSchema = (description: string) => s.integer(description, { exclusiveMinimum: 0 });

const noteBodySchema = s.nonEmptyString("The note body.", { maxLength: 100000 });
const noteFavoritedSchema = s.boolean("Whether the note is favorited.");

export const monicaCrmActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List or search contacts in the authenticated Monica account.",
    inputSchema: s.object(
      "Query parameters for listing Monica contacts.",
      {
        ...paginationFields,
        query: s.nonEmptyString("Text to search across contact names, food preferences, jobs, and companies."),
        sort: s.stringEnum("The order used for returned contacts.", [
          "created_at",
          "-created_at",
          "updated_at",
          "-updated_at",
        ]),
      },
      { optional: ["page", "limit", "query", "sort"] },
    ),
    outputSchema: pageOutputSchema("A page of Monica contacts.", "Contacts returned by Monica."),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get a Monica contact by ID.",
    inputSchema: s.requiredObject("Input for retrieving a Monica contact.", {
      contactId: resourceIdSchema("The Monica contact ID."),
    }),
    outputSchema: s.requiredObject("The Monica contact response.", {
      data: resourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_notes",
    description: "List notes in the Monica account or for one contact.",
    inputSchema: s.object(
      "Query parameters for listing Monica notes.",
      {
        ...paginationFields,
        contactId: resourceIdSchema("The contact whose notes should be returned."),
      },
      { optional: ["page", "limit", "contactId"] },
    ),
    outputSchema: pageOutputSchema("A page of Monica notes.", "Notes returned by Monica."),
  }),
  defineProviderAction(service, {
    name: "get_note",
    description: "Get a Monica note by ID.",
    inputSchema: s.requiredObject("Input for retrieving a Monica note.", {
      noteId: resourceIdSchema("The Monica note ID."),
    }),
    outputSchema: s.requiredObject("The Monica note response.", {
      data: resourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_note",
    description: "Create a note associated with a Monica contact.",
    inputSchema: s.requiredObject("Input for creating a Monica note.", {
      body: noteBodySchema,
      contactId: resourceIdSchema("The contact to associate with the note."),
      isFavorited: noteFavoritedSchema,
    }),
    outputSchema: s.requiredObject("The created Monica note response.", {
      data: resourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_note",
    description: "Replace a Monica note by ID.",
    inputSchema: s.requiredObject("Input for updating a Monica note.", {
      noteId: resourceIdSchema("The Monica note ID."),
      body: noteBodySchema,
      contactId: resourceIdSchema("The contact to associate with the note."),
      isFavorited: noteFavoritedSchema,
    }),
    outputSchema: s.requiredObject("The updated Monica note response.", {
      data: resourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_note",
    description: "Delete a Monica note by ID.",
    inputSchema: s.requiredObject("Input for deleting a Monica note.", {
      noteId: resourceIdSchema("The Monica note ID."),
    }),
    outputSchema: s.requiredObject("The Monica note deletion response.", {
      deleted: s.boolean("Whether Monica deleted the note."),
      id: resourceIdSchema("The ID of the deleted Monica note."),
    }),
  }),
];
