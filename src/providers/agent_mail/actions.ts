import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "agent_mail" as const;

type AgentMailOperationMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface AgentMailOperationDefinition {
  method: AgentMailOperationMethod;
  path: string;
  pathParams?: readonly string[];
  queryParams?: readonly string[];
  bodyFields?: readonly string[];
  deleteIdFields?: readonly string[];
  notFoundAsInvalidInput?: boolean;
}

interface AgentMailActionDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  operation: AgentMailOperationDefinition;
}

type AgentMailActionDefinitions = readonly AgentMailActionDefinition[];

const emailField = s.email("Email address.");
const addressField = s.anyOf("Email address or email address list.", [
  s.string("Email address or formatted address.", { minLength: 1 }),
  s.array("Email addresses or formatted addresses.", s.string("Email address.", { minLength: 1 }), {
    minItems: 1,
  }),
]);
const stringListField = (description: string) =>
  s.array(description, s.string("A string value.", { minLength: 1 }), { minItems: 1 });
const inboxIdField = s.string("The AgentMail inbox identifier.", { minLength: 1 });
const messageIdField = s.string("The AgentMail message identifier.", { minLength: 1 });
const threadIdField = s.string("The AgentMail thread identifier.", { minLength: 1 });
const draftIdField = s.string("The AgentMail draft identifier.", { minLength: 1 });
const attachmentIdField = s.string("The AgentMail attachment identifier.", { minLength: 1 });
const podIdField = s.string("The AgentMail pod identifier.", { minLength: 1 });
const domainIdField = s.string("The AgentMail domain identifier.", { minLength: 1 });
const webhookIdField = s.string("The AgentMail webhook identifier.", { minLength: 1 });
const apiKeyIdField = s.string("The AgentMail API key identifier.", { minLength: 1 });
const entryField = s.string("The email address or domain list entry.", { minLength: 1 });
const dateTimeField = s.dateTime("Timestamp in ISO 8601 format.");
const limitField = s.integer("Maximum number of items to return.", { minimum: 1, maximum: 100 });
const pageTokenField = s.string("Pagination token for the next page of results.", { minLength: 1 });
const ascendingField = s.boolean("Whether results should be sorted in ascending timestamp order.");
const descendingField = s.boolean("Whether metrics should be sorted in descending timestamp order.");
const beforeField = s.dateTime("Only include records before this ISO 8601 timestamp.");
const afterField = s.dateTime("Only include records after this ISO 8601 timestamp.");
const startField = s.dateTime("Start timestamp for the metrics query.");
const endField = s.dateTime("End timestamp for the metrics query.");
const subjectFilterField = stringListField("Subject filters used by AgentMail.");
const labelsField = stringListField("Labels used to filter or apply to a record.");
const directionField = s.stringEnum("Direction of the list entry.", ["send", "receive", "reply"]);
const listTypeField = s.stringEnum("Type of list entry.", ["allow", "block"]);
const metricEventTypeField = s.stringEnum("AgentMail metric event type.", [
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.delayed",
  "message.rejected",
  "message.complained",
  "message.received",
]);
const webhookEventTypeField = s.stringEnum("AgentMail webhook event type.", [
  "message.received",
  "message.received.spam",
  "message.received.blocked",
  "message.received.unauthenticated",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "message.rejected",
  "domain.verified",
]);
const metadataValueSchema = s.anyOf("Metadata value.", [
  s.string("String metadata value."),
  s.number("Number metadata value."),
  s.boolean("Boolean metadata value."),
]);
const metadataSchema = s.record(metadataValueSchema, {
  description: "Custom metadata attached to the inbox.",
});
const updateMetadataSchema = s.nullable(
  s.record(s.nullable(metadataValueSchema), {
    description:
      "Metadata to merge into the inbox. Set a key to null to remove it, or send null to clear all metadata.",
  }),
);
const looseResponseSchema = (description: string) => s.looseObject({}, { description });
const emptyInputSchema = s.object("No input is required.", {});

const attachmentSchema = s.object(
  "AgentMail attachment metadata.",
  {
    attachment_id: s.string("Unique identifier of the attachment."),
    filename: s.string("File name of the attachment."),
    size: s.integer("Attachment size in bytes."),
    content_type: s.string("MIME type of the attachment."),
    content_disposition: s.string("Content disposition of the attachment."),
    content_id: s.string("Content ID of the attachment."),
    inline: s.boolean("Whether the attachment is inline."),
    download_url: s.url("URL used to download the attachment."),
    expires_at: dateTimeField,
  },
  {
    optional: ["filename", "content_type", "content_disposition", "content_id", "inline", "download_url", "expires_at"],
  },
);

const sendAttachmentSchema = s.object(
  "Attachment to include in an AgentMail message or draft.",
  {
    filename: s.string("File name of the attachment.", { minLength: 1 }),
    content_type: s.string("MIME type of the attachment.", { minLength: 1 }),
    content_disposition: s.string("Content disposition of the attachment.", { minLength: 1 }),
    content_id: s.string("Content ID of the attachment.", { minLength: 1 }),
    content: s.string("Base64 encoded attachment content.", { minLength: 1 }),
    url: s.url("URL where AgentMail can fetch the attachment."),
  },
  {
    optional: ["filename", "content_type", "content_disposition", "content_id", "content", "url"],
  },
);

const headersSchema = s.record(s.string("Header value."), {
  description: "Custom message headers to include in the outbound message.",
});

const permissionsSchema = s.looseObject(
  {
    inbox_read: s.boolean("Read inbox details."),
    inbox_create: s.boolean("Create new inboxes."),
    inbox_update: s.boolean("Update inbox settings."),
    inbox_delete: s.boolean("Delete inboxes."),
    thread_read: s.boolean("Read threads."),
    thread_delete: s.boolean("Delete threads."),
    message_read: s.boolean("Read messages."),
    message_send: s.boolean("Send messages."),
    message_update: s.boolean("Update message labels."),
    label_spam_read: s.boolean("Access messages labeled spam."),
    label_blocked_read: s.boolean("Access messages labeled blocked."),
    label_trash_read: s.boolean("Access messages labeled trash."),
    draft_read: s.boolean("Read drafts."),
    draft_create: s.boolean("Create drafts."),
    draft_update: s.boolean("Update drafts."),
    draft_delete: s.boolean("Delete drafts."),
    draft_send: s.boolean("Send drafts."),
    webhook_read: s.boolean("Read webhook configurations."),
    webhook_create: s.boolean("Create webhooks."),
    webhook_update: s.boolean("Update webhooks."),
    webhook_delete: s.boolean("Delete webhooks."),
    domain_read: s.boolean("Read domain details."),
    domain_create: s.boolean("Create domains."),
    domain_update: s.boolean("Update domains."),
    domain_delete: s.boolean("Delete domains."),
    list_entry_read: s.boolean("Read list entries."),
    list_entry_create: s.boolean("Create list entries."),
    list_entry_delete: s.boolean("Delete list entries."),
    metrics_read: s.boolean("Read metrics."),
    api_key_read: s.boolean("Read API keys."),
    api_key_create: s.boolean("Create API keys."),
    api_key_delete: s.boolean("Delete API keys."),
    pod_read: s.boolean("Read pods."),
    pod_create: s.boolean("Create pods."),
    pod_delete: s.boolean("Delete pods."),
  },
  { description: "Granular AgentMail API key permissions." },
);

const inboxSchema = s.looseObject(
  {
    pod_id: podIdField,
    inbox_id: inboxIdField,
    email: emailField,
    display_name: s.string("Display name shown for the inbox."),
    client_id: s.string("Client identifier associated with the inbox."),
    metadata: metadataSchema,
    updated_at: dateTimeField,
    created_at: dateTimeField,
  },
  { description: "AgentMail inbox." },
);

const messageSchema = s.looseObject(
  {
    inbox_id: inboxIdField,
    thread_id: threadIdField,
    message_id: messageIdField,
    labels: stringListField("Labels applied to the message."),
    timestamp: dateTimeField,
    from: s.string("Sender address of the message."),
    to: stringListField("Recipient email addresses."),
    cc: stringListField("CC recipient email addresses."),
    bcc: stringListField("BCC recipient email addresses."),
    subject: s.string("Subject line of the message."),
    text: s.string("Plain text body of the message."),
    html: s.string("HTML body of the message."),
    preview: s.string("Short text preview of the message."),
    attachments: s.array("Attachments included in the message.", attachmentSchema),
    updated_at: dateTimeField,
    created_at: dateTimeField,
  },
  { description: "AgentMail message." },
);

