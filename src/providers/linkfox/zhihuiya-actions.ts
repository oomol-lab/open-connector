import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const strictObject = (
  description: string,
  properties: Record<string, JsonSchema>,
  options?: { required?: string[]; optional?: string[] },
): JsonSchema => s.object(description, properties, options ?? { required: Object.keys(properties) });

const patentOutput = s.looseObject("Patent records returned through LinkFox and Patsnap.", {
  data: s.array(
    "The patent records returned by this request, including original nested data and download URLs.",
    s.looseObject(
      "A patent record with the endpoint-specific text, images, citations, family, or bibliographic fields.",
    ),
  ),
  total: s.optional(s.integer("The number of records returned by this request.")),
  allRecordsCount: s.optional(s.integer("The total number of matching records, when provided.")),
  costToken: s.optional(s.number("The actual LinkFox token usage, when provided.")),
});
const binaryFlag = (description: string) => ({ type: "integer", enum: [0, 1], description });
const replacement = s.optional(
  binaryFlag("Use a related family patent when the requested content is unavailable: 1 yes, 0 no. Default: 0."),
);
const stringReplacement = s.optional(
  s.stringEnum("Use a related family patent when the requested content is unavailable: 1 yes, 0 no.", ["0", "1"]),
);
const translationLanguage = s.optional(
  s.stringEnum("The translation language: en English, cn Chinese, jp Japanese. Default: en.", ["en", "cn", "jp"]),
);

