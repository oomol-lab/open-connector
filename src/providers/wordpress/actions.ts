import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wordpress";

const nonEmptyStringSchema = (description: string) =>
  s.nonEmptyString(description, {
    pattern: "\\S",
  });
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
  "unspam",
  "trash",
  "untrash",
  "0",
  "1",
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
const pageSchema = s.positiveInteger("The page number of WordPress results to return.");
const perPageSchema = s.integer("The maximum number of WordPress results to return.", {
  minimum: 1,
  maximum: 100,
});
const renderedSchema = s.looseObject("A WordPress rendered object.", {
  rendered: s.string("The rendered HTML value returned by WordPress."),
});
const paginationSchema = s.requiredObject("Pagination metadata returned in WordPress response headers.", {
  total: s.nullable(s.integer("The total number of matching WordPress resources.")),
  totalPages: s.nullable(s.integer("The total number of WordPress result pages.")),
});
const deleteOutputSchema = s.requiredObject("The response returned when deleting a WordPress resource.", {
  deleted: s.boolean("Whether WordPress permanently deleted the resource."),
  trashed: s.boolean("Whether WordPress moved the resource to trash."),
  previous: s.nullable(s.looseObject("The previous WordPress resource payload when returned.")),
  resource: s.nullable(s.looseObject("The resource returned after moving it to trash; null after permanent deletion.")),
});
const metaSchema = s.looseObject("Meta fields to send to WordPress.");
const contextSchema = s.stringEnum("Scope determining the fields returned by WordPress.", ["view", "embed", "edit"]);
const nonNegativeIdSchema = s.integer("A WordPress resource ID, or zero to clear the association.", { minimum: 0 });
const dateSchema = s.string("An ISO8601 date in the site's timezone.");
const dateGmtSchema = s.string("An ISO8601 date in GMT.");
const resourceReadInputSchemaProperties = {
  id: idSchema,
  context: contextSchema,
};
const resourceReadInputSchema = s.object(
  "Input parameters for retrieving one WordPress resource.",
  resourceReadInputSchemaProperties,
  { optional: ["context"] },
);
const termUpdateProperties = {
  id: idSchema,
  name: nonEmptyStringSchema("The term display name."),
  slug: s.string("The WordPress term slug; an empty string regenerates it."),
  description: s.string("The HTML description of the term."),
  meta: metaSchema,
};
const categoryUpdateInputSchema = s.object(
  "Input fields for updating a WordPress category.",
  {
    ...termUpdateProperties,
    parent: nonNegativeIdSchema,
  },
  { required: ["id"] },
);
const tagUpdateInputSchema = s.object("Input fields for updating a WordPress tag.", termUpdateProperties, {
  required: ["id"],
});
const permanentDeleteInputSchema = s.requiredObject(
  "Input parameters for permanently deleting a WordPress term. The connector supplies force=true because terms do not support trash.",
  { id: idSchema },
);
const commentCreateInputSchema = s.object(
  "Input fields for creating a WordPress comment.",
  {
    post: s.positiveInteger("The numeric ID of the content object being commented on."),
    content: s.nonEmptyString("The content of the comment."),
    parent: s.integer("The parent comment ID; zero creates a top-level comment.", { minimum: 0 }),
    author: s.positiveInteger("The comment author user ID; must identify an existing WordPress user."),
    authorName: s.string("The display name of the comment author."),
    authorEmail: s.email("The email address of the comment author."),
    authorUrl: s.string("The URL of the comment author."),
    authorIp: s.string("The IP address of the comment author."),
    authorUserAgent: s.string("The user agent of the comment author."),
    date: dateSchema,
    dateGmt: dateGmtSchema,
    status: s.string("The comment moderation status accepted by this WordPress site."),
    meta: metaSchema,
  },
  { required: ["post", "content"] },
);
const commentReadInputSchema = s.object(
  "Input parameters for retrieving a WordPress comment.",
  {
    ...resourceReadInputSchemaProperties,
    ...{
      password: s.string("The password of the parent post if it is password protected."),
    },
  },
  { required: ["id"] },
);
const mediaProperties = {
  date: dateSchema,
  dateGmt: dateGmtSchema,
  slug: s.string("The WordPress attachment slug."),
  status: statusSchema,
  title: s.string("The title of the attachment."),
  author: idSchema,
  commentStatus: s.stringEnum("Whether comments are open on the attachment.", ["open", "closed"]),
  pingStatus: s.stringEnum("Whether the attachment can be pinged.", ["open", "closed"]),
  template: s.string("The theme file used to display the attachment."),
  altText: s.string("Alternative text displayed when the attachment is not displayed."),
  caption: s.string("The caption of the attachment."),
  description: s.string("The description of the attachment."),
  post: nonNegativeIdSchema,
  meta: metaSchema,
};
const mediaSchema = s.looseRequiredObject(
  "A WordPress media attachment, including its source_url and upstream metadata.",
  {
    id: idSchema,
    source_url: s.url("The URL of the original media file."),
    media_type: s.string("The attachment media type."),
    mime_type: s.string("The MIME type of the attachment."),
  },
);
const mediaListInputSchema = paginatedInputSchema(
  "Input parameters for listing WordPress media attachments.",
  {
    context: contextSchema,
    after: dateSchema,
    before: dateSchema,
    modifiedAfter: dateSchema,
    modifiedBefore: dateSchema,
    author: idsSchema("Author IDs to include."),
    authorExclude: idsSchema("Author IDs to exclude."),
    include: idsSchema("Attachment IDs to include."),
    exclude: idsSchema("Attachment IDs to exclude."),
    offset: s.integer("The number of attachments to skip.", { minimum: 0 }),
    orderby: postOrderbySchema,
    parent: s.array("Parent post IDs to include, with zero selecting unattached media.", nonNegativeIdSchema),
    parentExclude: s.array("Parent post IDs to exclude.", nonNegativeIdSchema),
    searchColumns: s.array(
      "Post columns searched by WordPress.",
      s.stringEnum("A post column to search.", ["post_title", "post_content", "post_excerpt"]),
    ),
    slug: s.array("Attachment slugs to include.", slugSchema),
    status: s.array(
      "Attachment statuses to include; WordPress defaults to inherit.",
      s.nonEmptyString("One attachment status."),
    ),
    mediaType: s.stringEnum("The attachment type to include.", ["image", "video", "text", "application", "audio"]),
    mimeType: s.nonEmptyString("The attachment MIME type to include."),
  },
  [
    "context",
    "after",
    "before",
    "modifiedAfter",
    "modifiedBefore",
    "author",
    "authorExclude",
    "include",
    "exclude",
    "offset",
    "orderby",
    "parent",
    "parentExclude",
    "searchColumns",
    "slug",
    "status",
    "mediaType",
    "mimeType",
  ],
);
const userListInputSchema = paginatedInputSchema(
  "Input parameters for listing WordPress users.",
  {
    context: contextSchema,
    include: idsSchema("User IDs to include."),
    exclude: idsSchema("User IDs to exclude."),
    offset: s.integer("The number of users to skip.", { minimum: 0 }),
    orderby: s.stringEnum("The field used to sort users.", [
      "id",
      "include",
      "name",
      "registered_date",
      "slug",
      "include_slugs",
      "email",
      "url",
    ]),
    slug: s.array("User slugs to include.", slugSchema),
    roles: s.array(
      "Roles that at least one user role must match; requires permission to list users.",
      s.nonEmptyString("One WordPress role."),
    ),
    capabilities: s.array(
      "Capabilities that at least one user capability must match; requires permission to list users.",
      s.nonEmptyString("One WordPress capability."),
    ),
    who: s.literal("authors", {
      description: "Limit results to authors; deprecated by WordPress in favor of capabilities.",
    }),
    hasPublishedPosts: s.anyOf("Whether users must have published posts, or the post types they must have published.", [
      s.boolean("Whether users must have published posts."),
      s.array("Post types in which users must have published posts.", s.nonEmptyString("One post type.")),
    ]),
  },
  ["context", "include", "exclude", "offset", "orderby", "slug", "roles", "capabilities", "who", "hasPublishedPosts"],
);
const searchInputSchema = s.object(
  "Input parameters for searching WordPress content.",
  {
    search: s.string("Limit results to items matching this search string."),
    context: s.stringEnum("Scope determining the fields returned in search results.", ["view", "embed"]),
    page: pageSchema,
    perPage: perPageSchema,
    type: s.stringEnum("The object type to search; WordPress defaults to post.", ["post", "term", "post-format"]),
    subtype: s.array(
      "Object subtypes to search, including site-specific subtypes; use any for all subtypes.",
      s.nonEmptyString("One object subtype."),
      { minItems: 1 },
    ),
    include: idsSchema("Resource IDs to include in search results."),
    exclude: idsSchema("Resource IDs to exclude from search results."),
  },
  { required: [] },
);
const searchResultSchema = s.looseRequiredObject("A WordPress search result.", {
  id: s.anyOf("The resource ID, which can be numeric or a string.", [
    s.integer("A numeric resource ID."),
    s.string("A string resource ID."),
  ]),
  title: s.string("The title of the result."),
  url: s.url("The URL of the result."),
  type: s.string("The result object type."),
  subtype: s.string("The result object subtype."),
});
const statusListSchema = s.array(
  "WordPress statuses to include.",
  s.nonEmptyString("A WordPress post status to include, including trash or any."),
  { minItems: 1 },
);