const sendMessageOutputSchema = s.object("Response returned after sending an AgentMail message.", {
  message_id: messageIdField,
  thread_id: threadIdField,
});

const deleteOutputSchema = (idFields: readonly [string, ...string[]]) =>
  s.object(
    "Connector-normalized response returned after AgentMail accepts a delete request.",
    Object.fromEntries([
      ...idFields.map((field) => [field, s.string(`The ${field} value deleted by AgentMail.`)]),
      ["deleted", s.boolean("Whether AgentMail accepted the delete request.")],
    ]),
  );

const listInputSchema = (description: string) =>
  s.object(
    description,
    {
      limit: limitField,
      page_token: pageTokenField,
      ascending: ascendingField,
    },
    { optional: ["limit", "page_token", "ascending"] },
  );

const inboxPathInputSchema = (description: string) =>
  s.object(description, {
    inbox_id: inboxIdField,
  });

const podPathInputSchema = (description: string) =>
  s.object(description, {
    pod_id: podIdField,
  });

const threadPathInputSchema = (description: string, includeInboxId = true) =>
  s.object(description, {
    ...(includeInboxId ? { inbox_id: inboxIdField } : {}),
    thread_id: threadIdField,
  });

const messagePathInputSchema = (description: string) =>
  s.object(description, {
    inbox_id: inboxIdField,
    message_id: messageIdField,
  });

const draftPathInputSchema = (description: string, includeInboxId = true) =>
  s.object(description, {
    ...(includeInboxId ? { inbox_id: inboxIdField } : {}),
    draft_id: draftIdField,
  });

const listThreadsInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      limit: limitField,
      page_token: pageTokenField,
      labels: labelsField,
      before: beforeField,
      after: afterField,
      ascending: ascendingField,
      include_spam: s.boolean("Whether spam threads should be included in the result."),
      include_blocked: s.boolean("Whether blocked threads should be included in the result."),
      include_unauthenticated: s.boolean("Whether unauthenticated threads should be included in the result."),
      include_trash: s.boolean("Whether trash threads should be included in the result."),
      senders: stringListField("Sender addresses used to filter threads."),
      recipients: stringListField("Recipient addresses used to filter threads."),
      subject: subjectFilterField,
    },
    {
      optional: [
        "limit",
        "page_token",
        "labels",
        "before",
        "after",
        "ascending",
        "include_spam",
        "include_blocked",
        "include_unauthenticated",
        "include_trash",
        "senders",
        "recipients",
        "subject",
      ],
    },
  );

const listMessagesInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      limit: limitField,
      page_token: pageTokenField,
      labels: labelsField,
      before: beforeField,
      after: afterField,
      ascending: ascendingField,
      include_spam: s.boolean("Whether spam messages should be included in the result."),
      include_blocked: s.boolean("Whether blocked messages should be included in the result."),
      include_unauthenticated: s.boolean("Whether unauthenticated messages should be included in the result."),
      include_trash: s.boolean("Whether trash messages should be included in the result."),
      from: s.string("Sender address used to filter messages.", { minLength: 1 }),
      to: s.string("Recipient address used to filter messages.", { minLength: 1 }),
      subject: subjectFilterField,
    },
    {
      optional: [
        "limit",
        "page_token",
        "labels",
        "before",
        "after",
        "ascending",
        "include_spam",
        "include_blocked",
        "include_unauthenticated",
        "include_trash",
        "from",
        "to",
        "subject",
      ],
    },
  );

const searchInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      q: s.string("Search query.", { minLength: 1 }),
      limit: limitField,
      page_token: pageTokenField,
      before: beforeField,
      after: afterField,
    },
    { optional: ["limit", "page_token", "before", "after"] },
  );

const listDraftsInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      limit: limitField,
      page_token: pageTokenField,
      labels: labelsField,
      before: beforeField,
      after: afterField,
      ascending: ascendingField,
    },
    { optional: ["limit", "page_token", "labels", "before", "after", "ascending"] },
  );

const metricsInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      event_types: s.array("Metric event types to query.", metricEventTypeField, { minItems: 1 }),
      start: startField,
      end: endField,
      period: s.integer("Period in seconds for each metrics bucket.", { minimum: 1 }),
      limit: limitField,
      descending: descendingField,
    },
    { optional: ["event_types", "start", "end", "period", "limit", "descending"] },
  );

const createInboxInputSchema = s.object(
  "Request payload for creating an AgentMail inbox.",
  {
    username: s.string("Inbox username. AgentMail generates one when omitted.", { minLength: 1 }),
    domain: s.string("Verified domain used by the inbox. Defaults to agentmail.to.", {
      minLength: 1,
    }),
    display_name: s.string("Display name shown for the inbox.", { minLength: 1 }),
    client_id: s.string("Client-side identifier associated with the inbox.", { minLength: 1 }),
    metadata: metadataSchema,
  },
  { optional: ["username", "domain", "display_name", "client_id", "metadata"] },
);

const updateInboxInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      display_name: s.string("Display name shown for the inbox.", { minLength: 1 }),
      metadata: updateMetadataSchema,
    },
    { optional: ["display_name", "metadata"] },
  );

const updateLabelsInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      add_labels: labelsField,
      remove_labels: labelsField,
    },
    { optional: ["add_labels", "remove_labels"] },
  );

const sendMessageInputSchema = s.object(
  "Request payload for sending an AgentMail message.",
  {
    inbox_id: inboxIdField,
    labels: labelsField,
    reply_to: addressField,
    to: addressField,
    cc: addressField,
    bcc: addressField,
    subject: s.string("Subject line of the message.", { minLength: 1 }),
    text: s.string("Plain text body of the message."),
    html: s.string("HTML body of the message."),
    attachments: s.array("Attachments to include in the message.", sendAttachmentSchema, {
      minItems: 1,
    }),
    headers: headersSchema,
  },
  {
    optional: ["labels", "reply_to", "to", "cc", "bcc", "subject", "text", "html", "attachments", "headers"],
  },
);

const replyToMessageInputSchema = s.object(
  "Request payload for replying to an AgentMail message.",
  {
    inbox_id: inboxIdField,
    message_id: messageIdField,
    labels: labelsField,
    reply_to: addressField,
    to: addressField,
    cc: addressField,
    bcc: addressField,
    reply_all: s.boolean("Whether to reply to all recipients of the original message."),
    text: s.string("Plain text body of the reply."),
    html: s.string("HTML body of the reply."),
    attachments: s.array("Attachments to include in the reply.", sendAttachmentSchema, {
      minItems: 1,
    }),
    headers: headersSchema,
  },
  {
    optional: ["labels", "reply_to", "to", "cc", "bcc", "reply_all", "text", "html", "attachments", "headers"],
  },
);

const replyAllMessageInputSchema = s.object(
  "Request payload for replying to all recipients of an AgentMail message.",
  {
    inbox_id: inboxIdField,
    message_id: messageIdField,
    labels: labelsField,
    reply_to: addressField,
    text: s.string("Plain text body of the reply."),
    html: s.string("HTML body of the reply."),
    attachments: s.array("Attachments to include in the reply.", sendAttachmentSchema, {
      minItems: 1,
    }),
    headers: headersSchema,
  },
  { optional: ["labels", "reply_to", "text", "html", "attachments", "headers"] },
);

const forwardMessageInputSchema = s.object(
  "Request payload for forwarding an AgentMail message.",
  {
    inbox_id: inboxIdField,
    message_id: messageIdField,
    labels: labelsField,
    reply_to: addressField,
    to: addressField,
    cc: addressField,
    bcc: addressField,
    subject: s.string("Subject line of the forwarded message.", { minLength: 1 }),
    text: s.string("Plain text body of the forwarded message."),
    html: s.string("HTML body of the forwarded message."),
    attachments: s.array("Attachments to include in the forwarded message.", sendAttachmentSchema, {
      minItems: 1,
    }),
    headers: headersSchema,
  },
  {
    optional: ["labels", "reply_to", "to", "cc", "bcc", "subject", "text", "html", "attachments", "headers"],
  },
);