function patentInput(extra: Record<string, JsonSchema> = {}, maxLength?: number) {
  const schema = strictObject(
    "Identify patents by patentId or patentNumber; at least one is required. If both are supplied, patentId takes precedence. Batch endpoints accept comma-separated identifiers.",
    {
      patentId: s.optional(
        s.string(
          "Patsnap patent IDs, comma-separated for batch queries (normally at most 100); abstract translation has no documented item cap, and fulltext images accepts one ID.",
          { minLength: 1, maxLength },
        ),
      ),
      patentNumber: s.optional(
        s.string(
          "Patent publication numbers, comma-separated for batch queries (normally at most 100); abstract translation has no documented item cap, and fulltext images accepts one number.",
          { minLength: 1, maxLength },
        ),
      ),
      ...extra,
    },
  );
  schema.anyOf = [
    { description: "Identify patents by Patsnap IDs.", required: ["patentId"] },
    { description: "Identify patents by publication numbers.", required: ["patentNumber"] },
  ];
  return schema;
}
interface ZhihuiyaOperation {
  path: string;
  usage: number;
  perRecord: boolean;
  action: ProviderActionDefinition;
}
function operation<const T extends string>(
  name: T,
  operationType: ActionDefinition["operationType"],
  path: string,
  description: string,
  inputSchema: JsonSchema,
  usage: number,
  perRecord = true,
): ZhihuiyaOperation {
  return {
    path: `/zhihuiya/${path}`,
    usage,
    perRecord,
    action: defineProviderAction("linkfox", {
      name,
      operationType,
      description,
      inputSchema,
      outputSchema: patentOutput,
    }),
  };
}
const imageInput = strictObject(
  "Search design or utility patents by image URL through Patsnap. Design models are 1 or 2; utility models are 3 or 4.",
  {
    url: s.string("The image URL fetched by Patsnap.", {
      minLength: 1,
      maxLength: 1000,
      format: "uri",
    }),
    patentType: s.stringEnum("The patent type: D design, U utility.", ["D", "U"]),
    model: {
      type: "integer",
      enum: [1, 2, 3, 4],
      description:
        "The image matching model: 1 intelligent association, 2 search this image, 3 match shape, 4 match shape/pattern/color.",
    },
    country: s.optional(
      s.string("Comma-separated patent authority country or organization codes; omit for all authorities."),
    ),
    loc: s.optional(s.string("LOC classification expression supporting AND, OR, and NOT.")),
    legalStatus: s.optional(
      s.string(
        "Comma-separated detailed status codes: 1 published, 2 examining, 3 granted, 8 double grant avoided, 11/12/17/18 withdrawn, 13 rejected, 14 revoked, 15 expired, 16 unpaid fees, 21 restored, 22 ceased, 23 partly invalid, 24 discontinued, 30/19/20/25 abandoned, 222/223/224/225 PCT designated-period status.",
      ),
    ),
    simpleLegalStatus: s.optional(
      s.string(
        "Simple legal status: 0 inactive, 1 active, 2 pending, 220 PCT period expired, 221 PCT within period, 999 undetermined.",
      ),
    ),
    assignees: s.optional(s.string("The applicant or patent assignee.", { maxLength: 1000 })),
    applyStartTime: s.optional(s.string("The earliest application date in yyyyMMdd format.")),
    applyEndTime: s.optional(s.string("The latest application date in yyyyMMdd format.")),
    publicStartTime: s.optional(s.string("The earliest publication date in yyyyMMdd format.")),
    publicEndTime: s.optional(s.string("The latest publication date in yyyyMMdd format.")),
    limit: s.optional(s.integer("The number of patents to return. Default: 10.", { minimum: 1, maximum: 100 })),
    offset: s.optional(s.integer("The pagination offset. Default: 0.", { minimum: 0, maximum: 1000 })),
    field: s.optional(
      s.stringEnum(
        "The sort field: SCORE relevance, APD application date, PBD publication date, ISD grant date. Default: SCORE.",
        ["SCORE", "APD", "PBD", "ISD"],
      ),
    ),
    order: s.optional(s.stringEnum("The sort direction for date fields. Default: desc.", ["desc", "asc"])),
    lang: s.optional(
      s.stringEnum("The title language: original, cn Chinese, en English. Default: original.", [
        "original",
        "cn",
        "en",
      ]),
    ),
    preFilter: s.optional(binaryFlag("Enable country/LOC prefiltering: 1 yes, 0 no. Default: 1.")),
    stemming: s.optional(binaryFlag("Enable stemming: 1 yes, 0 no. Default: 0.")),
    mainField: s.optional(
      s.string(
        "Search the main patent fields, including title, abstract, claims, description, numbers, applicants, inventors, and classifications.",
        { maxLength: 1000 },
      ),
    ),
    includeMachineTranslation: s.optional(s.boolean("Include machine-translated data in the search.")),
    scoreExpansion: s.optional(s.boolean("Enable similarity score expansion.")),
    isHttps: s.optional(binaryFlag("Return HTTPS image URLs when 1, HTTP when 0. Default: 0.")),
    returnImgId: s.optional(s.boolean("Return the image identifier. Default: false.")),
  },
);
imageInput.anyOf = [
  {
    description: "Design patents use models 1 or 2.",
    properties: {
      patentType: { const: "D", description: "Design patent type." },
      model: { enum: [1, 2], description: "Design image matching models." },
    },
  },
  {
    description: "Utility patents use models 3 or 4.",
    properties: {
      patentType: { const: "U", description: "Utility patent type." },
      model: { enum: [3, 4], description: "Utility image matching models." },
    },
  },
];
const queryInput = strictObject(
  "Search patents using a Patsnap Analytics query. The sum of limit and offset must not exceed 20000.",
  {
    queryText: s.string("The Analytics expression, supporting TACD:, TAC:, TA:, and AND/OR/NOT operators.", {
      minLength: 1,
      maxLength: 12000,
    }),
    limit: s.optional(s.integer("The number of patents to return. Default: 10.", { minimum: 1, maximum: 1000 })),
    offset: s.optional(
      s.integer("The pagination offset. Default: 0; limit + offset must be at most 20000.", {
        minimum: 0,
        maximum: 19999,
      }),
    ),
    sort: s.optional(
      s.array(
        "The ordered sort criteria.",
        strictObject("A patent search sort criterion.", {
          field: s.stringEnum("The sort field.", ["PBDT_YEARMONTHDAY", "APD_YEARMONTHDAY", "ISD", "SCORE"]),
          order: s.stringEnum("The sort direction.", ["DESC", "ASC"]),
        }),
      ),
    ),
    stemming: s.optional(binaryFlag("Enable stemming: 1 yes, 0 no. Default: 0.")),
    collapseType: s.optional(
      s.stringEnum("The deduplication mode. Default: ALL.", ["ALL", "APNO", "DOCDB", "INPADOC", "EXTEND"]),
    ),
    collapseBy: s.optional(s.stringEnum("The deduplication sort field.", ["APD", "PBD", "AUTHORITY", "SCORE"])),
    collapseOrder: s.optional(
      s.stringEnum("Select the oldest or latest member when deduplicating.", ["OLDEST", "LATEST"]),
    ),
    collapseOrderAuthority: s.optional(
      s.array("The authority priority order, used when collapseBy is AUTHORITY.", s.string("A patent authority code.")),
    ),
  },
);

