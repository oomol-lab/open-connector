import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "twochat";

const isoDateTimeSchema = s.dateTime("An ISO 8601 timestamp.");
const nullableIsoDateTimeSchema = s.nullable(s.dateTime("An ISO 8601 timestamp."));
const contactDetailTypeInputSchema = s.stringEnum(
  "Contact detail type: E for email, A for address, PH for phone, WAPH for WhatsApp phone.",
  ["E", "A", "PH", "WAPH"],
);

const twochatAccountSchema = s.object("Normalized 2Chat account information.", {
  name: s.nonEmptyString("The 2Chat account name."),
  uuid: s.nonEmptyString("The 2Chat account UUID."),
  onTrial: s.boolean("Whether the account is currently on a trial plan."),
  blocked: s.boolean("Whether the account is currently blocked."),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});

const twochatLimitsSchema = s.object("2Chat API rate limit information.", {
  requestsPerMinute: s.nonNegativeInteger("The maximum number of API requests allowed per minute."),
});

const twochatUsageSchema = s.object("2Chat API usage counters for the current billing period.", {
  apiRequestCount: s.nonNegativeInteger("The number of API requests already used in the current period."),
  maxApiRequestCount: s.nonNegativeInteger("The maximum number of API requests included in the current plan."),
  numberCheckCount: s.nonNegativeInteger("The number of phone number checks already used in the current period."),
  maxNumberCheckCount: s.nonNegativeInteger("The maximum number of phone number checks included in the current plan."),
});

const twochatInfoOutputSchema = s.object("2Chat account, limit, and usage information.", {
  account: twochatAccountSchema,
  limits: twochatLimitsSchema,
  usage: twochatUsageSchema,
});

const twochatContactDetailInputSchema = s.object("One 2Chat contact detail to create.", {
  type: contactDetailTypeInputSchema,
  value: s.nonEmptyString("The contact detail value, such as an email address or phone number."),
});

const twochatContactDetailSchema = s.object("One normalized 2Chat contact detail.", {
  id: s.integer("The 2Chat contact detail ID."),
  value: s.nonEmptyString("The contact detail value returned by 2Chat."),
  type: s.nonEmptyString("The 2Chat contact detail type code."),
  createdAt: nullableIsoDateTimeSchema,
  updatedAt: nullableIsoDateTimeSchema,
});

const twochatContactSchema = s.object("One normalized 2Chat contact.", {
  id: s.nullableInteger("The 2Chat contact ID, or null when the response omits it."),
  uuid: s.nonEmptyString("The 2Chat contact UUID."),
  firstName: s.string("The contact first name."),
  lastName: s.nullableString("The contact last name, or null when unavailable."),
  channelUuid: s.nullableString("The connected channel UUID associated with the contact, or null when unavailable."),
  profilePicUrl: s.nullableString("The contact profile picture URL, or null when unavailable."),
  details: s.array("The contact details stored for the contact.", twochatContactDetailSchema),
});

const twochatWebhookSchema = s.object("One normalized 2Chat webhook subscription.", {
  uuid: s.nonEmptyString("The 2Chat webhook UUID."),
  eventName: s.nonEmptyString("The event name subscribed by the webhook."),
  channelUuid: s.nonEmptyString("The channel UUID monitored by the webhook."),
  hookUrl: s.nonEmptyString("The callback URL configured for the webhook."),
  hookParams: s.unknownObject("Additional webhook parameters returned by 2Chat."),
  createdAt: isoDateTimeSchema,
});

export const twochatActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "test_api_key",
    description: "Validate the connected 2Chat API key and return normalized account, limit, and usage information.",
    inputSchema: s.object("No input is required to validate the 2Chat API key.", {}),
    outputSchema: twochatInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_api_usage_info",
    description: "Fetch the current 2Chat account, rate limit, and usage counters for the connected API key.",
    inputSchema: s.object("No input is required to retrieve the current 2Chat usage information.", {}),
    outputSchema: twochatInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_webhooks",
    description: "List the webhook subscriptions currently configured in the connected 2Chat account.",
    inputSchema: s.object("No input is required to list the configured 2Chat webhooks.", {}),
    outputSchema: s.object("2Chat webhook listing response.", {
      webhooks: s.array("Webhook subscriptions configured in the connected 2Chat account.", twochatWebhookSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List contacts from the connected 2Chat account, with optional pagination and channel filtering.",
    inputSchema: s.object(
      "Parameters for listing contacts from 2Chat.",
      {
        pageNumber: s.nonNegativeInteger("Optional page number to retrieve."),
        resultsPerPage: s.integer("Optional page size to request from 2Chat, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        channelUuid: s.nonEmptyString("Optional connected number UUID used to filter contacts by channel."),
      },
      { optional: ["pageNumber", "resultsPerPage", "channelUuid"] },
    ),
    outputSchema: s.object("2Chat contact listing response.", {
      page: s.nonNegativeInteger("The page number returned by 2Chat."),
      count: s.nonNegativeInteger("The total number of contacts available for the current query."),
      contacts: s.array("Contacts returned by the requested 2Chat page.", twochatContactSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description:
      "Create a contact in 2Chat with one or more contact details and optional channel and profile picture metadata.",
    inputSchema: s.object(
      "Parameters for creating a new 2Chat contact.",
      {
        firstName: s.nonEmptyString("The first name of the contact to create."),
        lastName: s.nonEmptyString("Optional last name of the contact to create."),
        channelUuid: s.nonEmptyString("Optional channel UUID to associate with the created contact."),
        profilePicUrl: s.url("Optional public profile picture URL for the contact."),
        contactDetails: s.array(
          "The contact details to create with the new contact.",
          twochatContactDetailInputSchema,
          {
            minItems: 1,
          },
        ),
      },
      { optional: ["lastName", "channelUuid", "profilePicUrl"] },
    ),
    outputSchema: s.object("2Chat contact creation response.", {
      contact: twochatContactSchema,
    }),
  }),
];
