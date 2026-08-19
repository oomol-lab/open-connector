import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "storyblok";

const nonEmptyString = (description: string) => s.string({ description, minLength: 1 });
const versionSchema = s.stringEnum("Storyblok content version to request.", ["draft", "published"]);
const resolveLinksSchema = s.stringEnum("Storyblok link resolution mode.", ["story", "url", "link"]);
const zeroOrOneSchema = s.integer("Storyblok numeric boolean flag, where 1 means yes and 0 means no.", {
  minimum: 0,
  maximum: 1,
});

const paginationInputProperties = {
  page: s.positiveInteger("Page number to request from Storyblok."),
  per_page: s.positiveInteger("Maximum number of items to request per page.", { maximum: 1000 }),
};

const paginationOutputSchema = s.object(
  "Pagination metadata derived from Storyblok response headers.",
  {
    total: s.nonNegativeInteger("Total number of matching items reported by Storyblok."),
    per_page: s.positiveInteger("Number of items per page reported by Storyblok."),
  },
  { optional: ["total", "per_page"] },
);

const componentContentSchema = s.looseObject("Storyblok story content object shaped by the space's component schema.", {
  component: nonEmptyString("Storyblok component technical name."),
});

const storySchema = s.looseObject("Storyblok story object.", {
  name: nonEmptyString("Story name."),
  published_at: s.nullable(s.dateTime("Latest publication timestamp.")),
  first_published_at: s.nullable(s.dateTime("First publication timestamp.")),
  created_at: s.dateTime("Story creation timestamp."),
  updated_at: s.dateTime("Latest story update timestamp."),
  id: s.integer("Story ID."),
  uuid: s.uuid("Story UUID."),
  content: componentContentSchema,
  slug: nonEmptyString("Story slug."),
  full_slug: nonEmptyString("Story full slug."),
  sort_by_date: s.nullable(nonEmptyString("Date configured for sorting the story.")),
  position: s.integer("Story position in its folder."),
  tag_list: s.array("Story tag names.", nonEmptyString("Story tag name.")),
  is_startpage: s.boolean("Whether the story is the start page for a folder."),
  parent_id: s.integer("Parent folder ID."),
  meta_data: s.nullable(s.looseObject("Story metadata object.")),
  group_id: s.uuid("Story group UUID shared between alternates."),
  release_id: s.nullable(s.integer("Release ID when requested from a release.")),
  lang: nonEmptyString("Story language code."),
  path: s.nullable(nonEmptyString("Story real path.")),
  alternates: s.array("Alternate stories for this story.", s.looseObject("Story alternate object.")),
  default_full_slug: s.nullable(nonEmptyString("Default-language full slug.")),
  translated_slugs: s.nullable(s.array("Translated slug objects.", s.looseObject("Story translated slug object."))),
});

const linkSchema = s.looseObject("Storyblok link object.", {
  id: s.integer("Story or folder ID."),
  uuid: s.uuid("Story or folder UUID."),
  slug: nonEmptyString("Story or folder full slug."),
  path: s.nullable(nonEmptyString("Story real path.")),
  parent_id: s.nullable(s.integer("Parent folder ID.")),
  name: nonEmptyString("Story or folder name."),
  is_folder: s.boolean("Whether the object is a folder."),
  published: s.boolean("Whether the story is published."),
  is_startpage: s.boolean("Whether the story is the start page for a folder."),
  position: s.integer("Story position in its folder."),
  real_path: nonEmptyString("Resolved real path with a leading slash."),
  published_at: s.dateTime("Latest publication timestamp."),
  created_at: s.dateTime("Creation timestamp."),
  updated_at: s.dateTime("Latest update timestamp."),
  alternates: s.array("Alternate link objects.", s.looseObject("Link alternate object.")),
});

