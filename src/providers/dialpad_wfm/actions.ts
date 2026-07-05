import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dialpad_wfm";

const dateRangeFields: Record<string, JsonSchema> = {
  start: s.dateTime("Start of the reporting interval in RFC 3339 format."),
  end: s.dateTime("End of the reporting interval in RFC 3339 format."),
};
const emails = s.string({
  minLength: 1,
  description: "Comma-separated agent email addresses to filter by.",
});
const includeDeletedAgents = s.boolean("Whether to include deleted agents in the response.");
const limit = s.integer(
  "Maximum number of metric records to return. Dialpad WFM defaults to 500 and caps the value at 500.",
  {
    minimum: 1,
    maximum: 500,
  },
);
const cursor = s.string({
  minLength: 1,
  description: "Pagination cursor from a previous Dialpad WFM response.",
});
const pageSize = s.integer(
  "Maximum number of schedule entries to return in one response. Dialpad WFM defaults to 100.",
  {
    minimum: 1,
  },
);
const pageAfter = s.string({
  minLength: 1,
  description: "Schedule pagination cursor from the links.next URL in a previous response.",
});
const scheduleEntry = s.looseObject("One Dialpad WFM schedule entry.");
const metricItem = (description: string): JsonSchema => s.looseObject(description);
const scheduleOutput = s.object(
  {
    data: s.array(scheduleEntry, { description: "The schedule entries returned for this page." }),
    links: s.looseRequiredObject("Dialpad WFM schedule pagination links.", {
      self: s.string({ minLength: 1, description: "The URL of this page of schedule results." }),
      next: s.nullable(
        s.string({
          minLength: 1,
          description: "The URL of the next page of schedule results, or null when there are no more pages.",
        }),
      ),
    }),
  },
  { required: ["data", "links"], description: "One page of Dialpad WFM schedule entries." },
);

function metricsInput(description: string): JsonSchema {
  return s.object(
    {
      ...dateRangeFields,
      emails,
      includeDeletedAgents,
      limit,
      cursor,
    },
    {
      required: ["start", "end"],
      optional: ["emails", "includeDeletedAgents", "limit", "cursor"],
      description,
    },
  );
}

function metricsOutput(description: string, itemDescription: string): JsonSchema {
  return s.object(
    {
      items: s.array(metricItem(itemDescription), { description: "The metric records returned for this page." }),
      cursor: s.nullable(
        s.string({
          minLength: 1,
          description: "The pagination cursor for the next page, or null when there are no more results.",
        }),
      ),
    },
    { required: ["items", "cursor"], description },
  );
}

export type DialpadWfmActionName = "get_schedule" | "list_agent_metrics" | "list_activity_metrics";

export const dialpadWfmActions: Array<ProviderActionDefinition<DialpadWfmActionName>> = [
  defineProviderAction(service, {
    name: "get_schedule",
    description: "Retrieve one page of Dialpad WFM schedule entries for an RFC 3339 time interval.",
    inputSchema: s.object(
      {
        ...dateRangeFields,
        includeDeletedAgents: s.boolean(
          "Whether to include deleted agent schedules. Dialpad WFM defaults this to true.",
        ),
        pageSize,
        pageAfter,
      },
      {
        required: ["start", "end"],
        optional: ["includeDeletedAgents", "pageSize", "pageAfter"],
        description: "Filters and pagination options for retrieving Dialpad WFM schedule entries.",
      },
    ),
    outputSchema: scheduleOutput,
  }),
  defineProviderAction(service, {
    name: "list_agent_metrics",
    description: "Retrieve one cursor page of Dialpad WFM agent metrics for an RFC 3339 interval.",
    inputSchema: metricsInput("Filters and pagination options for Dialpad WFM agent metrics."),
    outputSchema: metricsOutput(
      "One page of Dialpad WFM agent metric records.",
      "One raw Dialpad WFM agent metric record.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_activity_metrics",
    description: "Retrieve one cursor page of Dialpad WFM activity metrics for an RFC 3339 interval.",
    inputSchema: metricsInput("Filters and pagination options for Dialpad WFM activity metrics."),
    outputSchema: metricsOutput(
      "One page of Dialpad WFM activity metric records.",
      "One raw Dialpad WFM activity metric record.",
    ),
  }),
];
