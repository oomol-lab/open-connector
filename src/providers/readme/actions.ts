import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "readme" as const;

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const versionInput = {
  version: s.string("The optional ReadMe project version to send with the x-readme-version header, for example v3.0."),
};

const paginationInput = {
  perPage: s.integer("The number of items to include per page. ReadMe accepts values up to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  page: s.integer("The one-based page number to request.", { minimum: 1 }),
};

const emptyInputSchema = s.object("No input is required for this ReadMe action.", {});

const versionedPaginationInputSchema = s.object(
  "Optional ReadMe version and pagination parameters.",
  {
    ...versionInput,
    ...paginationInput,
  },
  { optional: ["version", "perPage", "page"] },
);

const slugInputSchema = s.object(
  "The ReadMe slug and optional project version.",
  {
    slug: nonEmptyString("The URL-safe ReadMe slug to request."),
    ...versionInput,
  },
  { optional: ["version"] },
);

const searchDocsInputSchema = s.object(
  "The ReadMe docs search query and optional project version.",
  {
    search: nonEmptyString("The search text to look for in ReadMe docs."),
    ...versionInput,
  },
  { optional: ["version"] },
);

const getDocInputSchema = s.object(
  "The ReadMe doc slug and retrieval options.",
  {
    slug: nonEmptyString("The URL-safe ReadMe doc slug to request."),
    production: s.boolean("Whether to request the production version of the doc."),
    ...versionInput,
  },
  { optional: ["production", "version"] },
);

const getVersionInputSchema = s.object("The ReadMe version identifier to request.", {
  versionId: nonEmptyString(
    "The semver identifier for the project version, preferably the version_clean value from list_versions.",
  ),
});

const deleteVersionInputSchema = s.object("The ReadMe version identifier to delete.", {
  versionId: nonEmptyString(
    "The semver identifier for the project version, preferably the version_clean value from list_versions.",
  ),
});

const apiRegistryInputSchema = s.object("The ReadMe API Registry entry identifier to request.", {
  uuid: nonEmptyString("The API Registry UUID to retrieve from ReadMe."),
});

const apiSpecificationIdInputSchema = s.object("The ReadMe API specification identifier.", {
  id: nonEmptyString("The API specification ID to delete."),
});

const apiSpecificationListInputSchema = versionedPaginationInputSchema;

const rawObject = (description: string) => s.looseObject(description);
const rawArray = (description: string) => s.array(description, s.unknown("One ReadMe item."));

const paginationMetadataSchema = {
  link: s.string("The raw Link response header returned by ReadMe when present."),
  totalCount: s.integer("The x-total-count response header returned by ReadMe when present."),
};

const projectSchema = s.looseObject("ReadMe project metadata returned for the API key.", {
  name: s.string("The ReadMe project name."),
  subdomain: s.string("The ReadMe project subdomain."),
  baseUrl: s.string("The public base URL for the ReadMe project."),
  plan: s.string("The ReadMe project plan when returned."),
});

const projectOutputSchema = s.object("The current ReadMe project response.", {
  project: projectSchema,
});

const versionsOutputSchema = s.object("The ReadMe project versions response.", {
  versions: rawArray("The ReadMe versions returned by the API."),
  raw: s.unknown("The raw ReadMe versions payload."),
});

const versionOutputSchema = s.object("The ReadMe project version response.", {
  version: rawObject("The ReadMe version returned by the API."),
});

const categoriesOutputSchema = s.object(
  "The ReadMe categories response.",
  {
    categories: rawArray("The ReadMe categories returned by the API."),
    ...paginationMetadataSchema,
  },
  { optional: ["link", "totalCount"] },
);

const categoryOutputSchema = s.object("The ReadMe category response.", {
  category: rawObject("The ReadMe category returned by the API."),
});

const categoryDocsOutputSchema = s.object("The ReadMe category docs response.", {
  docs: rawArray("The ReadMe docs returned for the category."),
  raw: s.unknown("The raw ReadMe category docs payload."),
});

const searchDocsOutputSchema = s.object("The ReadMe docs search response.", {
  results: rawArray("The ReadMe docs returned by search."),
  raw: s.unknown("The raw ReadMe search payload."),
});

const docOutputSchema = s.object("The ReadMe doc response.", {
  doc: rawObject("The ReadMe doc returned by the API."),
});

const changelogsOutputSchema = s.object(
  "The ReadMe changelogs response.",
  {
    changelogs: rawArray("The ReadMe changelogs returned by the API."),
    ...paginationMetadataSchema,
  },
  { optional: ["link", "totalCount"] },
);

const changelogOutputSchema = s.object("The ReadMe changelog response.", {
  changelog: rawObject("The ReadMe changelog returned by the API."),
});

const deletedOutputSchema = s.object("The ReadMe delete response.", {
  deleted: s.boolean("Whether the ReadMe resource was deleted."),
});

const apiSpecificationsOutputSchema = s.object(
  "The ReadMe API specification metadata response.",
  {
    apiSpecifications: rawArray("The ReadMe API specification metadata records returned by the API."),
    raw: s.unknown("The raw ReadMe API specification metadata payload."),
    ...paginationMetadataSchema,
  },
  { optional: ["link", "totalCount"] },
);

const apiRegistryOutputSchema = s.object("The ReadMe API Registry entry response.", {
  registry: rawObject("The ReadMe API Registry entry returned by the API."),
});

const openApiSchemaOutputSchema = s.object("The ReadMe OpenAPI schema response.", {
  schema: rawObject("The OpenAPI definition returned by ReadMe."),
});

const outboundIpsOutputSchema = s.object("The ReadMe outbound IP address response.", {
  outboundIps: s.array(
    "The outbound IP address entries returned by ReadMe.",
    rawObject("One ReadMe outbound IP address entry."),
  ),
});

const owlbotOutputSchema = s.object(
  "The ReadMe Owlbot answer response.",
  {
    answer: s.string("The generated answer returned by Owlbot."),
    sources: s.array("The sources returned for the Owlbot answer.", rawObject("One Owlbot source returned by ReadMe.")),
    raw: rawObject("The raw Owlbot response returned by ReadMe."),
  },
  { optional: ["answer", "sources"] },
);

const categoryPayload = {
  title: nonEmptyString("A short title for the category."),
  type: s.stringEnum("The ReadMe category type.", ["reference", "guide"]),
};

const createCategoryInputSchema = s.object(
  "The ReadMe category creation payload.",
  {
    ...versionInput,
    ...categoryPayload,
  },
  { optional: ["version", "type"] },
);

const updateCategoryInputSchema = s.object(
  "The ReadMe category update payload.",
  {
    slug: nonEmptyString("The URL-safe ReadMe category slug to update."),
    ...versionInput,
    ...categoryPayload,
  },
  { optional: ["version", "title", "type"] },
);

const deleteCategoryInputSchema = slugInputSchema;

const docPayload = {
  title: nonEmptyString("The title of the ReadMe doc."),
  type: s.stringEnum("The ReadMe doc page type.", ["basic", "error", "link"]),
  body: s.string("The ReadMe-flavored Markdown body content for the page."),
  category: s.string("The ReadMe category ID for the page."),
  categorySlug: s.string("The ReadMe category slug for the page."),
  hidden: s.boolean("Whether the doc is hidden."),
  order: s.integer("The position of the doc in the project sidebar."),
  parentDoc: s.string("The parent doc ID if the page is a subpage."),
  parentDocSlug: s.string("The parent doc slug if the page is a subpage."),
  error: rawObject("Deprecated error-page metadata for ReadMe docs."),
};

const createDocInputSchema = {
  ...s.looseObject("The ReadMe doc creation payload.", {
    ...versionInput,
    ...docPayload,
  }),
  anyOf: [{ required: ["category"] }, { required: ["categorySlug"] }],
};

const updateDocInputSchema = s.looseObject("The ReadMe doc update payload.", {
  slug: nonEmptyString("The URL-safe ReadMe doc slug to update."),
  ...versionInput,
  ...docPayload,
});

const deleteDocInputSchema = slugInputSchema;

const customPagePayload = {
  title: nonEmptyString("The title of the ReadMe custom page."),
  body: s.string("The Markdown body content for the custom page."),
  html: s.string("The HTML body content for the custom page."),
  htmlmode: s.boolean("Whether ReadMe should display html instead of body."),
  hidden: s.boolean("Whether the custom page is hidden."),
};

const customPagesInputSchema = s.object("Optional ReadMe custom page pagination parameters.", paginationInput, {
  optional: ["perPage", "page"],
});

const createCustomPageInputSchema = s.object("The ReadMe custom page creation payload.", customPagePayload, {
  optional: ["body", "html", "htmlmode", "hidden"],
});

const updateCustomPageInputSchema = s.object(
  "The ReadMe custom page update payload.",
  {
    slug: nonEmptyString("The URL-safe ReadMe custom page slug to update."),
    ...customPagePayload,
  },
  { optional: ["title", "body", "html", "htmlmode", "hidden"] },
);

const changelogPayload = {
  title: nonEmptyString("The title of the ReadMe changelog entry."),
  type: s.stringEnum("The ReadMe changelog entry type.", ["", "added", "fixed", "improved", "deprecated", "removed"]),
  body: nonEmptyString("The body content of the ReadMe changelog entry."),
  hidden: s.boolean("Whether the changelog entry is hidden."),
};

const createChangelogInputSchema = s.object("The ReadMe changelog creation payload.", changelogPayload, {
  optional: ["type", "hidden"],
});

const updateChangelogInputSchema = s.object(
  "The ReadMe changelog update payload.",
  {
    slug: nonEmptyString("The URL-safe ReadMe changelog slug to update."),
    ...changelogPayload,
  },
  { optional: ["title", "type", "body", "hidden"] },
);

const deleteChangelogInputSchema = s.object("The ReadMe changelog slug to delete.", {
  slug: nonEmptyString("The URL-safe ReadMe changelog slug to delete."),
});

const versionPayload = {
  version: nonEmptyString("The semantic version identifier for the ReadMe project version."),
  codename: s.string("The codename for the ReadMe project version."),
  from: nonEmptyString("The semantic version to use as the base fork."),
  is_stable: s.boolean("Whether this version should be the main stable version."),
  is_beta: s.boolean("Whether this version is beta."),
  is_hidden: s.boolean("Whether this version is hidden."),
  is_deprecated: s.boolean("Whether this version is deprecated."),
  pdfStatus: s.string("The PDF generation status for the version."),
};

const createVersionInputSchema = s.object("The ReadMe version creation payload.", versionPayload, {
  optional: ["codename", "is_stable", "is_beta", "is_hidden", "is_deprecated", "pdfStatus"],
});

const updateVersionInputSchema = s.object(
  "The ReadMe version update payload.",
  {
    versionId: nonEmptyString("The semver identifier for the ReadMe project version to update."),
    ...versionPayload,
  },
  {
    optional: ["version", "codename", "from", "is_stable", "is_beta", "is_hidden", "is_deprecated", "pdfStatus"],
  },
);

const askOwlbotInputSchema = s.object("The ReadMe Owlbot question payload.", {
  question: nonEmptyString("The question to ask Owlbot."),
});

export const readmeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get metadata for the ReadMe project associated with the API key.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_versions",
    operationType: "read",
    description: "List the versions configured for the ReadMe project.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: versionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_version",
    operationType: "read",
    description: "Get one ReadMe project version by semver identifier.",
    requiredScopes: [],
    inputSchema: getVersionInputSchema,
    outputSchema: versionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_version",
    operationType: "write",
    description: "Create a new ReadMe project version from an existing base version.",
    requiredScopes: [],
    inputSchema: createVersionInputSchema,
    outputSchema: versionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_version",
    operationType: "write",
    description: "Update one ReadMe project version by semver identifier.",
    requiredScopes: [],
    inputSchema: updateVersionInputSchema,
    outputSchema: versionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_version",
    operationType: "destructive",
    description: "Delete one ReadMe project version by semver identifier.",
    requiredScopes: [],
    inputSchema: deleteVersionInputSchema,
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_categories",
    operationType: "read",
    description: "List ReadMe guide and reference categories with optional version and pagination.",
    requiredScopes: [],
    inputSchema: versionedPaginationInputSchema,
    outputSchema: categoriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_category",
    operationType: "write",
    description: "Create a ReadMe guide or reference category.",
    requiredScopes: [],
    inputSchema: createCategoryInputSchema,
    outputSchema: categoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_category",
    operationType: "read",
    description: "Get one ReadMe category by slug.",
    requiredScopes: [],
    inputSchema: slugInputSchema,
    outputSchema: categoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_category",
    operationType: "write",
    description: "Update one ReadMe category by slug.",
    requiredScopes: [],
    inputSchema: updateCategoryInputSchema,
    outputSchema: categoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_category",
    operationType: "destructive",
    description: "Delete one ReadMe category by slug.",
    requiredScopes: [],
    inputSchema: deleteCategoryInputSchema,
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_category_docs",
    operationType: "read",
    description: "List the ReadMe docs that belong to a category slug.",
    requiredScopes: [],
    inputSchema: slugInputSchema,
    outputSchema: categoryDocsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_docs",
    operationType: "read",
    description: "Search ReadMe docs by text query.",
    requiredScopes: [],
    inputSchema: searchDocsInputSchema,
    outputSchema: searchDocsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_doc",
    operationType: "write",
    description: "Create a ReadMe doc page using a category ID or category slug.",
    requiredScopes: [],
    inputSchema: createDocInputSchema,
    outputSchema: docOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_doc",
    operationType: "read",
    description: "Get one ReadMe doc by slug, optionally requesting the production doc version.",
    requiredScopes: [],
    inputSchema: getDocInputSchema,
    outputSchema: docOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_doc",
    operationType: "write",
    description: "Update one ReadMe doc page by slug.",
    requiredScopes: [],
    inputSchema: updateDocInputSchema,
    outputSchema: docOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_doc",
    operationType: "destructive",
    description: "Delete one ReadMe doc page by slug.",
    requiredScopes: [],
    inputSchema: deleteDocInputSchema,
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_custom_pages",
    operationType: "read",
    description: "List ReadMe custom pages with optional pagination.",
    requiredScopes: [],
    inputSchema: customPagesInputSchema,
    outputSchema: s.object(
      "The ReadMe custom pages response.",
      {
        customPages: rawArray("The ReadMe custom pages returned by the API."),
        ...paginationMetadataSchema,
      },
      { optional: ["link", "totalCount"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_custom_page",
    operationType: "write",
    description: "Create a ReadMe custom page.",
    requiredScopes: [],
    inputSchema: createCustomPageInputSchema,
    outputSchema: s.object("The ReadMe custom page response.", {
      customPage: rawObject("The ReadMe custom page returned by the API."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_custom_page",
    operationType: "read",
    description: "Get one ReadMe custom page by slug.",
    requiredScopes: [],
    inputSchema: s.object("The ReadMe custom page slug to request.", {
      slug: nonEmptyString("The URL-safe ReadMe custom page slug to request."),
    }),
    outputSchema: s.object("The ReadMe custom page response.", {
      customPage: rawObject("The ReadMe custom page returned by the API."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_custom_page",
    operationType: "write",
    description: "Update one ReadMe custom page by slug.",
    requiredScopes: [],
    inputSchema: updateCustomPageInputSchema,
    outputSchema: s.object("The ReadMe custom page response.", {
      customPage: rawObject("The ReadMe custom page returned by the API."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_custom_page",
    operationType: "destructive",
    description: "Delete one ReadMe custom page by slug.",
    requiredScopes: [],
    inputSchema: s.object("The ReadMe custom page slug to delete.", {
      slug: nonEmptyString("The URL-safe ReadMe custom page slug to delete."),
    }),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_changelogs",
    operationType: "read",
    description: "List ReadMe changelog entries with optional pagination.",
    requiredScopes: [],
    inputSchema: s.object("Optional ReadMe changelog pagination parameters.", paginationInput, {
      optional: ["perPage", "page"],
    }),
    outputSchema: changelogsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_changelog",
    operationType: "write",
    description: "Create a ReadMe changelog entry.",
    requiredScopes: [],
    inputSchema: createChangelogInputSchema,
    outputSchema: changelogOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_changelog",
    operationType: "read",
    description: "Get one ReadMe changelog entry by slug.",
    requiredScopes: [],
    inputSchema: s.object("The ReadMe changelog slug to request.", {
      slug: nonEmptyString("The URL-safe ReadMe changelog slug to request."),
    }),
    outputSchema: changelogOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_changelog",
    operationType: "write",
    description: "Update one ReadMe changelog entry by slug.",
    requiredScopes: [],
    inputSchema: updateChangelogInputSchema,
    outputSchema: changelogOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_changelog",
    operationType: "destructive",
    description: "Delete one ReadMe changelog entry by slug.",
    requiredScopes: [],
    inputSchema: deleteChangelogInputSchema,
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_api_specifications",
    operationType: "read",
    description: "List ReadMe API specification metadata with optional version and pagination.",
    requiredScopes: [],
    inputSchema: apiSpecificationListInputSchema,
    outputSchema: apiSpecificationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_api_specification",
    operationType: "destructive",
    description: "Delete one ReadMe API specification by ID.",
    requiredScopes: [],
    inputSchema: apiSpecificationIdInputSchema,
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_api_registry",
    operationType: "read",
    description: "Retrieve one ReadMe API Registry entry by UUID.",
    requiredScopes: [],
    inputSchema: apiRegistryInputSchema,
    outputSchema: apiRegistryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_openapi_schema",
    operationType: "read",
    description: "Get the OpenAPI definition for the ReadMe project.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: openApiSchemaOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_outbound_ips",
    operationType: "read",
    description: "List ReadMe outbound IP addresses used for webhook and Try It proxy requests.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: outboundIpsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ask_owlbot",
    operationType: "read",
    description: "Ask ReadMe Owlbot a non-streaming question and return its answer with sources.",
    requiredScopes: [],
    inputSchema: askOwlbotInputSchema,
    outputSchema: owlbotOutputSchema,
  }),
] as const satisfies Array<ProviderActionDefinition<any>>;

export type ReadMeActionName =
  | "get_project"
  | "list_versions"
  | "get_version"
  | "create_version"
  | "update_version"
  | "delete_version"
  | "list_categories"
  | "create_category"
  | "get_category"
  | "update_category"
  | "delete_category"
  | "list_category_docs"
  | "search_docs"
  | "create_doc"
  | "get_doc"
  | "update_doc"
  | "delete_doc"
  | "list_custom_pages"
  | "create_custom_page"
  | "get_custom_page"
  | "update_custom_page"
  | "delete_custom_page"
  | "list_changelogs"
  | "create_changelog"
  | "get_changelog"
  | "update_changelog"
  | "delete_changelog"
  | "list_api_specifications"
  | "delete_api_specification"
  | "get_api_registry"
  | "get_openapi_schema"
  | "list_outbound_ips"
  | "ask_owlbot";
