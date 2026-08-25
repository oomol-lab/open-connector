import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "consensus";

const monthSchema = s.integer("A month number used to limit the publication window.", {
  minimum: 1,
  maximum: 12,
});
const sjrQuartileSchema = s.integer(
  "An SJR journal quartile where 1 is the highest-quality quartile and 4 is the lowest.",
  { minimum: 1, maximum: 4 },
);
const commaSeparatedFilterSchema = s.array(
  "A list of documented Consensus filter values.",
  s.nonWhitespaceString("One documented Consensus filter value."),
  { minItems: 1 },
);

const paperSchema = s.looseObject("A research paper returned by Consensus.", {
  title: s.optional(s.string("The paper title.")),
  authors: s.optional(s.array("The paper authors.", s.string("One paper author."))),
  publish_year: s.optional(s.integer("The publication year.")),
  doi: s.optional(s.nullable(s.string("The paper DOI when available."))),
  journal_name: s.optional(s.nullable(s.string("The journal name when available."))),
  citation_count: s.optional(s.integer("The number of citations reported by Consensus.")),
  study_type: s.optional(s.nullable(s.string("The detected study design when available."))),
  sample_size: s.optional(s.nullable(s.integer("The study sample size when available."))),
  sjr_best_quartile: s.optional(
    s.nullable(s.integer("The best SJR quartile reported for the journal when available.")),
  ),
  takeaway: s.optional(s.nullable(s.string("The plain-language key takeaway when available."))),
  abstract: s.optional(s.nullable(s.string("The paper abstract when available."))),
  url: s.optional(s.string("The Consensus URL for the paper.")),
});

const searchPapersAction = defineProviderAction(service, {
  name: "search_papers",
  description: "Search Consensus for relevance-ranked academic papers with publication, study, and quality filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching Consensus papers.",
    {
      query: s.nonWhitespaceString("The research question or topic to search for."),
      year_min: s.integer("Exclude papers published before this year."),
      year_max: s.integer("Exclude papers published after this year."),
      month_min: monthSchema,
      month_max: monthSchema,
      study_types: commaSeparatedFilterSchema,
      human: s.boolean("Whether to include only studies involving humans."),
      controlled: s.boolean("Whether to include only controlled studies."),
      sample_size_min: s.integer("Exclude studies with a smaller sample size.", { minimum: 1 }),
      sjr_min: sjrQuartileSchema,
      sjr_max: sjrQuartileSchema,
      citation_min: s.integer("Exclude papers with fewer citations.", { minimum: 0 }),
      duration_min: s.integer("The minimum study duration in days.", { minimum: 0 }),
      duration_max: s.integer("The maximum study duration in days.", { minimum: 0 }),
      exclude_preprints: s.boolean("Whether to exclude preprints."),
      open_access: s.boolean("Whether to include only open-access papers."),
      publisher_name: commaSeparatedFilterSchema,
      domain: commaSeparatedFilterSchema,
      country: commaSeparatedFilterSchema,
      journal_name: s.nonWhitespaceString("A preferred journal name used to rank matching journals higher."),
      clinical_guideline: s.boolean("Whether to include only clinical guidelines."),
      medical_mode: s.boolean("Whether to focus the search on top medical journals and clinical guidelines."),
      include_semantic_score: s.boolean("Whether to include Consensus semantic relevance scores in results."),
      include_full_text_chunks: s.boolean(
        "Whether to include query-relevant licensed full-text excerpts when the plan supports them.",
      ),
      page: s.integer("The zero-indexed result page, up to page 49.", {
        minimum: 0,
        maximum: 49,
      }),
      page_size: s.integer("The requested number of papers; Consensus caps it to the current plan maximum.", {
        minimum: 1,
      }),
    },
    {
      optional: [
        "year_min",
        "year_max",
        "month_min",
        "month_max",
        "study_types",
        "human",
        "controlled",
        "sample_size_min",
        "sjr_min",
        "sjr_max",
        "citation_min",
        "duration_min",
        "duration_max",
        "exclude_preprints",
        "open_access",
        "publisher_name",
        "domain",
        "country",
        "journal_name",
        "clinical_guideline",
        "medical_mode",
        "include_semantic_score",
        "include_full_text_chunks",
        "page",
        "page_size",
      ],
    },
  ),
  outputSchema: s.object("The paginated paper search response returned by Consensus.", {
    results: s.array("The relevance-ranked papers returned for the query.", paperSchema),
    page: s.integer("The zero-indexed page returned by Consensus."),
    page_size: s.integer("The result count limit applied by Consensus."),
    is_end: s.boolean("Whether this is the final page of results."),
    next_page: s.nullable(s.integer("The next page number, or null at the end.")),
  }),
});

export const consensusActions: readonly ActionDefinition[] = [searchPapersAction];
