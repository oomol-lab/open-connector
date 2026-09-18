import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ecologi";

const usernameSchema = s.nonEmptyString("The Ecologi username used by the public reporting API.");
const idempotencyKeySchema = s.nonEmptyString(
  "An optional Idempotency-Key header value used to retry a purchase safely.",
);

const projectDetailSchema = s.looseRequiredObject("One Ecologi project allocation returned for the purchase.", {
  name: s.string("The project name."),
  projectUrl: s.url("The official Ecologi project URL."),
  quantity: s.number("The quantity allocated to this project."),
  splitPercentage: s.number("The percentage of the purchase allocated to this project."),
  splitAmountTrees: s.number("The number of trees allocated to this project."),
  splitAmountTonnes: s.number("The tonnes of carbon allocated to this project."),
});

const purchaseCommonProperties: Record<string, JsonSchema> = {
  name: s.nonEmptyString(
    "An optional funded-by name shown on the Ecologi profile. If the profile is public, obtain permission before sending personally identifiable information or use a non-identifying label.",
  ),
  test: s.boolean("Whether to simulate the purchase without charging or publishing impact."),
  recipientEmail: s.email(
    "An optional third-party recipient email for an Ecologi impact notification. The account-gated feature returns 403 when disabled; test mode validates and echoes the address without sending email.",
  ),
  idempotencyKey: idempotencyKeySchema,
};

const purchaseResponseProperties: Record<string, JsonSchema> = {
  amount: s.number("The purchase amount charged or simulated by Ecologi."),
  currency: s.string("The ISO currency code returned by Ecologi."),
  name: s.string("The funded-by name returned by Ecologi."),
  recipientEmail: s.email("The recipient email echoed by Ecologi."),
  projectDetails: s.array("The Ecologi projects funded by this purchase.", projectDetailSchema),
};

const treePurchaseOutputSchema = s.looseRequiredObject(
  "The Ecologi tree purchase response.",
  {
    ...purchaseResponseProperties,
    treeUrl: s.url("The Ecologi URL for the purchased tree impact."),
  },
  { optional: ["name", "recipientEmail"] },
);

const tilePurchaseOutputSchema = s.looseRequiredObject(
  "The Ecologi impact tile purchase response.",
  {
    ...purchaseResponseProperties,
    tileUrl: s.url("The Ecologi URL for the purchased impact tile."),
  },
  { optional: ["name", "recipientEmail"] },
);

const totalsOutputSchema = s.looseRequiredObject("The Ecologi public impact totals.", {
  total: s.number("The confirmed impact total."),
  pending: s.number("The impact total that is still pending payment."),
});

const totalImpactFields = {
  trees: s.number("The confirmed number of trees funded."),
  carbonOffset: s.number("The confirmed tonnes of carbon emissions avoided."),
  carbonRemoval: s.number("The confirmed tonnes of carbon removed."),
  habitatRestoration: s.number("The confirmed square metres of habitat restored."),
};

const pendingImpactFields = {
  trees: s.number("The pending number of trees funded."),
  carbonOffset: s.number("The pending tonnes of carbon emissions avoided."),
  carbonRemoval: s.number("The pending tonnes of carbon removed."),
  habitatRestoration: s.number("The pending square metres of habitat restored."),
};

function purchaseInput(properties: Record<string, JsonSchema>, description: string): JsonSchema {
  return s.actionInput(
    {
      ...properties,
      ...purchaseCommonProperties,
    },
    Object.keys(properties),
    description,
  );
}

function totalsAction(name: string, description: string): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
      },
      ["username"],
      "The Ecologi public reporting request.",
    ),
    outputSchema: totalsOutputSchema,
  });
}

export const ecologiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "purchase_trees",
    operationType: "write",
    description: "Purchase Ecologi tree planting with optional test mode, attribution, notification, and idempotency.",
    inputSchema: purchaseInput(
      {
        number: s.integer("The number of trees to purchase, from 1 through 250000.", {
          minimum: 1,
          maximum: 250000,
        }),
      },
      "The Ecologi tree purchase request.",
    ),
    outputSchema: treePurchaseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "purchase_local_trees",
    operationType: "write",
    description: "Purchase Ecologi tree planting in the UK, US, Australia, or Brazil.",
    inputSchema: purchaseInput(
      {
        number: s.integer("The number of local trees to purchase.", { minimum: 1 }),
        country: s.stringEnum("The country where Ecologi should plant the trees.", ["UK", "US", "AU", "BR"]),
      },
      "The Ecologi local tree purchase request.",
    ),
    outputSchema: treePurchaseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "purchase_carbon_avoidance",
    operationType: "write",
    description: "Purchase Ecologi carbon avoidance by kilograms or tonnes.",
    inputSchema: purchaseInput(
      {
        number: s.number("The number of carbon avoidance units to purchase.", { exclusiveMinimum: 0 }),
        units: s.stringEnum("The unit used for the carbon avoidance purchase.", ["KG", "Tonnes"]),
      },
      "The Ecologi carbon avoidance purchase request.",
    ),
    outputSchema: s.looseRequiredObject(
      "The Ecologi carbon avoidance purchase response.",
      {
        ...purchaseResponseProperties,
        number: s.number("The number of units purchased."),
        units: s.stringEnum("The unit used for the purchase.", ["KG", "Tonnes"]),
        numberInTonnes: s.number("The purchased amount normalized to tonnes."),
      },
      { optional: ["name", "recipientEmail"] },
    ),
  }),
  defineProviderAction(service, {
    name: "purchase_carbon_removal",
    operationType: "write",
    description: "Purchase permanent Ecologi carbon removal measured in kilograms.",
    inputSchema: purchaseInput(
      {
        number: s.number("The kilograms of carbon removal to purchase.", { minimum: 1 }),
      },
      "The Ecologi carbon removal purchase request.",
    ),
    outputSchema: tilePurchaseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "purchase_habitat_restoration",
    operationType: "write",
    description: "Purchase Ecologi habitat restoration measured in square metres.",
    inputSchema: purchaseInput(
      {
        number: s.number("The square metres of habitat to restore, with one decimal place.", { minimum: 0.1 }),
      },
      "The Ecologi habitat restoration purchase request.",
    ),
    outputSchema: tilePurchaseOutputSchema,
  }),
  totalsAction("get_tree_totals", "Get the confirmed and pending number of trees funded by an Ecologi user."),
  totalsAction(
    "get_carbon_offset_totals",
    "Get the confirmed and pending tonnes of carbon emissions avoided by an Ecologi user.",
  ),
  totalsAction(
    "get_carbon_removal_totals",
    "Get the confirmed and pending tonnes of carbon removed by an Ecologi user.",
  ),
  totalsAction(
    "get_habitat_restoration_totals",
    "Get the confirmed and pending square metres of habitat restored by an Ecologi user.",
  ),
  defineProviderAction(service, {
    name: "get_total_impact",
    operationType: "read",
    description: "Get a combined view of an Ecologi user's confirmed and pending impact totals.",
    inputSchema: s.actionInput(
      {
        username: usernameSchema,
      },
      ["username"],
      "The Ecologi combined public reporting request.",
    ),
    outputSchema: s.looseRequiredObject("The Ecologi combined public impact response.", {
      ...totalImpactFields,
      pending: s.looseRequiredObject("The pending Ecologi impact totals.", pendingImpactFields),
    }),
  }),
];
