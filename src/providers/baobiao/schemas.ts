import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

const dateFormat = "yyyy-MM-dd or yyyy-MM-dd HH:mm:ss";

export const startDateSchema: JsonSchema = s.nonEmptyString(`Earliest publish time to search, as ${dateFormat}.`);
export const endDateSchema: JsonSchema = s.nonEmptyString(`Latest publish time to search, as ${dateFormat}.`);
export const publishTimeSchema: JsonSchema = s.nonEmptyString(
  `Publish time of the record exactly as returned by a search, as ${dateFormat}. Baobiao uses it to locate the record's storage partition.`,
);
export const projectIdSchema: JsonSchema = s.positiveInteger("Project ID returned by a Baobiao search.");
export const pageIndexSchema: JsonSchema = s.positiveInteger("Page number, starting at 1.");

/** A list of plain strings such as names or codes. */
export function stringListSchema(description: string): JsonSchema {
  return s.array(description, s.string("Value."));
}

/** A count Baobiao returns as an integer or as a numeric string. */
export function countSchema(description: string): JsonSchema {
  return s.union([s.integer("Count."), s.string("Count as a numeric string.")], { description });
}

/** Page size for keyword searches; 0 returns only the total count. */
export function pageNumberSchema(maximum: number): JsonSchema {
  return s.integer(`Records per page, at most ${maximum}. Set 0 to return only the total count.`, {
    minimum: 0,
    maximum,
  });
}

/** Optional page size for company endpoints, which cap pages on the server. */
export function pageSizeSchema(maximum: number): JsonSchema {
  return s.integer(`Records per page, from 1 to ${maximum}.`, { minimum: 1, maximum });
}

export const companyNameSchema: JsonSchema = s.nonWhitespaceString("Full registered company name.");

export const searchTypeSchema: JsonSchema = s.withEnum(
  s.integer("Search type: 1 fuzzy smart match, 2 exact match, 3 advanced match."),
  [1, 2, 3],
);
export const searchModeSchema: JsonSchema = s.withEnum(
  s.integer("Fields to match: 1 title and body, 2 title only, 3 body only. Defaults to 1."),
  [1, 2, 3],
);
export const orderByTypeSchema: JsonSchema = s.withEnum(
  s.integer("Sort order: 1 relevance score descending, 2 publish time descending."),
  [1, 2],
);
export const fileFlagSchema: JsonSchema = s.withEnum(
  s.integer("Attachment filter: -1 any, 0 without attachments, 1 with attachments."),
  [-1, 0, 1],
);

export const keywordSchema: JsonSchema = s.string(
  "Search keywords, at most 300 characters. Separate terms that must all appear with spaces, and alternatives with |.",
  { maxLength: 300 },
);
export const excludeKeywordSchema: JsonSchema = s.string("Keywords to exclude, separated by |.");
export const includeKeywordSchema: JsonSchema = s.string(
  "Keywords at least one of which must appear, separated by |. Keep it short and do not repeat terms already in keyword.",
);

/** Keyword filters of the code-based searches, which cap their total length. */
export function limitedKeywordFilterSchemas(maxLength: number): Record<string, JsonSchema> {
  return {
    excludeKW: s.optional(
      s.string(`Keywords to exclude, separated by |, at most ${maxLength} characters.`, { maxLength }),
    ),
    inCludeKW: s.optional(
      s.string(
        `Keywords at least one of which must appear, separated by |, at most ${maxLength} characters. Do not repeat terms already in keyword.`,
        { maxLength },
      ),
    ),
  };
}
export const projectClassIdSchema: JsonSchema = s.string(
  "Comma-separated notice class IDs, or -100 for all: 1 open tender, 2 award result, 3 contract notice, 4 procurement intention or tender forecast, 5 clarification or change, 6 candidate announcement, 7 bid opening, 8 re-tender, 11 failed or cancelled tender, 18 result change, 26 auction or lease, 28 competitive negotiation, 29 competitive consultation, 30 single-source procurement, 31 other.",
);
export const purchaseTypeIdSchema: JsonSchema = s.string(
  "Comma-separated procurement type IDs, or -100 for all: 0 other, 1 services, 2 construction, 3 goods.",
);
export const moneyBoundSchema: JsonSchema = s.nullableString(
  "Project amount bound in yuan (CNY), as a numeric string. Empty or null means no bound.",
);
export const partyNamesSchema: JsonSchema = s.string(
  "Comma-separated company names, matched fuzzily within the given role.",
);
export const anyPartyNameSchema: JsonSchema = s.string(
  "Comma-separated company names matched fuzzily as buyer, supplier, or agency, when the role is unknown.",
);
export const contractEndBoundSchema: JsonSchema = s.string("Contract end date bound, as yyyy-MM-dd.");

