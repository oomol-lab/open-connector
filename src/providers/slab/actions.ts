import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "slab";

const idSchema = s.nonEmptyString("A Slab GraphQL ID.");
const timestampSchema = s.dateTime("An ISO 8601 timestamp returned by Slab.");
const jsonValueSchema = s.unknown("A JSON value returned by Slab.");
const nullableJsonValueSchema = s.nullable(jsonValueSchema);
const postLinkAccessSchema = s.stringEnum("The Slab post link access mode.", [
  "INTERNAL",
  "INTERNAL_VIEW",
  "PUBLIC",
  "PUBLIC_EDIT",
  "DISABLED",
]);
const topicPrivacySchema = s.stringEnum("The Slab topic privacy mode.", ["OPEN", "PRIVATE", "SECRET", "PUBLIC"]);
const topicMemberEditableSchema = s.stringEnum("The Slab topic member editability mode.", ["ALL", "POST", "NONE"]);
const searchTypeSchema = s.stringEnum("The Slab search result type to include.", ["POST", "COMMENT", "TOPIC", "USER"]);
const postContentFormatSchema = s.stringEnum("The content format for a synced Slab post.", ["HTML", "MARKDOWN"]);

const imageSchema = s.looseObject("A Slab image object.", {
  original: s.nullable(s.string("The original image URL.")),
  thumb: s.nullable(s.string("The thumbnail image URL.")),
  preset: s.nullable(s.string("The preset image URL.")),
});

const userSchema = s.looseRequiredObject(
  "A Slab user.",
  {
    id: idSchema,
    name: s.string("The user's display name."),
    title: s.string("The user's title."),
    email: s.email("The user's email address."),
    description: jsonValueSchema,
    type: s.string("The Slab user type."),
    deactivatedAt: s.nullable(timestampSchema),
    insertedAt: timestampSchema,
    updatedAt: timestampSchema,
    avatar: s.nullable(imageSchema),
  },
  { optional: ["deactivatedAt", "avatar"] },
);

const userSummarySchema = s.looseRequiredObject(
  "A compact Slab user reference.",
  {
    id: idSchema,
    name: s.string("The user's display name."),
    email: s.email("The user's email address."),
  },
  { optional: ["email"] },
);

const topicSummarySchema = s.looseRequiredObject(
  "A compact Slab topic reference.",
  {
    id: idSchema,
    name: s.string("The topic name."),
    privacy: topicPrivacySchema,
  },
  { optional: ["privacy"] },
);

const topicSchema = s.looseRequiredObject(
  "A Slab topic.",
  {
    id: idSchema,
    name: s.string("The topic name."),
    description: jsonValueSchema,
    insertedAt: timestampSchema,
    updatedAt: timestampSchema,
    privacy: topicPrivacySchema,
    memberEditable: topicMemberEditableSchema,
    inheritParent: s.boolean("Whether the topic inherits members and owners from its parent."),
    hierarchy: s.nullable(s.array("The topic hierarchy IDs.", idSchema)),
    parent: s.nullable(topicSummarySchema),
    ancestors: s.array("Topic ancestors from the Slab hierarchy.", topicSummarySchema),
    children: s.array("Child topics under this topic.", topicSummarySchema),
    owners: s.array("Topic owner users.", userSummarySchema),
    members: s.array("Topic member users.", userSummarySchema),
  },
  { optional: ["hierarchy", "parent", "ancestors", "children", "owners", "members"] },
);

const postSchema = s.looseRequiredObject(
  "A Slab post.",
  {
    id: idSchema,
    linkAccess: postLinkAccessSchema,
    archivedAt: s.nullable(timestampSchema),
    publishedAt: s.nullable(timestampSchema),
    title: s.string("The post title."),
    insertedAt: timestampSchema,
    content: jsonValueSchema,
    updatedAt: timestampSchema,
    version: s.integer("The Slab post version."),
    owner: userSummarySchema,
    topics: s.array("Topics attached to the post.", topicSummarySchema),
  },
  { optional: ["archivedAt", "publishedAt"] },
);

