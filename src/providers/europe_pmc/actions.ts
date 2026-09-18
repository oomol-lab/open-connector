import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "europe_pmc";

const sourceSchema = s.stringEnum("The Europe PMC source code returned with the publication identifier.", [
  "AGR",
  "CBA",
  "CIT",
  "CTX",
  "ETH",
  "HIR",
  "MED",
  "NBK",
  "PAT",
  "PMC",
  "PPR",
]);

const linkedPublicationSourceSchema = s.stringEnum(
  "The Europe PMC source code for a publication with citation or data links.",
  ["AGR", "CBA", "CTX", "ETH", "HIR", "MED", "PAT", "PMC", "PPR"],
);

const publicationIdSchema = s.nonEmptyString("The publication identifier paired with the Europe PMC source code.");

const resultTypeSchema = s.stringEnum("The amount of publication metadata to return.", ["idlist", "lite", "core"]);

const pageSchema = s.integer("The one-based result page number.", { minimum: 1 });
const pageSizeSchema = s.integer("The number of records to return, up to 1000.", {
  minimum: 1,
  maximum: 1000,
});
const rawObjectSchema = s.looseObject("The raw Europe PMC object.");

const publicationSchema = s.object("A normalized Europe PMC publication record.", {
  id: s.string("The publication identifier within its Europe PMC source."),
  source: s.string("The Europe PMC source code."),
  pmid: nullableString("The PubMed identifier when available."),
  pmcid: nullableString("The PubMed Central identifier when available."),
  doi: nullableString("The publication DOI when available."),
  title: nullableString("The publication title."),
  authorString: nullableString("The formatted publication author list."),
  journalTitle: nullableString("The full journal title when available."),
  journalAbbreviation: nullableString("The abbreviated journal title when available."),
  publicationYear: nullableInteger("The publication year when available."),
  publicationDate: nullableString("The earliest publication date reported by Europe PMC."),
  abstractText: nullableString("The abstract returned by Europe PMC, which may contain structural HTML tags."),
  citedByCount: nullableInteger("The number of citing publications indexed by Europe PMC."),
  isOpenAccess: nullableBoolean("Whether Europe PMC marks the publication as open access."),
  hasFullText: nullableBoolean("Whether the publication has full text in Europe PMC."),
  hasReferences: nullableBoolean("Whether Europe PMC has a reference list for the publication."),
  europePmcUrl: s.url("The canonical Europe PMC publication page URL."),
  raw: rawObjectSchema,
});

const relatedPublicationSchema = s.object("A normalized publication from a Europe PMC reference or citation list.", {
  id: nullableString("The linked publication identifier when matched by Europe PMC."),
  source: nullableString("The linked publication source code when matched by Europe PMC."),
  citationType: nullableString("The linked record citation or publication type."),
  title: nullableString("The linked publication title."),
  authorString: nullableString("The formatted author list for the linked publication."),
  journalAbbreviation: nullableString("The abbreviated journal title when available."),
  publicationYear: nullableInteger("The linked publication year when available."),
  volume: nullableString("The journal volume when available."),
  issue: nullableString("The journal issue when available."),
  pageInfo: nullableString("The journal page information when available."),
  citedByCount: nullableInteger("The Europe PMC citation count when supplied."),
  citedOrder: nullableInteger("The one-based order in the source reference list when supplied."),
  matched: nullableBoolean("Whether Europe PMC matched this reference to an indexed record."),
  raw: rawObjectSchema,
});

const linkedPublicationInputProperties = {
  source: linkedPublicationSourceSchema,
  id: publicationIdSchema,
  page: s.optional(pageSchema),
  pageSize: s.optional(pageSizeSchema),
};

const annotationFilterProperties = {
  types: s.optional(
    s.stringArray("Annotation types to include, such as Gene Proteins, Diseases, Chemicals, or Software.", {
      minItems: 1,
      itemDescription: "One official Europe PMC annotation type.",
    }),
  ),
  subtypes: s.optional(
    s.stringArray("Annotation subtypes to include when supported by the provider.", {
      minItems: 1,
      itemDescription: "One official Europe PMC annotation subtype.",
    }),
  ),
  sections: s.optional(
    s.stringArray("Article sections to include, such as Title, Abstract, Methods, Results, or Discussion.", {
      minItems: 1,
      itemDescription: "One official Europe PMC article section.",
    }),
  ),
  providers: s.optional(
    s.stringArray("Annotation providers to include, such as Europe PMC or Open Targets.", {
      minItems: 1,
      itemDescription: "One official Europe PMC annotation provider.",
    }),
  ),
};

