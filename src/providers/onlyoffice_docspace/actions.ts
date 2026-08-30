import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "onlyoffice_docspace";
const resourceSchema = s.looseObject("A resource returned by ONLYOFFICE DocSpace.");
const paginationSchema = s.object("Pagination metadata returned by ONLYOFFICE DocSpace.", {
  count: s.nullable(s.integer("Number of resources in this response.")),
  total: s.nullable(s.integer("Total number of matching resources when reported.")),
  startIndex: s.nullable(s.integer("Start index used for this response when reported.")),
});
const listInputSchema = s.object(
  "Pagination and search filters for an ONLYOFFICE DocSpace list request.",
  {
    count: s.integer("Maximum number of resources to return.", { minimum: 1, maximum: 100 }),
    startIndex: s.nonNegativeInteger("Zero-based index from which to start returning resources."),
    search: s.nonEmptyString("Text used to filter matching resources."),
  },
  { optional: ["count", "startIndex", "search"] },
);

const getCurrentUser = defineProviderAction(service, {
  name: "get_current_user",
  description: "Get the current user associated with the connected ONLYOFFICE DocSpace API key.",
  requiredScopes: [],
  inputSchema: s.object("Input for retrieving the current DocSpace user.", {}),
  outputSchema: s.object("The current ONLYOFFICE DocSpace user.", { user: resourceSchema }),
});

const listUsers = defineProviderAction(service, {
  name: "list_users",
  description: "List users in the connected ONLYOFFICE DocSpace portal.",
  requiredScopes: [],
  followUpActions: [`${service}.get_user`],
  inputSchema: s.object("Input for listing ONLYOFFICE DocSpace users.", {}),
  outputSchema: s.object("The ONLYOFFICE DocSpace user list.", {
    users: s.array("Users returned by ONLYOFFICE DocSpace.", resourceSchema),
    pagination: paginationSchema,
  }),
});

const getUser = defineProviderAction(service, {
  name: "get_user",
  description: "Get one ONLYOFFICE DocSpace user by user ID.",
  requiredScopes: [],
  inputSchema: s.object("The ONLYOFFICE DocSpace user lookup.", {
    userId: s.nonEmptyString("The user ID to retrieve."),
  }),
  outputSchema: s.object("The requested ONLYOFFICE DocSpace user.", { user: resourceSchema }),
});

const listRooms = defineProviderAction(service, {
  name: "list_rooms",
  description: "List rooms available to the connected ONLYOFFICE DocSpace API key.",
  requiredScopes: [],
  followUpActions: [`${service}.get_room`],
  inputSchema: listInputSchema,
  outputSchema: s.object("The ONLYOFFICE DocSpace room list.", {
    rooms: s.array("Rooms returned by ONLYOFFICE DocSpace.", resourceSchema),
    pagination: paginationSchema,
  }),
});

const roomIdInputSchema = s.object("The ONLYOFFICE DocSpace room lookup.", {
  roomId: s.positiveInteger("The numeric room ID to retrieve."),
});

const getRoom = defineProviderAction(service, {
  name: "get_room",
  description: "Get information about one ONLYOFFICE DocSpace room.",
  requiredScopes: [],
  followUpActions: [`${service}.get_folder_contents`],
  inputSchema: roomIdInputSchema,
  outputSchema: s.object("The requested ONLYOFFICE DocSpace room.", { room: resourceSchema }),
});

const getFolderContents = defineProviderAction(service, {
  name: "get_folder_contents",
  description: "List file and subfolder metadata in an ONLYOFFICE DocSpace folder or room.",
  requiredScopes: [],
  inputSchema: s.object(
    "The folder lookup and pagination filters.",
    {
      folderId: s.positiveInteger("The numeric folder or room ID to inspect."),
      count: s.integer("Maximum number of entries to return.", { minimum: 1, maximum: 100 }),
      startIndex: s.nonNegativeInteger("Zero-based index from which to start returning entries."),
    },
    { optional: ["count", "startIndex"] },
  ),
  outputSchema: s.object("The ONLYOFFICE DocSpace folder contents.", {
    files: s.array("File metadata returned for the folder.", resourceSchema),
    folders: s.array("Subfolder metadata returned for the folder.", resourceSchema),
    current: s.nullable(resourceSchema),
    pagination: paginationSchema,
  }),
});

export const onlyofficeDocspaceActions: ActionDefinition[] = [
  getCurrentUser,
  listUsers,
  getUser,
  listRooms,
  getRoom,
  getFolderContents,
];

export type OnlyofficeDocspaceActionName = (typeof onlyofficeDocspaceActions)[number]["name"];
