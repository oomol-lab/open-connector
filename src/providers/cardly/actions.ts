import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cardly" as const;

function defineAction<TName extends string>(
  input: Omit<Parameters<typeof defineProviderAction<TName>>[1], "providerPermissions"> & {
    service: typeof service;
    providerPermissions?: string[];
  },
): ProviderActionDefinition<TName> {
  const { service: _service, ...action } = input;
  return defineProviderAction(service, action);
}

const nonEmptyStringSchema = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });

const paginationInputSchema = {
  limit: s.positiveInteger("The maximum number of records to return."),
  offset: s.nonNegativeInteger("The zero-based record offset to start listing from."),
};

const effectiveTimeFilterSchema = {
  effectiveTimeLt: nonEmptyStringSchema("Return records with an effective time before this YYYY-MM-DD HH:ii:ss value."),
  effectiveTimeLte: nonEmptyStringSchema(
    "Return records with an effective time before or equal to this YYYY-MM-DD HH:ii:ss value.",
  ),
  effectiveTimeGt: nonEmptyStringSchema("Return records with an effective time after this YYYY-MM-DD HH:ii:ss value."),
  effectiveTimeGte: nonEmptyStringSchema(
    "Return records with an effective time after or equal to this YYYY-MM-DD HH:ii:ss value.",
  ),
};

const responseStatusSchema = s.looseObject("The Cardly response state object.", {
  success: s.boolean("Whether Cardly reported the request as successful."),
  code: s.integer("The status code reported by Cardly."),
  message: s.string("The status message returned by Cardly."),
});

const paginationMetaSchema = s.looseObject("The pagination metadata returned by Cardly.", {
  limit: s.nullable(s.integer("The page size used by Cardly when present.")),
  offset: s.nullable(s.integer("The result offset used by Cardly when present.")),
  total: s.nullable(s.integer("The total number of records when Cardly returns it.")),
});

const paginatedOutputSchema = (description: string, resultsDescription: string) =>
  s.object(description, {
    state: responseStatusSchema,
    meta: paginationMetaSchema,
    results: s.array(resultsDescription, s.looseObject("One raw Cardly result object.")),
    raw: s.looseObject("The raw Cardly response payload."),
  });

const echoAction = defineAction({
  service,
  name: "echo",
  description: "Send a JSON payload to Cardly's authenticated echo endpoint for credential and request debugging.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for the Cardly echo endpoint.",
    {
      test: nonEmptyStringSchema("An optional query value that Cardly echoes back."),
      body: s.looseObject("An arbitrary JSON object to send to Cardly and echo back."),
    },
    { optional: ["test", "body"] },
  ),
  outputSchema: s.object("The normalized Cardly echo response.", {
    state: responseStatusSchema,
    method: s.nullable(s.string("The HTTP method Cardly saw for the echo request.")),
    url: s.nullable(s.string("The full URL Cardly saw for the echo request.")),
    headers: s.looseObject("The request headers Cardly echoed back, with sensitive values redacted."),
    params: s.looseObject("The query parameters Cardly echoed back."),
    body: s.looseObject("The JSON request body Cardly echoed back."),
    raw: s.looseObject("The raw Cardly response payload, with sensitive values redacted."),
  }),
});

const getBalanceAction = defineAction({
  service,
  name: "get_balance",
  description: "Retrieve the current Cardly card credit and gift credit balances.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving the Cardly account balance.", {}),
  outputSchema: s.object("The normalized Cardly account balance response.", {
    state: responseStatusSchema,
    balance: s.nullable(s.number("The current Cardly card credit balance.")),
    giftCredit: s.nullable(
      s.object(
        "The current Cardly gift credit balance when returned.",
        {
          balance: s.nullable(s.number("The gift credit balance value.")),
          currency: s.nullable(s.string("The currency for the gift credit balance.")),
          raw: s.looseObject("The raw Cardly gift credit object."),
        },
        { optional: ["raw"] },
      ),
    ),
    raw: s.looseObject("The raw Cardly response payload."),
  }),
});

const listCreditHistoryAction = defineAction({
  service,
  name: "list_credit_history",
  description: "List Cardly account credit history records with pagination and time filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing Cardly credit history.",
    {
      ...paginationInputSchema,
      ...effectiveTimeFilterSchema,
    },
    {
      optional: ["limit", "offset", "effectiveTimeLt", "effectiveTimeLte", "effectiveTimeGt", "effectiveTimeGte"],
    },
  ),
  outputSchema: paginatedOutputSchema(
    "The normalized Cardly credit history response.",
    "The Cardly credit history records.",
  ),
});

const listGiftCreditHistoryAction = defineAction({
  service,
  name: "list_gift_credit_history",
  description: "List Cardly gift credit history records with pagination and time filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing Cardly gift credit history.",
    {
      ...paginationInputSchema,
      ...effectiveTimeFilterSchema,
    },
    {
      optional: ["limit", "offset", "effectiveTimeLt", "effectiveTimeLte", "effectiveTimeGt", "effectiveTimeGte"],
    },
  ),
  outputSchema: paginatedOutputSchema(
    "The normalized Cardly gift credit history response.",
    "The Cardly gift credit history records.",
  ),
});

const listMediaAction = defineAction({
  service,
  name: "list_media",
  description: "List Cardly media options that can be used when selecting card products.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing Cardly media.",
    {
      ...paginationInputSchema,
    },
    { optional: ["limit", "offset"] },
  ),
  outputSchema: paginatedOutputSchema("The normalized Cardly media listing response.", "The Cardly media records."),
});

const listFontsAction = defineAction({
  service,
  name: "list_fonts",
  description: "List Cardly fonts available for handwriting and text personalization.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing Cardly fonts.",
    {
      ...paginationInputSchema,
    },
    { optional: ["limit", "offset"] },
  ),
  outputSchema: paginatedOutputSchema("The normalized Cardly font listing response.", "The Cardly font records."),
});

const listWritingStylesAction = defineAction({
  service,
  name: "list_writing_styles",
  description: "List Cardly writing styles available for generated handwriting.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing Cardly writing styles.",
    {
      ...paginationInputSchema,
    },
    { optional: ["limit", "offset"] },
  ),
  outputSchema: paginatedOutputSchema(
    "The normalized Cardly writing style listing response.",
    "The Cardly writing style records.",
  ),
});

export const cardlyActions: ProviderActionDefinition[] = [
  echoAction,
  getBalanceAction,
  listCreditHistoryAction,
  listGiftCreditHistoryAction,
  listMediaAction,
  listFontsAction,
  listWritingStylesAction,
];
