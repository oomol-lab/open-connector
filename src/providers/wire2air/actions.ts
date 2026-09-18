import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const service = "wire2air";

const messageOutputSchema = s.looseRequiredObject(
  "The Wire2Air message submission result.",
  {
    Response: s.string("Human-readable submission status returned by Wire2Air."),
    URI: s.string("Relative URI for the queued message or batch."),
    ID: s.string("Identifier for the queued message or batch."),
    Type: s.string("Result type, such as Out or Batch."),
  },
  { optional: [] },
);

const listMessagesOutputSchema = s.looseRequiredObject(
  "A paginated Wire2Air inbox result.",
  {
    PageNo: s.integer("Current page number returned by Wire2Air."),
    PageSize: s.integer("Page size returned by Wire2Air."),
    TotalPages: s.number("Total number of result pages."),
    TotalRecords: s.integer("Total number of matching messages."),
    RowStart: s.integer("One-based index of the first row on this page."),
    RowEnd: s.integer("One-based index of the last row on this page."),
    ListItems: s.array("Inbound SMS or MMS messages on this page.", s.looseObject("One inbound Wire2Air message.")),
  },
  { optional: [] },
);

export const wire2AirActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_message",
    operationType: "write",
    description: "Queue an SMS message or comma-separated bulk SMS messages with Wire2Air.",
    inputSchema: s.object(
      "Input for sending an SMS message with Wire2Air.",
      {
        to: s.nonWhitespaceString(
          "Destination number in international format, or comma-separated destination numbers for bulk sending.",
        ),
        from: s.nonWhitespaceString("Wire2Air shortcode or sender number.", {}),
        text: s.nonEmptyString("SMS message text."),
        deliveryDateTime: s.string("Optional UTC delivery time in MM/DD/YYYY HH:MM:SS format."),
        replyPath: s.string("Callback URL that Wire2Air should use for message replies.", {
          format: "uri",
        }),
        batchName: s.string("Internal reporting name used for a bulk message batch."),
      },
      { optional: ["deliveryDateTime", "replyPath", "batchName"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_inbound_messages",
    operationType: "read",
    description: "List inbound SMS and MMS messages from the Wire2Air inbox.",
    inputSchema: s.object(
      "Filters and pagination for listing Wire2Air inbox messages.",
      {
        dateFrom: s.string("Start date in M/D/YYYY format; the date range cannot exceed 31 days."),
        dateTo: s.string("End date in M/D/YYYY format; the date range cannot exceed 31 days."),
        textNumber: s.string("Assigned shortcode or text number to filter by."),
        page: s.integer("Result page to retrieve; defaults to 1.", { minimum: 1 }),
        pageSize: s.integer("Number of messages to return; defaults to 10.", { minimum: 1 }),
      },
      { optional: ["dateFrom", "dateTo", "textNumber", "page", "pageSize"] },
    ),
    outputSchema: listMessagesOutputSchema,
  }),
];
