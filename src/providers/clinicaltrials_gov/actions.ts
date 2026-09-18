import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clinicaltrials_gov";

const nctIdSchema = s.string("The ClinicalTrials.gov identifier, such as NCT04280705.", {
  pattern: "^[Nn][Cc][Tt]0*[1-9][0-9]{0,7}$",
});

const searchStudyFieldNameSchema = s.nonEmptyString(
  "A ClinicalTrials.gov piece name, field name, area name, field path, or @query special field.",
  { pattern: "^([a-zA-Z][a-zA-Z0-9. -]*|@query)$" },
);

const singleStudyFieldNameSchema = s.nonEmptyString(
  "A ClinicalTrials.gov piece name, field name, area name, or field path.",
  { pattern: "^[a-zA-Z][a-zA-Z0-9. -]*$" },
);

const statisticsFieldNameSchema = s.nonEmptyString("A ClinicalTrials.gov piece name or field path.", {
  pattern: "^[a-zA-Z][a-zA-Z0-9. -]*$",
});

const markupFormatSchema = s.stringEnum("The format used for fields whose official data type is markup.", [
  "markdown",
  "legacy",
]);

const overallStatusSchema = s.stringEnum("An official ClinicalTrials.gov study status.", [
  "ACTIVE_NOT_RECRUITING",
  "COMPLETED",
  "ENROLLING_BY_INVITATION",
  "NOT_YET_RECRUITING",
  "RECRUITING",
  "SUSPENDED",
  "TERMINATED",
  "WITHDRAWN",
  "AVAILABLE",
  "NO_LONGER_AVAILABLE",
  "TEMPORARILY_NOT_AVAILABLE",
  "APPROVED_FOR_MARKETING",
  "WITHHELD",
  "UNKNOWN",
]);

const rawObjectSchema = s.looseObject("The raw JSON object returned by the ClinicalTrials.gov API.");

const interventionSchema = s.object("A normalized intervention attached to a study.", {
  name: s.string("The intervention name."),
  type: s.nullable(s.string("The official intervention type when provided.")),
  raw: rawObjectSchema,
});

const studySchema = s.object("A normalized ClinicalTrials.gov study with its raw record.", {
  nctId: s.string("The canonical NCT identifier."),
  briefTitle: s.string("The study brief title."),
  officialTitle: s.nullable(s.string("The study official title when provided.")),
  overallStatus: s.nullable(s.string("The study recruitment or availability status.")),
  studyType: s.nullable(s.string("The official study type when provided.")),
  phases: s.array("The official study phases.", s.string("One study phase.")),
  conditions: s.array("The conditions or diseases studied.", s.string("One condition or disease.")),
  interventions: s.array("The normalized study interventions.", interventionSchema),
  leadSponsor: s.nullable(s.string("The lead sponsor name when provided.")),
  hasResults: s.boolean("Whether ClinicalTrials.gov reports posted study results."),
  studyUrl: s.url("The canonical public ClinicalTrials.gov study URL."),
  raw: rawObjectSchema,
});

const eligibilitySchema = s.object("The normalized eligibility criteria for one study.", {
  criteria: s.nullable(s.string("The inclusion and exclusion criteria in the requested markup format.")),
  healthyVolunteers: s.nullable(s.boolean("Whether the study accepts healthy volunteers when specified.")),
  sex: s.nullable(s.string("The official eligible sex value when specified.")),
  genderBased: s.nullable(s.boolean("Whether eligibility is based on self-identified gender when specified.")),
  genderDescription: s.nullable(s.string("The gender-based eligibility description when provided.")),
  minimumAge: s.nullable(s.string("The minimum eligible age when specified.")),
  maximumAge: s.nullable(s.string("The maximum eligible age when specified.")),
  standardAges: s.array(
    "The official broad age groups accepted by the study.",
    s.string("One official standard age group."),
  ),
  studyPopulation: s.nullable(s.string("The observational study population description when provided.")),
  samplingMethod: s.nullable(s.string("The observational study sampling method when provided.")),
  raw: rawObjectSchema,
});

const contactSchema = s.object("A normalized study contact.", {
  name: s.nullable(s.string("The contact name when provided.")),
  role: s.nullable(s.string("The official contact role when provided.")),
  phone: s.nullable(s.string("The contact phone number when provided.")),
  phoneExtension: s.nullable(s.string("The contact phone extension when provided.")),
  email: s.nullable(s.string("The contact email address when provided.")),
  raw: rawObjectSchema,
});

const officialSchema = s.object("A normalized study official.", {
  name: s.nullable(s.string("The official's name when provided.")),
  affiliation: s.nullable(s.string("The official's organization when provided.")),
  role: s.nullable(s.string("The official's study role when provided.")),
  raw: rawObjectSchema,
});

