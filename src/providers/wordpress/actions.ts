import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wordpress";

const nonEmptyStringSchema = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });
const idSchema = s.positiveInteger("The numeric WordPress resource ID.");
const idsSchema = (description: string) =>
  s.array(description, s.positiveInteger("One numeric WordPress resource ID."), { minItems: 1 });
const slugSchema = nonEmptyStringSchema("The WordPress URL slug.");
const statusSchema = s.stringEnum("The WordPress publication status.", [
  "publish",
  "future",
  "draft",
  "pending",
  "private",
]);
const commentStatusSchema = s.stringEnum("The WordPress comment status.", [
  "hold",
  "approve",
  "approved",
  "spam",
  "trash",
]);
const orderSchema = s.stringEnum("The sort direction for WordPress list results.", ["asc", "desc"]);
const postOrderbySchema = s.stringEnum("The field used to sort WordPress posts or pages.", [
  "author",
  "date",
  "id",
  "include",
  "modified",
  "parent",
  "relevance",
  "slug",
  "include_slugs",
  "title",
]);
const termOrderbySchema = s.stringEnum("The field used to sort WordPress terms.", [
  "id",
  "include",
  "name",
  "slug",
  "include_slugs",
  "term_group",
  "description",
  "count",
]);
const commentOrderbySchema = s.stringEnum("The field used to sort WordPress comments.", [
  "date",
  "date_gmt",
  "id",
  "include",
  "post",
  "parent",
  "type",
]);
const pageNumberSchema = s.positiveInteger("The page number of WordPress results to return.");
const perPageSchema = s.integer("The maximum number of WordPress results to return.", {
  minimum: 1,
  maximum: 100,
});
const renderedSchema = s.looseObject("A WordPress rendered object.", {
  rendered: s.string("The rendered HTML value returned by WordPress."),
});
const paginationSchema = s.object("Pagination metadata returned in WordPress response headers.", {
  total: s.nullableInteger("The total number of matching WordPress resources."),
  totalPages: s.nullableInteger("The total number of WordPress result pages."),
});
const deleteOutputSchema = s.object("The response returned when deleting a WordPress resource.", {
  deleted: s.boolean("Whether WordPress deleted the resource."),
  previous: s.nullable(s.looseObject("The previous WordPress resource payload when returned.")),
});
const metaSchema = s.looseObject("Meta fields to send to WordPress.");
const statusListSchema = s.array("WordPress statuses to include.", statusSchema, { minItems: 1 });
const commentStatusListSchema = s.array("WordPress comment statuses to include.", commentStatusSchema, {
  minItems: 1,
});

function paginatedInputSchema(
  description: string,
  properties: Record<string, JsonSchema>,
  optional: string[],
): JsonSchema {
  return s.object(
    description,
    {
      search: s.string("Limit results to resources matching this search string.", {
        minLength: 1,
        pattern: "\\S",
      }),
      page: pageNumberSchema,
      perPage: perPageSchema,
      order: orderSchema,
      ...properties,
    },
    { optional: ["search", "page", "perPage", "order", ...optional] },
  );
}

const postListInputSchema = paginatedInputSchema(
  "Input parameters for listing WordPress posts.",
  {
    status: statusListSchema,
    categories: idsSchema("Category IDs used to filter WordPress posts."),
    tags: idsSchema("Tag IDs used to filter WordPress posts."),
    include: idsSchema("Post IDs to include in the response."),
    exclude: idsSchema("Post IDs to exclude from the response."),
    author: idsSchema("Author user IDs used to filter WordPress posts."),
    slug: s.array("Post slugs used to filter WordPress posts.", slugSchema, { minItems: 1 }),
    orderby: postOrderbySchema,
  },
  ["status", "categories", "tags", "include", "exclude", "author", "slug", "orderby"],
);

const pageListInputSchema = paginatedInputSchema(
  "Input parameters for listing WordPress pages.",
  {
    status: statusListSchema,
    include: idsSchema("Page IDs to include in the response."),
    exclude: idsSchema("Page IDs to exclude from the response."),
    parent: idsSchema("Parent page IDs used to filter WordPress pages."),
    author: idsSchema("Author user IDs used to filter WordPress pages."),
    slug: s.array("Page slugs used to filter WordPress pages.", slugSchema, { minItems: 1 }),
    orderby: postOrderbySchema,
  },
  ["status", "include", "exclude", "parent", "author", "slug", "orderby"],
);

