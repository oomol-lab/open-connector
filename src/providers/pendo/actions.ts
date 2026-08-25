import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pendo";

const pendoObject = s.looseObject("A raw Pendo object returned by the Engage API.");

const pendoTokenOutput = s.object("Pendo integration key verification result.", {
  valid: s.boolean("Whether Pendo accepted the integration key."),
  canWrite: s.nullableBoolean("Whether the integration key has write access when Pendo returns it."),
  raw: s.unknown("The raw Pendo token verification response."),
});

const listPagesInput = s.object(
  "Input for listing Pendo pages.",
  {
    appId: s.nonEmptyString("Pendo application ID used to list pages for one application in a multi-app subscription."),
    expandAllApps: s.boolean("Whether to include pages from all applications in the subscription."),
  },
  { optional: ["appId", "expandAllApps"] },
);

const listFeaturesInput = s.object(
  "Input for listing Pendo features.",
  {
    appId: s.nonEmptyString(
      "Pendo application ID used to list features for one application in a multi-app subscription.",
    ),
    expandAllApps: s.boolean("Whether to include features from all applications in the subscription."),
  },
  { optional: ["appId", "expandAllApps"] },
);

function idsInput(description: string, fieldDescription: string) {
  return s.object(description, {
    ids: s.array(fieldDescription, s.nonEmptyString("One Pendo object ID."), { minItems: 1 }),
  });
}

export const pendoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "identify",
    description: "Verify the current Pendo integration key and report whether Pendo says it has write access.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to verify a Pendo integration key.", {}),
    outputSchema: pendoTokenOutput,
  }),
  defineProviderAction(service, {
    name: "list_pages",
    description: "List Pendo pages, optionally scoped to one application or expanded across all applications.",
    requiredScopes: [],
    inputSchema: listPagesInput,
    outputSchema: s.object("Pendo pages returned by the Engage API.", {
      pages: s.array("Pendo page objects.", pendoObject),
    }),
  }),
  defineProviderAction(service, {
    name: "get_pages",
    description: "Get one or more Pendo pages by page ID.",
    requiredScopes: [],
    inputSchema: idsInput("Input for retrieving Pendo pages.", "Pendo page IDs to retrieve."),
    outputSchema: s.object("Pendo pages returned by ID.", {
      pages: s.array("Matching Pendo page objects.", pendoObject),
    }),
  }),
  defineProviderAction(service, {
    name: "list_features",
    description: "List Pendo features, optionally scoped to one application or expanded across all applications.",
    requiredScopes: [],
    inputSchema: listFeaturesInput,
    outputSchema: s.object("Pendo features returned by the Engage API.", {
      features: s.array("Pendo feature objects.", pendoObject),
    }),
  }),
  defineProviderAction(service, {
    name: "get_features",
    description: "Get one or more Pendo features by feature ID.",
    requiredScopes: [],
    inputSchema: idsInput("Input for retrieving Pendo features.", "Pendo feature IDs to retrieve."),
    outputSchema: s.object("Pendo features returned by ID.", {
      features: s.array("Matching Pendo feature objects.", pendoObject),
    }),
  }),
];
