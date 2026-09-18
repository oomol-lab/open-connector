import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  cursorFieldFor,
  includeContentField,
  karakeepIdField,
  limitField,
  paginatedBookmarksSchema,
  paginatedTagsSchema,
  sortOrderField,
  successResultSchema,
  tagBasicSchema,
  tagLimitField,
  tagSchema,
} from "./schemas.ts";

const service = "karakeep";
const tagReadScopes = ["tags:read"] as const;
const tagWriteScopes = ["tags:readwrite"] as const;
const bookmarkReadScopes = ["bookmarks:read"] as const;

const tagIdField = karakeepIdField("The id of the tag.");

const tagNameField = s.nonEmptyString(
  "The tag name. Karakeep trims it and rewrites it into the tag style configured for the account.",
);

export const karakeepTagActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description:
      "Retrieve one page of Karakeep tags. Tags can be filtered by name fragment and by who attached them, and sorted by name, usage count or relevance. Pagination is only active when limit is given: omit limit and Karakeep returns every tag in one response with no cursor.",
    requiredScopes: tagReadScopes,
    inputSchema: s.object(
      "Input for listing Karakeep tags.",
      {
        nameContains: s.nonEmptyString(
          "Only return tags whose name contains this text. Required when sort is relevance.",
        ),
        sort: s.stringEnum(
          "How the tags are ordered. Defaults to usage, which returns the most used tags first. Relevance ranks the matches of nameContains and therefore requires it.",
          ["name", "usage", "relevance"],
        ),
        attachedBy: s.stringEnum(
          "Filter tags by who attached them. ai returns tags that were attached only by AI tagging and never by a human, human returns tags a human attached on at least one bookmark, and none returns tags that are attached to no bookmark at all.",
          ["ai", "human", "none"],
        ),
        cursor: cursorFieldFor(
          "list_tags",
          "Karakeep only paginates the tag list when limit is sent, so a cursor must be accompanied by the same limit that produced it.",
        ),
        limit: tagLimitField,
      },
      { optional: ["nameContains", "sort", "attachedBy", "cursor", "limit"] },
    ),
    outputSchema: paginatedTagsSchema,
  }),
  defineProviderAction(service, {
    name: "create_tag",
    operationType: "write",
    description:
      "Create a new Karakeep tag. The name is trimmed and normalized into the tag style configured for the account.",
    requiredScopes: tagWriteScopes,
    inputSchema: s.requiredObject("Input for creating a Karakeep tag.", {
      name: tagNameField,
    }),
    outputSchema: tagBasicSchema,
  }),
  defineProviderAction(service, {
    name: "get_tag",
    operationType: "read",
    description: "Retrieve a single Karakeep tag by its id, including how many bookmarks carry it and who attached it.",
    requiredScopes: tagReadScopes,
    inputSchema: s.requiredObject("Input for retrieving one Karakeep tag.", {
      tagId: tagIdField,
    }),
    outputSchema: tagSchema,
  }),
  defineProviderAction(service, {
    name: "update_tag",
    operationType: "write",
    description:
      "Rename a Karakeep tag. The name is the only field this endpoint can change, so it is required. The new name is trimmed and normalized, and every bookmark carrying the tag sees the new name.",
    requiredScopes: tagWriteScopes,
    inputSchema: s.requiredObject("Input for renaming a Karakeep tag.", {
      tagId: tagIdField,
      name: s.describe(tagNameField, "The new tag name."),
    }),
    outputSchema: tagBasicSchema,
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    operationType: "destructive",
    description:
      "Delete a Karakeep tag. The tag is detached from every bookmark that carried it; the bookmarks themselves are kept.",
    requiredScopes: tagWriteScopes,
    inputSchema: s.requiredObject("Input for deleting a Karakeep tag.", {
      tagId: tagIdField,
    }),
    outputSchema: successResultSchema(
      "The result of deleting a Karakeep tag.",
      "Whether Karakeep accepted the delete request.",
      { tagId: "The id of the deleted tag." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_tag_bookmarks",
    operationType: "read",
    description: "Retrieve one page of the bookmarks that carry a given Karakeep tag.",
    requiredScopes: bookmarkReadScopes,
    inputSchema: s.object(
      "Input for listing the bookmarks that carry a Karakeep tag.",
      {
        tagId: tagIdField,
        sortOrder: sortOrderField,
        limit: limitField,
        cursor: cursorFieldFor("get_tag_bookmarks"),
        includeContent: includeContentField,
      },
      { optional: ["sortOrder", "limit", "cursor", "includeContent"] },
    ),
    outputSchema: paginatedBookmarksSchema,
  }),
];
