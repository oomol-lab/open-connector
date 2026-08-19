import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailgun" as const;

const domain = s.nonEmptyString("Mailgun sending domain name.");
const templateName = s.nonEmptyString("Mailgun template name.");
const versionName = s.nonEmptyString("Mailgun template version tag.");
const pageDirection = s.stringEnum("Mailgun page direction.", ["first", "last", "next", "previous"]);
const suppressionKind = s.stringEnum("Suppression table to operate on.", [
  "bounce",
  "complaint",
  "unsubscribe",
  "allowlist",
]);
const eventType = s.stringEnum("Mailgun event type filter.", [
  "accepted",
  "delivered",
  "failed",
  "rejected",
  "clicked",
  "opened",
  "unsubscribed",
  "stored",
  "complained",
  "email_validation",
  "list_member_uploaded",
  "list_member_upload_error",
  "list_uploaded",
]);
const yesNo = s.stringEnum("Mailgun yes/no option value.", ["yes", "no"]);
const yesNoBooleanString = s.stringEnum("Mailgun yes/no or boolean string option value.", [
  "yes",
  "no",
  "true",
  "false",
]);
const tracking = s.stringEnum("Mailgun tracking option value.", ["yes", "no", "true", "false", "htmlonly"]);
const eventSeverity = s.stringEnum("Failure severity filter for failed events.", ["temporary", "permanent"]);
const stringRecord = s.record("String map forwarded to Mailgun.", s.string("Map value."));
const looseObject = s.looseObject("Object returned by Mailgun.");
const paging = s.looseObject("Paging links returned by Mailgun.");

const listOutputSchema = s.object(
  "Paginated response returned by Mailgun.",
  {
    items: s.array("Items returned by Mailgun.", looseObject),
    paging,
    raw: looseObject,
  },
  { optional: ["paging"] },
);
const messageOutputSchema = s.object("Message response returned by Mailgun.", {
  id: s.nullableString("Mailgun message identifier."),
  message: s.nullableString("Mailgun status message."),
  raw: looseObject,
});
const genericMessageOutputSchema = s.object("Generic mutation response returned by Mailgun.", {
  message: s.nullableString("Mailgun status message."),
  raw: looseObject,
});
const domainInputSchema = s.object("Path parameters for a Mailgun domain.", {
  domain,
});
const domainTrackingOutputSchema = s.object("Mailgun domain tracking settings response.", {
  tracking: looseObject,
  raw: looseObject,
});
const trackingMutationOutputSchema = s.object("Mailgun domain tracking mutation response.", {
  message: s.nullableString("Mailgun status message."),
  raw: looseObject,
});
const updateDomainTrackingOutputSchema = s.object(
  "Responses from updated Mailgun domain tracking settings.",
  {
    open: trackingMutationOutputSchema,
    click: trackingMutationOutputSchema,
    unsubscribe: trackingMutationOutputSchema,
  },
  { optional: ["open", "click", "unsubscribe"] },
);

const listDomainsInputSchema = s.object(
  "Query parameters for listing Mailgun domains.",
  {
    limit: s.integer("Maximum number of domains to return. Mailgun allows up to 1000.", {
      minimum: 1,
      maximum: 1000,
    }),
    skip: s.nonNegativeInteger("Number of domains to skip before returning results."),
    state: s.stringEnum("Domain state filter.", ["active", "unverified", "disabled"]),
    sort: s.nonEmptyString("Sort option such as name, name:asc, or name:desc."),
    authority: s.nonEmptyString("Authority filter for domains."),
    search: s.nonEmptyString("Partial or complete domain name to search for."),
    includeSubaccounts: s.boolean("Whether to include domains from subaccounts."),
  },
  { optional: ["limit", "skip", "state", "sort", "authority", "search", "includeSubaccounts"] },
);

