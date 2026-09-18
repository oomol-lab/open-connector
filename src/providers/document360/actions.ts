import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "document360" as const;

const trimmedString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });

const projectVersionIdSchema = trimmedString(
  "The Document360 project version or workspace ID. Fetch it with list_workspaces.",
);

const langCodeSchema = trimmedString("The Document360 language code such as en, fr, de-DE, or pt-BR.");

const pageSchema = s.nonNegativeInteger("The 0-based page index used by Document360 paginated endpoints.");

const articleHitsPerPageSchema = s.integer(
  "The number of articles per page. Use 0 to let Document360 return all articles, capped by the API.",
  {
    minimum: 0,
    maximum: 100,
  },
);

const searchHitsPerPageSchema = s.integer(
  "The number of search results per page. Document360 accepts values from 0 through 1000.",
  {
    minimum: 0,
    maximum: 1000,
  },
);

const securityVisibilitySchema = s.integer(
  "Document360 protection level filter where 0 means public and 1 means private or protected.",
  {
    minimum: 0,
    maximum: 1,
  },
);

const notificationSchema = s.object("A notification item returned by Document360.", {
  description: s.nullable(s.string("The notification description returned by Document360.")),
  errorCode: s.nullable(s.string("The notification error code returned by Document360.")),
  raw: s.looseObject("The raw notification object returned by Document360."),
});

const responseMetaSchema = s.object("The normalized Document360 response envelope metadata.", {
  success: s.boolean("Whether Document360 reported the operation as successful."),
  errors: s.array("The errors returned by Document360.", notificationSchema),
  warnings: s.array("The warnings returned by Document360.", notificationSchema),
  information: s.array("The informational messages returned by Document360.", notificationSchema),
});

const languageSchema = s.object("A language configured on a Document360 workspace.", {
  id: s.nullable(s.string("The language version ID returned by Document360.")),
  code: s.nullable(s.string("The language code returned by Document360.")),
  name: s.nullable(s.string("The language name returned by Document360.")),
  displayName: s.nullable(s.string("The display name returned by Document360.")),
  setAsDefault: s.nullable(s.boolean("Whether this language is the workspace default.")),
  hidden: s.nullable(s.boolean("Whether this language is hidden.")),
  raw: s.looseObject("The raw language object returned by Document360."),
});

const workspaceSchema = s.object("A normalized Document360 workspace or project version.", {
  id: s.string("The workspace ID."),
  versionNumber: s.nullable(s.number("The workspace version number.")),
  baseVersionNumber: s.nullable(s.number("The base workspace version number.")),
  versionCodeName: s.nullable(s.string("The custom workspace version name.")),
  isMainVersion: s.nullable(s.boolean("Whether this is the main workspace version.")),
  isBeta: s.nullable(s.boolean("Whether this workspace is marked beta.")),
  isPublic: s.nullable(s.boolean("Whether this workspace is public.")),
  isDeprecated: s.nullable(s.boolean("Whether this workspace is deprecated.")),
  slug: s.nullable(s.string("The workspace slug returned by Document360.")),
  order: s.nullable(s.integer("The workspace order returned by Document360.")),
  versionType: s.nullable(s.unknown("The workspace type returned by Document360.")),
  createdAt: s.nullable(s.string("The workspace creation timestamp returned by Document360.")),
  modifiedAt: s.nullable(s.string("The workspace modification timestamp returned by Document360.")),
  languages: s.array("The languages configured on this workspace.", languageSchema),
  raw: s.looseObject("The raw workspace object returned by Document360."),
});

const paginationSchema = s.nullable(
  s.looseObject("The raw pagination object returned by Document360 when pagination is enabled."),
);