const annotationCursorProperties = {
  onlyMatchingAnnotations: s.optional(
    s.boolean("Whether each matching article should contain only annotations that match the search filters."),
  ),
  cursorMark: s.optional(s.number("The numeric cursor returned by the previous annotation page.")),
  pageSize: s.optional(
    s.integer("The number of annotated articles to return, from 1 to 8.", {
      minimum: 1,
      maximum: 8,
    }),
  ),
};

const annotationTagSchema = s.object("A normalized semantic tag attached to an annotation.", {
  name: nullableString("The normalized entity or relationship name."),
  uri: nullableString("The linked ontology or database URI when available."),
});

const annotationSchema = s.object("A normalized text-mined annotation.", {
  id: nullableString("The annotation identifier when supplied."),
  type: nullableString("The annotation type."),
  subtype: nullableString("The annotation subtype for Resources or Accession Numbers when available."),
  provider: nullableString("The annotation provider."),
  section: nullableString("The article section containing the annotation."),
  fileName: nullableString("The supplementary file name for Supplementary material annotations when available."),
  frequency: nullableInteger("The annotation frequency reported by Europe PMC."),
  prefix: nullableString("The text immediately before the annotated span."),
  exact: nullableString("The exact annotated text span."),
  postfix: nullableString("The text immediately after the annotated span."),
  tags: s.array("The semantic tags attached to this annotation.", annotationTagSchema),
  raw: rawObjectSchema,
});

const annotatedArticleSchema = s.object("A normalized annotated Europe PMC article.", {
  source: s.string("The Europe PMC source code."),
  externalId: s.string("The article identifier within its Europe PMC source."),
  pmcid: nullableString("The PubMed Central identifier when available."),
  fullTextIds: s.array(
    "The Europe PMC full-text identifiers attached to this article.",
    s.string("One full-text identifier."),
  ),
  annotations: s.array("The text-mined annotations in this article.", annotationSchema),
  raw: rawObjectSchema,
});

const annotationCursorOutputProperties = {
  cursorMark: nullableNumber("The cursor used for this annotation page."),
  nextCursorMark: nullableNumber("The cursor to pass when requesting the next annotation page."),
  articles: s.array("The normalized annotated articles in this page.", annotatedArticleSchema),
  rawArticles: s.array("The raw annotated article objects.", rawObjectSchema),
};

const grantSchema = s.object("A normalized Europe PMC grant record.", {
  id: nullableString("The funder's grant identifier."),
  doi: nullableString("The grant DOI when available."),
  title: nullableString("The grant title."),
  abstracts: s.array(
    "The scientific, lay, or translated abstracts supplied for the grant.",
    s.object("One normalized grant abstract.", {
      text: s.string("The grant abstract text."),
      language: nullableString("The abstract language code when supplied."),
      type: nullableString("The abstract type, such as scientific or lay."),
    }),
  ),
  funderName: nullableString("The funding organization name."),
  funderDoi: nullableString("The funding organization FundRef DOI URI when available."),
  grantType: nullableString("The official grant type."),
  categories: s.array("The official categories associated with the grant.", s.string("One official grant category.")),
  stream: nullableString("The official funding stream."),
  startDate: nullableString("The grant start date."),
  endDate: nullableString("The grant end date."),
  amount: nullableNumber("The awarded amount when available."),
  currency: nullableString("The currency of the awarded amount when available."),
  investigators: s.array(
    "The principal investigators associated with the grant.",
    s.object("One normalized principal investigator.", {
      givenName: nullableString("The investigator's given name."),
      familyName: nullableString("The investigator's family name."),
      initials: nullableString("The investigator's initials."),
      title: nullableString("The investigator's title."),
      orcid: nullableString("The investigator's ORCID when available."),
    }),
  ),
  institutions: s.array(
    "The recipient institutions associated with the grant.",
    s.object("One normalized recipient institution.", {
      name: nullableString("The institution name supplied with the grant."),
      rorId: nullableString("The institution ROR identifier when available."),
      rorOfficialName: nullableString("The official ROR organization name when available."),
    }),
  ),
  raw: rawObjectSchema,
});

