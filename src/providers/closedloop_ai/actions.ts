import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "closedloop_ai";
// Preserve the MCP envelope so source-completeness warnings in text are not lost
// when the same answer also supplies structured data. Application fields stay upstream-owned.
const output = s.looseObject(
  {
    content: s.array(s.looseObject({ type: s.string("MCP content block type.") }, { required: ["type"] }), {
      description: "All original MCP content blocks, including evidence and completeness warnings.",
    }),
    structuredContent: s.optional(
      s.unknownObject("Original structured tool data, when the upstream tool supplies it."),
    ),
    isError: s.optional(s.boolean("Whether the upstream tool reported an error.")),
    _meta: s.optional(s.unknownObject("Original MCP result metadata, when present.")),
  },
  {
    required: ["content"],
    description:
      "Original MCP tool response. Read source_complete and warning_codes before treating source evidence as complete.",
  },
);

export const closedloopAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_overview",
    description: "Read aggregate product-insight counts and risk categories for a selected time window.",
    operationType: "read",
    requiredScopes: ["mcp:read"],
    inputSchema: s.object({
      time_range: s.stringEnum(["7d", "30d", "90d", "all"], {
        description: "Time window; the upstream default is 30d.",
      }),
    }),
    outputSchema: output,
    followUpActions: ["closedloop_ai.search_insights"],
  }),
  defineProviderAction(service, {
    name: "search_insights",
    description:
      "Find product insights for a topic and inspect result previews before opening exact evidence. This provider exposes the topic, paging, sort and date subset of the upstream search filters.",
    operationType: "read",
    requiredScopes: ["mcp:read"],
    inputSchema: s.object({
      query: s.string("Topic or keywords; omit to use the upstream unfiltered search."),
      limit: s.integer({ minimum: 1, maximum: 100, description: "Results per page; upstream default 20." }),
      offset: s.integer({ minimum: 0, description: "Number of ranked matches to skip; upstream default 0." }),
      sort: s.stringEnum(["relevance", "severity", "frustration", "recency"], {
        description: "Upstream ranking; default relevance.",
      }),
      date_from: s.date("Earliest insight date, YYYY-MM-DD."),
      date_to: s.date("Latest insight date, YYYY-MM-DD."),
    }),
    outputSchema: output,
    followUpActions: ["closedloop_ai.get_insight"],
  }),
  defineProviderAction(service, {
    name: "get_insight",
    description:
      "Open one complete product insight and its actual conversation pointer; do not substitute a shortened ID.",
    operationType: "read",
    requiredScopes: ["mcp:read"],
    inputSchema: s.object(
      { id: s.nonWhitespaceString("Full insight ID returned by search_insights.") },
      { required: ["id"] },
    ),
    outputSchema: output,
    followUpActions: ["closedloop_ai.get_conversation"],
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    description:
      "Read the stored source behind an insight using its exact conversation ID and source. Keep source-completeness warnings alongside any quotation.",
    operationType: "read",
    requiredScopes: ["mcp:read"],
    inputSchema: s.object(
      {
        id: s.nonWhitespaceString(
          "Full ClosedLoop AI conversation ID from the insight pointer; not the upstream product URL or ID.",
        ),
        source: s.stringEnum(
          [
            "gong",
            "fireflies",
            "granola",
            "plaud",
            "readai",
            "google_meet",
            "noota",
            "intercom",
            "freshdesk",
            "ada",
            "typeform",
            "slack",
            "mcp",
            "canny",
            "uservoice",
            "email",
            "hubspot_email",
          ],
          { description: "Exact source value supplied by the conversation pointer." },
        ),
      },
      { required: ["id", "source"] },
    ),
    outputSchema: output,
  }),
];
