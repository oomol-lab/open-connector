import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "starton";

const statusSchema = s.stringEnum("The Starton pin status returned by the API.", [
  "queued",
  "pinning",
  "pinned",
  "failed",
  "deleted",
]);
const pinTypeSchema = s.stringEnum("The Starton pin type returned by the API.", ["directory", "file"]);
const directoryContentTypeSchema = s.stringEnum("The Starton directory entry type returned by the API.", [
  "directory",
  "file",
]);

const pinMetadataSchema = s.looseObject("Arbitrary metadata attached to the Starton pin.");
const directoryContentSchema = s.object(
  "A single file or directory entry returned by Starton.",
  {
    cid: s.nonEmptyString("The CID of the nested directory entry."),
    name: s.nonEmptyString("The file or directory name of the nested entry."),
    size: s.number("The size in bytes of the nested directory entry."),
    type: directoryContentTypeSchema,
  },
  { required: ["cid", "name", "size", "type"] },
);
const pinSchema = s.object(
  "A Starton IPFS pin resource.",
  {
    id: s.nonEmptyString("The unique Starton pin identifier."),
    projectId: s.nonEmptyString("The Starton project identifier that owns the pin."),
    status: statusSchema,
    cid: s.nullableString("The CID assigned to the pinned content."),
    name: s.nullableString("The display name recorded for the pin."),
    type: s.nullable(pinTypeSchema),
    size: s.nullableNumber("The size in bytes of the pinned content."),
    createdAt: s.nullable(s.dateTime("When Starton created this pin.")),
    updatedAt: s.nullable(s.dateTime("When Starton last updated this pin.")),
    delegates: s.nullable(s.stringArray("The delegate nodes attached to this pin.")),
    origins: s.nullable(s.stringArray("The origin nodes attached to this pin.")),
    metadata: s.nullable(pinMetadataSchema),
    directoryContent: s.nullable(
      s.array("The nested directory content returned for a directory pin.", directoryContentSchema),
    ),
  },
  { required: ["id", "projectId", "status"] },
);
const paginationSchema = s.requiredObject("Pagination data returned by Starton list endpoints.", {
  currentPage: s.number("The current result page returned by Starton."),
  itemCount: s.number("The number of items returned in this page."),
  itemsPerPage: s.number("The configured page size used by Starton."),
  totalItems: s.number("The total number of matching items across all pages."),
  totalPages: s.number("The total number of available pages."),
});

const pinIdInput = (description: string): JsonSchema =>
  s.actionInput(
    {
      id: s.nonEmptyString("The unique Starton pin identifier."),
    },
    ["id"],
    description,
  );

export const startonActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_pins",
    description: "List IPFS pins from the current Starton project.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        cid: s.nonEmptyString("Filter pins by CID."),
        includeDirectoryContent: s.boolean(
          "Whether Starton should include directory entries inside directory pin results.",
        ),
        limit: s.nonNegativeInteger("The number of entities returned on each page."),
        name: s.nonEmptyString("Filter pins by pin name."),
        page: s.nonNegativeInteger("The zero-based page number returned by Starton."),
        status: statusSchema,
      },
      [],
      "Input for listing Starton IPFS pins.",
    ),
    outputSchema: s.requiredObject("The Starton pin list response.", {
      pins: s.array("The pins returned by Starton for this page.", pinSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_pin",
    description: "Read one IPFS pin from Starton by pin identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        id: s.nonEmptyString("The unique Starton pin identifier."),
        includeDirectoryContent: s.boolean("Whether Starton should include nested directory content in the response."),
      },
      ["id"],
      "Input for reading a single Starton pin, with optional directory expansion.",
    ),
    outputSchema: s.requiredObject("The Starton single pin response.", {
      pin: pinSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_json_pin",
    description: "Upload JSON content to Starton IPFS and create a new pin.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("The name recorded for the uploaded JSON file."),
        content: s.looseObject("The JSON content that Starton should upload."),
        metadata: s.looseObject("Optional metadata stored alongside the uploaded JSON file."),
      },
      ["name", "content"],
      "Input for uploading JSON content to Starton IPFS.",
    ),
    outputSchema: s.requiredObject("The Starton JSON upload response.", {
      pin: pinSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "pin_existing_file",
    description: "Create a Starton pin for an existing IPFS CID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        cid: s.nonEmptyString("The existing IPFS CID that Starton should pin."),
        name: s.nonEmptyString("An optional display name recorded for the new pin."),
        metadata: s.looseObject("Optional metadata stored alongside the new pin."),
      },
      ["cid"],
      "Input for pinning an existing IPFS CID in Starton.",
    ),
    outputSchema: s.requiredObject("The Starton existing-file pin response.", {
      pin: pinSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_pin",
    description: "Delete a Starton pin by pin identifier.",
    requiredScopes: [],
    inputSchema: pinIdInput("Input for actions that target a single Starton pin."),
    outputSchema: s.requiredObject("The Starton pin deletion response.", {
      deleted: s.boolean("Whether Starton confirmed the pin deletion request."),
    }),
  }),
];
