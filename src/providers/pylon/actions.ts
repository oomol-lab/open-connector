import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pylon" as const;

const trimmedString = (description: string) => s.string(description, { minLength: 1 });

const cursorSchema = trimmedString("The pagination cursor returned by a previous Pylon request.");
const requestIdSchema = s.nullable(s.string("The Pylon request ID for tracking this API call."));
const pylonRawObjectSchema = s.looseObject("The raw object returned by Pylon.");
const pylonRawObjectArraySchema = s.array("The raw objects returned by Pylon.", pylonRawObjectSchema);

const paginationSchema = s.object("Cursor pagination metadata returned by Pylon.", {
  cursor: s.string("The cursor for the next page of results."),
  has_next_page: s.boolean("Whether another page of results is available."),
});

const customFieldValueSchema = s.object(
  "A Pylon custom field value.",
  {
    slug: trimmedString("The slug of the custom field."),
    value: trimmedString(
      "The single value for the custom field. For select or relationship fields, use the option slug or related object ID.",
    ),
    values: s.array(
      "The values for a multi-valued custom field, such as a multiselect field.",
      trimmedString("A custom field value."),
    ),
  },
  { optional: ["value", "values"] },
);

const customFieldValuesSchema = s.array("Custom field values to apply to the Pylon object.", customFieldValueSchema);

const destinationMetadataSchema = s.object(
  "Delivery metadata for a newly created Pylon issue.",
  {
    destination: s.stringEnum("How Pylon should deliver the initial issue message.", [
      "slack",
      "email",
      "in_app_chat",
      "internal",
      "sms",
      "whatsapp",
    ]),
    email: trimmedString("The configured email address used to send email to the requester."),
    email_ccs: s.array("Email addresses to CC on the message.", s.email("A CC email address.")),
    email_bccs: s.array("Email addresses to BCC on the message.", s.email("A BCC email address.")),
    chat_widget_app_id: trimmedString("The chat widget app ID used for in-app chat delivery."),
    from_sms_phone_number_id: trimmedString("The Telnyx phone number ID used for SMS delivery."),
    whatsapp_app_id: trimmedString("The WhatsApp app ID used for WhatsApp delivery."),
    whatsapp_message_template_language: trimmedString("The WhatsApp message template language."),
    whatsapp_message_template_name: trimmedString("The WhatsApp message template name."),
  },
  {
    optional: [
      "destination",
      "email",
      "email_ccs",
      "email_bccs",
      "chat_widget_app_id",
      "from_sms_phone_number_id",
      "whatsapp_app_id",
      "whatsapp_message_template_language",
      "whatsapp_message_template_name",
    ],
  },
);

const externalIdSchema = s.object("An external ID associated with a Pylon account or contact.", {
  external_id: trimmedString("The external ID. It must be unique for the object type."),
  label: trimmedString("The label for this external ID. It must be unique on the object."),
});

const filterValueSchema = s.anyOf("A value used in a Pylon search filter.", [
  s.string("A string filter value."),
  s.number("A numeric filter value."),
  s.boolean("A boolean filter value."),
  { type: "null", description: "A null filter value." },
]);

const filterSchema = s.looseObject("A Pylon search filter object.", {
  field: trimmedString("The Pylon field to filter on."),
  operator: s.stringEnum("The Pylon filter operator.", [
    "equals",
    "not_equals",
    "contains",
    "does_not_contain",
    "in",
    "not_in",
    "and",
    "or",
    "time_is_after",
    "time_is_before",
    "time_range",
    "string_contains",
    "string_does_not_contain",
    "is_set",
    "is_unset",
    "greater_than",
    "less_than",
    "greater_than_or_equals",
    "less_than_or_equals",
  ]),
  value: filterValueSchema,
  values: s.array("Multiple values for an in-style Pylon search filter.", filterValueSchema),
  filters: s.array("Nested filters for compound and/or search filters.", s.looseObject("A nested Pylon filter.")),
});

const externalIdsSchema = s.array("External IDs associated with the object.", externalIdSchema);
const tagsSchema = s.array("Tags to set on the Pylon object.", trimmedString("A Pylon tag."));
const urlArraySchema = s.array(
  "Publicly reachable attachment URLs for Pylon to fetch and attach.",
  s.url("A publicly reachable attachment URL."),
);

const meSchema = s.object("A Pylon organization returned by the /me endpoint.", {
  id: s.string("The Pylon organization ID."),
  name: s.string("The Pylon organization name."),
});

