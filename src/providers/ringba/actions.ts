import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ringba" as const;

const emptyInputSchema = s.object("The input payload for this Ringba action.", {});
const resourceIdSchema = (description: string) => s.nonEmptyString(description);
const accountIdSchema = s.nonEmptyString(
  "The Ringba account ID returned by get_account. Omit it when the connection has a default account.",
);
const transactionIdSchema = s.string("The Ringba transaction ID for the request.");
const accountSchema = s.looseObject("A Ringba account object.", {
  id: s.string("The Ringba account ID."),
  name: s.string("The Ringba account name."),
  accountId: s.string("The Ringba account ID used by account-scoped endpoints."),
  enabled: s.boolean("Whether the Ringba account is enabled."),
});
const campaignSchema = s.looseObject("A Ringba campaign object.", {
  id: s.string("The Ringba campaign ID."),
  name: s.string("The Ringba campaign name."),
  accountId: s.string("The Ringba account ID that owns the campaign."),
  enabled: s.boolean("Whether the campaign is enabled."),
});
const publisherSchema = s.looseObject("A Ringba publisher object.", {
  id: s.string("The Ringba publisher ID."),
  name: s.string("The Ringba publisher name."),
  accountId: s.string("The Ringba account ID associated with the publisher."),
  enabled: s.boolean("Whether the publisher is enabled."),
});
const numberSchema = s.looseObject("A Ringba phone number object.", {
  id: s.string("The Ringba number ID."),
  phoneNumber: s.string("The phone number in the format returned by Ringba."),
  accountId: s.string("The Ringba account ID that owns the number."),
  enabled: s.boolean("Whether the number is enabled."),
});

const getAccountAction = defineProviderAction(service, {
  name: "get_account",
  operationType: "read",
  description: "Get the Ringba account information available to the connected API token.",
  requiredScopes: [],
  inputSchema: emptyInputSchema,
  outputSchema: s.looseRequiredObject("The Ringba account response.", {
    transactionId: transactionIdSchema,
    account: s.array("The Ringba accounts available to the token.", accountSchema),
  }),
});

const listCampaignsAction = defineProviderAction(service, {
  name: "list_campaigns",
  operationType: "read",
  description: "List active campaigns in the connected Ringba account.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Ringba campaigns.",
    { accountId: accountIdSchema },
    { optional: ["accountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Ringba campaign list response.", {
    transactionId: transactionIdSchema,
    campaigns: s.array("The active campaigns in the account.", campaignSchema),
  }),
});

const getCampaignAction = defineProviderAction(service, {
  name: "get_campaign",
  operationType: "read",
  description: "Get a Ringba campaign by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Ringba campaign.",
    {
      campaignId: resourceIdSchema("The Ringba campaign ID, including its uppercase CA prefix."),
      accountId: accountIdSchema,
    },
    { optional: ["accountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Ringba campaign response.", {
    transactionId: transactionIdSchema,
    campaign: campaignSchema,
  }),
});

const listPublishersAction = defineProviderAction(service, {
  name: "list_publishers",
  operationType: "read",
  description: "List publishers in the connected Ringba account.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Ringba publishers.",
    { accountId: accountIdSchema },
    { optional: ["accountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Ringba publisher list response.", {
    transactionId: transactionIdSchema,
    publishers: s.array("The publishers in the account.", publisherSchema),
  }),
});

const getPublisherAction = defineProviderAction(service, {
  name: "get_publisher",
  operationType: "read",
  description: "Get a Ringba publisher by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Ringba publisher.",
    {
      publisherId: resourceIdSchema("The Ringba publisher ID."),
      accountId: accountIdSchema,
    },
    { optional: ["accountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Ringba publisher response.", {
    transactionId: transactionIdSchema,
    publisher: publisherSchema,
  }),
});

const listNumbersAction = defineProviderAction(service, {
  name: "list_numbers",
  operationType: "read",
  description: "List phone numbers in the connected Ringba account.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Ringba phone numbers.",
    { accountId: accountIdSchema },
    { optional: ["accountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Ringba number list response.", {
    transactionId: transactionIdSchema,
    numbers: s.array("The phone numbers in the account.", numberSchema),
  }),
});

const getNumberAction = defineProviderAction(service, {
  name: "get_number",
  operationType: "read",
  description: "Get a Ringba phone number by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Ringba phone number.",
    {
      numberId: resourceIdSchema("The Ringba number ID."),
      accountId: accountIdSchema,
    },
    { optional: ["accountId"] },
  ),
  outputSchema: s.looseRequiredObject("The Ringba number response.", {
    transactionId: transactionIdSchema,
    number: numberSchema,
  }),
});

export const ringbaActions: ProviderActionDefinition[] = [
  getAccountAction,
  listCampaignsAction,
  getCampaignAction,
  listPublishersAction,
  getPublisherAction,
  listNumbersAction,
  getNumberAction,
];

export type RingbaActionName = (typeof ringbaActions)[number]["name"];
