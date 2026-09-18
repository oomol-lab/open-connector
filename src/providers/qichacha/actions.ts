import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "qichacha";
const searchInputSchema = s.object(
  "A Qichacha company lookup and pagination request.",
  {
    searchKey: s.nonWhitespaceString("The exact company name or unified social credit code to query."),
    pageIndex: s.integer("The one-based page number. Defaults to 1.", { minimum: 1 }),
    pageSize: s.integer("The number of records per page. Defaults to 10 and cannot exceed 20.", {
      minimum: 1,
      maximum: 20,
    }),
  },
  { optional: ["pageIndex", "pageSize"] },
);
const paginationProperties = {
  pageIndex: s.positiveInteger("The one-based page number returned by Qichacha."),
  pageSize: s.positiveInteger("The page size returned by Qichacha."),
  totalRecords: s.nonNegativeInteger("The total number of matching records."),
  verifyResult: s.nullable(
    s.integer("Whether Qichacha found data for the company: 1 for found or 0 for not found.", {
      minimum: 0,
      maximum: 1,
    }),
  ),
  orderNumber: s.nullable(s.string("The Qichacha request order number.")),
};
const nullableString = (description: string) => s.nullable(s.string(description));
const shareholderSchema = s.object("A registered Qichacha shareholder record.", {
  keyNo: nullableString("The Qichacha shareholder identifier."),
  name: nullableString("The shareholder or investor name."),
  type: nullableString("The shareholder or investor type."),
  stockPercent: nullableString("The registered ownership percentage."),
  subscribedAmount: nullableString("The formatted subscribed capital amount."),
  subscribedCapital: nullableString("The numeric portion of the subscribed capital amount."),
  subscribedCapitalUnit: nullableString("The unit of the subscribed capital amount."),
  subscribedCapitalCurrency: nullableString("The currency code of the subscribed capital amount."),
  subscribedDate: nullableString("The subscribed capital date."),
  stakeDate: nullableString("The first registered ownership date."),
  creditCode: nullableString("The shareholder's unified social credit code."),
  area: nullableString("The shareholder's nationality, region, or registration area."),
  subscriptions: s.array(
    "The shareholder's individual subscribed contribution records.",
    s.object("One subscribed contribution record.", {
      contributionType: nullableString("The contribution method."),
      capital: nullableString("The subscribed capital amount in the parent record's unit."),
      date: nullableString("The subscribed contribution date."),
    }),
  ),
});
const legalRepresentativeSchema = s.nullable(
  s.object("The invested company's legal representative.", {
    keyNo: nullableString("The Qichacha person identifier."),
    name: nullableString("The legal representative name."),
  }),
);
const historicalInvestmentSchema = s.object("A historical Qichacha investment record.", {
  keyNo: nullableString("The Qichacha identifier of the invested company."),
  companyName: nullableString("The invested company name."),
  legalRepresentative: legalRepresentativeSchema,
  registeredCapital: nullableString("The formatted registered capital."),
  registeredCapitalValue: nullableString("The numeric portion of the registered capital."),
  registeredCapitalUnit: nullableString("The registered capital unit."),
  registeredCapitalCurrency: nullableString("The registered capital currency code."),
  fundedRatio: nullableString("The historical ownership percentage."),
  status: nullableString("The invested company's registration status."),
  startDate: nullableString("The invested company's establishment date."),
  subscribedAmount: nullableString("The formatted subscribed investment amount."),
  subscribedCapital: nullableString("The numeric portion of the subscribed investment amount."),
  subscribedCapitalUnit: nullableString("The subscribed investment amount unit."),
  subscribedCapitalCurrency: nullableString("The subscribed investment currency code."),
  exitDate: nullableString("The date on which the investment ended."),
});

export const qichachaActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_company_shareholders",
    operationType: "read",
    description:
      "List a company's shareholders and subscribed contribution details from Qichacha business registration data.",
    requiredScopes: [],
    inputSchema: searchInputSchema,
    outputSchema: s.object("A paginated Qichacha shareholder result.", {
      shareholders: s.array("The registered shareholder records.", shareholderSchema),
      ...paginationProperties,
    }),
  }),
  defineProviderAction(service, {
    name: "list_company_historical_investments",
    operationType: "read",
    description: "List a company's historical outbound investments and exit details from Qichacha.",
    requiredScopes: [],
    inputSchema: searchInputSchema,
    outputSchema: s.object("A paginated Qichacha historical investment result.", {
      historicalInvestments: s.array("The historical outbound investment records.", historicalInvestmentSchema),
      ...paginationProperties,
    }),
  }),
];
