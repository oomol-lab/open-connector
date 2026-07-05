import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "customgpt";

const orderSchema = s.stringEnum("Sort direction for CustomGPT list results.", ["asc", "desc"]);
const orderBySchema = s.stringEnum("CustomGPT field used to sort list results.", ["id", "created_at"]);
const projectIdSchema = s.positiveInteger("The unique CustomGPT agent identifier used in project path parameters.");
const sessionIdSchema = s.nonEmptyString("The CustomGPT conversation session ID.");
const sourceLabelSchema = s.string({
  description: "A CustomGPT source label ID or name.",
  minLength: 1,
  maxLength: 100,
});
const pageSchema = s.positiveInteger("Page number to retrieve. Page numbering starts at 1.");
const looseCustomgptObjectSchema = s.looseObject(
  "A CustomGPT object returned by the upstream API, preserving provider-defined fields.",
);

const paginationSchema = s.object("Normalized pagination metadata from CustomGPT list responses.", {
  currentPage: s.nullable(s.integer("The current response page number.")),
  lastPage: s.nullable(s.integer("The last available page number.")),
  perPage: s.nullable(s.integer("The number of items returned per page.")),
  total: s.nullable(s.integer("The total number of items reported by CustomGPT.")),
  nextPageUrl: s.nullable(s.string("The upstream URL for the next page when available.")),
  previousPageUrl: s.nullable(s.string("The upstream URL for the previous page when available.")),
});
const agentListOutputSchema = s.object("A page of CustomGPT agents.", {
  agents: s.array("CustomGPT agents returned for this page.", looseCustomgptObjectSchema),
  pagination: paginationSchema,
  raw: looseCustomgptObjectSchema,
});
const agentOutputSchema = s.object("CustomGPT agent details.", {
  agent: looseCustomgptObjectSchema,
  raw: looseCustomgptObjectSchema,
});
const conversationListOutputSchema = s.object("A page of CustomGPT conversations.", {
  conversations: s.array("CustomGPT conversations returned for this page.", looseCustomgptObjectSchema),
  pagination: paginationSchema,
  raw: looseCustomgptObjectSchema,
});
const conversationOutputSchema = s.object("A CustomGPT conversation creation result.", {
  conversation: looseCustomgptObjectSchema,
  sessionId: s.nullable(s.string("The session ID used for follow-up conversation messages.")),
  raw: looseCustomgptObjectSchema,
});
const sendMessageOutputSchema = s.object("A CustomGPT non-streaming message response.", {
  message: looseCustomgptObjectSchema,
  messageId: s.nullable(s.integer("The CustomGPT prompt history identifier.")),
  response: s.nullable(s.string("The agent response text when CustomGPT returned one.")),
  citations: s.unknown("Citation payload returned by CustomGPT for the message."),
  raw: looseCustomgptObjectSchema,
});
const messageListOutputSchema = s.object("A page of CustomGPT conversation messages.", {
  messages: s.array("CustomGPT messages returned for this page.", looseCustomgptObjectSchema),
  pagination: paginationSchema,
  raw: looseCustomgptObjectSchema,
});
const documentListOutputSchema = s.object("A page of indexed CustomGPT documents.", {
  project: s.nullable(s.looseObject("The CustomGPT agent object returned with the document page.")),
  documents: s.array("Indexed documents returned for this page.", looseCustomgptObjectSchema),
  pagination: paginationSchema,
  raw: looseCustomgptObjectSchema,
});

export type CustomgptActionName =
  | "list_agents"
  | "get_agent"
  | "list_conversations"
  | "create_conversation"
  | "send_message"
  | "list_messages"
  | "list_documents";

