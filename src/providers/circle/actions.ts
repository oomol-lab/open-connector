import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "circle";

const positiveInteger = (description: string) => s.positiveInteger(description);
const nullableString = (description: string) => s.nullableString(description);
const nullableInteger = (description: string) => s.nullableInteger(description);
const nullableBoolean = (description: string) => s.nullableBoolean(description);
const pageInput = {
  page: positiveInteger("The page number to request from Circle."),
  per_page: positiveInteger("The number of records to request per page."),
};
const paginationSchema = s.object("Circle pagination metadata.", {
  page: s.integer("The current page number returned by Circle."),
  per_page: s.integer("The number of records returned per page."),
  has_next_page: s.boolean("Whether Circle reports another page after this one."),
  count: s.integer("The total number of records reported by Circle."),
  page_count: s.integer("The total number of pages reported by Circle."),
});
const communitySchema = s.object("A normalized Circle community.", {
  id: s.integer("The Circle community ID."),
  name: nullableString("The Circle community name."),
  slug: nullableString("The Circle community slug."),
  locale: nullableString("The Circle community locale."),
  is_private: nullableBoolean("Whether the community is private."),
  created_at: nullableString("The time when the community was created."),
  updated_at: nullableString("The time when the community was last updated."),
  raw: s.looseObject("The raw community object returned by Circle."),
});
const memberSchema = s.object("A normalized Circle community member.", {
  id: s.integer("The Circle community member ID."),
  user_id: nullableInteger("The Circle user ID associated with the member."),
  name: nullableString("The member display name."),
  first_name: nullableString("The member first name."),
  last_name: nullableString("The member last name."),
  email: nullableString("The member email address when returned by Circle."),
  headline: nullableString("The member headline."),
  status: nullableString("The member status when returned by Circle."),
  profile_url: nullableString("The member profile URL."),
  public_uid: nullableString("The public UID for the member."),
  avatar_url: nullableString("The member avatar URL."),
  community_id: nullableInteger("The Circle community ID associated with the member."),
  created_at: nullableString("The time when the member was created."),
  updated_at: nullableString("The time when the member was last updated."),
  raw: s.looseObject("The raw community member object returned by Circle."),
});
const postSchema = s.object("A normalized Circle post.", {
  id: s.integer("The Circle post ID."),
  status: nullableString("The Circle post status."),
  name: nullableString("The post title or name."),
  slug: nullableString("The post slug."),
  url: nullableString("The post URL."),
  space_id: nullableInteger("The Circle space ID containing the post."),
  space_group_id: nullableInteger("The Circle space group ID containing the post."),
  user_id: nullableInteger("The Circle user ID for the post author."),
  user_email: nullableString("The post author email address."),
  user_name: nullableString("The post author display name."),
  comments_count: nullableInteger("The number of comments on the post."),
  likes_count: nullableInteger("The number of likes on the post."),
  published_at: nullableString("The time when the post was published."),
  created_at: nullableString("The time when the post was created."),
  updated_at: nullableString("The time when the post was last updated."),
  raw: s.looseObject("The raw post object returned by Circle."),
});
const spaceGroupSchema = s.object("A normalized Circle space group.", {
  id: s.integer("The Circle space group ID."),
  name: nullableString("The space group name."),
  slug: nullableString("The space group slug."),
  community_id: nullableInteger("The Circle community ID associated with the space group."),
  spaces_count: nullableInteger("The number of spaces in the group."),
  space_group_members_count: nullableInteger("The number of members in the group."),
  is_hidden_from_non_members: nullableBoolean("Whether the space group is hidden from non-members."),
  hide_members_count: nullableBoolean("Whether Circle hides the member count."),
  created_at: nullableString("The time when the space group was created."),
  updated_at: nullableString("The time when the space group was last updated."),
  raw: s.looseObject("The raw space group object returned by Circle."),
});
const spaceMemberSchema = s.object("A normalized Circle space member.", {
  id: s.integer("The Circle space member ID."),
  user_id: nullableInteger("The Circle user ID associated with the space member."),
  space_id: nullableInteger("The Circle space ID associated with the membership."),
  community_member_id: nullableInteger("The Circle community member ID."),
  status: nullableString("The space member status."),
  access_type: nullableString("The access type reported by Circle."),
  moderator: nullableBoolean("Whether the member is a moderator in the space."),
  notification_type: nullableString("The email notification setting for the space member."),
  community_member: s.nullable(
    s.looseObject("The nested community member summary returned with the space membership."),
  ),
  created_at: nullableString("The time when the space membership was created."),
  updated_at: nullableString("The time when the space membership was last updated."),
  raw: s.looseObject("The raw space member object returned by Circle."),
});

