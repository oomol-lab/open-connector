import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "httpsms";

const skipSchema = s.nonNegativeInteger("The number of records to skip.");
const twentyItemLimitSchema = s.integer("The maximum number of records to return.", {
  minimum: 1,
  maximum: 20,
});
const hundredItemLimitSchema = s.integer("The maximum number of records to return.", {
  minimum: 1,
  maximum: 100,
});
const querySchema = s.string("A text query used to filter returned records.");
const emptyInputSchema = s.actionInput({}, [], "No input is required for this action.");

const userSchema = s.looseObject("The current httpSMS user without the upstream api_key field.", {
  id: s.string("The httpSMS user ID."),
  email: s.email("The user's email address."),
  timezone: s.string("The user's configured timezone."),
  subscription_name: s.string("The user's subscription name."),
  subscription_status: s.string("The user's subscription status."),
});

const usageSchema = s.looseObject("An httpSMS billing usage record.", {
  id: s.string("The billing usage record ID."),
  sent_messages: s.integer("The number of sent messages in the usage period."),
  received_messages: s.integer("The number of received messages in the usage period."),
  total_cost: s.integer("The total cost reported by httpSMS for the usage period."),
  start_timestamp: s.string("The usage period start timestamp."),
  end_timestamp: s.string("The usage period end timestamp."),
});

const phoneSchema = s.looseObject("An httpSMS phone registered to the account.", {
  id: s.string("The phone record ID."),
  phone_number: s.string("The registered phone number."),
  sim: s.string("The SIM slot used by this phone configuration."),
  messages_per_minute: s.integer("The configured SMS send rate for this phone."),
  max_send_attempts: s.integer("The maximum send attempts configured for this phone."),
});

const messageSchema = s.looseObject("An httpSMS message.", {
  id: s.string("The message ID."),
  owner: s.string("The owner phone number."),
  contact: s.string("The contact phone number."),
  content: s.string("The message content."),
  status: s.string("The current message status."),
  type: s.string("The message direction type."),
  request_id: s.nullableString("The client request ID when present."),
});

const messageThreadSchema = s.looseObject("An httpSMS message thread.", {
  id: s.string("The message thread ID."),
  owner: s.string("The owner phone number."),
  contact: s.string("The contact phone number."),
  last_message_id: s.string("The last message ID in the thread."),
  last_message_content: s.string("The last message content in the thread."),
  status: s.string("The current thread status."),
  is_archived: s.boolean("Whether the thread is archived."),
});

const responseStatusSchema = s.string("The status value returned by httpSMS.");
const responseMessageSchema = s.string("The response message returned by httpSMS.");

const currentUserOutputSchema = s.actionOutput(
  {
    status: responseStatusSchema,
    responseMessage: responseMessageSchema,
    user: userSchema,
  },
  "The normalized current httpSMS user response.",
);

const billingUsageOutputSchema = s.actionOutput(
  {
    status: responseStatusSchema,
    responseMessage: responseMessageSchema,
    usage: usageSchema,
  },
  "The normalized httpSMS billing usage response.",
);

const billingUsageHistoryOutputSchema = s.actionOutput(
  {
    status: responseStatusSchema,
    responseMessage: responseMessageSchema,
    usages: s.array("The billing usage records returned for this page.", usageSchema),
  },
  "The normalized httpSMS billing usage history response.",
);

const phonesOutputSchema = s.actionOutput(
  {
    status: responseStatusSchema,
    responseMessage: responseMessageSchema,
    phones: s.array("The phones returned for this page.", phoneSchema),
  },
  "The normalized httpSMS phone list response.",
);

const messageOutputSchema = s.actionOutput(
  {
    status: responseStatusSchema,
    responseMessage: responseMessageSchema,
    message: messageSchema,
  },
  "The normalized httpSMS message response.",
);

const messagesOutputSchema = s.actionOutput(
  {
    status: responseStatusSchema,
    responseMessage: responseMessageSchema,
    messages: s.array("The messages returned for this page.", messageSchema),
  },
  "The normalized httpSMS message list response.",
);

