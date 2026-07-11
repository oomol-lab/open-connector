import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pubmed";

export type PubmedActionName =
  | "search_articles"
  | "match_citation"
  | "get_article"
  | "get_articles"
  | "find_related_articles"
  | "get_citing_articles"
  | "get_article_references"
  | "convert_article_ids";

const pmidSchema = s.string("The numeric PubMed identifier (PMID).", {
  minLength: 1,
  pattern: "^[0-9]+$",
});
const offsetSchema = s.integer("The zero-based search result offset.", {
  minimum: 0,
  maximum: 9_999,
  default: 0,
});
const limitSchema = s.integer("The maximum number of articles to return.", {
  minimum: 1,
  maximum: 50,
  default: 10,
});
const sortSchema = s.stringEnum("The PubMed result sort order.", [
  "relevance",
  "publication_date",
  "first_author",
  "journal",
]);
const publicationDateRangeSchema = s.object("An inclusive PubMed publication date range.", {
  from: s.date("The earliest publication date to include."),
  to: s.date("The latest publication date to include."),
});
const articleIdTypeSchema = s.stringEnum("The type shared by every input article identifier.", [
  "pmid",
  "pmcid",
  "doi",
  "mid",
]);

const abstractSectionSchema = s.object("One section of a PubMed abstract.", {
  label: s.nullableString("The structured abstract section label when present."),
  text: s.string("The normalized abstract section text."),
});
const authorSchema = s.object("A normalized PubMed author or author group.", {
  name: s.string("The author or collective author name."),
  orcid: s.nullableString("The author's ORCID when present."),
  affiliations: s.array("The author's affiliations.", s.string("One affiliation.")),
});
const journalSchema = s.object("The journal information attached to a PubMed record.", {
  title: s.nullableString("The full journal title."),
  abbreviation: s.nullableString("The NLM journal abbreviation."),
  issn: s.nullableString("The journal ISSN returned by PubMed."),
  volume: s.nullableString("The journal volume."),
  issue: s.nullableString("The journal issue."),
});
const articleSchema = s.object("A normalized PubMed article record.", {
  pmid: pmidSchema,
  title: s.string("The article title."),
  abstract: s.array("The structured or unstructured abstract sections.", abstractSectionSchema),
  authors: s.array("The article authors.", authorSchema),
  journal: journalSchema,
  publicationDate: s.nullableString("The publication date or source Medline date."),
  publicationTypes: s.array("The PubMed publication types.", s.string("One publication type.")),
  meshTerms: s.array("The assigned Medical Subject Headings.", s.string("One MeSH descriptor.")),
  keywords: s.array("The keywords attached to the PubMed record.", s.string("One keyword.")),
  languages: s.array("The article language codes returned by PubMed.", s.string("One language code.")),
  doi: s.nullableString("The article DOI when present."),
  pmcid: s.nullableString("The PubMed Central identifier when present."),
  pubmedUrl: s.url("The canonical PubMed record URL."),
  pmcUrl: s.nullable(s.url("The PubMed Central article URL when available.")),
});
const convertedArticleIdSchema = s.object("The available identifiers for one requested article.", {
  requestedId: s.string("The original identifier from the request."),
  pmid: s.nullableString("The PubMed identifier when the article has one."),
  pmcid: s.nullableString("The PubMed Central identifier when the article is represented in PMC."),
  doi: s.nullableString("The DOI when PMC reports one."),
  mid: s.nullableString("The author manuscript identifier when PMC reports one."),
  error: s.nullableString("The PMC ID Converter error when the requested identifier could not be resolved."),
});