const accountSchema = s.looseObject("A Pylon account.", {
  id: s.string("The Pylon account ID."),
  name: s.string("The account name."),
  primary_domain: s.string("The account's primary domain."),
  domains: s.array("Domains associated with the account.", s.string("An account domain.")),
  tags: s.array("Tags associated with the account.", s.string("An account tag.")),
  type: s.string("The account type."),
  created_at: s.string("The time when the account was created."),
  updated_at: s.string("The time when the account was last updated."),
});

const contactSchema = s.looseObject("A Pylon contact.", {
  id: s.string("The Pylon contact ID."),
  name: s.string("The contact name."),
  email: s.string("The contact's primary email address."),
  emails: s.array("All email addresses for the contact.", s.string("A contact email address.")),
  phone_numbers: s.array("Phone numbers for the contact.", s.string("A contact phone number.")),
  account: s.looseObject("The account associated with the contact."),
});

const issueSchema = s.looseObject("A Pylon issue.", {
  id: s.string("The Pylon issue ID."),
  number: s.integer("The Pylon issue number."),
  title: s.string("The issue title."),
  body_html: s.string("The issue body in HTML."),
  state: s.string("The current issue state or custom status slug."),
  type: s.stringEnum("The issue type.", ["conversation", "ticket"]),
  link: s.string("The link to the issue in Pylon."),
  created_at: s.string("The time when the issue was created."),
  updated_at: s.string("The time when the issue was last updated."),
});

const messageSchema = s.looseObject("A Pylon issue message.", {
  id: s.string("The Pylon message ID."),
  message_html: s.string("The message body in HTML."),
  is_private: s.boolean("Whether this message is private."),
  source: s.string("The message source."),
  timestamp: s.string("The time when the message was created."),
});

const noteResultSchema = s.object("The Pylon message identifiers returned after creating a note.", {
  id: s.string("The ID of the created message."),
  issue_id: s.string("The ID of the issue that received the note."),
});

const getMeAction = defineProviderAction(service, {
  name: "get_me",
  description: "Fetch the Pylon organization associated with the API token.",
  requiredScopes: [],
  inputSchema: s.object("Input for fetching the Pylon organization.", {}),
  outputSchema: s.object("The organization returned by Pylon.", {
    request_id: requestIdSchema,
    organization: meSchema,
  }),
});

const listIssuesAction = defineProviderAction(service, {
  name: "list_issues",
  description: "List Pylon issues within a required time range of up to 30 days.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for listing Pylon issues. The runtime rejects ranges where start_time is after end_time or the range exceeds 30 days.",
    {
      start_time: s.dateTime("The start time of the issue range in RFC3339 format."),
      end_time: s.dateTime("The end time of the issue range in RFC3339 format."),
      cursor: cursorSchema,
      limit: s.integer("The number of issues to fetch. Pylon accepts 0 through 20000.", {
        minimum: 0,
        maximum: 20000,
      }),
    },
    { optional: ["cursor", "limit"] },
  ),
  outputSchema: s.object("The paginated issues returned by Pylon.", {
    request_id: requestIdSchema,
    pagination: s.nullable(paginationSchema),
    issues: s.array("The issues returned by Pylon.", issueSchema),
  }),
});

const getIssueAction = defineProviderAction(service, {
  name: "get_issue",
  description: "Fetch one Pylon issue by ID or issue number.",
  requiredScopes: [],
  inputSchema: s.object("Input for fetching one Pylon issue.", {
    id: trimmedString("The Pylon issue ID or issue number."),
  }),
  outputSchema: s.object("The issue returned by Pylon.", {
    request_id: requestIdSchema,
    issue: issueSchema,
  }),
});

const createIssueAction = defineProviderAction(service, {
  name: "create_issue",
  description: "Create a Pylon issue with a title, HTML body, and requester or account context.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for creating a Pylon issue.",
    {
      title: trimmedString("The issue title."),
      body_html: trimmedString("The HTML content of the issue body."),
      account_id: trimmedString("The account this issue belongs to."),
      requester_id: trimmedString("The contact this issue is on behalf of."),
      requester_email: s.email("The requester email address. Pylon creates a contact when none exists."),
      requester_name: trimmedString("The full name to use when creating a requester contact."),
      requester_avatar_url: s.url("The requester avatar URL."),
      user_id: trimmedString("The internal user to attribute the first message to."),
      contact_id: trimmedString("The contact to attribute the first message to."),
      assignee_id: trimmedString("The user the issue should be assigned to."),
      team_id: trimmedString("The team the issue should be assigned to."),
      priority: s.stringEnum("The issue priority.", ["urgent", "high", "medium", "low"]),
      tags: tagsSchema,
      attachment_urls: urlArraySchema,
      author_unverified: s.boolean("Whether the requester's identity has not been verified."),
      created_at: s.dateTime("The issue creation timestamp in RFC3339 format."),
      custom_fields: customFieldValuesSchema,
      destination_metadata: destinationMetadataSchema,
    },
    {
      optional: [
        "account_id",
        "requester_id",
        "requester_email",
        "requester_name",
        "requester_avatar_url",
        "user_id",
        "contact_id",
        "assignee_id",
        "team_id",
        "priority",
        "tags",
        "attachment_urls",
        "author_unverified",
        "created_at",
        "custom_fields",
        "destination_metadata",
      ],
    },
  ),
  outputSchema: s.object("The created issue returned by Pylon.", {
    request_id: requestIdSchema,
    issue: issueSchema,
  }),
});

