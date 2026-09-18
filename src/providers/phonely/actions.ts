import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "phonely" as const;

const agentSchema = s.looseObject("A Phonely agent record.", {
  uid: s.string("The Phonely user ID that owns the agent."),
  agentId: s.string("The unique Phonely agent ID."),
  name: s.string("The agent name."),
  country: s.optional(s.nullable(s.string("The agent country code when configured."))),
  businessPhoneNumber: s.optional(
    s.nullable(s.string("The business phone number assigned to the agent when configured.")),
  ),
});

const callSchema = s.looseObject("A Phonely call record returned by the API.");

export const phonelyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_agents",
    operationType: "read",
    description: "List the Phonely agents accessible to the connected user.",
    requiredScopes: [],
    inputSchema: s.object("The input for listing Phonely agents.", {}),
    outputSchema: s.object("The accessible Phonely agents.", {
      agents: s.array("The agents accessible to the connected user.", agentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_agent",
    operationType: "read",
    description: "Get one Phonely agent by its agent ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting one Phonely agent.", {
      agentId: s.nonEmptyString("The unique Phonely agent ID."),
    }),
    outputSchema: s.object("The requested Phonely agent.", {
      agent: agentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    operationType: "read",
    description: "List calls for a Phonely agent with pagination and optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing calls for a Phonely agent.",
      {
        agentId: s.nonEmptyString("The unique Phonely agent ID."),
        limit: s.integer("The maximum number of calls to return.", { minimum: 1 }),
        offset: s.integer("The number of matching calls to skip.", { minimum: 0 }),
        customerPhoneNumber: s.string("The customer phone number to match."),
        campaignId: s.string("The campaign ID to match."),
        status: s.array(
          "The call statuses to include.",
          s.stringEnum("One documented Phonely call status.", ["COMPLETED", "FAILED", "ENDED", "IN_PROGRESS"]),
          { minItems: 1 },
        ),
        sentiment: s.array(
          "The customer sentiments to include.",
          s.stringEnum("One documented Phonely sentiment.", ["Positive", "Negative", "Neutral"]),
          { minItems: 1 },
        ),
        callType: s.array(
          "The call types to include.",
          s.stringEnum("One documented Phonely call type.", [
            "inboundPhoneCall",
            "outboundPhoneCall",
            "webCall",
            "dailyCall",
          ]),
          { minItems: 1 },
        ),
        outcome: s.array("The call outcomes to include.", s.string("One call outcome."), {
          minItems: 1,
        }),
        endedReason: s.array("The call ended reasons to include.", s.string("One call ended reason."), { minItems: 1 }),
        mode: s.array("The call modes to include.", s.string("One call mode."), {
          minItems: 1,
        }),
        startDate: s.dateTime("Return calls starting at or after this ISO 8601 time."),
        endDate: s.dateTime("Return calls starting at or before this ISO 8601 time."),
        minDuration: s.number("The minimum call duration in seconds.", { minimum: 0 }),
        maxDuration: s.number("The maximum call duration in seconds.", { minimum: 0 }),
      },
      {
        optional: [
          "limit",
          "offset",
          "customerPhoneNumber",
          "campaignId",
          "status",
          "sentiment",
          "callType",
          "outcome",
          "endedReason",
          "mode",
          "startDate",
          "endDate",
          "minDuration",
          "maxDuration",
        ],
      },
    ),
    outputSchema: s.object("A page of Phonely calls.", {
      items: s.array("The calls in this page.", callSchema),
      total: s.integer("The total number of calls matching the filters."),
      limit: s.integer("The page limit used by Phonely."),
      offset: s.integer("The page offset used by Phonely."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_call",
    operationType: "read",
    description: "Get the detailed call summary and transcript for a Phonely call.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting one Phonely call.", {
      agentId: s.nonEmptyString("The unique Phonely agent ID."),
      callId: s.nonEmptyString("The unique Phonely call ID."),
    }),
    outputSchema: s.object("The matching Phonely call details.", {
      calls: s.array("The call detail records returned by Phonely.", callSchema),
    }),
  }),
];
