import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "givebutter";

const resourceIdSchema = (description: string): JsonSchema =>
  s.anyOf(description, [s.nonEmptyString(description), s.positiveInteger(description)]);

const queryValueSchema = s.anyOf("A Givebutter query parameter value.", [
  s.string("A string query value."),
  s.number("A numeric query value."),
  s.boolean("A boolean query value."),
]);

const listInputSchema = s.object(
  "Pagination and query parameters for listing Givebutter resources.",
  {
    page: s.positiveInteger("The Givebutter page number to request."),
    perPage: s.integer("The number of Givebutter records to return per page.", {
      minimum: 1,
      maximum: 100,
    }),
    query: s.record("Additional official Givebutter query parameters for this list endpoint.", queryValueSchema),
  },
  { optional: ["page", "perPage", "query"] },
);

const rawObjectSchema = s.looseObject("A raw JSON object returned by Givebutter.");
const rawArraySchema = s.array("Raw JSON objects returned by Givebutter.", rawObjectSchema);
const linksSchema = s.looseObject("Pagination links returned by Givebutter.");
const metaSchema = s.looseObject("Pagination metadata returned by Givebutter.");

function listOutputSchema(description: string, key: string): JsonSchema {
  return s.actionOutput(
    {
      [key]: rawArraySchema,
      links: linksSchema,
      meta: metaSchema,
      raw: rawObjectSchema,
    },
    description,
  );
}

function itemOutputSchema(description: string, key: string): JsonSchema {
  return s.actionOutput(
    {
      [key]: rawObjectSchema,
      raw: rawObjectSchema,
    },
    description,
  );
}

function getInputSchema(description: string, key: string, idDescription: string): JsonSchema {
  return s.object(description, {
    [key]: resourceIdSchema(idDescription),
  });
}

export const givebutterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_campaigns",
    operationType: "read",
    description: "List Givebutter campaigns with pagination and optional official filters.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("The normalized Givebutter campaigns list response.", "campaigns"),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    operationType: "read",
    description: "Retrieve one Givebutter campaign by ID.",
    requiredScopes: [],
    inputSchema: getInputSchema(
      "Input for retrieving one Givebutter campaign.",
      "campaignId",
      "The Givebutter campaign ID.",
    ),
    outputSchema: itemOutputSchema("The normalized Givebutter campaign response.", "campaign"),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Givebutter contacts with pagination and optional official filters.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("The normalized Givebutter contacts list response.", "contacts"),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Retrieve one Givebutter contact by ID.",
    requiredScopes: [],
    inputSchema: getInputSchema(
      "Input for retrieving one Givebutter contact.",
      "contactId",
      "The Givebutter contact ID.",
    ),
    outputSchema: itemOutputSchema("The normalized Givebutter contact response.", "contact"),
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    operationType: "read",
    description: "List Givebutter transactions with pagination and optional official filters.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("The normalized Givebutter transactions list response.", "transactions"),
  }),
  defineProviderAction(service, {
    name: "get_transaction",
    operationType: "read",
    description: "Retrieve one Givebutter transaction by ID.",
    requiredScopes: [],
    inputSchema: getInputSchema(
      "Input for retrieving one Givebutter transaction.",
      "transactionId",
      "The Givebutter transaction ID.",
    ),
    outputSchema: itemOutputSchema("The normalized Givebutter transaction response.", "transaction"),
  }),
  defineProviderAction(service, {
    name: "list_funds",
    operationType: "read",
    description: "List Givebutter funds with pagination and optional official filters.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("The normalized Givebutter funds list response.", "funds"),
  }),
  defineProviderAction(service, {
    name: "get_fund",
    operationType: "read",
    description: "Retrieve one Givebutter fund by ID.",
    requiredScopes: [],
    inputSchema: getInputSchema("Input for retrieving one Givebutter fund.", "fundId", "The Givebutter fund ID."),
    outputSchema: itemOutputSchema("The normalized Givebutter fund response.", "fund"),
  }),
  defineProviderAction(service, {
    name: "list_recurring_plans",
    operationType: "read",
    description: "List Givebutter recurring plans with pagination and optional official filters.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("The normalized Givebutter recurring plans list response.", "recurringPlans"),
  }),
  defineProviderAction(service, {
    name: "get_recurring_plan",
    operationType: "read",
    description: "Retrieve one Givebutter recurring plan by ID.",
    requiredScopes: [],
    inputSchema: getInputSchema(
      "Input for retrieving one Givebutter recurring plan.",
      "recurringPlanId",
      "The Givebutter recurring plan ID.",
    ),
    outputSchema: itemOutputSchema("The normalized Givebutter recurring plan response.", "recurringPlan"),
  }),
  defineProviderAction(service, {
    name: "list_chapters",
    operationType: "read",
    description: "List Givebutter chapters with pagination and optional official filters.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("The normalized Givebutter chapters list response.", "chapters"),
  }),
  defineProviderAction(service, {
    name: "get_chapter",
    operationType: "read",
    description: "Retrieve one Givebutter chapter by ID.",
    requiredScopes: [],
    inputSchema: getInputSchema(
      "Input for retrieving one Givebutter chapter.",
      "chapterId",
      "The Givebutter chapter ID.",
    ),
    outputSchema: itemOutputSchema("The normalized Givebutter chapter response.", "chapter"),
  }),
];