const geoPointSchema = s.object("A study location coordinate.", {
  latitude: s.number("The latitude in decimal degrees."),
  longitude: s.number("The longitude in decimal degrees."),
});

const locationSchema = s.object("A normalized study site and its local contacts.", {
  facility: s.nullable(s.string("The study facility name when provided.")),
  status: s.nullable(s.string("The facility's official recruitment status when provided.")),
  city: s.nullable(s.string("The facility city when provided.")),
  state: s.nullable(s.string("The facility state or region when provided.")),
  postalCode: s.nullable(s.string("The facility postal code when provided.")),
  country: s.nullable(s.string("The facility country when provided.")),
  contacts: s.array("The contacts for this study site.", contactSchema),
  geoPoint: s.nullable(geoPointSchema),
  raw: rawObjectSchema,
});

const documentSchema = s.object("One uploaded ClinicalTrials.gov study document.", {
  type: s.nullable(s.string("The official abbreviated document type when provided.")),
  label: s.nullable(s.string("The document label when provided.")),
  documentDate: s.nullable(s.string("The document date when provided.")),
  uploadDate: s.nullable(s.string("The date and time the document was uploaded when provided.")),
  filename: s.nullable(s.string("The provider-supplied document filename when provided.")),
  sizeBytes: s.nullable(s.integer("The document size in bytes when provided.")),
  hasProtocol: s.nullable(s.boolean("Whether the document includes a study protocol.")),
  hasStatisticalAnalysisPlan: s.nullable(s.boolean("Whether the document includes a statistical analysis plan.")),
  hasInformedConsentForm: s.nullable(s.boolean("Whether the document includes an informed consent form.")),
  raw: rawObjectSchema,
});

const searchFieldsInputSchema = s.array(
  "Additional official fields to return alongside the fields required for the normalized study summary.",
  searchStudyFieldNameSchema,
  { minItems: 1 },
);

const singleStudyFieldsInputSchema = s.array(
  "Additional official fields to return alongside the fields required for the normalized study summary.",
  singleStudyFieldNameSchema,
  { minItems: 1 },
);

const sortSchema = s.object(
  "One official ClinicalTrials.gov study sort option.",
  {
    field: s.nonEmptyString("A sortable date or numeric piece or field name, or @relevance for query relevance.", {
      pattern: "^([a-zA-Z][a-zA-Z0-9. -]*|@relevance)$",
    }),
    direction: s.stringEnum("The optional sort direction.", ["asc", "desc"]),
  },
  { optional: ["direction"] },
);

const geoFilterSchema = s.object(
  "A distance filter centered on one geographic coordinate.",
  {
    latitude: s.number("The center latitude in decimal degrees.", {
      minimum: -90,
      maximum: 90,
    }),
    longitude: s.number("The center longitude in decimal degrees.", {
      minimum: -180,
      maximum: 180,
    }),
    distance: s.number("The search radius in the selected unit.", {
      exclusiveMinimum: 0,
    }),
    unit: s.stringEnum("The search radius unit.", ["km", "mi"]),
  },
  { optional: ["unit"] },
);

const fieldStatsTypeSchema = s.stringEnum("An official field statistics type.", [
  "ENUM",
  "STRING",
  "DATE",
  "INTEGER",
  "NUMBER",
  "BOOLEAN",
]);

const fieldStatisticSchema = s.looseRequiredObject(
  "Statistics for one ClinicalTrials.gov leaf field.",
  {
    type: fieldStatsTypeSchema,
    piece: s.string("The official piece name."),
    field: s.string("The full field path."),
    missingStudiesCount: s.optional(s.integer("The number of studies missing this field value.")),
    uniqueValuesCount: s.optional(s.integer("The number of unique field values.")),
    min: s.optional(s.unknown("The minimum field value when applicable.")),
    max: s.optional(s.unknown("The maximum field value when applicable.")),
    avg: s.optional(s.number("The average numeric value when applicable.")),
    topValues: s.optional(
      s.array(
        "The most common field values.",
        s.object("One field value count.", {
          value: s.string("The field value."),
          studiesCount: s.integer("The number of studies containing the value."),
        }),
      ),
    ),
    longest: s.optional(
      s.object("The longest observed string value and its source study.", {
        length: s.integer("The string length."),
        nctId: s.string("The canonical NCT identifier containing the value."),
        value: s.string("The longest observed string value."),
      }),
    ),
    formats: s.optional(s.array("The date formats observed for this field.", s.string("One observed date format."))),
    trueCount: s.optional(s.integer("The number of studies whose field value is true.")),
    falseCount: s.optional(s.integer("The number of studies whose field value is false.")),
  },
  {
    optional: [
      "missingStudiesCount",
      "uniqueValuesCount",
      "min",
      "max",
      "avg",
      "topValues",
      "longest",
      "formats",
      "trueCount",
      "falseCount",
    ],
  },
);