const organizationSchema = s.looseRequiredObject("A Slab organization.", {
  id: idSchema,
  name: s.string("The organization name."),
  host: s.string("The Slab organization host."),
  insertedAt: timestampSchema,
  updatedAt: timestampSchema,
});

const pageInfoSchema = s.object("Slab cursor pagination metadata.", {
  hasPreviousPage: s.boolean("Whether another page exists before this page."),
  hasNextPage: s.boolean("Whether another page exists after this page."),
  startCursor: s.nullable(s.string("The cursor for the first edge in this page.")),
  endCursor: s.nullable(s.string("The cursor for the last edge in this page.")),
});

const commentSchema = s.looseRequiredObject("A Slab comment.", {
  id: idSchema,
  content: jsonValueSchema,
  insertedAt: timestampSchema,
  author: userSummarySchema,
});

const searchResultSchema = s.looseObject("A Slab search result.", {
  type: s.stringEnum("The normalized search result type.", ["POST", "COMMENT", "TOPIC", "USER"]),
  cursor: s.string("The pagination cursor for this result."),
  title: s.string("The highlighted or fallback result title."),
  content: nullableJsonValueSchema,
  highlight: nullableJsonValueSchema,
  post: postSchema,
  topic: topicSchema,
  user: userSchema,
  comment: commentSchema,
});

const organizationOutputSchema = s.object("The current Slab organization.", {
  organization: organizationSchema,
});
const userOutputSchema = s.object("A Slab user lookup result.", { user: userSchema });
const usersOutputSchema = s.object("A list of Slab users.", {
  users: s.array("Users returned by Slab.", userSchema),
});
const postOutputSchema = s.object("A Slab post result.", { post: postSchema });
const postsOutputSchema = s.object("A list of Slab posts.", {
  posts: s.array("Posts returned by Slab.", postSchema),
});
const topicOutputSchema = s.object("A Slab topic result.", { topic: topicSchema });
const topicsOutputSchema = s.object("A list of Slab topics.", {
  topics: s.array("Topics returned by Slab.", topicSchema),
});
const searchOutputSchema = s.object("A page of Slab search results.", {
  results: s.array("Search results returned by Slab.", searchResultSchema),
  pageInfo: pageInfoSchema,
});