const termListInputSchema = paginatedInputSchema(
  "Input parameters for listing WordPress terms.",
  {
    include: idsSchema("Term IDs to include in the response."),
    exclude: idsSchema("Term IDs to exclude from the response."),
    parent: s.positiveInteger("Parent term ID used to filter child terms."),
    slug: s.array("Term slugs used to filter WordPress terms.", slugSchema, { minItems: 1 }),
    hideEmpty: s.boolean("Whether to hide terms not assigned to any post."),
    orderby: termOrderbySchema,
  },
  ["include", "exclude", "parent", "slug", "hideEmpty", "orderby"],
);

const commentListInputSchema = paginatedInputSchema(
  "Input parameters for listing WordPress comments.",
  {
    status: commentStatusListSchema,
    post: idsSchema("Post IDs used to filter comments."),
    author: idsSchema("Author user IDs used to filter comments."),
    parent: idsSchema("Parent comment IDs used to filter comments."),
    include: idsSchema("Comment IDs to include in the response."),
    exclude: idsSchema("Comment IDs to exclude from the response."),
    orderby: commentOrderbySchema,
  },
  ["status", "post", "author", "parent", "include", "exclude", "orderby"],
);

const postInputSchema = s.object(
  "Input fields for creating or updating a WordPress post.",
  {
    title: nonEmptyStringSchema("The post title."),
    content: s.string("The post content."),
    excerpt: s.string("The post excerpt."),
    slug: slugSchema,
    status: statusSchema,
    categories: idsSchema("Category IDs assigned to the post."),
    tags: idsSchema("Tag IDs assigned to the post."),
    featuredMedia: s.positiveInteger("The featured media attachment ID."),
    meta: metaSchema,
  },
  {
    optional: ["title", "content", "excerpt", "slug", "status", "categories", "tags", "featuredMedia", "meta"],
  },
);

const pageInputSchema = s.object(
  "Input fields for creating or updating a WordPress page.",
  {
    title: nonEmptyStringSchema("The page title."),
    content: s.string("The page content."),
    excerpt: s.string("The page excerpt."),
    slug: slugSchema,
    status: statusSchema,
    parent: s.positiveInteger("The parent page ID."),
    featuredMedia: s.positiveInteger("The featured media attachment ID."),
    menuOrder: s.integer("The page menu order."),
    meta: metaSchema,
  },
  {
    optional: ["title", "content", "excerpt", "slug", "status", "parent", "featuredMedia", "menuOrder", "meta"],
  },
);

const termInputSchema = s.object(
  "Input fields for creating a WordPress taxonomy term.",
  {
    name: nonEmptyStringSchema("The term display name."),
    slug: slugSchema,
    description: s.string("The term description."),
    parent: s.positiveInteger("The parent term ID."),
    meta: metaSchema,
  },
  { optional: ["slug", "description", "parent", "meta"] },
);

const commentUpdateInputSchema = s.object(
  "Input fields for updating a WordPress comment.",
  {
    id: idSchema,
    content: s.string("The comment content."),
    status: commentStatusSchema,
    authorName: s.string("The display name for the comment author.", { minLength: 1 }),
    authorEmail: s.email("The email address for the comment author."),
    authorUrl: s.url("The URL for the comment author."),
  },
  { optional: ["content", "status", "authorName", "authorEmail", "authorUrl"] },
);

const getInputSchema = s.object("Input parameters for retrieving one WordPress resource.", {
  id: idSchema,
});
const deleteInputSchema = s.object(
  "Input parameters for deleting one WordPress resource.",
  {
    id: idSchema,
    force: s.boolean("Whether to permanently delete the resource instead of moving it to trash."),
  },
  { optional: ["force"] },
);
const currentUserSchema = s.looseRequiredObject("The authenticated WordPress user.", {
  id: s.positiveInteger("The numeric WordPress user ID."),
  name: s.string("The WordPress user display name."),
});
const postSchema = s.looseRequiredObject("A WordPress post object.", {
  id: s.positiveInteger("The numeric WordPress post ID."),
  slug: s.string("The WordPress post slug."),
  status: s.string("The WordPress post status."),
  title: renderedSchema,
});
const pageSchemaOutput = s.looseRequiredObject("A WordPress page object.", {
  id: s.positiveInteger("The numeric WordPress page ID."),
  slug: s.string("The WordPress page slug."),
  status: s.string("The WordPress page status."),
  title: renderedSchema,
});
const termSchema = s.looseRequiredObject("A WordPress taxonomy term object.", {
  id: s.positiveInteger("The numeric WordPress term ID."),
  name: s.string("The term display name."),
  slug: s.string("The WordPress term slug."),
});
const commentSchema = s.looseRequiredObject("A WordPress comment object.", {
  id: s.positiveInteger("The numeric WordPress comment ID."),
  status: s.string("The WordPress comment status."),
});

