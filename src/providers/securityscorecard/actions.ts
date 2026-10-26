import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const portfolioId = s.nonEmptyString("The portfolio ID.");

const identifier = s.nonEmptyString(
  "The company domain or custom scorecard identifier. Add the company to a portfolio before querying its scorecard.",
);

const domain = s.nonEmptyString("The company domain, normalized to lowercase.");

const name = s.nonEmptyString("The human-readable portfolio name.");

const description = s.string("The human-readable portfolio description.");

const privacy = s.stringEnum(
  "Portfolio visibility: private to its owner, shared with the organization, or restricted to a team.",
  ["private", "shared", "team"],
);

const portfolio = s.object(
  "The portfolio returned by SecurityScorecard.",
  {
    id: s.string("The portfolio ID."),
    name,
    description,
    privacy,
  },
  {
    additionalProperties: true,
    required: ["name"],
  },
);

const company = s.object(
  "The company scorecard summary. Scores may be absent while calculation is pending.",
  {
    name: s.string("The public company name."),
    domain: s.string("The primary company domain."),
    score: s.integer("The company security score."),
    grade: s.string("The company security grade."),
    industry: s.string("The company industry."),
  },
  {
    additionalProperties: true,
    required: [],
  },
);

const success = s.requiredObject("The completed deletion result.", {
  success: s.boolean("Whether the deletion succeeded."),
});

export const securityscorecardActions: ActionDefinition[] = [
  defineProviderAction("securityscorecard", {
    name: "list_portfolios",
    operationType: "read",
    requiredScopes: [],
    description: "List all SecurityScorecard portfolios accessible to the connected account.",
    inputSchema: s.requiredObject("The portfolio listing input.", {}),
    outputSchema: s.object(
      "The portfolio list.",
      {
        entries: s.array("The accessible portfolios.", portfolio),
        count: s.integer("The total number of portfolios."),
      },
      {
        additionalProperties: true,
        required: ["entries"],
      },
    ),
  }),
  defineProviderAction("securityscorecard", {
    name: "create_portfolio",
    operationType: "write",
    requiredScopes: [],
    description: "Create a SecurityScorecard portfolio for monitoring companies.",
    inputSchema: s.object(
      "The new portfolio settings.",
      {
        name,
        description,
        privacy,
        team_id: s.string("The team ID for a team portfolio."),
      },
      {
        optional: ["description", "privacy", "team_id"],
      },
    ),
    outputSchema: portfolio,
  }),
  defineProviderAction("securityscorecard", {
    name: "update_portfolio",
    operationType: "write",
    requiredScopes: [],
    description: "Update a SecurityScorecard portfolio name, description, or visibility.",
    inputSchema: s.object(
      "The portfolio update settings.",
      { portfolio_id: portfolioId, name, description, privacy },
      {
        optional: ["description", "privacy"],
      },
    ),
    outputSchema: portfolio,
  }),
  defineProviderAction("securityscorecard", {
    name: "delete_portfolio",
    operationType: "destructive",
    requiredScopes: [],
    description: "Delete a SecurityScorecard portfolio.",
    inputSchema: s.requiredObject("The portfolio deletion input.", { portfolio_id: portfolioId }),
    outputSchema: success,
  }),
  defineProviderAction("securityscorecard", {
    name: "list_portfolio_companies",
    operationType: "read",
    requiredScopes: [],
    description: "List companies in a SecurityScorecard portfolio with optional risk filters.",
    inputSchema: s.object(
      "The portfolio company filters.",
      {
        portfolio_id: portfolioId,
        grade: s.string("Filter by security grade."),
        industry: s.string("Filter by industry."),
        vulnerability: s.string("Filter by CVE vulnerability."),
        issue_type: s.string("Filter by issue type."),
        status: s.stringEnum("Filter by company status.", ["active", "inactive"]),
        had_breach_within_last_days: s.number("Filter companies with breaches within this many days."),
      },
      {
        optional: ["grade", "industry", "vulnerability", "issue_type", "status", "had_breach_within_last_days"],
      },
    ),
    outputSchema: s.object(
      "The portfolio company list.",
      {
        entries: s.array("The matching companies.", company),
        total: s.integer("The total number of companies in the portfolio."),
      },
      {
        additionalProperties: true,
        required: ["entries"],
      },
    ),
  }),
  defineProviderAction("securityscorecard", {
    name: "add_portfolio_company",
    operationType: "write",
    requiredScopes: [],
    description: "Add a company to a SecurityScorecard portfolio and request its scorecard if needed.",
    inputSchema: s.requiredObject("The company membership input.", { portfolio_id: portfolioId, domain }),
    outputSchema: company,
  }),
  defineProviderAction("securityscorecard", {
    name: "remove_portfolio_company",
    operationType: "write",
    requiredScopes: [],
    description: "Remove a company from a SecurityScorecard portfolio.",
    inputSchema: s.requiredObject("The company membership removal input.", {
      portfolio_id: portfolioId,
      domain,
    }),
    outputSchema: success,
  }),
  defineProviderAction("securityscorecard", {
    name: "get_company",
    operationType: "read",
    requiredScopes: [],
    description: "Get company information and the current SecurityScorecard score summary.",
    inputSchema: s.requiredObject("The company scorecard input.", { scorecard_identifier: identifier }),
    outputSchema: company,
  }),
  defineProviderAction("securityscorecard", {
    name: "get_company_factors",
    operationType: "read",
    requiredScopes: [],
    description: "Get a company security factor scores and issue counts from SecurityScorecard.",
    inputSchema: s.object(
      "The company factor filters.",
      {
        scorecard_identifier: identifier,
        severity: s.stringEnum("Filter issues by one severity.", ["positive", "info", "low", "medium", "high"]),
        severity_in: s.string("Filter issues by a comma-separated severity list, such as high,medium."),
      },
      {
        optional: ["severity", "severity_in"],
      },
    ),
    outputSchema: s.object(
      "The company security factors.",
      {
        entries: s.array(
          "The factor scores and issue counts.",
          s.looseObject("A security factor with its score and issue counts."),
        ),
        total: s.integer("The total number of factors."),
      },
      {
        additionalProperties: true,
        required: ["entries"],
      },
    ),
  }),
  defineProviderAction("securityscorecard", {
    name: "get_company_score_history",
    operationType: "read",
    requiredScopes: [],
    description: "Get historical SecurityScorecard scores for a company over a date range.",
    inputSchema: s.object(
      "The historical score query.",
      {
        scorecard_identifier: identifier,
        timing: s.stringEnum("The history granularity; defaults to daily upstream.", ["daily", "weekly", "monthly"]),
        from: s.string("The history start date in YYYY-MM-DD format.", { format: "date" }),
        to: s.string("The history end date in YYYY-MM-DD format.", { format: "date" }),
      },
      {
        optional: ["timing", "from", "to"],
      },
    ),
    outputSchema: s.looseObject("The historical company scores.", {
      entries: s.array(
        "The historical score entries; empty if the company has not been scored.",
        s.looseObject("A dated historical company score."),
      ),
    }),
  }),
];