function paginatedInputSchema(description: string, properties: Record<string, JsonSchema>, optional: string[]) {
  const paginatedProperties: Record<string, JsonSchema> = {
    search: s.nonEmptyString("Limit results to resources matching this search string.", {}),
    page: pageSchema,
    perPage: perPageSchema,
    order: orderSchema,
    ...properties,
  };

  return s.object(description, paginatedProperties, {
    optional: ["search", "page", "perPage", "order", ...optional],
  });
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
    parent: s.array("Parent page IDs used to filter WordPress pages.", nonNegativeIdSchema, {
      minItems: 1,
    }),
    author: idsSchema("Author user IDs used to filter WordPress pages."),
    slug: s.array("Page slugs used to filter WordPress pages.", slugSchema, { minItems: 1 }),
    orderby: postOrderbySchema,
  },
  ["status", "include", "exclude", "parent", "author", "slug", "orderby"],
);

const termListProperties = {
  include: idsSchema("Term IDs to include in the response."),
  exclude: idsSchema("Term IDs to exclude from the response."),
  slug: s.array("Term slugs used to filter WordPress terms.", slugSchema, { minItems: 1 }),
  hideEmpty: s.boolean("Whether to hide terms not assigned to any post."),
  orderby: termOrderbySchema,
};
const categoryListInputSchema = paginatedInputSchema(
  "Input parameters for listing WordPress terms.",
  {
    ...termListProperties,
    parent: s.integer("Parent term ID used to filter child terms; zero selects root categories.", {
      minimum: 0,
    }),
  },
  ["include", "exclude", "parent", "slug", "hideEmpty", "orderby"],
);
const tagListInputSchema = paginatedInputSchema("Input parameters for listing WordPress tags.", termListProperties, [
  "include",
  "exclude",
  "slug",
  "hideEmpty",
  "orderby",
]);

