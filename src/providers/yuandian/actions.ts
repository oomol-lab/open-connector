import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "yuandian";

const rawPayloadSchema = s.looseObject("The raw Yuan Dian response payload.");
const resultItemSchema = s.looseObject("A single Yuan Dian result item as returned by the API.");
const resultListSchema = s.array("The normalized Yuan Dian result list.", resultItemSchema);
const nonEmptyString = (description: string): JsonSchema => s.string(description, { minLength: 1 });
const nonEmptyStringArray = (description: string, itemDescription: string): JsonSchema =>
  s.array(description, nonEmptyString(itemDescription), { minItems: 1 });
const topKSchema = s.integer("Maximum number of keyword search results to return.", { minimum: 1, maximum: 50 });
const semanticReturnCountSchema = s.integer("Number of semantic search results to return.", { minimum: 1 });
const pageNoSchema = s.integer("Page number to request from Yuan Dian.", { minimum: 1 });
const regulationSearchModeSchema = s.stringEnum("How Yuan Dian should combine regulation keyword terms.", [
  "and",
  "or",
  "AND",
  "OR",
]);
const caseSearchModeSchema = s.stringEnum("How Yuan Dian should combine case keyword terms.", ["and", "or"]);
const regulationFilterFields = {
  regulationName: nonEmptyString("Regulation name filter."),
  validityStatus: nonEmptyString("Regulation validity status filter, such as current or invalid."),
  region: nonEmptyString("Region filter, such as central, Beijing, or Shanghai."),
  effectLevel: nonEmptyString("Primary legal effect level filter."),
  issuingAuthority: nonEmptyString("Issuing authority filter."),
  publishStartDate: s.date("Earliest publication date to include."),
  publishEndDate: s.date("Latest publication date to include."),
  effectiveStartDate: s.date("Earliest effective date to include."),
  effectiveEndDate: s.date("Latest effective date to include."),
};
const enterpriseLocatorFields = {
  enterpriseId: nonEmptyString("Yuan Dian enterprise identifier."),
  creditCode: nonEmptyString("Unified social credit code."),
};
const enterpriseLocatorSchema = (
  description: string,
  properties: Record<string, JsonSchema> = {},
  required: string[] = [],
): JsonSchema =>
  s.object(
    description,
    { ...enterpriseLocatorFields, ...properties },
    {
      required,
      optional: required.length > 0 ? undefined : Object.keys({ ...enterpriseLocatorFields, ...properties }),
    },
  );
