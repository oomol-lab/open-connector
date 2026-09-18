import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tianyancha";

const keywordSchema = s.nonWhitespaceString(
  "A company name, Tianyancha company ID, registration number, or unified social credit code.",
);
const pageNumSchema = s.integer("The one-based page number. Defaults to 1.", { minimum: 1 });
const pageSizeSchema = s.integer("The number of records per page. Defaults to 20 and cannot exceed 20.", {
  minimum: 1,
  maximum: 20,
});
const rawRecordSchema = s.looseObject("A record returned by Tianyancha. Available fields depend on the purchased API.");
const rawPayloadSchema = s.looseObject(
  "A payload returned by Tianyancha. Available fields depend on the purchased API.",
);
const relationshipTypeValues: readonly string[] = [
  "legal_representative",
  "employment",
  "investment",
  "branch",
  "legal",
  "pledge_and_mortgage",
  "business_cooperation",
  "shared_contact",
  "historical_shareholder",
  "historical_employment",
  "historical_legal_representative",
  "all",
];

function pagedOutput(itemName: string, itemDescription: string): JsonSchema {
  return s.object(`A paginated Tianyancha ${itemName} result.`, {
    [itemName]: s.array(itemDescription, rawRecordSchema),
    total: s.nonNegativeInteger("The total number of matching records reported by Tianyancha."),
    pageNum: s.positiveInteger("The requested one-based page number."),
    pageSize: s.positiveInteger("The requested number of records per page."),
  });
}

const companyNewsInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for listing Tianyancha company news.",
    {
      companyName: s.nonWhitespaceString("The exact company name."),
      companyId: s.positiveInteger("The Tianyancha company ID."),
      startDate: s.date("The earliest publication date to include, in YYYY-MM-DD format."),
      endDate: s.date("The latest publication date to include, in YYYY-MM-DD format."),
      tags: s.stringArray("The Tianyancha news tags to include.", {
        minItems: 1,
        itemDescription: "A Tianyancha news tag.",
      }),
      pageNum: pageNumSchema,
      pageSize: pageSizeSchema,
    },
    { optional: ["companyName", "companyId", "startDate", "endDate", "tags", "pageNum", "pageSize"] },
  ),
  anyOf: [{ required: ["companyName"] }, { required: ["companyId"] }],
};

const companyRelationshipInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for finding Tianyancha relationship paths between two companies.",
    {
      sourceCompanyName: s.nonWhitespaceString("The exact source company name."),
      sourceCompanyId: s.positiveInteger("The Tianyancha source company ID."),
      targetCompanyName: s.nonWhitespaceString("The exact target company name."),
      targetCompanyId: s.positiveInteger("The Tianyancha target company ID."),
      relationshipTypes: s.array(
        "The relationship categories to search. Omit this field to use Tianyancha's default categories.",
        s.stringEnum("A relationship category.", relationshipTypeValues),
        { minItems: 1 },
      ),
      maxDepth: s.integer("The maximum relationship search depth. Defaults to 2.", {
        minimum: 1,
        maximum: 10,
      }),
    },
    {
      optional: [
        "sourceCompanyName",
        "sourceCompanyId",
        "targetCompanyName",
        "targetCompanyId",
        "relationshipTypes",
        "maxDepth",
      ],
    },
  ),
  allOf: [
    { anyOf: [{ required: ["sourceCompanyName"] }, { required: ["sourceCompanyId"] }] },
    { anyOf: [{ required: ["targetCompanyName"] }, { required: ["targetCompanyId"] }] },
  ],
};