const updateIssueAction = defineProviderAction(service, {
  name: "update_issue",
  description: "Update mutable fields on one Pylon issue by ID or issue number.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for updating a Pylon issue. The runtime requires at least one mutable issue field.",
    {
      id: trimmedString("The Pylon issue ID or issue number."),
      title: trimmedString("The updated issue title."),
      state: trimmedString("The new issue state or custom status slug."),
      type: s.stringEnum("The updated issue type.", ["conversation", "ticket"]),
      account_id: trimmedString("The account this issue belongs to."),
      requester_id: trimmedString("The contact this issue is on behalf of."),
      assignee_id: s.string("The user to assign this issue to. Use an empty string to remove the assignee."),
      team_id: s.string("The team to assign this issue to. Use an empty string to remove the team."),
      customer_portal_visible: s.boolean("Whether the issue should be visible in the customer portal."),
      tags: tagsSchema,
      custom_fields: customFieldValuesSchema,
    },
    {
      optional: [
        "title",
        "state",
        "type",
        "account_id",
        "requester_id",
        "assignee_id",
        "team_id",
        "customer_portal_visible",
        "tags",
        "custom_fields",
      ],
    },
  ),
  outputSchema: s.object("The updated issue returned by Pylon.", {
    request_id: requestIdSchema,
    issue: issueSchema,
  }),
});

const listIssueMessagesAction = defineProviderAction(service, {
  name: "list_issue_messages",
  description: "List messages, replies, and internal notes on one Pylon issue.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for listing Pylon issue messages.",
    {
      id: trimmedString("The Pylon issue ID."),
      cursor: cursorSchema,
      limit: s.integer("The number of messages to fetch. Pylon accepts values from 1 through 1000.", {
        minimum: 1,
        maximum: 1000,
      }),
    },
    { optional: ["cursor", "limit"] },
  ),
  outputSchema: s.object("The paginated messages returned by Pylon.", {
    request_id: requestIdSchema,
    pagination: s.nullable(paginationSchema),
    messages: s.array("The issue messages returned by Pylon.", messageSchema),
  }),
});

const createIssueNoteAction = defineProviderAction(service, {
  name: "create_issue_note",
  description: "Create an internal note on a Pylon issue.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for creating a Pylon internal issue note.",
    {
      id: trimmedString("The Pylon issue ID."),
      body_html: trimmedString("The HTML body of the internal note."),
      attachment_urls: urlArraySchema,
      message_id: trimmedString("The internal note message ID to reply to."),
      thread_id: trimmedString("The internal thread ID to post the note to."),
      thread_name: trimmedString("The thread name to use if Pylon creates a new internal thread."),
      user_id: trimmedString("The internal user ID to post the note as."),
    },
    { optional: ["attachment_urls", "message_id", "thread_id", "thread_name", "user_id"] },
  ),
  outputSchema: s.object("The created note returned by Pylon.", {
    request_id: requestIdSchema,
    note: noteResultSchema,
  }),
});

const getAccountAction = defineProviderAction(service, {
  name: "get_account",
  description: "Fetch one Pylon account by account ID or external ID.",
  requiredScopes: [],
  inputSchema: s.object("Input for fetching one Pylon account.", {
    id: trimmedString("The Pylon account ID or external ID."),
  }),
  outputSchema: s.object("The account returned by Pylon.", {
    request_id: requestIdSchema,
    account: accountSchema,
  }),
});

const searchAccountsAction = defineProviderAction(service, {
  name: "search_accounts",
  description: "Search Pylon accounts with a filter and optional fuzzy text search.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for searching Pylon accounts.",
    {
      filter: filterSchema,
      search_text: trimmedString("Fuzzy text search intersected with the provided account filter."),
      cursor: cursorSchema,
      limit: s.integer("The number of accounts to fetch. Pylon accepts values from 1 through 999.", {
        minimum: 1,
        maximum: 999,
      }),
    },
    { optional: ["search_text", "cursor", "limit"] },
  ),
  outputSchema: s.object("The paginated accounts returned by Pylon.", {
    request_id: requestIdSchema,
    pagination: s.nullable(paginationSchema),
    accounts: s.array("The accounts returned by Pylon.", accountSchema),
  }),
});