const commentListInputSchema = paginatedInputSchema(
  "Input parameters for listing WordPress comments.",
  {
    status: s.nonEmptyString("Limit comments to one status, or any for all statuses; requires authorization."),
    post: idsSchema("Post IDs used to filter comments."),
    author: idsSchema("Author user IDs used to filter comments."),
    parent: s.array("Parent comment IDs used to filter comments.", nonNegativeIdSchema, {
      minItems: 1,
    }),
    include: idsSchema("Comment IDs to include in the response."),
    exclude: idsSchema("Comment IDs to exclude from the response."),
    orderby: commentOrderbySchema,
  },
  ["status", "post", "author", "parent", "include", "exclude", "orderby"],
);

const postInputSchemaProperties = {
  title: s.string("The post title."),
  content: s.string("The post content."),
  excerpt: s.string("The post excerpt."),
  slug: slugSchema,
  status: statusSchema,
  categories: s.array("Category IDs assigned to the post; an empty array clears all assignments.", idSchema),
  tags: s.array("Tag IDs assigned to the post; an empty array clears all assignments.", idSchema),
  featuredMedia: s.integer("The featured media attachment ID; zero removes the featured image.", {
    minimum: 0,
  }),
  meta: metaSchema,
};
const postInputSchema = s.object("Input fields for creating or updating a WordPress post.", postInputSchemaProperties, {
  optional: ["title", "content", "excerpt", "slug", "status", "categories", "tags", "featuredMedia", "meta"],
});

