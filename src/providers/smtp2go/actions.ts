import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "smtp2go";

const emailAddressListSchema = (description: string) =>
  s.array(description, s.nonWhitespaceString("One email address or name/address pair accepted by SMTP2GO."), {
    minItems: 1,
    maxItems: 100,
  });

const customHeaderSchema = s.object("A custom email header object accepted by SMTP2GO.", {
  header: s.nonWhitespaceString("The custom header name."),
  value: s.string("The custom header value."),
});

const templateDataSchema = s.record(
  "The template variable values passed to SMTP2GO.",
  s.unknown("One template variable value."),
);

const smtp2goEventTypeSchema = s.stringEnum("One SMTP2GO activity event type.", [
  "processed",
  "soft-bounced",
  "hard-bounced",
  "rejected",
  "spam",
  "delivered",
  "unsubscribed",
  "resubscribed",
  "opened",
  "clicked",
]);

const rawDataSchema = s.looseObject("The raw data object returned by SMTP2GO.");
const looseItemSchema = s.looseObject("One object returned by SMTP2GO.");
const nullableContinueTokenSchema = s.nullable(
  s.string("The continuation token returned by SMTP2GO when another page is available."),
);

const requestIdSchema = s.string("The SMTP2GO request identifier.");

const sendEmailInputBaseSchema = s.object(
  "Input parameters for sending a standard email through SMTP2GO.",
  {
    sender: s.nonWhitespaceString("The name and email address to send from, such as Sender <sender@example.com>."),
    to: emailAddressListSchema("The email addresses to send to, up to 100 recipients."),
    cc: emailAddressListSchema("The email addresses to CC, up to 100 recipients."),
    bcc: emailAddressListSchema("The email addresses to BCC, up to 100 recipients."),
    subject: s.string("The subject of the email. If template_id is provided, SMTP2GO ignores this value."),
    html_body: s.string("The HTML email body. Either html_body or text_body is required when template_id is omitted."),
    text_body: s.string(
      "The plain-text email body. Either html_body or text_body is required when template_id is omitted.",
    ),
    custom_headers: s.array("Custom headers to add to the email.", customHeaderSchema, {
      minItems: 1,
    }),
    template_id: s.nonWhitespaceString("The SMTP2GO template ID to use for this send."),
    template_data: templateDataSchema,
    schedule: s.nonWhitespaceString("A future SMTP2GO schedule timestamp within the next three days."),
    fastaccept: s.boolean("Whether SMTP2GO should accept the email immediately and send it in the background."),
  },
  {
    optional: [
      "cc",
      "bcc",
      "subject",
      "html_body",
      "text_body",
      "custom_headers",
      "template_id",
      "template_data",
      "schedule",
      "fastaccept",
    ],
  },
);

const sendEmailInputSchema = sendEmailInputBaseSchema;

const sendEmailOutputSchema = s.object("The normalized SMTP2GO standard email send result.", {
  requestId: requestIdSchema,
  succeeded: s.integer("The number of recipients SMTP2GO accepted."),
  failed: s.integer("The number of recipients SMTP2GO rejected."),
  failures: s.array("Recipient failure objects returned by SMTP2GO.", looseItemSchema),
  emailId: s.nullable(s.string("The SMTP2GO email ID when present.")),
  scheduleId: s.nullable(s.string("The SMTP2GO schedule ID when the email was scheduled.")),
  data: rawDataSchema,
});

const emptyInputSchema = s.object("The empty input payload for this SMTP2GO action.", {});

const viewApiKeyPermissionsOutputSchema = s.object("The normalized SMTP2GO API key permissions response.", {
  requestId: requestIdSchema,
  permissions: s.array(
    "The SMTP2GO endpoint permissions available to the current API key.",
    s.string("One SMTP2GO endpoint path."),
  ),
  data: s.unknown("The raw permissions payload returned by SMTP2GO."),
});

const searchActivityInputSchema = s.object(
  "Input parameters for searching SMTP2GO activity events.",
  {
    start_date: s.string("The inclusive start datetime for the activity search."),
    end_date: s.string("The exclusive end datetime for the activity search."),
    search: s.string("A text search across SMTP2GO activity search fields."),
    search_email_id: s.string("The SMTP2GO email ID to search for."),
    search_subject: s.string("A subject search string."),
    search_sender: s.string("A sender search string."),
    search_recipient: s.string("A recipient search string."),
    search_usernames: s.array(
      "SMTP2GO usernames to include in the activity search.",
      s.nonWhitespaceString("One SMTP2GO username."),
      { minItems: 1 },
    ),
    subaccounts: s.array(
      "SMTP2GO subaccount IDs to include in the activity search.",
      s.nonWhitespaceString("One SMTP2GO subaccount ID."),
      { minItems: 1 },
    ),
    limit: s.integer("The maximum number of events to return.", {
      minimum: 1,
      maximum: 1000,
    }),
    continue_token: s.string("The continuation token from a previous activity search."),
    only_latest: s.boolean("Whether to return only the most recent event for each email."),
    only_latest_by_sent: s.boolean("Whether to return the most recent event for each email ordered by sent date."),
    event_types: s.array("SMTP2GO event types used to filter activity results.", smtp2goEventTypeSchema, {
      minItems: 1,
    }),
    include_headers: s.boolean("Whether to include full email headers in returned events."),
    custom_headers: s.array(
      "Custom header names to extract from returned raw headers.",
      s.nonWhitespaceString("One custom header name."),
      { minItems: 1 },
    ),
    region: s.stringEnum("The SMTP2GO activity region to query.", ["us", "eu", "au"]),
  },
  {
    optional: [
      "start_date",
      "end_date",
      "search",
      "search_email_id",
      "search_subject",
      "search_sender",
      "search_recipient",
      "search_usernames",
      "subaccounts",
      "limit",
      "continue_token",
      "only_latest",
      "only_latest_by_sent",
      "event_types",
      "include_headers",
      "custom_headers",
      "region",
    ],
  },
);