export const pubmedActions: readonly ProviderActionDefinition<PubmedActionName>[] = [
  defineProviderAction(service, {
    name: "search_articles",
    description: "Search PubMed with the official query syntax and return normalized article records.",
    inputSchema: s.object(
      "Input parameters for searching PubMed articles.",
      {
        query: s.nonEmptyString(
          "The PubMed query, including optional official field tags and Boolean operators such as cancer[Title] AND 2025[pdat].",
        ),
        offset: offsetSchema,
        limit: limitSchema,
        sort: sortSchema,
        publicationDateRange: publicationDateRangeSchema,
      },
      { optional: ["offset", "limit", "sort", "publicationDateRange"] },
    ),
    outputSchema: s.object("A page of normalized PubMed search results.", {
      total: s.nonNegativeInteger("The total number of matching PubMed records."),
      offset: s.nonNegativeInteger("The zero-based result offset."),
      limit: s.positiveInteger("The requested page size."),
      queryTranslation: s.nullableString("The query translation reported by PubMed."),
      articles: s.array("The normalized articles in this page.", articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "match_citation",
    description: "Match one raw biomedical citation to PubMed and return normalized candidate articles.",
    inputSchema: s.object("Input parameters for matching one citation.", {
      citation: s.nonEmptyString(
        "The citation text to match, such as an article title followed by its journal, year, volume, and pages.",
      ),
    }),
    outputSchema: s.object("The PubMed articles matched from the citation text.", {
      matched: s.boolean("Whether PubMed returned at least one candidate article."),
      articles: s.array("The normalized candidate articles returned by PubMed.", articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_article",
    description: "Get one normalized PubMed article by PMID.",
    inputSchema: s.object("Input parameters for getting one PubMed article.", {
      pmid: pmidSchema,
    }),
    outputSchema: s.object("The result of retrieving one PubMed article.", {
      found: s.boolean("Whether PubMed returned the requested record."),
      article: s.nullable(articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_articles",
    description: "Get multiple normalized PubMed articles by PMID in one request.",
    inputSchema: s.object("Input parameters for getting multiple PubMed articles.", {
      pmids: s.array("The PubMed identifiers to retrieve.", pmidSchema, {
        minItems: 1,
        maxItems: 50,
      }),
    }),
    outputSchema: s.object("The result of retrieving multiple PubMed articles.", {
      articles: s.array("The PubMed records that were found.", articleSchema),
      notFoundPmids: s.array("The requested PMIDs that PubMed did not return.", pmidSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "find_related_articles",
    description: "Find normalized PubMed articles related to one source PMID.",
    inputSchema: s.object(
      "Input parameters for finding related PubMed articles.",
      {
        pmid: pmidSchema,
        limit: limitSchema,
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The related PubMed articles returned for one source record.", {
      sourcePmid: pmidSchema,
      articles: s.array("The normalized related PubMed articles.", articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_citing_articles",
    description:
      "Get normalized PubMed articles known to cite one source PMID. PubMed citation coverage depends on data supplied by publishers and NCBI sources and may be incomplete.",
    inputSchema: s.object(
      "Input parameters for getting articles that cite a source PubMed record.",
      {
        pmid: pmidSchema,
        limit: limitSchema,
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The citing PubMed articles returned for one source record.", {
      sourcePmid: pmidSchema,
      articles: s.array("The normalized articles known to cite the source record.", articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_article_references",
    description:
      "Get normalized PubMed references for one source PMID. References are available only when supplied by publishers or recoverable from PMC data.",
    inputSchema: s.object(
      "Input parameters for getting references from a source PubMed record.",
      {
        pmid: pmidSchema,
        limit: limitSchema,
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The PubMed references returned for one source record.", {
      sourcePmid: pmidSchema,
      articles: s.array("The normalized PubMed articles referenced by the source record.", articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "convert_article_ids",
    description:
      "Convert PMID, PMCID, DOI, or author manuscript identifiers with the PMC ID Converter. Complete mappings are available only for articles represented in PubMed Central.",
    inputSchema: s.object("Input parameters for converting article identifiers.", {
      ids: s.array(
        "The article identifiers to convert. Every identifier must have the same idType.",
        s.nonEmptyString("One PMID, PMCID, DOI, or author manuscript identifier."),
        {
          minItems: 1,
          maxItems: 200,
        },
      ),
      idType: articleIdTypeSchema,
    }),
    outputSchema: s.object("The available identifier mappings returned by PMC.", {
      records: s.array("One conversion result for each identifier returned by PMC.", convertedArticleIdSchema),
    }),
  }),
];
