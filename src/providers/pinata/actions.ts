import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pinata";

const networkSchema = s.stringEnum("The Pinata IPFS network to target.", ["public", "private"]);
const idSchema = s.nonEmptyString("The Pinata file or group identifier.");
const cidSchema = s.nonEmptyString("The IPFS CID.");
const keyvaluesSchema = s.record(
  "Pinata key-value metadata. Values are sent as strings.",
  s.string("One Pinata metadata value."),
);
const rawObjectSchema = s.looseObject("The raw object returned by the Pinata API.");
const nullableString = (description: string) => s.nullable(s.string(description));
const nullableNumber = (description: string) => s.nullable(s.number(description));
const nullableBoolean = (description: string) => s.nullable(s.boolean(description));

const fileSchema = s.object("A normalized Pinata file record.", {
  id: s.string("The Pinata file identifier."),
  name: s.string("The Pinata file name."),
  cid: nullableString("The IPFS CID, or null when Pinata has not assigned one yet."),
  size: nullableNumber("The file size in bytes when Pinata returns it."),
  numberOfFiles: nullableNumber("The number of files represented by this record."),
  mimeType: nullableString("The MIME type returned by Pinata."),
  groupId: nullableString("The group identifier assigned to the file, or null when absent."),
  keyvalues: s.nullable(rawObjectSchema),
  createdAt: nullableString("The creation timestamp returned by Pinata."),
  raw: rawObjectSchema,
});

const groupSchema = s.object("A normalized Pinata group record.", {
  id: s.string("The Pinata group identifier."),
  name: s.string("The Pinata group name."),
  isPublic: nullableBoolean("Whether Pinata reports the group as public."),
  createdAt: nullableString("The creation timestamp returned by Pinata."),
  raw: rawObjectSchema,
});

const pinRequestSchema = s.object("A normalized Pinata pin-by-CID request record.", {
  id: s.string("The Pinata pin request identifier."),
  cid: s.string("The IPFS CID queued for pinning."),
  name: nullableString("The optional name assigned to the pin request."),
  status: nullableString("The current Pinata pin request status."),
  keyvalues: s.nullable(rawObjectSchema),
  groupId: nullableString("The group identifier assigned to the pin request, or null when absent."),
  hostNodes: s.array("Host node IDs returned by Pinata.", s.string("One host node ID.")),
  dateQueued: nullableString("The timestamp when Pinata queued the pin request."),
  raw: rawObjectSchema,
});

const emptyOutputSchema = s.object("The Pinata operation result.", {
  ok: s.boolean("Whether the Pinata operation completed successfully."),
  raw: rawObjectSchema,
});

const listFilesInputSchema = s.object(
  "Filters for listing Pinata files.",
  {
    network: networkSchema,
    name: s.string("Filter files by name."),
    group: s.string("Filter files by group ID. Use the string null to show files outside groups."),
    mimeType: s.string("Filter files by MIME type."),
    cid: s.string("Filter files by CID."),
    cidPending: s.boolean("Return only files that are still waiting for a CID."),
    metadata: keyvaluesSchema,
    limit: s.positiveInteger("Limit the number of results returned by Pinata."),
    order: s.stringEnum("Sort results by creation date.", ["ASC", "DESC"]),
    pageToken: s.string("Pagination token returned by a previous Pinata response."),
  },
  {
    optional: ["name", "group", "mimeType", "cid", "cidPending", "metadata", "limit", "order", "pageToken"],
  },
);

const fileIdInputSchema = s.object("Input parameters for a Pinata file lookup.", {
  network: networkSchema,
  id: idSchema,
});

const updateFileInputSchema = s.object(
  "Input parameters for updating Pinata file metadata.",
  {
    network: networkSchema,
    id: idSchema,
    name: s.string("The updated file name."),
    keyvalues: keyvaluesSchema,
  },
  { optional: ["name", "keyvalues"] },
);

const pinByCidInputSchema = s.object(
  "Input parameters for pinning an existing public IPFS CID with Pinata.",
  {
    cid: cidSchema,
    name: s.string("Optional custom name for the pinned CID."),
    groupId: s.string("Optional Pinata group ID to assign to the pinned CID."),
    keyvalues: keyvaluesSchema,
    hostNodes: s.array("Optional IPFS host node IDs.", s.string("One IPFS host node ID.")),
  },
  { optional: ["name", "groupId", "keyvalues", "hostNodes"] },
);

const queryPinRequestsInputSchema = s.object(
  "Filters for querying Pinata pin-by-CID requests.",
  {
    order: s.stringEnum("Sort results by queue time.", ["ASC", "DESC"]),
    status: s.stringEnum("Filter pin requests by Pinata status.", [
      "prechecking",
      "backfilled",
      "retreiving",
      "expired",
      "searching",
      "over_free_limit",
      "over_max_size",
      "invalid_object",
      "bad_host_node",
    ]),
    cid: s.string("Filter pin requests by CID."),
    limit: s.positiveInteger("Limit the number of results returned by Pinata."),
    pageToken: s.string("Pagination token returned by a previous Pinata response."),
  },
  { optional: ["order", "status", "cid", "limit", "pageToken"] },
);