const deleteMessageOutputSchema = s.actionOutput(
  {
    deleted: s.boolean("Whether the message delete request completed successfully."),
    status: responseStatusSchema,
    responseMessage: responseMessageSchema,
  },
  "The normalized httpSMS message deletion response.",
);

const messageThreadsOutputSchema = s.actionOutput(
  {
    status: responseStatusSchema,
    responseMessage: responseMessageSchema,
    threads: s.array("The message threads returned for this page.", messageThreadSchema),
  },
  "The normalized httpSMS message thread list response.",
);

const listInputSchema = s.actionInput(
  {
    skip: skipSchema,
    limit: twentyItemLimitSchema,
    query: querySchema,
  },
  [],
  "Pagination and filtering parameters for a list action.",
);

export const httpsmsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Fetch the current httpSMS user for the connected API key.",
    inputSchema: emptyInputSchema,
    outputSchema: currentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_billing_usage",
    operationType: "read",
    description: "Fetch the current month httpSMS sent and received message usage summary.",
    inputSchema: emptyInputSchema,
    outputSchema: billingUsageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_billing_usage_history",
    operationType: "read",
    description: "List past httpSMS billing usage records for sent and received messages.",
    inputSchema: s.actionInput(
      {
        skip: skipSchema,
        limit: hundredItemLimitSchema,
      },
      [],
      "Pagination parameters for listing httpSMS billing usage history.",
    ),
    outputSchema: billingUsageHistoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_phones",
    operationType: "read",
    description: "List phones registered to the current httpSMS account.",
    inputSchema: listInputSchema,
    outputSchema: phonesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_message",
    operationType: "write",
    description: "Send one SMS or MMS message through a registered httpSMS Android phone.",
    inputSchema: s.actionInput(
      {
        from: s.nonEmptyString("The registered owner phone number to send from."),
        to: s.nonEmptyString("The recipient phone number."),
        content: s.nonEmptyString("The SMS message content."),
        attachments: s.array(
          "Optional MMS attachment URLs. When provided, httpSMS sends the message as MMS.",
          s.url("One publicly accessible attachment URL."),
          {
            minItems: 1,
          },
        ),
        encrypted: s.boolean("Whether the message content is end-to-end encrypted by the httpSMS mobile app."),
        requestId: s.nonEmptyString("An optional client request ID used to track this send."),
        sendAt: s.dateTime("An optional future send time in the user's profile timezone, up to 20 days ahead."),
      },
      ["from", "to", "content"],
      "Input parameters for sending one httpSMS message.",
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_messages",
    operationType: "read",
    description: "List messages sent between one owner phone number and one contact phone number.",
    inputSchema: s.actionInput(
      {
        owner: s.nonEmptyString("The registered owner phone number."),
        contact: s.nonEmptyString("The contact phone number."),
        skip: skipSchema,
        limit: twentyItemLimitSchema,
        query: querySchema,
      },
      ["owner", "contact"],
      "Input parameters for listing messages between two phone numbers.",
    ),
    outputSchema: messagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_message",
    operationType: "read",
    description: "Fetch one httpSMS message by ID.",
    inputSchema: s.actionInput(
      { messageId: s.nonEmptyString("The message ID to fetch.") },
      ["messageId"],
      "Input parameters for fetching one httpSMS message.",
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_message",
    operationType: "destructive",
    description: "Delete one httpSMS message by ID.",
    inputSchema: s.actionInput(
      { messageId: s.nonEmptyString("The message ID to delete.") },
      ["messageId"],
      "Input parameters for deleting one httpSMS message.",
    ),
    outputSchema: deleteMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_message_threads",
    operationType: "read",
    description: "List message threads for one registered owner phone number.",
    inputSchema: s.actionInput(
      {
        owner: s.nonEmptyString("The registered owner phone number."),
        skip: skipSchema,
        limit: twentyItemLimitSchema,
        query: querySchema,
      },
      ["owner"],
      "Input parameters for listing httpSMS message threads.",
    ),
    outputSchema: messageThreadsOutputSchema,
  }),
];