const datasourceDimensionSchema = s.looseObject("Storyblok datasource dimension object.", {
  id: s.integer("Dimension ID."),
  name: nonEmptyString("Dimension name."),
  entry_value: nonEmptyString("Dimension value."),
  datasource_id: s.integer("Datasource ID containing this dimension."),
  created_at: s.dateTime("Dimension creation timestamp."),
  updated_at: s.dateTime("Latest dimension update timestamp."),
});

const datasourceSchema = s.looseObject("Storyblok datasource object.", {
  id: s.integer("Datasource ID."),
  name: nonEmptyString("Datasource name."),
  slug: nonEmptyString("Datasource slug."),
  dimensions: s.array("Dimensions defined for this datasource.", datasourceDimensionSchema),
});

const datasourceEntrySchema = s.looseObject("Storyblok datasource entry object.", {
  id: s.integer("Entry ID."),
  name: nonEmptyString("Entry name."),
  value: nonEmptyString("Entry value in the default dimension."),
  dimension_value: nonEmptyString("Entry value for the requested dimension."),
});

const tagSchema = s.looseObject("Storyblok tag object.", {
  name: nonEmptyString("Tag name."),
  taggings_count: s.nonNegativeInteger("Number of stories assigned to the tag."),
});

const spaceSchema = s.looseObject("Storyblok space object.", {
  id: s.integer("Space ID."),
  name: nonEmptyString("Space name."),
  domain: s.url("Domain associated with the Storyblok space."),
  version: s.anyOf("Storyblok cache version value.", [
    s.integer("Storyblok cache version as a number."),
    nonEmptyString("Storyblok cache version as a string."),
  ]),
  language_codes: s.array(
    "Language codes configured in the Storyblok space.",
    nonEmptyString("Storyblok language code."),
  ),
});

const primitiveQueryValueSchema = s.anyOf("Storyblok query value.", [
  nonEmptyString("Storyblok string query value."),
  s.number("Storyblok numeric query value."),
  s.boolean("Storyblok boolean query value."),
]);

const filterQuerySchema = s.record(
  "Storyblok filter_query object keyed by field name.",
  s.record("Storyblok filter operators for one field.", primitiveQueryValueSchema),
);

const commonStoryQueryProperties = {
  version: versionSchema,
  cv: s.nonNegativeInteger("Storyblok cache version timestamp."),
  from_release: nonEmptyString("Release ID to request a story version from."),
  resolve_links: resolveLinksSchema,
  resolve_links_level: s.integer("Number of link levels to resolve.", { minimum: 1, maximum: 2 }),
  resolve_relations: nonEmptyString("Comma-separated component.field references to resolve as stories."),
  resolve_level: s.integer("Force second-level relation resolution.", { minimum: 2, maximum: 2 }),
  resolve_assets: zeroOrOneSchema,
  fallback_lang: nonEmptyString("Fallback language code configured in the space."),
  language: nonEmptyString("Language code configured in the space."),
};

const commonStoryQueryKeys = [
  "version",
  "cv",
  "from_release",
  "resolve_links",
  "resolve_links_level",
  "resolve_relations",
  "resolve_level",
  "resolve_assets",
  "fallback_lang",
  "language",
] as const;

const getSpaceInputSchema = s.object("Input parameters for retrieving the current Storyblok space.", {});
const getSpaceOutputSchema = s.looseRequiredObject("Storyblok current space response.", {
  space: spaceSchema,
});

const getStoryInputSchema = s.object(
  "Path and query parameters for retrieving one Storyblok story.",
  {
    story: nonEmptyString("Story full slug, numeric ID, or UUID to place in the path."),
    find_by: s.stringEnum("Story lookup mode required when story is a UUID.", ["uuid"]),
    ...commonStoryQueryProperties,
  },
  { optional: ["find_by", ...commonStoryQueryKeys] },
);

const storyResponseSchema = s.looseRequiredObject(
  "Storyblok single-story response.",
  {
    story: storySchema,
    rels: s.array("Resolved story objects.", storySchema),
    links: s.array("Resolved link objects.", linkSchema),
    rel_uuids: s.array("Referenced story UUIDs that exceeded the resolution limit.", s.uuid("Story UUID.")),
    link_uuids: s.array("Linked story UUIDs that exceeded the resolution limit.", s.uuid("Story UUID.")),
  },
  { optional: ["rels", "links", "rel_uuids", "link_uuids"] },
);

