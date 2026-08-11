import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "totp";

export const totpActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "generate_code",
    description: "Generate the current six-digit TOTP code for the configured website account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for generating the current TOTP code.", {}),
    outputSchema: s.requiredObject("The current TOTP code and its validity window.", {
      code: s.stringPattern("^\\d{6}$", { description: "The current six-digit TOTP code." }),
      expiresAt: s.dateTime("The ISO 8601 timestamp when this code expires."),
      remainingSeconds: s.integer("The number of whole or partial seconds until this code expires.", {
        minimum: 1,
        maximum: 30,
      }),
      website: s.url("The website associated with the configured account."),
      username: s.string("The username associated with the configured account."),
    }),
  }),
];
