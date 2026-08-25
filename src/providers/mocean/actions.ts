import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mocean";

const moceanStatusSchema = s.integer("Mocean response status code. Zero indicates a successful request.");

const pricingDestinationSchema = s.looseRequiredObject(
  "Pricing entry for one Mocean destination or operator.",
  {
    country: s.nonEmptyString("Destination country name returned by Mocean."),
    operator: s.nonEmptyString("Destination operator name returned by Mocean."),
    mcc: s.nonEmptyString("Mobile Country Code returned by Mocean."),
    mnc: s.nonEmptyString("Mobile Network Code returned by Mocean."),
    price: s.nonEmptyString("Price returned by Mocean for this destination."),
    currency: s.nonEmptyString("Currency code returned by Mocean for the price."),
  },
  { optional: ["country", "operator", "mcc", "mnc", "price", "currency"] },
);

const carrierSchema = s.looseRequiredObject(
  "Carrier information returned by Mocean.",
  {
    country: s.nonEmptyString("Carrier country returned by Mocean."),
    name: s.nonEmptyString("Carrier name returned by Mocean."),
    networkCode: s.nonEmptyString("Carrier network code returned by Mocean."),
    mcc: s.nonEmptyString("Carrier Mobile Country Code returned by Mocean."),
    mnc: s.nonEmptyString("Carrier Mobile Network Code returned by Mocean."),
  },
  { optional: [] },
);

const sendSmsMessageSchema = s.looseRequiredObject(
  "Result for one SMS recipient returned by Mocean.",
  {
    status: moceanStatusSchema,
    receiver: s.nonEmptyString("Phone number that Mocean accepted for this message."),
    messageId: s.nonEmptyString("Mocean message identifier returned for status queries."),
    errorMessage: s.nonEmptyString("Mocean error message when the recipient submission failed."),
  },
  { optional: ["receiver", "messageId", "errorMessage"] },
);

export const moceanActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_balance",
    description: "Retrieve the current Mocean account balance.",
    inputSchema: s.actionInput({}, [], "Input parameters for retrieving Mocean account balance."),
    outputSchema: s.requiredObject("Mocean account balance response.", {
      status: moceanStatusSchema,
      value: s.number("Current Mocean account balance value returned by Mocean."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_pricing",
    description: "Retrieve Mocean account pricing for SMS, number lookup, or verify services.",
    inputSchema: s.object(
      "Input parameters for retrieving Mocean account pricing.",
      {
        type: s.stringEnum("Mocean service type to retrieve pricing for.", ["sms", "number-lookup", "verify"]),
        mcc: s.nonEmptyString("Mobile Country Code to filter pricing by destination."),
        mnc: s.nonEmptyString("Mobile Network Code to filter pricing by operator."),
      },
      { optional: ["type", "mcc", "mnc"] },
    ),
    outputSchema: s.requiredObject("Mocean account pricing response.", {
      status: moceanStatusSchema,
      destinations: s.array(
        "Pricing entries returned by Mocean for the requested destination filters.",
        pricingDestinationSchema,
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_message_status",
    description: "Retrieve the delivery status for a Mocean SMS message.",
    inputSchema: s.requiredObject(
      "Input parameters for retrieving the delivery status of an outbound Mocean SMS message.",
      {
        messageId: s.nonEmptyString("Mocean message ID returned by send_sms."),
      },
    ),
    outputSchema: s.requiredObject("Mocean outbound SMS message status response.", {
      status: moceanStatusSchema,
      messageStatus: s.integer(
        "Mocean delivery status code for the message. Documented values include delivered, failed, expired, pending, and not found.",
      ),
      messageId: s.nonEmptyString("Mocean message identifier."),
      creditDeducted: s.nonEmptyString("Credits deducted for the message."),
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_number",
    description: "Look up carrier information for a phone number through Mocean.",
    inputSchema: s.requiredObject("Input parameters for performing a synchronous Mocean number lookup.", {
      to: s.nonEmptyString("Phone number to look up, including country code."),
    }),
    outputSchema: s.object(
      "Synchronous Mocean number lookup response.",
      {
        status: moceanStatusSchema,
        messageId: s.nonEmptyString("Mocean message identifier for the lookup."),
        to: s.nonEmptyString("Phone number returned by Mocean for the lookup."),
        currentCarrier: carrierSchema,
        originalCarrier: carrierSchema,
        ported: s.stringEnum("Mocean porting status for the phone number.", ["ported", "not_ported", "unknown"]),
      },
      { optional: ["messageId", "to", "currentCarrier", "originalCarrier", "ported"] },
    ),
  }),
  defineProviderAction(service, {
    name: "send_sms",
    description: "Send an SMS message through Mocean.",
    inputSchema: s.object(
      "Input parameters for sending an SMS message with Mocean.",
      {
        from: s.nonEmptyString("SMS sender ID shown to the recipient."),
        to: s.nonEmptyString("Recipient phone number including country code."),
        text: s.nonEmptyString("SMS message text to send to the recipient."),
        deliveryReportUrl: s.url("Callback URL that Mocean should call with delivery report updates."),
      },
      { optional: ["deliveryReportUrl"] },
    ),
    outputSchema: s.requiredObject("Mocean SMS submission response.", {
      messages: s.array("Per-recipient SMS submission results returned by Mocean.", sendSmsMessageSchema),
    }),
  }),
];