export const tianyanchaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description: "Search Tianyancha for companies by keyword and return matching company records.",
    inputSchema: s.object(
      "The input payload for searching companies with Tianyancha.",
      {
        keyword: s.nonWhitespaceString("The company search keyword."),
        pageNum: pageNumSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["pageNum", "pageSize"] },
    ),
    outputSchema: pagedOutput("companies", "The company records matching the search keyword."),
  }),
  defineProviderAction(service, {
    name: "search_companies_advanced",
    operationType: "read",
    description: "Search Tianyancha for companies by keyword, industry, and region.",
    inputSchema: s.object(
      "The input payload for an advanced Tianyancha company search.",
      {
        keyword: s.nonWhitespaceString("The company search keyword."),
        industryCode: s.nonWhitespaceString("The GB/T 4754-2017 industry code used to filter companies."),
        areaCode: s.nonWhitespaceString("The Tianyancha administrative area code used to filter companies."),
        pageNum: pageNumSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["industryCode", "areaCode", "pageNum", "pageSize"] },
    ),
    outputSchema: pagedOutput("companies", "The companies matching the search filters."),
  }),
  defineProviderAction(service, {
    name: "get_company_basic_info",
    operationType: "read",
    description: "Get Tianyancha company registration details by company identifier.",
    inputSchema: s.object("The input payload for retrieving Tianyancha company details.", {
      keyword: keywordSchema,
    }),
    outputSchema: s.object("The Tianyancha company details result.", {
      company: s.nullable(rawRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "verify_company_identity",
    operationType: "read",
    description: "Verify that a company name, legal representative, and registration code identify the same company.",
    inputSchema: s.object("The input payload for verifying a Tianyancha company identity.", {
      companyName: s.nonWhitespaceString("The exact company name to verify."),
      legalPersonName: s.nonWhitespaceString("The legal representative name to verify."),
      registrationCode: s.nonWhitespaceString(
        "The unified social credit code, registration number, or organization code to verify.",
      ),
    }),
    outputSchema: s.object("The Tianyancha company identity verification result.", {
      matchStatus: s.nullable(
        s.integer(
          "The match status: 0 for no match, 1 for a full match, or 2 when the company name may be a former name and the other fields match.",
          { minimum: 0, maximum: 2 },
        ),
      ),
      remark: s.nullableString("The verification explanation returned by Tianyancha."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_contact_info",
    operationType: "read",
    description: "Get a company's phone numbers, email addresses, websites, and registered address.",
    inputSchema: s.object("The input payload for retrieving Tianyancha company contact details.", {
      keyword: keywordSchema,
    }),
    outputSchema: s.object("The Tianyancha company contact result.", {
      contact: s.nullable(rawPayloadSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_company_key_personnel",
    operationType: "read",
    description: "List a company's directors, supervisors, and senior managers from Tianyancha.",
    inputSchema: s.object(
      "The input payload for listing Tianyancha company key personnel.",
      { keyword: keywordSchema, pageNum: pageNumSchema, pageSize: pageSizeSchema },
      { optional: ["pageNum", "pageSize"] },
    ),
    outputSchema: pagedOutput("personnel", "The directors, supervisors, and senior managers returned by Tianyancha."),
  }),
  defineProviderAction(service, {
    name: "list_company_shareholders",
    operationType: "read",
    description: "List a company's shareholders and contribution details from Tianyancha.",
    inputSchema: s.object(
      "The input payload for listing Tianyancha company shareholders.",
      {
        keyword: keywordSchema,
        pageNum: pageNumSchema,
        pageSize: pageSizeSchema,
        source: s.integer(
          "The shareholder data source: 1 for business registration or 2 for the latest public filing. Defaults to 1.",
          { minimum: 1, maximum: 2 },
        ),
      },
      { optional: ["pageNum", "pageSize", "source"] },
    ),
    outputSchema: pagedOutput("shareholders", "The shareholder and contribution records returned by Tianyancha."),
  }),
  defineProviderAction(service, {
    name: "list_company_investments",
    operationType: "read",
    description: "List companies directly invested in by a company using Tianyancha.",
    inputSchema: s.object(
      "The input payload for listing Tianyancha company investments.",
      { keyword: keywordSchema, pageNum: pageNumSchema, pageSize: pageSizeSchema },
      { optional: ["pageNum", "pageSize"] },
    ),
    outputSchema: pagedOutput("investments", "The directly invested company records returned by Tianyancha."),
  }),
  defineProviderAction(service, {
    name: "list_company_equity_changes",
    operationType: "read",
    description: "List a company's disclosed equity changes, including shareholders before and after each change.",
    inputSchema: s.object(
      { keyword: keywordSchema, pageNum: pageNumSchema, pageSize: pageSizeSchema },
      { required: ["keyword"] },
    ),
    outputSchema: pagedOutput("equityChanges", "The disclosed equity change records returned by Tianyancha."),
  }),
  defineProviderAction(service, {
    name: "list_company_historical_shareholders",
    operationType: "read",
    description: "List a company's historical shareholders, ownership ratios, and subscribed capital from Tianyancha.",
    inputSchema: s.object(
      { keyword: keywordSchema, pageNum: pageNumSchema, pageSize: pageSizeSchema },
      { required: ["keyword"] },
    ),
    outputSchema: pagedOutput("historicalShareholders", "The historical shareholder records returned by Tianyancha."),
  }),
  defineProviderAction(service, {
    name: "list_company_historical_investments",
    operationType: "read",
    description: "List companies previously invested in by a company using Tianyancha.",
    inputSchema: s.object(
      { keyword: keywordSchema, pageNum: pageNumSchema, pageSize: pageSizeSchema },
      { required: ["keyword"] },
    ),
    outputSchema: pagedOutput(
      "historicalInvestments",
      "The historical outbound investment records returned by Tianyancha.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_company_branches",
    operationType: "read",
    description: "List a company's branch organizations and their registration details.",
    inputSchema: s.object(
      "The input payload for listing Tianyancha company branches.",
      { keyword: keywordSchema, pageNum: pageNumSchema, pageSize: pageSizeSchema },
      { optional: ["pageNum", "pageSize"] },
    ),
    outputSchema: pagedOutput("branches", "The company branch records returned by Tianyancha."),
  }),
  defineProviderAction(service, {
    name: "list_company_changes",
    operationType: "read",
    description: "List a company's registration changes, including before and after values.",
    inputSchema: s.object(
      "The input payload for listing Tianyancha company registration changes.",
      { keyword: keywordSchema, pageNum: pageNumSchema, pageSize: pageSizeSchema },
      { optional: ["pageNum", "pageSize"] },
    ),
    outputSchema: pagedOutput("changes", "The company registration change records returned by Tianyancha."),
  }),
  defineProviderAction(service, {
    name: "get_company_annual_reports",
    operationType: "read",
    description:
      "Get a company's annual reports, including disclosed financial, shareholder, investment, and social security information.",
    inputSchema: s.object(
      "The input payload for retrieving Tianyancha company annual reports.",
      {
        keyword: keywordSchema,
        year: s.nonWhitespaceString("The report year to retrieve. Omit it to retrieve every available year."),
      },
      { optional: ["year"] },
    ),
    outputSchema: s.object("The Tianyancha company annual report result.", {
      annualReports: s.array("The annual report records returned by Tianyancha.", rawRecordSchema),
      total: s.nonNegativeInteger("The total number of annual reports returned by Tianyancha."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_risk",
    operationType: "read",
    description: "Get a company's Tianyancha risk summary, including own, related, historical, and alert risks.",
    inputSchema: s.object("The input payload for retrieving Tianyancha company risks.", {
      keyword: keywordSchema,
    }),
    outputSchema: s.object("The Tianyancha company risk summary.", {
      riskLevel: s.nullableString("The overall risk level returned by Tianyancha."),
      risks: s.array(
        "Risk groups returned by Tianyancha.",
        s.looseObject("A Tianyancha risk group with its nested risk categories and entries."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_risk_detail",
    operationType: "read",
    description: "Get one page of detailed Tianyancha risk records using a risk ID and type from get_company_risk.",
    inputSchema: s.object(
      "The input payload for retrieving Tianyancha company risk details.",
      {
        riskId: s.positiveInteger("The risk ID returned by get_company_risk."),
        riskType: s.positiveInteger("The Tianyancha risk type code returned by get_company_risk."),
        pageNum: pageNumSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["pageNum", "pageSize"] },
    ),
    outputSchema: s.object("A paginated Tianyancha company risk detail result.", {
      riskType: s.positiveInteger("The Tianyancha risk type code."),
      records: s.array("The detailed risk records returned by Tianyancha.", rawRecordSchema),
      total: s.nonNegativeInteger("The total number of detailed risk records."),
      pageNum: s.positiveInteger("The returned one-based page number."),
      pageSize: s.positiveInteger("The requested number of records per page."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_judicial_risk",
    operationType: "read",
    description:
      "Get a company's combined legal cases, hearings, court notices, enforcement, dishonesty, filing, and service-announcement data.",
    inputSchema: s.object("The input payload for retrieving Tianyancha judicial risk data.", {
      keyword: keywordSchema,
    }),
    outputSchema: s.object("The combined Tianyancha judicial risk result.", {
      judicialRisk: s.nullable(rawPayloadSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_development_info",
    operationType: "read",
    description:
      "Get a company's core team, products, financing history, investment events, competitors, and investment institutions.",
    inputSchema: s.object("The input payload for retrieving Tianyancha company development data.", {
      keyword: keywordSchema,
    }),
    outputSchema: s.object("The combined Tianyancha company development result.", {
      development: s.nullable(rawPayloadSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_intellectual_property",
    operationType: "read",
    description: "Get a company's trademarks, patents, software copyrights, works copyrights, and ICP registrations.",
    inputSchema: s.object("The input payload for retrieving Tianyancha company intellectual property.", {
      keyword: keywordSchema,
    }),
    outputSchema: s.object("The combined Tianyancha company intellectual-property result.", {
      intellectualProperty: s.nullable(rawPayloadSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_company_ultimate_beneficiaries",
    operationType: "read",
    description:
      "List a company's ultimate beneficiaries, ownership percentages, and ownership chains from Tianyancha.",
    inputSchema: s.object(
      "The input payload for listing Tianyancha company ultimate beneficiaries.",
      { keyword: keywordSchema, pageNum: pageNumSchema, pageSize: pageSizeSchema },
      { optional: ["pageNum", "pageSize"] },
    ),
    outputSchema: pagedOutput(
      "beneficiaries",
      "The ultimate beneficiary records and ownership chains returned by Tianyancha.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_company_actual_control",
    operationType: "read",
    description: "Get a company's suspected actual controllers, ownership ratios, and control paths from Tianyancha.",
    inputSchema: s.object("The input payload for retrieving Tianyancha actual-control data.", {
      keyword: keywordSchema,
    }),
    outputSchema: s.object("The Tianyancha suspected actual-control result.", {
      controllers: s.array("The suspected actual controllers returned by Tianyancha.", rawRecordSchema),
      paths: s.looseObject("The provider-defined ownership paths keyed by Tianyancha path ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_company_relationship_paths",
    operationType: "read",
    description:
      "Find the shortest ownership, employment, legal, business, or historical relationship paths between two companies.",
    inputSchema: companyRelationshipInputSchema,
    outputSchema: s.object("The Tianyancha company relationship-path result.", {
      hasRelationship: s.boolean("Whether Tianyancha found at least one relationship path."),
      paths: s.array("The shortest relationship paths returned by Tianyancha.", rawPayloadSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_tenders",
    operationType: "read",
    description:
      "Search Tianyancha tender and bid notices by keyword, participant role, notice type, province, and publication date.",
    inputSchema: s.object(
      "The input payload for searching Tianyancha tender and bid notices.",
      {
        keyword: s.nonWhitespaceString("A keyword matched against titles, purchasers, or suppliers."),
        searchTypes: s.array(
          "The fields to search. Omit this field to use Tianyancha's default.",
          s.stringEnum("A tender search field.", ["title", "purchaser", "supplier"]),
          { minItems: 1 },
        ),
        noticeType: s.stringEnum("The tender notice type to include.", ["forecast", "announcement", "result"]),
        province: s.nonWhitespaceString("The province used to filter results."),
        publishStartDate: s.date("The earliest publication date to include, in YYYY-MM-DD format."),
        publishEndDate: s.date("The latest publication date to include, in YYYY-MM-DD format."),
        pageNum: pageNumSchema,
        pageSize: pageSizeSchema,
      },
      {
        optional: [
          "searchTypes",
          "noticeType",
          "province",
          "publishStartDate",
          "publishEndDate",
          "pageNum",
          "pageSize",
        ],
      },
    ),
    outputSchema: pagedOutput("tenders", "The tender and bid notices matching the search filters."),
  }),
  defineProviderAction(service, {
    name: "list_company_news",
    operationType: "read",
    description: "List Tianyancha news for an exact company, optionally filtered by publication date and tags.",
    inputSchema: companyNewsInputSchema,
    outputSchema: pagedOutput("news", "The company news records returned by Tianyancha."),
  }),
];