const listSizeStatisticSchema = s.looseRequiredObject(
  "List-size statistics for one ClinicalTrials.gov field.",
  {
    piece: s.string("The official piece name."),
    field: s.string("The full field path."),
    uniqueSizesCount: s.integer("The number of unique list sizes."),
    minSize: s.optional(s.integer("The minimum observed list size.")),
    maxSize: s.optional(s.integer("The maximum observed list size.")),
    topSizes: s.optional(
      s.array(
        "The most common list sizes.",
        s.object("One list-size distribution entry.", {
          size: s.integer("The observed list size."),
          studiesCount: s.integer("The number of studies with this list size."),
        }),
      ),
    ),
  },
  { optional: ["minSize", "maxSize", "topSizes"] },
);

export const clinicalTrialsGovActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_studies",
    operationType: "read",
    description:
      "Search ClinicalTrials.gov studies with official Essie queries, filters, field selection, sorting, and cursor pagination.",
    inputSchema: s.object(
      "Input parameters for searching ClinicalTrials.gov studies.",
      {
        conditionQuery: s.nonEmptyString("A Conditions or disease query in official Essie expression syntax."),
        termQuery: s.nonEmptyString("An Other terms query in official Essie expression syntax."),
        locationQuery: s.nonEmptyString("A Location terms query in official Essie expression syntax."),
        titleQuery: s.nonEmptyString("A Title or acronym query in official Essie expression syntax."),
        interventionQuery: s.nonEmptyString("An Intervention or treatment query in official Essie expression syntax."),
        outcomeQuery: s.nonEmptyString("An Outcome measure query in official Essie expression syntax."),
        sponsorQuery: s.nonEmptyString("A Sponsor or collaborator query in official Essie expression syntax."),
        leadSponsorQuery: s.nonEmptyString("A LeadSponsorName query in official Essie expression syntax."),
        idQuery: s.nonEmptyString(
          "A Study IDs query in official Essie expression syntax. Use nctIds instead when combining identifiers with filters.",
        ),
        patientQuery: s.nonEmptyString("A patient-friendly eligibility query using the official PatientSearch area."),
        overallStatuses: s.array("The official study statuses to include.", overallStatusSchema, {
          minItems: 1,
        }),
        nctIds: s.array(
          "The NCT identifiers to include. Large identifier lists may exceed the upstream URL limit; use get_studies_by_nct_ids for batch retrieval.",
          nctIdSchema,
          {
            minItems: 1,
            maxItems: 400,
          },
        ),
        advancedFilter: s.nonEmptyString("An advanced filter in official Essie expression syntax."),
        geo: geoFilterSchema,
        fields: searchFieldsInputSchema,
        sort: s.array("The study sort options, in priority order.", sortSchema, {
          minItems: 1,
          maxItems: 2,
        }),
        countTotal: s.boolean("Whether the first page should include the total number of matching studies."),
        pageSize: s.integer("The maximum number of studies to return in this page.", {
          minimum: 1,
          maximum: 1000,
        }),
        pageToken: s.nonEmptyString(
          "The nextPageToken returned by the preceding page with otherwise identical query parameters.",
        ),
        markupFormat: markupFormatSchema,
      },
      {
        optional: [
          "conditionQuery",
          "termQuery",
          "locationQuery",
          "titleQuery",
          "interventionQuery",
          "outcomeQuery",
          "sponsorQuery",
          "leadSponsorQuery",
          "idQuery",
          "patientQuery",
          "overallStatuses",
          "nctIds",
          "advancedFilter",
          "geo",
          "fields",
          "sort",
          "countTotal",
          "pageSize",
          "pageToken",
          "markupFormat",
        ],
      },
    ),
    outputSchema: s.object("One page of normalized ClinicalTrials.gov search results.", {
      studies: s.array("The studies returned in this page.", studySchema),
      count: s.integer("The number of studies returned in this page."),
      totalCount: s.nullable(s.integer("The total number of matching studies when requested on the first page.")),
      nextPageToken: s.nullable(s.string("The token for the next page, or null when this is the last page.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_study",
    operationType: "read",
    description: "Get one ClinicalTrials.gov study by NCT identifier.",
    inputSchema: s.object(
      "Input parameters for getting one ClinicalTrials.gov study.",
      {
        nctId: nctIdSchema,
        fields: singleStudyFieldsInputSchema,
        markupFormat: markupFormatSchema,
      },
      { optional: ["fields", "markupFormat"] },
    ),
    outputSchema: s.object("The result of getting one ClinicalTrials.gov study.", {
      found: s.boolean("Whether the requested study was found."),
      study: s.nullable(s.describe(studySchema, "The requested study when found.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_studies_by_nct_ids",
    operationType: "read",
    description:
      "Get multiple ClinicalTrials.gov studies by NCT identifier and report identifiers that were not found.",
    inputSchema: s.object(
      "Input parameters for getting multiple ClinicalTrials.gov studies.",
      {
        nctIds: s.array("The NCT identifiers to retrieve.", nctIdSchema, {
          minItems: 1,
          maxItems: 1000,
        }),
        fields: searchFieldsInputSchema,
        markupFormat: markupFormatSchema,
      },
      { optional: ["fields", "markupFormat"] },
    ),
    outputSchema: s.object("The batch ClinicalTrials.gov study lookup result.", {
      studies: s.array("The found studies in input identifier order.", studySchema),
      foundNctIds: s.array("The canonical identifiers that were found.", s.string("One NCT ID.")),
      notFoundNctIds: s.array("The canonical identifiers that were not found.", s.string("One NCT ID.")),
      count: s.integer("The number of studies found."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_study_eligibility",
    operationType: "read",
    description:
      "Get patient-facing eligibility criteria, age and sex requirements, and study population details for one ClinicalTrials.gov study.",
    inputSchema: s.object(
      "Input parameters for getting study eligibility.",
      {
        nctId: nctIdSchema,
        markupFormat: markupFormatSchema,
      },
      { optional: ["markupFormat"] },
    ),
    outputSchema: s.object("The eligibility details for one ClinicalTrials.gov study.", {
      found: s.boolean("Whether the requested study was found."),
      nctId: s.string("The canonical requested NCT identifier."),
      briefTitle: s.nullable(s.string("The study brief title when found.")),
      overallStatus: s.nullable(s.string("The study status when found and provided.")),
      eligibility: s.nullable(s.describe(eligibilitySchema, "The study eligibility module when provided.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_study_locations",
    operationType: "read",
    description:
      "Get study sites, geographic coordinates, central contacts, local contacts, and study officials for one ClinicalTrials.gov study.",
    inputSchema: s.object("Input parameters for getting study locations.", {
      nctId: nctIdSchema,
    }),
    outputSchema: s.object("The contact and location details for one ClinicalTrials.gov study.", {
      found: s.boolean("Whether the requested study was found."),
      nctId: s.string("The canonical requested NCT identifier."),
      briefTitle: s.nullable(s.string("The study brief title when found.")),
      overallStatus: s.nullable(s.string("The study status when found and provided.")),
      centralContacts: s.array("The study-wide central contacts.", contactSchema),
      overallOfficials: s.array("The study officials.", officialSchema),
      locations: s.array("The participating study sites.", locationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_study_results",
    operationType: "read",
    description:
      "Get posted participant flow, baseline characteristics, outcome measures, adverse events, and result notes for one ClinicalTrials.gov study.",
    inputSchema: s.object(
      "Input parameters for getting posted study results.",
      {
        nctId: nctIdSchema,
        markupFormat: markupFormatSchema,
      },
      { optional: ["markupFormat"] },
    ),
    outputSchema: s.object("The posted results for one ClinicalTrials.gov study.", {
      found: s.boolean("Whether the requested study was found."),
      nctId: s.string("The canonical requested NCT identifier."),
      briefTitle: s.nullable(s.string("The study brief title when found.")),
      hasResults: s.nullable(s.boolean("Whether ClinicalTrials.gov reports posted results for the found study.")),
      results: s.nullable(
        s.looseObject("The raw official ResultsSection, or null when the study has no posted results."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_study_documents",
    operationType: "read",
    description:
      "List uploaded study protocols, statistical analysis plans, and informed consent forms with their official metadata.",
    inputSchema: s.object("Input parameters for listing uploaded study documents.", {
      nctId: nctIdSchema,
    }),
    outputSchema: s.object("The uploaded documents for one ClinicalTrials.gov study.", {
      found: s.boolean("Whether the requested study was found."),
      nctId: s.string("The canonical requested NCT identifier."),
      briefTitle: s.nullable(s.string("The study brief title when found.")),
      noStatisticalAnalysisPlan: s.nullable(
        s.boolean("Whether the sponsor indicated that no statistical analysis plan exists."),
      ),
      documents: s.array("The uploaded study documents.", documentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_study_metadata",
    operationType: "read",
    description: "Get the official ClinicalTrials.gov study data model and field definitions.",
    inputSchema: s.object(
      "Input parameters for getting the study data model.",
      {
        includeIndexedOnly: s.boolean(
          "Whether to include fields that are indexed for search but not returned in study records.",
        ),
        includeHistoricOnly: s.boolean("Whether to include fields available only in historic study data."),
      },
      { optional: ["includeIndexedOnly", "includeHistoricOnly"] },
    ),
    outputSchema: s.object("The official ClinicalTrials.gov study field metadata.", {
      fields: s.array("The top-level field metadata nodes.", rawObjectSchema),
      count: s.integer("The number of top-level field metadata nodes."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_search_areas",
    operationType: "read",
    description: "List the official ClinicalTrials.gov search documents, areas, parameters, and indexed pieces.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: s.object("The official ClinicalTrials.gov search area documents.", {
      documents: s.array("The search area documents.", rawObjectSchema),
      count: s.integer("The number of search area documents."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_enums",
    operationType: "read",
    description: "List official ClinicalTrials.gov enumeration types, values, legacy values, and field usages.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: s.object("The official ClinicalTrials.gov enumeration definitions.", {
      enums: s.array(
        "The enumeration definitions.",
        s.object("One ClinicalTrials.gov enumeration definition.", {
          type: s.string("The enumeration type name."),
          pieces: s.array("The pieces using this enumeration.", s.string("One piece name.")),
          values: s.array(
            "The allowed enumeration values.",
            s.looseRequiredObject(
              "One enumeration value and its legacy representation.",
              {
                value: s.string("The current API value."),
                legacyValue: s.string("The legacy API value."),
                exceptions: s.optional(s.looseObject("Piece-specific legacy value exceptions.")),
              },
              { optional: ["exceptions"] },
            ),
          ),
        }),
      ),
      count: s.integer("The number of enumeration definitions."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_registry_size_statistics",
    operationType: "read",
    description: "Get ClinicalTrials.gov registry counts and the distribution of study JSON record sizes.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: s.object("ClinicalTrials.gov study JSON size statistics.", {
      totalStudies: s.integer("The total number of studies in the registry."),
      averageSizeBytes: s.integer("The average uncompressed study JSON size in bytes."),
      percentiles: s.record(
        "Study JSON size percentiles keyed by percentile label.",
        s.number("The size in bytes at this percentile."),
      ),
      ranges: s.array(
        "The study JSON size distribution ranges.",
        s.object("One study JSON size range.", {
          sizeRange: s.string("The human-readable size range."),
          studiesCount: s.integer("The number of studies in this size range."),
        }),
      ),
      largestStudies: s.array(
        "The largest study records reported by the API.",
        s.object("One large study record.", {
          id: s.string("The NCT identifier."),
          sizeBytes: s.integer("The study JSON size in bytes."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_field_value_statistics",
    operationType: "read",
    description: "Get value statistics for selected ClinicalTrials.gov leaf fields or field data types.",
    inputSchema: s.object(
      "Input parameters for getting field value statistics.",
      {
        types: s.array("The field data types to include.", fieldStatsTypeSchema, {
          minItems: 1,
        }),
        fields: s.array("The piece names or full leaf field paths to include.", statisticsFieldNameSchema, {
          minItems: 1,
        }),
      },
      { optional: ["types", "fields"] },
    ),
    outputSchema: s.object("The requested ClinicalTrials.gov field value statistics.", {
      statistics: s.array("The field value statistics.", fieldStatisticSchema),
      count: s.integer("The number of field statistics returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list_field_size_statistics",
    operationType: "read",
    description: "Get observed list-size statistics for selected ClinicalTrials.gov array fields.",
    inputSchema: s.object(
      "Input parameters for getting list field size statistics.",
      {
        fields: s.array("The piece names or full list field paths to include.", statisticsFieldNameSchema, {
          minItems: 1,
        }),
      },
      { optional: ["fields"] },
    ),
    outputSchema: s.object("The requested ClinicalTrials.gov list field size statistics.", {
      statistics: s.array("The list field size statistics.", listSizeStatisticSchema),
      count: s.integer("The number of list field statistics returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_api_version",
    operationType: "read",
    description: "Get the current ClinicalTrials.gov API version and daily data refresh timestamp.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: s.object("The current ClinicalTrials.gov API and data versions.", {
      apiVersion: s.string("The current API semantic version."),
      dataTimestamp: s.nullable(s.string("The UTC timestamp of the current study data snapshot when provided.")),
    }),
  }),
];
