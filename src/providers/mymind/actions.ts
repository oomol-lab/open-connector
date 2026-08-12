import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mymind";

/**
 * Access levels a mymind access key is created with. A read-only key covers
 * every read action; anything that creates, changes, or removes content needs a
 * full-access key.
 */
const readOnly = "read_only";
const fullAccess = "full_access";

const objectIdSchema = s.nonEmptyString("The mymind object identifier.");
const spaceIdSchema = s.nonEmptyString("The mymind space identifier.");
const tagNamesSchema = s.stringArray("Tag names.", { itemDescription: "A tag name.", minItems: 1 });
const spaceIdsSchema = s.stringArray("Identifiers of spaces the object belongs to.", {
  itemDescription: "A space identifier.",
  minItems: 1,
});

const objectTagSchema = s.object(
  "A tag on an object.",
  {
    id: s.string("The tag identifier."),
    name: s.string("The tag name."),
    flags: s.integer("Bit flags mymind sets on the tag."),
  },
  { optional: ["id", "name", "flags"], additionalProperties: true },
);

const contentSchema = s.object(
  "An inline content body.",
  {
    type: s.string("The content media type, either text/markdown or application/prose+json."),
    body: s.string("The content body in the declared media type."),
  },
  { optional: ["type", "body"], additionalProperties: true },
);

const objectSchema = s.object(
  "A mymind object, which is anything saved to a mind: a page, image, file, or note.",
  {
    id: s.string("The object identifier."),
    title: s.string("The display title, set by the user or derived from the source or content."),
    summary: s.string("The summary mymind generated for the object."),
    content: contentSchema,
    source: s.looseObject("Where the object came from, including the original URL.", {}),
    tags: s.array("The tags on the object.", objectTagSchema),
    spaces: s.array("The spaces the object belongs to.", s.looseObject("A space reference.", {})),
    notes: s.array("The notes attached to the object.", s.looseObject("A note and its content body.", {})),
    blob: s.looseObject("The stored media for an uploaded file, when the object has one.", {}),
    screenshot: s.looseObject("The screenshot captured when the object was saved.", {}),
    mainEntity: s.looseObject("The primary entity the object is about.", {}),
    created: s.string("When the object was created."),
    modified: s.string("When the object was last modified."),
    bumped: s.string("When the object was last bumped."),
    deleted: s.string("When the object was soft-deleted; absent while the object is live."),
  },
  {
    optional: [
      "id",
      "title",
      "summary",
      "content",
      "source",
      "tags",
      "spaces",
      "notes",
      "blob",
      "screenshot",
      "mainEntity",
      "created",
      "modified",
      "bumped",
      "deleted",
    ],
    additionalProperties: true,
  },
);

const spaceSchema = s.object(
  "A mymind space, a named collection of objects.",
  {
    id: s.string("The space identifier."),
    name: s.string("The space name."),
    color: s.string("The space colour."),
    created: s.string("When the space was created."),
    objects: s.array(
      "The objects in the space, returned when a single space is read.",
      s.looseObject("An object reference.", {}),
    ),
  },
  { optional: ["id", "name", "color", "created", "objects"], additionalProperties: true },
);

const linkSchema = s.object(
  "A link between two mymind objects.",
  {
    id: s.string("The link identifier."),
    type: s.string("How the link was made, either WikiLink or Manual."),
    sourceId: s.string("The object the link starts from."),
    targetId: s.string("The object the link points to."),
    flags: s.integer("Bit flags mymind sets on the link."),
  },
  { optional: ["id", "type", "sourceId", "targetId", "flags"], additionalProperties: true },
);

const objectListOutput = (description: string) =>
  s.object(description, { objects: s.array("The objects.", objectSchema) });

const acknowledgedOutput = (description: string, idField: string, idDescription: string) =>
  s.object(description, {
    [idField]: s.string(idDescription),
    acknowledged: s.boolean("Whether mymind accepted the change."),
  });

const createdObjectOutput = s.object("The object mymind created or matched.", {
  object: objectSchema,
  created: s.boolean("Whether a new object was created, or false when mymind matched an existing duplicate."),
});

