import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "insites" as const;

const reportIdSchema = s.nonEmptyString("The Insites audit report ID.");
const auditPayloadSchema = s.looseObject("The account-configured Insites audit data returned for this website.");
const auditResultSchema = s.object(
  "The current state and optional data for one Insites audit.",
  {
    status: s.string("The request status returned by Insites."),
    reportStatus: s.string("The audit processing state returned by Insites."),
    report: s.nullable(auditPayloadSchema),
  },
  { optional: ["report"] },
);

const getAuditInputFields = {
  reportId: reportIdSchema,
  includeDatasets: s.boolean("Whether to include additional datasets such as broken links."),
  availableVersions: s.boolean("Whether to include the IDs of available audit versions."),
  versionId: s.nonEmptyString("A specific audit version ID to retrieve."),
  staging: s.boolean("Whether to retrieve the staging audit associated with this business."),
  categories: s.boolean("Whether to include categories from the account overview layout."),
  percentiles: s.boolean("Whether to include percentile data for this business."),
} as const;

const getAuditOptionalFields = [
  "includeDatasets",
  "availableVersions",
  "versionId",
  "staging",
  "categories",
  "percentiles",
] as const;

const filterSchema = s.requiredObject("One Insites audit search filter.", {
  operator: s.stringEnum("The comparison operator applied by Insites.", [
    "equal",
    "not_equal",
    "more_than",
    "less_than",
    "str_contains",
  ]),
  property: s.nonEmptyString("A documented audit property, such as domain, overall_score, or report_id."),
  targetValue: s.anyOf("The value compared against the selected audit property.", [
    s.string("A string filter value."),
    s.number("A numeric filter value."),
    s.boolean("A boolean filter value."),
  ]),
});

export const insitesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "start_audit",
    operationType: "write",
    description: "Start an Insites SEO and AEO website audit and return the report ID for status polling.",
    asyncLifecycle: {
      startActionId: "insites.start_audit",
      statusActionId: "insites.get_audit",
    },
    inputSchema: s.object(
      "The website and optional business details used to start an Insites audit.",
      {
        url: s.nonEmptyString("The website URL or hostname to analyze."),
        priority: s.stringEnum("The audit queue priority.", ["normal", "batch"]),
        dedupeMethod: s.stringEnum("How Insites matches this request to an existing audit.", [
          "none",
          "match_hostname",
        ]),
        customerName: s.string("The customer name used when the audit is shared by email."),
        customerEmail: s.string("The customer email used when the audit is shared by email.", {
          format: "email",
        }),
        businessName: s.string("The business name used by local presence and review checks."),
        phone: s.string("The business phone number used by local presence and review checks."),
        address: s.string("The first line of the business address."),
        buildingNumber: s.string("The building number used to improve location accuracy."),
        street: s.string("The street name used to improve location accuracy."),
        city: s.string("The business city used to improve location accuracy."),
        state: s.string("The business state or county used to improve location accuracy."),
        postalCode: s.string("The business ZIP code or postcode."),
        countryCode: s.string("The ISO 3166-1 alpha-2 business country code.", { minLength: 2, maxLength: 2 }),
        latitude: s.string("The business latitude used to improve location accuracy."),
        longitude: s.string("The business longitude used to improve location accuracy."),
        googlePlaceId: s.string("The Google Place ID for the business."),
        products: s.string("Comma-separated products and services offered by the business."),
        locations: s.string("Comma-separated locations served by the business."),
        competitorReportId: s.string("An existing audit ID to which this audit should be added as a competitor."),
        pagesToAnalyze: s.integer("The number of website pages to include in the audit.", {
          minimum: 1,
        }),
        generateKeywords: s.boolean("Whether Insites should automatically generate business keywords."),
      },
      {
        optional: [
          "priority",
          "dedupeMethod",
          "customerName",
          "customerEmail",
          "businessName",
          "phone",
          "address",
          "buildingNumber",
          "street",
          "city",
          "state",
          "postalCode",
          "countryCode",
          "latitude",
          "longitude",
          "googlePlaceId",
          "products",
          "locations",
          "competitorReportId",
          "pagesToAnalyze",
          "generateKeywords",
        ],
      },
    ),
    outputSchema: s.requiredObject("The newly queued Insites audit.", {
      status: s.string("The request status returned by Insites."),
      reportId: reportIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_audit",
    operationType: "read",
    description: "Get the processing state and account-configured JSON result for one Insites audit.",
    asyncLifecycle: {
      startActionId: "insites.start_audit",
      statusActionId: "insites.get_audit",
    },
    inputSchema: s.object("The audit and optional result sections to retrieve.", getAuditInputFields, {
      optional: getAuditOptionalFields,
    }),
    outputSchema: auditResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_llm_audit",
    operationType: "read",
    description: "Get the LLM-optimized JSON result for one Insites audit with a compact AI-oriented payload.",
    inputSchema: s.requiredObject("The Insites audit to retrieve in LLM-optimized form.", {
      reportId: reportIdSchema,
    }),
    outputSchema: auditResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_audits",
    operationType: "read",
    description: "Search existing Insites audits with documented filters, ordering, and offset pagination.",
    inputSchema: s.object(
      "The filters, ordering, and pagination applied to the Insites audit search.",
      {
        filters: s.array("The filters applied to existing audits.", filterSchema),
        orderBy: s.stringEnum("The audit property used to order results.", [
          "id",
          "user_email",
          "report_hash",
          "run_date",
          "overall_score",
          "overall",
        ]),
        orderDirection: s.stringEnum("The audit result sort direction.", ["asc", "desc"]),
        limit: s.integer("The maximum number of audit rows to return.", {
          minimum: 1,
        }),
        offset: s.integer("The number of audit rows to skip.", { minimum: 0 }),
        includeHistoric: s.boolean("Whether to include old versions of business audits."),
        listId: s.string("The 32-character hexadecimal Insites list ID.", { minLength: 32, maxLength: 32 }),
      },
      {
        optional: ["filters", "orderBy", "orderDirection", "limit", "offset", "includeHistoric", "listId"],
      },
    ),
    outputSchema: s.requiredObject("The matching Insites audits.", {
      status: s.string("The request status returned by Insites."),
      reports: s.array("The matching account-configured audit summaries.", auditPayloadSchema),
    }),
  }),
];

export type InsitesActionName = "start_audit" | "get_audit" | "get_llm_audit" | "list_audits";