const regulationSemanticFilterSchema = s.object(
  "Optional filters for Yuan Dian regulation semantic search.",
  {
    validityStatuses: nonEmptyStringArray("Regulation validity statuses to include.", "A regulation validity status."),
    effectLevels: nonEmptyStringArray("Primary legal effect levels to include.", "A primary legal effect level."),
    effectiveStartDate: s.date("Earliest effective date to include."),
    effectiveEndDate: s.date("Latest effective date to include."),
  },
  { optional: ["validityStatuses", "effectLevels", "effectiveStartDate", "effectiveEndDate"] },
);
const caseSemanticFilterSchema = s.object(
  "Optional filters for Yuan Dian case semantic search.",
  {
    caseCategory: nonEmptyString("Case category filter."),
    causes: nonEmptyStringArray("Case causes to include.", "A case cause."),
    documentTypeCodes: nonEmptyStringArray("Document type codes to include.", "A Yuan Dian document type code."),
    judgmentStartDate: s.date("Earliest close or judgment date to include."),
    judgmentEndDate: s.date("Latest close or judgment date to include."),
    authoritativeOnly: s.boolean("Whether to search only authoritative cases."),
    courts: nonEmptyStringArray("Courts to include.", "A court name."),
    sources: nonEmptyStringArray("Authoritative case sources to include.", "A case source."),
    courtLevel: nonEmptyString("Court level filter, such as basic, intermediate, high, or supreme."),
    province: nonEmptyString("Province-level region filter."),
    city: nonEmptyString("City-level region filter."),
  },
  {
    optional: [
      "caseCategory",
      "causes",
      "documentTypeCodes",
      "judgmentStartDate",
      "judgmentEndDate",
      "authoritativeOnly",
      "courts",
      "sources",
      "courtLevel",
      "province",
      "city",
    ],
  },
);
const detailOutputSchema = s.object("A normalized Yuan Dian detail response with the raw upstream payload preserved.", {
  code: s.integer("The Yuan Dian business response code."),
  status: s.nullableString("The Yuan Dian response status when returned."),
  message: s.nullableString("The Yuan Dian response message when returned."),
  data: s.unknown("The Yuan Dian response data field."),
  raw: rawPayloadSchema,
});
const envelopeOutputSchema = s.object("A normalized Yuan Dian list response with the raw upstream payload preserved.", {
  code: s.integer("The Yuan Dian business response code."),
  status: s.nullableString("The Yuan Dian response status when returned."),
  message: s.nullableString("The Yuan Dian response message when returned."),
  results: resultListSchema,
  raw: rawPayloadSchema,
});
const caseSearchOutputSchema = s.object("A normalized Yuan Dian case search response.", {
  code: s.integer("The Yuan Dian business response code."),
  status: s.nullableString("The Yuan Dian response status when returned."),
  message: s.nullableString("The Yuan Dian response message when returned."),
  total: s.unknown("The upstream total hit count or hit-count object."),
  results: resultListSchema,
  raw: rawPayloadSchema,
});
const enterprisePageOutputSchema = s.object("A normalized Yuan Dian enterprise page response.", {
  code: s.integer("The Yuan Dian business response code."),
  status: s.nullableString("The Yuan Dian response status when returned."),
  message: s.nullableString("The Yuan Dian response message when returned."),
  total: s.unknown("The upstream total record count when returned."),
  pageNo: s.unknown("The upstream page number when returned."),
  pageSize: s.unknown("The upstream page size when returned."),
  results: resultListSchema,
  raw: rawPayloadSchema,
});
const semanticSearchOutputSchema = s.object("A normalized Yuan Dian semantic search response.", {
  code: s.integer("The Yuan Dian business response code."),
  message: s.nullableString("The Yuan Dian response message when returned."),
  results: resultListSchema,
  raw: rawPayloadSchema,
});
const hallucinationOutputSchema = s.object("A normalized Yuan Dian legal hallucination check response.", {
  regulations: resultListSchema,
  cases: resultListSchema,
  highlightedText: s.nullableString("HTML text with Yuan Dian highlight spans for detected legal references."),
  semanticCompareError: s.nullableString("Semantic comparison error text when Yuan Dian returned one."),
  chatModel: s.nullableString("The server-side chat model used by Yuan Dian."),
  requestId: s.nullableString("The Yuan Dian request identifier for this check."),
  raw: rawPayloadSchema,
});

export type YuandianActionName =
  | "search_regulations"
  | "search_clauses"
  | "get_regulation_detail"
  | "get_clause_detail"
  | "semantic_search_regulations"
  | "search_ordinary_cases"
  | "search_authoritative_cases"
  | "get_case_details"
  | "semantic_search_cases"
  | "search_enterprises"
  | "search_enterprise_profiles"
  | "get_enterprise_detail"
  | "get_enterprise_base_info"
  | "get_enterprise_aggregation_summary"
  | "get_enterprise_litigation_statistics"
  | "list_enterprise_writs"
  | "list_enterprise_execution_risks"
  | "list_enterprise_court_notices"
  | "list_enterprise_compliance_records"
  | "list_enterprise_business_records"
  | "list_enterprise_ip_assets"
  | "get_enterprise_annual_report"
  | "check_legal_hallucinations";