const listStoriesInputSchema = s.object(
  "Query parameters for listing Storyblok stories.",
  {
    ...commonStoryQueryProperties,
    starts_with: nonEmptyString("Return stories whose full_slug starts with this value."),
    search_term: nonEmptyString("Search term applied to story name, slug, full slug, and content."),
    page: s.positiveInteger("Page number to request from Storyblok."),
    per_page: s.positiveInteger("Stories to request per page.", { maximum: 100 }),
    content_type: nonEmptyString("Storyblok content type technical name."),
    by_slugs: nonEmptyString("Comma-separated full slugs to include, with wildcard support."),
    excluding_slugs: nonEmptyString("Comma-separated full slugs to exclude, with wildcard support."),
    by_uuids: nonEmptyString("Comma-separated story UUIDs to include."),
    by_uuids_ordered: nonEmptyString("Comma-separated story UUIDs to include while preserving request order."),
    excluding_ids: nonEmptyString("Comma-separated story IDs to exclude."),
    with_tag: nonEmptyString("Comma-separated tag slugs used to filter stories."),
    sort_by: nonEmptyString("Storyblok sort expression."),
    in_workflow_stages: nonEmptyString("Comma-separated workflow stage IDs."),
    filter_query: filterQuerySchema,
    level: s.positiveInteger("Folder level used to filter returned stories."),
    is_startpage: zeroOrOneSchema,
    first_published_at_gt: nonEmptyString("Return stories first published after this timestamp."),
    first_published_at_lt: nonEmptyString("Return stories first published before this timestamp."),
    published_at_gt: nonEmptyString("Return stories published after this timestamp."),
    published_at_lt: nonEmptyString("Return stories published before this timestamp."),
    published_at_gte: nonEmptyString("Return stories published on or after this timestamp."),
    published_at_lte: nonEmptyString("Return stories published on or before this timestamp."),
    updated_at_gt: nonEmptyString("Return stories updated after this timestamp."),
    updated_at_lt: nonEmptyString("Return stories updated before this timestamp."),
    excluding_fields: nonEmptyString("Comma-separated content field names to exclude."),
  },
  {
    optional: [
      ...commonStoryQueryKeys,
      "starts_with",
      "search_term",
      "page",
      "per_page",
      "content_type",
      "by_slugs",
      "excluding_slugs",
      "by_uuids",
      "by_uuids_ordered",
      "excluding_ids",
      "with_tag",
      "sort_by",
      "in_workflow_stages",
      "filter_query",
      "level",
      "is_startpage",
      "first_published_at_gt",
      "first_published_at_lt",
      "published_at_gt",
      "published_at_lt",
      "published_at_gte",
      "published_at_lte",
      "updated_at_gt",
      "updated_at_lt",
      "excluding_fields",
    ],
  },
);

const storiesResponseSchema = s.looseRequiredObject(
  "Storyblok stories collection response.",
  {
    stories: s.array("Stories returned for the current page.", storySchema),
    rels: s.array("Resolved story objects.", storySchema),
    links: s.array("Resolved link objects.", linkSchema),
    rel_uuids: s.array("Referenced story UUIDs that exceeded the resolution limit.", s.uuid("Story UUID.")),
    link_uuids: s.array("Linked story UUIDs that exceeded the resolution limit.", s.uuid("Story UUID.")),
    cv: s.integer("Storyblok cache version timestamp."),
    pagination: paginationOutputSchema,
  },
  { optional: ["rels", "links", "rel_uuids", "link_uuids", "cv", "pagination"] },
);

