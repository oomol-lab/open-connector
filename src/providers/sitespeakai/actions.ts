import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sitespeakai";

const chatbotIdSchema = s.nonEmptyString("The ID of your chatbot.");
const finetuneIdSchema = s.nonEmptyString("The ID of the updated answer to delete.");
const rawObjectSchema = s.looseObject("A provider object returned by SiteSpeakAI.");
const emptyObjectInputSchema = s.object("This action does not require any input fields.", {});

export const sitespeakaiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the connected SiteSpeakAI user account details.",
    inputSchema: emptyObjectInputSchema,
    outputSchema: s.object("The connected SiteSpeakAI account details.", {
      user: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_chatbots",
    description: "List every SiteSpeakAI chatbot available to the connected account.",
    inputSchema: emptyObjectInputSchema,
    outputSchema: s.object("The SiteSpeakAI chatbots available to the account.", {
      chatbots: s.array("The chatbots returned by SiteSpeakAI.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_chatbot",
    description: "Retrieve the full SiteSpeakAI settings object for one chatbot.",
    inputSchema: s.object("The chatbot to retrieve from SiteSpeakAI.", {
      chatbot_id: chatbotIdSchema,
    }),
    outputSchema: s.object("The requested SiteSpeakAI chatbot settings.", {
      chatbot: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_sources",
    description: "List the training sources and training statuses for one SiteSpeakAI chatbot.",
    inputSchema: s.object("The chatbot whose training sources should be returned.", {
      chatbot_id: chatbotIdSchema,
    }),
    outputSchema: s.object("The training sources returned by SiteSpeakAI.", {
      sources: s.array("The sources attached to the chatbot.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_suggested_messages",
    description: "List the suggested visitor prompts configured for one SiteSpeakAI chatbot.",
    inputSchema: s.object("The chatbot whose suggested messages should be returned.", {
      chatbot_id: chatbotIdSchema,
    }),
    outputSchema: s.object("The suggested messages returned by SiteSpeakAI.", {
      prompts: s.array("The suggested messages for the chatbot.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_conversations",
    description: "Retrieve conversation history for one SiteSpeakAI chatbot.",
    inputSchema: s.object(
      "The chatbot and optional filters for retrieving conversation history.",
      {
        chatbot_id: chatbotIdSchema,
        conversation_id: s.nonEmptyString("Return only entries for this visitor conversation ID."),
        include_deleted: s.boolean("Whether cleared conversation entries should be included."),
        include_sources: s.boolean("Whether SiteSpeakAI should include source records for each conversation entry."),
        limit: s.integer("The maximum number of conversation entries to return.", { minimum: 1 }),
        order: s.stringEnum("The sort order for the returned conversation history.", ["asc", "desc"]),
      },
      {
        required: ["chatbot_id"],
        optional: ["conversation_id", "include_deleted", "include_sources", "limit", "order"],
      },
    ),
    outputSchema: s.object("The conversation history returned by SiteSpeakAI.", {
      conversations: s.array("The conversation entries returned by SiteSpeakAI.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_leads",
    description: "List the leads captured by one SiteSpeakAI chatbot.",
    inputSchema: s.object("The chatbot whose captured leads should be returned.", {
      chatbot_id: chatbotIdSchema,
    }),
    outputSchema: s.object("The leads captured by the chatbot.", {
      leads: s.array("The lead records returned by SiteSpeakAI.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "query_chatbot",
    description: "Send a question to one SiteSpeakAI chatbot and return its answer plus source URLs.",
    inputSchema: s.object(
      "The chatbot and message payload to send to SiteSpeakAI.",
      {
        chatbot_id: chatbotIdSchema,
        prompt: s.nonEmptyString("The question or prompt to send to the chatbot."),
        conversation_id: s.nonEmptyString(
          "An optional identifier used to group messages into one chatbot conversation.",
        ),
        format: s.stringEnum("The response format returned by SiteSpeakAI.", ["html", "markdown"]),
      },
      { required: ["chatbot_id", "prompt"], optional: ["conversation_id", "format"] },
    ),
    outputSchema: s.looseObject(
      "The SiteSpeakAI chatbot response.",
      {
        text: s.string("The answer text returned by the chatbot."),
        urls: s.array("The source URLs used by the chatbot to answer the query.", s.string("A source URL.")),
      },
      { description: "The SiteSpeakAI chatbot response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_updated_answers",
    description: "List updated answers configured for one SiteSpeakAI chatbot.",
    inputSchema: s.object("The chatbot whose updated answers should be returned.", {
      chatbot_id: chatbotIdSchema,
    }),
    outputSchema: s.object("The updated answers returned by SiteSpeakAI.", {
      finetunes: s.array("The updated answers for the chatbot.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_updated_answer",
    description: "Create or update a SiteSpeakAI custom answer for a chatbot.",
    inputSchema: s.object("The custom answer to create or update.", {
      chatbot_id: chatbotIdSchema,
      question: s.nonEmptyString("The question associated with the updated answer."),
      suggested_answer: s.nonEmptyString("The custom answer SiteSpeakAI should return."),
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "delete_updated_answer",
    description: "Delete one SiteSpeakAI updated answer from a chatbot.",
    inputSchema: s.object("The updated answer to delete.", {
      chatbot_id: chatbotIdSchema,
      finetune_id: finetuneIdSchema,
    }),
    outputSchema: rawObjectSchema,
  }),
];