const evaluationSchema = s.object("A normalized publication evaluation or peer-review record.", {
  id: nullableInteger("The Europe PMC evaluation identifier."),
  title: nullableString("The evaluation title."),
  doi: nullableString("The evaluation DOI when available."),
  url: nullableString("The evaluation URL when available."),
  dataOrigin: nullableString("The source from which Europe PMC obtained the evaluation."),
  platform: nullableString("The review or evaluation platform."),
  type: nullableString("The evaluation type, such as referee-report."),
  evaluationDate: nullableString("The evaluation date reported by Europe PMC."),
  dateUpdated: nullableString("The date Europe PMC last updated the evaluation."),
  evaluators: s.array("The raw evaluator records attached to the evaluation.", rawObjectSchema),
  raw: rawObjectSchema,
});

const articleStatusUpdateSchema = s.object("A normalized publication status update.", {
  source: nullableString("The Europe PMC source code."),
  externalId: nullableString("The publication identifier within its source."),
  title: nullableString("The publication title."),
  firstPublicationDate: nullableString("The publication's first publication date."),
  statusUpdates: s.array(
    "The status changes detected by Europe PMC.",
    s.string("One official Europe PMC article status code."),
  ),
  links: s.array("The raw related publication and version links.", rawObjectSchema),
  raw: rawObjectSchema,
});

function nullableString(description: string) {
  return s.nullable(s.string(description));
}

function nullableInteger(description: string) {
  return s.nullable(s.integer(description));
}

function nullableBoolean(description: string) {
  return s.nullable(s.boolean(description));
}

function nullableNumber(description: string) {
  return s.nullable(s.number(description));
}

