import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "one_password";

const vaultIdSchema = s.nonEmptyString("The 1Password vault UUID.");
const itemIdSchema = s.nonEmptyString("The 1Password item UUID.");
const vaultFilterSchema = s.string('A SCIM-style filter for vault names, such as name eq "Demo Vault".');
const itemFilterSchema = s.string('A SCIM-style filter for item titles or tags, such as title eq "Example Item".');
const vaultSchema = s.looseObject("A 1Password vault object.", {
  id: s.string("The 1Password vault UUID."),
  name: s.string("The vault name."),
});
const itemOverviewSchema = s.looseObject("A 1Password item overview object.", {
  id: s.string("The 1Password item UUID."),
  title: s.string("The item title."),
  category: s.string("The item category."),
});
const itemSchema = s.looseObject("A full 1Password item object.", {
  id: s.string("The 1Password item UUID."),
  title: s.string("The item title."),
  category: s.string("The item category."),
  fields: s.array("Fields returned for the item.", s.looseObject("A 1Password item field.")),
});
const activitySchema = s.looseObject("A 1Password Connect activity event object.");

export const onePasswordActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_health",
    description: "Get health details for the configured 1Password Connect Server.",
    inputSchema: s.object("This action does not require any input parameters.", {}),
    outputSchema: s.requiredObject("The 1Password Connect Server health response.", {
      health: s.looseObject("Raw 1Password Connect Server health details."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_vaults",
    description: "List 1Password vaults available to the connected Connect access token.",
    followUpActions: ["one_password.list_items"],
    inputSchema: s.object(
      "The input payload for listing 1Password vaults.",
      {
        filter: vaultFilterSchema,
      },
      { optional: ["filter"] },
    ),
    outputSchema: s.requiredObject("Vaults returned by 1Password Connect.", {
      vaults: s.array("Vaults available to the Connect access token.", vaultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_vault",
    description: "Get details for one 1Password vault by UUID.",
    followUpActions: ["one_password.list_items"],
    inputSchema: s.requiredObject("The input payload for reading one 1Password vault.", {
      vaultId: vaultIdSchema,
    }),
    outputSchema: s.requiredObject("The 1Password vault detail response.", {
      vault: vaultSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_items",
    description: "List item overviews in one 1Password vault.",
    followUpActions: ["one_password.get_item"],
    inputSchema: s.object(
      "The input payload for listing items in a 1Password vault.",
      {
        vaultId: vaultIdSchema,
        filter: itemFilterSchema,
      },
      { optional: ["filter"] },
    ),
    outputSchema: s.requiredObject("Item overviews returned by 1Password Connect.", {
      items: s.array("Items in the requested vault.", itemOverviewSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get one full 1Password item by vault UUID and item UUID.",
    inputSchema: s.requiredObject("The input payload for reading one 1Password item.", {
      vaultId: vaultIdSchema,
      itemId: itemIdSchema,
    }),
    outputSchema: s.requiredObject("The 1Password item detail response.", {
      item: itemSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_activity",
    description: "List 1Password Connect activity events visible to the access token.",
    inputSchema: s.object(
      "The input payload for listing 1Password Connect activity events.",
      {
        limit: s.positiveInteger("Maximum number of activity events to return."),
        offset: s.nonNegativeInteger("Zero-based activity event offset."),
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.requiredObject("Activity events returned by 1Password Connect.", {
      activity: s.array("1Password Connect activity events.", activitySchema),
    }),
  }),
];