export const circleActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_community",
    operationType: "read",
    description: "Get details about the Circle community associated with the current API token.",
    inputSchema: s.actionInput({}, [], "The input payload for getting Circle community details."),
    outputSchema: s.actionOutput({ community: communitySchema }),
  }),
  defineProviderAction(service, {
    name: "list_community_members",
    operationType: "read",
    description: "List Circle community members with optional status and tag filters.",
    inputSchema: s.object(
      "Input parameters for listing Circle community members.",
      {
        ...pageInput,
        status: s.stringEnum("The community member status filter.", ["active", "inactive", "all"]),
        member_tag_ids: s.array(
          "Member tag IDs used by Circle to filter community members.",
          positiveInteger("One Circle member tag ID."),
          { minItems: 1 },
        ),
      },
      { optional: ["page", "per_page", "status", "member_tag_ids"] },
    ),
    outputSchema: s.actionOutput({
      pagination: paginationSchema,
      members: s.array("The community members returned by Circle.", memberSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_community_member",
    operationType: "read",
    description: "Get a Circle community member by ID.",
    inputSchema: s.actionInput({ id: positiveInteger("The Circle community member ID.") }, ["id"]),
    outputSchema: s.actionOutput({ member: memberSchema }),
  }),
  defineProviderAction(service, {
    name: "list_posts",
    operationType: "read",
    description: "List Circle basic posts with optional space, status, search, and sort filters.",
    inputSchema: s.object(
      "Input parameters for listing Circle basic posts.",
      {
        ...pageInput,
        space_id: positiveInteger("The Circle basic space ID used to filter posts."),
        space_group_id: positiveInteger("The Circle space group ID used to filter posts."),
        status: s.stringEnum("The Circle post status filter.", ["draft", "published", "scheduled", "all"]),
        search_text: s.nonEmptyString("Text used to search Circle posts."),
        sort: s.stringEnum("The Circle post sort order.", [
          "oldest",
          "latest",
          "alphabetical",
          "likes",
          "latest_updated",
          "oldest_updated",
        ]),
      },
      { optional: ["page", "per_page", "space_id", "space_group_id", "status", "search_text", "sort"] },
    ),
    outputSchema: s.actionOutput({
      pagination: paginationSchema,
      posts: s.array("The posts returned by Circle.", postSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_post",
    operationType: "read",
    description: "Get a Circle basic post by ID.",
    inputSchema: s.actionInput({ id: positiveInteger("The Circle post ID.") }, ["id"]),
    outputSchema: s.actionOutput({ post: postSchema }),
  }),
  defineProviderAction(service, {
    name: "list_space_groups",
    operationType: "read",
    description: "List Circle space groups with optional name filtering.",
    inputSchema: s.object(
      "Input parameters for listing Circle space groups.",
      { ...pageInput, name: s.nonEmptyString("The space group name filter.") },
      { optional: ["page", "per_page", "name"] },
    ),
    outputSchema: s.actionOutput({
      pagination: paginationSchema,
      space_groups: s.array("The space groups returned by Circle.", spaceGroupSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_space_group",
    operationType: "read",
    description: "Get a Circle space group by ID.",
    inputSchema: s.actionInput({ id: positiveInteger("The Circle space group ID.") }, ["id"]),
    outputSchema: s.actionOutput({ space_group: spaceGroupSchema }),
  }),
  defineProviderAction(service, {
    name: "list_space_members",
    operationType: "read",
    description: "List Circle members in a specific space.",
    inputSchema: s.object(
      "Input parameters for listing Circle space members.",
      {
        ...pageInput,
        space_id: positiveInteger("The Circle space ID whose members should be listed."),
        status: s.stringEnum("The Circle space member status filter.", ["active", "inactive", "all"]),
      },
      { optional: ["page", "per_page", "status"] },
    ),
    outputSchema: s.actionOutput({
      pagination: paginationSchema,
      space_members: s.array("The space members returned by Circle.", spaceMemberSchema),
    }),
  }),
] satisfies Array<
  ProviderActionDefinition<
    | "get_community"
    | "list_community_members"
    | "get_community_member"
    | "list_posts"
    | "get_post"
    | "list_space_groups"
    | "get_space_group"
    | "list_space_members"
  >
>;
