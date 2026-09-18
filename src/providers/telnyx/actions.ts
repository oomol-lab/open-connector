import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "telnyx";

function action(
  name: TelnyxActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, { name, operationType, description, inputSchema, outputSchema });
}

const nonEmptyStringSchema = (description: string): JsonSchema =>
  s.string({ description, minLength: 1, pattern: "\\S" });

const phoneAddressSchema = nonEmptyStringSchema(
  "The sending or receiving address, such as an E.164 phone number, alphanumeric sender ID, short code, or number pool.",
);

const messageIdSchema = s.uuid("The Telnyx message ID.");
const messagingProfileIdSchema = s.uuid("The Telnyx messaging profile ID.");
const messageTypeSchema = s.stringEnum("The protocol Telnyx should use for the message.", ["SMS", "MMS"]);
const messageEncodingSchema = s.stringEnum("The encoding Telnyx should use for the message.", ["auto", "gsm7", "ucs2"]);

const telnyxResourceSchema = s.looseRequiredObject("The Telnyx resource object returned by the API.", {
  id: s.uuid("The Telnyx resource ID."),
  record_type: s.string("The Telnyx resource type."),
});

const telnyxMetaSchema = s.looseObject("The pagination metadata returned by Telnyx.", {
  page_number: s.integer("The current Telnyx page number."),
  page_size: s.integer("The current Telnyx page size."),
  total_pages: s.integer("The total number of pages available from Telnyx."),
  total_results: s.integer("The total number of matching Telnyx resources."),
});

export const telnyxActions: ActionDefinition[] = [
  action(
    "send_message",
    "write",
    "Send an SMS or MMS message through Telnyx Messaging.",
    s.object(
      "The input payload for sending a Telnyx message.",
      {
        to: phoneAddressSchema,
        from: phoneAddressSchema,
        messagingProfileId: messagingProfileIdSchema,
        text: nonEmptyStringSchema("The SMS message body."),
        subject: nonEmptyStringSchema("The MMS message subject."),
        mediaUrls: s.array(
          "The media URLs Telnyx should attach to an MMS message.",
          s.url("One media URL for the MMS message."),
          {
            minItems: 1,
          },
        ),
        webhookUrl: s.url("The URL where Telnyx should send message webhooks."),
        webhookFailoverUrl: s.url("The failover URL Telnyx should use if the primary message webhook URL fails."),
        useProfileWebhooks: s.boolean("Whether Telnyx should use webhooks configured on the messaging profile."),
        type: messageTypeSchema,
        autoDetect: s.boolean("Whether Telnyx should detect SMS messages that exceed a recommended part limit."),
        sendAt: s.nullable(s.dateTime("The ISO 8601 timestamp when Telnyx should send the message.")),
        encoding: messageEncodingSchema,
      },
      {
        optional: [
          "from",
          "messagingProfileId",
          "text",
          "subject",
          "mediaUrls",
          "webhookUrl",
          "webhookFailoverUrl",
          "useProfileWebhooks",
          "type",
          "autoDetect",
          "sendAt",
          "encoding",
        ],
      },
    ),
    s.object(
      "The response returned when Telnyx sends a message.",
      {
        data: telnyxResourceSchema,
      },
      { required: ["data"] },
    ),
  ),
  action(
    "retrieve_message",
    "read",
    "Retrieve a Telnyx message by ID.",
    s.object("The input payload for retrieving a Telnyx message.", { id: messageIdSchema }, { required: ["id"] }),
    s.object(
      "The response returned when retrieving a Telnyx message.",
      {
        data: telnyxResourceSchema,
      },
      { required: ["data"] },
    ),
  ),
  action(
    "list_messaging_profiles",
    "read",
    "List Telnyx messaging profiles with optional name filters and pagination.",
    s.object(
      "The input payload for listing Telnyx messaging profiles.",
      {
        filterName: nonEmptyStringSchema("The profile name filter passed as filter[name]."),
        filterNameEq: nonEmptyStringSchema("The exact profile name filter."),
        filterNameContains: nonEmptyStringSchema("The partial profile name filter."),
        pageNumber: s.positiveInteger("The Telnyx page number to load."),
        pageSize: s.integer("The number of Telnyx profiles to load per page.", {
          minimum: 1,
          maximum: 250,
        }),
      },
      { optional: ["filterName", "filterNameEq", "filterNameContains", "pageNumber", "pageSize"] },
    ),
    s.object(
      "The response returned when listing Telnyx messaging profiles.",
      {
        data: s.array("The Telnyx messaging profiles returned by the API.", telnyxResourceSchema),
        meta: telnyxMetaSchema,
      },
      { required: ["data", "meta"] },
    ),
  ),
  action(
    "retrieve_messaging_profile",
    "read",
    "Retrieve a Telnyx messaging profile by ID.",
    s.object(
      "The input payload for retrieving a Telnyx messaging profile.",
      { id: messagingProfileIdSchema },
      { required: ["id"] },
    ),
    s.object(
      "The response returned when retrieving a Telnyx messaging profile.",
      {
        data: telnyxResourceSchema,
      },
      { required: ["data"] },
    ),
  ),
];

export type TelnyxActionName =
  | "send_message"
  | "retrieve_message"
  | "list_messaging_profiles"
  | "retrieve_messaging_profile";
