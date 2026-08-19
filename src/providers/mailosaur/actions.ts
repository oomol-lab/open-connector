import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailosaur" as const;

const serverId = s.nonEmptyString("The identifier of the Mailosaur server.");
const messageId = s.nonEmptyString("The identifier of the Mailosaur message.");
const messageDirection = s.stringEnum("The message direction to return.", ["Received", "Sent"]);
const matchMode = s.stringEnum("How Mailosaur should combine search criteria.", ["ALL", "ANY"]);
const raw = s.looseObject("The raw object returned by Mailosaur.");

const contactSchema = s.looseObject("A Mailosaur message contact.", {
  name: s.nullableString("The contact display name when Mailosaur returns one."),
  email: s.string("The contact email address or phone number."),
});
const linkSchema = s.looseObject("A link extracted from a Mailosaur message body.", {
  href: s.string("The link URL."),
  text: s.nullableString("The link text when Mailosaur returns one."),
});
const messageBodySchema = s.looseObject("A parsed Mailosaur message body section.", {
  body: s.nullableString("The message body content."),
  links: s.array("Links extracted from this body section.", linkSchema),
});
const attachmentSchema = s.looseObject("A Mailosaur message attachment.", {
  id: s.string("The attachment identifier."),
  fileName: s.nullableString("The attachment file name."),
  contentType: s.nullableString("The attachment content type."),
  length: s.nullableNumber("The attachment size in bytes when returned."),
});
const messageSummarySchema = s.looseObject("A Mailosaur message summary.", {
  id: s.string("The unique message identifier."),
  received: s.nullableString("The timestamp when Mailosaur received the message."),
  type: s.nullableString("The Mailosaur message type."),
  subject: s.nullableString("The message subject line."),
  from: s.array("The message senders.", contactSchema),
  to: s.array("The message recipients.", contactSchema),
  cc: s.array("The message CC recipients.", contactSchema),
  bcc: s.array("The message BCC recipients.", contactSchema),
  raw,
});
const messageSchema = s.looseObject("A Mailosaur message with parsed body content.", {
  id: s.string("The unique message identifier."),
  received: s.nullableString("The timestamp when Mailosaur received the message."),
  type: s.nullableString("The Mailosaur message type."),
  subject: s.nullableString("The message subject line."),
  from: s.array("The message senders.", contactSchema),
  to: s.array("The message recipients.", contactSchema),
  cc: s.array("The message CC recipients.", contactSchema),
  bcc: s.array("The message BCC recipients.", contactSchema),
  html: s.nullable(messageBodySchema),
  text: s.nullable(messageBodySchema),
  attachments: s.array("The message attachments.", attachmentSchema),
  server: s.nullableString("The server identifier that stores the message."),
  raw,
});
const serverSchema = s.looseObject("A Mailosaur server.", {
  id: s.string("The unique server identifier."),
  name: s.string("The server display name."),
  users: s.array("Users with access to the server.", raw),
  messages: s.nonNegativeInteger("The number of messages currently stored in the server."),
  raw,
});
const usageLimitSchema = s.looseObject("A Mailosaur usage limit entry.", {
  current: s.nonNegativeInteger("The current usage count."),
  limit: s.nonNegativeInteger("The account limit."),
});
const usageTransactionSchema = s.looseObject("A Mailosaur usage transaction.", {
  timestamp: s.string("The transaction timestamp."),
  email: s.nonNegativeInteger("The email usage count for this transaction."),
  sms: s.nonNegativeInteger("The SMS usage count for this transaction."),
  previews: s.nonNegativeInteger("The preview usage count for this transaction."),
});

const paginationInputFields = {
  receivedAfter: s.dateTime("Only return messages received after this timestamp."),
  page: s.positiveInteger("The page number used with itemsPerPage."),
  itemsPerPage: s.positiveInteger("The number of results per page, from 1 to 1000.", { maximum: 1000 }),
  dir: messageDirection,
};
const optionalPaginationFields = ["receivedAfter", "page", "itemsPerPage", "dir"] as const;
const messageListOutputSchema = s.object("The response returned for Mailosaur message lists.", {
  messages: s.array("The messages returned by Mailosaur.", messageSummarySchema),
});

