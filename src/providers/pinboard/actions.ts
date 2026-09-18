import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pinboard";

const tagSchema = s.string("A Pinboard tag. Tags may not contain commas or whitespace.", {
  minLength: 1,
  maxLength: 255,
});

const bookmarkSchema = s.object(
  "A normalized Pinboard bookmark.",
  {
    url: s.url("The bookmarked URL."),
    title: s.string("The bookmark title."),
    description: s.string("The optional bookmark description or extended text."),
    tags: s.array("The bookmark tags.", tagSchema),
    createdAt: s.dateTime("The bookmark creation time returned by Pinboard."),
    hash: s.string("The Pinboard bookmark hash."),
    meta: s.string("The optional Pinboard change detection signature."),
    shared: s.boolean("Whether the bookmark is public."),
    toRead: s.boolean("Whether the bookmark is marked as unread."),
    others: s.integer("The number of other Pinboard users who saved the same URL."),
  },
  {
    optional: ["description", "createdAt", "hash", "meta", "shared", "toRead", "others"],
  },
);

const bookmarkListOutputSchema = s.object(
  "The wrapped Pinboard bookmark list output.",
  {
    bookmarks: s.array("The Pinboard bookmarks returned by the endpoint.", bookmarkSchema),
    date: s.string("The Pinboard response date or timestamp for this list."),
    user: s.string("The Pinboard username associated with the response."),
  },
  { optional: ["date", "user"] },
);

const resultOutputSchema = s.requiredObject("The Pinboard mutation result.", {
  resultCode: s.string("The result code returned by Pinboard."),
});

export const pinboardActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_last_update",
    operationType: "read",
    description: "Get the most recent time a Pinboard bookmark was added, updated, or deleted.",
    inputSchema: s.actionInput({}, [], "Input parameters for checking the Pinboard update timestamp."),
    outputSchema: s.actionOutput(
      {
        updateTime: s.dateTime("The most recent bookmark update time returned by Pinboard."),
      },
      "The wrapped Pinboard update timestamp output.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_recent_bookmarks",
    operationType: "read",
    description: "List the user's most recent Pinboard bookmarks, optionally filtered by one tag.",
    inputSchema: s.actionInput(
      {
        tag: s.string("A tag to filter by.", { minLength: 1, maxLength: 255 }),
        count: s.integer("The number of bookmarks to return. Pinboard allows up to 100.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      [],
      "Input parameters for listing recent Pinboard bookmarks.",
    ),
    outputSchema: bookmarkListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bookmarks",
    operationType: "read",
    description: "Get Pinboard bookmarks for a URL, date, or up to three tags using the posts/get endpoint.",
    inputSchema: s.actionInput(
      {
        url: s.url("Return the bookmark for this exact URL."),
        tags: s.array(
          "Up to three tags to filter by. Pinboard treats multiple tags as a combined tag filter.",
          tagSchema,
          { minItems: 1, maxItems: 3 },
        ),
        date: s.date("Return bookmarks created on this UTC date."),
        includeMeta: s.boolean("Whether to include Pinboard change detection signatures."),
      },
      [],
      "Input parameters for getting Pinboard bookmarks.",
    ),
    outputSchema: bookmarkListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_bookmark",
    operationType: "destructive",
    description: "Add or replace a Pinboard bookmark.",
    inputSchema: s.actionInput(
      {
        url: s.url("The URL to bookmark."),
        title: s.string("The bookmark title. Pinboard calls this field description.", {
          minLength: 1,
          maxLength: 255,
        }),
        description: s.string("The optional bookmark description or extended text.", {
          maxLength: 65536,
        }),
        tags: s.array(
          "Pinboard tags to match or attach. Multiple tags are joined with spaces for the upstream API.",
          tagSchema,
          { minItems: 1, maxItems: 100 },
        ),
        createdAt: s.dateTime("The bookmark creation time in UTC."),
        replace: s.boolean("Whether to replace an existing bookmark for the same URL."),
        shared: s.boolean("Whether to make the bookmark public."),
        toRead: s.boolean("Whether to mark the bookmark as unread."),
      },
      ["url", "title"],
      "Input parameters for adding a Pinboard bookmark.",
    ),
    outputSchema: resultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_bookmark",
    operationType: "destructive",
    description: "Delete a Pinboard bookmark by URL.",
    inputSchema: s.actionInput(
      { url: s.url("The bookmarked URL to delete.") },
      ["url"],
      "Input parameters for deleting a Pinboard bookmark.",
    ),
    outputSchema: resultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description: "List the user's Pinboard tags and bookmark counts.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing Pinboard tags."),
    outputSchema: s.actionOutput(
      {
        tags: s.array(
          "The Pinboard tags returned by the account.",
          s.requiredObject("A Pinboard tag and its bookmark count.", {
            tag: tagSchema,
            count: s.nonNegativeInteger("The number of bookmarks using this tag."),
          }),
        ),
      },
      "The wrapped Pinboard tag list output.",
    ),
  }),
];
