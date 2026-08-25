import type { JsonSchema, ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "next_dns";

const profileIdSchema = s.string({
  minLength: 1,
  pattern: "\\S",
  description: "The NextDNS profile ID.",
});
const dateFilterSchema = (description: string): JsonSchema =>
  s.string({
    minLength: 1,
    pattern: "\\S",
    description,
  });
const limitSchema = s.integer({
  minimum: 1,
  maximum: 500,
  description: "The maximum number of items to return.",
});
const logsLimitSchema = s.integer({
  minimum: 10,
  maximum: 1000,
  description: "The maximum number of log entries to return.",
});
const cursorSchema = s.nonEmptyString("The opaque pagination cursor from a previous response.");
const deviceSchema = s.nonEmptyString(
  "The NextDNS device ID to filter by, or __UNIDENTIFIED__ for unidentified devices.",
);
const statusSchema = s.stringEnum(["default", "error", "blocked", "allowed"], {
  description: "The DNS query status to filter by.",
});
const analyticsStatusSchema = s.stringEnum(["default", "blocked", "allowed"], {
  description: "The analytics status to filter by.",
});

const paginationSchema = s.object(
  {
    cursor: s.string("The cursor for the next page of results."),
  },
  {
    optional: ["cursor"],
    description: "The pagination metadata returned by NextDNS.",
  },
);
const metaSchema = s.looseObject(
  {
    pagination: paginationSchema,
  },
  { description: "The response metadata returned by NextDNS." },
);
const profileItemSchema = s.looseObject(
  {
    id: s.string("The NextDNS profile ID."),
    name: s.string("The profile name."),
    role: s.string("The current user's role for this profile."),
    fingerprint: s.string("The profile fingerprint when returned by NextDNS."),
  },
  { description: "A NextDNS profile summary." },
);
const rawProfileSchema = s.looseObject("The raw profile object returned by NextDNS.");
const analyticsItemSchema = s.looseObject(
  {
    id: s.string("The item identifier when returned by NextDNS."),
    name: s.string("The item display name when returned by NextDNS."),
    domain: s.string("The domain value when returned by NextDNS."),
    status: s.string("The status value when returned by NextDNS."),
    queries: s.integer("The query count for this item."),
  },
  { description: "One NextDNS analytics item." },
);

function listResponseSchema(description: string, itemSchema: JsonSchema): JsonSchema {
  return s.object(
    {
      data: s.array("The items returned by NextDNS.", itemSchema),
      meta: s.nullable(metaSchema),
      raw: s.looseObject("The raw response returned by NextDNS."),
    },
    {
      required: ["data", "meta", "raw"],
      description,
    },
  );
}

const analyticsInputProperties: Record<string, JsonSchema> = {
  profileId: profileIdSchema,
  from: dateFilterSchema(
    "The inclusive start date filter. NextDNS accepts ISO timestamps, Unix timestamps, and relative values such as -7d.",
  ),
  to: dateFilterSchema(
    "The exclusive end date filter. NextDNS accepts ISO timestamps, Unix timestamps, and relative values such as now.",
  ),
  limit: limitSchema,
  cursor: cursorSchema,
  device: deviceSchema,
};

export const nextDnsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_profiles",
    description: "List NextDNS profiles available to the authenticated account.",
    inputSchema: s.object({}, { description: "The input payload for listing NextDNS profiles." }),
    outputSchema: listResponseSchema("The response returned when listing NextDNS profiles.", profileItemSchema),
  }),
  defineProviderAction(service, {
    name: "get_profile",
    description: "Get one NextDNS profile with its current settings and setup details.",
    inputSchema: s.object(
      {
        profileId: profileIdSchema,
      },
      {
        required: ["profileId"],
        description: "The input payload for retrieving a NextDNS profile.",
      },
    ),
    outputSchema: s.object(
      {
        profile: rawProfileSchema,
        raw: s.looseObject("The raw response returned by NextDNS."),
      },
      {
        required: ["profile", "raw"],
        description: "The response returned when retrieving a NextDNS profile.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_logs",
    description: "List DNS query logs for a NextDNS profile with optional filters.",
    inputSchema: s.object(
      {
        profileId: profileIdSchema,
        from: dateFilterSchema(
          "The inclusive start date filter. NextDNS accepts ISO timestamps, Unix timestamps, and relative values such as -1d.",
        ),
        to: dateFilterSchema(
          "The exclusive end date filter. NextDNS accepts ISO timestamps, Unix timestamps, and relative values such as now.",
        ),
        limit: logsLimitSchema,
        cursor: cursorSchema,
        device: deviceSchema,
        search: s.nonEmptyString("The domain or substring to search for in logs."),
        status: statusSchema,
        sort: s.stringEnum(["asc", "desc"], { description: "The log order to request from NextDNS." }),
        raw: s.boolean("Whether to return raw DNS queries instead of filtered navigational logs."),
      },
      {
        required: ["profileId"],
        optional: ["from", "to", "limit", "cursor", "device", "search", "status", "sort", "raw"],
        description: "The input payload for listing NextDNS logs.",
      },
    ),
    outputSchema: listResponseSchema(
      "The response returned when listing NextDNS logs.",
      s.looseObject(
        {
          timestamp: s.string("The query timestamp."),
          domain: s.string("The queried domain."),
          status: s.string("The query status."),
          protocol: s.string("The query protocol."),
          reasons: s.array("The reasons attached to this log entry.", s.looseObject("One log reason.")),
        },
        { description: "One NextDNS log entry." },
      ),
    ),
  }),
  defineProviderAction(service, {
    name: "get_analytics_domains",
    description: "List per-domain DNS query analytics for a NextDNS profile.",
    inputSchema: s.object(
      {
        ...analyticsInputProperties,
        status: analyticsStatusSchema,
        root: s.boolean("Whether to aggregate results by root domain."),
      },
      {
        required: ["profileId"],
        optional: ["from", "to", "limit", "cursor", "device", "status", "root"],
        description: "The input payload for retrieving NextDNS domain analytics.",
      },
    ),
    outputSchema: listResponseSchema(
      "The response returned when listing NextDNS domain analytics.",
      analyticsItemSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_analytics_devices",
    description: "List per-device DNS query analytics for a NextDNS profile.",
    inputSchema: s.object(analyticsInputProperties, {
      required: ["profileId"],
      optional: ["from", "to", "limit", "cursor", "device"],
      description: "The input payload for retrieving NextDNS device analytics.",
    }),
    outputSchema: listResponseSchema(
      "The response returned when listing NextDNS device analytics.",
      analyticsItemSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_analytics_status",
    description: "List DNS query counts grouped by status for a NextDNS profile.",
    inputSchema: s.object(analyticsInputProperties, {
      required: ["profileId"],
      optional: ["from", "to", "limit", "cursor", "device"],
      description: "The input payload for retrieving NextDNS status analytics.",
    }),
    outputSchema: listResponseSchema(
      "The response returned when listing NextDNS status analytics.",
      analyticsItemSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_analytics_reasons",
    description: "List DNS query counts grouped by blocking reason for a NextDNS profile.",
    inputSchema: s.object(analyticsInputProperties, {
      required: ["profileId"],
      optional: ["from", "to", "limit", "cursor", "device"],
      description: "The input payload for retrieving NextDNS blocking-reason analytics.",
    }),
    outputSchema: listResponseSchema(
      "The response returned when listing NextDNS blocking-reason analytics.",
      analyticsItemSchema,
    ),
  }),
];
