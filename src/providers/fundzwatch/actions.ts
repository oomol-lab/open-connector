import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fundzwatch";
const eventType = s.stringEnum("A FundzWatch business event type.", [
  "funding",
  "acquisition",
  "hiring",
  "contract",
  "product_launch",
]);
const publicInput = s.actionInput(
  {
    query: s.nonWhitespaceString("A company, lender, or broker name to search for."),
    state: s.string({ minLength: 2, maxLength: 2, description: "A two-letter US state code." }),
  },
  [],
  "Filters for a public FundzWatch answer-section feed.",
);
const attribution = s.looseObject("Fundz attribution and licensing metadata.");

function output(description: string, properties: Record<string, JsonSchema>): JsonSchema {
  return s.object(description, { ...properties, attribution: s.optional(attribution) });
}

function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, { name, description, requiredScopes: [], inputSchema, outputSchema });
}

const cohortOutput = output("A FundzWatch scored company cohort.", {
  companies: s.array("Score-ranked company records.", s.looseObject("One company record.")),
  summary: s.looseObject("Cohort summary statistics."),
  meta: s.looseObject("Pagination, tier, and coverage metadata."),
});

export const fundzwatchActions: ActionDefinition[] = [
  action(
    "get_funded_and_hiring",
    "Get companies with recent funding and active hiring evidence. No API key is required.",
    publicInput,
    cohortOutput,
  ),
  action(
    "get_renewal_radar",
    "Get companies whose UCC-1 liens approach their lapse dates. No API key is required.",
    publicInput,
    cohortOutput,
  ),
  action(
    "get_stacked_borrowers",
    "Get companies with active secured debt from multiple lenders. No API key is required.",
    publicInput,
    cohortOutput,
  ),
  action(
    "get_benefit_plans",
    "Get recently funded companies with benefit-plan evidence. No API key is required.",
    publicInput,
    cohortOutput,
  ),
  action(
    "get_money_in_motion",
    "Get companies combining a recent executive move with recent funding. No API key is required.",
    publicInput,
    cohortOutput,
  ),
  action(
    "get_lenders",
    "Search the FundzWatch UCC secured-party directory. No API key is required.",
    s.actionInput(
      {
        query: s.nonWhitespaceString("A lender name to search for."),
        page: s.integer("The one-based results page.", { minimum: 1 }),
      },
      [],
      "Filters for the lender directory.",
    ),
    output("Lender directory results.", {
      lenders: s.array("Lender directory entries.", s.looseObject("One lender entry.")),
      meta: s.looseObject("Pagination and tier metadata."),
    }),
  ),
  action(
    "get_brokers",
    "Search the FundzWatch benefits broker directory. No API key is required.",
    s.actionInput(
      {
        query: s.nonWhitespaceString("A broker name to search for."),
        state: s.string({ minLength: 2, maxLength: 2, description: "A two-letter US state code." }),
        page: s.integer("The one-based results page.", { minimum: 1 }),
      },
      [],
      "Filters for the broker directory.",
    ),
    output("Broker directory results.", {
      brokers: s.array("Broker directory entries.", s.looseObject("One broker entry.")),
      meta: s.looseObject("Pagination and tier metadata."),
    }),
  ),
  action(
    "get_scored_leads",
    "Get leads scored against the connected account's ICP. Requires an API key.",
    s.actionInput(
      {
        minScore: s.number("The minimum buyer-intent score.", { minimum: 0, maximum: 100 }),
        maxResults: s.integer("The maximum number of leads.", { minimum: 1, maximum: 50 }),
        buyingStages: s.array("Buying stages to include.", s.string("One buying stage."), { minItems: 1 }),
        industries: s.stringArray("Industries to include.", { minItems: 1 }),
      },
      [],
      "Filters for AI-scored leads.",
    ),
    output("AI-scored lead results.", {
      signalsFound: s.integer("The number of scored signals found."),
      signals: s.array("Scored lead records.", s.looseObject("One scored lead.")),
    }),
  ),
  action(
    "get_events",
    "Get recent FundzWatch business events. Requires an API key.",
    s.actionInput(
      {
        types: s.array("Business event types.", eventType, { minItems: 1 }),
        days: s.integer("The lookback period in days.", { minimum: 1, maximum: 90 }),
        limit: s.integer("The maximum number of events.", { minimum: 1, maximum: 200 }),
        offset: s.nonNegativeInteger("The number of events to skip."),
        industries: s.stringArray("Industries to include.", { minItems: 1 }),
        locations: s.stringArray("Locations to include.", { minItems: 1 }),
      },
      [],
      "Filters for business events.",
    ),
    output("Business event results.", {
      total: s.integer("The total number of matching events."),
      events: s.array("Business event records.", s.looseObject("One business event.")),
    }),
  ),
  action(
    "get_market_pulse",
    "Get aggregate FundzWatch market activity. Requires an API key.",
    s.actionInput({}, [], "No input is required."),
    output("Market pulse results.", { pulse: s.looseObject("The market pulse.") }),
  ),
  action(
    "get_market_brief",
    "Get the current AI-generated strategic intelligence brief. Requires an API key.",
    s.actionInput({}, [], "No input is required."),
    output("Market brief results.", { brief: s.looseObject("The strategic intelligence brief.") }),
  ),
  action(
    "get_usage",
    "Get the connected API key's tier, counters, and limits.",
    s.actionInput({}, [], "No input is required."),
    output("API usage results.", {
      tier: s.string("The current API tier."),
      currentPeriod: s.string("The current usage period."),
      apiCallsUsed: s.integer("API calls used."),
      aiScoreCallsUsed: s.integer("AI scoring calls used."),
      limits: s.looseObject("Current tier limits."),
      lastApiCall: s.optional(s.nullableString("The last API call time.")),
    }),
  ),
  action(
    "get_watchlist",
    "List companies tracked by the connected account.",
    s.actionInput({}, [], "No input is required."),
    output("Watchlist results.", {
      companies: s.array("Tracked companies.", s.looseObject("One tracked company.")),
      total: s.integer("The number tracked."),
      limit: s.integer("The tier limit."),
    }),
  ),
  action(
    "add_to_watchlist",
    "Add company domains to the connected account's watchlist.",
    s.actionInput(
      {
        domains: s.array("Company domains to track.", s.nonWhitespaceString("One company domain."), { minItems: 1 }),
      },
      ["domains"],
      "Domains to add.",
    ),
    output("Watchlist addition results.", {
      added: s.integer("Companies added."),
      alreadyTracked: s.integer("Companies already tracked."),
      notFound: s.integer("Companies not resolved."),
      totalTracked: s.integer("Total tracked after the request."),
    }),
  ),
  action(
    "get_watchlist_events",
    "Get recent events for tracked companies.",
    s.actionInput(
      {
        days: s.integer("The lookback period in days.", { minimum: 1, maximum: 90 }),
        types: s.array("Business event types.", eventType, { minItems: 1 }),
      },
      [],
      "Filters for watchlist events.",
    ),
    output("Watchlist event results.", {
      events: s.array("Watchlist events.", s.looseObject("One event.")),
      total: s.integer("The number of events."),
      trackedCompanies: s.integer("Tracked companies considered."),
      periodDays: s.integer("The represented lookback period."),
    }),
  ),
];
