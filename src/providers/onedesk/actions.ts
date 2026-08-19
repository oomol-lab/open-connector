import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "onedesk";

const nullFilterValueSchema: JsonSchema = {
  type: "null",
  description: "A null filter value for empty or unset custom fields.",
};

const filterOperationSchema = s.stringEnum("The OneDesk filter comparison operation to apply.", [
  "EQ",
  "NE",
  "CONTAINS",
  "NOT_CONTAINS",
  "LE",
  "LT",
  "GT",
  "GE",
]);
const filterScalarValueSchema = s.anyOf("A scalar OneDesk filter value.", [
  s.string("A string filter value."),
  s.number("A numeric filter value."),
  s.boolean("A boolean filter value."),
  nullFilterValueSchema,
]);
const filterValueSchema = s.anyOf("The value OneDesk should use in the filtering operation.", [
  filterScalarValueSchema,
  s.array("A list of filter values.", filterScalarValueSchema, { minItems: 1 }),
]);
const propertyFilterSchema = s.requiredObject("A OneDesk property filter.", {
  property: s.nonEmptyString("The OneDesk property name to filter, such as name or creationTime."),
  operation: filterOperationSchema,
  value: filterValueSchema,
});
const customFieldFilterSchema = s.requiredObject("A OneDesk custom field filter.", {
  name: s.nonEmptyString("The OneDesk custom field name to filter."),
  operation: filterOperationSchema,
  value: filterValueSchema,
});

const filterInputFields = {
  properties: s.array("The OneDesk property filters to apply.", propertyFilterSchema, {
    minItems: 1,
  }),
  customFields: s.array("The OneDesk custom field filters to apply.", customFieldFilterSchema, {
    minItems: 1,
  }),
  isAsc: s.boolean(
    "Whether OneDesk should return results in ascending creation order. Defaults to descending when omitted.",
  ),
  limit: s.integer(
    "The maximum number of external IDs to return. OneDesk allows up to 200 on external ID filter endpoints.",
    { minimum: 1, maximum: 200 },
  ),
  offset: s.nonNegativeInteger("The zero-based result offset to start from."),
};

const filterOutputFields = {
  code: s.nullable(s.string("The OneDesk API result code.")),
  externalIds: s.array("The matching OneDesk external IDs.", s.string("A matching external ID.")),
  totalNum: s.nullableInteger("The total number of resources matching the filter."),
  appliedPropertyFilters: s.array(
    "The property filters OneDesk applied.",
    s.looseObject("One applied property filter returned by OneDesk."),
  ),
  appliedCustomFieldFilters: s.array(
    "The custom field filters OneDesk applied.",
    s.looseObject("One applied custom field filter returned by OneDesk."),
  ),
  notAppliedPropertyFilters: s.array(
    "Property filters OneDesk could not apply.",
    s.string("A not-applied property filter reason."),
  ),
  notAppliedCustomFieldFilters: s.array(
    "Custom field filters OneDesk could not apply.",
    s.string("A not-applied custom field filter reason."),
  ),
  raw: s.looseObject("The raw OneDesk filter response."),
};

const detailLookupSchema = s.oneOf(
  [
    s.requiredObject("Look up a OneDesk resource by external ID.", {
      externalId: s.nonEmptyString("The OneDesk external ID of the resource."),
    }),
    s.requiredObject("Look up a OneDesk resource by numeric ID.", {
      id: s.positiveInteger("The numeric OneDesk ID of the resource."),
    }),
  ],
  {
    description: "The OneDesk detail lookup input. Provide either externalId or id.",
  },
);

const resultCodeDataOutput = {
  code: s.nullable(s.string("The OneDesk API result code.")),
  data: s.unknown("The OneDesk response data."),
  raw: s.looseObject("The raw OneDesk response."),
};

export const onedeskActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_organization_profile",
    description: "Get the OneDesk organization profile and policy for the connected API key.",
    inputSchema: s.object("The input payload for getting the OneDesk organization profile.", {}),
    outputSchema: s.requiredObject(
      "The OneDesk organization profile and policy returned by the public API.",
      resultCodeDataOutput,
    ),
  }),
  defineProviderAction(service, {
    name: "filter_projects",
    description: "Filter OneDesk projects and return matching project external IDs.",
    inputSchema: s.object("Input parameters for filtering OneDesk projects.", filterInputFields, {
      optional: ["properties", "customFields", "isAsc", "limit", "offset"],
    }),
    outputSchema: s.requiredObject("The normalized OneDesk project filter result.", filterOutputFields),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get OneDesk project details by external ID or numeric ID.",
    inputSchema: detailLookupSchema,
    outputSchema: s.requiredObject("The normalized OneDesk project details response.", {
      code: s.nullable(s.string("The OneDesk API result code.")),
      project: s.looseObject("The OneDesk project details."),
      raw: s.looseObject("The raw OneDesk project response."),
    }),
  }),
  defineProviderAction(service, {
    name: "filter_items",
    description: "Filter OneDesk work items by item type and return matching external IDs.",
    inputSchema: s.object(
      "Input parameters for filtering OneDesk work items.",
      {
        itemTypes: s.array(
          "The OneDesk item types to include, such as ticket or task.",
          s.nonEmptyString("A OneDesk item type."),
          { minItems: 1 },
        ),
        ...filterInputFields,
      },
      { optional: ["properties", "customFields", "isAsc", "limit", "offset"] },
    ),
    outputSchema: s.requiredObject("The normalized OneDesk item filter result.", filterOutputFields),
  }),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get OneDesk work item details by external ID or numeric ID.",
    inputSchema: detailLookupSchema,
    outputSchema: s.requiredObject("The normalized OneDesk work item details response.", {
      code: s.nullable(s.string("The OneDesk API result code.")),
      item: s.looseObject("The OneDesk work item details."),
      raw: s.looseObject("The raw OneDesk item response."),
    }),
  }),
];