export const mailosaurActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_servers",
    description: "List Mailosaur inbox servers in the current account.",
    inputSchema: s.object("The input payload for listing Mailosaur servers.", {}),
    outputSchema: s.object("The response returned when listing Mailosaur servers.", {
      servers: s.array("The servers returned by Mailosaur.", serverSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_server",
    description: "Retrieve one Mailosaur inbox server by ID.",
    inputSchema: s.object("The input payload for retrieving a Mailosaur server.", {
      id: serverId,
    }),
    outputSchema: s.object("The response returned when retrieving a Mailosaur server.", {
      server: serverSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_server",
    description: "Create a new Mailosaur inbox server.",
    inputSchema: s.object("The input payload for creating a Mailosaur server.", {
      name: s.nonEmptyString("The name of the server."),
    }),
    outputSchema: s.object("The response returned when creating a Mailosaur server.", {
      server: serverSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_server",
    description: "Update the name of one Mailosaur inbox server.",
    inputSchema: s.object("The input payload for updating a Mailosaur server.", {
      id: serverId,
      name: s.nonEmptyString("The updated server name."),
    }),
    outputSchema: s.object("The response returned when updating a Mailosaur server.", {
      server: serverSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_server",
    description: "Delete one Mailosaur inbox server and its stored messages.",
    inputSchema: s.object("The input payload for deleting a Mailosaur server.", {
      id: serverId,
    }),
    outputSchema: s.object("The response returned when deleting a Mailosaur server.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      id: serverId,
    }),
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List Mailosaur message summaries from one server.",
    inputSchema: s.object(
      "The input payload for listing Mailosaur messages.",
      {
        server: serverId,
        ...paginationInputFields,
      },
      { optional: optionalPaginationFields },
    ),
    outputSchema: messageListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_messages",
    description: "Search Mailosaur message summaries in one server.",
    inputSchema: s.object(
      "The input payload for searching Mailosaur messages.",
      {
        server: serverId,
        ...paginationInputFields,
        sentFrom: s.nonEmptyString("The full email address or phone number the message was sent from."),
        sentTo: s.nonEmptyString("The full email address or phone number the message was sent to."),
        subject: s.nonEmptyString("Text to match against the message subject."),
        body: s.nonEmptyString("Text to match against the HTML or text body."),
        match: matchMode,
      },
      {
        optional: [...optionalPaginationFields, "sentFrom", "sentTo", "subject", "body", "match"],
      },
    ),
    outputSchema: messageListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Retrieve one Mailosaur message by ID, including parsed body content.",
    inputSchema: s.object("The input payload for retrieving a Mailosaur message.", {
      id: messageId,
    }),
    outputSchema: s.object("The response returned when retrieving a Mailosaur message.", {
      message: messageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_message",
    description: "Delete one Mailosaur message and its attachments.",
    inputSchema: s.object("The input payload for deleting a Mailosaur message.", {
      id: messageId,
    }),
    outputSchema: s.object("The response returned when deleting a Mailosaur message.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      id: messageId,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_all_messages",
    description: "Delete all Mailosaur messages stored in one server.",
    inputSchema: s.object("The input payload for deleting all messages in a Mailosaur server.", {
      server: serverId,
    }),
    outputSchema: s.object("The response returned when deleting all Mailosaur messages.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      server: serverId,
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage_limits",
    description: "Retrieve Mailosaur account usage limits.",
    inputSchema: s.object("The input payload for retrieving Mailosaur usage limits.", {}),
    outputSchema: s.object("The response returned when retrieving Mailosaur usage limits.", {
      limits: s.looseObject("The account usage limits returned by Mailosaur.", {
        servers: usageLimitSchema,
        users: usageLimitSchema,
        email: usageLimitSchema,
        sms: usageLimitSchema,
        previews: usageLimitSchema,
        numbers: usageLimitSchema,
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_usage_transactions",
    description: "List the last 31 days of Mailosaur usage transactions.",
    inputSchema: s.object("The input payload for listing Mailosaur usage transactions.", {}),
    outputSchema: s.object("The response returned when listing Mailosaur usage transactions.", {
      transactions: s.array("The usage transactions returned by Mailosaur.", usageTransactionSchema),
    }),
  }),
];