const createDraftInputSchema = s.object(
  "Request payload for creating an AgentMail draft.",
  {
    inbox_id: inboxIdField,
    labels: labelsField,
    reply_to: addressField,
    to: addressField,
    cc: addressField,
    bcc: addressField,
    subject: s.string("Subject line of the draft.", { minLength: 1 }),
    text: s.string("Plain text body of the draft."),
    html: s.string("HTML body of the draft."),
    attachments: s.array("Attachments to include in the draft.", sendAttachmentSchema, {
      minItems: 1,
    }),
    in_reply_to: messageIdField,
    send_at: s.dateTime("Time at which AgentMail should schedule the draft to send."),
    client_id: s.string("Client-side identifier associated with the draft.", { minLength: 1 }),
  },
  {
    optional: [
      "labels",
      "reply_to",
      "to",
      "cc",
      "bcc",
      "subject",
      "text",
      "html",
      "attachments",
      "in_reply_to",
      "send_at",
      "client_id",
    ],
  },
);

const updateDraftInputSchema = s.object(
  "Request payload for updating an AgentMail draft.",
  {
    inbox_id: inboxIdField,
    draft_id: draftIdField,
    reply_to: addressField,
    to: addressField,
    cc: addressField,
    bcc: addressField,
    subject: s.string("Subject line of the draft.", { minLength: 1 }),
    text: s.string("Plain text body of the draft."),
    html: s.string("HTML body of the draft."),
    send_at: s.dateTime("Time at which AgentMail should schedule the draft to send."),
  },
  { optional: ["reply_to", "to", "cc", "bcc", "subject", "text", "html", "send_at"] },
);

const sendDraftInputSchema = s.object(
  "Request payload for sending an AgentMail draft.",
  {
    inbox_id: inboxIdField,
    draft_id: draftIdField,
    add_labels: labelsField,
    remove_labels: labelsField,
  },
  { optional: ["add_labels", "remove_labels"] },
);

const createWebhookInputSchema = s.object(
  "Request payload for creating an AgentMail webhook.",
  {
    url: s.url("Webhook endpoint URL."),
    event_types: s.array("Event types this webhook should receive.", webhookEventTypeField, {
      minItems: 1,
    }),
    pod_ids: stringListField("Pod IDs subscribed to the webhook."),
    inbox_ids: stringListField("Inbox IDs subscribed to the webhook."),
    client_id: s.string("Client-side identifier associated with the webhook.", { minLength: 1 }),
  },
  { optional: ["pod_ids", "inbox_ids", "client_id"] },
);

const updateWebhookInputSchema = s.object(
  "Request payload for updating an AgentMail webhook.",
  {
    webhook_id: webhookIdField,
    add_inbox_ids: stringListField("Inbox IDs to subscribe to the webhook."),
    remove_inbox_ids: stringListField("Inbox IDs to unsubscribe from the webhook."),
    add_pod_ids: stringListField("Pod IDs to subscribe to the webhook."),
    remove_pod_ids: stringListField("Pod IDs to unsubscribe from the webhook."),
    event_types: s.array("Full replacement list of event types for the webhook.", webhookEventTypeField),
  },
  {
    optional: ["add_inbox_ids", "remove_inbox_ids", "add_pod_ids", "remove_pod_ids", "event_types"],
  },
);

const createDomainInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(description, {
    ...extraFields,
    domain: s.string("Domain name to add to AgentMail.", { minLength: 1 }),
    feedback_enabled: s.boolean("Whether bounce and complaint notifications are sent to inboxes."),
  });

const updateDomainInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(description, {
    ...extraFields,
    feedback_enabled: s.boolean("Whether bounce and complaint notifications are sent to inboxes."),
  });

const listEntriesInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      direction: directionField,
      type: listTypeField,
      limit: limitField,
      page_token: pageTokenField,
    },
    { optional: ["limit", "page_token"] },
  );

const entryPathInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(description, {
    ...extraFields,
    direction: directionField,
    type: listTypeField,
    entry: entryField,
  });

const createListEntryInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      direction: directionField,
      type: listTypeField,
      entry: entryField,
      reason: s.string("Reason for adding the list entry."),
    },
    { optional: ["reason"] },
  );

const createApiKeyInputSchema = (description: string, extraFields: Record<string, JsonSchema>) =>
  s.object(
    description,
    {
      ...extraFields,
      name: s.string("Name of the API key.", { minLength: 1 }),
      permissions: permissionsSchema,
    },
    { optional: ["name", "permissions"] },
  );

const createPodInputSchema = s.object(
  "Request payload for creating an AgentMail pod.",
  {
    name: s.string("Name of the pod.", { minLength: 1 }),
    client_id: s.string("Client-side identifier associated with the pod.", { minLength: 1 }),
  },
  { optional: ["name", "client_id"] },
);