const emptyInputSchema = s.object("No input is required.", {});
const getByIdInputSchema = s.object("Input containing one Slab ID.", { id: idSchema });
const getManyByIdsInputSchema = s.object("Input containing one or more Slab IDs.", {
  ids: s.array("The Slab IDs to retrieve. Slab accepts between 1 and 100 IDs.", idSchema, {
    minItems: 1,
    maxItems: 100,
  }),
});
const listUsersInputSchema = s.object(
  "Input for listing users in the current Slab organization.",
  {
    includeDeactivated: s.boolean("Whether to include deactivated users."),
  },
  { optional: ["includeDeactivated"] },
);
const searchInputSchema = s.object(
  "Input for searching Slab content.",
  {
    query: s.nonEmptyString("The Slab search query."),
    types: s.array("Search result types to include.", searchTypeSchema, { minItems: 1 }),
    first: s.integer("The number of results to return after the cursor."),
    after: s.nonEmptyString("The cursor after which to return results."),
    last: s.integer("The number of results to return before the cursor."),
    before: s.nonEmptyString("The cursor before which to return results."),
  },
  { optional: ["types", "first", "after", "last", "before"] },
);
const createPostInputSchema = s.object(
  "Input for creating a blank Slab post.",
  {
    title: s.nonEmptyString("The new post title."),
    topicId: idSchema,
    templateId: idSchema,
  },
  { optional: ["title", "topicId", "templateId"] },
);
const updatePostInputSchema = s.object(
  "Input for updating a Slab post.",
  {
    id: idSchema,
    ownerId: idSchema,
    archived: s.boolean("Whether the post should be archived."),
    published: s.boolean("Whether the post should be published."),
    linkAccess: postLinkAccessSchema,
    bannerUrl: s.url("The post banner image URL."),
  },
  { optional: ["ownerId", "archived", "published", "linkAccess", "bannerUrl"] },
);
const syncPostInputSchema = s.object(
  "Input for creating or updating a Slab post from external content.",
  {
    externalId: idSchema,
    format: postContentFormatSchema,
    content: s.nonEmptyString("The HTML or Markdown content to sync into Slab."),
    editUrl: s.url("The external edit URL for the source content."),
    readUrl: s.url("The external read URL for the source content."),
  },
  { optional: ["editUrl", "readUrl"] },
);
const createTopicInputSchema = s.object(
  "Input for creating a Slab topic.",
  {
    name: s.nonEmptyString("The topic name."),
    description: jsonValueSchema,
    parentId: idSchema,
    memberEditable: topicMemberEditableSchema,
    privacy: topicPrivacySchema,
    inheritParent: s.boolean("Whether to inherit parent topic owners and members."),
  },
  { optional: ["description", "parentId", "memberEditable", "privacy", "inheritParent"] },
);
const updateTopicInputSchema = s.object(
  "Input for updating a Slab topic.",
  {
    id: idSchema,
    name: s.nonEmptyString("The topic name."),
    description: jsonValueSchema,
    parentId: idSchema,
    memberEditable: topicMemberEditableSchema,
    privacy: topicPrivacySchema,
    bannerUrl: s.url("The topic banner image URL."),
    inheritParent: s.boolean("Whether to inherit parent topic owners and members."),
    propagatePrivacy: s.boolean("Whether privacy changes should propagate to subtopics."),
  },
  {
    optional: [
      "name",
      "description",
      "parentId",
      "memberEditable",
      "privacy",
      "bannerUrl",
      "inheritParent",
      "propagatePrivacy",
    ],
  },
);
const postTopicInputSchema = s.object("Input for changing a post-topic relationship.", {
  postId: idSchema,
  topicId: idSchema,
});

export const slabActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_organization",
    operationType: "read",
    description: "Get the current Slab organization visible to the API token.",
    inputSchema: emptyInputSchema,
    outputSchema: organizationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List users in the current Slab organization.",
    inputSchema: listUsersInputSchema,
    outputSchema: usersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get one Slab user by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_post",
    operationType: "read",
    description: "Get one Slab post by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_posts",
    operationType: "read",
    description: "Get multiple Slab posts by ID.",
    inputSchema: getManyByIdsInputSchema,
    outputSchema: postsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_post",
    operationType: "write",
    description: "Create a blank Slab post, optionally in a topic or from a template.",
    inputSchema: createPostInputSchema,
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_post",
    operationType: "write",
    description: "Update Slab post metadata such as owner, publication state, link access, or banner.",
    inputSchema: updatePostInputSchema,
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "sync_post",
    operationType: "write",
    description: "Create or update a readonly Slab copy of external HTML or Markdown content.",
    inputSchema: syncPostInputSchema,
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_post",
    operationType: "destructive",
    description: "Delete a Slab post by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_topic",
    operationType: "read",
    description: "Get one Slab topic by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: topicOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_topics",
    operationType: "read",
    description: "Get multiple Slab topics by ID.",
    inputSchema: getManyByIdsInputSchema,
    outputSchema: topicsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_topic",
    operationType: "write",
    description: "Create a Slab topic.",
    inputSchema: createTopicInputSchema,
    outputSchema: topicOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_topic",
    operationType: "write",
    description: "Update a Slab topic.",
    inputSchema: updateTopicInputSchema,
    outputSchema: topicOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_topic",
    operationType: "destructive",
    description: "Delete a Slab topic by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: topicOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_topic_to_post",
    operationType: "write",
    description: "Attach a Slab topic to a post.",
    inputSchema: postTopicInputSchema,
    outputSchema: topicOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_topic_from_post",
    operationType: "destructive",
    description: "Detach a Slab topic from a post.",
    inputSchema: postTopicInputSchema,
    outputSchema: topicOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Search Slab posts, topics, users, and comments with cursor pagination.",
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema,
  }),
];