const codeList = (level: string): JsonSchema =>
  s.stringArray(`${level} codes. An empty list does not filter on this level.`);

export const areaCodeSchema: JsonSchema = s.object(
  'Region filter using 6-digit Chinese administrative division codes (GB/T 2260), such as 420000 for Hubei and 420100 for Wuhan. Pass proviceCodeList ["0"] for the whole country.',
  {
    proviceCodeList: codeList("Province-level division"),
    cityCodeList: codeList("City-level division"),
    countyCodeList: codeList("County-level division"),
  },
  { optional: ["proviceCodeList", "cityCodeList", "countyCodeList"] },
);

export const industryCodeSchema: JsonSchema = s.object(
  "Industry filter using national economic industry classification codes (GB/T 4754), such as Q, Q83, or Q831. Use infer_industry_codes to find codes for a phrase.",
  {
    firstCodeList: codeList("Section-level industry"),
    secondCodeList: codeList("Division-level industry"),
    thirdCodeList: codeList("Group-level industry"),
  },
  { optional: ["firstCodeList", "secondCodeList", "thirdCodeList"] },
);

const searchPageFields: Record<string, JsonSchema> = {
  total: s.integer("Total number of matching records."),
  pageId: s.integer("Current page number."),
  pageNumber: s.integer("Records per page."),
  hasNext: s.boolean("Whether another page is available."),
  startDate: s.string("Effective search start time."),
  endDate: s.string("Effective search end time."),
  costTime: s.nullableString("Search time in milliseconds, or null when not measured."),
  seKeyWords: s.nullableString("Matched keywords that Baobiao highlights."),
};

/** A keyword search page whose records live in `data`. */
export function searchPageSchema(description: string, item: JsonSchema): JsonSchema {
  return s.looseObject(description, { ...searchPageFields, data: s.array("Records on this page.", item) });
}

export const regionCodeFields: Record<string, JsonSchema> = {
  proviceCode: s.nullableString("Province-level division code."),
  cityCode: s.nullableString("City-level division code."),
  countyCode: s.nullableString("County-level division code, or null."),
};

const projectListItemFields: Record<string, JsonSchema> = {
  title: s.string("Notice title. May contain HTML highlight tags."),
  publishTime: s.string("Publish time, as yyyy-MM-dd HH:mm:ss."),
  content: s.nullableString("Matched excerpt of the notice body, or null. May contain HTML highlight tags."),
  ...regionCodeFields,
  hasFile: s.integer("1 when the notice has attachments, otherwise 0."),
  score: s.nullableNumber("Relevance score, or null."),
  projectMoney: s.nullableString("Display amount with unit, such as 16.8万."),
  projectClassID: s.nullableString("Notice class ID."),
  purchaseTypeID: s.nullableString("Procurement type ID."),
  industryCodeList: stringListSchema("Industry codes."),
  partANameList: s.nullable(stringListSchema("Buyer names.")),
  partBNameList: s.nullable(stringListSchema("Supplier names.")),
};

/** Listing item shared by the code-based project searches. */
export const projectListItemSchema: JsonSchema = s.looseObject("One tender or award notice.", {
  id: s.integer("Project ID; pass it with publishTime to the detail actions."),
  ...projectListItemFields,
});

/** Listing item of the project-number lookup, which returns IDs as strings. */
export const numberedProjectListItemSchema: JsonSchema = s.looseObject("One tender or award notice.", {
  id: s.string("Project ID as a numeric string; pass it with publishTime to the detail actions."),
  ...projectListItemFields,
});

const partyContactSchema = s.looseObject("A party to the notice with its published contacts.", {
  name: s.string("Company name."),
  contactPhone: s.nullableString("Contact phone numbers separated by 、."),
  email: s.nullableString("Contact emails separated by 、."),
});

