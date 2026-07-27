import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  gidField,
  includeFieldsSchema,
  nextCursorSchema,
  paginationFields,
  storySchema,
  storyStickerNames,
  successOutputSchema,
  tagSchema,
} from "./schemas.ts";

const service = "asana";

const tagColors = [
  "dark-pink",
  "dark-green",
  "dark-blue",
  "dark-red",
  "dark-teal",
  "dark-brown",
  "dark-orange",
  "dark-purple",
  "dark-warm-gray",
  "light-pink",
  "light-green",
  "light-blue",
  "light-red",
  "light-teal",
  "light-brown",
  "light-orange",
  "light-purple",
  "light-warm-gray",
];

const storyOutputSchema = s.object("The output payload for this action.", {
  story: storySchema,
});

const storiesOutputSchema = s.object("The output payload for this action.", {
  stories: s.array("The Asana stories and task comments.", storySchema),
  nextCursor: nextCursorSchema,
});

const tagOutputSchema = s.object("The output payload for this action.", {
  tag: tagSchema,
});

const tagsOutputSchema = s.object("The output payload for this action.", {
  tags: s.array("The Asana tags.", tagSchema),
  nextCursor: nextCursorSchema,
});

function resourceInput(idField: string, description: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      [idField]: gidField(description),
      includeFields: includeFieldsSchema,
    },
    { required: [idField] },
  );
}

function resourceIdInput(idField: string, description: string): JsonSchema {
  return s.object("The input payload for this action.", { [idField]: gidField(description) }, { required: [idField] });
}

function paginatedResourceInput(idField: string, description: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      [idField]: gidField(description),
      ...paginationFields,
      includeFields: includeFieldsSchema,
    },
    { required: [idField] },
  );
}

const createStoryInputSchema = s.object(
  "The input payload for this action.",
  {
    taskId: gidField("The Asana task gid."),
    text: s.string("The plain-text comment content. Cannot be combined with htmlText."),
    htmlText: s.string("The HTML comment content. Cannot be combined with text."),
    isPinned: s.boolean("Whether the created story comment should be pinned."),
    stickerName: s.stringEnum("An optional sticker displayed with the created comment story.", storyStickerNames),
    includeFields: includeFieldsSchema,
  },
  { required: ["taskId"] },
);
createStoryInputSchema.oneOf = [
  { required: ["text"], not: { required: ["htmlText"] } },
  { required: ["htmlText"], not: { required: ["text"] } },
];

const updateStoryInputSchema = s.object(
  "The input payload for this action.",
  {
    storyId: gidField("The Asana story gid."),
    text: s.string("The new plain-text comment content. Cannot be combined with htmlText."),
    htmlText: s.string("The new HTML comment content. Cannot be combined with text."),
    isPinned: s.boolean("Whether the story comment is pinned."),
    includeFields: includeFieldsSchema,
  },
  { required: ["storyId"] },
);
updateStoryInputSchema.anyOf = [{ required: ["text"] }, { required: ["htmlText"] }, { required: ["isPinned"] }];
updateStoryInputSchema.allOf = [{ not: { required: ["text", "htmlText"] } }];

const tagColorSchema = s.nullable(s.stringEnum("An official Asana tag color, or null to clear the color.", tagColors));

const tagCreateFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The tag name."),
  color: tagColorSchema,
  notes: s.string("Free-form notes describing the tag."),
  followerIds: s.stringArray("Users who should follow the tag.", {
    minItems: 1,
    itemDescription: 'A user gid, email address, or the special identifier "me".',
  }),
  includeFields: includeFieldsSchema,
};

function createTagInput(locationFields: Record<string, JsonSchema>, requiredLocation: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      ...locationFields,
      ...tagCreateFields,
    },
    { required: [requiredLocation, "name"] },
  );
}

const updateTagInputSchema = s.object(
  "The input payload for this action.",
  {
    tagId: gidField("The Asana tag gid."),
    name: s.nonEmptyString("The new tag name."),
    color: tagColorSchema,
    notes: s.string("The new free-form notes for the tag."),
    includeFields: includeFieldsSchema,
  },
  { required: ["tagId"] },
);
updateTagInputSchema.anyOf = [{ required: ["name"] }, { required: ["color"] }, { required: ["notes"] }];

export const asanaStoryTagActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_story",
    description: "Get an Asana story, including a task comment story, by gid.",
    requiredScopes: ["stories:read"],
    inputSchema: resourceInput("storyId", "The Asana story gid."),
    outputSchema: storyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_task_stories",
    description: "List each story and comment recorded on an Asana task.",
    requiredScopes: ["stories:read"],
    inputSchema: paginatedResourceInput("taskId", "The Asana task gid."),
    outputSchema: storiesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_task_story",
    description: "Create a comment story on an Asana task.",
    requiredScopes: ["stories:write"],
    inputSchema: createStoryInputSchema,
    outputSchema: storyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_story",
    description: "Update the text, HTML, or pinned state of an Asana comment story.",
    requiredScopes: ["stories:write"],
    inputSchema: updateStoryInputSchema,
    outputSchema: storyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_story",
    description: "Delete an Asana story or task comment created by the authenticated user.",
    requiredScopes: ["stories:delete"],
    inputSchema: resourceIdInput("storyId", "The Asana story gid."),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List tags in an Asana workspace through the generic tag endpoint.",
    requiredScopes: ["tags:read"],
    inputSchema: s.object("The input payload for this action.", {
      workspaceId: gidField("The workspace or organization gid used to filter tags."),
      ...paginationFields,
      includeFields: includeFieldsSchema,
    }),
    outputSchema: tagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create a tag in an Asana workspace through the generic tag endpoint.",
    requiredScopes: ["tags:write"],
    inputSchema: createTagInput(
      { workspaceId: gidField("The workspace or organization that will own the tag.") },
      "workspaceId",
    ),
    outputSchema: tagOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tag",
    description: "Get an Asana tag by gid.",
    requiredScopes: ["tags:read"],
    inputSchema: resourceInput("tagId", "The Asana tag gid."),
    outputSchema: tagOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_tag",
    description: "Update one or more mutable fields on an Asana tag.",
    requiredScopes: ["tags:write"],
    inputSchema: updateTagInputSchema,
    outputSchema: tagOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete an Asana tag.",
    requiredScopes: [],
    inputSchema: resourceIdInput("tagId", "The Asana tag gid."),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_workspace_tags",
    description: "List tags in an Asana workspace or organization.",
    requiredScopes: ["tags:read"],
    inputSchema: paginatedResourceInput("workspaceId", "The Asana workspace or organization gid."),
    outputSchema: tagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_workspace_tag",
    description: "Create a tag in an Asana workspace or organization.",
    requiredScopes: ["tags:write"],
    inputSchema: createTagInput(
      { workspaceId: gidField("The workspace or organization that will own the tag.") },
      "workspaceId",
    ),
    outputSchema: tagOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_task_tags",
    description: "List the Asana tags attached to a task.",
    requiredScopes: ["tags:read"],
    inputSchema: paginatedResourceInput("taskId", "The Asana task gid."),
    outputSchema: tagsOutputSchema,
  }),
];
