import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "splunk_http_event_collector";

export type SplunkHttpEventCollectorActionName = "send_event" | "send_raw_event";

const hecResponseSchema = s.object(
  "The response returned by Splunk HTTP Event Collector.",
  {
    text: s.string("The Splunk HEC response message."),
    code: s.integer("The Splunk HEC response code."),
    ackID: s.nonNegativeInteger("The indexer acknowledgement identifier returned when acknowledgement is enabled."),
  },
  { optional: ["ackID"] },
);

const eventFieldsSchema = s.record(
  "Optional flat indexed fields attached to the event.",
  s.anyOf("A string or string array indexed field value.", [
    s.string("A string indexed field value."),
    s.stringArray("A string array indexed field value."),
  ]),
);

const sendEvent = defineProviderAction(service, {
  name: "send_event",
  operationType: "write",
  description: "Send one structured event to the connected Splunk HTTP Event Collector.",
  inputSchema: s.object(
    "Input parameters for sending one structured Splunk HEC event.",
    {
      event: s.unknown("The event payload as any JSON value accepted by Splunk HEC."),
      time: s.number("The optional event timestamp in Unix epoch format."),
      host: s.nonEmptyString("The optional host value assigned to the event."),
      source: s.nonEmptyString("The optional source value assigned to the event."),
      sourcetype: s.nonEmptyString("The optional source type assigned to the event."),
      index: s.nonEmptyString("The optional destination Splunk index."),
      fields: eventFieldsSchema,
      channel: s.uuid(
        "An optional request channel UUID, required when the HEC token has indexer acknowledgement enabled.",
      ),
    },
    { optional: ["time", "host", "source", "sourcetype", "index", "fields", "channel"] },
  ),
  outputSchema: hecResponseSchema,
});

const sendRawEvent = defineProviderAction(service, {
  name: "send_raw_event",
  operationType: "write",
  description: "Send one raw text event to the connected Splunk HTTP Event Collector.",
  inputSchema: s.object(
    "Input parameters for sending one raw Splunk HEC event.",
    {
      event: s.string("The raw text event payload."),
      time: s.number("The optional event timestamp in Unix epoch format."),
      host: s.nonEmptyString("The optional host value assigned to the event."),
      source: s.nonEmptyString("The optional source value assigned to the event."),
      sourcetype: s.nonEmptyString("The optional source type assigned to the event."),
      index: s.nonEmptyString("The optional destination Splunk index."),
      channel: s.uuid("An optional request channel UUID. The connector generates a UUID v7 when omitted."),
    },
    { optional: ["time", "host", "source", "sourcetype", "index", "channel"] },
  ),
  outputSchema: hecResponseSchema,
});

export const splunkHttpEventCollectorActions: ActionDefinition[] = [sendEvent, sendRawEvent];