/** Listing item for the agent-oriented searches, which already resolve names. */
export const namedProjectListItemSchema: JsonSchema = s.looseObject("One tender or award notice.", {
  id: s.integer("Project ID; pass it with publishTime to the detail actions."),
  newsTypeName: s.string("Notice category name."),
  title: s.string("Notice title. May contain HTML highlight tags."),
  publishTime: s.string("Publish time, as yyyy-MM-dd HH:mm:ss."),
  content: s.nullableString("Matched excerpt of the notice body, or null."),
  areaName: s.nullableString("Region name."),
  score: s.nullableNumber("Relevance score, or null."),
  projectMoney: s.nullableString("Display amount with unit, such as 54.38万."),
  projectClass: s.nullableString("Notice class name."),
  purchaseType: s.nullableString("Procurement type name."),
  partAInfo: s.array("Buyers.", partyContactSchema),
  partBInfo: s.array("Suppliers.", partyContactSchema),
  agencyInfo: s.array("Procurement agencies.", partyContactSchema),
  siginUpStopDate: s.nullableString("Registration deadline."),
  bidStartDate: s.nullableString("Bid opening date."),
  bidStartAddress: s.nullableString("Bid opening location."),
  collectUrl: s.nullableString("Original page the notice was collected from."),
  sbkjBidUrl: s.nullableString("Notice page on the Baobiao website."),
  partAIndustryList: s.array("Buyer industries.", s.unknown("Industry.")),
  subMatIndustryList: s.array("Subject-matter industries.", s.unknown("Industry.")),
});

const projectFileSchema: JsonSchema = s.looseObject("One attachment.", {
  projectFileID: s.integer("Attachment ID."),
  projectID: s.string("Project ID."),
  name: s.string("Attachment name; may be truncated."),
  url: s.nullableString("Public download URL."),
  suffix: s.nullableString("File extension, such as pdf or docx."),
  size: s.nullableNumber("Size in KB, or null when unknown."),
  state: s.nullableString(
    "Download state: 0 not downloaded, 1 available, 2 download failed, 3 larger than 20 MB, 4 corrupted, 5 source link expired.",
  ),
  publishTime: s.string("Publish time of the parent project."),
  createTime: s.nullableString("Time Baobiao stored the attachment."),
  proviceCode: s.nullableString("Province-level division code."),
  cityCode: s.nullableString("City-level division code."),
});

export const projectFilesOutputSchema: JsonSchema = s.requiredObject("Attachments of the project.", {
  files: s.array("Attachments; empty when the project has none.", projectFileSchema),
});

export const industryCandidateSchema: JsonSchema = s.looseObject("One industry code candidate.", {
  firstCodeList: stringListSchema("Section-level codes."),
  secondCodeList: stringListSchema("Division-level codes."),
  thirdCodeList: stringListSchema("Group-level codes."),
  fullTitle: s.string("Full industry path, such as 教育-教育-高等教育."),
  minTitle: s.string("Most specific industry name."),
});

export const companyPaginationSchema: JsonSchema = s.looseObject("Pagination.", {
  pageNo: s.integer("Current page number."),
  pageSize: s.integer("Records per page."),
  total: countSchema("Total number of records."),
  totalPages: s.integer("Total number of pages."),
  hasNext: s.boolean("Whether another page is available."),
});

const industryStatisticSchema: JsonSchema = s.looseObject("Project statistics for one industry.", {
  industryName: s.string("Industry name."),
  projectCount: s.integer("Number of projects."),
  projectShare: s.string("Share of all projects."),
  budgetAmountWan: s.nullableString("Budget amount in 10,000 yuan, or null."),
});

export const projectInsightsSchema: JsonSchema = s.looseObject("Bid and award statistics by industry.", {
  bidStatistics: s.array("Statistics of projects the company tendered.", industryStatisticSchema),
  winStatistics: s.array("Statistics of projects the company won.", industryStatisticSchema),
});

export const relationshipSummarySchema: JsonSchema = s.looseObject("Relationship counts.", {
  contactPersonCount: s.unknown("Number of known contacts."),
  customerProjectCount: s.unknown("Number of projects with customers."),
  supplierProjectCount: s.unknown("Number of projects with suppliers."),
});
