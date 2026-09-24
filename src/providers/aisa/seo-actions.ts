import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const database = s.string("The Semrush regional database code, such as us.");
const semrushOutput = s.looseObject("The parsed Semrush report returned by AIsa.");
const backlinkTargetType = s.stringEnum("How Semrush should interpret the backlink target.", [
  "root_domain",
  "domain",
  "url",
]);

export const semrushKeywordOverviewAction: ActionDefinition = defineProviderAction(service, {
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

export const semrushKeywordDifficultyAction: ActionDefinition = defineProviderAction(service, {
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
    { optional: ["database"] },
  ),
  outputSchema: semrushOutput,
});

export const semrushBroadMatchKeywordsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_semrush_broad_match_keywords",
  operationType: "read",
  description: "Find broad-match keyword ideas for a seed phrase.",
  requiredScopes: [],
  inputSchema: s.object(
    "A seed phrase and regional database for Semrush broad-match ideas.",
    { phrase: s.string("The seed keyword phrase."), database },
    { optional: ["database"] },
  ),
  outputSchema: semrushOutput,
});

export const semrushQuestionKeywordsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_semrush_question_keywords",
  operationType: "read",
  description: "Find question-form keyword ideas for a seed phrase.",
  requiredScopes: [],
  inputSchema: s.object(
    "A seed phrase and regional database for Semrush question keywords.",
    { phrase: s.string("The seed keyword phrase."), database },
    { optional: ["database"] },
  ),
  outputSchema: semrushOutput,
});

export const semrushDomainRankHistoryAction: ActionDefinition = defineProviderAction(service, {
  name: "get_semrush_domain_rank_history",
  operationType: "read",
  description: "Get historical Semrush rank and search-visibility metrics for a domain.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A domain and regional database for its Semrush rank history.", {
    domain: s.string("The domain to analyze without a path."),
    database,
  }),
  outputSchema: semrushOutput,
});

export const semrushDomainComparisonAction: ActionDefinition = defineProviderAction(service, {
  name: "compare_semrush_domains",
  operationType: "read",
  description: "Compare organic or paid keyword portfolios across domains.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A Semrush comparison expression and regional database.", {
    comparison: s.string("Semrush sign|type|domain groups joined by |, such as +|or|a.com|+|or|b.com."),
    database,
  }),
  outputSchema: semrushOutput,
});

export const semrushBacklinksOverviewAction: ActionDefinition = defineProviderAction(service, {
  name: "get_semrush_backlinks_overview",
  operationType: "read",
  description: "Get authority, backlink, referring-domain, URL, and IP totals for a root domain.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A root domain for a Semrush backlink overview.", {
    target: s.string("The root domain to analyze."),
  }),
  outputSchema: semrushOutput,
});

export const semrushBacklinksAction: ActionDefinition = defineProviderAction(service, {
  name: "get_semrush_backlinks",
  operationType: "read",
  description: "List backlinks pointing to a domain or URL.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A Semrush backlink target and its target type.", {
    target: s.string("The domain or URL whose backlinks should be returned."),
    targetType: backlinkTargetType,
  }),
  outputSchema: semrushOutput,
});

export const semrushReferringDomainsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_semrush_referring_domains",
  operationType: "read",
  description: "List domains linking to a target domain or URL.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A Semrush backlink target and its target type.", {
    target: s.string("The domain or URL whose referring domains should be returned."),
    targetType: backlinkTargetType,
  }),
  outputSchema: semrushOutput,
});

export const semrushBacklinkCompetitorsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_semrush_backlink_competitors",
  operationType: "read",
  description: "Find domains competing with a target for backlinks.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A Semrush backlink target and its target type.", {
    target: s.string("The domain or URL used to find backlink competitors."),
    targetType: backlinkTargetType,
  }),
  outputSchema: semrushOutput,
});

export const seoActions: ActionDefinition[] = [
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
