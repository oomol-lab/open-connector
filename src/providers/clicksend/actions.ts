import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clicksend";

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const responseEnvelopeSchema = s.object(
  "A normalized ClickSend API response envelope.",
  {
    responseCode: s.string("The response code returned by ClickSend."),
    responseMessage: s.string("The response message returned by ClickSend."),
    data: s.unknown("The data payload returned by ClickSend."),
    raw: s.looseObject("The raw ClickSend response object."),
  },
  { optional: ["responseCode", "responseMessage", "data"] },
);

const paginationInputSchema = s.object(
  "Pagination controls accepted by ClickSend list endpoints.",
  {
    page: s.positiveInteger("The 1-based page number to request from ClickSend."),
    limit: s.integer("The maximum number of records to return.", { minimum: 1, maximum: 1000 }),
  },
  { optional: ["page", "limit"] },
);

const smsMessageSchema = s.object(
  "One SMS message to send through ClickSend.",
  {
    body: nonEmptyString("The SMS body to send."),
    to: nonEmptyString("The recipient phone number in E.164 format."),
    list_id: nonEmptyString("The ClickSend contact list ID to send to."),
    from: nonEmptyString("The sender ID, dedicated number, own number, or alpha tag."),
    source: nonEmptyString("The source application name passed to ClickSend."),
    schedule: s.integer("The Unix timestamp when ClickSend should send the SMS."),
    custom_string: nonEmptyString("A custom string returned by ClickSend with message callbacks."),
    contact_id: nonEmptyString("The ClickSend contact ID associated with the recipient."),
    country: nonEmptyString("The two-letter destination country code."),
    from_email: nonEmptyString("The email address that should receive SMS replies."),
    exclude_no_sender_id_recipients: s.boolean(
      "Whether ClickSend should exclude recipients that cannot receive this sender ID.",
    ),
  },
  {
    optional: [
      "to",
      "list_id",
      "from",
      "source",
      "schedule",
      "custom_string",
      "contact_id",
      "country",
      "from_email",
      "exclude_no_sender_id_recipients",
    ],
  },
);

const smsPayloadSchema = s.object(
  "The SMS payload accepted by ClickSend send and price endpoints.",
  {
    messages: s.array("SMS messages to send or price.", smsMessageSchema, { minItems: 1 }),
    shorten_urls: s.boolean("Whether ClickSend should shorten URLs in the SMS body."),
  },
  { optional: ["shorten_urls"] },
);

const contactFields = {
  phone_number: nonEmptyString("The contact phone number."),
  email: nonEmptyString("The contact email address."),
  fax_number: nonEmptyString("The contact fax number."),
  first_name: nonEmptyString("The contact first name."),
  last_name: nonEmptyString("The contact last name."),
  organization_name: nonEmptyString("The contact organization name."),
  address_line_1: nonEmptyString("The first line of the contact postal address."),
  address_line_2: nonEmptyString("The second line of the contact postal address."),
  address_city: nonEmptyString("The contact city."),
  address_state: nonEmptyString("The contact state or region."),
  address_postal_code: nonEmptyString("The contact postal code."),
  address_country: nonEmptyString("The contact country code."),
  custom_1: nonEmptyString("The first custom contact field."),
  custom_2: nonEmptyString("The second custom contact field."),
  custom_3: nonEmptyString("The third custom contact field."),
  custom_4: nonEmptyString("The fourth custom contact field."),
};

const contactInputSchema = s.object("A ClickSend contact payload.", contactFields, {
  optional: Object.keys(contactFields),
});

export const clicksendActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get the ClickSend account profile associated with the configured credentials.",
    inputSchema: s.object("Input for getting the current ClickSend account.", {}),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "send_sms",
    description: "Send one or more SMS messages through ClickSend.",
    inputSchema: smsPayloadSchema,
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "calculate_sms_price",
    description: "Calculate the ClickSend price for one or more SMS messages without sending them.",
    inputSchema: smsPayloadSchema,
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_lists",
    description: "List ClickSend contact lists with pagination controls.",
    inputSchema: paginationInputSchema,
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact_list",
    description: "Create a ClickSend contact list.",
    inputSchema: s.object(
      "Input for creating a ClickSend contact list.",
      {
        list_name: nonEmptyString("The ClickSend contact list name."),
      },
      { required: ["list_name"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact_list",
    description: "Get one ClickSend contact list by ID.",
    inputSchema: s.object(
      "Input for getting a ClickSend contact list.",
      {
        list_id: s.positiveInteger("The ClickSend contact list ID."),
      },
      { required: ["list_id"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact_list",
    description: "Update a ClickSend contact list name.",
    inputSchema: s.object(
      "Input for updating a ClickSend contact list.",
      {
        list_id: s.positiveInteger("The ClickSend contact list ID."),
        list_name: nonEmptyString("The new ClickSend contact list name."),
      },
      { required: ["list_id", "list_name"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact_list",
    description: "Delete a ClickSend contact list by ID.",
    inputSchema: s.object(
      "Input for deleting a ClickSend contact list.",
      {
        list_id: s.positiveInteger("The ClickSend contact list ID."),
      },
      { required: ["list_id"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List contacts in a ClickSend contact list.",
    inputSchema: s.object(
      "Input for listing ClickSend contacts.",
      {
        list_id: s.positiveInteger("The ClickSend contact list ID."),
        page: s.positiveInteger("The 1-based page number to request from ClickSend."),
        limit: s.integer("The maximum number of contacts to return.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a contact in a ClickSend contact list.",
    inputSchema: s.object(
      "Input for creating a ClickSend contact.",
      {
        list_id: s.positiveInteger("The ClickSend contact list ID."),
        contact: contactInputSchema,
      },
      { required: ["list_id", "contact"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one ClickSend contact by list ID and contact ID.",
    inputSchema: s.object(
      "Input for getting a ClickSend contact.",
      {
        list_id: s.positiveInteger("The ClickSend contact list ID."),
        contact_id: s.positiveInteger("The ClickSend contact ID."),
      },
      { required: ["list_id", "contact_id"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a ClickSend contact by list ID and contact ID.",
    inputSchema: s.object(
      "Input for updating a ClickSend contact.",
      {
        list_id: s.positiveInteger("The ClickSend contact list ID."),
        contact_id: s.positiveInteger("The ClickSend contact ID."),
        contact: contactInputSchema,
      },
      { required: ["list_id", "contact_id", "contact"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a ClickSend contact by list ID and contact ID.",
    inputSchema: s.object(
      "Input for deleting a ClickSend contact.",
      {
        list_id: s.positiveInteger("The ClickSend contact list ID."),
        contact_id: s.positiveInteger("The ClickSend contact ID."),
      },
      { required: ["list_id", "contact_id"] },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
];
