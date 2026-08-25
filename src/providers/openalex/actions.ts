import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { openalexEntityValues } from "./constants.ts";

const service = "openalex";

const entitySchema = s.stringEnum("The OpenAlex entity collection to query.", openalexEntityValues);
const entityIdSchema = s.string(
  "The OpenAlex entity identifier, such as W2741809807, A5023888391, or an OpenAlex URL.",
  { minLength: 1 },
);
const searchSchema = s.nonEmptyString("A full-text search string sent with OpenAlex search.");
const filterSchema = s.nonEmptyString(
  "An OpenAlex filter expression, such as publication_year:2024 or cited_by_count:>100.",
);
const sortSchema = s.nonEmptyString(
  "An OpenAlex sort expression, such as cited_by_count:desc or publication_year:desc.",
);
const cursorSchema = s.nonEmptyString("The OpenAlex cursor value for cursor pagination. Use * for the first page.");
const pageSchema = s.integer("The OpenAlex page number for basic paging.", { minimum: 1 });
const perPageSchema = s.integer("The number of records to return per page.", {
  minimum: 1,
  maximum: 200,
});
const selectSchema = s.array(
  "Specific OpenAlex fields to return.",
  s.nonEmptyString("One OpenAlex field name to include in the response."),
  { minItems: 1 },
);
const groupBySchema = s.nonEmptyString(
  "An OpenAlex field to group by, such as publication_year or institutions.country_code.",
);
const sampleSchema = s.integer("The number of random records to sample.", {
  minimum: 1,
  maximum: 200,
});
const seedSchema = s.integer("The seed used with OpenAlex random sampling.");

const rawObjectSchema = s.looseObject("The raw OpenAlex object.");
const metaSchema = s.object("The OpenAlex response metadata.", {
  count: s.nullable(s.integer("The total number of records matching the query.")),
  dbResponseTimeMs: s.nullable(s.integer("The upstream database response time in milliseconds.")),
  page: s.nullable(s.integer("The current page number when page pagination is used.")),
  perPage: s.nullable(s.integer("The number of records returned per page.")),
  nextCursor: s.nullable(s.string("The next cursor value for cursor pagination.")),
  groupsCount: s.nullable(s.integer("The total group count when grouping is used.")),
  raw: rawObjectSchema,
});

const entitySummarySchema = s.object("A normalized OpenAlex entity summary.", {
  id: s.nullable(s.string("The OpenAlex entity URL identifier.")),
  openalexId: s.nullable(s.string("The short OpenAlex identifier extracted from the entity URL.")),
  displayName: s.nullable(s.string("The entity display name or title.")),
  worksCount: s.nullable(s.integer("The number of works associated with the entity.")),
  citedByCount: s.nullable(s.integer("The number of citations associated with the entity.")),
  homepageUrl: s.nullable(s.string("The homepage URL returned by OpenAlex when present.")),
  raw: rawObjectSchema,
});

const workSummarySchema = s.object("A normalized OpenAlex work summary.", {
  id: s.nullable(s.string("The OpenAlex work URL identifier.")),
  openalexId: s.nullable(s.string("The short OpenAlex work identifier extracted from the URL.")),
  doi: s.nullable(s.string("The DOI returned by OpenAlex when present.")),
  title: s.nullable(s.string("The work title.")),
  publicationYear: s.nullable(s.integer("The work publication year.")),
  publicationDate: s.nullable(s.string("The work publication date.")),
  type: s.nullable(s.string("The OpenAlex work type.")),
  citedByCount: s.nullable(s.integer("The number of citations for the work.")),
  openAccessUrl: s.nullable(s.string("The best open access URL returned by OpenAlex.")),
  primaryLocationUrl: s.nullable(s.string("The landing page URL from the primary location.")),
  raw: rawObjectSchema,
});

const groupSchema = s.object("A normalized OpenAlex group result.", {
  key: s.nullable(s.string("The OpenAlex group key.")),
  keyDisplayName: s.nullable(s.string("The display name for the group key.")),
  count: s.nullable(s.integer("The number of records in this group.")),
  raw: rawObjectSchema,
});

