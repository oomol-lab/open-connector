import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "devto";

const idInput = s.union([s.positiveInteger("A positive numeric article identifier."), s.stringPattern("^\\d+$")], {
  description: "An article identifier accepted by the Dev.to API.",
});
const tagList = s.union([s.string("A single tag value."), s.stringArray("A list of tag values.")], {
  description: "A tag list represented as a string or a string array.",
});
const pageFields = {
  page: s.integer("The page number to fetch.", { minimum: 1 }),
  perPage: s.integer("The number of items per page.", { minimum: 1, maximum: 1000 }),
};
const article = s.looseObject("A Dev.to article record.");
const organization = s.looseObject("A Dev.to organization profile.");
const tag = s.looseObject("A Dev.to tag record.");
const user = s.looseObject("A Dev.to current user profile.");
const video = s.looseObject("A Dev.to video article record.");
const articleList = s.array("The list of article summary records returned by the action.", article);
const videoList = s.array("The list of video article records returned by the action.", video);
const tagListOutput = s.array("The list of tag records returned by the action.", tag);
const noInput = s.object("No input parameters are required for this action.", {});

const articleBodyFields: Record<string, JsonSchema> = {
  title: s.nonEmptyString("The article title."),
  bodyMarkdown: s.nonEmptyString("The article body in markdown."),
  published: s.boolean("Whether the article is published."),
  series: s.nullableString("The optional article series."),
  mainImage: s.nullableString("The optional main image URL."),
  canonicalUrl: s.nullableString("The optional canonical URL."),
  description: s.string("The article description."),
  tags: tagList,
  organizationId: s.nullableInteger("The optional organization identifier.", { minimum: 1 }),
};

export const devtoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_articles",
    description: "List published Dev.to articles with query filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input parameters for listing Dev.to articles.",
      {
        ...pageFields,
        tag: s.string("The tag filter."),
        tags: tagList,
        tagsExclude: tagList,
        username: s.string("The username filter."),
        state: s.stringEnum("The article listing state.", ["fresh", "rising", "all"]),
        top: s.positiveInteger("The top rank limit."),
        collectionId: s.positiveInteger("The collection identifier filter."),
      },
      { optional: ["page", "perPage", "tag", "tags", "tagsExclude", "username", "state", "top", "collectionId"] },
    ),
    outputSchema: articleList,
  }),
  defineProviderAction(service, {
    name: "list_latest_articles",
    description: "List latest Dev.to articles.",
    requiredScopes: [],
    inputSchema: s.object("The input parameters for listing the latest Dev.to articles.", pageFields, {
      optional: ["page", "perPage"],
    }),
    outputSchema: articleList,
  }),
  defineProviderAction(service, {
    name: "get_article",
    description: "Get a Dev.to article by numeric id.",
    requiredScopes: [],
    inputSchema: s.object("The input parameters for fetching an article by id.", { articleId: idInput }),
    outputSchema: article,
  }),
  defineProviderAction(service, {
    name: "get_article_by_path",
    description: "Get a Dev.to article by username and slug.",
    requiredScopes: [],
    inputSchema: s.object("The input parameters for fetching an article by path.", {
      username: s.nonEmptyString("The article author username."),
      slug: s.nonEmptyString("The article slug."),
    }),
    outputSchema: article,
  }),
  defineProviderAction(service, {
    name: "list_organization_articles",
    description: "List articles under a Dev.to organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input parameters for listing organization articles.",
      { organizationUsername: s.nonEmptyString("The organization username."), ...pageFields },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: articleList,
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get Dev.to organization profile.",
    requiredScopes: [],
    inputSchema: s.object("The input parameters for fetching an organization profile.", {
      organizationUsername: s.nonEmptyString("The organization username."),
    }),
    outputSchema: organization,
  }),
  defineProviderAction(service, {
    name: "list_videos",
    description: "List Dev.to videos.",
    requiredScopes: [],
    inputSchema: s.object("The input parameters for listing Dev.to videos.", pageFields, {
      optional: ["page", "perPage"],
    }),
    outputSchema: videoList,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List Dev.to tags.",
    requiredScopes: [],
    inputSchema: s.object("The input parameters for listing Dev.to tags.", pageFields, {
      optional: ["page", "perPage"],
    }),
    outputSchema: tagListOutput,
  }),
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current authenticated Dev.to user profile.",
    requiredScopes: [],
    inputSchema: noInput,
    outputSchema: user,
  }),
  defineProviderAction(service, {
    name: "list_my_articles",
    description: "List current user's own Dev.to articles by status.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input parameters for listing the current user's articles.",
      {
        ...pageFields,
        status: s.stringEnum("The article status filter.", ["default", "published", "unpublished", "all"]),
      },
      { optional: ["page", "perPage", "status"] },
    ),
    outputSchema: articleList,
  }),
  defineProviderAction(service, {
    name: "create_article",
    description: "Create a new Dev.to article.",
    requiredScopes: [],
    inputSchema: s.object("The input parameters for creating an article.", articleBodyFields, {
      required: ["title", "bodyMarkdown"],
      optional: ["published", "series", "mainImage", "canonicalUrl", "description", "tags", "organizationId"],
    }),
    outputSchema: article,
  }),
  defineProviderAction(service, {
    name: "update_article",
    description: "Update an existing Dev.to article.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input parameters for updating an article.",
      { articleId: idInput, ...articleBodyFields },
      {
        required: ["articleId", "title", "bodyMarkdown"],
        optional: ["published", "series", "mainImage", "canonicalUrl", "description", "tags", "organizationId"],
      },
    ),
    outputSchema: article,
  }),
];
