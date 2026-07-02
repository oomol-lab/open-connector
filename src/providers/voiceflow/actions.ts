import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "voiceflow";

export type VoiceflowActionName = "start_session" | "interact" | "query_knowledge_base" | "list_environments";

const environmentSchema = s.looseObject("A Voiceflow project environment.", {
  id: s.string("The Voiceflow environment ID."),
  name: s.string("The environment display name."),
  alias: s.string("The stable environment alias."),
  isMain: s.boolean("Whether this is the project's main environment."),
  createdAt: s.string("The environment creation timestamp."),
  draftVersionID: s.string("The draft version ID for this environment."),
  publishedVersionID: s.string("The published version ID for this environment."),
  trafficPercentage: s.number("The percentage of traffic routed to this environment."),
  raw: s.looseObject("The raw Voiceflow environment payload."),
});

export const voiceflowActions: ProviderActionDefinition<VoiceflowActionName>[] = [
  defineProviderAction(service, {
    name: "start_session",
    description:
      "Start a Voiceflow conversation session for one user and return the session key used by non-streaming interact calls.",
    providerPermissions: ["runtime:session"],
    inputSchema: s.actionInput(
      {
        userId: s.nonEmptyString("The stable user ID for the conversation session."),
        environmentAlias: s.nonEmptyString("The Voiceflow environment alias to target, such as main."),
      },
      ["userId"],
    ),
    outputSchema: s.actionOutput({
      sessionKey: s.string("The session-scoped key used as the authorization header for interact."),
    }),
  }),
  defineProviderAction(service, {
    name: "interact",
    description: "Send one non-streaming action to a Voiceflow conversation session.",
    providerPermissions: ["runtime:interact"],
    inputSchema: s.actionInput(
      {
        sessionKey: s.nonEmptyString("The session key returned by start_session."),
        action: s.looseObject("The Voiceflow action payload, such as a text action or launch action."),
        variables: s.looseObject("Variables to merge into the session before processing this turn."),
        state: s.looseObject("Optional runtime state to send with this turn."),
        config: s.object(
          {
            userTimezone: s.nonEmptyString("The user's IANA timezone string."),
          },
          { optional: ["userTimezone"], description: "Optional settings for this turn." },
        ),
      },
      ["sessionKey", "action"],
    ),
    outputSchema: s.actionOutput({
      traces: s.array("The traces emitted by the Voiceflow agent.", s.looseObject("A raw Voiceflow trace.")),
    }),
  }),
  defineProviderAction(service, {
    name: "query_knowledge_base",
    description: "Query the Voiceflow knowledge base and return the synthesized answer and chunks.",
    providerPermissions: ["knowledge_base:query"],
    inputSchema: s.actionInput(
      {
        question: s.nonEmptyString("The question to ask the knowledge base."),
        instruction: s.nonEmptyString("Optional instruction for answer synthesis."),
        chunkLimit: s.integer("The maximum number of chunks to retrieve.", {
          minimum: 1,
          maximum: 30,
        }),
        synthesis: s.boolean("Whether Voiceflow should synthesize an answer."),
        environmentAlias: s.nonEmptyString("The Voiceflow environment alias to target, such as main."),
        versionVariant: s.stringEnum("Whether to query the draft or published environment version.", [
          "draft",
          "published",
        ]),
        filters: s.looseObject("Metadata filters to apply to the knowledge base query."),
        settings: s.looseObject("Model settings for answer synthesis."),
      },
      ["question"],
    ),
    outputSchema: s.actionOutput({
      type: s.string("The Voiceflow response type."),
      model: s.string("The model used to answer the query."),
      output: s.nullable(s.string("The synthesized answer, when synthesis is enabled.")),
      duration: s.number("The query duration reported by Voiceflow."),
      tokens: s.number("The total tokens consumed by the query."),
      chunks: s.array("The retrieved knowledge base chunks.", s.looseObject("A retrieved chunk.")),
      raw: s.looseObject("The raw Voiceflow query response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_environments",
    description: "List environments for the connected Voiceflow project.",
    providerPermissions: ["environment:read"],
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      environments: s.array("The Voiceflow project environments.", environmentSchema),
    }),
  }),
];