const pageInputSchemaProperties = {
  title: s.string("The page title."),
  content: s.string("The page content."),
  excerpt: s.string("The page excerpt."),
  slug: slugSchema,
  status: statusSchema,
  parent: s.integer("The parent page ID; zero moves the page to the root level.", { minimum: 0 }),
  featuredMedia: s.integer("The featured media attachment ID; zero removes the featured image.", {
    minimum: 0,
  }),
  menuOrder: s.integer("The page menu order."),
  meta: metaSchema,
};
const pageInputSchema = s.object("Input fields for creating or updating a WordPress page.", pageInputSchemaProperties, {
  optional: ["title", "content", "excerpt", "slug", "status", "parent", "featuredMedia", "menuOrder", "meta"],
});

const termCreateProperties = {
  name: nonEmptyStringSchema("The term display name."),
  slug: slugSchema,
  description: s.string("The term description."),
  meta: metaSchema,
};
const categoryInputSchema = s.object(
  "Input fields for creating a WordPress taxonomy term.",
  {
    ...termCreateProperties,
    parent: nonNegativeIdSchema,
  },
  { optional: ["slug", "description", "parent", "meta"] },
);
const tagInputSchema = s.object("Input fields for creating a WordPress tag.", termCreateProperties, {
  required: ["name"],
});

const commentUpdateInputSchema = s.object(
  "Input fields for updating a WordPress comment.",
  {
    id: idSchema,
    content: s.string("The comment content."),
    status: commentStatusSchema,
    authorName: s.nonEmptyString("The display name for the comment author."),
    authorEmail: s.email("The email address for the comment author."),
    authorUrl: s.url("The URL for the comment author."),
  },
  { optional: ["content", "status", "authorName", "authorEmail", "authorUrl"] },
);