const yuandianInputSchemas: Record<YuandianActionName, JsonSchema> = {
  search_regulations: s.object(
    "Input parameters for searching Yuan Dian regulations. Provide at least one search filter.",
    {
      keyword: nonEmptyString("Regulation content keyword."),
      searchMode: regulationSearchModeSchema,
      ...regulationFilterFields,
      topK: topKSchema,
    },
    {
      optional: [
        "keyword",
        "searchMode",
        "regulationName",
        "validityStatus",
        "region",
        "effectLevel",
        "issuingAuthority",
        "publishStartDate",
        "publishEndDate",
        "effectiveStartDate",
        "effectiveEndDate",
        "topK",
      ],
    },
  ),
  search_clauses: s.object(
    "Input parameters for searching Yuan Dian statutory clauses.",
    {
      keyword: nonEmptyString("Clause content keyword."),
      searchMode: regulationSearchModeSchema,
      ...regulationFilterFields,
      topK: topKSchema,
    },
    {
      optional: [
        "searchMode",
        "regulationName",
        "validityStatus",
        "region",
        "effectLevel",
        "issuingAuthority",
        "publishStartDate",
        "publishEndDate",
        "effectiveStartDate",
        "effectiveEndDate",
        "topK",
      ],
    },
  ),
  get_regulation_detail: s.object(
    "Input parameters for retrieving one Yuan Dian regulation detail. Provide regulationId or regulationName.",
    {
      regulationId: nonEmptyString("Yuan Dian regulation identifier."),
      regulationName: nonEmptyString("Regulation name used when no regulationId is supplied."),
      referenceDate: s.date("Reference date for locating the effective regulation version."),
    },
    { optional: ["regulationId", "regulationName", "referenceDate"] },
  ),
  get_clause_detail: s.object(
    "Input parameters for retrieving one Yuan Dian statutory clause detail. Provide clauseId or both regulationName and clauseNumber.",
    {
      clauseId: nonEmptyString("Yuan Dian clause identifier."),
      regulationName: nonEmptyString("Regulation name used when no clauseId is supplied."),
      clauseNumber: nonEmptyString("Clause number or name, such as Article 100."),
      referenceDate: s.date("Reference date for locating the effective clause version."),
    },
    { optional: ["clauseId", "regulationName", "clauseNumber", "referenceDate"] },
  ),
  semantic_search_regulations: s.object(
    "Input parameters for semantic search across Yuan Dian statutory clauses.",
    {
      query: nonEmptyString("Natural-language legal query text."),
      rewriteQuery: s.boolean("Whether Yuan Dian should rewrite the query before searching."),
      filter: regulationSemanticFilterSchema,
      returnCount: semanticReturnCountSchema,
    },
    { optional: ["rewriteQuery", "filter", "returnCount"] },
  ),
  search_ordinary_cases: s.object(
    "Input parameters for searching ordinary Yuan Dian cases. Provide at least one search filter.",
    {
      caseNumber: nonEmptyString("Case number filter."),
      title: nonEmptyString("Case title keyword filter."),
      causes: nonEmptyStringArray("Case causes to include.", "A case cause."),
      courts: nonEmptyStringArray("Courts to include.", "A court name."),
      provinces: nonEmptyStringArray("Province-level regions to include.", "A province-level region."),
      documentTypes: nonEmptyStringArray("Document types to include.", "A document type."),
      caseCategory: nonEmptyString("Case category filter."),
      judgmentStartDate: s.date("Earliest judgment or close date to include."),
      judgmentEndDate: s.date("Latest judgment or close date to include."),
      fullTextKeyword: nonEmptyString("Full-text keyword query."),
      analysisKeyword: nonEmptyString("Analysis-process keyword query."),
      searchMode: caseSearchModeSchema,
      citedClauses: nonEmptyStringArray("Cited statutory clauses to include.", "A cited clause."),
      citedClauseSearchMode: caseSearchModeSchema,
      topK: topKSchema,
    },
    {
      optional: [
        "caseNumber",
        "title",
        "causes",
        "courts",
        "provinces",
        "documentTypes",
        "caseCategory",
        "judgmentStartDate",
        "judgmentEndDate",
        "fullTextKeyword",
        "analysisKeyword",
        "searchMode",
        "citedClauses",
        "citedClauseSearchMode",
        "topK",
      ],
    },
  ),
  search_authoritative_cases: s.object(
    "Input parameters for searching authoritative Yuan Dian cases. Provide at least one search filter.",
    {
      caseNumber: nonEmptyString("Case number filter."),
      title: nonEmptyString("Case title keyword filter."),
      causes: nonEmptyStringArray("Case causes to include.", "A case cause."),
      courts: nonEmptyStringArray("Courts to include.", "A court name."),
      sources: nonEmptyStringArray("Authoritative case sources to include.", "A case source."),
      provinces: nonEmptyStringArray("Province-level regions to include.", "A province-level region."),
      documentTypes: nonEmptyStringArray("Document types to include.", "A document type."),
      caseCategory: nonEmptyString("Case category filter."),
      judgmentStartDate: s.date("Earliest judgment date to include."),
      judgmentEndDate: s.date("Latest judgment date to include."),
      fullTextKeyword: nonEmptyString("Full-text keyword query."),
      searchMode: caseSearchModeSchema,
      topK: topKSchema,
    },
    {
      optional: [
        "caseNumber",
        "title",
        "causes",
        "courts",
        "sources",
        "provinces",
        "documentTypes",
        "caseCategory",
        "judgmentStartDate",
        "judgmentEndDate",
        "fullTextKeyword",
        "searchMode",
        "topK",
      ],
    },
  ),
  get_case_details: s.object(
    "Input parameters for retrieving Yuan Dian case details. Provide caseId or caseNumber.",
    {
      caseId: nonEmptyString("Yuan Dian case identifier."),
      caseNumber: nonEmptyString("Case number used when no caseId is supplied."),
      type: s.stringEnum("Case type filter.", ["ptal", "qwal"]),
    },
    { optional: ["caseId", "caseNumber", "type"] },
  ),
  semantic_search_cases: s.object(
    "Input parameters for semantic search across Yuan Dian cases.",
    {
      query: nonEmptyString("Natural-language case search query text."),
      rewriteQuery: s.boolean("Whether Yuan Dian should rewrite the query before searching."),
      filter: caseSemanticFilterSchema,
      returnCount: semanticReturnCountSchema,
    },
    { optional: ["rewriteQuery", "filter", "returnCount"] },
  ),
  search_enterprises: s.object(
    "Input parameters for searching Yuan Dian enterprises by name.",
    {
      name: nonEmptyString("Enterprise name, stock short name, or search keyword."),
      topK: topKSchema,
    },
    { optional: ["topK"] },
  ),
  search_enterprise_profiles: s.object(
    "Input parameters for searching Yuan Dian enterprise profile candidates by name.",
    {
      name: nonEmptyString("Enterprise name or stock short name."),
      count: s.integer("Maximum number of enterprise profile candidates to return.", { minimum: 1, maximum: 50 }),
    },
    { optional: ["count"] },
  ),
  get_enterprise_detail: enterpriseLocatorSchema(
    "Input parameters for locating one Yuan Dian enterprise. Provide enterpriseId or creditCode.",
  ),
  get_enterprise_base_info: enterpriseLocatorSchema(
    "Input parameters for retrieving enterprise base information. Provide enterpriseId or creditCode.",
  ),
  get_enterprise_aggregation_summary: enterpriseLocatorSchema(
    "Input parameters for retrieving enterprise aggregation summary. Provide enterpriseId or creditCode.",
  ),
  get_enterprise_litigation_statistics: enterpriseLocatorSchema(
    "Input parameters for retrieving enterprise litigation statistics. Provide enterpriseId or creditCode.",
  ),
  list_enterprise_writs: enterpriseLocatorSchema("Input parameters for paginating Yuan Dian enterprise writs.", {
    pageNo: pageNoSchema,
  }),
  list_enterprise_execution_risks: enterpriseLocatorSchema(
    "Input parameters for listing Yuan Dian enterprise execution risk records.",
    {
      recordType: s.stringEnum("Execution risk record type to list.", ["executed_person", "dishonest_execution"]),
      pageNo: pageNoSchema,
    },
    ["recordType"],
  ),
  list_enterprise_court_notices: enterpriseLocatorSchema(
    "Input parameters for listing Yuan Dian enterprise court notices.",
    {
      noticeType: s.stringEnum("Court notice type to list.", ["court_session_notice", "court_notice"]),
      pageNo: pageNoSchema,
    },
    ["noticeType"],
  ),
  list_enterprise_compliance_records: enterpriseLocatorSchema(
    "Input parameters for listing Yuan Dian enterprise compliance records.",
    {
      recordType: s.stringEnum("Compliance record type to list.", [
        "punishment",
        "abnormal_operation",
        "serious_illegal",
        "corporate_tax",
      ]),
      pageNo: pageNoSchema,
    },
    ["recordType"],
  ),
  list_enterprise_business_records: enterpriseLocatorSchema(
    "Input parameters for listing Yuan Dian enterprise business records.",
    {
      recordType: s.stringEnum("Business record type to list.", [
        "change_info",
        "out_invest",
        "guaranty",
        "pledge",
        "frozen_equity",
      ]),
      pageNo: pageNoSchema,
    },
    ["recordType"],
  ),
  list_enterprise_ip_assets: enterpriseLocatorSchema(
    "Input parameters for listing Yuan Dian enterprise intellectual property assets.",
    {
      assetType: s.stringEnum("Intellectual property asset type to list.", [
        "patent",
        "trademark",
        "software_copyright",
        "works_copyright",
        "icp",
      ]),
      pageNo: pageNoSchema,
    },
    ["assetType"],
  ),
  get_enterprise_annual_report: enterpriseLocatorSchema(
    "Input parameters for retrieving one Yuan Dian enterprise annual report.",
    {
      year: nonEmptyString("Annual report year, such as 2023."),
    },
    ["year"],
  ),
  check_legal_hallucinations: s.object(
    "Input parameters for checking legal citations in text.",
    {
      text: nonEmptyString("The legal text to check for citation hallucinations."),
      requestId: nonEmptyString("Optional caller-supplied request identifier sent as X-Request-ID."),
    },
    { optional: ["requestId"] },
  ),
};

