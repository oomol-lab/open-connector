import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema as ActionJsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "intrinio";

const identifierSchema = s.nonEmptyString(
  "An Intrinio ID or supported ticker, CIK, LEI, FIGI, ISIN, or CUSIP identifier.",
);
const pageSizeSchema = s.integer("The maximum number of records to return.", {
  minimum: 1,
});
const nextPageSchema = s.nonEmptyString("The pagination token returned by a previous Intrinio request.");
const rawCompanySchema = s.looseObject("A company record returned by Intrinio.");
const rawSecuritySchema = s.looseObject("A security record returned by Intrinio.");

function enumString(description: string, values: readonly string[]): ActionJsonSchema {
  return { type: "string", enum: [...values], description };
}

const searchCompaniesAction = defineProviderAction(service, {
  name: "search_companies",
  description: "Search Intrinio companies by ticker or company name.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching Intrinio companies.",
    {
      query: s.nonEmptyString("The ticker or company name text to search for."),
      active: s.boolean("Whether to return only actively traded companies."),
      mode: enumString("The matching mode to use for the search query.", ["starts_with"]),
      pageSize: pageSizeSchema,
    },
    { optional: ["active", "mode", "pageSize"] },
  ),
  outputSchema: s.object("The companies returned by Intrinio.", {
    companies: s.array("The matching companies.", rawCompanySchema),
  }),
});

const lookupCompanyAction = defineProviderAction(service, {
  name: "lookup_company",
  description: "Look up Intrinio company reference data and metadata by identifier.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for looking up an Intrinio company.", {
    identifier: identifierSchema,
  }),
  outputSchema: s.object("The company returned by Intrinio.", {
    company: rawCompanySchema,
  }),
});

const lookupSecurityAction = defineProviderAction(service, {
  name: "lookup_security",
  description: "Look up Intrinio security reference data by identifier.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for looking up an Intrinio security.", {
    identifier: identifierSchema,
  }),
  outputSchema: s.object("The security returned by Intrinio.", {
    security: rawSecuritySchema,
  }),
});

const getSecurityStockPricesAction = defineProviderAction(service, {
  name: "get_security_stock_prices",
  description: "Get historical end-of-day stock prices for an Intrinio security.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving historical Intrinio stock prices.",
    {
      identifier: identifierSchema,
      startDate: s.string("The inclusive start date in YYYY-MM-DD format.", {
        format: "date",
      }),
      endDate: s.string("The inclusive end date in YYYY-MM-DD format.", {
        format: "date",
      }),
      frequency: enumString("The time period represented by each returned stock price.", [
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "yearly",
      ]),
      pageSize: pageSizeSchema,
      nextPage: nextPageSchema,
    },
    { optional: ["startDate", "endDate", "frequency", "pageSize", "nextPage"] },
  ),
  outputSchema: s.object("The historical stock prices returned by Intrinio.", {
    stockPrices: s.array(
      "The historical stock price records.",
      s.looseObject("A historical stock price record returned by Intrinio."),
    ),
    security: s.nullable(rawSecuritySchema),
    nextPage: s.nullable(s.string("The token for the next page, or null at the end.")),
  }),
});

export const intrinioActions: readonly ActionDefinition[] = [
  searchCompaniesAction,
  lookupCompanyAction,
  lookupSecurityAction,
  getSecurityStockPricesAction,
];