const listLinksInputSchema = s.object(
  "Query parameters for listing Storyblok links.",
  {
    starts_with: nonEmptyString("Return links whose full_slug starts with this value."),
    version: versionSchema,
    cv: s.nonNegativeInteger("Storyblok cache version timestamp."),
    with_parent: s.nonNegativeInteger("Folder ID used to filter links, or 0 for root entries."),
    include_dates: zeroOrOneSchema,
    page: s.positiveInteger("Page number to request from Storyblok."),
    per_page: s.positiveInteger("Links to request per page.", { maximum: 1000 }),
    paginated: zeroOrOneSchema,
  },
  { optional: ["starts_with", "version", "cv", "with_parent", "include_dates", "page", "per_page", "paginated"] },
);

const linksResponseSchema = s.looseRequiredObject(
  "Storyblok links response.",
  {
    links: s.record("Storyblok links keyed by story or folder UUID.", linkSchema),
    pagination: paginationOutputSchema,
  },
  { optional: ["pagination"] },
);

const listDatasourcesInputSchema = s.object(
  "Query parameters for listing Storyblok datasources.",
  paginationInputProperties,
  {
    optional: ["page", "per_page"],
  },
);

const datasourcesResponseSchema = s.looseRequiredObject(
  "Storyblok datasources response.",
  {
    datasources: s.array("Datasources returned for the current page.", datasourceSchema),
    cv: s.integer("Storyblok cache version timestamp."),
    pagination: paginationOutputSchema,
  },
  { optional: ["cv", "pagination"] },
);

const listDatasourceEntriesInputSchema = s.object(
  "Query parameters for listing Storyblok datasource entries.",
  {
    datasource: nonEmptyString("Datasource slug to filter entries by."),
    dimension: nonEmptyString("Datasource dimension value to request."),
    page: s.positiveInteger("Page number to request from Storyblok."),
    per_page: s.positiveInteger("Datasource entries to request per page.", { maximum: 1000 }),
    cv: s.nonNegativeInteger("Storyblok cache version timestamp."),
  },
  { optional: ["datasource", "dimension", "page", "per_page", "cv"] },
);

const datasourceEntriesResponseSchema = s.looseRequiredObject(
  "Storyblok datasource entries response.",
  {
    datasource_entries: s.array("Datasource entries returned for the current page.", datasourceEntrySchema),
    cv: s.integer("Storyblok cache version timestamp."),
    pagination: paginationOutputSchema,
  },
  { optional: ["cv", "pagination"] },
);

const listTagsInputSchema = s.object(
  "Query parameters for listing Storyblok tags.",
  {
    starts_with: nonEmptyString("Return tags assigned to stories whose full_slug starts with this value."),
    version: versionSchema,
  },
  { optional: ["starts_with", "version"] },
);

const tagsResponseSchema = s.looseRequiredObject("Storyblok tags response.", {
  tags: s.array("Tags returned by Storyblok.", tagSchema),
});

export const storyblokActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_space",
    description: "Retrieve metadata for the Storyblok space associated with the access token.",
    inputSchema: getSpaceInputSchema,
    outputSchema: getSpaceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_stories",
    description: "List Storyblok stories with pagination, content filters, language, and relation resolution options.",
    inputSchema: listStoriesInputSchema,
    outputSchema: storiesResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_story",
    description: "Retrieve one Storyblok story by full slug, numeric ID, or UUID.",
    inputSchema: getStoryInputSchema,
    outputSchema: storyResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_links",
    description: "List compact Storyblok link records for stories and folders in a space.",
    inputSchema: listLinksInputSchema,
    outputSchema: linksResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_datasources",
    description: "List Storyblok datasources with pagination.",
    inputSchema: listDatasourcesInputSchema,
    outputSchema: datasourcesResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_datasource_entries",
    description: "List Storyblok datasource entries, optionally filtered by datasource and dimension.",
    inputSchema: listDatasourceEntriesInputSchema,
    outputSchema: datasourceEntriesResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List Storyblok tags assigned to stories in the current space.",
    inputSchema: listTagsInputSchema,
    outputSchema: tagsResponseSchema,
  }),
];
