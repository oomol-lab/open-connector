import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailgenius";

const mailgeniusObjectSchema = s.looseObject("A JSON object returned by MailGenius.");
const testEmailSchema = s.looseRequiredObject(
  "A MailGenius test email audit item.",
  {
    slug: s.nonEmptyString("The MailGenius slug used to fetch this test email result."),
    test_email: s.email("The generated MailGenius test email address."),
  },
  { optional: [] },
);

export const mailgeniusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_daily_limit",
    operationType: "read",
    description: "Get the MailGenius API token daily test limit, used count, and remaining count.",
    inputSchema: s.actionInput({}, [], "Input parameters for fetching the MailGenius daily limit."),
    outputSchema: s.requiredObject("The wrapped MailGenius daily limit response.", {
      dailyLimit: mailgeniusObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_email_audit",
    operationType: "write",
    description: "Generate a MailGenius test email address for an inbound deliverability audit.",
    inputSchema: s.actionInput({}, [], "Input parameters for generating a MailGenius test email."),
    outputSchema: s.requiredObject("The wrapped generated test email response.", {
      audit: mailgeniusObjectSchema,
    }),
    followUpActions: ["mailgenius.get_email_result"],
  }),
  defineProviderAction(service, {
    name: "get_email_result",
    operationType: "read",
    description:
      "Get the MailGenius result for a generated test email slug, including NOT_READY responses before analysis is complete.",
    inputSchema: s.actionInput(
      {
        slug: s.nonEmptyString("The MailGenius test email slug returned by create_email_audit or list_email_audits."),
      },
      ["slug"],
      "Input parameters for fetching a MailGenius email test result.",
    ),
    outputSchema: s.requiredObject("The wrapped MailGenius email test result response.", {
      result: mailgeniusObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_email_audits",
    operationType: "read",
    description:
      "List MailGenius generated test emails and their slugs, optionally filtered by time range and used state.",
    inputSchema: s.actionInput(
      {
        fromTimestamp: s.nonNegativeInteger("The start timestamp in seconds."),
        toTimestamp: s.nonNegativeInteger("The end timestamp in seconds."),
        page: s.positiveInteger("The one-based result page to fetch."),
        perPage: s.positiveInteger("The maximum number of audit items to return."),
        used: s.boolean("Whether to return used or unused test email audit items."),
      },
      [],
      "Input parameters for listing MailGenius test email audit items.",
    ),
    outputSchema: s.requiredObject("The wrapped MailGenius test email list response.", {
      testEmails: s.array("The test email audit items returned by MailGenius.", testEmailSchema),
      raw: mailgeniusObjectSchema,
    }),
  }),
];
