import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "botsonic";

const sortOrderValues = ["asc", "desc"];
const faqSortByValues = [
  "id",
  "bot_id",
  "question",
  "answer",
  "error_reason",
  "status",
  "characters",
  "migration_status",
  "created_at",
  "updated_at",
];
const conversationSortByValues = ["recent", "negative", "positive"];
const responseTypeValues = ["text", "html", "markdown", "mrkdwn"];

const looseSourceSchema = s.looseObject("One source object returned by Botsonic.");
const looseMetadataSchema = s.looseObject("Provider-specific metadata forwarded to Botsonic.");

const chatHistoryInputSchema = s.looseRequiredObject(
  "One previous chat history message sent to Botsonic.",
  {
    id: s.uuid("Optional message identifier for this chat history item."),
    message: s.string("The chat history message text.", { minLength: 1 }),
    sent: s.boolean("Whether this chat history item was sent by the end user."),
    sources: s.array("Sources attached to this chat history item.", looseSourceSchema),
    generated_images: s.array(
      "Generated image URLs attached to this chat history item.",
      s.string("One generated image URL or identifier."),
    ),
  },
  { optional: ["id", "sources", "generated_images"] },
);

const chatHistoryOutputSchema = s.looseRequiredObject(
  "One chat history message returned by Botsonic.",
  {
    id: s.uuid("Optional Botsonic message identifier."),
    message: s.string("The chat history message text."),
    sent: s.boolean("Whether this chat history item was sent by the end user."),
    sources: s.array("Sources attached to this history item.", looseSourceSchema),
    generated_images: s.array(
      "Generated image URLs attached to this history item.",
      s.string("One generated image URL or identifier."),
    ),
  },
  { optional: ["id", "sources", "generated_images"] },
);

const chatDataSchema = s.looseRequiredObject(
  "One message object inside a Botsonic conversation.",
  {
    id: s.uuid("Optional Botsonic chat data identifier."),
    message: s.string("The message text returned for this chat data entry."),
    messages: s.array(
      "Nested message fragments returned by Botsonic.",
      s.looseObject("One nested conversation message fragment."),
    ),
    sent: s.boolean("Whether this message was sent by the end user."),
    transcripted: s.boolean("Whether this message has been transcripted by Botsonic."),
    is_delivered: s.boolean("Whether Botsonic reports the message was delivered."),
    failed_reason: s.string("Failure reason returned by Botsonic for this message."),
    failed_data: s.looseObject("Failure details returned by Botsonic for this message."),
    req_body: s.looseObject("Request body details stored by Botsonic for this message."),
    run_id: s.uuid("Run identifier attached to this Botsonic message."),
    sources: s.array("Sources attached to this message.", looseSourceSchema),
    like_status: s.string("Feedback status returned by Botsonic for this message."),
    resolution_status: s.string("Resolution status returned by Botsonic for this message."),
    is_via_live_agent: s.boolean("Whether this message was sent through a live agent."),
    created_at: s.dateTime("The message creation timestamp returned by Botsonic."),
  },
  {
    optional: [
      "id",
      "messages",
      "sent",
      "transcripted",
      "is_delivered",
      "failed_reason",
      "failed_data",
      "req_body",
      "run_id",
      "sources",
      "like_status",
      "resolution_status",
      "is_via_live_agent",
      "created_at",
    ],
  },
);

const conversationSchema = s.looseRequiredObject(
  "One Botsonic conversation returned by the API.",
  {
    _id: s.string("Optional internal Botsonic conversation document identifier."),
    chat_id: s.uuid("The Botsonic conversation chat identifier."),
    bot_id: s.uuid("The Botsonic bot identifier attached to the conversation."),
    owner_id: s.string("The Botsonic owner identifier for the conversation."),
    ip_address: s.string("The IP address associated with the conversation."),
    num_messages: s.integer("The number of messages in the conversation."),
    source: s.string("The conversation source returned by Botsonic."),
    is_resolved: s.boolean("Whether Botsonic reports the conversation as resolved."),
    oai_thread_id: s.string("The OpenAI thread identifier attached to the conversation."),
    additional_feedback: s.string("Additional feedback stored for this conversation."),
    chat_ended: s.boolean("Whether the conversation has ended."),
    chat_data: s.array("Messages and events stored in this conversation.", chatDataSchema),
    created_at: s.dateTime("The conversation creation timestamp returned by Botsonic."),
    updated_at: s.dateTime("The conversation last update timestamp returned by Botsonic."),
  },
  {
    optional: ["_id", "ip_address", "source", "is_resolved", "oai_thread_id", "additional_feedback", "chat_ended"],
  },
);

const faqSchema = s.looseRequiredObject(
  "One Botsonic FAQ returned by the API.",
  {
    id: s.uuid("The Botsonic FAQ identifier."),
    bot_id: s.uuid("The Botsonic bot identifier attached to the FAQ."),
    question: s.string("The FAQ question text."),
    answer: s.string("The FAQ answer text."),
    error_reason: s.string("The error reason returned by Botsonic for failed FAQ processing."),
    status: s.string("The Botsonic processing status for the FAQ."),
    characters: s.integer("The number of FAQ characters counted by Botsonic."),
    migration_status: s.string("The migration status returned by Botsonic for the FAQ."),
    created_at: s.dateTime("The FAQ creation timestamp returned by Botsonic."),
    updated_at: s.dateTime("The FAQ last update timestamp returned by Botsonic."),
  },
  { optional: ["error_reason", "migration_status"] },
);

const pageInfoSchema = {
  total: s.nonNegativeInteger("The total number of matching records returned by Botsonic."),
  page: s.positiveInteger("The current page number returned by Botsonic."),
  size: s.positiveInteger("The current page size returned by Botsonic."),
  pages: s.nonNegativeInteger("The total number of pages returned by Botsonic."),
};