export const europePmcActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_publications",
    operationType: "read",
    description: "Search Europe PMC literature and preprints with its official query syntax and cursor pagination.",
    inputSchema: s.object(
      "Input parameters for searching Europe PMC publications.",
      {
        query: s.nonEmptyString(
          'The Europe PMC query, including optional fields and Boolean operators such as OPEN_ACCESS:Y AND TITLE:"malaria".',
        ),
        resultType: s.optional(resultTypeSchema),
        synonym: s.optional(s.boolean("Whether to expand search terms with Medical Subject Headings synonyms.")),
        cursorMark: s.optional(
          s.nonEmptyString("The cursor returned by the previous page, or * for the first cursor page."),
        ),
        pageSize: s.optional(pageSizeSchema),
        sort: s.optional(
          s.nonEmptyString("An official single-valued field and direction, such as CITED desc or P_PDATE_D asc."),
        ),
      },
      { optional: ["resultType", "synonym", "cursorMark", "pageSize", "sort"] },
    ),
    outputSchema: s.object("A cursor page of normalized Europe PMC search results.", {
      version: nullableString("The Europe PMC REST API version."),
      hitCount: s.nonNegativeInteger("The total number of matching publications."),
      nextCursorMark: nullableString("The cursor to pass when requesting the next page."),
      publications: s.array("The normalized publications in this page.", publicationSchema),
      request: rawObjectSchema,
      rawResults: s.array("The raw publication objects returned by Europe PMC.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_publication",
    operationType: "read",
    description: "Get one Europe PMC publication by its source code and identifier.",
    inputSchema: s.object(
      "Input parameters for getting one Europe PMC publication.",
      {
        source: sourceSchema,
        id: publicationIdSchema,
        resultType: s.optional(resultTypeSchema),
      },
      { optional: ["resultType"] },
    ),
    outputSchema: s.object("The result of retrieving one Europe PMC publication.", {
      found: s.boolean("Whether Europe PMC returned the requested publication."),
      version: nullableString("The Europe PMC REST API version."),
      publication: s.nullable(publicationSchema),
      request: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_references",
    operationType: "read",
    description: "Get publications referenced by one Europe PMC publication.",
    inputSchema: s.object(
      "Input parameters for getting a publication reference list.",
      linkedPublicationInputProperties,
      { optional: ["page", "pageSize"] },
    ),
    outputSchema: relatedPublicationsOutputSchema(
      "A page of publications referenced by the source publication.",
      "references",
    ),
  }),
  defineProviderAction(service, {
    name: "get_citations",
    operationType: "read",
    description: "Get publications that cite one Europe PMC publication.",
    inputSchema: s.object(
      "Input parameters for getting publications that cite a source publication.",
      linkedPublicationInputProperties,
      { optional: ["page", "pageSize"] },
    ),
    outputSchema: relatedPublicationsOutputSchema(
      "A page of publications that cite the source publication.",
      "citations",
    ),
  }),
  defineProviderAction(service, {
    name: "get_data_links",
    operationType: "read",
    description: "Get consolidated data, text-mined, and external links associated with one Europe PMC publication.",
    inputSchema: s.object(
      "Input parameters for getting Scholix-compatible Europe PMC data links.",
      {
        source: linkedPublicationSourceSchema,
        id: publicationIdSchema,
        category: s.optional(
          s.nonEmptyString("The official Europe PMC link category, such as Clinical Trials or Data Citations."),
        ),
        obtainedBy: s.optional(
          s.stringEnum("How Europe PMC obtained the links.", ["tm_accession", "tm_term", "ext_links", "submission"]),
        ),
        fromDate: s.optional(s.nonEmptyString("The earliest link update date in Europe PMC DD-MM-YYYY format.")),
        tags: s.optional(
          s.array(
            "Europe PMC link tags used to filter the response.",
            s.stringEnum("One Europe PMC data-link tag.", [
              "related_data",
              "supporting_data",
              "plain_english",
              "fulltext",
              "other",
            ]),
            { minItems: 1 },
          ),
        ),
        sectionLimit: s.optional(s.positiveInteger("The maximum number of links returned in each result section.")),
      },
      { optional: ["category", "obtainedBy", "fromDate", "tags", "sectionLimit"] },
    ),
    outputSchema: s.object("The consolidated Europe PMC data links for one publication.", {
      version: nullableString("The Europe PMC REST API version."),
      hitCount: s.nonNegativeInteger("The number of matching link groups reported by Europe PMC."),
      categories: s.array("The raw Europe PMC data-link categories.", rawObjectSchema),
      request: rawObjectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_full_text_xml",
    operationType: "read",
    description: "Get JATS XML full text for a PubMed Central article in the Europe PMC open-access subset.",
    inputSchema: s.object("Input parameters for getting open-access full text XML.", {
      pmcid: s.nonEmptyString("The PubMed Central identifier, including the PMC prefix.", {
        pattern: "^PMC[0-9]+$",
      }),
    }),
    outputSchema: s.object("The open-access full text XML returned by Europe PMC.", {
      pmcid: s.string("The requested PubMed Central identifier."),
      contentType: nullableString("The response content type reported by Europe PMC."),
      contentLength: s.nonNegativeInteger("The number of characters in the returned XML."),
      xml: s.string("The complete JATS XML document."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_evaluations",
    operationType: "read",
    description: "Get linked peer reviews and evaluations for one Europe PMC publication version.",
    inputSchema: s.object("Input parameters for getting publication evaluations.", {
      source: linkedPublicationSourceSchema,
      id: publicationIdSchema,
    }),
    outputSchema: s.object("The evaluations linked to one publication version.", {
      version: nullableString("The Europe PMC REST API version."),
      evaluations: s.array("The normalized evaluations.", evaluationSchema),
      rawEvaluations: s.array("The raw Europe PMC evaluation objects.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "check_article_status",
    operationType: "read",
    description:
      "Check a batch of Europe PMC articles or preprints for publication, version, withdrawal, removal, and retraction updates.",
    inputSchema: s.object("Input parameters for checking publication status updates.", {
      ids: s.array(
        "The Europe PMC publications or preprints to check.",
        s.object("One publication identity.", {
          source: sourceSchema,
          id: publicationIdSchema,
        }),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.object("The publication status updates found by Europe PMC.", {
      metrics: rawObjectSchema,
      updates: s.array("The normalized publications with status updates.", articleStatusUpdateSchema),
      rawUpdates: s.array("The raw publication status update objects.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_annotations_by_articles",
    operationType: "read",
    description: "Get text-mined entities and relationships for up to eight Europe PMC articles in one request.",
    inputSchema: s.object(
      "Input parameters for retrieving annotations by article identifiers.",
      {
        articles: s.array(
          "The Europe PMC articles whose annotations should be retrieved.",
          s.object("One Europe PMC article identity.", {
            source: sourceSchema,
            id: publicationIdSchema,
          }),
          { minItems: 1, maxItems: 8 },
        ),
        ...annotationFilterProperties,
      },
      { optional: ["types", "subtypes", "sections", "providers"] },
    ),
    outputSchema: s.object("The annotations grouped by requested article.", {
      articles: s.array("The normalized annotated articles.", annotatedArticleSchema),
      rawArticles: s.array("The raw annotated article objects.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_annotations_by_entity",
    operationType: "read",
    description: "Find Europe PMC articles containing annotations for a named biological entity.",
    inputSchema: s.object(
      "Input parameters for searching annotations by entity.",
      {
        entity: s.nonEmptyString("The entity name to find in Europe PMC annotations."),
        ...annotationCursorProperties,
      },
      { optional: ["onlyMatchingAnnotations", "cursorMark", "pageSize"] },
    ),
    outputSchema: s.object(
      "A cursor page of articles containing the requested entity.",
      annotationCursorOutputProperties,
    ),
  }),
  defineProviderAction(service, {
    name: "search_annotations_by_relationship",
    operationType: "read",
    description: "Find Europe PMC articles containing a text-mined relationship between two named entities.",
    inputSchema: s.object(
      "Input parameters for searching annotations by entity relationship.",
      {
        firstEntity: s.nonEmptyString("The first entity in the relationship."),
        secondEntity: s.nonEmptyString("The second entity in the relationship."),
        ...annotationCursorProperties,
      },
      { optional: ["onlyMatchingAnnotations", "cursorMark", "pageSize"] },
    ),
    outputSchema: s.object(
      "A cursor page of articles containing the requested relationship.",
      annotationCursorOutputProperties,
    ),
  }),
  defineProviderAction(service, {
    name: "search_annotations_by_provider",
    operationType: "read",
    description: "Find Europe PMC articles containing annotations from a named provider.",
    inputSchema: s.object(
      "Input parameters for searching annotations by provider.",
      {
        provider: s.nonEmptyString("The official Europe PMC annotation provider name."),
        ...annotationCursorProperties,
      },
      { optional: ["onlyMatchingAnnotations", "cursorMark", "pageSize"] },
    ),
    outputSchema: s.object(
      "A cursor page of articles annotated by the requested provider.",
      annotationCursorOutputProperties,
    ),
  }),
  defineProviderAction(service, {
    name: "search_annotations_by_section_or_type",
    operationType: "read",
    description: "Find Europe PMC articles by annotation type, article section, or both in one cursor search.",
    inputSchema: s.object(
      "Input parameters for searching annotations by type or article section.",
      {
        type: s.optional(s.nonEmptyString("The official Europe PMC annotation type.")),
        subtype: s.optional(s.nonEmptyString("The annotation subtype for Resources or Accession Numbers searches.")),
        section: s.optional(s.nonEmptyString("The official Europe PMC article section.")),
        ...annotationCursorProperties,
      },
      {
        optional: ["type", "subtype", "section", "onlyMatchingAnnotations", "cursorMark", "pageSize"],
      },
    ),
    outputSchema: s.object(
      "A cursor page of articles matching the annotation type or section.",
      annotationCursorOutputProperties,
    ),
  }),
  defineProviderAction(service, {
    name: "search_grants",
    operationType: "read",
    description:
      "Search Europe PMC research grants by funder, investigator, institution, topic, date, or other official GRIST fields.",
    inputSchema: s.object(
      "Input parameters for searching Europe PMC grants.",
      {
        query: s.nonEmptyString(
          'The official GRIST query, such as malaria, PI:"Jane Smith", or GRANT_AGENCY:"Wellcome Trust".',
        ),
        resultType: s.optional(s.stringEnum("The amount of grant metadata to return.", ["lite", "core"])),
        page: s.optional(s.integer("The one-based grant result page number.", { minimum: 1 })),
      },
      { optional: ["resultType", "page"] },
    ),
    outputSchema: s.object("A page of normalized Europe PMC grant results.", {
      hitCount: s.nonNegativeInteger("The total number of matching grants."),
      query: nullableString("The normalized query echoed by Europe PMC."),
      resultType: nullableString("The result type echoed by Europe PMC."),
      page: s.integer("The one-based result page number."),
      grants: s.array("The normalized grants in this page.", grantSchema),
      rawResults: s.array("The raw Europe PMC grant records.", rawObjectSchema),
    }),
  }),
];

function relatedPublicationsOutputSchema(description: string, fieldName: "citations" | "references") {
  return s.object(description, {
    version: nullableString("The Europe PMC REST API version."),
    hitCount: s.nonNegativeInteger("The total number of linked publications."),
    page: pageSchema,
    pageSize: pageSizeSchema,
    [fieldName]: s.array("The normalized linked publications in this page.", relatedPublicationSchema),
    request: rawObjectSchema,
    rawResults: s.array("The raw linked publication objects.", rawObjectSchema),
  });
}