const sendEmailInputSchema: JsonSchema = s.object(
  "Input parameters for sending an email through Mailgun.",
  {
    domain,
    from: s.nonEmptyString("Email address for the From header. Friendly name format is supported."),
    to: s.array(
      "Primary recipients. Mailgun accepts email addresses or friendly name strings.",
      s.nonEmptyString("Recipient email address or friendly name string."),
      { minItems: 1 },
    ),
    cc: s.array(
      "Carbon copy recipients.",
      s.nonEmptyString("Carbon copy recipient email address or friendly name string."),
    ),
    bcc: s.array(
      "Blind carbon copy recipients.",
      s.nonEmptyString("Blind carbon copy recipient email address or friendly name string."),
    ),
    subject: s.nonEmptyString("Message subject line."),
    text: s.nonEmptyString("Plain text message body."),
    html: s.nonEmptyString("HTML message body."),
    ampHtml: s.nonEmptyString("AMP HTML message body."),
    template: s.nonEmptyString("Stored Mailgun template name to render for this email."),
    templateVersion: s.nonEmptyString("Template version tag to render."),
    templateText: s.boolean("Whether Mailgun should generate a text part from the template."),
    templateVariables: s.record(
      "Template variables encoded into Mailgun t:variables.",
      s.unknown("Template variable value."),
    ),
    recipientVariables: s.record(
      "Recipient variables for Mailgun batch sending.",
      s.looseObject("Variables for one recipient."),
    ),
    tags: s.stringArray("Mailgun tags attached to the message.", { itemDescription: "Mailgun tag." }),
    headers: stringRecord,
    variables: s.record(
      "Custom Mailgun user variables stored with events and webhooks.",
      s.unknown("Custom variable value."),
    ),
    deliveryTime: s.nonEmptyString("Scheduled delivery time in RFC 2822 format."),
    deliverWithin: s.nonEmptyString("Maximum delivery window such as 1h30m or 24h."),
    testMode: s.boolean("Whether to send in Mailgun test mode."),
    dkim: yesNoBooleanString,
    tracking,
    trackingClicks: tracking,
    trackingOpens: yesNoBooleanString,
    requireTls: s.boolean("Whether Mailgun must deliver only over TLS."),
    skipVerification: s.boolean("Whether Mailgun should skip MX TLS certificate verification."),
    sendingIp: s.nonEmptyString("Dedicated sending IP address to use."),
    sendingIpPool: s.nonEmptyString("Dedicated IP pool ID to use."),
  },
  {
    optional: [
      "from",
      "cc",
      "bcc",
      "subject",
      "text",
      "html",
      "ampHtml",
      "template",
      "templateVersion",
      "templateText",
      "templateVariables",
      "recipientVariables",
      "tags",
      "headers",
      "variables",
      "deliveryTime",
      "deliverWithin",
      "testMode",
      "dkim",
      "tracking",
      "trackingClicks",
      "trackingOpens",
      "requireTls",
      "skipVerification",
      "sendingIp",
      "sendingIpPool",
    ],
  },
);
sendEmailInputSchema.allOf = [
  { anyOf: [{ required: ["text"] }, { required: ["html"] }, { required: ["ampHtml"] }, { required: ["template"] }] },
  { anyOf: [{ required: ["template"] }, { required: ["from"] }] },
  { anyOf: [{ required: ["template"] }, { required: ["subject"] }] },
];

const listEventsInputSchema = s.object(
  "Query parameters for listing Mailgun events for a domain.",
  {
    domain,
    begin: s.nonEmptyString("Beginning of the event search range in epoch seconds."),
    end: s.nonEmptyString("End of the event search range in epoch seconds."),
    ascending: yesNo,
    limit: s.integer("Maximum number of events to return. Mailgun allows up to 300.", {
      minimum: 1,
      maximum: 300,
    }),
    event: eventType,
    severity: eventSeverity,
    recipient: s.nonEmptyString("Filter by recipient email address."),
    from: s.nonEmptyString("Filter by From header email address."),
    to: s.nonEmptyString("Filter by To header email address."),
    subject: s.nonEmptyString("Filter by subject line."),
    messageId: s.nonEmptyString("Filter by Mailgun message id."),
    tags: s.nonEmptyString("Filter by user-defined tags."),
  },
  {
    optional: [
      "begin",
      "end",
      "ascending",
      "limit",
      "event",
      "severity",
      "recipient",
      "from",
      "to",
      "subject",
      "messageId",
      "tags",
    ],
  },
);

