import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "agility";

const guidField = s.nonEmptyString("The Agility CMS instance GUID from the API Keys section.");
const apiTypeField = s.stringEnum("The Agility Content Fetch API type to query.", ["fetch", "preview"]);
const localeField = s.nonEmptyString("The locale code to retrieve content for.");
const channelNameField = s.nonEmptyString("The reference name of the digital channel, such as website.");
const contentLinkDepthField = s.integer("The maximum level to expand linked content.", {
  minimum: 0,
  maximum: 5,
});
const expandAllContentLinksField = s.boolean(
  "Whether to expand entire linked content references, including lists and grid-linked items.",
);
const rawPayloadSchema = s.unknown("Raw Agility CMS response payload.");

const contentFetchBaseInput = {
  guid: guidField,
  apiType: apiTypeField,
};

const localizedContentFetchBaseInput = {
  ...contentFetchBaseInput,
  locale: localeField,
};

const listContentModelsInputSchema = s.object(
  "Request parameters for listing Agility CMS content models.",
  {
    ...contentFetchBaseInput,
    lastModifiedDate: s.dateTime("Only return model updates after this last modified date and time."),
  },
  { optional: ["lastModifiedDate"] },
);

const listContentModelsOutputSchema = s.object("Agility CMS content models response.", {
  models: s.array("Content models returned by Agility CMS.", rawPayloadSchema),
  raw: rawPayloadSchema,
});

const getContentListInputSchema = s.object(
  "Request parameters for retrieving an Agility CMS content list.",
  {
    ...localizedContentFetchBaseInput,
    referenceName: s.nonEmptyString("The unique reference name of the content list to retrieve in the current locale."),
    contentLinkDepth: contentLinkDepthField,
    expandAllContentLinks: expandAllContentLinksField,
    fields: s.nonEmptyString("A comma-separated list of fields to return."),
    take: s.integer("The maximum number of items to retrieve. Agility CMS allows up to 250.", {
      minimum: 1,
      maximum: 250,
    }),
    skip: s.integer("The number of items to skip for pagination.", { minimum: 0 }),
    filter: s.nonEmptyString("The Agility CMS list filter expression to apply."),
    sort: s.nonEmptyString("The field path to sort results by, such as fields.title or properties.created."),
    direction: s.stringEnum("The direction to sort list results by.", ["asc", "desc"]),
  },
  {
    optional: ["contentLinkDepth", "expandAllContentLinks", "fields", "take", "skip", "filter", "sort", "direction"],
  },
);

const getContentListOutputSchema = s.object("Agility CMS content list response.", {
  list: rawPayloadSchema,
  raw: rawPayloadSchema,
});

const getContentItemInputSchema = s.object(
  "Request parameters for retrieving an Agility CMS content item.",
  {
    ...localizedContentFetchBaseInput,
    id: s.integer("The Agility CMS content ID of the requested item.", { exclusiveMinimum: 0 }),
    contentLinkDepth: contentLinkDepthField,
    expandAllContentLinks: expandAllContentLinksField,
  },
  { optional: ["contentLinkDepth", "expandAllContentLinks"] },
);

const getContentItemOutputSchema = s.object("Agility CMS content item response.", {
  item: rawPayloadSchema,
  raw: rawPayloadSchema,
});

const getPageInputSchema = s.object(
  "Request parameters for retrieving an Agility CMS page by ID.",
  {
    ...localizedContentFetchBaseInput,
    id: s.integer("The unique Agility CMS page ID to retrieve.", { exclusiveMinimum: 0 }),
    contentLinkDepth: contentLinkDepthField,
    expandAllContentLinks: expandAllContentLinksField,
  },
  { optional: ["contentLinkDepth", "expandAllContentLinks"] },
);

const getPageOutputSchema = s.object("Agility CMS page response.", {
  page: rawPayloadSchema,
  raw: rawPayloadSchema,
});

const getFlatSitemapInputSchema = s.object("Request parameters for retrieving an Agility CMS flat sitemap.", {
  ...localizedContentFetchBaseInput,
  channelName: channelNameField,
});

const getFlatSitemapOutputSchema = s.object("Agility CMS flat sitemap response.", {
  sitemap: s.unknownObject("Flat sitemap keyed by page path."),
  raw: rawPayloadSchema,
});

const getNestedSitemapInputSchema = s.object("Request parameters for retrieving an Agility CMS nested sitemap.", {
  ...localizedContentFetchBaseInput,
  channelName: channelNameField,
});

const getNestedSitemapOutputSchema = s.object("Agility CMS nested sitemap response.", {
  sitemap: s.array("Nested sitemap entries returned by Agility CMS.", rawPayloadSchema),
  raw: rawPayloadSchema,
});

export const agilityActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_content_models",
    description: "List content models for an Agility CMS instance using the Content Fetch API.",
    inputSchema: listContentModelsInputSchema,
    outputSchema: listContentModelsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_content_list",
    description:
      "Retrieve an Agility CMS content list by reference name with optional pagination, filtering, sorting, and linked-content expansion.",
    inputSchema: getContentListInputSchema,
    outputSchema: getContentListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_content_item",
    description: "Retrieve an Agility CMS content item by content ID for a locale.",
    inputSchema: getContentItemInputSchema,
    outputSchema: getContentItemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Retrieve an Agility CMS page by page ID for a locale.",
    inputSchema: getPageInputSchema,
    outputSchema: getPageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_flat_sitemap",
    description: "Retrieve an Agility CMS flat sitemap keyed by page path for a channel.",
    inputSchema: getFlatSitemapInputSchema,
    outputSchema: getFlatSitemapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_nested_sitemap",
    description: "Retrieve an Agility CMS nested sitemap for generating menus or navigation.",
    inputSchema: getNestedSitemapInputSchema,
    outputSchema: getNestedSitemapOutputSchema,
  }),
];