const articleSchema = s.object("A normalized Document360 article summary.", {
  id: s.string("The article ID."),
  title: s.nullable(s.string("The article title returned by Document360.")),
  url: s.nullable(s.string("The article URL returned by Document360.")),
  slug: s.nullable(s.string("The article slug returned by Document360.")),
  languageCode: s.nullable(s.string("The article language code returned by Document360.")),
  publicVersion: s.nullable(s.number("The public version number returned by Document360.")),
  latestVersion: s.nullable(s.number("The latest version number returned by Document360.")),
  hidden: s.nullable(s.boolean("Whether the article is hidden.")),
  status: s.nullable(s.unknown("The article status returned by Document360.")),
  order: s.nullable(s.integer("The article order returned by Document360.")),
  contentType: s.nullable(s.unknown("The article content type returned by Document360.")),
  translationOption: s.nullable(s.unknown("The article translation option returned by Document360.")),
  isSharedArticle: s.nullable(s.boolean("Whether the article is shared.")),
  excludeFromExternalSearch: s.nullable(s.boolean("Whether the article is excluded from external search.")),
  securityVisibility: s.nullable(s.unknown("The article security visibility returned by Document360.")),
  currentWorkflowStatusId: s.nullable(s.string("The current workflow status ID returned by Document360.")),
  createdAt: s.nullable(s.string("The article creation timestamp returned by Document360.")),
  modifiedAt: s.nullable(s.string("The article modification timestamp returned by Document360.")),
  raw: s.looseObject("The raw article object returned by Document360."),
});

const categoryTreeChildSchema = s.object("A normalized child Document360 category tree node.", {
  id: s.string("The category ID."),
  name: s.nullable(s.string("The category name returned by Document360.")),
  description: s.nullable(s.string("The category description returned by Document360.")),
  slug: s.nullable(s.string("The category slug returned by Document360.")),
  languageCode: s.nullable(s.string("The category language code returned by Document360.")),
  categoryType: s.nullable(s.unknown("The category type returned by Document360.")),
  hidden: s.nullable(s.boolean("Whether the category is hidden.")),
  order: s.nullable(s.integer("The category order returned by Document360.")),
  icon: s.nullable(s.string("The category icon returned by Document360.")),
  status: s.nullable(s.unknown("The category status returned by Document360.")),
  excludeFromExternalSearch: s.nullable(s.boolean("Whether the category is excluded from external search.")),
  securityVisibility: s.nullable(s.unknown("The category security visibility returned by Document360.")),
  createdAt: s.nullable(s.string("The category creation timestamp returned by Document360.")),
  modifiedAt: s.nullable(s.string("The category modification timestamp returned by Document360.")),
  articles: s.array("The article summaries attached to this category.", articleSchema),
  childCategories: s.array(
    "The child categories nested under this category.",
    s.looseObject("A deeper nested category node returned by Document360."),
  ),
  raw: s.looseObject("The raw category object returned by Document360."),
});

const categoryTreeSchema = s.object("A normalized Document360 category tree node.", {
  id: s.string("The category ID."),
  name: s.nullable(s.string("The category name returned by Document360.")),
  description: s.nullable(s.string("The category description returned by Document360.")),
  slug: s.nullable(s.string("The category slug returned by Document360.")),
  languageCode: s.nullable(s.string("The category language code returned by Document360.")),
  categoryType: s.nullable(s.unknown("The category type returned by Document360.")),
  hidden: s.nullable(s.boolean("Whether the category is hidden.")),
  order: s.nullable(s.integer("The category order returned by Document360.")),
  icon: s.nullable(s.string("The category icon returned by Document360.")),
  status: s.nullable(s.unknown("The category status returned by Document360.")),
  excludeFromExternalSearch: s.nullable(s.boolean("Whether the category is excluded from external search.")),
  securityVisibility: s.nullable(s.unknown("The category security visibility returned by Document360.")),
  createdAt: s.nullable(s.string("The category creation timestamp returned by Document360.")),
  modifiedAt: s.nullable(s.string("The category modification timestamp returned by Document360.")),
  articles: s.array("The article summaries attached to this category.", articleSchema),
  childCategories: s.array("The child categories nested under this category.", categoryTreeChildSchema),
  raw: s.looseObject("The raw category object returned by Document360."),
});

const searchSnippetSchema = s.object("A normalized Document360 search snippet field.", {
  value: s.nullable(s.string("The highlighted snippet value returned by Document360.")),
  matchLevel: s.nullable(s.string("The snippet match level returned by Document360.")),
});

const searchHitSchema = s.object("A normalized Document360 search hit.", {
  articleId: s.nullable(s.string("The matched article ID returned by Document360.")),
  categoryId: s.nullable(s.string("The matched category ID returned by Document360.")),
  title: s.nullable(s.string("The matched title returned by Document360.")),
  content: s.nullable(s.string("The matched content returned by Document360.")),
  snippet: s.nullable(searchSnippetSchema),
  slug: s.nullable(s.string("The matched article slug returned by Document360.")),
  version: s.nullable(s.number("The matched article version returned by Document360.")),
  order: s.nullable(s.integer("The matched article order returned by Document360.")),
  isHidden: s.nullable(s.boolean("Whether the matched article is hidden.")),
  isDraft: s.nullable(s.boolean("Whether the matched article is a draft.")),
  isPrivate: s.nullable(s.boolean("Whether the matched article is private.")),
  langCode: s.nullable(s.string("The matched article language code returned by Document360.")),
  objectId: s.nullable(s.string("The search object ID returned by Document360.")),
  raw: s.looseObject("The raw search hit returned by Document360."),
});