const suppressionListInputSchema = s.object(
  "Query parameters for listing a Mailgun suppression table.",
  {
    domain,
    kind: suppressionKind,
    limit: s.integer("Maximum number of suppression records to return.", { minimum: 1, maximum: 1000 }),
    page: s.stringEnum("Suppression page direction.", ["next", "previous", "last"]),
    address: s.nonEmptyString("Address divider for paginated suppression responses."),
    term: s.nonEmptyString("Prefix used to filter suppression records."),
  },
  { optional: ["limit", "page", "address", "term"] },
);

const suppressionLookupInputSchema = s.object(
  "Path parameters for looking up or removing one Mailgun suppression record.",
  {
    domain,
    kind: suppressionKind,
    value: s.nonEmptyString("Suppressed email address or allowlist entry value."),
  },
);

const addSuppressionInputSchema: JsonSchema = s.object(
  "Input parameters for adding one Mailgun suppression or allowlist record.",
  {
    domain,
    kind: suppressionKind,
    address: s.email("Suppressed email address."),
    allowlistDomain: s.nonEmptyString("Domain value to add to the Mailgun allowlist."),
    code: s.nonEmptyString("Bounce error code. Defaults to Mailgun's value when omitted."),
    error: s.nonEmptyString("Bounce error description."),
    tags: s.nonEmptyString("Unsubscribe tag, or * for all domain correspondence."),
    createdAt: s.nonEmptyString("Event timestamp in RFC 2822 format."),
  },
  { optional: ["address", "allowlistDomain", "code", "error", "tags", "createdAt"] },
);
addSuppressionInputSchema.allOf = [
  {
    if: { properties: { kind: { const: "allowlist" } }, required: ["kind"] },
    then: { anyOf: [{ required: ["address"] }, { required: ["allowlistDomain"] }] },
  },
  {
    if: { properties: { kind: { enum: ["bounce", "complaint", "unsubscribe"] } }, required: ["kind"] },
    then: { required: ["address"] },
  },
];

const templateListInputSchema = s.object(
  "Query parameters for listing Mailgun templates.",
  {
    domain,
    page: pageDirection,
    limit: s.integer("Number of templates or versions to retrieve. Mailgun allows up to 100.", {
      minimum: 1,
      maximum: 100,
    }),
    pivot: s.nonEmptyString("Pivot value used by Mailgun for next or previous pages."),
  },
  { optional: ["page", "limit", "pivot"] },
);

const getTemplateInputSchema = s.object(
  "Path parameters for fetching one Mailgun template.",
  {
    domain,
    templateName,
    active: s.boolean("Whether to include the active template version content."),
  },
  { optional: ["active"] },
);

const getTemplateVersionInputSchema = s.object("Path parameters for fetching one Mailgun template version.", {
  domain,
  templateName,
  versionName,
});

const createTemplateInputSchema = s.object(
  "Input parameters for creating a Mailgun template.",
  {
    domain,
    name: templateName,
    description: s.nonEmptyString("Template description."),
    createdBy: s.nonEmptyString("Optional creator metadata stored by Mailgun."),
    template: s.nonEmptyString("Initial template content."),
    tag: s.nonEmptyString("Initial version tag. Mailgun defaults to initial when omitted."),
    comment: s.nonEmptyString("Initial version comment."),
    headers: stringRecord,
  },
  { optional: ["description", "createdBy", "template", "tag", "comment", "headers"] },
);

const createTemplateVersionInputSchema = s.object(
  "Input parameters for creating a Mailgun template version.",
  {
    domain,
    templateName,
    template: s.nonEmptyString("Template version content."),
    tag: s.nonEmptyString("Unique tag for the new template version."),
    comment: s.nonEmptyString("Comment for the new template version."),
    active: s.boolean("Whether the new version should become active."),
    headers: stringRecord,
  },
  { optional: ["comment", "active", "headers"] },
);

