import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sendcloud";
const addresses = (description: string, maxItems = 100) =>
  s.array(
    description,
    s.nonEmptyString("One address, optionally formatted as Name<email>; do not include semicolon separators.", {
      not: { pattern: ";" },
    }),
    { minItems: 1, maxItems },
  );
const templateFields = {
  invokeName: s.nonEmptyString("Template invocation name."),
  name: s.nonEmptyString("Template display name."),
  html: s.nonEmptyString("HTML template content; percent-delimited variables are supported."),
  subject: s.nonEmptyString("Email subject."),
  templateType: s.integer("Template type: 0 for triggered email, 1 for bulk email.", {
    minimum: 0,
    maximum: 1,
  }),
};
const template = s.looseObject(
  "Template details, including upstream extension fields.",
  {
    invokeName: s.string("Template invocation name."),
    name: s.string("Template display name."),
    html: s.string("HTML template content."),
    subject: s.string("Email subject."),
    templateType: s.integer("Template type: 0 for triggered email, 1 for bulk email."),
  },
  { required: [] },
);
const sendFields = {
  from: s.nonEmptyString("Sender address, preferably using the configured sending domain."),
  to: addresses(
    "Broadcast recipients, visible to each other; with useAddressList=true, up to five existing mailing-list addresses.",
  ),
  xsmtpapi: s.looseObject(
    "X-SMTPAPI options including sub, pubsub, filters, settings and utm. Its to overrides to/cc/bcc for individual delivery; pubsub overrides sub.",
    {
      to: addresses("Recipients for individual delivery."),
    },
    { required: [] },
  ),
  fromName: s.string("Sender display name."),
  cc: addresses("CC recipients; ignored for mailing lists or xsmtpapi individual delivery."),
  bcc: addresses("BCC recipients; ignored for mailing lists or xsmtpapi individual delivery."),
  replyTo: addresses("Reply addresses; defaults to the sender when omitted.", 3),
  labelName: s.nonEmptyString("Send label; created by SendCloud if it does not exist."),
  sendTags: s.array(
    "Send tags, up to five.",
    s.nonEmptyString("Send tag, at most 20 characters.", { maxLength: 20, not: { pattern: ";" } }),
    { maxItems: 5 },
  ),
  headers: s.record(
    "Custom email headers. SC-Custom- values must be nonempty and contain no dots; mailing-list headers are limited to 1024 bytes.",
    s.string("Email header value."),
  ),
  contentSummary: s.string("Email preview summary; ordinary email requires HTML for this to take effect."),
  sendRequestId: s.nonEmptyString(
    "Caller-selected deduplication ID; SendCloud processes only the first matching request within one hour.",
    { maxLength: 128 },
  ),
  respEmailId: s.boolean("Return email IDs; SendCloud defaults to true."),
  useNotification: s.boolean("Request a read receipt; SendCloud defaults to false."),
  useAddressList: s.boolean("Send to existing mailing lists; xsmtpapi, cc and bcc are ignored. Defaults to false."),
  attachments: s.array(
    "Attachments downloaded from public URLs and uploaded as multipart files. Total default limit is 10 MiB; accounts with an increased provider limit may use up to 50 MiB.",
    s.requiredObject("Hosted attachment.", {
      fileUrl: s.url("Public HTTP(S) download URL; private network URLs are rejected."),
      filename: s.nonEmptyString(
        "Attachment filename; excludes %, $, #, *, path separators and .js/.com/.exe/.sh/.cs extensions.",
      ),
    }),
  ),
};
function response(info: Record<string, unknown>) {
  return s.looseObject("SendCloud API result; acceptance does not confirm delivery.", {
    result: s.boolean("Whether SendCloud accepted the request."),
    statusCode: s.integer("SendCloud business status code; success codes are not limited to 200."),
    message: s.string("SendCloud status message."),
    info,
  });
}
const sendOutput = response(
  s.looseObject(
    "Submission details; fields depend on the sending mode and respEmailId.",
    {
      emailIdList: s.array("Accepted email IDs.", s.string("Email ID.")),
      maillistTaskId: s.array("Accepted mailing-list task IDs.", s.integer("Mailing-list task ID.")),
    },
    { required: [] },
  ),
);
const countOutput = response(s.looseObject("Mutation result.", { count: s.integer("Number of affected templates.") }));
const recipientRequirement = { anyOf: [{ required: ["to"] }, { required: ["xsmtpapi"] }] };
export const sendcloudActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_email",
    operationType: "write",
    requiredScopes: [],
    description:
      "Submit an HTML or plain-text email through SendCloud, with broadcast, individual or mailing-list recipients and optional hosted attachments. No automatic retries.",
    inputSchema: s.object(
      "Ordinary email submission.",
      {
        ...sendFields,
        subject: s.nonEmptyString("Email subject."),
        html: s.nonEmptyString("HTML body; takes precedence over plain when both are supplied."),
        plain: s.nonEmptyString("Plain-text body."),
      },
      {
        required: ["from", "subject"],
        allOf: [recipientRequirement, { anyOf: [{ required: ["html"] }, { required: ["plain"] }] }],
      },
    ),
    outputSchema: sendOutput,
  }),
  defineProviderAction(service, {
    name: "send_template_email",
    operationType: "write",
    requiredScopes: [],
    description:
      "Submit email using a SendCloud template compatible with the connected API_USER type. Use xsmtpapi for individual recipients or to for existing mailing lists or broadcasts. No automatic retries.",
    inputSchema: s.object(
      "Template email submission.",
      {
        ...sendFields,
        templateInvokeName: s.nonEmptyString("Existing template invocation name."),
        subject: s.nonEmptyString("Override the template subject; omitted uses its existing subject."),
      },
      { required: ["from", "templateInvokeName"], allOf: [recipientRequirement] },
    ),
    outputSchema: sendOutput,
  }),
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    requiredScopes: [],
    description: "Read the SendCloud account profile, balance and daily quota.",
    inputSchema: s.requiredObject("No input required.", {}),
    outputSchema: response(
      s.looseObject(
        "Account information.",
        {
          userName: s.string("Account username."),
          email: s.string("Account email address."),
          avaliableBalance: s.number("Available balance, using the upstream field spelling."),
          balance: s.number("Account balance."),
          quota: s.number("Daily request quota."),
          todayUsedQuota: s.number("Requests used today."),
        },
        { required: [] },
      ),
    ),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    requiredScopes: [],
    description: "List SendCloud templates with optional name and type filters and offset pagination.",
    inputSchema: s.object(
      "Template list filters.",
      {
        invokeName: templateFields.invokeName,
        templateType: templateFields.templateType,
        start: s.integer("Starting offset; defaults to 0.", { minimum: 0 }),
        limit: s.integer("Page size; defaults to 100.", { minimum: 0, maximum: 100 }),
      },
      { required: [] },
    ),
    outputSchema: response(
      s.looseObject("Template page.", {
        dataList: s.array("Templates on this page.", template),
        total: s.integer("Total matching templates."),
        count: s.integer("Templates returned on this page."),
      }),
    ),
  }),
  defineProviderAction(service, {
    name: "get_template",
    operationType: "read",
    requiredScopes: [],
    description: "Read a SendCloud template by its invocation name.",
    inputSchema: s.requiredObject("Template lookup.", { invokeName: templateFields.invokeName }),
    outputSchema: response(s.looseObject("Template result.", { data: template })),
  }),
  defineProviderAction(service, {
    name: "create_template",
    operationType: "write",
    requiredScopes: [],
    description: "Create a triggered or bulk SendCloud email template.",
    inputSchema: s.object(
      "Template creation.",
      { ...templateFields, text: s.string("Optional plain-text template content.") },
      { optional: ["text"] },
    ),
    outputSchema: response(s.looseObject("Template result.", { data: template })),
  }),
  defineProviderAction(service, {
    name: "update_template",
    operationType: "write",
    requiredScopes: [],
    description: "Update a SendCloud template's display name, HTML, subject or type.",
    inputSchema: s.object("Template update.", templateFields, {
      required: ["invokeName"],
      minProperties: 2,
    }),
    outputSchema: countOutput,
  }),
  defineProviderAction(service, {
    name: "delete_templates",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Delete SendCloud templates by invocation name or inclusive update-date range. When both are supplied, invocation name takes precedence.",
    inputSchema: s.object(
      "Template deletion selector.",
      {
        invokeName: templateFields.invokeName,
        startDate: s.string("First update date, YYYY-MM-DD, starting at 00:00:00 UTC+08:00.", {
          format: "date",
        }),
        endDate: s.string("Last update date, YYYY-MM-DD, ending at 23:59:59 UTC+08:00.", {
          format: "date",
        }),
      },
      {
        required: [],
        anyOf: [{ required: ["invokeName"] }, { required: ["startDate", "endDate"] }],
      },
    ),
    outputSchema: countOutput,
  }),
];