export const myMindActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_objects",
    description:
      "Search a mind and return the matching objects with their relevance scores. Supports keyword syntax (quoted phrases, && || -, wildcards, and field filters such as tag:, type:, domain:, created:) and, with semantic enabled, matching by meaning rather than exact terms.",
    requiredScopes: [readOnly],
    inputSchema: s.object(
      "The input for searching a mind.",
      {
        query: s.nonEmptyString(
          'The search query, for example `tag:reading && action:read && completed:false` or `"design systems"`.',
        ),
        limit: s.integer("How many matches to return.", { minimum: 1, maximum: 100, default: 20 }),
        semantic: s.boolean({ description: "Whether to match by meaning rather than exact terms.", default: false }),
        semanticBoost: s.number("A multiplier applied to semantic relevance when scoring."),
        similarTo: s.nonEmptyString(
          "An object identifier to find similar content for. Setting it turns on semantic matching.",
        ),
        rerank: s.boolean({
          description:
            "Whether to re-score matches with a cross-encoder for precision. Turns on semantic matching and caps results at 100.",
          default: false,
        }),
      },
      { optional: ["limit", "semantic", "semanticBoost", "similarTo", "rerank"] },
    ),
    outputSchema: s.object("The search matches in relevance order.", {
      matches: s.array(
        "The matches, most relevant first.",
        s.object(
          "One search match and the object it refers to.",
          {
            id: s.string("The matched object identifier."),
            score: s.number("The relevance score mymind assigned."),
            semanticScore: s.number("The semantic relevance score, present for a semantic or reranked search."),
            object: objectSchema,
          },
          { optional: ["score", "semanticScore", "object"] },
        ),
      ),
    }),
    followUpActions: ["mymind.get_object_content", "mymind.add_object_tags"],
  }),
  defineProviderAction(service, {
    name: "list_objects",
    description:
      "List objects in a mind, optionally narrowed to a text query, a space, specific identifiers, or objects similar to one you already have.",
    requiredScopes: [readOnly],
    inputSchema: s.object(
      "The input for listing objects.",
      {
        query: s.nonEmptyString("A text query to narrow the list."),
        objectIds: s.stringArray("Specific object identifiers to fetch.", {
          itemDescription: "An object identifier.",
          minItems: 1,
        }),
        spaceId: spaceIdSchema,
        similarTo: s.nonEmptyString("An object identifier to rank the results by similarity to."),
        limit: s.integer("How many objects to return.", { minimum: 1, maximum: 1000, default: 50 }),
      },
      { optional: ["query", "objectIds", "spaceId", "similarTo", "limit"] },
    ),
    outputSchema: objectListOutput("The objects that matched."),
  }),
  defineProviderAction(service, {
    name: "get_object",
    description: "Get one mymind object with its title, summary, tags, spaces, notes, and source.",
    requiredScopes: [readOnly],
    inputSchema: s.object("The input for getting an object.", { objectId: objectIdSchema }),
    outputSchema: objectSchema,
    followUpActions: ["mymind.get_object_content"],
  }),
  defineProviderAction(service, {
    name: "get_object_content",
    description: "Get the content body of a mymind object as markdown.",
    requiredScopes: [readOnly],
    inputSchema: s.object("The input for getting object content.", { objectId: objectIdSchema }),
    outputSchema: s.object("The object content.", {
      objectId: s.string("The object the content belongs to."),
      markdown: s.string("The content body as markdown."),
    }),
  }),
  defineProviderAction(service, {
    name: "save_url",
    description:
      "Save a URL to a mind. mymind fetches the page itself and fills in the title, summary, tags, and screenshot.",
    requiredScopes: [fullAccess],
    inputSchema: s.object(
      "The input for saving a URL.",
      {
        url: s.url("The public http or https URL to save."),
        title: s.string("A title to use instead of the one mymind derives from the page."),
        tags: tagNamesSchema,
        spaceIds: spaceIdsSchema,
      },
      { optional: ["title", "tags", "spaceIds"] },
    ),
    outputSchema: createdObjectOutput,
  }),
  defineProviderAction(service, {
    name: "create_note",
    description: "Create a note in a mind from markdown content.",
    requiredScopes: [fullAccess],
    inputSchema: s.object(
      "The input for creating a note.",
      {
        content: s.nonEmptyString("The note body as markdown."),
        title: s.string("The note title."),
        tags: tagNamesSchema,
        spaceIds: spaceIdsSchema,
      },
      { optional: ["title", "tags", "spaceIds"] },
    ),
    outputSchema: createdObjectOutput,
  }),
  defineProviderAction(service, {
    name: "update_object",
    description: "Update the title, summary, or completed state of a mymind object.",
    requiredScopes: [fullAccess],
    inputSchema: s.object(
      "The input for updating an object.",
      {
        objectId: objectIdSchema,
        title: s.string("A new title for the object."),
        summary: s.string("A new summary for the object."),
        completed: s.boolean("Whether the object is marked completed."),
      },
      { optional: ["title", "summary", "completed"] },
    ),
    outputSchema: acknowledgedOutput("The update result.", "objectId", "The updated object identifier."),
  }),
  defineProviderAction(service, {
    name: "update_object_content",
    description: "Replace the content body of a mymind object with markdown.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for replacing object content.", {
      objectId: objectIdSchema,
      content: s.nonEmptyString("The new content body as markdown."),
    }),
    outputSchema: acknowledgedOutput("The update result.", "objectId", "The updated object identifier."),
  }),
  defineProviderAction(service, {
    name: "delete_object",
    description: "Soft-delete a mymind object. Use restore_object to bring it back.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for deleting an object.", { objectId: objectIdSchema }),
    outputSchema: acknowledgedOutput("The deletion result.", "objectId", "The deleted object identifier."),
    followUpActions: ["mymind.restore_object"],
  }),
  defineProviderAction(service, {
    name: "restore_object",
    description: "Restore a soft-deleted mymind object.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for restoring an object.", { objectId: objectIdSchema }),
    outputSchema: acknowledgedOutput("The restore result.", "objectId", "The restored object identifier."),
  }),
  defineProviderAction(service, {
    name: "pin_object",
    description: "Pin a mymind object, optionally into a specific slot.",
    requiredScopes: [fullAccess],
    inputSchema: s.object(
      "The input for pinning an object.",
      {
        objectId: objectIdSchema,
        position: s.nonNegativeInteger("The zero-based slot to pin the object into."),
      },
      { optional: ["position"] },
    ),
    outputSchema: acknowledgedOutput("The pin result.", "objectId", "The pinned object identifier."),
  }),
  defineProviderAction(service, {
    name: "unpin_object",
    description: "Unpin a mymind object.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for unpinning an object.", { objectId: objectIdSchema }),
    outputSchema: acknowledgedOutput("The unpin result.", "objectId", "The unpinned object identifier."),
  }),
  defineProviderAction(service, {
    name: "create_object_note",
    description: "Attach a markdown note to a mymind object.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for adding a note to an object.", {
      objectId: objectIdSchema,
      content: s.nonEmptyString("The note body as markdown."),
    }),
    outputSchema: s.object("The created note.", {
      objectId: s.string("The object the note is attached to."),
      noteId: s.string("The new note identifier."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_object_note",
    description: "Replace the body of a note attached to a mymind object.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for updating a note.", {
      objectId: objectIdSchema,
      noteId: s.nonEmptyString("The note identifier."),
      content: s.nonEmptyString("The new note body as markdown."),
    }),
    outputSchema: acknowledgedOutput("The update result.", "noteId", "The updated note identifier."),
  }),
  defineProviderAction(service, {
    name: "delete_object_note",
    description: "Delete a note attached to a mymind object.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for deleting a note.", {
      objectId: objectIdSchema,
      noteId: s.nonEmptyString("The note identifier."),
    }),
    outputSchema: acknowledgedOutput("The deletion result.", "noteId", "The deleted note identifier."),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List the tags in a mind, most recently used first.",
    requiredScopes: [readOnly],
    inputSchema: s.object("The input for listing tags.", {}),
    outputSchema: s.object("The tags in the mind.", {
      tags: s.array(
        "The tags, most recently used first.",
        s.object(
          "A tag and how widely it is used.",
          {
            name: s.string("The tag name."),
            count: s.integer("How many objects carry the tag."),
            flags: s.integer("Bit flags mymind sets on the tag."),
            modified: s.string("When the tag was last used."),
          },
          { optional: ["name", "count", "flags", "modified"], additionalProperties: true },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "add_object_tags",
    description: "Add tags to a mymind object.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for tagging an object.", {
      objectId: objectIdSchema,
      tags: tagNamesSchema,
    }),
    outputSchema: acknowledgedOutput("The tagging result.", "objectId", "The tagged object identifier."),
  }),
  defineProviderAction(service, {
    name: "remove_object_tags",
    description: "Remove tags from a mymind object.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for untagging an object.", {
      objectId: objectIdSchema,
      tags: tagNamesSchema,
    }),
    outputSchema: acknowledgedOutput("The untagging result.", "objectId", "The untagged object identifier."),
  }),
  defineProviderAction(service, {
    name: "list_spaces",
    description: "List the spaces in a mind. The objects in each space are returned by get_space.",
    requiredScopes: [readOnly],
    inputSchema: s.object("The input for listing spaces.", {}),
    outputSchema: s.object("The spaces in the mind.", { spaces: s.array("The spaces.", spaceSchema) }),
    followUpActions: ["mymind.get_space"],
  }),
  defineProviderAction(service, {
    name: "get_space",
    description: "Get one mymind space and the objects it holds.",
    requiredScopes: [readOnly],
    inputSchema: s.object("The input for getting a space.", { spaceId: spaceIdSchema }),
    outputSchema: spaceSchema,
  }),
  defineProviderAction(service, {
    name: "create_space",
    description: "Create a mymind space, optionally seeded with objects.",
    requiredScopes: [fullAccess],
    inputSchema: s.object(
      "The input for creating a space.",
      {
        name: s.nonEmptyString("The space name."),
        color: s.nonEmptyString("The space colour."),
        objectIds: s.stringArray("Objects to put in the new space.", {
          itemDescription: "An object identifier.",
          minItems: 1,
        }),
      },
      { optional: ["color", "objectIds"] },
    ),
    outputSchema: spaceSchema,
  }),
  defineProviderAction(service, {
    name: "update_space",
    description: "Rename a mymind space or change its colour.",
    requiredScopes: [fullAccess],
    inputSchema: s.object(
      "The input for updating a space.",
      {
        spaceId: spaceIdSchema,
        name: s.nonEmptyString("A new name for the space."),
        color: s.nonEmptyString("A new colour for the space."),
      },
      { optional: ["name", "color"] },
    ),
    outputSchema: spaceSchema,
  }),
  defineProviderAction(service, {
    name: "delete_space",
    description: "Delete a mymind space. The objects it held stay in the mind.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for deleting a space.", { spaceId: spaceIdSchema }),
    outputSchema: acknowledgedOutput("The deletion result.", "spaceId", "The deleted space identifier."),
  }),
  defineProviderAction(service, {
    name: "add_object_to_space",
    description: "Put a mymind object into a space.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for adding an object to a space.", {
      spaceId: spaceIdSchema,
      objectId: objectIdSchema,
    }),
    outputSchema: acknowledgedOutput("The result of adding the object.", "spaceId", "The space identifier."),
  }),
  defineProviderAction(service, {
    name: "remove_object_from_space",
    description: "Take a mymind object out of a space. The object stays in the mind.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for removing an object from a space.", {
      spaceId: spaceIdSchema,
      objectId: objectIdSchema,
    }),
    outputSchema: acknowledgedOutput("The result of removing the object.", "spaceId", "The space identifier."),
  }),
  defineProviderAction(service, {
    name: "list_links",
    description: "List the links between objects in a mind, both wiki-style references and manual links.",
    requiredScopes: [readOnly],
    inputSchema: s.object("The input for listing links.", {}),
    outputSchema: s.object("The links in the mind.", { links: s.array("The links.", linkSchema) }),
  }),
  defineProviderAction(service, {
    name: "create_link",
    description: "Link one mymind object to another.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for creating a link.", {
      sourceId: s.nonEmptyString("The object the link starts from."),
      targetId: s.nonEmptyString("The object the link points to."),
    }),
    outputSchema: s.object("The link mymind created or matched.", {
      link: linkSchema,
      created: s.boolean("Whether a new link was created, or false when the link already existed."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_link",
    description:
      "Delete a manual link. A wiki-style link cannot be deleted directly; remove the reference from the source note instead.",
    requiredScopes: [fullAccess],
    inputSchema: s.object("The input for deleting a link.", { linkId: s.nonEmptyString("The link identifier.") }),
    outputSchema: acknowledgedOutput("The deletion result.", "linkId", "The deleted link identifier."),
  }),
];