const actionDefinitions: AgentMailActionDefinitions = [
  {
    name: "create_inbox",
    description: "Create a new AgentMail inbox.",
    inputSchema: createInboxInputSchema,
    outputSchema: inboxSchema,
    operation: {
      method: "POST",
      path: "/v0/inboxes",
      bodyFields: ["username", "domain", "display_name", "client_id", "metadata"],
    },
  },
  {
    name: "list_inboxes",
    description: "List inboxes available to the current AgentMail API key.",
    inputSchema: listInputSchema("Query parameters for listing AgentMail inboxes."),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail inboxes."),
    operation: {
      method: "GET",
      path: "/v0/inboxes",
      queryParams: ["limit", "page_token", "ascending"],
    },
  },
  {
    name: "get_inbox",
    description: "Get a single AgentMail inbox.",
    inputSchema: inboxPathInputSchema("Path parameters for fetching a single AgentMail inbox."),
    outputSchema: inboxSchema,
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}",
      pathParams: ["inbox_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_inbox",
    description: "Update an AgentMail inbox display name or metadata.",
    inputSchema: updateInboxInputSchema("Request payload for updating an AgentMail inbox.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: inboxSchema,
    operation: {
      method: "PATCH",
      path: "/v0/inboxes/{inbox_id}",
      pathParams: ["inbox_id"],
      bodyFields: ["display_name", "metadata"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_inbox",
    description: "Delete an AgentMail inbox.",
    inputSchema: inboxPathInputSchema("Path parameters for deleting an AgentMail inbox."),
    outputSchema: deleteOutputSchema(["inbox_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/inboxes/{inbox_id}",
      pathParams: ["inbox_id"],
      deleteIdFields: ["inbox_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_inbox_threads",
    description: "List threads in a specific AgentMail inbox.",
    inputSchema: listThreadsInputSchema("Query parameters for listing AgentMail inbox threads.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail inbox threads."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/threads",
      pathParams: ["inbox_id"],
      queryParams: [
        "limit",
        "page_token",
        "labels",
        "before",
        "after",
        "ascending",
        "include_spam",
        "include_blocked",
        "include_unauthenticated",
        "include_trash",
        "senders",
        "recipients",
        "subject",
      ],
    },
  },
  {
    name: "search_inbox_threads",
    description: "Search threads in a specific AgentMail inbox.",
    inputSchema: searchInputSchema("Query parameters for searching AgentMail inbox threads.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when searching AgentMail inbox threads."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/threads/search",
      pathParams: ["inbox_id"],
      queryParams: ["q", "limit", "page_token", "before", "after"],
    },
  },
  {
    name: "get_inbox_thread",
    description: "Get a single thread from a specific AgentMail inbox.",
    inputSchema: threadPathInputSchema("Path parameters for fetching an AgentMail inbox thread."),
    outputSchema: looseResponseSchema("AgentMail thread response."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/threads/{thread_id}",
      pathParams: ["inbox_id", "thread_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_inbox_thread",
    description: "Update labels on a thread in a specific AgentMail inbox.",
    inputSchema: updateLabelsInputSchema("Request payload for updating an AgentMail inbox thread.", {
      inbox_id: inboxIdField,
      thread_id: threadIdField,
    }),
    outputSchema: looseResponseSchema("Response returned after updating an AgentMail inbox thread."),
    operation: {
      method: "PATCH",
      path: "/v0/inboxes/{inbox_id}/threads/{thread_id}",
      pathParams: ["inbox_id", "thread_id"],
      bodyFields: ["add_labels", "remove_labels"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_inbox_thread",
    description: "Delete a thread from a specific AgentMail inbox.",
    inputSchema: s.object(
      "Path and query parameters for deleting an AgentMail inbox thread.",
      {
        inbox_id: inboxIdField,
        thread_id: threadIdField,
        permanent: s.boolean("Whether the thread should be permanently deleted."),
      },
      { optional: ["permanent"] },
    ),
    outputSchema: deleteOutputSchema(["inbox_id", "thread_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/inboxes/{inbox_id}/threads/{thread_id}",
      pathParams: ["inbox_id", "thread_id"],
      queryParams: ["permanent"],
      deleteIdFields: ["inbox_id", "thread_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_inbox_thread_attachment",
    description: "Get metadata and download URL for an attachment in an AgentMail inbox thread.",
    inputSchema: s.object("Path parameters for fetching an AgentMail inbox thread attachment.", {
      inbox_id: inboxIdField,
      thread_id: threadIdField,
      attachment_id: attachmentIdField,
    }),
    outputSchema: attachmentSchema,
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/threads/{thread_id}/attachments/{attachment_id}",
      pathParams: ["inbox_id", "thread_id", "attachment_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_messages",
    description: "List messages from a specific AgentMail inbox.",
    inputSchema: listMessagesInputSchema("Query parameters for listing AgentMail messages.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail messages."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/messages",
      pathParams: ["inbox_id"],
      queryParams: [
        "limit",
        "page_token",
        "labels",
        "before",
        "after",
        "ascending",
        "include_spam",
        "include_blocked",
        "include_unauthenticated",
        "include_trash",
        "from",
        "to",
        "subject",
      ],
    },
  },
  {
    name: "search_messages",
    description: "Search messages in a specific AgentMail inbox.",
    inputSchema: searchInputSchema("Query parameters for searching AgentMail messages.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when searching AgentMail messages."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/messages/search",
      pathParams: ["inbox_id"],
      queryParams: ["q", "limit", "page_token", "before", "after"],
    },
  },
  {
    name: "get_message",
    description: "Get a single message from a specific AgentMail inbox.",
    inputSchema: messagePathInputSchema("Path parameters for fetching a single AgentMail message."),
    outputSchema: messageSchema,
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/messages/{message_id}",
      pathParams: ["inbox_id", "message_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_message",
    description: "Update labels on a message in a specific AgentMail inbox.",
    inputSchema: updateLabelsInputSchema("Request payload for updating an AgentMail message.", {
      inbox_id: inboxIdField,
      message_id: messageIdField,
    }),
    outputSchema: looseResponseSchema("Response returned after updating an AgentMail message."),
    operation: {
      method: "PATCH",
      path: "/v0/inboxes/{inbox_id}/messages/{message_id}",
      pathParams: ["inbox_id", "message_id"],
      bodyFields: ["add_labels", "remove_labels"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "batch_get_messages",
    description: "Fetch multiple messages from a specific AgentMail inbox by message ID.",
    inputSchema: s.object("Request payload for fetching multiple AgentMail messages.", {
      inbox_id: inboxIdField,
      message_ids: s.array("Message IDs to fetch.", messageIdField, { minItems: 1, maxItems: 500 }),
    }),
    outputSchema: looseResponseSchema("Response returned when batch-fetching AgentMail messages."),
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/messages/batch-get",
      pathParams: ["inbox_id"],
      bodyFields: ["message_ids"],
    },
  },
  {
    name: "get_message_attachment",
    description: "Get metadata and download URL for an attachment on a specific AgentMail message.",
    inputSchema: s.object("Path parameters for fetching an AgentMail message attachment.", {
      inbox_id: inboxIdField,
      message_id: messageIdField,
      attachment_id: attachmentIdField,
    }),
    outputSchema: attachmentSchema,
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/messages/{message_id}/attachments/{attachment_id}",
      pathParams: ["inbox_id", "message_id", "attachment_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_raw_message",
    description: "Get a presigned download URL for the raw EML version of an AgentMail message.",
    inputSchema: messagePathInputSchema("Path parameters for fetching a raw AgentMail message download URL."),
    outputSchema: s.object("Raw AgentMail message download response.", {
      message_id: messageIdField,
      size: s.integer("Size of the raw message in bytes."),
      download_url: s.url("Presigned URL used to download the raw message."),
      expires_at: dateTimeField,
    }),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/messages/{message_id}/raw",
      pathParams: ["inbox_id", "message_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "send_message",
    description: "Send a message from a specific AgentMail inbox.",
    inputSchema: sendMessageInputSchema,
    outputSchema: sendMessageOutputSchema,
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/messages/send",
      pathParams: ["inbox_id"],
      bodyFields: ["labels", "reply_to", "to", "cc", "bcc", "subject", "text", "html", "attachments", "headers"],
    },
  },
  {
    name: "reply_to_message",
    description: "Reply to a specific AgentMail message.",
    inputSchema: replyToMessageInputSchema,
    outputSchema: sendMessageOutputSchema,
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/messages/{message_id}/reply",
      pathParams: ["inbox_id", "message_id"],
      bodyFields: ["labels", "reply_to", "to", "cc", "bcc", "reply_all", "text", "html", "attachments", "headers"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "reply_all_message",
    description: "Reply to all recipients of a specific AgentMail message.",
    inputSchema: replyAllMessageInputSchema,
    outputSchema: sendMessageOutputSchema,
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/messages/{message_id}/reply-all",
      pathParams: ["inbox_id", "message_id"],
      bodyFields: ["labels", "reply_to", "text", "html", "attachments", "headers"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "forward_message",
    description: "Forward a specific AgentMail message.",
    inputSchema: forwardMessageInputSchema,
    outputSchema: sendMessageOutputSchema,
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/messages/{message_id}/forward",
      pathParams: ["inbox_id", "message_id"],
      bodyFields: ["labels", "reply_to", "to", "cc", "bcc", "subject", "text", "html", "attachments", "headers"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_drafts",
    description: "List drafts from a specific AgentMail inbox.",
    inputSchema: listDraftsInputSchema("Query parameters for listing AgentMail inbox drafts.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail inbox drafts."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/drafts",
      pathParams: ["inbox_id"],
      queryParams: ["limit", "page_token", "labels", "before", "after", "ascending"],
    },
  },
  {
    name: "create_draft",
    description: "Create a draft in a specific AgentMail inbox.",
    inputSchema: createDraftInputSchema,
    outputSchema: looseResponseSchema("AgentMail draft response."),
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/drafts",
      pathParams: ["inbox_id"],
      bodyFields: [
        "labels",
        "reply_to",
        "to",
        "cc",
        "bcc",
        "subject",
        "text",
        "html",
        "attachments",
        "in_reply_to",
        "send_at",
        "client_id",
      ],
    },
  },
  {
    name: "get_draft",
    description: "Get a draft from a specific AgentMail inbox.",
    inputSchema: draftPathInputSchema("Path parameters for fetching an AgentMail inbox draft."),
    outputSchema: looseResponseSchema("AgentMail draft response."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/drafts/{draft_id}",
      pathParams: ["inbox_id", "draft_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_draft",
    description: "Update a draft in a specific AgentMail inbox.",
    inputSchema: updateDraftInputSchema,
    outputSchema: looseResponseSchema("AgentMail draft response."),
    operation: {
      method: "PATCH",
      path: "/v0/inboxes/{inbox_id}/drafts/{draft_id}",
      pathParams: ["inbox_id", "draft_id"],
      bodyFields: ["reply_to", "to", "cc", "bcc", "subject", "text", "html", "send_at"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_draft",
    description: "Delete a draft from a specific AgentMail inbox.",
    inputSchema: draftPathInputSchema("Path parameters for deleting an AgentMail inbox draft."),
    outputSchema: deleteOutputSchema(["inbox_id", "draft_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/inboxes/{inbox_id}/drafts/{draft_id}",
      pathParams: ["inbox_id", "draft_id"],
      deleteIdFields: ["inbox_id", "draft_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_draft_attachment",
    description: "Get metadata and download URL for an attachment on a specific AgentMail draft.",
    inputSchema: s.object("Path parameters for fetching an AgentMail draft attachment.", {
      inbox_id: inboxIdField,
      draft_id: draftIdField,
      attachment_id: attachmentIdField,
    }),
    outputSchema: attachmentSchema,
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/drafts/{draft_id}/attachments/{attachment_id}",
      pathParams: ["inbox_id", "draft_id", "attachment_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "send_draft",
    description: "Send a specific AgentMail draft.",
    inputSchema: sendDraftInputSchema,
    outputSchema: looseResponseSchema("Response returned after sending an AgentMail draft."),
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/drafts/{draft_id}/send",
      pathParams: ["inbox_id", "draft_id"],
      bodyFields: ["add_labels", "remove_labels"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_inbox_list_entries",
    description: "List allow or block entries scoped to a specific AgentMail inbox.",
    inputSchema: listEntriesInputSchema("Query parameters for listing AgentMail inbox list entries.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail inbox list entries."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/lists/{direction}/{type}",
      pathParams: ["inbox_id", "direction", "type"],
      queryParams: ["limit", "page_token"],
    },
  },
  {
    name: "create_inbox_list_entry",
    description: "Create an allow or block list entry scoped to a specific AgentMail inbox.",
    inputSchema: createListEntryInputSchema("Request payload for creating an AgentMail inbox list entry.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail inbox list entry response."),
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/lists/{direction}/{type}",
      pathParams: ["inbox_id", "direction", "type"],
      bodyFields: ["entry", "reason"],
    },
  },
  {
    name: "get_inbox_list_entry",
    description: "Get an allow or block list entry scoped to a specific AgentMail inbox.",
    inputSchema: entryPathInputSchema("Path parameters for fetching an AgentMail inbox list entry.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail inbox list entry response."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/lists/{direction}/{type}/{entry}",
      pathParams: ["inbox_id", "direction", "type", "entry"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_inbox_list_entry",
    description: "Delete an allow or block list entry scoped to a specific AgentMail inbox.",
    inputSchema: entryPathInputSchema("Path parameters for deleting an AgentMail inbox list entry.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: deleteOutputSchema(["inbox_id", "direction", "type", "entry"]),
    operation: {
      method: "DELETE",
      path: "/v0/inboxes/{inbox_id}/lists/{direction}/{type}/{entry}",
      pathParams: ["inbox_id", "direction", "type", "entry"],
      deleteIdFields: ["inbox_id", "direction", "type", "entry"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "query_inbox_metrics",
    description: "Query AgentMail metrics scoped to a specific inbox.",
    inputSchema: metricsInputSchema("Query parameters for AgentMail inbox metrics.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail metrics response."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/metrics",
      pathParams: ["inbox_id"],
      queryParams: ["event_types", "start", "end", "period", "limit", "descending"],
    },
  },
  {
    name: "list_inbox_events",
    description: "List events scoped to a specific AgentMail inbox.",
    inputSchema: s.object(
      "Query parameters for listing AgentMail inbox events.",
      {
        inbox_id: inboxIdField,
        limit: limitField,
        page_token: pageTokenField,
        ascending: ascendingField,
      },
      { optional: ["limit", "page_token", "ascending"] },
    ),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail inbox events."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/events",
      pathParams: ["inbox_id"],
      queryParams: ["limit", "page_token", "ascending"],
    },
  },
  {
    name: "list_inbox_api_keys",
    description: "List API keys scoped to a specific AgentMail inbox.",
    inputSchema: s.object(
      "Query parameters for listing AgentMail inbox API keys.",
      {
        inbox_id: inboxIdField,
        limit: limitField,
        page_token: pageTokenField,
      },
      { optional: ["limit", "page_token"] },
    ),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail inbox API keys."),
    operation: {
      method: "GET",
      path: "/v0/inboxes/{inbox_id}/api-keys",
      pathParams: ["inbox_id"],
      queryParams: ["limit", "page_token"],
    },
  },
  {
    name: "create_inbox_api_key",
    description: "Create an API key scoped to a specific AgentMail inbox.",
    inputSchema: createApiKeyInputSchema("Request payload for creating an AgentMail inbox API key.", {
      inbox_id: inboxIdField,
    }),
    outputSchema: looseResponseSchema("Response returned after creating an AgentMail inbox API key."),
    operation: {
      method: "POST",
      path: "/v0/inboxes/{inbox_id}/api-keys",
      pathParams: ["inbox_id"],
      bodyFields: ["name", "permissions"],
    },
  },
  {
    name: "delete_inbox_api_key",
    description: "Delete an API key scoped to a specific AgentMail inbox.",
    inputSchema: s.object("Path parameters for deleting an AgentMail inbox API key.", {
      inbox_id: inboxIdField,
      api_key_id: apiKeyIdField,
    }),
    outputSchema: deleteOutputSchema(["inbox_id", "api_key_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/inboxes/{inbox_id}/api-keys/{api_key_id}",
      pathParams: ["inbox_id", "api_key_id"],
      deleteIdFields: ["inbox_id", "api_key_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_threads",
    description: "List AgentMail threads across accessible inboxes.",
    inputSchema: listThreadsInputSchema("Query parameters for listing AgentMail threads.", {}),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail threads."),
    operation: {
      method: "GET",
      path: "/v0/threads",
      queryParams: [
        "limit",
        "page_token",
        "labels",
        "before",
        "after",
        "ascending",
        "include_spam",
        "include_blocked",
        "include_unauthenticated",
        "include_trash",
        "senders",
        "recipients",
        "subject",
      ],
    },
  },
  {
    name: "search_threads",
    description: "Search AgentMail threads across accessible inboxes.",
    inputSchema: searchInputSchema("Query parameters for searching AgentMail threads.", {}),
    outputSchema: looseResponseSchema("Response returned when searching AgentMail threads."),
    operation: {
      method: "GET",
      path: "/v0/threads/search",
      queryParams: ["q", "limit", "page_token", "before", "after"],
    },
  },
  {
    name: "get_thread",
    description: "Get a single AgentMail thread.",
    inputSchema: threadPathInputSchema("Path parameters for fetching an AgentMail thread.", false),
    outputSchema: looseResponseSchema("AgentMail thread response."),
    operation: {
      method: "GET",
      path: "/v0/threads/{thread_id}",
      pathParams: ["thread_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_thread",
    description: "Update labels on an AgentMail thread.",
    inputSchema: updateLabelsInputSchema("Request payload for updating an AgentMail thread.", {
      thread_id: threadIdField,
    }),
    outputSchema: looseResponseSchema("Response returned after updating an AgentMail thread."),
    operation: {
      method: "PATCH",
      path: "/v0/threads/{thread_id}",
      pathParams: ["thread_id"],
      bodyFields: ["add_labels", "remove_labels"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_thread",
    description: "Delete an AgentMail thread.",
    inputSchema: s.object(
      "Path and query parameters for deleting an AgentMail thread.",
      {
        thread_id: threadIdField,
        permanent: s.boolean("Whether the thread should be permanently deleted."),
      },
      { optional: ["permanent"] },
    ),
    outputSchema: deleteOutputSchema(["thread_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/threads/{thread_id}",
      pathParams: ["thread_id"],
      queryParams: ["permanent"],
      deleteIdFields: ["thread_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_thread_attachment",
    description: "Get metadata and download URL for an attachment in an AgentMail thread.",
    inputSchema: s.object("Path parameters for fetching an AgentMail thread attachment.", {
      thread_id: threadIdField,
      attachment_id: attachmentIdField,
    }),
    outputSchema: attachmentSchema,
    operation: {
      method: "GET",
      path: "/v0/threads/{thread_id}/attachments/{attachment_id}",
      pathParams: ["thread_id", "attachment_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_global_drafts",
    description: "List AgentMail drafts across accessible inboxes.",
    inputSchema: listDraftsInputSchema("Query parameters for listing AgentMail drafts.", {}),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail drafts."),
    operation: {
      method: "GET",
      path: "/v0/drafts",
      queryParams: ["limit", "page_token", "labels", "before", "after", "ascending"],
    },
  },
  {
    name: "get_global_draft",
    description: "Get a single AgentMail draft across accessible inboxes.",
    inputSchema: draftPathInputSchema("Path parameters for fetching an AgentMail draft.", false),
    outputSchema: looseResponseSchema("AgentMail draft response."),
    operation: {
      method: "GET",
      path: "/v0/drafts/{draft_id}",
      pathParams: ["draft_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_global_draft_attachment",
    description: "Get metadata and download URL for an attachment on an AgentMail draft.",
    inputSchema: s.object("Path parameters for fetching an AgentMail draft attachment.", {
      draft_id: draftIdField,
      attachment_id: attachmentIdField,
    }),
    outputSchema: attachmentSchema,
    operation: {
      method: "GET",
      path: "/v0/drafts/{draft_id}/attachments/{attachment_id}",
      pathParams: ["draft_id", "attachment_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_webhooks",
    description: "List AgentMail webhooks.",
    inputSchema: listInputSchema("Query parameters for listing AgentMail webhooks."),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail webhooks."),
    operation: {
      method: "GET",
      path: "/v0/webhooks",
      queryParams: ["limit", "page_token", "ascending"],
    },
  },
  {
    name: "create_webhook",
    description: "Create an AgentMail webhook.",
    inputSchema: createWebhookInputSchema,
    outputSchema: looseResponseSchema("AgentMail webhook response."),
    operation: {
      method: "POST",
      path: "/v0/webhooks",
      bodyFields: ["url", "event_types", "pod_ids", "inbox_ids", "client_id"],
    },
  },
  {
    name: "get_webhook",
    description: "Get a single AgentMail webhook.",
    inputSchema: s.object("Path parameters for fetching an AgentMail webhook.", {
      webhook_id: webhookIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail webhook response."),
    operation: {
      method: "GET",
      path: "/v0/webhooks/{webhook_id}",
      pathParams: ["webhook_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_webhook",
    description: "Update an AgentMail webhook.",
    inputSchema: updateWebhookInputSchema,
    outputSchema: looseResponseSchema("AgentMail webhook response."),
    operation: {
      method: "PATCH",
      path: "/v0/webhooks/{webhook_id}",
      pathParams: ["webhook_id"],
      bodyFields: ["add_inbox_ids", "remove_inbox_ids", "add_pod_ids", "remove_pod_ids", "event_types"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_webhook",
    description: "Delete an AgentMail webhook.",
    inputSchema: s.object("Path parameters for deleting an AgentMail webhook.", {
      webhook_id: webhookIdField,
    }),
    outputSchema: deleteOutputSchema(["webhook_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/webhooks/{webhook_id}",
      pathParams: ["webhook_id"],
      deleteIdFields: ["webhook_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_domains",
    description: "List AgentMail domains.",
    inputSchema: listInputSchema("Query parameters for listing AgentMail domains."),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail domains."),
    operation: {
      method: "GET",
      path: "/v0/domains",
      queryParams: ["limit", "page_token", "ascending"],
    },
  },
  {
    name: "create_domain",
    description: "Create an AgentMail domain.",
    inputSchema: createDomainInputSchema("Request payload for creating an AgentMail domain.", {}),
    outputSchema: looseResponseSchema("AgentMail domain response."),
    operation: {
      method: "POST",
      path: "/v0/domains",
      bodyFields: ["domain", "feedback_enabled"],
    },
  },
  {
    name: "get_domain",
    description: "Get a single AgentMail domain.",
    inputSchema: s.object("Path parameters for fetching an AgentMail domain.", {
      domain_id: domainIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain response."),
    operation: {
      method: "GET",
      path: "/v0/domains/{domain_id}",
      pathParams: ["domain_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_domain",
    description: "Update an AgentMail domain.",
    inputSchema: updateDomainInputSchema("Request payload for updating an AgentMail domain.", {
      domain_id: domainIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain response."),
    operation: {
      method: "PATCH",
      path: "/v0/domains/{domain_id}",
      pathParams: ["domain_id"],
      bodyFields: ["feedback_enabled"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_domain",
    description: "Delete an AgentMail domain.",
    inputSchema: s.object("Path parameters for deleting an AgentMail domain.", {
      domain_id: domainIdField,
    }),
    outputSchema: deleteOutputSchema(["domain_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/domains/{domain_id}",
      pathParams: ["domain_id"],
      deleteIdFields: ["domain_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_domain_zone_file",
    description: "Get the DNS zone file records needed for an AgentMail domain.",
    inputSchema: s.object("Path parameters for fetching an AgentMail domain zone file.", {
      domain_id: domainIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain zone file response."),
    operation: {
      method: "GET",
      path: "/v0/domains/{domain_id}/zone-file",
      pathParams: ["domain_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "verify_domain",
    description: "Ask AgentMail to verify a domain's DNS records.",
    inputSchema: s.object("Path parameters for verifying an AgentMail domain.", {
      domain_id: domainIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain response after verification."),
    operation: {
      method: "POST",
      path: "/v0/domains/{domain_id}/verify",
      pathParams: ["domain_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_list_entries",
    description: "List global AgentMail allow or block entries.",
    inputSchema: listEntriesInputSchema("Query parameters for listing AgentMail list entries.", {}),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail list entries."),
    operation: {
      method: "GET",
      path: "/v0/lists/{direction}/{type}",
      pathParams: ["direction", "type"],
      queryParams: ["limit", "page_token"],
    },
  },
  {
    name: "create_list_entry",
    description: "Create a global AgentMail allow or block list entry.",
    inputSchema: createListEntryInputSchema("Request payload for creating an AgentMail list entry.", {}),
    outputSchema: looseResponseSchema("AgentMail list entry response."),
    operation: {
      method: "POST",
      path: "/v0/lists/{direction}/{type}",
      pathParams: ["direction", "type"],
      bodyFields: ["entry", "reason"],
    },
  },
  {
    name: "get_list_entry",
    description: "Get a global AgentMail allow or block list entry.",
    inputSchema: entryPathInputSchema("Path parameters for fetching an AgentMail list entry.", {}),
    outputSchema: looseResponseSchema("AgentMail list entry response."),
    operation: {
      method: "GET",
      path: "/v0/lists/{direction}/{type}/{entry}",
      pathParams: ["direction", "type", "entry"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_list_entry",
    description: "Delete a global AgentMail allow or block list entry.",
    inputSchema: entryPathInputSchema("Path parameters for deleting an AgentMail list entry.", {}),
    outputSchema: deleteOutputSchema(["direction", "type", "entry"]),
    operation: {
      method: "DELETE",
      path: "/v0/lists/{direction}/{type}/{entry}",
      pathParams: ["direction", "type", "entry"],
      deleteIdFields: ["direction", "type", "entry"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "query_metrics",
    description: "Query AgentMail metrics across accessible resources.",
    inputSchema: metricsInputSchema("Query parameters for AgentMail metrics.", {}),
    outputSchema: looseResponseSchema("AgentMail metrics response."),
    operation: {
      method: "GET",
      path: "/v0/metrics",
      queryParams: ["event_types", "start", "end", "period", "limit", "descending"],
    },
  },
  {
    name: "list_api_keys",
    description: "List AgentMail API keys.",
    inputSchema: listInputSchema("Query parameters for listing AgentMail API keys."),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail API keys."),
    operation: {
      method: "GET",
      path: "/v0/api-keys",
      queryParams: ["limit", "page_token", "ascending"],
    },
  },
  {
    name: "create_api_key",
    description: "Create an AgentMail API key.",
    inputSchema: createApiKeyInputSchema("Request payload for creating an AgentMail API key.", {}),
    outputSchema: looseResponseSchema("Response returned after creating an AgentMail API key."),
    operation: {
      method: "POST",
      path: "/v0/api-keys",
      bodyFields: ["name", "permissions"],
    },
  },
  {
    name: "delete_api_key",
    description: "Delete an AgentMail API key.",
    inputSchema: s.object("Path parameters for deleting an AgentMail API key.", {
      api_key_id: apiKeyIdField,
    }),
    outputSchema: deleteOutputSchema(["api_key_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/api-keys/{api_key_id}",
      pathParams: ["api_key_id"],
      deleteIdFields: ["api_key_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_pods",
    description: "List AgentMail pods.",
    inputSchema: listInputSchema("Query parameters for listing AgentMail pods."),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail pods."),
    operation: {
      method: "GET",
      path: "/v0/pods",
      queryParams: ["limit", "page_token", "ascending"],
    },
  },
  {
    name: "create_pod",
    description: "Create an AgentMail pod.",
    inputSchema: createPodInputSchema,
    outputSchema: looseResponseSchema("AgentMail pod response."),
    operation: {
      method: "POST",
      path: "/v0/pods",
      bodyFields: ["name", "client_id"],
    },
  },
  {
    name: "get_pod",
    description: "Get a single AgentMail pod.",
    inputSchema: podPathInputSchema("Path parameters for fetching an AgentMail pod."),
    outputSchema: looseResponseSchema("AgentMail pod response."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}",
      pathParams: ["pod_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_pod",
    description: "Delete an AgentMail pod.",
    inputSchema: podPathInputSchema("Path parameters for deleting an AgentMail pod."),
    outputSchema: deleteOutputSchema(["pod_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/pods/{pod_id}",
      pathParams: ["pod_id"],
      deleteIdFields: ["pod_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_pod_inboxes",
    description: "List AgentMail inboxes scoped to a pod.",
    inputSchema: s.object(
      "Query parameters for listing AgentMail pod inboxes.",
      {
        pod_id: podIdField,
        limit: limitField,
        page_token: pageTokenField,
        ascending: ascendingField,
      },
      { optional: ["limit", "page_token", "ascending"] },
    ),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail pod inboxes."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/inboxes",
      pathParams: ["pod_id"],
      queryParams: ["limit", "page_token", "ascending"],
    },
  },
  {
    name: "create_pod_inbox",
    description: "Create an AgentMail inbox scoped to a pod.",
    inputSchema: s.object(
      "Request payload for creating an AgentMail pod inbox.",
      {
        pod_id: podIdField,
        username: s.string("Inbox username. AgentMail generates one when omitted.", {
          minLength: 1,
        }),
        domain: s.string("Verified domain used by the inbox. Defaults to agentmail.to.", {
          minLength: 1,
        }),
        display_name: s.string("Display name shown for the inbox.", { minLength: 1 }),
        client_id: s.string("Client-side identifier associated with the inbox.", { minLength: 1 }),
        metadata: metadataSchema,
      },
      { optional: ["username", "domain", "display_name", "client_id", "metadata"] },
    ),
    outputSchema: inboxSchema,
    operation: {
      method: "POST",
      path: "/v0/pods/{pod_id}/inboxes",
      pathParams: ["pod_id"],
      bodyFields: ["username", "domain", "display_name", "client_id", "metadata"],
    },
  },
  {
    name: "get_pod_inbox",
    description: "Get a single AgentMail inbox scoped to a pod.",
    inputSchema: s.object("Path parameters for fetching an AgentMail pod inbox.", {
      pod_id: podIdField,
      inbox_id: inboxIdField,
    }),
    outputSchema: inboxSchema,
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/inboxes/{inbox_id}",
      pathParams: ["pod_id", "inbox_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_pod_inbox",
    description: "Update an AgentMail inbox scoped to a pod.",
    inputSchema: updateInboxInputSchema("Request payload for updating an AgentMail pod inbox.", {
      pod_id: podIdField,
      inbox_id: inboxIdField,
    }),
    outputSchema: inboxSchema,
    operation: {
      method: "PATCH",
      path: "/v0/pods/{pod_id}/inboxes/{inbox_id}",
      pathParams: ["pod_id", "inbox_id"],
      bodyFields: ["display_name", "metadata"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_pod_inbox",
    description: "Delete an AgentMail inbox scoped to a pod.",
    inputSchema: s.object("Path parameters for deleting an AgentMail pod inbox.", {
      pod_id: podIdField,
      inbox_id: inboxIdField,
    }),
    outputSchema: deleteOutputSchema(["pod_id", "inbox_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/pods/{pod_id}/inboxes/{inbox_id}",
      pathParams: ["pod_id", "inbox_id"],
      deleteIdFields: ["pod_id", "inbox_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_pod_threads",
    description: "List AgentMail threads scoped to a pod.",
    inputSchema: listThreadsInputSchema("Query parameters for listing AgentMail pod threads.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail pod threads."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/threads",
      pathParams: ["pod_id"],
      queryParams: [
        "limit",
        "page_token",
        "labels",
        "before",
        "after",
        "ascending",
        "include_spam",
        "include_blocked",
        "include_unauthenticated",
        "include_trash",
        "senders",
        "recipients",
        "subject",
      ],
    },
  },
  {
    name: "search_pod_threads",
    description: "Search AgentMail threads scoped to a pod.",
    inputSchema: searchInputSchema("Query parameters for searching AgentMail pod threads.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when searching AgentMail pod threads."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/threads/search",
      pathParams: ["pod_id"],
      queryParams: ["q", "limit", "page_token", "before", "after"],
    },
  },
  {
    name: "get_pod_thread",
    description: "Get a single AgentMail thread scoped to a pod.",
    inputSchema: s.object("Path parameters for fetching an AgentMail pod thread.", {
      pod_id: podIdField,
      thread_id: threadIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail thread response."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/threads/{thread_id}",
      pathParams: ["pod_id", "thread_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_pod_thread",
    description: "Update labels on an AgentMail thread scoped to a pod.",
    inputSchema: updateLabelsInputSchema("Request payload for updating an AgentMail pod thread.", {
      pod_id: podIdField,
      thread_id: threadIdField,
    }),
    outputSchema: looseResponseSchema("Response returned after updating an AgentMail pod thread."),
    operation: {
      method: "PATCH",
      path: "/v0/pods/{pod_id}/threads/{thread_id}",
      pathParams: ["pod_id", "thread_id"],
      bodyFields: ["add_labels", "remove_labels"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_pod_thread",
    description: "Delete an AgentMail thread scoped to a pod.",
    inputSchema: s.object(
      "Path and query parameters for deleting an AgentMail pod thread.",
      {
        pod_id: podIdField,
        thread_id: threadIdField,
        permanent: s.boolean("Whether the thread should be permanently deleted."),
      },
      { optional: ["permanent"] },
    ),
    outputSchema: deleteOutputSchema(["pod_id", "thread_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/pods/{pod_id}/threads/{thread_id}",
      pathParams: ["pod_id", "thread_id"],
      queryParams: ["permanent"],
      deleteIdFields: ["pod_id", "thread_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_pod_thread_attachment",
    description: "Get metadata and download URL for an attachment in an AgentMail pod thread.",
    inputSchema: s.object("Path parameters for fetching an AgentMail pod thread attachment.", {
      pod_id: podIdField,
      thread_id: threadIdField,
      attachment_id: attachmentIdField,
    }),
    outputSchema: attachmentSchema,
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/threads/{thread_id}/attachments/{attachment_id}",
      pathParams: ["pod_id", "thread_id", "attachment_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_pod_drafts",
    description: "List AgentMail drafts scoped to a pod.",
    inputSchema: listDraftsInputSchema("Query parameters for listing AgentMail pod drafts.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail pod drafts."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/drafts",
      pathParams: ["pod_id"],
      queryParams: ["limit", "page_token", "labels", "before", "after", "ascending"],
    },
  },
  {
    name: "get_pod_draft",
    description: "Get a single AgentMail draft scoped to a pod.",
    inputSchema: s.object("Path parameters for fetching an AgentMail pod draft.", {
      pod_id: podIdField,
      draft_id: draftIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail draft response."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/drafts/{draft_id}",
      pathParams: ["pod_id", "draft_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_pod_draft_attachment",
    description: "Get metadata and download URL for an attachment on an AgentMail pod draft.",
    inputSchema: s.object("Path parameters for fetching an AgentMail pod draft attachment.", {
      pod_id: podIdField,
      draft_id: draftIdField,
      attachment_id: attachmentIdField,
    }),
    outputSchema: attachmentSchema,
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/drafts/{draft_id}/attachments/{attachment_id}",
      pathParams: ["pod_id", "draft_id", "attachment_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_pod_domains",
    description: "List AgentMail domains scoped to a pod.",
    inputSchema: s.object(
      "Query parameters for listing AgentMail pod domains.",
      {
        pod_id: podIdField,
        limit: limitField,
        page_token: pageTokenField,
        ascending: ascendingField,
      },
      { optional: ["limit", "page_token", "ascending"] },
    ),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail pod domains."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/domains",
      pathParams: ["pod_id"],
      queryParams: ["limit", "page_token", "ascending"],
    },
  },
  {
    name: "create_pod_domain",
    description: "Create an AgentMail domain scoped to a pod.",
    inputSchema: createDomainInputSchema("Request payload for creating an AgentMail pod domain.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain response."),
    operation: {
      method: "POST",
      path: "/v0/pods/{pod_id}/domains",
      pathParams: ["pod_id"],
      bodyFields: ["domain", "feedback_enabled"],
    },
  },
  {
    name: "get_pod_domain",
    description: "Get a single AgentMail domain scoped to a pod.",
    inputSchema: s.object("Path parameters for fetching an AgentMail pod domain.", {
      pod_id: podIdField,
      domain_id: domainIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain response."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/domains/{domain_id}",
      pathParams: ["pod_id", "domain_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "update_pod_domain",
    description: "Update an AgentMail domain scoped to a pod.",
    inputSchema: updateDomainInputSchema("Request payload for updating an AgentMail pod domain.", {
      pod_id: podIdField,
      domain_id: domainIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain response."),
    operation: {
      method: "PATCH",
      path: "/v0/pods/{pod_id}/domains/{domain_id}",
      pathParams: ["pod_id", "domain_id"],
      bodyFields: ["feedback_enabled"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_pod_domain",
    description: "Delete an AgentMail domain scoped to a pod.",
    inputSchema: s.object("Path parameters for deleting an AgentMail pod domain.", {
      pod_id: podIdField,
      domain_id: domainIdField,
    }),
    outputSchema: deleteOutputSchema(["pod_id", "domain_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/pods/{pod_id}/domains/{domain_id}",
      pathParams: ["pod_id", "domain_id"],
      deleteIdFields: ["pod_id", "domain_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_pod_domain_zone_file",
    description: "Get the DNS zone file records needed for an AgentMail pod domain.",
    inputSchema: s.object("Path parameters for fetching an AgentMail pod domain zone file.", {
      pod_id: podIdField,
      domain_id: domainIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain zone file response."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/domains/{domain_id}/zone-file",
      pathParams: ["pod_id", "domain_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "verify_pod_domain",
    description: "Ask AgentMail to verify a pod domain's DNS records.",
    inputSchema: s.object("Path parameters for verifying an AgentMail pod domain.", {
      pod_id: podIdField,
      domain_id: domainIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail domain response after verification."),
    operation: {
      method: "POST",
      path: "/v0/pods/{pod_id}/domains/{domain_id}/verify",
      pathParams: ["pod_id", "domain_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "list_pod_list_entries",
    description: "List AgentMail allow or block entries scoped to a pod.",
    inputSchema: listEntriesInputSchema("Query parameters for listing AgentMail pod list entries.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail pod list entries."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/lists/{direction}/{type}",
      pathParams: ["pod_id", "direction", "type"],
      queryParams: ["limit", "page_token"],
    },
  },
  {
    name: "create_pod_list_entry",
    description: "Create an AgentMail allow or block list entry scoped to a pod.",
    inputSchema: createListEntryInputSchema("Request payload for creating an AgentMail pod list entry.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail pod list entry response."),
    operation: {
      method: "POST",
      path: "/v0/pods/{pod_id}/lists/{direction}/{type}",
      pathParams: ["pod_id", "direction", "type"],
      bodyFields: ["entry", "reason"],
    },
  },
  {
    name: "get_pod_list_entry",
    description: "Get an AgentMail allow or block list entry scoped to a pod.",
    inputSchema: entryPathInputSchema("Path parameters for fetching an AgentMail pod list entry.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail pod list entry response."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/lists/{direction}/{type}/{entry}",
      pathParams: ["pod_id", "direction", "type", "entry"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "delete_pod_list_entry",
    description: "Delete an AgentMail allow or block list entry scoped to a pod.",
    inputSchema: entryPathInputSchema("Path parameters for deleting an AgentMail pod list entry.", {
      pod_id: podIdField,
    }),
    outputSchema: deleteOutputSchema(["pod_id", "direction", "type", "entry"]),
    operation: {
      method: "DELETE",
      path: "/v0/pods/{pod_id}/lists/{direction}/{type}/{entry}",
      pathParams: ["pod_id", "direction", "type", "entry"],
      deleteIdFields: ["pod_id", "direction", "type", "entry"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "query_pod_metrics",
    description: "Query AgentMail metrics scoped to a pod.",
    inputSchema: metricsInputSchema("Query parameters for AgentMail pod metrics.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("AgentMail metrics response."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/metrics",
      pathParams: ["pod_id"],
      queryParams: ["event_types", "start", "end", "period", "limit", "descending"],
    },
  },
  {
    name: "list_pod_api_keys",
    description: "List AgentMail API keys scoped to a pod.",
    inputSchema: s.object(
      "Query parameters for listing AgentMail pod API keys.",
      {
        pod_id: podIdField,
        limit: limitField,
        page_token: pageTokenField,
      },
      { optional: ["limit", "page_token"] },
    ),
    outputSchema: looseResponseSchema("Response returned when listing AgentMail pod API keys."),
    operation: {
      method: "GET",
      path: "/v0/pods/{pod_id}/api-keys",
      pathParams: ["pod_id"],
      queryParams: ["limit", "page_token"],
    },
  },
  {
    name: "create_pod_api_key",
    description: "Create an API key scoped to a specific AgentMail pod.",
    inputSchema: createApiKeyInputSchema("Request payload for creating an AgentMail pod API key.", {
      pod_id: podIdField,
    }),
    outputSchema: looseResponseSchema("Response returned after creating an AgentMail pod API key."),
    operation: {
      method: "POST",
      path: "/v0/pods/{pod_id}/api-keys",
      pathParams: ["pod_id"],
      bodyFields: ["name", "permissions"],
    },
  },
  {
    name: "delete_pod_api_key",
    description: "Delete an API key scoped to a specific AgentMail pod.",
    inputSchema: s.object("Path parameters for deleting an AgentMail pod API key.", {
      pod_id: podIdField,
      api_key_id: apiKeyIdField,
    }),
    outputSchema: deleteOutputSchema(["pod_id", "api_key_id"]),
    operation: {
      method: "DELETE",
      path: "/v0/pods/{pod_id}/api-keys/{api_key_id}",
      pathParams: ["pod_id", "api_key_id"],
      deleteIdFields: ["pod_id", "api_key_id"],
      notFoundAsInvalidInput: true,
    },
  },
  {
    name: "get_organization",
    description: "Get the AgentMail organization available to the current API key.",
    inputSchema: emptyInputSchema,
    outputSchema: looseResponseSchema("AgentMail organization response."),
    operation: {
      method: "GET",
      path: "/v0/organizations",
    },
  },
  {
    name: "who_am_i",
    description: "Get AgentMail identity information for the current API key.",
    inputSchema: emptyInputSchema,
    outputSchema: looseResponseSchema("AgentMail authenticated identity response."),
    operation: {
      method: "GET",
      path: "/v0/auth/me",
    },
  },
] as const satisfies readonly AgentMailActionDefinition[];

export const agentMailActions: ActionDefinition[] = actionDefinitions.map((definition) =>
  defineProviderAction(service, {
    name: definition.name,
    description: definition.description,
    requiredScopes: [],
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
  }),
);

export const agentMailOperationByActionName = Object.fromEntries(
  actionDefinitions.map((definition) => [definition.name, definition.operation] as const),
) as Record<AgentMailActionName, AgentMailOperationDefinition>;

export type AgentMailActionName = (typeof actionDefinitions)[number]["name"];
