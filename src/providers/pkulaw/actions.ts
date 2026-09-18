import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pkulaw";

export const pkulawMcpServerIds = [
  "law-aggregate",
  "law-keyword",
  "law-semantic",
  "case-keyword",
  "case-semantic",
  "case-number",
  "law-recognition",
  "fatiao",
  "doc-link",
  "citation-validator",
] as const;

export type PkulawMcpServerId = (typeof pkulawMcpServerIds)[number];

const serverIdSchema = s.stringEnum("The PKULaw MCP service to inspect or call.", pkulawMcpServerIds);
const toolAnnotationsSchema = s.looseObject("MCP hints supplied by PKULaw about a tool's behavior.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(s.boolean("Whether repeated calls are expected to be idempotent.")),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside PKULaw.")),
});
const toolSchema = s.object(
  "A tool currently exposed by one PKULaw MCP service.",
  {
    name: s.nonEmptyString("The exact PKULaw MCP tool name to pass to call_tool."),
    description: s.optional(s.string("The current tool description supplied by PKULaw MCP.")),
    annotations: s.optional(toolAnnotationsSchema),
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by PKULaw MCP."),
  },
  { optional: ["description", "annotations"] },
);
const resultRecordSchema = s.looseObject("A result record returned by PKULaw.");
const optionalSearchFields = {
  title: s.optional(s.nonEmptyString("A keyword to match against document titles.")),
  fulltext: s.optional(s.nonEmptyString("A keyword or phrase to match against document text.")),
};

export const pkulawActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description: "Discover the current legal research tools and live input schemas exposed by one PKULaw MCP service.",
    requiredScopes: [],
    followUpActions: ["pkulaw.call_tool"],
    inputSchema: s.object("Input for discovering one PKULaw MCP service.", { serverId: serverIdSchema }),
    outputSchema: s.object("The current PKULaw MCP tool catalog for one service.", {
      serverId: serverIdSchema,
      displayName: s.string("The official display name of the selected PKULaw MCP service."),
      tools: s.array("Tools currently exposed by the selected PKULaw service.", toolSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "read",
    description: "Call a current PKULaw legal data tool with JSON arguments after checking its live schema.",
    requiredScopes: [],
    followUpActions: ["pkulaw.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current PKULaw MCP tool.",
      {
        serverId: serverIdSchema,
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.optional(s.looseObject("JSON arguments matching the selected tool's inputSchema.")),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the PKULaw MCP tool.", {
      result: s.unknown("The structured tool result, or its MCP content envelope."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_law_articles",
    operationType: "read",
    description: "Search authoritative PKULaw provisions using a natural-language legal question or fact pattern.",
    requiredScopes: [],
    followUpActions: ["pkulaw.get_law_article"],
    inputSchema: s.object("Input for semantically searching legal provisions.", {
      query: s.nonEmptyString("A natural-language legal question or fact pattern in Chinese."),
    }),
    outputSchema: s.object("Legal provisions matching the query.", {
      articles: s.array("Matching legal provision records, ordered by relevance.", resultRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_law_article",
    operationType: "read",
    description: "Retrieve the authoritative text of a specific provision by law title and article number.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving one specific legal provision.", {
      title: s.nonEmptyString("The Chinese title of the law or regulation."),
      number: s.nonEmptyString("The article number written in Chinese, such as 第一千零七十七条."),
    }),
    outputSchema: s.object("The requested authoritative legal provision.", { article: resultRecordSchema }),
  }),
  defineProviderAction(service, {
    name: "search_laws",
    operationType: "read",
    description: "Search PKULaw laws and regulations by title or full-text keywords.",
    requiredScopes: [],
    followUpActions: ["pkulaw.get_law_article"],
    inputSchema: s.object("Input for searching laws and regulations by keyword.", optionalSearchFields),
    outputSchema: s.object("Laws and regulations matching the supplied keywords.", {
      laws: s.array("Matching law and regulation records.", resultRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_cases",
    operationType: "read",
    description: "Search authoritative PKULaw judicial cases using a natural-language fact pattern.",
    requiredScopes: [],
    followUpActions: ["pkulaw.search_case_documents"],
    inputSchema: s.object("Input for semantically searching judicial cases.", {
      text: s.nonEmptyString("A natural-language fact pattern or legal issue in Chinese."),
    }),
    outputSchema: s.object("Judicial cases matching the fact pattern.", {
      cases: s.array("Matching judicial case records, ordered by relevance.", resultRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_case_documents",
    operationType: "read",
    description: "Search detailed PKULaw judicial case records by title or full-text keywords.",
    requiredScopes: [],
    inputSchema: s.object("Input for searching detailed judicial case records.", optionalSearchFields),
    outputSchema: s.object("Detailed judicial case records matching the supplied keywords.", {
      cases: s.array("Matching detailed judicial case records.", resultRecordSchema),
    }),
  }),
];