const listWorkspacesAction = defineProviderAction(service, {
  name: "list_workspaces",
  operationType: "read",
  description: "List Document360 workspaces, also called project versions, for the API token.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Document360 workspaces.", {}),
  outputSchema: s.object("The response returned when listing Document360 workspaces.", {
    meta: responseMetaSchema,
    workspaces: s.array("The workspaces returned by Document360.", workspaceSchema),
    raw: s.looseObject("The raw Document360 response envelope."),
  }),
});

const listWorkspaceArticlesAction = defineProviderAction(service, {
  name: "list_workspace_articles",
  operationType: "read",
  description: "List articles in a Document360 workspace with optional language and pagination filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Document360 workspace articles.",
    {
      projectVersionId: projectVersionIdSchema,
      langCode: langCodeSchema,
      page: pageSchema,
      hitsPerPage: articleHitsPerPageSchema,
      securityVisibility: securityVisibilitySchema,
    },
    { optional: ["langCode", "page", "hitsPerPage", "securityVisibility"] },
  ),
  outputSchema: s.object("The response returned when listing Document360 articles.", {
    meta: responseMetaSchema,
    articles: s.array("The articles returned by Document360.", articleSchema),
    pagination: paginationSchema,
    raw: s.looseObject("The raw Document360 response envelope."),
  }),
});

const getWorkspaceCategoriesAction = defineProviderAction(service, {
  name: "get_workspace_categories",
  operationType: "read",
  description: "Get the Document360 category hierarchy for a workspace.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting Document360 workspace categories.",
    {
      projectVersionId: projectVersionIdSchema,
      excludeArticles: s.boolean("Whether Document360 should omit articles from category nodes."),
      langCode: langCodeSchema,
      includeCategoryDescription: s.boolean(
        "Whether Document360 should include category descriptions in the response.",
      ),
      securityVisibility: securityVisibilitySchema,
    },
    {
      optional: ["excludeArticles", "langCode", "includeCategoryDescription", "securityVisibility"],
    },
  ),
  outputSchema: s.object("The response returned when getting Document360 categories.", {
    meta: responseMetaSchema,
    categories: s.array("The top-level category nodes returned by Document360.", categoryTreeSchema),
    raw: s.looseObject("The raw Document360 response envelope."),
  }),
});

const searchWorkspaceAction = defineProviderAction(service, {
  name: "search_workspace",
  operationType: "read",
  description: "Search for a phrase inside a Document360 workspace.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching inside a Document360 workspace.",
    {
      projectVersionId: projectVersionIdSchema,
      langCode: langCodeSchema,
      searchQuery: trimmedString("The phrase to search across articles in the workspace."),
      page: pageSchema,
      hitsPerPage: searchHitsPerPageSchema,
    },
    { optional: ["page", "hitsPerPage"] },
  ),
  outputSchema: s.object("The response returned when searching a Document360 workspace.", {
    meta: responseMetaSchema,
    hits: s.array("The search hits returned by Document360.", searchHitSchema),
    totalHits: s.nullable(s.integer("The total hit count returned by Document360.")),
    page: s.nullable(s.integer("The result page returned by Document360.")),
    totalPages: s.nullable(s.integer("The total page count returned by Document360.")),
    hitsPerPage: s.nullable(s.integer("The page size returned by Document360.")),
    processingTimeMs: s.nullable(s.integer("The search processing time in milliseconds returned by Document360.")),
    query: s.nullable(s.string("The normalized search query returned by Document360.")),
    raw: s.looseObject("The raw Document360 response envelope."),
  }),
});

export type Document360ActionName =
  | "list_workspaces"
  | "list_workspace_articles"
  | "get_workspace_categories"
  | "search_workspace";

export const document360Actions: ActionDefinition[] = [
  listWorkspacesAction,
  listWorkspaceArticlesAction,
  getWorkspaceCategoriesAction,
  searchWorkspaceAction,
];
