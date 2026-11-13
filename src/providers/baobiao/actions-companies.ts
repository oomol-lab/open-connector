import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  companyNameSchema,
  companyPaginationSchema,
  countSchema,
  namedProjectListItemSchema,
  pageIndexSchema,
  stringListSchema,
  pageNumberSchema,
  pageSizeSchema,
  projectInsightsSchema,
  relationshipSummarySchema,
  searchPageSchema,
} from "./schemas.ts";

const service = "baobiao";

const companyFollowUps = [
  "baobiao.get_company_summary",
  "baobiao.get_company_statistics",
  "baobiao.search_company_projects",
];

function companyPageInput(description: string, maximum: number): JsonSchema {
  return s.requiredObject(description, {
    companyName: companyNameSchema,
    pageNo: pageIndexSchema,
    pageSize: pageSizeSchema(maximum),
  });
}

function companyPageOutput(description: string, record: JsonSchema): JsonSchema {
  return s.looseObject(description, {
    companyName: s.string("Company name."),
    pagination: companyPaginationSchema,
    records: s.array("Records on this page.", record),
  });
}

const partnerRecordSchema = s.looseObject("One project relationship.", {
  partnerCompanyName: s.string("Partner company name."),
  relatedProjectId: s.string("Related project ID."),
  relatedProjectName: s.string("Related project name."),
  projectPublishTime: s.string("Publish time of the related project."),
  relationshipType: s.string("Relationship type."),
});

function unitSearchOutput(description: string, record: JsonSchema): JsonSchema {
  return s.looseObject(description, {
    total: countSchema("Total number of matching companies."),
    pageNo: s.integer("Current page number."),
    pageSize: s.integer("Records per page."),
    hasNext: s.boolean("Whether another page is available."),
    records: s.array("Companies on this page.", record),
  });
}

const unitSearchInputSchema = s.requiredObject("Company name search.", {
  companyName: s.nonWhitespaceString("Company name or part of it."),
  pageNo: s.optional(pageIndexSchema),
  pageSize: s.optional(pageSizeSchema(50)),
});