export const zhihuiyaOperations: ZhihuiyaOperation[] = [
  operation(
    "translate_zhihuiya_patent_abstracts",
    "read",
    "abstractDataTranslated",
    "Get translated patent titles and abstracts through LinkFox and Patsnap.",
    patentInput({ replaceByRelated: replacement, lang: translationLanguage }, 60000),
    81,
  ),
  operation(
    "get_zhihuiya_patent_abstract_images",
    "read",
    "abstractImage",
    "Get patent abstract image URLs through LinkFox and Patsnap.",
    patentInput({}, 60000),
    81,
  ),
  operation(
    "get_zhihuiya_patent_bibliography",
    "read",
    "bibliography",
    "Get detailed patent bibliographic records through LinkFox and Patsnap.",
    patentInput({}, 60000),
    81,
  ),
  operation(
    "get_zhihuiya_patent_claims",
    "read",
    "claimData",
    "Get original patent claims through LinkFox and Patsnap.",
    patentInput({ replaceByRelated: stringReplacement }, 60000),
    81,
  ),
  operation(
    "translate_zhihuiya_patent_claims",
    "read",
    "claimDataTranslated",
    "Get translated patent claims through LinkFox and Patsnap.",
    patentInput({ replaceByRelated: replacement, lang: translationLanguage }, 60000),
    81,
  ),
  operation(
    "get_zhihuiya_patent_descriptions",
    "read",
    "descriptionData",
    "Get original patent description sections through LinkFox and Patsnap.",
    patentInput({ replaceByRelated: stringReplacement }, 60000),
    81,
  ),
  operation(
    "translate_zhihuiya_patent_descriptions",
    "read",
    "descriptionDataTranslated",
    "Get translated patent descriptions through LinkFox and Patsnap.",
    patentInput({ replaceByRelated: replacement, lang: translationLanguage }, 60000),
    81,
  ),
  operation(
    "get_zhihuiya_patent_fulltext_images",
    "read",
    "fulltextImage",
    "Get patent full-text image URLs through LinkFox and Patsnap.",
    patentInput(
      {
        limit: s.optional(
          s.string("The number of images to return, as a string. Maximum 100; default: 100.", {
            maxLength: 1000,
          }),
        ),
        offset: s.optional(s.string("The image offset, as a string.", { maxLength: 1000 })),
      },
      1000,
    ),
    81,
    false,
  ),
  operation(
    "get_zhihuiya_patent_legal_status",
    "read",
    "legalStatus",
    "Get patent legal statuses and events through LinkFox and Patsnap.",
    patentInput({}, 60000),
    81,
  ),
  operation(
    "get_zhihuiya_patent_cited_by",
    "read",
    "patentCited",
    "Get patents that cite the specified patents and citation counts through LinkFox and Patsnap.",
    patentInput({}, 60000),
    81,
  ),
  operation(
    "get_zhihuiya_patent_families",
    "read",
    "patentFamily",
    "Get simple, INPADOC, and Patsnap patent families through LinkFox.",
    patentInput({}, 60000),
    81,
  ),
  operation(
    "get_zhihuiya_patent_citations",
    "read",
    "patentForwardCitation",
    "Get patent and non-patent documents cited by the specified patents through LinkFox and Patsnap.",
    patentInput({}, 60000),
    81,
  ),
  operation(
    "search_zhihuiya_patents_by_image",
    "read",
    "patentImageSearch",
    "Search design and utility patents by image with filters and pagination through LinkFox and Patsnap.",
    imageInput,
    81,
    false,
  ),
  operation(
    "get_zhihuiya_patent_pdfs",
    "read",
    "pdfData",
    "Get patent PDF download URLs through LinkFox and Patsnap.",
    patentInput({ replaceByRelated: stringReplacement }),
    81,
  ),
  operation(
    "search_zhihuiya_patents",
    "read",
    "querySearchPatent",
    "Search patents with Analytics expressions, deduplication, sorting, and pagination through LinkFox and Patsnap.",
    queryInput,
    3,
  ),
  operation(
    "get_zhihuiya_patent_simple_bibliography",
    "read",
    "simpleBibliography",
    "Get compact patent bibliographic records through LinkFox and Patsnap.",
    patentInput(),
    81,
  ),
] as const;

export const zhihuiyaActions: ProviderActionDefinition[] = zhihuiyaOperations.map(({ action }) => action);
