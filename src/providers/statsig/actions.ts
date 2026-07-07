import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "statsig";

const rawSchema = s.looseObject("The raw Statsig API response object.");
const statsigObjectSchema = s.looseObject("A Statsig object returned by the Console API.");

const lifecycleTypeSchema = s.stringEnum("The Statsig lifecycle type to filter by.", [
  "TEMPORARY",
  "PERMANENT",
  "STALE",
]);
const gateLifecycleTypeSchema = s.stringEnum("The Statsig gate lifecycle type to filter by.", [
  "TEMPORARY",
  "PERMANENT",
  "STALE",
  "TEMPLATE",
]);
const staleReasonSchema = s.stringEnum("The Statsig stale classification reason to filter by.", [
  "NONE",
  "STALE_PROBABLY_LAUNCHED",
  "STALE_PROBABLY_UNLAUNCHED",
  "STALE_PROBABLY_FORGOTTEN",
  "STALE_NO_RULES",
  "STALE_PROBABLY_DEAD_CHECK",
]);
const gateStaleReasonSchema = s.stringEnum("The Statsig gate stale classification reason to filter by.", [
  "NONE",
  "STALE_PROBABLY_LAUNCHED",
  "STALE_PROBABLY_UNLAUNCHED",
  "STALE_PROBABLY_FORGOTTEN",
  "STALE_NO_RULES",
  "STALE_PROBABLY_DEAD_CHECK",
  "STALE_EMPTY_CHECKS",
  "STALE_ALL_TRUE",
  "STALE_ALL_FALSE",
]);
const rateBucketSchema = s.stringEnum("The Statsig rate bucket to filter by.", ["0", "100", "INBETWEEN"]);

const paginationSchema = s.looseObject("Statsig pagination metadata.", {
  itemsPerPage: s.number("The number of items returned per page."),
  pageNumber: s.number("The current page number."),
  nextPage: s.nullableString("The next page URL or token when Statsig returns one."),
  previousPage: s.nullableString("The previous page URL or token when Statsig returns one."),
  totalItems: s.number("The total number of matching items when Statsig returns it."),
  all: s.string("The URL for all results when Statsig returns it."),
});

const commonEntityFilters = {
  releasePipelineID: s.nonEmptyString("Filter by the associated Statsig release pipeline ID."),
  teamID: s.nonEmptyString("Filter by the Statsig team ID."),
  targetAppID: s.nonEmptyString("Filter by the Statsig target app ID."),
  creatorName: s.nonEmptyString("Filter by the creator name."),
  creatorID: s.nonEmptyString("Filter by the creator ID."),
  tags: s.stringArray("Filter by Statsig tags.", {
    minItems: 1,
    itemDescription: "One Statsig tag.",
  }),
};

const listPagingFields = {
  limit: s.positiveInteger("The maximum number of results to return per page."),
  page: s.positiveInteger("The page number to return."),
};

function listOutputSchema(description: string, dataDescription: string) {
  return s.object(description, {
    message: s.string("The message returned by Statsig."),
    data: s.array(dataDescription, statsigObjectSchema),
    pagination: paginationSchema,
    raw: rawSchema,
  });
}

function singleOutputSchema(description: string, dataDescription: string) {
  return s.object(description, {
    message: s.string("The message returned by Statsig."),
    data: s.looseObject(dataDescription),
    raw: rawSchema,
  });
}

export const statsigActions: ProviderActionDefinition<StatsigActionName>[] = [
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve the Statsig project information visible to the Console API key.",
    inputSchema: s.actionInput({}, [], "The input payload for getting Statsig project information."),
    outputSchema: singleOutputSchema(
      "The response returned with Statsig project information.",
      "The Statsig project information.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_gates",
    description: "List Statsig feature gates with optional lifecycle, ownership, and paging filters.",
    inputSchema: s.object(
      "The input payload for listing Statsig gates.",
      {
        idTypes: s.stringArray("Filter by Statsig ID types.", {
          minItems: 1,
          itemDescription: "One Statsig ID type.",
        }),
        type: gateLifecycleTypeSchema,
        typeReason: gateStaleReasonSchema,
        passRates: s.array("Filter by sampled pass-rate buckets.", rateBucketSchema, { minItems: 1 }),
        rolloutRates: s.array("Filter by rollout-rate buckets.", rateBucketSchema, { minItems: 1 }),
        includeArchived: s.boolean("Whether to include archived gates."),
        includeArchiveMetadata: s.boolean("Whether to include archive metadata for archived gates."),
        store0100Exposures: s.boolean("Filter by whether Store 0/100 Exposures is enabled."),
        ...commonEntityFilters,
        ...listPagingFields,
      },
      {
        optional: [
          "idTypes",
          "type",
          "typeReason",
          "passRates",
          "rolloutRates",
          "includeArchived",
          "includeArchiveMetadata",
          "store0100Exposures",
          "releasePipelineID",
          "teamID",
          "targetAppID",
          "creatorName",
          "creatorID",
          "tags",
          "limit",
          "page",
        ],
      },
    ),
    outputSchema: listOutputSchema(
      "The response returned when listing Statsig gates.",
      "The Statsig gates returned by the Console API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_gate",
    description: "Read one Statsig feature gate by ID.",
    inputSchema: s.object(
      "The input payload for reading a Statsig gate.",
      {
        id: s.nonEmptyString("The Statsig gate ID."),
        includeArchiveMetadata: s.boolean("Whether to include archive metadata for an archived gate."),
      },
      { optional: ["includeArchiveMetadata"] },
    ),
    outputSchema: singleOutputSchema(
      "The response returned with a Statsig gate.",
      "The Statsig gate returned by the Console API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_dynamic_configs",
    description: "List Statsig dynamic configs with optional lifecycle, ownership, and paging filters.",
    inputSchema: s.object(
      "The input payload for listing Statsig dynamic configs.",
      {
        type: lifecycleTypeSchema,
        typeReason: staleReasonSchema,
        ...commonEntityFilters,
        ...listPagingFields,
      },
      {
        optional: [
          "type",
          "typeReason",
          "releasePipelineID",
          "teamID",
          "targetAppID",
          "creatorName",
          "creatorID",
          "tags",
          "limit",
          "page",
        ],
      },
    ),
    outputSchema: listOutputSchema(
      "The response returned when listing Statsig dynamic configs.",
      "The Statsig dynamic configs returned by the Console API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dynamic_config",
    description: "Read one Statsig dynamic config by ID.",
    inputSchema: s.object("The input payload for reading a Statsig dynamic config.", {
      id: s.nonEmptyString("The Statsig dynamic config ID."),
    }),
    outputSchema: singleOutputSchema(
      "The response returned with a Statsig dynamic config.",
      "The Statsig dynamic config returned by the Console API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_segments",
    description: "List Statsig segments using page-based pagination.",
    inputSchema: s.object("The input payload for listing Statsig segments.", listPagingFields, {
      optional: ["limit", "page"],
    }),
    outputSchema: listOutputSchema(
      "The response returned when listing Statsig segments.",
      "The Statsig segments returned by the Console API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_segment",
    description: "Read one Statsig segment by ID.",
    inputSchema: s.object("The input payload for reading a Statsig segment.", {
      id: s.nonEmptyString("The Statsig segment ID."),
    }),
    outputSchema: singleOutputSchema(
      "The response returned with a Statsig segment.",
      "The Statsig segment returned by the Console API.",
    ),
  }),
];

export type StatsigActionName =
  | "get_project"
  | "list_gates"
  | "get_gate"
  | "list_dynamic_configs"
  | "get_dynamic_config"
  | "list_segments"
  | "get_segment";