const searchActivityOutputSchema = s.object("The normalized SMTP2GO activity search result.", {
  requestId: requestIdSchema,
  events: s.array("The SMTP2GO activity events returned for this page.", looseItemSchema),
  totalEvents: s.integer("The total number of matching events reported by SMTP2GO."),
  continueToken: nullableContinueTokenSchema,
  data: rawDataSchema,
});

const emailSummaryInputSchema = s.object(
  "Input parameters for retrieving an SMTP2GO email summary.",
  {
    username: s.string("The optional SMTP2GO username to return statistics for."),
  },
  { optional: ["username"] },
);

const emailSummaryOutputSchema = s.object("The normalized SMTP2GO email summary result.", {
  requestId: requestIdSchema,
  summary: rawDataSchema,
  data: rawDataSchema,
});

const senderDomainInputSchema = s.object(
  "Input parameters for listing SMTP2GO sender domains.",
  {
    domain: s.string("Only return records for this sender domain."),
    subaccount_id: s.string("The subaccount ID to query on behalf of."),
  },
  { optional: ["domain", "subaccount_id"] },
);

const senderDomainOutputSchema = s.object("The normalized SMTP2GO sender domain list.", {
  requestId: requestIdSchema,
  domains: s.array("The sender domain records returned by SMTP2GO.", looseItemSchema),
  data: rawDataSchema,
});

const singleSenderInputSchema = s.object(
  "Input parameters for listing SMTP2GO single sender emails.",
  {
    email_address: s.string("Only return single sender emails matching this address."),
    subaccount_id: s.string("The subaccount ID to query on behalf of."),
  },
  { optional: ["email_address", "subaccount_id"] },
);

const singleSenderOutputSchema = s.object("The normalized SMTP2GO single sender email list.", {
  requestId: requestIdSchema,
  senders: s.array("The single sender email records returned by SMTP2GO.", looseItemSchema),
  data: rawDataSchema,
});

const searchEmailTemplatesInputSchema = s.object(
  "Input parameters for searching SMTP2GO email templates.",
  {
    fuzzy_search: s.boolean("Whether search terms should use wildcard matching."),
    search_terms: s.array(
      "Template search terms matched against name, tag, ID, or subject.",
      s.nonWhitespaceString("One template search term."),
      { minItems: 1 },
    ),
    tags: s.array("Template tags used to filter results.", s.nonWhitespaceString("One template tag."), { minItems: 1 }),
    sort_direction: s.stringEnum("The template sort direction.", ["asc", "desc"]),
    page_size: s.integer("The maximum number of templates to return.", {
      minimum: 1,
    }),
    continue_token: s.string("The continuation token from a previous template search."),
  },
  {
    optional: ["fuzzy_search", "search_terms", "tags", "sort_direction", "page_size", "continue_token"],
  },
);

const searchEmailTemplatesOutputSchema = s.object("The normalized SMTP2GO email template search result.", {
  requestId: requestIdSchema,
  templates: s.array("The SMTP2GO templates returned for this page.", looseItemSchema),
  totalCount: s.integer("The total number of matching templates reported by SMTP2GO."),
  continueToken: nullableContinueTokenSchema,
  data: rawDataSchema,
});

const getEmailTemplateInputSchema = s.object(
  "Input parameters for viewing an SMTP2GO template.",
  {
    id: s.nonWhitespaceString("The case-sensitive SMTP2GO email template ID."),
  },
  { required: ["id"] },
);

const getEmailTemplateOutputSchema = s.object("The normalized SMTP2GO email template detail.", {
  requestId: requestIdSchema,
  template: rawDataSchema,
  data: rawDataSchema,
});

export const smtp2goActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_email",
    description: "Send a standard JSON email through SMTP2GO without Base64 attachments or inline files.",
    requiredScopes: [],
    inputSchema: sendEmailInputSchema,
    outputSchema: sendEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_activity",
    description: "Search SMTP2GO email activity events with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: searchActivityInputSchema,
    outputSchema: searchActivityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_email_summary",
    description: "Retrieve SMTP2GO account email statistics and current sending cycle summary.",
    requiredScopes: [],
    inputSchema: emailSummaryInputSchema,
    outputSchema: emailSummaryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "view_api_key_permissions",
    description: "List the SMTP2GO API endpoint permissions available to the connected API key.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: viewApiKeyPermissionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sender_domains",
    description: "List SMTP2GO sender domains and their verification metadata.",
    requiredScopes: [],
    inputSchema: senderDomainInputSchema,
    outputSchema: senderDomainOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_single_sender_emails",
    description: "List SMTP2GO single sender email addresses and verification status.",
    requiredScopes: [],
    inputSchema: singleSenderInputSchema,
    outputSchema: singleSenderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_email_templates",
    description: "Search SMTP2GO email templates by terms, tags, sorting, and pagination.",
    requiredScopes: [],
    inputSchema: searchEmailTemplatesInputSchema,
    outputSchema: searchEmailTemplatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_email_template",
    description: "Retrieve details for a single SMTP2GO email template by ID.",
    requiredScopes: [],
    inputSchema: getEmailTemplateInputSchema,
    outputSchema: getEmailTemplateOutputSchema,
  }),
];