const getInputSchema = s.requiredObject("Input parameters for retrieving one WordPress resource.", {
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
const userSchema = s.describe(currentUserSchema, "A WordPress user object.");
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

const getCurrentUserAction = defineProviderAction(service, {
  name: "get_current_user",
  operationType: "read",
  description: "Get the authenticated WordPress user.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input payload for getting the authenticated WordPress user.", {}),
  outputSchema: s.requiredObject("The response returned when getting the authenticated WordPress user.", {
    user: currentUserSchema,
  }),
});

const listPostsAction = defineProviderAction(service, {
  name: "list_posts",
  operationType: "read",
  description: "List WordPress posts with optional filters and pagination.",
  requiredScopes: [],

  inputSchema: postListInputSchema,
  outputSchema: s.requiredObject("The response returned when listing WordPress posts.", {
    posts: s.array("The WordPress posts returned by the list request.", postSchema),
    pagination: paginationSchema,
  }),
});

const getPostAction = defineProviderAction(service, {
  name: "get_post",
  operationType: "read",
  description: "Get a WordPress post by ID.",
  requiredScopes: [],

  inputSchema: getInputSchema,
  outputSchema: s.requiredObject("The response returned when getting a WordPress post.", {
    post: postSchema,
  }),
});

const createPostAction = defineProviderAction(service, {
  name: "create_post",
  operationType: "write",
  description: "Create a WordPress post.",
  requiredScopes: [],

  inputSchema: postInputSchema,
  outputSchema: s.requiredObject("The response returned when creating a WordPress post.", {
    post: postSchema,
  }),
});

const updatePostAction = defineProviderAction(service, {
  name: "update_post",
  operationType: "write",
  description: "Update a WordPress post by ID.",
  requiredScopes: [],

  inputSchema: s.object(
    "Input parameters for updating a WordPress post.",
    {
      ...postInputSchemaProperties,
      ...{
        id: idSchema,
      },
    },
    { required: ["id"] },
  ),
  outputSchema: s.requiredObject("The response returned when updating a WordPress post.", {
    post: postSchema,
  }),
});

const deletePostAction = defineProviderAction(service, {
  name: "delete_post",
  operationType: "destructive",
  description: "Delete a WordPress post by ID.",
  requiredScopes: [],

  inputSchema: deleteInputSchema,
  outputSchema: deleteOutputSchema,
});

const listPagesAction = defineProviderAction(service, {
  name: "list_pages",
  operationType: "read",
  description: "List WordPress pages with optional filters and pagination.",
  requiredScopes: [],

  inputSchema: pageListInputSchema,
  outputSchema: s.requiredObject("The response returned when listing WordPress pages.", {
    pages: s.array("The WordPress pages returned by the list request.", pageSchemaOutput),
    pagination: paginationSchema,
  }),
});

const getPageAction = defineProviderAction(service, {
  name: "get_page",
  operationType: "read",
  description: "Get a WordPress page by ID.",
  requiredScopes: [],

  inputSchema: getInputSchema,
  outputSchema: s.requiredObject("The response returned when getting a WordPress page.", {
    page: pageSchemaOutput,
  }),
});

const createPageAction = defineProviderAction(service, {
  name: "create_page",
  operationType: "write",
  description: "Create a WordPress page.",
  requiredScopes: [],

  inputSchema: pageInputSchema,
  outputSchema: s.requiredObject("The response returned when creating a WordPress page.", {
    page: pageSchemaOutput,
  }),
});

const updatePageAction = defineProviderAction(service, {
  name: "update_page",
  operationType: "write",
  description: "Update a WordPress page by ID.",
  requiredScopes: [],

  inputSchema: s.object(
    "Input parameters for updating a WordPress page.",
    {
      ...pageInputSchemaProperties,
      ...{
        id: idSchema,
      },
    },
    { required: ["id"] },
  ),
  outputSchema: s.requiredObject("The response returned when updating a WordPress page.", {
    page: pageSchemaOutput,
  }),
});

const deletePageAction = defineProviderAction(service, {
  name: "delete_page",
  operationType: "destructive",
  description: "Delete a WordPress page by ID.",
  requiredScopes: [],

  inputSchema: deleteInputSchema,
  outputSchema: deleteOutputSchema,
});

const listCategoriesAction = defineProviderAction(service, {
  name: "list_categories",
  operationType: "read",
  description: "List WordPress categories with optional filters and pagination.",
  requiredScopes: [],
  inputSchema: categoryListInputSchema,
  outputSchema: s.requiredObject("The response returned when listing WordPress categories.", {
    categories: s.array("The WordPress categories returned by the list request.", termSchema),
    pagination: paginationSchema,
  }),
});

const createCategoryAction = defineProviderAction(service, {
  name: "create_category",
  operationType: "write",
  description: "Create a WordPress category.",
  requiredScopes: [],
  inputSchema: categoryInputSchema,
  outputSchema: s.requiredObject("The response returned when creating a WordPress category.", {
    category: termSchema,
  }),
});

const listTagsAction = defineProviderAction(service, {
  name: "list_tags",
  operationType: "read",
  description: "List WordPress tags with optional filters and pagination.",
  requiredScopes: [],
  inputSchema: tagListInputSchema,
  outputSchema: s.requiredObject("The response returned when listing WordPress tags.", {
    tags: s.array("The WordPress tags returned by the list request.", termSchema),
    pagination: paginationSchema,
  }),
});

const createTagAction = defineProviderAction(service, {
  name: "create_tag",
  operationType: "write",
  description: "Create a WordPress tag.",
  requiredScopes: [],
  inputSchema: tagInputSchema,
  outputSchema: s.requiredObject("The response returned when creating a WordPress tag.", {
    tag: termSchema,
  }),
});

const listCommentsAction = defineProviderAction(service, {
  name: "list_comments",
  operationType: "read",
  description: "List WordPress comments with optional filters and pagination.",
  requiredScopes: [],
  inputSchema: commentListInputSchema,
  outputSchema: s.requiredObject("The response returned when listing WordPress comments.", {
    comments: s.array("The WordPress comments returned by the list request.", commentSchema),
    pagination: paginationSchema,
  }),
});

const updateCommentAction = defineProviderAction(service, {
  name: "update_comment",
  operationType: "destructive",
  description: "Update a WordPress comment by ID.",
  requiredScopes: [],
  inputSchema: commentUpdateInputSchema,
  outputSchema: s.requiredObject("The response returned when updating a WordPress comment.", {
    comment: commentSchema,
  }),
});

const deleteCommentAction = defineProviderAction(service, {
  name: "delete_comment",
  operationType: "destructive",
  description: "Delete a WordPress comment by ID.",
  requiredScopes: [],

  inputSchema: deleteInputSchema,
  outputSchema: deleteOutputSchema,
});

const getCategoryAction = defineProviderAction(service, {
  name: "get_category",
  operationType: "read",
  description: "Get a WordPress category by ID.",
  requiredScopes: [],
  inputSchema: resourceReadInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress get_category.", {
    category: termSchema,
  }),
});

