import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fathom";

function maxLengthString(description: string, maxLength: number): JsonSchema {
  return s.string(description, { minLength: 1, maxLength });
}

const paginationInput = {
  limit: s.integer("The maximum number of objects to return, from 1 to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  starting_after: s.nonEmptyString("A cursor object ID used to page forward chronologically."),
  ending_before: s.nonEmptyString("A cursor object ID used to page backward in reverse chronology."),
};

const siteId = s.nonEmptyString("The Fathom site ID used in the tracking code, such as CDBUGS.");
const eventId = s.nonEmptyString("The Fathom event ID, such as signed-up-to-newsletter.");
const milestoneId = s.nonEmptyString("The Fathom milestone ID.");
const dateTimeString = s.nonEmptyString("A Fathom timestamp string, such as 2024-01-15 00:00:00.");

const accountOutputSchema = s.looseObject(
  {
    id: s.integer("The numeric Fathom account ID."),
    object: s.nonEmptyString("The Fathom object type, usually account."),
    name: s.nonEmptyString("The account owner's display name."),
    email: s.email("The account owner's email address."),
  },
  { description: "The Fathom account that owns the API key." },
);

const siteObjectSchema = s.looseObject(
  {
    id: s.nonEmptyString("The Fathom site ID."),
    object: s.nonEmptyString("The Fathom object type, usually site."),
    name: s.nonEmptyString("The site display name."),
    sharing: s.nonEmptyString("The site's dashboard sharing configuration."),
    created_at: dateTimeString,
    timezone: s.nonEmptyString("The site's reporting timezone as a TZ database name."),
  },
  { description: "A Fathom site object." },
);

const eventObjectSchema = s.looseObject(
  {
    id: s.nonEmptyString("The Fathom event ID."),
    object: s.nonEmptyString("The Fathom object type, usually event."),
    name: s.nonEmptyString("The event display name."),
    site_id: s.nonEmptyString("The Fathom site ID that owns this event."),
    created_at: dateTimeString,
  },
  { description: "A Fathom event object." },
);

const milestoneObjectSchema = s.looseObject(
  {
    id: s.nonEmptyString("The Fathom milestone ID."),
    object: s.nonEmptyString("The Fathom object type, usually milestone."),
    name: s.nonEmptyString("The milestone display name."),
    milestone_date: dateTimeString,
    created_at: dateTimeString,
    updated_at: dateTimeString,
  },
  { description: "A Fathom milestone object." },
);

function listOutputSchema(description: string, itemDescription: string, itemSchema: JsonSchema): JsonSchema {
  return s.requiredObject(description, {
    object: s.nonEmptyString("The Fathom collection object type, usually list."),
    url: s.nonEmptyString("The Fathom API path used for this list response."),
    has_more: s.boolean("Whether more results are available after this page."),
    data: s.array(itemDescription, itemSchema),
  });
}

function paginatedInput(description: string, properties: Record<string, JsonSchema> = {}): JsonSchema {
  return s.object(
    description,
    { ...properties, ...paginationInput },
    {
      optional: ["limit", "starting_after", "ending_before"],
    },
  );
}

const siteInputFields = {
  name: maxLengthString("The website display name, up to 255 characters.", 255),
  sharing: s.stringEnum("The dashboard sharing configuration for the site.", ["none", "private", "public"]),
  share_password: s.nonEmptyString("The password required when sharing is set to private."),
  timezone: s.nonEmptyString("The site's reporting timezone as a TZ database name."),
};

const createSiteInputSchema = s.object("The input payload for creating a Fathom site.", siteInputFields, {
  optional: ["sharing", "share_password", "timezone"],
});

const updateSiteInputSchema = s.object(
  "The input payload for updating a Fathom site.",
  { site_id: siteId, ...siteInputFields },
  { optional: ["name", "sharing", "share_password", "timezone"] },
);

const createEventInputSchema = s.requiredObject("The input payload for creating a Fathom event.", {
  site_id: siteId,
  name: maxLengthString("The event display name, up to 255 characters.", 255),
});

const updateEventInputSchema = s.object(
  "The input payload for updating a Fathom event.",
  {
    site_id: siteId,
    event_id: eventId,
    name: maxLengthString("The event display name, up to 255 characters.", 255),
  },
  { optional: ["name"] },
);

const createMilestoneInputSchema = s.requiredObject("The input payload for creating a Fathom milestone.", {
  site_id: siteId,
  name: maxLengthString("The milestone display name, up to 255 characters.", 255),
  milestone_date: s.date("The milestone date in YYYY-MM-DD format. It must be before today."),
});

const updateMilestoneInputSchema = s.object(
  "The input payload for updating a Fathom milestone.",
  {
    site_id: siteId,
    milestone_id: milestoneId,
    name: maxLengthString("The milestone display name, up to 255 characters.", 255),
    milestone_date: s.date("The milestone date in YYYY-MM-DD format. It must be before today."),
  },
  { optional: ["name", "milestone_date"] },
);

const aggregationFilterSchema = s.requiredObject("A Fathom aggregation filter.", {
  property: s.nonEmptyString("The Fathom field to filter on, such as pathname or device_type."),
  operator: s.stringEnum("The filter operator to apply.", [
    "is",
    "is not",
    "is like",
    "is not like",
    "matching",
    "not matching",
  ]),
  value: s.nonEmptyString("The value to compare against the selected property."),
});

const aggregationInputSchema = s.object(
  "The input payload for generating a Fathom aggregation report.",
  {
    entity: s.stringEnum("The Fathom entity to report on.", ["pageview", "event"]),
    entity_id: s.nonEmptyString("The site ID for pageview aggregations."),
    site_id: siteId,
    entity_name: s.nonEmptyString("The event name for event aggregations."),
    aggregates: s.array(
      "The SUM aggregate fields to include in the report.",
      s.stringEnum("A Fathom aggregate field.", [
        "visits",
        "uniques",
        "pageviews",
        "avg_duration",
        "bounce_rate",
        "conversions",
        "unique_conversions",
        "value",
      ]),
      { minItems: 1 },
    ),
    date_grouping: s.stringEnum("The date grouping granularity for the report.", ["hour", "day", "month", "year"]),
    field_grouping: s.array(
      "The Fathom fields to group report rows by.",
      s.stringEnum("A Fathom grouping field.", [
        "hostname",
        "pathname",
        "referrer_hostname",
        "referrer_pathname",
        "referrer_source",
        "browser",
        "country_code",
        "city",
        "region",
        "device_type",
        "operating_system",
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
        "utm_term",
        "keyword",
        "q",
        "ref",
        "s",
      ]),
      { minItems: 1 },
    ),
    sort_by: s.nonEmptyString("The sort expression in field:asc or field:desc form."),
    timezone: s.nonEmptyString("Deprecated Fathom timezone override as a TZ database name."),
    date_from: s.nonEmptyString("The report start timestamp, such as 2022-04-01 15:31:00."),
    date_to: s.nonEmptyString("The report end timestamp, such as 2022-04-30 23:59:59."),
    limit: s.integer("The maximum number of aggregation rows to return.", { minimum: 1 }),
    filters: s.array(
      "Structured Fathom filters to JSON-encode for the filters query parameter.",
      aggregationFilterSchema,
      { minItems: 1 },
    ),
  },
  {
    optional: [
      "entity_id",
      "site_id",
      "entity_name",
      "date_grouping",
      "field_grouping",
      "sort_by",
      "timezone",
      "date_from",
      "date_to",
      "limit",
      "filters",
    ],
  },
);

const aggregationOutputSchema = s.array(
  "Rows returned by the Fathom aggregation report.",
  s.record(s.unknown("A Fathom aggregation row value."), {
    description: "A Fathom aggregation row. Keys vary based on requested aggregates and groupings.",
  }),
);

const currentVisitorsInputSchema = s.object(
  "The input payload for fetching current Fathom visitors.",
  {
    site_id: siteId,
    detailed: s.boolean("Whether to include top content and referrer breakdowns."),
  },
  { optional: ["detailed"] },
);

const currentVisitorsOutputSchema = s.looseObject(
  {
    total: s.integer("The number of current visitors on the site."),
    content: s.array(
      "The top content rows when detailed mode is enabled.",
      s.looseObject(
        {
          pathname: s.nonEmptyString("The content pathname."),
          hostname: s.nonEmptyString("The content hostname."),
          total: s.integer("The number of current visitors for this content row."),
        },
        { description: "A current visitor content row." },
      ),
    ),
    referrers: s.array(
      "The top referrer rows when detailed mode is enabled.",
      s.looseObject(
        {
          referrer_hostname: s.nonEmptyString("The referrer hostname."),
          referrer_pathname: s.nonEmptyString("The referrer pathname."),
          total: s.integer("The number of current visitors for this referrer row."),
        },
        { description: "A current visitor referrer row." },
      ),
    ),
  },
  { description: "The current visitor response from Fathom." },
);

export const fathomActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve the Fathom account that owns the API key.",
    inputSchema: s.object("No input is required to fetch the Fathom account.", {}),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sites",
    description: "List Fathom sites available to the API key.",
    inputSchema: paginatedInput("The input payload for listing Fathom sites."),
    outputSchema: listOutputSchema(
      "A paginated Fathom site list.",
      "The Fathom sites returned for this page.",
      siteObjectSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_site",
    description: "Retrieve a single Fathom site by site ID.",
    inputSchema: s.requiredObject("The input payload for fetching a Fathom site.", { site_id: siteId }),
    outputSchema: siteObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_site",
    description: "Create a Fathom site.",
    inputSchema: createSiteInputSchema,
    outputSchema: siteObjectSchema,
  }),
  defineProviderAction(service, {
    name: "update_site",
    description: "Update a Fathom site.",
    inputSchema: updateSiteInputSchema,
    outputSchema: siteObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List events for a Fathom site.",
    inputSchema: paginatedInput("The input payload for listing Fathom events.", {
      site_id: siteId,
    }),
    outputSchema: listOutputSchema(
      "A paginated Fathom event list.",
      "The Fathom events returned for this page.",
      eventObjectSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_event",
    description: "Retrieve a single Fathom event by site ID and event ID.",
    inputSchema: s.requiredObject("The input payload for fetching a Fathom event.", {
      site_id: siteId,
      event_id: eventId,
    }),
    outputSchema: eventObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_event",
    description: "Create a Fathom event for a site.",
    inputSchema: createEventInputSchema,
    outputSchema: eventObjectSchema,
  }),
  defineProviderAction(service, {
    name: "update_event",
    description: "Update a Fathom event.",
    inputSchema: updateEventInputSchema,
    outputSchema: eventObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_milestones",
    description: "List milestones for a Fathom site.",
    inputSchema: paginatedInput("The input payload for listing Fathom milestones.", {
      site_id: siteId,
    }),
    outputSchema: listOutputSchema(
      "A paginated Fathom milestone list.",
      "The Fathom milestones returned for this page.",
      milestoneObjectSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_milestone",
    description: "Retrieve a single Fathom milestone by site ID and milestone ID.",
    inputSchema: s.requiredObject("The input payload for fetching a Fathom milestone.", {
      site_id: siteId,
      milestone_id: milestoneId,
    }),
    outputSchema: milestoneObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_milestone",
    description: "Create a Fathom milestone for a site.",
    inputSchema: createMilestoneInputSchema,
    outputSchema: milestoneObjectSchema,
  }),
  defineProviderAction(service, {
    name: "update_milestone",
    description: "Update a Fathom milestone.",
    inputSchema: updateMilestoneInputSchema,
    outputSchema: milestoneObjectSchema,
  }),
  defineProviderAction(service, {
    name: "run_aggregation",
    description: "Generate a Fathom analytics aggregation report.",
    inputSchema: aggregationInputSchema,
    outputSchema: aggregationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_visitors",
    description: "Fetch the current visitor count and optional detailed breakdown for a Fathom site.",
    inputSchema: currentVisitorsInputSchema,
    outputSchema: currentVisitorsOutputSchema,
  }),
];

export type FathomActionName =
  | "get_account"
  | "list_sites"
  | "get_site"
  | "create_site"
  | "update_site"
  | "list_events"
  | "get_event"
  | "create_event"
  | "update_event"
  | "list_milestones"
  | "get_milestone"
  | "create_milestone"
  | "update_milestone"
  | "run_aggregation"
  | "get_current_visitors";
