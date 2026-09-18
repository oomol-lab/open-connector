import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "keen_io";

const absoluteTimeframeSchema = s.actionInput(
  {
    start: s.nonEmptyString("The inclusive ISO-8601 timestamp for the analysis timeframe."),
    end: s.nonEmptyString("The exclusive ISO-8601 timestamp for the analysis timeframe."),
  },
  ["start", "end"],
  "An absolute Keen analysis timeframe.",
);

const timeframeSchema = s.anyOf("The required analysis timeframe accepted by Keen.", [
  s.nonEmptyString("A Keen relative timeframe such as this_7_days."),
  absoluteTimeframeSchema,
]);

const filterSchema = s.actionInput(
  {
    propertyName: s.nonEmptyString("The event property name to filter."),
    operator: s.nonEmptyString("The Keen filter operator, such as eq or in."),
    propertyValue: s.unknown("The value compared against the event property."),
  },
  ["propertyName", "operator", "propertyValue"],
  "One Keen event-property filter.",
);

const groupBySchema = s.anyOf("One or more event properties used to group Keen results.", [
  s.nonEmptyString("One event property used to group Keen results."),
  s.array(
    "The event properties used to group Keen results.",
    s.nonEmptyString("One event property used to group Keen results."),
    {
      minItems: 1,
    },
  ),
]);

const queryInputFields: Record<string, JsonSchema> = {
  eventCollection: s.nonEmptyString("The Keen event collection to analyze."),
  timeframe: timeframeSchema,
  filters: s.array("The optional event-property filters applied by Keen.", filterSchema),
  groupBy: groupBySchema,
  interval: s.nonEmptyString("The interval used to group Keen results over time."),
  timezone: s.nonEmptyString("The timezone assigned to relative Keen timeframes."),
  includeMetadata: s.boolean("Whether Keen should include execution metadata in the response."),
};

const queryOutputSchema = s.actionOutput(
  {
    result: s.unknown("The analysis result returned by Keen."),
    raw: s.looseObject("The raw Keen analysis response object."),
  },
  "A Keen analysis response with a dynamic result value.",
);

export const keenIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "add_event",
    operationType: "write",
    description: "Publish one JSON event to a Keen event collection.",
    inputSchema: s.actionInput(
      {
        eventCollection: s.nonEmptyString("The Keen event collection that receives the event."),
        event: s.looseObject("The JSON event object published to Keen."),
      },
      ["eventCollection", "event"],
      "The input payload for publishing one Keen event.",
    ),
    outputSchema: s.actionOutput(
      {
        created: s.boolean("Whether Keen created the event."),
        raw: s.looseObject("The raw Keen event publishing response object."),
      },
      "The Keen event publishing response.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_count",
    operationType: "read",
    description: "Count Keen events that match a required timeframe and optional filters.",
    inputSchema: s.actionInput(
      queryInputFields,
      ["eventCollection", "timeframe"],
      "The input payload for a Keen count analysis.",
    ),
    outputSchema: queryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "query_sum",
    operationType: "read",
    description: "Sum a numeric property across Keen events in a required timeframe.",
    inputSchema: s.actionInput(
      {
        ...queryInputFields,
        targetProperty: s.nonEmptyString("The numeric event property that Keen sums."),
      },
      ["eventCollection", "timeframe", "targetProperty"],
      "The input payload for a Keen sum analysis.",
    ),
    outputSchema: queryOutputSchema,
  }),
];
