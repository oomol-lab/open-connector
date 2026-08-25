import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jsonbin";

const binIdSchema = s.string("The JSONBin bin identifier.", { minLength: 1 });
const jsonRecordSchema = s.looseObject("The JSON object stored in the bin. JSONBin bins store object records.");
const metadataSchema = s.looseObject(
  "Metadata returned by JSONBin for the bin, such as id, name, private flag, timestamps, version, or collection id.",
);

const binOutputSchema = s.object("The normalized JSONBin bin response.", {
  record: jsonRecordSchema,
  metadata: metadataSchema,
  raw: s.looseObject("The raw JSONBin API response."),
});

export const jsonbinActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_bin",
    description: "Create a JSONBin bin from a JSON object and return the stored record plus bin metadata.",
    inputSchema: s.object(
      "Input parameters for creating a JSONBin bin.",
      {
        record: jsonRecordSchema,
        name: s.string("Optional bin name sent with the X-Bin-Name header.", { minLength: 1 }),
        collectionId: s.string("Optional collection id sent with the X-Collection-Id header.", {
          minLength: 1,
        }),
        private: s.boolean("Whether the bin should be private."),
      },
      { optional: ["name", "collectionId", "private"] },
    ),
    outputSchema: binOutputSchema,
  }),
  defineProviderAction(service, {
    name: "read_bin",
    description: "Read the latest or a specific version of a JSONBin bin.",
    inputSchema: s.object(
      "Input parameters for reading a JSONBin bin.",
      {
        binId: binIdSchema,
        version: s.string("Optional JSONBin version identifier to read.", { minLength: 1 }),
      },
      { optional: ["version"] },
    ),
    outputSchema: binOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_bin",
    description: "Replace the JSON object stored in a JSONBin bin and return the updated record plus bin metadata.",
    inputSchema: s.object(
      "Input parameters for updating a JSONBin bin.",
      {
        binId: binIdSchema,
        record: jsonRecordSchema,
        versioning: s.boolean("Whether JSONBin should create a new version for this update."),
      },
      { optional: ["versioning"] },
    ),
    outputSchema: binOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_bin",
    description: "Delete a JSONBin bin and return the deletion metadata returned by JSONBin.",
    inputSchema: s.object("Input parameters for deleting a JSONBin bin.", {
      binId: binIdSchema,
    }),
    outputSchema: s.object("The normalized JSONBin delete response.", {
      metadata: metadataSchema,
      raw: s.looseObject("The raw JSONBin API response."),
    }),
  }),
];