const actions: Array<{
  name: YuandianActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: ReturnType<typeof s.object>;
}> = [
  {
    name: "search_regulations",
    operationType: "read",
    description: "Search Yuan Dian regulations by keyword, name, validity, region, effect level, authority, and dates.",
    inputSchema: yuandianInputSchemas.search_regulations,
    outputSchema: envelopeOutputSchema,
  },
  {
    name: "search_clauses",
    operationType: "read",
    description: "Search Yuan Dian statutory clauses by keyword and legal filters.",
    inputSchema: yuandianInputSchemas.search_clauses,
    outputSchema: envelopeOutputSchema,
  },
  {
    name: "get_regulation_detail",
    operationType: "read",
    description: "Retrieve detail for one Yuan Dian regulation.",
    inputSchema: yuandianInputSchemas.get_regulation_detail,
    outputSchema: detailOutputSchema,
  },
  {
    name: "get_clause_detail",
    operationType: "read",
    description: "Retrieve detail for one Yuan Dian statutory clause.",
    inputSchema: yuandianInputSchemas.get_clause_detail,
    outputSchema: detailOutputSchema,
  },
  {
    name: "semantic_search_regulations",
    operationType: "read",
    description: "Run semantic search across Yuan Dian statutory clauses.",
    inputSchema: yuandianInputSchemas.semantic_search_regulations,
    outputSchema: semanticSearchOutputSchema,
  },
  {
    name: "search_ordinary_cases",
    operationType: "read",
    description: "Search ordinary Yuan Dian cases.",
    inputSchema: yuandianInputSchemas.search_ordinary_cases,
    outputSchema: caseSearchOutputSchema,
  },
  {
    name: "search_authoritative_cases",
    operationType: "read",
    description: "Search authoritative Yuan Dian cases.",
    inputSchema: yuandianInputSchemas.search_authoritative_cases,
    outputSchema: caseSearchOutputSchema,
  },
  {
    name: "get_case_details",
    operationType: "read",
    description: "Retrieve Yuan Dian case details by case ID or case number.",
    inputSchema: yuandianInputSchemas.get_case_details,
    outputSchema: detailOutputSchema,
  },
  {
    name: "semantic_search_cases",
    operationType: "read",
    description: "Run semantic search across Yuan Dian cases.",
    inputSchema: yuandianInputSchemas.semantic_search_cases,
    outputSchema: semanticSearchOutputSchema,
  },
  {
    name: "search_enterprises",
    operationType: "read",
    description: "Search Yuan Dian enterprises by name.",
    inputSchema: yuandianInputSchemas.search_enterprises,
    outputSchema: envelopeOutputSchema,
  },
  {
    name: "search_enterprise_profiles",
    operationType: "read",
    description: "Search Yuan Dian enterprise profile candidates by name.",
    inputSchema: yuandianInputSchemas.search_enterprise_profiles,
    outputSchema: envelopeOutputSchema,
  },
  {
    name: "get_enterprise_detail",
    operationType: "read",
    description: "Retrieve one Yuan Dian enterprise detail.",
    inputSchema: yuandianInputSchemas.get_enterprise_detail,
    outputSchema: detailOutputSchema,
  },
  {
    name: "get_enterprise_base_info",
    operationType: "read",
    description: "Retrieve one Yuan Dian enterprise base information record.",
    inputSchema: yuandianInputSchemas.get_enterprise_base_info,
    outputSchema: detailOutputSchema,
  },
  {
    name: "get_enterprise_aggregation_summary",
    operationType: "read",
    description: "Retrieve Yuan Dian enterprise aggregation summary.",
    inputSchema: yuandianInputSchemas.get_enterprise_aggregation_summary,
    outputSchema: detailOutputSchema,
  },
  {
    name: "get_enterprise_litigation_statistics",
    operationType: "read",
    description: "Retrieve Yuan Dian enterprise litigation statistics.",
    inputSchema: yuandianInputSchemas.get_enterprise_litigation_statistics,
    outputSchema: detailOutputSchema,
  },
  {
    name: "list_enterprise_writs",
    operationType: "read",
    description: "List Yuan Dian enterprise writs.",
    inputSchema: yuandianInputSchemas.list_enterprise_writs,
    outputSchema: enterprisePageOutputSchema,
  },
  {
    name: "list_enterprise_execution_risks",
    operationType: "read",
    description: "List Yuan Dian enterprise execution risk records.",
    inputSchema: yuandianInputSchemas.list_enterprise_execution_risks,
    outputSchema: enterprisePageOutputSchema,
  },
  {
    name: "list_enterprise_court_notices",
    operationType: "read",
    description: "List Yuan Dian enterprise court notices.",
    inputSchema: yuandianInputSchemas.list_enterprise_court_notices,
    outputSchema: enterprisePageOutputSchema,
  },
  {
    name: "list_enterprise_compliance_records",
    operationType: "read",
    description: "List Yuan Dian enterprise compliance records.",
    inputSchema: yuandianInputSchemas.list_enterprise_compliance_records,
    outputSchema: enterprisePageOutputSchema,
  },
  {
    name: "list_enterprise_business_records",
    operationType: "read",
    description: "List Yuan Dian enterprise business records.",
    inputSchema: yuandianInputSchemas.list_enterprise_business_records,
    outputSchema: enterprisePageOutputSchema,
  },
  {
    name: "list_enterprise_ip_assets",
    operationType: "read",
    description: "List Yuan Dian enterprise intellectual property assets.",
    inputSchema: yuandianInputSchemas.list_enterprise_ip_assets,
    outputSchema: enterprisePageOutputSchema,
  },
  {
    name: "get_enterprise_annual_report",
    operationType: "read",
    description: "Retrieve one Yuan Dian enterprise annual report.",
    inputSchema: yuandianInputSchemas.get_enterprise_annual_report,
    outputSchema: detailOutputSchema,
  },
  {
    name: "check_legal_hallucinations",
    operationType: "read",
    description: "Check legal citations in text for Yuan Dian-detected hallucinations.",
    inputSchema: yuandianInputSchemas.check_legal_hallucinations,
    outputSchema: hallucinationOutputSchema,
  },
];

export const yuandianActions: ActionDefinition[] = actions.map((action) =>
  defineProviderAction(service, {
    ...action,
  }),
);
