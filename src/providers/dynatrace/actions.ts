import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dynatrace";

const pageSizeSchema = s.integer("The number of Dynatrace results to return in one page.", {
  minimum: 1,
  maximum: 500,
});
const nextPageKeySchema = s.nonEmptyString(
  "The cursor from a previous Dynatrace response used to fetch the next page.",
);
const fieldsSchema = s.nonEmptyString(
  "Comma-separated Dynatrace fields selector, such as +properties or +evidenceDetails.",
);
const problemSelectorSchema = s.nonEmptyString("Dynatrace problemSelector expression used to filter problems.");
const entitySelectorSchema = s.nonEmptyString("Dynatrace entitySelector expression used to filter monitored entities.");
const timeframeSchema = s.nonEmptyString("Dynatrace timeframe expression such as now-2h or an ISO-8601 timestamp.");
const rawObjectSchema = s.looseObject("The raw object returned by Dynatrace.");

const problemSchema = s.object("A normalized Dynatrace problem.", {
  problemId: s.nullable(s.string("The Dynatrace problem identifier.")),
  displayId: s.nullable(s.string("The user-facing Dynatrace problem display identifier.")),
  title: s.nullable(s.string("The problem title returned by Dynatrace.")),
  status: s.nullable(s.string("The problem status returned by Dynatrace.")),
  severityLevel: s.nullable(s.string("The problem severity level returned by Dynatrace.")),
  raw: rawObjectSchema,
});
const entitySchema = s.object("A normalized Dynatrace monitored entity.", {
  entityId: s.nullable(s.string("The Dynatrace entity identifier.")),
  displayName: s.nullable(s.string("The monitored entity display name.")),
  type: s.nullable(s.string("The monitored entity type.")),
  raw: rawObjectSchema,
});

export type DynatraceActionName = "list_problems" | "list_entities" | "get_entity";

export const dynatraceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_problems",
    description: "List Dynatrace Problems API v2 problems with optional selectors and pagination.",
    requiredScopes: ["problems.read"],
    inputSchema: s.object(
      "The input payload for listing Dynatrace problems.",
      {
        problemSelector: problemSelectorSchema,
        entitySelector: entitySelectorSchema,
        nextPageKey: nextPageKeySchema,
        pageSize: pageSizeSchema,
        from: timeframeSchema,
        to: timeframeSchema,
        fields: fieldsSchema,
      },
      {
        optional: ["problemSelector", "entitySelector", "nextPageKey", "pageSize", "from", "to", "fields"],
      },
    ),
    outputSchema: s.object("The normalized response returned when listing Dynatrace problems.", {
      problems: s.array("The Dynatrace problems returned for the request.", problemSchema),
      totalCount: s.nullable(s.integer("The total number of matching Dynatrace problems.")),
      pageSize: s.nullable(s.integer("The page size returned by Dynatrace.")),
      nextPageKey: s.nullable(s.string("The cursor for the next page when available.")),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_entities",
    description: "List Dynatrace monitored entities with optional selector, fields, and pagination.",
    requiredScopes: ["entities.read"],
    inputSchema: s.object(
      "The input payload for listing Dynatrace monitored entities.",
      {
        entitySelector: entitySelectorSchema,
        nextPageKey: nextPageKeySchema,
        pageSize: pageSizeSchema,
        fields: fieldsSchema,
      },
      { optional: ["entitySelector", "nextPageKey", "pageSize", "fields"] },
    ),
    outputSchema: s.object("The normalized response returned when listing Dynatrace entities.", {
      entities: s.array("The Dynatrace monitored entities returned for the request.", entitySchema),
      totalCount: s.nullable(s.integer("The total number of matching Dynatrace entities.")),
      pageSize: s.nullable(s.integer("The page size returned by Dynatrace.")),
      nextPageKey: s.nullable(s.string("The cursor for the next page when available.")),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_entity",
    description: "Get one Dynatrace monitored entity by entity ID.",
    requiredScopes: ["entities.read"],
    inputSchema: s.object(
      "The input payload for reading one Dynatrace monitored entity.",
      {
        entityId: s.nonEmptyString("The Dynatrace entity ID to read."),
        fields: fieldsSchema,
      },
      { optional: ["fields"] },
    ),
    outputSchema: s.object("The normalized response returned when reading a Dynatrace entity.", {
      entity: entitySchema,
      raw: rawObjectSchema,
    }),
  }),
];
