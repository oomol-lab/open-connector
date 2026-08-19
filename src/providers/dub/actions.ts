import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dub" as const;

interface DubActionInput<TName extends string> {
  name: TName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const stringArraySchema = (description: string) =>
  s.array(description, s.string("A Dub identifier or name."), { minItems: 1 });

const looseRecordSchema = (description: string) => s.looseObject(description);

const tagColorSchema = s.stringEnum("The Dub tag color.", [
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
  "brown",
  "gray",
  "pink",
]);

const sortOrderSchema = s.stringEnum("The sort direction.", ["asc", "desc"]);

const linkSortBySchema = s.stringEnum("The field used to sort links.", [
  "createdAt",
  "clicks",
  "saleAmount",
  "lastClicked",
]);

const analyticsEventSchema = s.stringEnum("The event metric to retrieve from Dub analytics.", [
  "clicks",
  "leads",
  "sales",
  "composite",
]);

const analyticsGroupBySchema = s.stringEnum("The dimension used to group Dub analytics.", [
  "count",
  "timeseries",
  "continents",
  "regions",
  "countries",
  "cities",
  "devices",
  "browsers",
  "os",
  "trigger",
  "triggers",
  "referers",
  "referer_urls",
  "top_folders",
  "top_link_tags",
  "top_domains",
  "top_links",
  "top_urls",
  "top_base_urls",
  "top_partners",
  "top_groups",
  "top_partner_tags",
  "utm_sources",
  "utm_mediums",
  "utm_campaigns",
  "utm_terms",
  "utm_contents",
]);

const analyticsIntervalSchema = s.stringEnum("The analytics date range shortcut.", [
  "24h",
  "7d",
  "30d",
  "90d",
  "1y",
  "mtd",
  "qtd",
  "ytd",
  "all",
]);

const linkInputFields = {
  url: s.string({ format: "uri", description: "The destination URL of the short link.", maxLength: 32000 }),
  domain: s.string("The short-link domain without protocol.", { maxLength: 190 }),
  key: s.string("The short-link slug.", { maxLength: 190 }),
  keyLength: s.integer("The length of the generated short-link slug.", {
    minimum: 3,
    maximum: 190,
  }),
  externalId: s.nullable(s.string("The ID of the link in your database.", { maxLength: 255 })),
  tenantId: s.nullable(
    s.string("The tenant ID that created the link in your system.", {
      maxLength: 255,
    }),
  ),
  programId: s.nullable(s.string("The partner program ID associated with the link.")),
  partnerId: s.nullable(s.string("The partner ID associated with the link.")),
  prefix: s.string("The prefix used for randomly generated slugs."),
  trackConversion: s.boolean("Whether Dub should track conversions for this link."),
  archived: s.boolean("Whether the link should be archived."),
  tagIds: s.anyOf("The tag IDs assigned to the link.", [
    s.string("A Dub tag ID."),
    stringArraySchema("Dub tag IDs assigned to the link."),
  ]),
  tagNames: s.anyOf("The tag names assigned to the link.", [
    s.string("A Dub tag name."),
    stringArraySchema("Dub tag names assigned to the link."),
  ]),
  folderId: s.nullable(s.string("The folder ID assigned to the link.")),
  comments: s.nullable(s.string("Comments for the link.")),
  expiresAt: s.nullable(s.string("The ISO-8601 timestamp when the link expires.")),
  expiredUrl: s.nullable(
    s.string({ format: "uri", description: "The URL used when the short link has expired.", maxLength: 32000 }),
  ),
  password: s.nullable(s.string("The password required to access the destination URL.")),
  proxy: s.boolean("Whether the link uses Dub custom link previews."),
  title: s.nullable(s.string("The custom link preview title.")),
  description: s.nullable(s.string("The custom link preview description.")),
  image: s.nullable(s.string("The custom link preview image URL.")),
  video: s.nullable(s.string("The custom link preview video URL.")),
  rewrite: s.boolean("Whether the link uses link cloaking."),
  ios: s.nullable(
    s.string({ format: "uri", description: "The iOS destination URL for device targeting.", maxLength: 32000 }),
  ),
  android: s.nullable(
    s.string({ format: "uri", description: "The Android destination URL for device targeting.", maxLength: 32000 }),
  ),
  geo: s.nullable(
    s.record(
      "Geo targeting destinations keyed by country code.",
      s.string({ format: "uri", description: "The destination URL for this country.", maxLength: 32000 }),
    ),
  ),
  doIndex: s.boolean("Whether search engines may index the short link."),
  utm_source: s.nullable(s.string("The UTM source to apply to the destination URL.")),
  utm_medium: s.nullable(s.string("The UTM medium to apply to the destination URL.")),
  utm_campaign: s.nullable(s.string("The UTM campaign to apply to the destination URL.")),
  utm_term: s.nullable(s.string("The UTM term to apply to the destination URL.")),
  utm_content: s.nullable(s.string("The UTM content to apply to the destination URL.")),
  ref: s.nullable(s.string("The referral query parameter to apply to the destination URL.")),
  webhookIds: s.nullable(s.array("Webhook IDs to trigger when the link is clicked.", s.string("A Dub webhook ID."))),
  testVariants: s.nullable(
    s.array(
      "A/B test URL variants for the short link.",
      s.object("An A/B test URL variant.", {
        url: s.url("The variant destination URL."),
        percentage: s.integer("The traffic percentage for this variant.", {
          minimum: 10,
          maximum: 90,
        }),
      }),
      { minItems: 2, maxItems: 4 },
    ),
  ),
  testStartedAt: s.nullable(s.string("The ISO-8601 timestamp when A/B testing started.")),
  testCompletedAt: s.nullable(s.string("The ISO-8601 timestamp when A/B testing completes.")),
};

const linkInputOptional = [
  "domain",
  "key",
  "keyLength",
  "externalId",
  "tenantId",
  "programId",
  "partnerId",
  "prefix",
  "trackConversion",
  "archived",
  "tagIds",
  "tagNames",
  "folderId",
  "comments",
  "expiresAt",
  "expiredUrl",
  "password",
  "proxy",
  "title",
  "description",
  "image",
  "video",
  "rewrite",
  "ios",
  "android",
  "geo",
  "doIndex",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "webhookIds",
  "testVariants",
  "testStartedAt",
  "testCompletedAt",
] as const;

const updateLinkInputFields = {
  linkId: s.string("The Dub link ID to update.", { minLength: 1 }),
  ...linkInputFields,
};
const updateLinkInputOptional = ["url", ...linkInputOptional] as const;

const linkSummarySchema = s.object("A normalized Dub link returned by the connector.", {
  id: s.string("The unique ID of the Dub link."),
  domain: s.string("The domain of the short link."),
  key: s.string("The short-link slug."),
  url: s.string("The destination URL of the link."),
  shortLink: s.nullable(s.string("The full short-link URL.")),
  qrCode: s.nullable(s.string("The QR code URL for the short link.")),
  title: s.nullable(s.string("The custom link preview title.")),
  archived: s.nullable(s.boolean("Whether the link is archived.")),
  clicks: s.nullable(s.number("The number of recorded clicks.")),
  leads: s.nullable(s.number("The number of generated leads.")),
  sales: s.nullable(s.number("The number of generated sales.")),
  saleAmount: s.nullable(s.number("The total sales amount in cents.")),
  createdAt: s.nullable(s.string("The timestamp when the link was created.")),
  updatedAt: s.nullable(s.string("The timestamp when the link was last updated.")),
  raw: looseRecordSchema("The raw Dub link payload."),
});

const linkOutputSchema = s.object("A Dub link action result.", {
  link: linkSummarySchema,
});

const listLinksInputSchema = s.object(
  "Filters and pagination options for listing Dub links.",
  {
    domain: s.string("Only return links for this domain."),
    tagIds: s.anyOf("Only return links with these tag IDs.", [
      s.string("A Dub tag ID."),
      stringArraySchema("Dub tag IDs."),
    ]),
    tagNames: s.anyOf("Only return links with these tag names.", [
      s.string("A Dub tag name."),
      stringArraySchema("Dub tag names."),
    ]),
    folderId: s.string("Only return links in this folder."),
    search: s.string("Search against link slugs and destination URLs."),
    userId: s.string("Only return links created by this Dub user ID."),
    tenantId: s.string("Only return links for this tenant ID."),
    showArchived: s.boolean("Whether archived links should be included."),
    sortBy: linkSortBySchema,
    sortOrder: sortOrderSchema,
    endingBefore: s.string("Return links before this cursor."),
    startingAfter: s.string("Return links after this cursor."),
    pageSize: s.integer("The number of links to return.", {
      exclusiveMinimum: 0,
      maximum: 100,
    }),
  },
  {
    optional: [
      "domain",
      "tagIds",
      "tagNames",
      "folderId",
      "search",
      "userId",
      "tenantId",
      "showArchived",
      "sortBy",
      "sortOrder",
      "endingBefore",
      "startingAfter",
      "pageSize",
    ],
  },
);

const listLinksOutputSchema = s.object("A list of Dub links.", {
  links: s.array("Dub links returned by the API.", linkSummarySchema),
});

const retrieveLinkInputSchema = s.object(
  "Identifiers for retrieving a Dub link.",
  {
    linkId: s.string("The Dub link ID to retrieve."),
    domain: s.string("The short-link domain used with key lookup."),
    key: s.string("The short-link slug used with domain lookup."),
    externalId: s.string("The external ID for the link. Prefix with ext_ when required by Dub."),
  },
  { optional: ["linkId", "domain", "key", "externalId"] },
);

const deleteLinkInputSchema = s.object("Identifier for deleting a Dub link.", {
  linkId: s.string("The Dub link ID to delete.", { minLength: 1 }),
});

const deleteLinkOutputSchema = s.object("A Dub link deletion acknowledgement.", {
  deleted: s.boolean("Whether the connector completed the delete request."),
  raw: s.nullable(s.unknown("The raw Dub deletion response, if any.")),
});

const countLinksInputSchema = s.object(
  "Filters for counting Dub links.",
  {
    domain: s.string("Only count links for this domain."),
    tagIds: s.anyOf("Only count links with these tag IDs.", [
      s.string("A Dub tag ID."),
      stringArraySchema("Dub tag IDs."),
    ]),
    tagNames: s.anyOf("Only count links with these tag names.", [
      s.string("A Dub tag name."),
      stringArraySchema("Dub tag names."),
    ]),
    folderId: s.string("Only count links in this folder."),
    search: s.string("Search against link slugs and destination URLs."),
    userId: s.string("Only count links created by this Dub user ID."),
    tenantId: s.string("Only count links for this tenant ID."),
    showArchived: s.boolean("Whether archived links should be included."),
  },
  {
    optional: ["domain", "tagIds", "tagNames", "folderId", "search", "userId", "tenantId", "showArchived"],
  },
);

const countLinksOutputSchema = s.object("The Dub links count result.", {
  count: s.number("The number of matching Dub links."),
  raw: s.unknown("The raw Dub count response."),
});

const tagSchema = s.object("A normalized Dub tag.", {
  id: s.string("The unique ID of the tag."),
  name: s.string("The tag name."),
  color: s.nullable(s.string("The tag color.")),
  raw: looseRecordSchema("The raw Dub tag payload."),
});

const listTagsInputSchema = s.object(
  "Pagination options for listing Dub tags.",
  {
    page: s.integer("The page number to retrieve.", { exclusiveMinimum: 0 }),
    pageSize: s.integer("The number of tags to return.", {
      exclusiveMinimum: 0,
      maximum: 100,
    }),
  },
  { optional: ["page", "pageSize"] },
);

const listTagsOutputSchema = s.object("A list of Dub tags.", {
  tags: s.array("Dub tags returned by the API.", tagSchema),
});

const createTagInputSchema = s.object(
  "Input parameters for creating a Dub tag.",
  {
    name: s.string("The tag name.", { minLength: 1 }),
    color: tagColorSchema,
  },
  { optional: ["color"] },
);

const updateTagInputSchema = s.object(
  "Input parameters for updating a Dub tag.",
  {
    id: s.string("The Dub tag ID to update.", { minLength: 1 }),
    name: s.string("The updated tag name.", { minLength: 1 }),
    color: tagColorSchema,
  },
  { optional: ["name", "color"] },
);

const tagOutputSchema = s.object("A Dub tag action result.", {
  tag: tagSchema,
});

const deleteTagInputSchema = s.object("Identifier for deleting a Dub tag.", {
  id: s.string("The Dub tag ID to delete.", { minLength: 1 }),
});

const folderSchema = s.object("A normalized Dub folder.", {
  id: s.string("The unique ID of the folder."),
  name: s.string("The folder name."),
  accessLevel: s.nullable(s.string("The folder access level returned by Dub.")),
  raw: looseRecordSchema("The raw Dub folder payload."),
});

const listFoldersInputSchema = s.object(
  "Pagination options for listing Dub folders.",
  {
    page: s.integer("The page number to retrieve.", { exclusiveMinimum: 0 }),
    pageSize: s.integer("The number of folders to return.", {
      exclusiveMinimum: 0,
      maximum: 100,
    }),
  },
  { optional: ["page", "pageSize"] },
);

const listFoldersOutputSchema = s.object("A list of Dub folders.", {
  folders: s.array("Dub folders returned by the API.", folderSchema),
});

const createFolderInputSchema = s.object("Input parameters for creating a Dub folder.", {
  name: s.string("The folder name.", { minLength: 1 }),
});

const updateFolderInputSchema = s.object("Input parameters for updating a Dub folder.", {
  id: s.string("The Dub folder ID to update.", { minLength: 1 }),
  name: s.string("The updated folder name.", { minLength: 1 }),
});

const folderOutputSchema = s.object("A Dub folder action result.", {
  folder: folderSchema,
});

const deleteFolderInputSchema = s.object("Identifier for deleting a Dub folder.", {
  id: s.string("The Dub folder ID to delete.", { minLength: 1 }),
});

const analyticsInputSchema = s.object(
  "Filters for retrieving Dub analytics.",
  {
    event: analyticsEventSchema,
    groupBy: analyticsGroupBySchema,
    domain: s.string("The domain filter for analytics."),
    key: s.string("The link slug used with a domain filter."),
    linkId: s.string("The Dub link ID filter."),
    externalId: s.string("The external link ID filter."),
    tenantId: s.string("The tenant ID filter."),
    tagId: s.string("The tag ID filter."),
    folderId: s.string("The folder ID filter."),
    partnerTagId: s.string("The partner tag ID filter."),
    groupId: s.string("The partner group ID filter."),
    partnerId: s.string("The partner ID filter."),
    customerId: s.string("The customer ID filter."),
    interval: analyticsIntervalSchema,
    start: s.string("The start timestamp for the analytics range."),
    end: s.string("The end timestamp for the analytics range."),
    timezone: s.string("The IANA time zone used to align timeseries buckets."),
    country: s.string("The country filter using ISO 3166-1 alpha-2 codes."),
    city: s.string("The city filter."),
    region: s.string("The ISO 3166-2 region code filter."),
    continent: s.string("The continent filter."),
    device: s.string("The device filter."),
    browser: s.string("The browser filter."),
    os: s.string("The operating system filter."),
    trigger: s.string("The trigger filter."),
    referer: s.string("The referer hostname filter."),
    refererUrl: s.string("The full referer URL filter."),
    url: s.string("The destination URL filter."),
    utm_source: s.string("The UTM source filter."),
    utm_medium: s.string("The UTM medium filter."),
    utm_campaign: s.string("The UTM campaign filter."),
    utm_term: s.string("The UTM term filter."),
    utm_content: s.string("The UTM content filter."),
  },
  {
    optional: [
      "event",
      "groupBy",
      "domain",
      "key",
      "linkId",
      "externalId",
      "tenantId",
      "tagId",
      "folderId",
      "partnerTagId",
      "groupId",
      "partnerId",
      "customerId",
      "interval",
      "start",
      "end",
      "timezone",
      "country",
      "city",
      "region",
      "continent",
      "device",
      "browser",
      "os",
      "trigger",
      "referer",
      "refererUrl",
      "url",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ],
  },
);

const analyticsOutputSchema = s.object("A Dub analytics result.", {
  data: s.unknown("The analytics data returned by Dub."),
});

function defineDubAction<TName extends string>(input: DubActionInput<TName>) {
  return defineProviderAction(service, {
    requiredScopes: [],
    ...input,
  });
}

export const dubActions: readonly ActionDefinition[] = [
  defineDubAction({
    name: "create_link",
    description: "Create a short link in the authenticated Dub workspace.",
    inputSchema: s.object("Input parameters for creating a Dub link.", linkInputFields, {
      optional: linkInputOptional,
    }),
    outputSchema: linkOutputSchema,
  }),
  defineDubAction({
    name: "list_links",
    description: "List short links in the authenticated Dub workspace.",
    inputSchema: listLinksInputSchema,
    outputSchema: listLinksOutputSchema,
  }),
  defineDubAction({
    name: "retrieve_link",
    description: "Retrieve a Dub short link by ID or by supported lookup fields.",
    inputSchema: retrieveLinkInputSchema,
    outputSchema: linkOutputSchema,
  }),
  defineDubAction({
    name: "update_link",
    description: "Update a short link in the authenticated Dub workspace.",
    inputSchema: s.object("Input parameters for updating a Dub link.", updateLinkInputFields, {
      optional: updateLinkInputOptional,
    }),
    outputSchema: linkOutputSchema,
  }),
  defineDubAction({
    name: "delete_link",
    description: "Delete a short link from the authenticated Dub workspace.",
    inputSchema: deleteLinkInputSchema,
    outputSchema: deleteLinkOutputSchema,
  }),
  defineDubAction({
    name: "count_links",
    description: "Retrieve the number of matching links in the authenticated Dub workspace.",
    inputSchema: countLinksInputSchema,
    outputSchema: countLinksOutputSchema,
  }),
  defineDubAction({
    name: "list_tags",
    description: "List tags in the authenticated Dub workspace.",
    inputSchema: listTagsInputSchema,
    outputSchema: listTagsOutputSchema,
  }),
  defineDubAction({
    name: "create_tag",
    description: "Create a tag in the authenticated Dub workspace.",
    inputSchema: createTagInputSchema,
    outputSchema: tagOutputSchema,
  }),
  defineDubAction({
    name: "update_tag",
    description: "Update a tag in the authenticated Dub workspace.",
    inputSchema: updateTagInputSchema,
    outputSchema: tagOutputSchema,
  }),
  defineDubAction({
    name: "delete_tag",
    description: "Delete a tag from the authenticated Dub workspace.",
    inputSchema: deleteTagInputSchema,
    outputSchema: deleteLinkOutputSchema,
  }),
  defineDubAction({
    name: "list_folders",
    description: "List folders in the authenticated Dub workspace.",
    inputSchema: listFoldersInputSchema,
    outputSchema: listFoldersOutputSchema,
  }),
  defineDubAction({
    name: "create_folder",
    description: "Create a folder in the authenticated Dub workspace.",
    inputSchema: createFolderInputSchema,
    outputSchema: folderOutputSchema,
  }),
  defineDubAction({
    name: "update_folder",
    description: "Update a folder in the authenticated Dub workspace.",
    inputSchema: updateFolderInputSchema,
    outputSchema: folderOutputSchema,
  }),
  defineDubAction({
    name: "delete_folder",
    description: "Delete a folder from the authenticated Dub workspace.",
    inputSchema: deleteFolderInputSchema,
    outputSchema: deleteLinkOutputSchema,
  }),
  defineDubAction({
    name: "retrieve_analytics",
    description: "Retrieve analytics for a Dub link, domain, or workspace.",
    inputSchema: analyticsInputSchema,
    outputSchema: analyticsOutputSchema,
  }),
];
