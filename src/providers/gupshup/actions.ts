import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gupshup";

const submittedMessageOutputSchema = s.object("A submitted Gupshup WhatsApp message.", {
  status: s.string("The submission status returned by Gupshup."),
  messageId: s.nonEmptyString("The unique Gupshup message identifier."),
});

const templateSchema = s.looseObject("A Gupshup WhatsApp message template with provider-defined metadata.", {
  id: s.optional(s.nonEmptyString("The Gupshup template ID.")),
  appId: s.optional(s.nonEmptyString("The Gupshup app ID that owns the template.")),
  elementName: s.optional(s.string("The template name.")),
  category: s.optional(s.string("The template category.")),
  languageCode: s.optional(s.string("The template language code.")),
  status: s.optional(s.string("The template approval status.")),
  templateType: s.optional(s.string("The template type.")),
  quality: s.optional(s.string("The template quality rating.")),
  createdOn: s.optional(s.integer("The template creation timestamp in milliseconds.")),
  modifiedOn: s.optional(s.integer("The template modification timestamp in milliseconds.")),
});

const messageAddressProperties = {
  source: s.nonEmptyString(
    "The registered WhatsApp Business sender number in international format without a plus sign.",
  ),
  destination: s.nonEmptyString("The recipient WhatsApp number in international format without a plus sign."),
  appName: s.nonEmptyString("The Gupshup app name associated with the sender number."),
};

const listTemplatesInputSchema = s.object(
  "Filters and pagination for listing templates in the connected Gupshup app.",
  {
    pageNo: s.nonNegativeInteger("The zero-based page number to retrieve."),
    pageSize: s.integer("The number of templates to return per page.", {
      minimum: 1,
      maximum: 100,
    }),
    templateStatus: s.string("The template status to filter by, such as APPROVED."),
    templateCategory: s.string("The template category to filter by, such as MARKETING, UTILITY, or AUTHENTICATION."),
    templateType: s.string("The template type to filter by, such as TEXT."),
    quality: s.string("The template quality rating to filter by, such as GREEN."),
    languageCode: s.string("The template language code to filter by, such as en."),
  },
  {
    optional: ["pageNo", "pageSize", "templateStatus", "templateCategory", "templateType", "quality", "languageCode"],
  },
);

export const gupshupActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_text_message",
    description: "Send a text message in an active WhatsApp conversation through Gupshup.",
    requiredScopes: [],
    inputSchema: s.object(
      "A Gupshup WhatsApp text message.",
      {
        ...messageAddressProperties,
        text: s.nonEmptyString("The text content to send to the recipient.", { maxLength: 4096 }),
        disablePreview: s.boolean("Whether to disable link previews in the text message."),
      },
      { optional: ["disablePreview"] },
    ),
    outputSchema: submittedMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_template_message",
    description: "Send an approved text template message through Gupshup.",
    requiredScopes: [],
    inputSchema: s.object(
      "A Gupshup WhatsApp text template message.",
      {
        ...messageAddressProperties,
        templateId: s.nonEmptyString("The unique ID of the approved Gupshup template."),
        parameters: s.stringArray("The template parameter values in their order of occurrence.", {
          itemDescription: "A template parameter value.",
        }),
      },
      { optional: ["parameters"] },
    ),
    outputSchema: submittedMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List message templates for the connected Gupshup app.",
    requiredScopes: [],
    inputSchema: listTemplatesInputSchema,
    outputSchema: s.looseRequiredObject("The template-list response returned by Gupshup.", {
      status: s.stringEnum("The template-list request status.", ["success"]),
      templates: s.array("The templates returned for the connected app.", templateSchema),
    }),
  }),
];