const generateResponseInputSchema = s.object(
  "The input payload for generating one synchronous Botsonic response.",
  {
    input_text: s.string("User question for the bot.", { minLength: 1 }),
    chat_id: s.uuid("The Botsonic chat identifier for this conversation."),
    source: s.string("Optional source value for Botsonic to refer to.", { minLength: 1 }),
    starter_question_id: s.uuid("Optional Botsonic starter question identifier."),
    user_unique_identifier: s.string("Optional unique user identifier stored by Botsonic in the inbox.", {
      minLength: 1,
    }),
    chat_history: s.array("Previous chat history for Botsonic to use as context.", chatHistoryInputSchema),
    response_type: s.stringEnum("The response format Botsonic should return.", responseTypeValues),
    chat_user_id: s.string("Existing Botsonic chat user identifier to link with old user data.", { minLength: 1 }),
    extra_metadata: looseMetadataSchema,
    full_history: s.boolean("Whether Botsonic should return full chat history so far."),
    message_id: s.uuid("Existing message identifier used by Botsonic to resolve handoff."),
    timeout: s.number("Maximum number of seconds Botsonic should keep the connection open before timing out.", {
      exclusiveMinimum: 0,
    }),
  },
  {
    optional: [
      "source",
      "starter_question_id",
      "user_unique_identifier",
      "chat_history",
      "response_type",
      "chat_user_id",
      "extra_metadata",
      "full_history",
      "message_id",
      "timeout",
    ],
  },
);

const generateResponseOutputSchema = s.looseRequiredObject(
  "The synchronous Botsonic generation response.",
  {
    answer: s.string("The generated answer returned by Botsonic."),
    message_id: s.uuid("The Botsonic message identifier for the generated answer."),
    sources: s.array("Sources returned by Botsonic for the answer.", looseSourceSchema),
    chat_history: s.array("Chat history returned by Botsonic.", chatHistoryOutputSchema),
    generated_images: s.array(
      "Generated image URLs returned by Botsonic.",
      s.string("One generated image URL or identifier."),
    ),
    follow_up_questions: s.array("Follow-up questions suggested by Botsonic.", s.string("One follow-up question.")),
    human_handoff_status: s.boolean("Whether Botsonic reports a human handoff status."),
    user_options: s.array("User options returned by Botsonic.", s.unknown("One user option.")),
    chat_ended: s.boolean("Whether Botsonic reports the chat has ended."),
    end_chat_feedback: s.string("End-chat feedback returned by Botsonic."),
  },
  {
    optional: [
      "message_id",
      "sources",
      "chat_history",
      "generated_images",
      "follow_up_questions",
      "human_handoff_status",
      "user_options",
      "chat_ended",
      "end_chat_feedback",
    ],
  },
);

const listFaqsInputSchema = s.object(
  "The input payload for listing Botsonic FAQs.",
  {
    search_query: s.string("Search query used to match Botsonic FAQs.", { minLength: 1 }),
    sort_by: s.stringEnum("The FAQ attribute to sort by.", faqSortByValues),
    sort_order: s.stringEnum("The FAQ sorting order.", sortOrderValues),
    page: s.positiveInteger("The page number to request from Botsonic."),
    size: s.positiveInteger("The number of FAQs to request from Botsonic.", { maximum: 100 }),
  },
  { optional: ["search_query", "sort_by", "sort_order", "page", "size"] },
);

const listConversationsInputSchema = s.object(
  "The input payload for listing Botsonic conversations.",
  {
    search_query: s.string("Search query used to match Botsonic conversations.", { minLength: 1 }),
    sort_by: s.stringEnum("The conversation sorting mode.", conversationSortByValues),
    sort_order: s.stringEnum("The conversation sorting order.", sortOrderValues),
    updated_after: s.dateTime("Filter conversations updated after this ISO 8601 timestamp."),
    updated_before: s.dateTime("Filter conversations updated before this ISO 8601 timestamp."),
    page: s.positiveInteger("The page number to request from Botsonic."),
    size: s.positiveInteger("The number of conversations to request from Botsonic.", { maximum: 100 }),
  },
  {
    optional: ["search_query", "sort_by", "sort_order", "updated_after", "updated_before", "page", "size"],
  },
);

export const botsonicActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "generate_response",
    operationType: "write",
    description: "Generate one synchronous response from the connected Botsonic bot.",
    inputSchema: generateResponseInputSchema,
    outputSchema: generateResponseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_faqs",
    operationType: "read",
    description: "List FAQs attached to the connected Botsonic bot token.",
    inputSchema: listFaqsInputSchema,
    outputSchema: s.looseRequiredObject(
      "The paginated Botsonic FAQ list response.",
      {
        items: s.array("The FAQs returned by Botsonic.", faqSchema),
        ...pageInfoSchema,
      },
      { optional: ["total", "page", "size", "pages"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_conversations",
    operationType: "read",
    description: "List conversations for the connected Botsonic bot token.",
    inputSchema: listConversationsInputSchema,
    outputSchema: s.looseRequiredObject(
      "The paginated Botsonic conversation list response.",
      {
        items: s.array("The conversations returned by Botsonic.", conversationSchema),
        ...pageInfoSchema,
      },
      { optional: ["total", "page", "size", "pages"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    operationType: "read",
    description: "Get one Botsonic conversation by chat identifier.",
    inputSchema: s.object("The input payload for fetching one Botsonic conversation.", {
      chat_id: s.uuid("The Botsonic conversation chat identifier."),
    }),
    outputSchema: conversationSchema,
  }),
];
