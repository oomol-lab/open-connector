import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "encharge";

const namedEmailSchema = s.object(
  "An email address with an optional display name accepted by Encharge.",
  {
    email: s.email("Email address."),
    name: s.nonEmptyString("Display name to use with the email address."),
  },
  { optional: ["name"] },
);
const emailOrNamedEmailSchema = s.anyOf("Email address string or object with email and name.", [
  s.email("Email address."),
  namedEmailSchema,
]);
const recipientSchema = s.anyOf("Recipient email address string or an existing Encharge person reference.", [
  s.email("Recipient email address."),
  s.object("Existing Encharge person reference used to resolve the recipient email.", {
    userId: s.nonEmptyString("User ID of an existing Encharge person."),
  }),
]);

export const enchargeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_email",
    description: "Send a transactional email through the current Encharge account.",
    inputSchema: s.object(
      "Input payload for sending an Encharge transactional email.",
      {
        contentType: s.stringEnum("Which Encharge email content field to send.", ["text", "html", "template"]),
        content: s.nonEmptyString("Plain-text body, HTML body, or template name based on contentType."),
        to: recipientSchema,
        from: emailOrNamedEmailSchema,
        subject: s.nonEmptyString("Email subject. Required for text and HTML email content."),
        templateProperties: s.record(
          "Dictionary of template values that Encharge replaces in the email subject or body.",
          s.unknown("Template replacement value."),
        ),
        unsubscribeCheck: s.boolean("Whether Encharge should skip sending to people who unsubscribed from emails."),
        UTMTags: s.boolean("Whether Encharge should apply account-level automatic UTM tagging to links."),
        cc: s.nonEmptyString("Comma-separated email address list accepted by Encharge."),
        bcc: s.nonEmptyString("Comma-separated email address list accepted by Encharge."),
        reply: emailOrNamedEmailSchema,
      },
      {
        optional: ["subject", "templateProperties", "unsubscribeCheck", "UTMTags", "cc", "bcc", "reply"],
      },
    ),
    outputSchema: s.object(
      "Normalized Encharge transactional email send result.",
      {
        ok: s.boolean("Whether Encharge accepted the send request."),
        response: s.looseObject("JSON response returned by Encharge, when present."),
      },
      { optional: ["response"] },
    ),
  }),
];