export const customgptActions: Array<ProviderActionDefinition<CustomgptActionName>> = [
  defineProviderAction(service, {
    name: "list_agents",
    description: "List CustomGPT agents in the authenticated account with optional pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing CustomGPT agents.",
      {
        page: pageSchema,
        duration: s.integer("The duration filter for agents when supported by CustomGPT."),
        order: orderSchema,
        orderBy: orderBySchema,
        width: s.nonEmptyString("Embed-code width to request from CustomGPT."),
        height: s.nonEmptyString("Embed-code height to request from CustomGPT."),
        name: s.nonEmptyString("Agent name filter."),
      },
      { optional: ["page", "duration", "order", "orderBy", "width", "height", "name"] },
    ),
    outputSchema: agentListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_agent",
    description: "Get details and current status for a CustomGPT agent.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving a CustomGPT agent.",
      {
        projectId: projectIdSchema,
        width: s.nonEmptyString("Embed-code width to request from CustomGPT."),
        height: s.nonEmptyString("Embed-code height to request from CustomGPT."),
      },
      { required: ["projectId"], optional: ["width", "height"] },
    ),
    outputSchema: agentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_conversations",
    description: "List conversations for a CustomGPT agent.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing CustomGPT conversations.",
      {
        projectId: projectIdSchema,
        page: pageSchema,
        order: orderSchema,
        orderBy: orderBySchema,
        userFilter: s.stringEnum("Conversation user-type filter.", ["all", "anonymous", "team_member", "me"]),
        name: s.nonEmptyString("Conversation name filter."),
        lastUpdatedAfter: s.dateTime("Return conversations updated after this timestamp."),
      },
      {
        required: ["projectId"],
        optional: ["page", "order", "orderBy", "userFilter", "name", "lastUpdatedAfter"],
      },
    ),
    outputSchema: conversationListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_conversation",
    description: "Create a CustomGPT conversation for an agent and return its session ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating a CustomGPT conversation.",
      {
        projectId: projectIdSchema,
        name: s.string({ description: "Optional conversation name.", minLength: 1, maxLength: 255 }),
      },
      { required: ["projectId"], optional: ["name"] },
    ),
    outputSchema: conversationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a non-streaming text prompt to a CustomGPT conversation and return the agent response.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for sending a CustomGPT conversation message.",
      {
        projectId: projectIdSchema,
        sessionId: sessionIdSchema,
        prompt: s.nonEmptyString("Prompt text to send to the CustomGPT agent."),
        lang: s.string({ description: "ISO 639-1 language code for the response language.", minLength: 2 }),
        externalId: s.string({ description: "External prompt history identifier.", minLength: 1, maxLength: 128 }),
        customPersona: s.nonEmptyString("Request-only persona override."),
        chatbotModel: s.nonEmptyString("CustomGPT chatbot model identifier."),
        responseSource: s.stringEnum("Knowledge source mode for the response.", [
          "default",
          "own_content",
          "openai_content",
        ]),
        customContext: s.nonEmptyString("Custom context supplied with this prompt."),
        agentCapability: s.stringEnum("CustomGPT agent capability preset.", [
          "fastest-responses",
          "optimal-choice",
          "advanced-reasoning",
          "complex-tasks",
        ]),
        labels: s.array("Source label IDs or names to search as one CustomGPT OR label group.", sourceLabelSchema, {
          minItems: 1,
          maxItems: 50,
        }),
        labelsExclusive: s.boolean("Whether CustomGPT should search only pages with provided labels."),
        actionOverrides: s.looseObject("Per-request action override object JSON-encoded into multipart form data."),
      },
      {
        required: ["projectId", "sessionId", "prompt"],
        optional: [
          "lang",
          "externalId",
          "customPersona",
          "chatbotModel",
          "responseSource",
          "customContext",
          "agentCapability",
          "labels",
          "labelsExclusive",
          "actionOverrides",
        ],
      },
    ),
    outputSchema: sendMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List messages in a CustomGPT conversation.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing CustomGPT conversation messages.",
      {
        projectId: projectIdSchema,
        sessionId: sessionIdSchema,
        page: pageSchema,
        order: orderSchema,
        includeInsights: s.boolean("Whether CustomGPT should include customer intelligence data."),
      },
      { required: ["projectId", "sessionId"], optional: ["page", "order", "includeInsights"] },
    ),
    outputSchema: messageListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_documents",
    description: "List indexed documents in a CustomGPT agent knowledge base.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing CustomGPT indexed documents.",
      {
        projectId: projectIdSchema,
        page: pageSchema,
        limit: s.positiveInteger("Maximum number of documents to return."),
        order: orderSchema,
        search: s.nonEmptyString("Case-insensitive search term for document URL or filename."),
        crawlStatus: s.stringEnum("Crawl status filter for documents.", [
          "all",
          "ok",
          "failed",
          "n/a",
          "queued",
          "limited",
        ]),
        indexStatus: s.stringEnum("Index status filter for documents.", [
          "all",
          "ok",
          "failed",
          "n/a",
          "queued",
          "limited",
        ]),
      },
      {
        required: ["projectId"],
        optional: ["page", "limit", "order", "search", "crawlStatus", "indexStatus"],
      },
    ),
    outputSchema: documentListOutputSchema,
  }),
];
