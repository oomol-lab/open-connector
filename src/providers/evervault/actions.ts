import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "evervault";
const jsonValueSchema = s.unknown("A JSON-compatible value, including objects, arrays, scalars, or null.");

export const evervaultActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "encrypt_json",
    operationType: "write",
    description: "Encrypt a JSON-compatible value with the configured Evervault app.",
    requiredScopes: [],
    inputSchema: s.object("The JSON value to encrypt.", {
      value: jsonValueSchema,
    }),
    outputSchema: s.object("The encrypted JSON value returned by Evervault.", {
      value: jsonValueSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "decrypt_json",
    operationType: "write",
    description: "Decrypt an Evervault-encrypted JSON-compatible value.",
    requiredScopes: [],
    inputSchema: s.object("The Evervault-encrypted JSON value to decrypt.", {
      value: jsonValueSchema,
    }),
    outputSchema: s.object("The decrypted JSON value returned by Evervault.", {
      value: jsonValueSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "inspect_token",
    operationType: "read",
    description: "Inspect metadata for an Evervault-encrypted token without decrypting it.",
    requiredScopes: [],
    inputSchema: s.object("The encrypted token to inspect.", {
      token: s.nonEmptyString("The Evervault-encrypted token to inspect."),
    }),
    outputSchema: s.object(
      "Metadata describing the encrypted token.",
      {
        type: s.stringEnum("The JSON data type stored in the encrypted token.", [
          "integer",
          "float",
          "boolean",
          "string",
        ]),
        category: s.string("The category assigned to the encrypted value."),
        encryptedAt: s.integer("The encryption time as a Unix timestamp in milliseconds."),
        role: s.string("The data role assigned to the encrypted value."),
        fingerprint: s.string("The stable fingerprint of the encrypted value."),
        metadata: s.looseObject("Additional category-specific encrypted-value metadata."),
      },
      { optional: ["category", "encryptedAt", "role", "fingerprint", "metadata"] },
    ),
  }),
];