export const baobiaoCompanyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description:
      "Search Chinese companies by name, former name, legal representative, unified social credit code, or registration number, and return brief business-registration profiles.",
    followUpActions: ["baobiao.get_company_registration", ...companyFollowUps],
    inputSchema: s.requiredObject("Company search.", {
      keyword: s.nonWhitespaceString("Text to match."),
      filterFields: s.optional(
        s.array(
          "Fields to match; all of them when omitted: main__entname current name, main__history_entname former name, main__legal_person legal representative, main__uniscid unified social credit code, main__regno registration number.",
          s.stringEnum("Field to match.", [
            "main__entname",
            "main__history_entname",
            "main__legal_person",
            "main__uniscid",
            "main__regno",
          ]),
          { uniqueItems: true },
        ),
      ),
      pageNo: s.optional(pageIndexSchema),
      pageSize: s.optional(pageSizeSchema(20)),
    }),
    outputSchema: s.looseObject("A page of matching companies; records is empty when nothing matches.", {
      total: countSchema("Total number of matching companies."),
      pageNo: s.integer("Current page number."),
      pageSize: s.integer("Records per page."),
      records: s.array(
        "Companies on this page.",
        s.looseObject("One company.", {
          enterpriseId: s.string("Company ID."),
          enterpriseName: s.string("Current name."),
          historyNames: stringListSchema("Former names."),
          operatingStatus: s.nullableString("Operating status."),
          registeredCapitalAmount: s.nullableNumber("Registered capital in 10,000 yuan."),
          regionName: s.nullableString("Region name."),
          industryName: s.nullableString("Industry name."),
          enterpriseType: s.nullableString("Company type."),
          registrationNo: s.nullableString("Registration number."),
          creditCode: s.nullableString("Unified social credit code."),
          address: s.nullableString("Registered address."),
          establishedDate: s.nullableString("Establishment date."),
          legalRepresentative: s.nullableString("Legal representative."),
          longitude: s.nullableString("Longitude."),
          latitude: s.nullableString("Latitude."),
          logoUrl: s.nullableString("Logo URL."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_registration",
    operationType: "read",
    description:
      "Read a company's full business registration record: codes, legal representative, capital, status, operating period, scope, address, tax details, industry chain, headcount, listing status, contacts, and tags.",
    followUpActions: companyFollowUps,
    inputSchema: s.requiredObject("Company to look up.", {
      query: s.nonWhitespaceString(
        "Company name, unified social credit code, registration number, or organization code.",
      ),
      keyType: s.optional(
        s.stringEnum(
          "What query contains: 1 company name, 2 unified social credit code, 3 registration number, 4 organization code. Defaults to 1.",
          ["1", "2", "3", "4"],
        ),
      ),
    }),
    outputSchema: s.requiredObject("Registration record.", {
      company: s.nullable(
        s.looseObject("Registration record, or null when no company matches.", {
          enterpriseName: s.string("Company name."),
          creditCode: s.nullableString("Unified social credit code."),
          registrationNumber: s.nullableString("Registration number."),
          organizationCode: s.nullableString("Organization code."),
          legalRepresentativeName: s.nullableString("Legal representative."),
          registeredCapitalAmount: s.unknown("Registered capital as returned by Baobiao."),
          registeredCapitalCurrency: s.nullableString("Registered capital currency."),
          paidInCapitalAmount: s.unknown("Paid-in capital as returned by Baobiao."),
          operatingStatusName: s.nullableString("Operating status."),
          enterpriseTypeName: s.nullableString("Company type."),
          establishedDate: s.nullableString("Establishment date."),
          operatingPeriodStartDate: s.nullableString("Operating period start."),
          operatingPeriodEndDate: s.nullableString("Operating period end."),
          address: s.nullableString("Address."),
          registrationAuthority: s.nullableString("Registration authority."),
          businessScope: s.nullableString("Business scope."),
          taxpayerTypeName: s.nullableString("Taxpayer type."),
          taxCreditRating: s.nullableString("Tax credit rating."),
          industryName: s.nullableString("Full industry chain."),
          employeeCount: s.nullableInteger("Employees."),
          insuredEmployeeCount: s.nullableInteger("Insured employees."),
          formerName: s.nullableString("Former name."),
          website: s.nullableString("Website."),
          phoneNumber: s.nullableString("Published phone number."),
          email: s.nullableString("Published email."),
          listedFlag: s.nullableInteger("Whether the company is listed."),
          tags: s.array("Company tags.", s.unknown("Tag.")),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_business_info",
    operationType: "read",
    description:
      "Read a company's key business information from a third-party registry: type, industry, region, capital, headcount, status, credit code, scope, and its tender and award counts.",
    followUpActions: companyFollowUps,
    inputSchema: s.requiredObject("Company to look up.", { companyName: companyNameSchema }),
    outputSchema: s.requiredObject("Business information.", {
      company: s.nullable(
        s.looseObject("Business information, or null when the registry has no match.", {
          enterpriseId: s.unknown("Company ID; Baobiao may return it as a number or a string."),
          enterpriseName: s.string("Company name."),
          enterpriseTypeName: s.nullableString("Company type."),
          industryName: s.nullableString("Industry."),
          province: s.nullableString("Province."),
          city: s.nullableString("City."),
          county: s.nullableString("County."),
          registeredCapitalAmount: s.nullableNumber("Registered capital in 10,000 yuan."),
          employeeCount: s.nullableInteger("Employees."),
          operatingStatusName: s.nullableString("Operating status."),
          biddingCount: s.nullableInteger("Number of tenders issued."),
          winningCount: s.nullableInteger("Number of awards won."),
          creditCode: s.nullableString("Unified social credit code."),
          establishedDate: s.nullableString("Establishment date."),
          businessScope: s.nullableString("Business scope."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_summary",
    operationType: "read",
    description:
      "Read a company profile summary: registration, capital, operation and contact details, bid and award statistics by industry, relationship counts, and which datasets have data.",
    followUpActions: [
      "baobiao.list_company_contacts",
      "baobiao.list_company_customers",
      "baobiao.list_company_suppliers",
      "baobiao.search_company_projects",
    ],
    inputSchema: s.requiredObject("Company to profile.", { companyName: companyNameSchema }),
    outputSchema: s.looseObject("Company profile summary.", {
      companyName: s.string("Company name."),
      baseInfo: s.looseObject(
        "Registration, capital, operation, and contact details: enterpriseProfile, registrationInfo, operationInfo, and contactInfo.",
      ),
      projectInsights: projectInsightsSchema,
      relationshipSummary: relationshipSummarySchema,
      dataStatus: s.looseObject("Which datasets have data for this company.", {
        baseInfoAvailable: s.boolean("Whether registration details were found."),
        projectStatisticsAvailable: s.boolean("Whether project statistics were found."),
        contactsAvailable: s.boolean("Whether contacts were found."),
        customersAvailable: s.boolean("Whether customers were found."),
        suppliersAvailable: s.boolean("Whether suppliers were found."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_statistics",
    operationType: "read",
    description:
      "Read a company's bid and award statistics by industry and its contact, customer, and supplier relationship counts, without registration details.",
    followUpActions: ["baobiao.list_company_customers", "baobiao.list_company_suppliers"],
    inputSchema: s.requiredObject("Company to analyze.", { companyName: companyNameSchema }),
    outputSchema: s.looseObject("Company statistics.", {
      companyName: s.string("Company name."),
      projectInsights: projectInsightsSchema,
      relationshipSummary: relationshipSummarySchema,
      dataStatus: s.looseObject("Which datasets have data for this company."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_company_contacts",
    operationType: "read",
    description:
      "List contact people and phone numbers that appeared in a company's tender and award notices. The result contains personal data; use it only for lawful business contact.",
    inputSchema: companyPageInput("Company whose contacts to list.", 5),
    outputSchema: companyPageOutput(
      "A page of contacts.",
      s.looseObject("One contact.", {
        contactName: s.string("Contact name."),
        contactPhones: stringListSchema("Phone numbers."),
      }),
    ),
  }),
  defineProviderAction(service, {
    name: "list_company_customers",
    operationType: "read",
    description: "List the buyers a company has supplied, one record per related project.",
    followUpActions: companyFollowUps,
    inputSchema: companyPageInput("Company whose customers to list.", 20),
    outputSchema: companyPageOutput("A page of customer relationships.", partnerRecordSchema),
  }),
  defineProviderAction(service, {
    name: "list_company_suppliers",
    operationType: "read",
    description: "List the suppliers a company has bought from, one record per related project.",
    followUpActions: companyFollowUps,
    inputSchema: companyPageInput("Company whose suppliers to list.", 20),
    outputSchema: companyPageOutput("A page of supplier relationships.", partnerRecordSchema),
  }),
  defineProviderAction(service, {
    name: "search_purchasing_units",
    operationType: "read",
    description:
      "Find buyers (tendering organizations) whose name contains the given text, with their historical tender count, total tender amount, and contact and supplier counts.",
    followUpActions: companyFollowUps,
    inputSchema: unitSearchInputSchema,
    outputSchema: unitSearchOutput(
      "A page of buyers.",
      s.looseObject("One buyer.", {
        companyName: s.string("Company name."),
        region: s.nullableString("Province and city, or null."),
        bidCount: countSchema("Historical tender count."),
        totalBidAmount: s.number("Historical tender amount in yuan."),
        contactCount: countSchema("Number of contacts."),
        supplierCount: countSchema("Number of supplier relationships."),
      }),
    ),
  }),
  defineProviderAction(service, {
    name: "search_winning_suppliers",
    operationType: "read",
    description:
      "Find suppliers (winning bidders) whose name contains the given text, with their historical award count, total award amount, and contact and customer counts.",
    followUpActions: companyFollowUps,
    inputSchema: unitSearchInputSchema,
    outputSchema: unitSearchOutput(
      "A page of suppliers.",
      s.looseObject("One supplier.", {
        companyName: s.string("Company name."),
        region: s.nullableString("Province and city, or null."),
        winCount: countSchema("Historical award count."),
        totalWinAmount: s.number("Historical award amount in yuan."),
        contactCount: countSchema("Number of contacts."),
        customerCount: countSchema("Number of customer relationships."),
      }),
    ),
  }),
  defineProviderAction(service, {
    name: "search_company_projects",
    operationType: "read",
    description: "List the tender and award notices a company took part in as buyer, supplier, or agency.",
    followUpActions: ["baobiao.get_project_text", "baobiao.get_project_structure"],
    inputSchema: s.requiredObject("Company whose notices to list.", {
      companyName: s.nonWhitespaceString("Company name as buyer, supplier, or agency."),
      pageId: pageIndexSchema,
      pageNumber: s.optional(pageNumberSchema(100)),
    }),
    outputSchema: searchPageSchema("A page of the company's notices.", namedProjectListItemSchema),
  }),
];