const updateCategoryAction = defineProviderAction(service, {
  name: "update_category",
  operationType: "write",
  description: "Update a WordPress category by ID.",
  requiredScopes: [],
  inputSchema: categoryUpdateInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress update_category.", {
    category: termSchema,
  }),
});

const deleteCategoryAction = defineProviderAction(service, {
  name: "delete_category",
  operationType: "destructive",
  description: "Permanently delete a WordPress category. WordPress terms do not support trash.",
  requiredScopes: [],

  inputSchema: permanentDeleteInputSchema,
  outputSchema: deleteOutputSchema,
});

const getTagAction = defineProviderAction(service, {
  name: "get_tag",
  operationType: "read",
  description: "Get a WordPress tag by ID.",
  requiredScopes: [],
  inputSchema: resourceReadInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress get_tag.", {
    tag: termSchema,
  }),
});

const updateTagAction = defineProviderAction(service, {
  name: "update_tag",
  operationType: "write",
  description: "Update a WordPress tag by ID.",
  requiredScopes: [],
  inputSchema: tagUpdateInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress update_tag.", {
    tag: termSchema,
  }),
});

const deleteTagAction = defineProviderAction(service, {
  name: "delete_tag",
  operationType: "destructive",
  description: "Permanently delete a WordPress tag. WordPress terms do not support trash.",
  requiredScopes: [],

  inputSchema: permanentDeleteInputSchema,
  outputSchema: deleteOutputSchema,
});

const getCommentAction = defineProviderAction(service, {
  name: "get_comment",
  operationType: "read",
  description: "Get a WordPress comment by ID, including comments on password-protected posts.",
  requiredScopes: [],

  inputSchema: commentReadInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress get_comment.", {
    comment: commentSchema,
  }),
});

const createCommentAction = defineProviderAction(service, {
  name: "create_comment",
  operationType: "write",
  description: "Create a WordPress comment or reply on a content object that allows comments.",
  requiredScopes: [],
  inputSchema: commentCreateInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress create_comment.", {
    comment: commentSchema,
  }),
});

const listMediaAction = defineProviderAction(service, {
  name: "list_media",
  operationType: "read",
  description: "List WordPress media attachments with filters and pagination.",
  requiredScopes: [],
  inputSchema: mediaListInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress list_media.", {
    media: s.array("The resources returned by WordPress list_media.", mediaSchema),
    pagination: paginationSchema,
  }),
});

const getMediaAction = defineProviderAction(service, {
  name: "get_media",
  operationType: "read",
  description: "Get a WordPress media attachment by ID.",
  requiredScopes: [],
  inputSchema: resourceReadInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress get_media.", {
    media: mediaSchema,
  }),
});

