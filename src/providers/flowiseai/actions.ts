import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "flowiseai";

const nonEmptyString = (description: string) =>
  s.string(description, {
    minLength: 1,
    pattern: "\\S",
  });
const nullableString = (description: string) => s.nullable(s.string(description));
const flowiseMessageRoleSchema = s.stringEnum("The role of one prior chat message.", ["apiMessage", "userMessage"]);
const flowiseChatflowTypeSchema = s.stringEnum("The FlowiseAI flow type.", ["CHATFLOW", "MULTIAGENT"]);
const flowiseHistoryItemSchema = s.object("One prior message passed back to FlowiseAI.", {
  role: flowiseMessageRoleSchema,
  content: s.string("The content of the prior message."),
});
const flowiseHumanInputSchema = s.object(
  "Human feedback used to resume a stopped FlowiseAI execution.",
  {
    type: s.stringEnum("The human decision used to resume execution.", ["proceed", "reject"]),
    feedback: s.string("Optional feedback returned to the paused flow."),
  },
  { optional: ["feedback"] },
);
const flowiseSourceDocumentSchema = s.object("One source document returned by FlowiseAI.", {
  pageContent: s.string("The page content retrieved by FlowiseAI."),
  metadata: s.record(s.string("One metadata value."), {
    description: "The document metadata returned by FlowiseAI.",
  }),
});
const flowiseUsedToolSchema = s.object("One tool call returned by FlowiseAI.", {
  tool: s.string("The tool name that FlowiseAI used."),
  toolInput: s.unknownObject("The input object passed to the tool."),
  toolOutput: s.string("The output returned by the tool."),
});
const getChatflowOutputSchema = s.object("The normalized chatflow metadata returned by FlowiseAI.", {
  chatflow: s.object("The protected FlowiseAI chatflow tied to the API key.", {
    id: nonEmptyString("The FlowiseAI chatflow identifier."),
    name: s.string("The FlowiseAI chatflow name."),
    flowData: s.string("The serialized FlowiseAI flow definition."),
    deployed: s.boolean("Whether the chatflow is deployed."),
    isPublic: s.boolean("Whether the chatflow remains publicly accessible."),
    apiKeyId: nullableString("The FlowiseAI API key identifier assigned to the chatflow."),
    chatbotConfig: s.string("The serialized FlowiseAI chatbot configuration."),
    apiConfig: s.string("The serialized FlowiseAI API configuration."),
    analytic: s.string("The serialized FlowiseAI analytics configuration."),
    speechToText: s.string("The serialized FlowiseAI speech-to-text configuration."),
    category: nullableString("The optional FlowiseAI category string."),
    type: flowiseChatflowTypeSchema,
    createdDate: s.dateTime("The ISO timestamp when the chatflow was created."),
    updatedDate: s.dateTime("The ISO timestamp when the chatflow was last updated."),
  }),
});
const sendMessageBaseProperties: Record<string, JsonSchema> = {
  question: nonEmptyString("The user message to send to the FlowiseAI chatflow."),
  form: s.unknownObject("The form payload to send instead of question for Agentflow V2."),
  overrideConfig: s.unknownObject("FlowiseAI runtime overrideConfig values such as variables or session identifiers."),
  history: s.array("Previous conversation messages to pass back for context.", flowiseHistoryItemSchema),
  humanInput: flowiseHumanInputSchema,
};
const sendMessageInputSchema = {
  ...s.object(
    "Input parameters for sending a JSON-only prediction request to a FlowiseAI chatflow.",
    sendMessageBaseProperties,
    {
      optional: ["question", "form", "overrideConfig", "history", "humanInput"],
    },
  ),
  anyOf: [{ required: ["question"] }, { required: ["form"] }, { required: ["humanInput"] }],
};
const sendMessageOutputSchema = s.object("The normalized FlowiseAI prediction response.", {
  text: s.string("The AI-generated response text."),
  json: s.nullable(s.unknownObject("The optional structured JSON payload returned by FlowiseAI.")),
  question: nullableString("The original question echoed by FlowiseAI when it returns one."),
  chatId: nullableString("The FlowiseAI chat session identifier."),
  chatMessageId: nullableString("The FlowiseAI chat message identifier."),
  sessionId: nullableString("The FlowiseAI session identifier."),
  memoryType: nullableString("The FlowiseAI memory type used for this response."),
  sourceDocuments: s.nullable(s.array("The source documents returned by FlowiseAI.", flowiseSourceDocumentSchema)),
  usedTools: s.nullable(s.array("The tools invoked by FlowiseAI while producing the response.", flowiseUsedToolSchema)),
});

export const flowiseaiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_chatflow",
    description: "Fetch the FlowiseAI chatflow currently protected by the connected API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for this action.", {}),
    outputSchema: getChatflowOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a JSON-only prediction request to the FlowiseAI chatflow protected by the connected API key.",
    requiredScopes: [],
    inputSchema: sendMessageInputSchema,
    outputSchema: sendMessageOutputSchema,
  }),
];

export type FlowiseaiActionName = "get_chatflow" | "send_message";