const updateDomainTrackingInputSchema: JsonSchema = s.object(
  "Input parameters for updating Mailgun domain tracking settings.",
  {
    domain,
    open: s.object(
      "Open tracking settings to update.",
      {
        active: s.boolean("Whether open tracking should be active."),
        placeAtTheTop: s.boolean("Whether to place the open tracking pixel at the top."),
      },
      { optional: ["active", "placeAtTheTop"] },
    ),
    click: s.object(
      "Click tracking settings to update.",
      {
        active: s.stringEnum("Click tracking state.", ["true", "false", "htmlonly"]),
      },
      { optional: ["active"] },
    ),
    unsubscribe: s.object(
      "Unsubscribe tracking settings to update.",
      {
        active: s.boolean("Whether unsubscribe tracking should be active."),
        htmlFooter: s.nonEmptyString("HTML unsubscribe footer content."),
        textFooter: s.nonEmptyString("Plain text unsubscribe footer content."),
      },
      { optional: ["active", "htmlFooter", "textFooter"] },
    ),
  },
  { optional: ["open", "click", "unsubscribe"] },
);
updateDomainTrackingInputSchema.anyOf = [
  { required: ["open"], properties: { open: { anyOf: [{ required: ["active"] }, { required: ["placeAtTheTop"] }] } } },
  { required: ["click"], properties: { click: { required: ["active"] } } },
  {
    required: ["unsubscribe"],
    properties: {
      unsubscribe: { anyOf: [{ required: ["active"] }, { required: ["htmlFooter"] }, { required: ["textFooter"] }] },
    },
  },
];

const listTemplateVersionsInputSchema = s.object(
  "Query parameters for listing Mailgun template versions.",
  {
    domain,
    templateName,
    page: pageDirection,
    limit: s.integer("Number of template versions to retrieve. Mailgun allows up to 100.", {
      minimum: 1,
      maximum: 100,
    }),
    pivot: s.nonEmptyString("Pivot value used by Mailgun for next or previous pages."),
  },
  { optional: ["page", "limit", "pivot"] },
);

export const mailgunActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_domains",
    description: "List Mailgun domains available to the current API key.",
    inputSchema: listDomainsInputSchema,
    outputSchema: looseObject,
  }),
  defineProviderAction(service, {
    name: "get_domain",
    description: "Get Mailgun domain details including DNS records and sending state.",
    inputSchema: domainInputSchema,
    outputSchema: looseObject,
  }),
  defineProviderAction(service, {
    name: "verify_domain",
    description: "Ask Mailgun to verify DNS records for a sending domain.",
    inputSchema: domainInputSchema,
    outputSchema: genericMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_domain_tracking_settings",
    description: "Get open, click, unsubscribe, and web scheme tracking settings for a domain.",
    inputSchema: domainInputSchema,
    outputSchema: domainTrackingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_domain_tracking_settings",
    description: "Update open, click, or unsubscribe tracking settings for a Mailgun domain.",
    inputSchema: updateDomainTrackingInputSchema,
    outputSchema: updateDomainTrackingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_email",
    description: "Send an email through Mailgun using a stored domain.",
    inputSchema: sendEmailInputSchema,
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List delivery, engagement, and failure events for a Mailgun domain.",
    inputSchema: listEventsInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_suppressions",
    description: "List records from a Mailgun suppression or allowlist table.",
    inputSchema: suppressionListInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_suppression",
    description: "Get one Mailgun suppression or allowlist record.",
    inputSchema: suppressionLookupInputSchema,
    outputSchema: looseObject,
  }),
  defineProviderAction(service, {
    name: "add_suppression",
    description: "Add one Mailgun suppression or allowlist record.",
    inputSchema: addSuppressionInputSchema,
    outputSchema: genericMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_suppression",
    description: "Remove one Mailgun suppression or allowlist record.",
    inputSchema: suppressionLookupInputSchema,
    outputSchema: genericMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List templates stored for a Mailgun domain.",
    inputSchema: templateListInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Get metadata for one Mailgun template and optionally its active version.",
    inputSchema: getTemplateInputSchema,
    outputSchema: looseObject,
  }),
  defineProviderAction(service, {
    name: "create_template",
    description: "Create a Mailgun template and optionally its initial active version.",
    inputSchema: createTemplateInputSchema,
    outputSchema: genericMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_template_versions",
    description: "List versions for a Mailgun template.",
    inputSchema: listTemplateVersionsInputSchema,
    outputSchema: looseObject,
  }),
  defineProviderAction(service, {
    name: "get_template_version",
    description: "Get content and metadata for one Mailgun template version.",
    inputSchema: getTemplateVersionInputSchema,
    outputSchema: looseObject,
  }),
  defineProviderAction(service, {
    name: "create_template_version",
    description: "Create a new version for a Mailgun template.",
    inputSchema: createTemplateVersionInputSchema,
    outputSchema: genericMessageOutputSchema,
  }),
];
