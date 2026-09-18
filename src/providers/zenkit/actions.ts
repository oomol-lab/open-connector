import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zenkit";

const allIdSchema = (description: string) => s.anyOf(description, [s.string(description), s.integer(description)]);

const rawObjectSchema = s.looseObject("The raw object returned by Zenkit.");
const entryDataSchema = s.looseObject("Collection field values keyed by the Zenkit field UUID and business data key.");

const listWorkspacesOutputSchema = s.looseRequiredObject(
  "The workspaces and collections accessible to the connected Zenkit user.",
  {
    workspaces: s.array("The workspaces returned by Zenkit, including their nested lists.", rawObjectSchema),
  },
  { optional: [] },
);

const resourceOutputSchema = s.requiredObject("A Zenkit resource response.", {
  resource: rawObjectSchema,
});

const entryOutputSchema = s.requiredObject("A Zenkit entry response.", {
  entry: rawObjectSchema,
});

const listWorkspacesAndLists = defineProviderAction(service, {
  name: "list_workspaces_and_lists",
  operationType: "read",
  description: "List all Zenkit workspaces and collections accessible to the connected user.",
  inputSchema: s.requiredObject("Parameters for listing Zenkit workspaces and collections.", {}),
  outputSchema: listWorkspacesOutputSchema,
});

const getWorkspace = defineProviderAction(service, {
  name: "get_workspace",
  operationType: "read",
  description: "Get a Zenkit workspace by its numeric ID, short ID, UUID, or name.",
  inputSchema: s.requiredObject("Parameters for retrieving a Zenkit workspace.", {
    workspaceId: allIdSchema("The workspace numeric ID, short ID, UUID, or name."),
  }),
  outputSchema: resourceOutputSchema,
});

const getList = defineProviderAction(service, {
  name: "get_list",
  operationType: "read",
  description: "Get a Zenkit collection by its numeric ID, short ID, UUID, or name.",
  inputSchema: s.requiredObject("Parameters for retrieving a Zenkit collection.", {
    listId: allIdSchema("The collection numeric ID, short ID, UUID, or name."),
  }),
  outputSchema: resourceOutputSchema,
});

const getEntry = defineProviderAction(service, {
  name: "get_entry",
  operationType: "read",
  description: "Get one entry from a Zenkit collection.",
  inputSchema: s.requiredObject("Parameters for retrieving a Zenkit entry.", {
    listId: allIdSchema("The collection numeric ID, short ID, UUID, or name."),
    entryId: allIdSchema("The entry numeric ID, short ID, UUID, or name."),
  }),
  outputSchema: entryOutputSchema,
});

const searchEntries = defineProviderAction(service, {
  name: "search_entries",
  operationType: "read",
  description: "Search entries across the connected user's Zenkit collections.",
  inputSchema: s.object(
    "Parameters for searching Zenkit entries.",
    {
      query: s.nonEmptyString("The text to search for."),
      limit: s.positiveInteger("The maximum number of entries to return."),
      preferredListIds: s.array(
        "Collection numeric IDs that Zenkit should search first.",
        s.positiveInteger("A preferred collection numeric ID."),
      ),
      excludeEntryUuids: s.array(
        "Entry UUIDs to exclude from the search results.",
        s.uuid("An entry UUID to exclude."),
      ),
      searchInArchive: s.boolean("Whether to search archived entries."),
      includeRelatedLists: s.boolean("Whether to include collections related to the results."),
      includeRelatedWorkspaces: s.boolean("Whether to include workspaces related to the results."),
      includeRelatedListElements: s.boolean("Whether to include collection field definitions related to the results."),
    },
    {
      optional: [
        "limit",
        "preferredListIds",
        "excludeEntryUuids",
        "searchInArchive",
        "includeRelatedLists",
        "includeRelatedWorkspaces",
        "includeRelatedListElements",
      ],
    },
  ),
  outputSchema: s.requiredObject("Zenkit global entry search results.", {
    results: rawObjectSchema,
  }),
});

const createEntry = defineProviderAction(service, {
  name: "create_entry",
  operationType: "write",
  description: "Create an entry in a Zenkit collection with collection-defined field values.",
  inputSchema: s.object(
    "Parameters for creating a Zenkit entry.",
    {
      listId: s.positiveInteger("The numeric ID of the collection that will contain the entry."),
      data: entryDataSchema,
      sortOrder: s.anyOf("The entry sort position as a number, or highest or lowest.", [
        s.string("A named sort position such as highest or lowest."),
        s.number("A numeric sort position."),
      ]),
    },
    { optional: ["sortOrder"] },
  ),
  outputSchema: entryOutputSchema,
});

const updateEntry = defineProviderAction(service, {
  name: "update_entry",
  operationType: "write",
  description: "Update collection-defined field values on a Zenkit entry.",
  inputSchema: s.object(
    "Parameters for updating a Zenkit entry.",
    {
      listId: s.positiveInteger("The numeric ID of the collection containing the entry."),
      entryId: s.positiveInteger("The numeric ID of the entry to update."),
      data: entryDataSchema,
      updateAction: s.string("The Zenkit update action used for array-valued fields when required by the field type."),
    },
    { optional: ["updateAction"] },
  ),
  outputSchema: entryOutputSchema,
});

const deleteEntry = defineProviderAction(service, {
  name: "delete_entry",
  operationType: "destructive",
  description: "Delete an entry from a Zenkit collection.",
  inputSchema: s.requiredObject("Parameters for deleting a Zenkit entry.", {
    listId: allIdSchema("The collection numeric ID, short ID, UUID, or name."),
    entryId: allIdSchema("The entry numeric ID, short ID, UUID, or name."),
  }),
  outputSchema: s.requiredObject("The result of deleting a Zenkit entry.", {
    deleted: s.boolean("Whether Zenkit accepted the delete operation."),
    response: s.unknown("The response payload returned by Zenkit, if any."),
  }),
});

export const zenkitActions: ProviderActionDefinition[] = [
  listWorkspacesAndLists,
  getWorkspace,
  getList,
  getEntry,
  searchEntries,
  createEntry,
  updateEntry,
  deleteEntry,
];
