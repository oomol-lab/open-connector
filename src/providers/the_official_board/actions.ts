import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "the_official_board" as const;

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const resultItemSchema = s.looseObject(
  "A result item returned by The Official Board. Fields vary by endpoint and available source data.",
);
const resultListSchema = s.requiredObject("A list response returned by The Official Board.", {
  result: s.array("The matching result items.", resultItemSchema),
});
const resultObjectSchema = s.requiredObject("An object response returned by The Official Board.", {
  result: resultItemSchema,
});

export const theOfficialBoardActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description: "Find company organizational chart identifiers by company name.",
    inputSchema: s.object(
      "Parameters for searching companies.",
      {
        companyName: nonEmptyString("The full or partial company name to search for."),
        amount: s.integer("The maximum number of matches to return, from 1 to 50.", {
          minimum: 1,
          maximum: 50,
        }),
      },
      { optional: ["companyName", "amount"] },
    ),
    outputSchema: resultListSchema,
  }),
  defineProviderAction(service, {
    name: "get_company_org_chart",
    operationType: "read",
    description: "Retrieve a company organizational chart and its executives in structured JSON.",
    inputSchema: s.requiredObject("Parameters for retrieving a company organizational chart.", {
      id: nonEmptyString("The company unique identifier returned by search_companies."),
    }),
    outputSchema: resultObjectSchema,
  }),
  defineProviderAction(service, {
    name: "search_executives",
    operationType: "read",
    description: "Search executives by first name, last name, or full name.",
    inputSchema: s.object(
      "Parameters for searching executives.",
      {
        name: nonEmptyString("The executive first name, last name, or full name to search for."),
        amount: s.integer("The maximum number of matches to return, from 1 to 200.", {
          minimum: 1,
          maximum: 200,
        }),
      },
      { optional: ["amount"] },
    ),
    outputSchema: resultListSchema,
  }),
  defineProviderAction(service, {
    name: "find_executive",
    operationType: "read",
    description: "Find executives by an exact email address or LinkedIn profile URL.",
    inputSchema: s.object(
      "Parameters for finding an executive by an exact identifier.",
      {
        email: s.string("The executive email address to match.", { format: "email" }),
        linkedin: s.string("The executive LinkedIn profile URL to match.", { format: "uri" }),
      },
      { optional: ["email", "linkedin"] },
    ),
    outputSchema: resultListSchema,
  }),
  defineProviderAction(service, {
    name: "get_executive_biography",
    operationType: "read",
    description: "Retrieve detailed biography information for an executive.",
    inputSchema: s.requiredObject("Parameters for retrieving an executive biography.", {
      bioId: nonEmptyString("The executive biography identifier returned by an executive search."),
    }),
    outputSchema: resultObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_direct_colleagues",
    operationType: "read",
    description: "List the direct colleagues in an executive's organizational environment.",
    inputSchema: s.requiredObject("Parameters for listing an executive's direct colleagues.", {
      bioId: nonEmptyString("The executive biography identifier returned by an executive search."),
    }),
    outputSchema: resultListSchema,
  }),
  defineProviderAction(service, {
    name: "list_recent_org_chart_news",
    operationType: "read",
    description: "List the main organizational chart changes for a company from the past 12 months.",
    inputSchema: s.requiredObject("Parameters for listing recent organizational chart news.", {
      id: nonEmptyString("The company unique identifier returned by search_companies."),
    }),
    outputSchema: resultListSchema,
  }),
  defineProviderAction(service, {
    name: "list_watchlist_changes",
    operationType: "read",
    description: "List recently modified organizational charts from the connected user's watchlist.",
    inputSchema: s.object(
      "Pagination parameters for watchlist changes.",
      {
        amount: s.integer("The number of changes to return.", { minimum: 1 }),
        page: s.integer("The one-based result page to return.", { minimum: 1 }),
      },
      { optional: ["amount", "page"] },
    ),
    outputSchema: resultListSchema,
  }),
];

export type TheOfficialBoardActionName =
  | "search_companies"
  | "get_company_org_chart"
  | "search_executives"
  | "find_executive"
  | "get_executive_biography"
  | "list_direct_colleagues"
  | "list_recent_org_chart_news"
  | "list_watchlist_changes";
