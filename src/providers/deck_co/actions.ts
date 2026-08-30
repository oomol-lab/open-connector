import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "deck_co" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const cursorSchema = nonEmptyString("Opaque cursor string returned by a previous Deck.co page.");
const limitSchema = s.integer("Maximum number of items to return. Deck.co allows 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const requestIdSchema = s.nullable(s.string("Unique identifier for the Deck.co API request."));
const timestampSchema = s.dateTime("ISO 8601 timestamp returned by Deck.co.");

const taskSummarySchema = s.looseRequiredObject("A Deck.co task summary object.", {
  id: s.string("Unique identifier for the task, prefixed with task_."),
  object: s.string("Resource type returned by Deck.co."),
  name: s.string("Display name for the task."),
  status: s.string("Current task status, such as learning, test, or live."),
});

const agentSchema = s.looseRequiredObject("A Deck.co agent object.", {
  id: s.string("Unique identifier for the agent, prefixed with agt_."),
  object: s.string("Resource type returned by Deck.co."),
  name: s.string("Display name for the agent."),
  description: s.nullable(s.string("Description of the agent purpose.")),
  tasks: s.array("Tasks associated with the agent.", taskSummarySchema),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const sourceWebsiteSchema = s.looseRequiredObject("Website configuration for a Deck.co source.", {
  url: s.string("The website or service URL. Deck.co may normalize this value after create or update."),
});

const sourceSchema = s.looseRequiredObject("A Deck.co source object.", {
  id: s.string("Unique identifier for the source, prefixed with src_."),
  object: s.string("Resource type returned by Deck.co."),
  name: s.nullable(s.string("Display name for the source.")),
  type: s.string("The source type. Deck.co currently supports website sources."),
  website: sourceWebsiteSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const testApiKeyInputSchema = s.object("No input is required to test a Deck.co API key.", {});

const testApiKeyOutputSchema = s.object("Deck.co API key test response.", {
  status: s.string("Readiness status returned by Deck.co."),
  environment: s.string("Deck.co API environment for the key."),
  request_id: s.string("Unique identifier for the Deck.co API request."),
});

const paginatedInputSchema = s.object(
  "Cursor pagination parameters for Deck.co list endpoints.",
  {
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["limit", "cursor"] },
);

const getAgentInputSchema = s.object("Input parameters for retrieving a Deck.co agent.", {
  agent_id: nonEmptyString("Unique identifier for the agent, prefixed with agt_."),
});

const getSourceInputSchema = s.object("Input parameters for retrieving a Deck.co source.", {
  source_id: nonEmptyString("Unique identifier for the source, prefixed with src_."),
});

const createSourceInputSchema = s.object(
  "Input parameters for creating a Deck.co website source.",
  {
    website_url: s.url("The website or service URL to register as a Deck.co source."),
    name: s.string("Display name for the source.", { minLength: 1 }),
    idempotencyKey: s.string("An optional Idempotency-Key header value for safe retries.", {
      minLength: 1,
      maxLength: 256,
    }),
  },
  { optional: ["name", "idempotencyKey"] },
);

const listAgentsOutputSchema = s.object("Paginated Deck.co agents response.", {
  agents: s.array("Agents returned for the requested page.", agentSchema),
  hasMore: s.boolean("Whether Deck.co has more agents beyond this page."),
  nextCursor: s.nullable(s.string("Cursor to pass into the next request, when available.")),
  requestId: requestIdSchema,
});

const getAgentOutputSchema = s.object("Deck.co agent response.", {
  agent: agentSchema,
});

const listSourcesOutputSchema = s.object("Paginated Deck.co sources response.", {
  sources: s.array("Sources returned for the requested page.", sourceSchema),
  hasMore: s.boolean("Whether Deck.co has more sources beyond this page."),
  nextCursor: s.nullable(s.string("Cursor to pass into the next request, when available.")),
  requestId: requestIdSchema,
});

const getSourceOutputSchema = s.object("Deck.co source response.", {
  source: sourceSchema,
});

export const deckCoActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "test_api_key",
    description: "Verify that a Deck.co secret key can authenticate with the v2 API.",
    requiredScopes: [],
    inputSchema: testApiKeyInputSchema,
    outputSchema: testApiKeyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_agents",
    description: "List Deck.co agents with cursor pagination.",
    requiredScopes: [],
    inputSchema: paginatedInputSchema,
    outputSchema: listAgentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_agent",
    description: "Retrieve a Deck.co agent by ID, including its task summaries.",
    requiredScopes: [],
    inputSchema: getAgentInputSchema,
    outputSchema: getAgentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sources",
    description: "List Deck.co sources with cursor pagination.",
    requiredScopes: [],
    inputSchema: paginatedInputSchema,
    outputSchema: listSourcesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_source",
    description: "Retrieve a Deck.co source by ID.",
    requiredScopes: [],
    inputSchema: getSourceInputSchema,
    outputSchema: getSourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_source",
    description: "Create a Deck.co website source from a URL and optional display name.",
    requiredScopes: [],
    inputSchema: createSourceInputSchema,
    outputSchema: getSourceOutputSchema,
  }),
];