const uploadMediaAction = defineProviderAction(service, {
  name: "upload_media",
  operationType: "write",
  description:
    "Download fileUrl and upload it to the WordPress media library. Optional meta fields are applied after upload; if that step fails the error includes the created attachment ID.",
  requiredScopes: [],

  inputSchema: s.object(
    "Input fields for uploading a WordPress media attachment.",
    {
      fileUrl: s.url(
        "A publicly accessible HTTP or HTTPS URL of the file to upload. The connector downloads it with SSRF protection.",
      ),
      fileName: nonEmptyStringSchema(
        "The upload filename, including its extension. Defaults to the fileUrl path basename; provide it for URLs without a filename.",
      ),
      mimeType: s.nonEmptyString(
        "The upload MIME type. Defaults to the download Content-Type; WordPress also checks the file extension and contents.",
      ),
      maximumBytes: s.positiveInteger(
        "The connector download size limit in bytes. Defaults to 20 MiB; raise it for larger files. The WordPress site may impose a lower limit.",
      ),
      ...mediaProperties,
    },
    { required: ["fileUrl"] },
  ),
  outputSchema: s.requiredObject("The response returned by WordPress upload_media.", {
    media: mediaSchema,
  }),
});

const updateMediaAction = defineProviderAction(service, {
  name: "update_media",
  operationType: "write",
  description: "Update WordPress media metadata by ID, including replacing its caption and description.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input fields for updating a WordPress media attachment.",
    { id: idSchema, ...mediaProperties },
    { required: ["id"] },
  ),
  outputSchema: s.requiredObject("The response returned by WordPress update_media.", {
    media: mediaSchema,
  }),
});

const deleteMediaAction = defineProviderAction(service, {
  name: "delete_media",
  operationType: "destructive",
  description:
    "Delete a WordPress media attachment. Permanent deletion requires force=true; trashing depends on the site configuration.",
  requiredScopes: [],

  inputSchema: deleteInputSchema,
  outputSchema: deleteOutputSchema,
});

const listUsersAction = defineProviderAction(service, {
  name: "list_users",
  operationType: "read",
  description:
    "List WordPress users with filters and pagination. User visibility and privileged filters depend on the connected user permissions.",
  requiredScopes: [],
  inputSchema: userListInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress list_users.", {
    users: s.array("The resources returned by WordPress list_users.", userSchema),
    pagination: paginationSchema,
  }),
});

const getUserAction = defineProviderAction(service, {
  name: "get_user",
  operationType: "read",
  description: "Get a WordPress user by ID. The edit context requires permission to view that user.",
  requiredScopes: [],
  inputSchema: resourceReadInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress get_user.", {
    user: userSchema,
  }),
});

const searchAction = defineProviderAction(service, {
  name: "search",
  operationType: "read",
  description: "Search WordPress posts, terms or post formats with pagination and subtype filters.",
  requiredScopes: [],
  inputSchema: searchInputSchema,
  outputSchema: s.requiredObject("The response returned by WordPress search.", {
    results: s.array("The resources returned by WordPress search.", searchResultSchema),
    pagination: paginationSchema,
  }),
});

export const wordpressActions: ActionDefinition[] = [
  getCurrentUserAction,
  listPostsAction,
  getPostAction,
  createPostAction,
  updatePostAction,
  deletePostAction,
  listPagesAction,
  getPageAction,
  createPageAction,
  updatePageAction,
  deletePageAction,
  listCategoriesAction,
  createCategoryAction,
  listTagsAction,
  createTagAction,
  listCommentsAction,
  updateCommentAction,
  deleteCommentAction,
  getCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  getTagAction,
  updateTagAction,
  deleteTagAction,
  getCommentAction,
  createCommentAction,
  listMediaAction,
  getMediaAction,
  uploadMediaAction,
  updateMediaAction,
  deleteMediaAction,
  listUsersAction,
  getUserAction,
  searchAction,
];
