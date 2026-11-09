import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "riddle_quiz_maker";

const riddleUuidSchema = s.string("The UUID of the Riddle to operate on.", { minLength: 1 });
const projectIdSchema = s.integer("The numeric Riddle project ID.", { minimum: 1 });
const riddleSchema = s.looseObject("A Riddle object returned by the Riddle API.");
const projectSchema = s.looseObject("A project object returned by the Riddle API.");
const tagSchema = s.looseObject("A tag object returned by the Riddle API.");
const paginationSchema = s.looseObject("Pagination metadata returned by the Riddle API.", {
  page: s.integer("The current page number."),
  pageSize: s.integer("The number of items requested per page."),
  total: s.integer("The total number of matching items."),
  hasMore: s.boolean("Whether another page is available."),
});

const riddleUuidInputSchema = s.object("A request targeting one Riddle.", {
  riddleUuid: riddleUuidSchema,
});

const listRiddlesInputSchema = s.object(
  "Filters and pagination for listing Riddles.",
  {
    project: projectIdSchema,
    type: s.string("Only return Riddles of this type, such as Quiz or Poll.", { minLength: 1 }),
    notType: s.string("Exclude Riddles of this type.", { minLength: 1 }),
    tags: s.array("Tag IDs that every returned Riddle must have.", s.integer("A Riddle tag ID.", { minimum: 1 })),
    status: s.stringEnum("Only return Riddles with this publication status.", ["published", "modified", "draft"]),
    search: s.string("A search term for Riddle titles or UUIDs.", { minLength: 1 }),
    origin: s.stringEnum("Only return Riddles created through this origin.", ["api", "manual"]),
    sortBy: s.stringEnum("The Riddle field used for sorting.", ["created", "published", "modified"]),
    sortOrder: s.stringEnum("The result sort direction.", ["ASC", "DESC"]),
    page: s.integer("The one-based page number.", { minimum: 1 }),
    pageSize: s.integer("The number of Riddles per page, up to 300.", {
      minimum: 1,
      maximum: 300,
    }),
  },
  {
    optional: [
      "project",
      "type",
      "notType",
      "tags",
      "status",
      "search",
      "origin",
      "sortBy",
      "sortOrder",
      "page",
      "pageSize",
    ],
  },
);

const listRiddlesOutputSchema = s.object("A page of Riddles and its pagination metadata.", {
  riddles: s.array("The Riddles on this page.", riddleSchema),
  pagination: s.nullable(paginationSchema),
});

const riddleOutputSchema = s.object("A Riddle returned after the requested operation.", {
  riddle: riddleSchema,
});

const renameRiddleInputSchema = s.object("The Riddle and its new title.", {
  riddleUuid: riddleUuidSchema,
  title: s.string("The new Riddle title.", { minLength: 1 }),
});

const embedCodeOutputSchema = s.object("The HTML embed code for a published Riddle.", {
  embedCode: s.string("The HTML embed code returned by Riddle."),
});

const listProjectsInputSchema = s.object(
  "Optional pagination for listing projects.",
  {
    page: s.integer("The one-based page number.", { minimum: 1 }),
    pageSize: s.integer("The number of projects per page.", { minimum: 1 }),
  },
  { optional: ["page", "pageSize"] },
);

const listProjectsOutputSchema = s.object("Riddle projects and optional pagination metadata.", {
  projects: s.array("The projects returned by Riddle.", projectSchema),
  pagination: s.nullable(paginationSchema),
});

const projectOutputSchema = s.object("A Riddle project.", {
  project: projectSchema,
});

const listTagsInputSchema = s.object(
  "The project whose tags should be listed.",
  {
    project: s.nullable(projectIdSchema),
  },
  { optional: ["project"] },
);

const tagsOutputSchema = s.object("Riddle tags.", {
  tags: s.array("The tags returned by Riddle.", tagSchema),
});

const addRiddleTagInputSchema = s.requireAnyProperty(
  s.object(
    "The Riddle and either an existing tag ID or a new tag name.",
    {
      riddleUuid: riddleUuidSchema,
      id: s.integer("The ID of an existing tag to attach.", { minimum: 1 }),
      name: s.string("The name of a tag to create and attach.", { minLength: 1 }),
    },
    { optional: ["id", "name"] },
  ),
  ["id", "name"],
);

const removeRiddleTagInputSchema = s.object("The Riddle and tag to detach.", {
  riddleUuid: riddleUuidSchema,
  tagId: s.integer("The ID of the tag to remove from the Riddle.", { minimum: 1 }),
});

export const riddleQuizMakerActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_riddles",
    operationType: "read",
    description: "List and search Riddles with documented filters and pagination.",
    inputSchema: listRiddlesInputSchema,
    outputSchema: listRiddlesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_riddle",
    operationType: "read",
    description: "Get one Riddle, including its content, settings, and metadata.",
    inputSchema: riddleUuidInputSchema,
    outputSchema: riddleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "rename_riddle",
    operationType: "write",
    description: "Change the title of an existing Riddle.",
    inputSchema: renameRiddleInputSchema,
    outputSchema: riddleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "publish_riddle",
    operationType: "write",
    description: "Publish a Riddle so its public URL and embed code become available.",
    inputSchema: riddleUuidInputSchema,
    outputSchema: riddleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "unpublish_riddle",
    operationType: "destructive",
    description: "Unpublish a Riddle so its public URL is no longer reachable.",
    inputSchema: riddleUuidInputSchema,
    outputSchema: riddleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_embed_code",
    operationType: "read",
    description: "Get the HTML embed code for a published Riddle.",
    inputSchema: riddleUuidInputSchema,
    outputSchema: embedCodeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List projects available to the authenticated Riddle user.",
    inputSchema: listProjectsInputSchema,
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get one Riddle project by its numeric ID.",
    inputSchema: s.object("The project to retrieve.", { projectId: projectIdSchema }),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description: "List tags and their occurrence counts for a Riddle project.",
    inputSchema: listTagsInputSchema,
    outputSchema: tagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_riddle_tags",
    operationType: "read",
    description: "List every tag attached to one Riddle.",
    inputSchema: riddleUuidInputSchema,
    outputSchema: tagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_riddle_tag",
    operationType: "write",
    description: "Attach an existing tag or create and attach a named tag to a Riddle.",
    inputSchema: addRiddleTagInputSchema,
    outputSchema: riddleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_riddle_tag",
    operationType: "destructive",
    description: "Remove one tag from a Riddle.",
    inputSchema: removeRiddleTagInputSchema,
    outputSchema: riddleOutputSchema,
  }),
];
