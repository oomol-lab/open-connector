import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "passslot";

const passTypeIdentifierSchema = s.string({
  minLength: 1,
  pattern: "\\S",
  description: "The Apple Wallet pass type identifier, such as pass.example.membership.",
});
const serialNumberSchema = s.string({
  minLength: 1,
  pattern: "\\S",
  description: "The unique serial number of the Wallet pass.",
});
const valuesSchema = s.looseObject("The template placeholder names and JSON values to apply to the Wallet pass.");

const templateSchema = s.looseRequiredObject(
  "A PassSlot pass template.",
  {
    id: s.positiveInteger("The numeric PassSlot template identifier."),
    name: s.string({ minLength: 1, pattern: "\\S", description: "The display name of the pass template." }),
    formatVersion: s.positiveInteger("The Apple Wallet pass format version."),
    passType: passTypeIdentifierSchema,
    description: s.looseObject("The Apple Wallet template description and field layout."),
    placeholder: s.array(
      "The placeholder names accepted when creating a pass from this template.",
      s.string({ minLength: 1, pattern: "\\S", description: "A template placeholder name." }),
    ),
  },
  { optional: [] },
);

const passTypeSchema = s.looseRequiredObject(
  "A PassSlot pass type record.",
  {
    id: passTypeIdentifierSchema,
    organizationName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The organization name from the pass certificate.",
    }),
    teamIdentifier: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The Apple Developer team identifier.",
    }),
    certificateExpirationDate: s.string("The ISO 8601 expiration timestamp of the pass certificate."),
  },
  { optional: [] },
);

const passReferenceSchema = s.looseRequiredObject(
  "A PassSlot Wallet pass reference.",
  {
    serialNumber: serialNumberSchema,
    passType: passTypeIdentifierSchema,
  },
  { optional: [] },
);

const createdPassSchema = s.looseRequiredObject(
  "A Wallet pass created by PassSlot.",
  {
    serialNumber: serialNumberSchema,
    passTypeIdentifier: passTypeIdentifierSchema,
    url: s.url("The short distribution URL for installing the Wallet pass."),
  },
  { optional: [] },
);

const passIdentityInputSchema = s.actionInput(
  {
    passTypeIdentifier: passTypeIdentifierSchema,
    serialNumber: serialNumberSchema,
  },
  ["passTypeIdentifier", "serialNumber"],
  "The identity of an existing PassSlot Wallet pass.",
);

export const passslotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List PassSlot pass templates available to the connected App Key.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing PassSlot templates."),
    outputSchema: s.actionOutput(
      { templates: s.array("The pass templates available to the App Key.", templateSchema) },
      "The PassSlot template collection.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_pass_types",
    operationType: "read",
    description: "List Apple Wallet pass type identifiers available in PassSlot.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing PassSlot pass types."),
    outputSchema: s.actionOutput(
      { passTypes: s.array("The available pass type records.", passTypeSchema) },
      "The PassSlot pass type collection.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_passes",
    operationType: "read",
    description: "List PassSlot Wallet passes, optionally limited to one pass type identifier.",
    inputSchema: s.actionInput(
      { passTypeIdentifier: passTypeIdentifierSchema },
      [],
      "Input parameters for listing PassSlot Wallet passes.",
    ),
    outputSchema: s.actionOutput(
      { passes: s.array("The matching Wallet pass references.", passReferenceSchema) },
      "The PassSlot Wallet pass collection.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_pass_from_template",
    operationType: "write",
    description:
      "Create a Wallet pass from a PassSlot template using JSON placeholder values and return its installation URL.",
    inputSchema: s.actionInput(
      {
        templateId: s.positiveInteger("The numeric PassSlot template identifier."),
        values: valuesSchema,
      },
      ["templateId"],
      "Input parameters for creating a Wallet pass from a template.",
    ),
    outputSchema: s.actionOutput({ pass: createdPassSchema }, "The newly created PassSlot Wallet pass."),
  }),
  defineProviderAction(service, {
    name: "get_pass_url",
    operationType: "read",
    description: "Get the short installation URL for an existing PassSlot Wallet pass.",
    inputSchema: passIdentityInputSchema,
    outputSchema: s.actionOutput(
      { url: s.url("The short distribution URL for installing the Wallet pass.") },
      "The PassSlot Wallet pass installation URL.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_pass_values",
    operationType: "read",
    description: "Get the current placeholder values of an existing PassSlot Wallet pass.",
    inputSchema: passIdentityInputSchema,
    outputSchema: s.actionOutput(
      { values: valuesSchema },
      "The current placeholder values of the PassSlot Wallet pass.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_pass_values",
    operationType: "write",
    description: "Update the placeholder values of an existing PassSlot Wallet pass.",
    inputSchema: s.actionInput(
      {
        passTypeIdentifier: passTypeIdentifierSchema,
        serialNumber: serialNumberSchema,
        values: valuesSchema,
      },
      ["passTypeIdentifier", "serialNumber", "values"],
      "Input parameters for updating PassSlot Wallet pass values.",
    ),
    outputSchema: s.actionOutput(
      { values: valuesSchema },
      "The placeholder values returned after the PassSlot update.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_pass",
    operationType: "destructive",
    description: "Permanently delete a PassSlot Wallet pass.",
    inputSchema: passIdentityInputSchema,
    outputSchema: s.actionOutput(
      {
        deleted: s.literal(true, { description: "Whether the Wallet pass was deleted." }),
        passTypeIdentifier: passTypeIdentifierSchema,
        serialNumber: serialNumberSchema,
      },
      "The acknowledgement for the deleted PassSlot Wallet pass.",
    ),
  }),
];