const autocompleteItemSchema = s.object("A normalized OpenAlex autocomplete item.", {
  id: s.nullable(s.string("The OpenAlex entity URL identifier.")),
  openalexId: s.nullable(s.string("The short OpenAlex identifier extracted from the URL.")),
  displayName: s.nullable(s.string("The autocomplete display name.")),
  hint: s.nullable(s.string("The OpenAlex hint text for the result.")),
  entityType: s.nullable(s.string("The OpenAlex entity type returned for the result.")),
  citedByCount: s.nullable(s.integer("The citation count returned for the result.")),
  worksCount: s.nullable(s.integer("The works count returned for the result.")),
  externalId: s.nullable(s.string("An external identifier returned by OpenAlex when present.")),
  raw: rawObjectSchema,
});

const listInputSchema = s.object(
  "Input parameters for listing or searching OpenAlex entities.",
  {
    entity: entitySchema,
    search: searchSchema,
    filter: filterSchema,
    sort: sortSchema,
    cursor: cursorSchema,
    page: pageSchema,
    perPage: perPageSchema,
    select: selectSchema,
    groupBy: groupBySchema,
    sample: sampleSchema,
    seed: seedSchema,
  },
  {
    optional: ["search", "filter", "sort", "cursor", "page", "perPage", "select", "groupBy", "sample", "seed"],
  },
);

export const openalexActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_entities",
    description: "List, search, filter, page, or group OpenAlex entities from the supported collections.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.object("The response returned when listing OpenAlex entities.", {
      meta: metaSchema,
      results: s.array("The normalized OpenAlex entity results.", entitySummarySchema),
      groups: s.array("The normalized OpenAlex group results when groupBy is used.", groupSchema),
      rawResults: s.array("The raw OpenAlex results.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_works",
    description: "List, search, filter, page, or group OpenAlex works with work-focused normalized fields.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing or searching OpenAlex works.",
      {
        search: searchSchema,
        filter: filterSchema,
        sort: sortSchema,
        cursor: cursorSchema,
        page: pageSchema,
        perPage: perPageSchema,
        select: selectSchema,
        groupBy: groupBySchema,
        sample: sampleSchema,
        seed: seedSchema,
      },
      {
        optional: ["search", "filter", "sort", "cursor", "page", "perPage", "select", "groupBy", "sample", "seed"],
      },
    ),
    outputSchema: s.object("The response returned when listing OpenAlex works.", {
      meta: metaSchema,
      works: s.array("The normalized OpenAlex works.", workSummarySchema),
      groups: s.array("The normalized OpenAlex group results when groupBy is used.", groupSchema),
      rawResults: s.array("The raw OpenAlex work results.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_entity",
    description: "Get one OpenAlex entity by identifier from a supported collection.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for getting one OpenAlex entity.",
      {
        entity: entitySchema,
        id: entityIdSchema,
      },
      { required: ["entity", "id"] },
    ),
    outputSchema: s.object("The response returned when getting one OpenAlex entity.", {
      entity: entitySummarySchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_work",
    description: "Get one OpenAlex work by identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for getting one OpenAlex work.",
      {
        id: entityIdSchema,
      },
      { required: ["id"] },
    ),
    outputSchema: s.object("The response returned when getting one OpenAlex work.", {
      work: workSummarySchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "autocomplete",
    description: "Return OpenAlex autocomplete suggestions for a search string.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for OpenAlex autocomplete.",
      {
        search: searchSchema,
        entity: entitySchema,
        perPage: perPageSchema,
      },
      { optional: ["entity", "perPage"] },
    ),
    outputSchema: s.object("The response returned by OpenAlex autocomplete.", {
      meta: metaSchema,
      results: s.array("The normalized OpenAlex autocomplete results.", autocompleteItemSchema),
      rawResults: s.array("The raw OpenAlex autocomplete results.", rawObjectSchema),
    }),
  }),
];
