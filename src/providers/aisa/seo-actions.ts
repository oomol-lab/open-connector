import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const database = s.string("The Semrush regional database code, such as us.");
const semrushOutput = s.object(
  "The parsed Semrush report returned by AIsa.",
  {
    rawText: s.string("The original semicolon-delimited response returned by AIsa."),
    columns: s.array("The report columns in response order.", s.string("A report column name.")),
    rows: s.array(
      "The report rows in response order.",
      s.array("One report row aligned with columns.", s.string("A raw Semrush field value.")),
    ),
  },
  { optional: [] },
);

const backlinkTargetType = s.stringEnum("How Semrush should interpret the backlink target.", [
  "root_domain",
  "domain",
  "url",
]);
const semrushKeywordOverviewAction = defineProviderAction(service, {
  name: "get_semrush_keyword_overview",
  operationType: "read",
  description: "Get volume, CPC, competition, and result counts for a keyword.",
  requiredScopes: [],
  inputSchema: s.object(
    "A keyword and regional database for a Semrush overview.",
    { phrase: s.string("The keyword phrase to analyze."), database },
    { optional: ["database"] },
  ),
  outputSchema: semrushOutput,
});
const semrushKeywordDifficultyAction = defineProviderAction(service, {
  name: "get_semrush_keyword_difficulty",
  operationType: "read",
  description: "Get keyword-difficulty scores for up to 20 keywords.",
  requiredScopes: [],
  inputSchema: s.object(
    "Keywords and a regional database for a Semrush difficulty report.",
    {
      phrases: s.array("The one to twenty keywords to analyze.", s.string("A keyword phrase."), {
        minItems: 1,
        maxItems: 20,
        uniqueItems: true,
      }),
      database,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushBroadMatchKeywordsAction = defineProviderAction(service, {
  name: "get_semrush_broad_match_keywords",
  operationType: "read",
  description: "Find broad-match keyword ideas for a seed phrase.",
  requiredScopes: [],
  inputSchema: s.object(
    "A seed phrase and regional database for Semrush broad-match ideas.",
    {
      phrase: s.string("The seed keyword phrase."),
      database,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushQuestionKeywordsAction = defineProviderAction(service, {
  name: "get_semrush_question_keywords",
  operationType: "read",
  description: "Find question-form keyword ideas for a seed phrase.",
  requiredScopes: [],
  inputSchema: s.object(
    "A seed phrase and regional database for Semrush question keywords.",
    {
      phrase: s.string("The seed keyword phrase."),
      database,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushDomainRankHistoryAction = defineProviderAction(service, {
  name: "get_semrush_domain_rank_history",
  operationType: "read",
  description: "Get historical Semrush rank and search-visibility metrics for a domain.",
  requiredScopes: [],
  inputSchema: s.object(
    "A domain and regional database for its Semrush rank history.",
    {
      domain: s.string("The domain to analyze without a path."),
      database,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushDomainComparisonAction = defineProviderAction(service, {
  name: "compare_semrush_domains",
  operationType: "read",
  description: "Compare organic or paid keyword portfolios across domains.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Semrush comparison expression and regional database.",
    {
      comparison: s.string("Semrush sign|type|domain groups joined by |, such as +|or|a.com|+|or|b.com."),
      database,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushBacklinksOverviewAction = defineProviderAction(service, {
  name: "get_semrush_backlinks_overview",
  operationType: "read",
  description: "Get authority, backlink, referring-domain, URL, and IP totals for a root domain.",
  requiredScopes: [],
  inputSchema: s.object(
    "A root domain for a Semrush backlink overview.",
    {
      target: s.string("The root domain to analyze."),
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushBacklinksAction = defineProviderAction(service, {
  name: "get_semrush_backlinks",
  operationType: "read",
  description: "List backlinks pointing to a domain or URL.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Semrush backlink target and its target type.",
    {
      target: s.string("The domain or URL whose backlinks should be returned."),
      targetType: backlinkTargetType,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushReferringDomainsAction = defineProviderAction(service, {
  name: "get_semrush_referring_domains",
  operationType: "read",
  description: "List domains linking to a target domain or URL.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Semrush backlink target and its target type.",
    {
      target: s.string("The domain or URL whose referring domains should be returned."),
      targetType: backlinkTargetType,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushBacklinkCompetitorsAction = defineProviderAction(service, {
  name: "get_semrush_backlink_competitors",
  operationType: "read",
  description: "Find domains competing with a target for backlinks.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Semrush backlink target and its target type.",
    {
      target: s.string("The domain or URL used to find backlink competitors."),
      targetType: backlinkTargetType,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushDomainOverviewAction = defineProviderAction(service, {
  name: "get_semrush_domain_overview",
  operationType: "read",
  description: "Get current Semrush rank, organic keyword, traffic, cost, and paid keyword totals for a domain.",
  requiredScopes: [],
  inputSchema: s.object(
    "A domain and optional regional database for its Semrush overview.",
    {
      domain: s.string("The domain to analyze without a path."),
      database: s.string("The Semrush regional database code, such as us. Defaults to us when omitted."),
    },
    { optional: ["database"] },
  ),
  outputSchema: semrushOutput,
});
const semrushOrganicResultsAction = defineProviderAction(service, {
  name: "get_semrush_organic_results",
  operationType: "read",
  description: "List domains, URLs, and raw SERP feature codes for a keyword in Google organic search.",
  requiredScopes: [],
  inputSchema: s.object(
    "A keyword and optional regional database for its organic search results.",
    {
      phrase: s.string("The keyword phrase to analyze."),
      database: s.string("The Semrush regional database code, such as us. Defaults to us when omitted."),
    },
    { optional: ["database"] },
  ),
  outputSchema: semrushOutput,
});
const semrushDomainOrganicKeywordsAction = defineProviderAction(service, {
  name: "get_semrush_domain_organic_keywords",
  operationType: "read",
  description: "List a domain's Google organic keywords with positions, search volume, CPC, and ranking URLs.",
  requiredScopes: [],
  inputSchema: s.object(
    "A domain and regional database for its organic keywords.",
    {
      domain: s.string("The domain to analyze without a path."),
      database,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushOrganicCompetitorsAction = defineProviderAction(service, {
  name: "get_semrush_organic_competitors",
  operationType: "read",
  description: "Find Google organic search competitors with relevance and shared keyword counts.",
  requiredScopes: [],
  inputSchema: s.object(
    "A domain and regional database for its organic search competitors.",
    {
      domain: s.string("The domain to analyze without a path."),
      database,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushUrlOrganicKeywordsAction = defineProviderAction(service, {
  name: "get_semrush_url_organic_keywords",
  operationType: "read",
  description: "List a landing page's Google organic keywords with positions, search volume, and CPC.",
  requiredScopes: [],
  inputSchema: s.object(
    "A landing page URL and regional database for its organic keywords.",
    {
      url: s.string("The complete landing page URL to analyze."),
      database,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushBacklinkAnchorsAction = defineProviderAction(service, {
  name: "get_semrush_backlink_anchors",
  operationType: "read",
  description: "Get backlink anchor text and backlink counts for a domain or URL.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Semrush backlink target and target type for anchor-text distribution.",
    {
      target: s.string("The domain or URL whose backlink anchors should be returned."),
      targetType: backlinkTargetType,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
const semrushIndexedPagesAction = defineProviderAction(service, {
  name: "get_semrush_indexed_pages",
  operationType: "read",
  description:
    "List pages with backlinks and their backlink counts; this report does not verify Google indexation or live HTTP status.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Semrush backlink target and target type for pages with backlinks.",
    {
      target: s.string("The domain or URL whose linked pages should be returned."),
      targetType: backlinkTargetType,
    },
    { optional: [] },
  ),
  outputSchema: semrushOutput,
});
export const seoActions: readonly ActionDefinition[] = [
  semrushDomainOverviewAction,
  semrushOrganicResultsAction,
  semrushDomainOrganicKeywordsAction,
  semrushOrganicCompetitorsAction,
  semrushUrlOrganicKeywordsAction,
  semrushBacklinkAnchorsAction,
  semrushIndexedPagesAction,
  semrushKeywordOverviewAction,
  semrushKeywordDifficultyAction,
  semrushBroadMatchKeywordsAction,
  semrushQuestionKeywordsAction,
  semrushDomainRankHistoryAction,
  semrushDomainComparisonAction,
  semrushBacklinksOverviewAction,
  semrushBacklinksAction,
  semrushReferringDomainsAction,
  semrushBacklinkCompetitorsAction,
];
