import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vitally";

export type VitallyActionName =
  | "list_accounts"
  | "get_account"
  | "create_account"
  | "update_account"
  | "delete_account";

const rawAccountSchema = s.looseObject("A raw Vitally account object returned by the REST API.");
const traitsSchema = s.looseObject(
  "Vitally account traits keyed by trait name. Values are forwarded using Vitally's documented trait inference rules.",
);

const accountOutputSchema = s.actionOutput({
  account: rawAccountSchema,
});

const listAccountsOutputSchema = s.actionOutput({
  accounts: s.array("Vitally accounts in the current page.", rawAccountSchema),
  next: s.nullable(s.string("The cursor for the next page, or null when there are no more pages.")),
});

export const vitallyActions: ProviderActionDefinition<VitallyActionName>[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Vitally accounts with optional status and cursor pagination filters.",
    inputSchema: s.actionInput({
      limit: s.integer("The maximum number of accounts to return, up to 100.", {
        minimum: 1,
        maximum: 100,
      }),
      from: s.nonEmptyString("The pagination cursor returned by a previous Vitally list response."),
      status: s.stringEnum("The account status filter.", ["active", "churned", "activeOrChurned"]),
    }),
    outputSchema: listAccountsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Get a Vitally account by its Vitally ID or external ID.",
    inputSchema: s.actionInput(
      {
        id: s.nonEmptyString("The Vitally account ID or the external ID supplied when creating it."),
      },
      ["id"],
    ),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_account",
    description: "Create a Vitally account with an external ID, name, optional organization, and traits.",
    inputSchema: s.actionInput(
      {
        externalId: s.nonEmptyString("The unique account ID from your system."),
        name: s.nonEmptyString("The account name."),
        organizationId: s.nonEmptyString("The Vitally-assigned organization ID to relate this account to."),
        traits: traitsSchema,
      },
      ["externalId", "name"],
    ),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_account",
    description: "Update a Vitally account name, organization relationship, or traits by Vitally ID or external ID.",
    inputSchema: s.actionInput(
      {
        id: s.nonEmptyString("The Vitally account ID or the external ID supplied when creating it."),
        name: s.nonEmptyString("The updated account name."),
        organizationId: s.nullable(
          s.nonEmptyString(
            "The Vitally organization ID or external ID, or null to remove the organization relationship.",
          ),
        ),
        traits: traitsSchema,
      },
      ["id"],
    ),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_account",
    description: "Delete a Vitally account by its Vitally ID or external ID.",
    inputSchema: s.actionInput(
      {
        id: s.nonEmptyString("The Vitally account ID or the external ID supplied when creating it."),
      },
      ["id"],
    ),
    outputSchema: s.actionOutput({
      deleted: s.boolean("Whether Vitally accepted the delete request."),
      raw: s.unknown("The raw Vitally delete response payload."),
    }),
  }),
];