const createAccountAction = defineProviderAction(service, {
  name: "create_account",
  description: "Create a Pylon account.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for creating a Pylon account.",
    {
      name: trimmedString("The account name."),
      account_type: s.stringEnum("The account type.", ["customer", "internal", "community", "partner"]),
      domains: s.array("Domains for the account, without a leading scheme.", trimmedString("An account domain.")),
      primary_domain: trimmedString("The primary domain, which must be included in domains when domains are provided."),
      external_ids: externalIdsSchema,
      tags: tagsSchema,
      owner_id: trimmedString("The user ID of the account owner."),
      logo_url: s.url("The square .png, .jpg, or .jpeg logo URL for the account."),
      custom_fields: customFieldValuesSchema,
    },
    {
      optional: [
        "account_type",
        "domains",
        "primary_domain",
        "external_ids",
        "tags",
        "owner_id",
        "logo_url",
        "custom_fields",
      ],
    },
  ),
  outputSchema: s.object("The created account returned by Pylon.", {
    request_id: requestIdSchema,
    account: accountSchema,
  }),
});

const getContactAction = defineProviderAction(service, {
  name: "get_contact",
  description: "Fetch one Pylon contact by contact ID with optional paginated account context.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for fetching one Pylon contact.",
    {
      id: trimmedString("The Pylon contact ID."),
      cursor: cursorSchema,
      limit: s.integer(
        "The number of related accounts to fetch. Pylon requires this query value and accepts values from 1 through 999.",
        {
          minimum: 1,
          maximum: 999,
        },
      ),
    },
    { optional: ["cursor"] },
  ),
  outputSchema: s.object("The contact returned by Pylon.", {
    request_id: requestIdSchema,
    pagination: s.nullable(paginationSchema),
    contact: contactSchema,
  }),
});

const searchContactsAction = defineProviderAction(service, {
  name: "search_contacts",
  description: "Search Pylon contacts with a filter and optional fuzzy text search.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for searching Pylon contacts.",
    {
      filter: filterSchema,
      search_text: trimmedString("Fuzzy text search intersected with the provided contact filter."),
      cursor: cursorSchema,
      limit: s.integer("The number of contacts to fetch. Pylon accepts values from 1 through 999.", {
        minimum: 1,
        maximum: 999,
      }),
    },
    { optional: ["search_text", "cursor", "limit"] },
  ),
  outputSchema: s.object("The paginated contacts returned by Pylon.", {
    request_id: requestIdSchema,
    pagination: s.nullable(paginationSchema),
    contacts: s.array("The contacts returned by Pylon.", contactSchema),
  }),
});

const createContactAction = defineProviderAction(service, {
  name: "create_contact",
  description: "Create a Pylon contact.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for creating a Pylon contact.",
    {
      name: trimmedString("The contact name."),
      email: s.email("The contact email address."),
      account_id: trimmedString("The account that this contact belongs to."),
      account_external_id: trimmedString("The external ID of the account that this contact belongs to."),
      avatar_url: s.url("The square .png, .jpg, or .jpeg avatar URL for the contact."),
      external_ids: externalIdsSchema,
      phone_numbers: s.array(
        "Phone numbers for the contact. Pylon expects digits only and at most 15 digits.",
        trimmedString("A contact phone number."),
      ),
      primary_phone_number: trimmedString("The primary phone number, which must be in phone_numbers."),
      portal_role: trimmedString("The portal role slug to assign to the contact."),
      portal_role_id: trimmedString("The custom portal role ID to assign to the contact."),
      custom_fields: customFieldValuesSchema,
    },
    {
      optional: [
        "email",
        "account_id",
        "account_external_id",
        "avatar_url",
        "external_ids",
        "phone_numbers",
        "primary_phone_number",
        "portal_role",
        "portal_role_id",
        "custom_fields",
      ],
    },
  ),
  outputSchema: s.object("The created contact returned by Pylon.", {
    request_id: requestIdSchema,
    contact: contactSchema,
  }),
});

export const pylonActions: ProviderActionDefinition[] = [
  getMeAction,
  listIssuesAction,
  getIssueAction,
  createIssueAction,
  updateIssueAction,
  listIssueMessagesAction,
  createIssueNoteAction,
  getAccountAction,
  searchAccountsAction,
  createAccountAction,
  getContactAction,
  searchContactsAction,
  createContactAction,
];

export const pylonRawObjectOutputSchema: JsonSchema = pylonRawObjectSchema;
export const pylonRawObjectArrayOutputSchema: JsonSchema = pylonRawObjectArraySchema;
