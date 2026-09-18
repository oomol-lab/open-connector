import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linkhut";

export type LinkhutActionName =
  | "add_bookmark"
  | "update_bookmark"
  | "delete_bookmark"
  | "get_bookmarks"
  | "get_all_tags";

export const linkhutOAuthScopes: string[] = ["posts:read", "posts:write", "tags:read"];

const flag: JsonSchema = s.anyOf("Use true or false, or the explicit yes/no strings.", [
  s.boolean("A boolean Linkhut flag value."),
  s.stringEnum(["yes", "no"], {
    description: "An explicit Linkhut yes or no flag string.",
  }),
]);

const bookmark = s.object(
  "A bookmark returned by Linkhut.",
  {
    url: s.string("The bookmarked URL."),
    hash: s.string("The stable Linkhut hash for the bookmark."),
    description: s.string("The bookmark title or description."),
    extended: s.string("The extended note stored for the bookmark."),
    tags: s.string("The raw space-separated tags string."),
    time: s.string("The timestamp when the bookmark was saved."),
    shared: s.boolean("Whether the bookmark is public."),
    toread: s.boolean("Whether the bookmark is marked as unread."),
    meta: s.unknown("The optional metadata payload returned by Linkhut."),
  },
  { optional: ["extended", "tags", "meta"] },
);

const mutationResult = s.object("The output payload for this action.", {
  result_code: s.string("The result code returned by Linkhut."),
});

const bookmarkMutationInput = s.object(
  "The input payload for this action.",
  {
    url: s.nonEmptyString("The bookmark URL."),
    description: s.nonEmptyString("The bookmark title or description."),
    tags: s.string("The tags string to store for the bookmark."),
    shared: {
      ...flag,
      description: "Whether the bookmark should be public.",
    },
    toread: {
      ...flag,
      description: "Whether the bookmark should be marked as unread.",
    },
    extended: s.string("The optional extended note for the bookmark."),
  },
  { required: ["url", "description"], optional: ["tags", "shared", "toread", "extended"] },
);

const bookmarkFilterInput = s.object(
  "The input payload for this action.",
  {
    dt: s.string("The ISO 8601 UTC timestamp used to filter bookmarks by date."),
    tag: s.string("The tag filter string. Multiple tags can be separated by spaces."),
    url: s.string("The exact bookmarked URL to fetch."),
    meta: {
      ...flag,
      description: "Whether Linkhut should include metadata in the response.",
    },
  },
  { optional: ["dt", "tag", "url", "meta"] },
);

const tag = s.object("A tag summary returned by Linkhut.", {
  name: s.string("The tag name."),
  count: s.integer({ minimum: 0, description: "The number of bookmarks using this tag." }),
});

function action(input: {
  name: LinkhutActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    ...input,
    providerPermissions: input.requiredScopes,
  });
}

export const linkhutActions: ActionDefinition[] = [
  action({
    name: "add_bookmark",
    operationType: "write",
    description: "Create a new bookmark in Linkhut without replacing an existing bookmark.",
    requiredScopes: ["posts:write"],
    inputSchema: bookmarkMutationInput,
    outputSchema: mutationResult,
  }),
  action({
    name: "update_bookmark",
    operationType: "write",
    description: "Update an existing Linkhut bookmark by URL.",
    requiredScopes: ["posts:write"],
    inputSchema: bookmarkMutationInput,
    outputSchema: mutationResult,
  }),
  action({
    name: "delete_bookmark",
    operationType: "destructive",
    description: "Delete a Linkhut bookmark by URL.",
    requiredScopes: ["posts:write"],
    inputSchema: s.object("The input payload for this action.", {
      url: s.nonEmptyString("The bookmark URL to delete."),
    }),
    outputSchema: mutationResult,
  }),
  action({
    name: "get_bookmarks",
    operationType: "read",
    description: "List Linkhut bookmarks using the official bookmark filters.",
    requiredScopes: ["posts:read"],
    inputSchema: bookmarkFilterInput,
    outputSchema: s.object("The output payload for this action.", {
      bookmarks: s.array(bookmark, { description: "The bookmarks returned by Linkhut." }),
    }),
  }),
  action({
    name: "get_all_tags",
    operationType: "read",
    description: "List all Linkhut tags with their bookmark counts.",
    requiredScopes: ["tags:read"],
    inputSchema: s.object({}, { description: "The input payload for this action." }),
    outputSchema: s.object("The output payload for this action.", {
      tags: s.array(tag, { description: "The tags returned by Linkhut." }),
    }),
  }),
];