const listGroupsInputSchema = s.object(
  "Filters for listing Pinata groups.",
  {
    network: networkSchema,
    name: s.string("Filter groups by name."),
    isPublic: s.boolean("Filter groups by public visibility."),
    limit: s.positiveInteger("Limit the number of groups returned by Pinata."),
    pageToken: s.string("Pagination token returned by a previous Pinata response."),
  },
  { optional: ["name", "isPublic", "limit", "pageToken"] },
);

const groupIdInputSchema = s.object("Input parameters for a Pinata group lookup.", {
  network: networkSchema,
  id: idSchema,
});

const createGroupInputSchema = s.object(
  "Input parameters for creating a Pinata group.",
  {
    network: networkSchema,
    name: s.nonEmptyString("The group name."),
    isPublic: s.boolean("Whether Pinata should make the group public."),
  },
  { optional: ["isPublic"] },
);

const updateGroupInputSchema = s.object(
  "Input parameters for updating a Pinata group.",
  {
    network: networkSchema,
    id: idSchema,
    name: s.string("The updated group name."),
    isPublic: s.boolean("Whether Pinata should make the group public."),
  },
  { optional: ["name", "isPublic"] },
);

const groupFileInputSchema = s.object("Input parameters for changing Pinata group membership.", {
  network: networkSchema,
  groupId: idSchema,
  fileId: idSchema,
});

export const pinataActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_files",
    description: "List Pinata files from the public or private IPFS network with optional filters.",
    requiredScopes: ["org:files:read"],
    inputSchema: listFilesInputSchema,
    outputSchema: s.object("The Pinata file list.", {
      files: s.array("Files returned by Pinata.", fileSchema),
      nextPageToken: nullableString("The token to fetch the next page, or null when there is none."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_file",
    description: "Get one Pinata file by ID from the public or private IPFS network.",
    requiredScopes: ["org:files:read"],
    inputSchema: fileIdInputSchema,
    outputSchema: s.object("The Pinata file lookup result.", {
      file: fileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_file",
    description: "Update a Pinata file name or key-value metadata.",
    requiredScopes: ["org:files:write"],
    inputSchema: updateFileInputSchema,
    outputSchema: s.object("The updated Pinata file.", {
      file: fileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_file",
    description: "Delete one Pinata file by ID from the public or private IPFS network.",
    requiredScopes: ["org:files:write"],
    inputSchema: fileIdInputSchema,
    outputSchema: emptyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "pin_by_cid",
    description: "Ask Pinata to pin an existing public IPFS CID.",
    requiredScopes: ["org:files:write"],
    followUpActions: ["pinata.query_pin_requests"],
    inputSchema: pinByCidInputSchema,
    outputSchema: s.object("The queued Pinata pin request.", {
      pinRequest: pinRequestSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "query_pin_requests",
    description: "Query Pinata pin-by-CID requests with optional filters and pagination.",
    requiredScopes: ["org:files:read"],
    inputSchema: queryPinRequestsInputSchema,
    outputSchema: s.object("The Pinata pin request list.", {
      pinRequests: s.array("Pin-by-CID requests returned by Pinata.", pinRequestSchema),
      nextPageToken: nullableString("The token to fetch the next page, or null when there is none."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Pinata file groups from the public or private IPFS network.",
    requiredScopes: ["org:groups:read"],
    inputSchema: listGroupsInputSchema,
    outputSchema: s.object("The Pinata group list.", {
      groups: s.array("Groups returned by Pinata.", groupSchema),
      nextPageToken: nullableString("The token to fetch the next page, or null when there is none."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Pinata group by ID from the public or private IPFS network.",
    requiredScopes: ["org:groups:read"],
    inputSchema: groupIdInputSchema,
    outputSchema: s.object("The Pinata group lookup result.", {
      group: groupSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create a Pinata file group on the public or private IPFS network.",
    requiredScopes: ["org:groups:write"],
    inputSchema: createGroupInputSchema,
    outputSchema: s.object("The created Pinata group.", {
      group: groupSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_group",
    description: "Update a Pinata group name or public visibility setting.",
    requiredScopes: ["org:groups:write"],
    inputSchema: updateGroupInputSchema,
    outputSchema: s.object("The updated Pinata group.", {
      group: groupSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_file_to_group",
    description: "Add a Pinata file to a Pinata group.",
    requiredScopes: ["org:groups:write"],
    inputSchema: groupFileInputSchema,
    outputSchema: emptyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_file_from_group",
    description: "Remove a Pinata file from a Pinata group.",
    requiredScopes: ["org:groups:write"],
    inputSchema: groupFileInputSchema,
    outputSchema: emptyOutputSchema,
  }),
];