export const wordpressActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated WordPress user.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting the authenticated WordPress user.", {}),
    outputSchema: s.object("The response returned when getting the authenticated WordPress user.", {
      user: currentUserSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_posts",
    description: "List WordPress posts with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: postListInputSchema,
    outputSchema: s.object("The response returned when listing WordPress posts.", {
      posts: s.array("The WordPress posts returned by the list request.", postSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_post",
    description: "Get a WordPress post by ID.",
    requiredScopes: [],
    inputSchema: getInputSchema,
    outputSchema: s.object("The response returned when getting a WordPress post.", { post: postSchema }),
  }),
  defineProviderAction(service, {
    name: "create_post",
    description: "Create a WordPress post.",
    requiredScopes: [],
    inputSchema: postInputSchema,
    outputSchema: s.object("The response returned when creating a WordPress post.", { post: postSchema }),
  }),
  defineProviderAction(service, {
    name: "update_post",
    description: "Update a WordPress post by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating a WordPress post.",
      { id: idSchema, ...((postInputSchema.properties ?? {}) as Record<string, JsonSchema>) },
      {
        optional: ["title", "content", "excerpt", "slug", "status", "categories", "tags", "featuredMedia", "meta"],
      },
    ),
    outputSchema: s.object("The response returned when updating a WordPress post.", { post: postSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_post",
    description: "Delete a WordPress post by ID.",
    requiredScopes: [],
    inputSchema: deleteInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_pages",
    description: "List WordPress pages with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: pageListInputSchema,
    outputSchema: s.object("The response returned when listing WordPress pages.", {
      pages: s.array("The WordPress pages returned by the list request.", pageSchemaOutput),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Get a WordPress page by ID.",
    requiredScopes: [],
    inputSchema: getInputSchema,
    outputSchema: s.object("The response returned when getting a WordPress page.", { page: pageSchemaOutput }),
  }),
  defineProviderAction(service, {
    name: "create_page",
    description: "Create a WordPress page.",
    requiredScopes: [],
    inputSchema: pageInputSchema,
    outputSchema: s.object("The response returned when creating a WordPress page.", { page: pageSchemaOutput }),
  }),
  defineProviderAction(service, {
    name: "update_page",
    description: "Update a WordPress page by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating a WordPress page.",
      { id: idSchema, ...((pageInputSchema.properties ?? {}) as Record<string, JsonSchema>) },
      {
        optional: ["title", "content", "excerpt", "slug", "status", "parent", "featuredMedia", "menuOrder", "meta"],
      },
    ),
    outputSchema: s.object("The response returned when updating a WordPress page.", { page: pageSchemaOutput }),
  }),
  defineProviderAction(service, {
    name: "delete_page",
    description: "Delete a WordPress page by ID.",
    requiredScopes: [],
    inputSchema: deleteInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List WordPress categories with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: termListInputSchema,
    outputSchema: s.object("The response returned when listing WordPress categories.", {
      categories: s.array("The WordPress categories returned by the list request.", termSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_category",
    description: "Create a WordPress category.",
    requiredScopes: [],
    inputSchema: termInputSchema,
    outputSchema: s.object("The response returned when creating a WordPress category.", { category: termSchema }),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List WordPress tags with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: termListInputSchema,
    outputSchema: s.object("The response returned when listing WordPress tags.", {
      tags: s.array("The WordPress tags returned by the list request.", termSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create a WordPress tag.",
    requiredScopes: [],
    inputSchema: termInputSchema,
    outputSchema: s.object("The response returned when creating a WordPress tag.", { tag: termSchema }),
  }),
  defineProviderAction(service, {
    name: "list_comments",
    description: "List WordPress comments with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: commentListInputSchema,
    outputSchema: s.object("The response returned when listing WordPress comments.", {
      comments: s.array("The WordPress comments returned by the list request.", commentSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_comment",
    description: "Update a WordPress comment by ID.",
    requiredScopes: [],
    inputSchema: commentUpdateInputSchema,
    outputSchema: s.object("The response returned when updating a WordPress comment.", { comment: commentSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_comment",
    description: "Delete a WordPress comment by ID.",
    requiredScopes: [],
    inputSchema: deleteInputSchema,
    outputSchema: deleteOutputSchema,
  }),
];
