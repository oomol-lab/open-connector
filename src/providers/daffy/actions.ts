import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "daffy";

const emptyInput = s.actionInput({}, [], "The input payload for this Daffy action.");
const rawDaffyObject = s.looseObject("A raw Daffy resource object.");
const page = s.positiveInteger("The Daffy result page to request.");
const paginationMeta = s.looseObject("The pagination metadata returned by Daffy.", {
  count: s.nullableInteger("The total number of records returned by Daffy."),
  page: s.nullableInteger("The current page number returned by Daffy."),
  last: s.nullableInteger("The last page number returned by Daffy."),
});

function pathIdentifier(description: string): JsonSchema {
  return s.anyOf(description, [s.nonEmptyString(description), s.positiveInteger(description)]);
}

function output(properties: Record<string, JsonSchema>, description: string): JsonSchema {
  return s.actionOutput(properties, description);
}

export type DaffyActionName =
  | "get_current_user"
  | "get_user"
  | "get_balance"
  | "list_user_causes"
  | "search_nonprofits"
  | "get_nonprofit"
  | "list_contributions"
  | "list_donations"
  | "list_user_donations"
  | "get_user_donation";

export const daffyActions: Array<ProviderActionDefinition<DaffyActionName>> = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Daffy user associated with the API key.",
    inputSchema: emptyInput,
    outputSchema: output({ user: rawDaffyObject }, "The Daffy current user response."),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a Daffy user by username.",
    inputSchema: s.actionInput({ username: s.nonEmptyString("The Daffy username.") }, ["username"]),
    outputSchema: output({ user: rawDaffyObject }, "The Daffy user response."),
  }),
  defineProviderAction(service, {
    name: "get_balance",
    description: "Get the balance for the Daffy account associated with the API key.",
    inputSchema: emptyInput,
    outputSchema: output({ balance: rawDaffyObject }, "The Daffy balance response."),
  }),
  defineProviderAction(service, {
    name: "list_user_causes",
    description: "List causes associated with a Daffy user.",
    inputSchema: s.actionInput({ userId: pathIdentifier("The Daffy user identifier.") }, ["userId"]),
    outputSchema: output(
      { causes: s.array(rawDaffyObject, { description: "The causes returned by Daffy." }) },
      "The Daffy user causes response.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_nonprofits",
    description: "Search Daffy nonprofits with optional cause and pagination filters.",
    inputSchema: s.object(
      {
        query: s.nonEmptyString("The search query used to filter Daffy nonprofits."),
        causeId: s.positiveInteger("The Daffy cause identifier used to filter nonprofits."),
        page,
      },
      {
        optional: ["query", "causeId", "page"],
        description: "The input payload for searching Daffy nonprofits.",
      },
    ),
    outputSchema: output(
      {
        meta: paginationMeta,
        nonprofits: s.array(rawDaffyObject, { description: "The nonprofits returned by Daffy." }),
      },
      "The Daffy nonprofit search response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_nonprofit",
    description: "Get a Daffy nonprofit by EIN.",
    inputSchema: s.actionInput({ ein: s.nonEmptyString("The nonprofit EIN used by Daffy.") }, ["ein"]),
    outputSchema: output({ nonprofit: rawDaffyObject }, "The Daffy nonprofit response."),
  }),
  defineProviderAction(service, {
    name: "list_contributions",
    description: "List contributions for the Daffy account associated with the API key.",
    inputSchema: s.object(
      { page },
      { optional: ["page"], description: "The input payload for a paginated Daffy list action." },
    ),
    outputSchema: output(
      {
        meta: paginationMeta,
        contributions: s.array(rawDaffyObject, { description: "The contributions returned by Daffy." }),
      },
      "The Daffy contributions response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_donations",
    description: "List donations for the Daffy account associated with the API key.",
    inputSchema: s.object(
      { page },
      { optional: ["page"], description: "The input payload for a paginated Daffy list action." },
    ),
    outputSchema: output(
      {
        meta: paginationMeta,
        donations: s.array(rawDaffyObject, { description: "The donations returned by Daffy." }),
      },
      "The Daffy donations response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_user_donations",
    description: "List Daffy donations for a specific user.",
    inputSchema: s.object(
      {
        userId: pathIdentifier("The Daffy user identifier."),
        page,
      },
      {
        required: ["userId"],
        optional: ["page"],
        description: "The input payload for listing Daffy user donations.",
      },
    ),
    outputSchema: output(
      {
        meta: paginationMeta,
        donations: s.array(rawDaffyObject, { description: "The donations returned by Daffy." }),
      },
      "The Daffy user donations response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user_donation",
    description: "Get a specific Daffy donation for a specific user.",
    inputSchema: s.actionInput(
      {
        userId: pathIdentifier("The Daffy user identifier."),
        donationId: pathIdentifier("The Daffy donation identifier."),
      },
      ["userId", "donationId"],
    ),
    outputSchema: output({ donation: rawDaffyObject }, "The Daffy user donation response."),
  }),
];
