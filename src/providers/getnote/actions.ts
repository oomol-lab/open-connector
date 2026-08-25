import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "getnote";

const noteId = s.string("Getnote note ID. Treat this as a string because upstream IDs are int64.", {
  minLength: 1,
});

const topicId = s.string("Getnote knowledge base topic ID.", {
  minLength: 1,
});

const taskId = s.string("Getnote asynchronous save task ID.", {
  minLength: 1,
});

const tagName = s.string("Tag name.", {
  minLength: 1,
});

const rawObject = s.looseObject("Raw upstream object returned by Getnote.");

const nullableString = s.nullable(s.string("String value returned by Getnote."));
const nullableNumber = s.nullable(s.number("Number value returned by Getnote."));
const nullableBoolean = s.nullable(s.boolean("Boolean value returned by Getnote."));

const noteSummarySchema = s.object("Normalized Getnote note summary.", {
  noteId,
  title: nullableString,
  content: nullableString,
  noteType: nullableString,
  tags: s.array("Tags returned for the note.", rawObject),
  topics: s.array("Knowledge base topics returned for the note.", rawObject),
  createdAt: nullableString,
  updatedAt: nullableString,
  raw: rawObject,
});

const taskSummarySchema = s.object("Normalized Getnote asynchronous save task.", {
  taskId,
  url: nullableString,
  status: nullableString,
  raw: rawObject,
});

const searchResultSchema = s.object("Normalized Getnote semantic search result.", {
  noteId: nullableString,
  noteType: nullableString,
  title: nullableString,
  content: nullableString,
  score: nullableNumber,
  createdAt: nullableString,
  raw: rawObject,
});

const tagSchema = s.object("Normalized Getnote tag.", {
  id: nullableString,
  name: nullableString,
  type: nullableString,
  raw: rawObject,
});

const topicSchema = s.object("Normalized Getnote knowledge base.", {
  topicId: nullableString,
  name: nullableString,
  description: nullableString,
  noteCount: nullableNumber,
  createdAt: nullableString,
  raw: rawObject,
});

const saveNoteInputSchema = s.object(
  "Input for saving a text, link, or image-URL note to Getnote.",
  {
    noteType: s.stringEnum("The note type to save.", ["plain_text", "link", "img_text"]),
    title: s.string("Optional note title."),
    content: s.string("Markdown content or image note description."),
    tags: s.array("Tag names to attach to the note.", tagName),
    parentId: s.string("Parent note ID. Treat this as a string because upstream IDs are int64."),
    linkUrl: s.url("URL to save when noteType is `link`."),
    imageUrls: s.array(
      "Image URLs to save when noteType is `img_text`; use URLs from Getnote upload tokens or other accessible image URLs.",
      s.url("One image URL."),
      { minItems: 1, maxItems: 9 },
    ),
    topicId: s.string("Knowledge base topic ID to save the note into."),
  },
  {
    optional: ["noteType", "title", "content", "tags", "parentId", "linkUrl", "imageUrls", "topicId"],
  },
);

const saveNoteOutputSchema = s.object("Normalized Getnote save note response.", {
  success: s.boolean("Whether Getnote reported success."),
  noteId: nullableString,
  title: nullableString,
  createdAt: nullableString,
  updatedAt: nullableString,
  tasks: s.array("Asynchronous save tasks returned by Getnote.", taskSummarySchema),
  raw: rawObject,
});

const taskOutputSchema = s.object("Normalized Getnote save task progress.", {
  success: s.boolean("Whether Getnote reported success."),
  status: s.string("Task status returned by Getnote."),
  noteId: nullableString,
  raw: rawObject,
});

const listNotesOutputSchema = s.object("Normalized Getnote note list response.", {
  success: s.boolean("Whether Getnote reported success."),
  notes: s.array("Notes returned by Getnote.", noteSummarySchema),
  hasMore: s.boolean("Whether another page is available."),
  cursor: nullableString,
  raw: rawObject,
});

const getNoteOutputSchema = s.object("Normalized Getnote note detail response.", {
  success: s.boolean("Whether Getnote reported success."),
  note: s.looseObject("Detailed note object returned by Getnote.", {
    noteId,
    title: nullableString,
    content: nullableString,
    noteType: nullableString,
    raw: rawObject,
  }),
  raw: rawObject,
});

const mutationOutputSchema = s.object("Normalized Getnote mutation response.", {
  success: s.boolean("Whether Getnote reported success."),
  raw: rawObject,
});

const shareNoteOutputSchema = s.object("Normalized Getnote share link response.", {
  success: s.boolean("Whether Getnote reported success."),
  noteId: nullableString,
  shareId: nullableString,
  shareUrl: nullableString,
  raw: rawObject,
});

const searchOutputSchema = s.object("Normalized Getnote semantic search response.", {
  success: s.boolean("Whether Getnote reported success."),
  results: s.array("Search results returned by Getnote.", searchResultSchema),
  raw: rawObject,
});

const tagListOutputSchema = s.object("Normalized Getnote note tag list response.", {
  success: s.boolean("Whether Getnote reported success."),
  noteId: nullableString,
  tags: s.array("Tags attached to the note.", tagSchema),
  raw: rawObject,
});

const topicListOutputSchema = s.object("Normalized Getnote knowledge base list response.", {
  success: s.boolean("Whether Getnote reported success."),
  topics: s.array("Knowledge bases returned by Getnote.", topicSchema),
  total: nullableNumber,
  hasMore: nullableBoolean,
  raw: rawObject,
});

const knowledgeNotesOutputSchema = s.object("Normalized Getnote knowledge base notes response.", {
  success: s.boolean("Whether Getnote reported success."),
  notes: s.array("Notes in the knowledge base.", noteSummarySchema),
  hasMore: nullableBoolean,
  page: nullableNumber,
  raw: rawObject,
});

const genericListOutputSchema = s.object("Normalized Getnote list response.", {
  success: s.boolean("Whether Getnote reported success."),
  items: s.array("Items returned by Getnote.", rawObject),
  hasMore: nullableBoolean,
  page: nullableNumber,
  raw: rawObject,
});

const genericDetailOutputSchema = s.object("Normalized Getnote detail response.", {
  success: s.boolean("Whether Getnote reported success."),
  item: rawObject,
  raw: rawObject,
});

const noteIdInput = s.object("Input containing one Getnote note ID.", {
  noteId,
});

const paginatedInput = s.object(
  "Input for page-based Getnote list endpoints.",
  {
    page: s.positiveInteger("Page number to request."),
  },
  { optional: ["page"] },
);

const topicPageInput = s.object(
  "Input for a page-based knowledge base endpoint.",
  {
    topicId,
    page: s.positiveInteger("Page number to request."),
  },
  { optional: ["page"] },
);

export const getnoteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "save_note",
    description:
      "Save a plain-text, link, or image-URL note to Getnote. Plain text and Getnote share links are synchronous; regular links and image notes may return tasks.",
    requiredScopes: [],
    providerPermissions: ["note.content.write"],
    asyncLifecycle: {
      startActionId: "getnote.save_note",
      statusActionId: "getnote.get_save_task",
    },
    inputSchema: saveNoteInputSchema,
    outputSchema: saveNoteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_save_task",
    description: "Check the progress of an asynchronous Getnote link or image save task.",
    requiredScopes: [],
    providerPermissions: ["note.content.write"],
    asyncLifecycle: {
      startActionId: "getnote.save_note",
      statusActionId: "getnote.get_save_task",
    },
    inputSchema: s.object("Input for checking Getnote save task progress.", {
      taskId,
    }),
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_notes",
    description: "List recent Getnote notes using the official cursor pagination endpoint.",
    requiredScopes: [],
    providerPermissions: ["note.content.read"],
    inputSchema: s.object(
      "Input for listing Getnote notes.",
      {
        cursor: s.string("Pagination cursor returned by the previous page."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: listNotesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_note",
    description: "Get one Getnote note detail, including fields that are not present in lists.",
    requiredScopes: [],
    providerPermissions: ["note.content.read"],
    inputSchema: s.object(
      "Input for retrieving a Getnote note.",
      {
        noteId,
        imageQuality: s.stringEnum("Set to `original` to request original image links.", ["original"]),
      },
      { optional: ["imageQuality"] },
    ),
    outputSchema: getNoteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_note",
    description: "Update a Getnote note title, plain-text content, or tags. Tags replace the existing tag list.",
    requiredScopes: [],
    providerPermissions: ["note.content.write"],
    inputSchema: s.object(
      "Input for updating a Getnote note.",
      {
        noteId,
        title: s.string("New note title."),
        content: s.string("New note content. Upstream only supports this for plain-text notes."),
        tags: s.array("Replacement tag names.", tagName),
      },
      { optional: ["title", "content", "tags"] },
    ),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_note",
    description: "Move a Getnote note to trash.",
    requiredScopes: [],
    providerPermissions: ["note.content.trash"],
    inputSchema: noteIdInput,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "share_note",
    description: "Generate or retrieve the idempotent public share link for a Getnote note.",
    requiredScopes: [],
    providerPermissions: ["note.content.read"],
    inputSchema: s.object(
      "Input for generating a Getnote share link.",
      {
        noteId,
        excludeAudio: s.boolean("Whether to exclude audio from the public share."),
      },
      { optional: ["excludeAudio"] },
    ),
    outputSchema: shareNoteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_note_tags",
    description: "List tags attached to one Getnote note.",
    requiredScopes: [],
    providerPermissions: ["note.tag.read", "note.content.read"],
    inputSchema: noteIdInput,
    outputSchema: tagListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_note_tags",
    description: "Add one or more tags to a Getnote note.",
    requiredScopes: [],
    providerPermissions: ["note.tag.write"],
    inputSchema: s.object("Input for adding tags to a Getnote note.", {
      noteId,
      tags: s.array("Tag names to add.", tagName, { minItems: 1 }),
    }),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_note_tag",
    description: "Remove one Getnote tag by tag ID. System tags cannot be deleted upstream.",
    requiredScopes: [],
    providerPermissions: ["note.tag.write"],
    inputSchema: s.object("Input for removing a tag from a Getnote note.", {
      noteId,
      tagId: s.string("Tag ID to remove, as returned by list_note_tags or note detail.", {
        minLength: 1,
      }),
    }),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_notes",
    description: "Run Getnote semantic search globally, or within one knowledge base when topicId is provided.",
    requiredScopes: [],
    providerPermissions: ["note.recall.read", "note.topic.recall.read"],
    inputSchema: s.object(
      "Input for Getnote semantic search.",
      {
        query: s.string("Natural language search query.", {
          minLength: 1,
        }),
        topicId: s.string("Knowledge base topic ID for scoped search."),
        topK: s.positiveInteger("Maximum number of results to return. Getnote allows up to 10.", {
          maximum: 10,
        }),
      },
      { optional: ["topicId", "topK"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_knowledge_bases",
    description: "List knowledge bases owned by the authenticated Getnote account.",
    requiredScopes: [],
    providerPermissions: ["topic.read"],
    inputSchema: paginatedInput,
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_subscribed_knowledge_bases",
    description:
      "List knowledge bases subscribed by the authenticated Getnote account. These are read-only unless the user is an admin.",
    requiredScopes: [],
    providerPermissions: ["topic.read"],
    inputSchema: paginatedInput,
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_knowledge_base",
    description: "Create a Getnote knowledge base. Upstream limits creation to 50 per day.",
    requiredScopes: [],
    providerPermissions: ["topic.write"],
    inputSchema: s.object(
      "Input for creating a Getnote knowledge base.",
      {
        name: s.string("Knowledge base name.", {
          minLength: 1,
        }),
        description: s.string("Knowledge base description."),
      },
      { optional: ["description"] },
    ),
    outputSchema: s.object("Normalized create knowledge base response.", {
      success: s.boolean("Whether Getnote reported success."),
      topic: rawObject,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_knowledge_base_notes",
    description: "List notes in one Getnote knowledge base.",
    requiredScopes: [],
    providerPermissions: ["note.topic.read"],
    inputSchema: topicPageInput,
    outputSchema: knowledgeNotesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_notes_to_knowledge_base",
    description:
      "Add up to 20 notes to one Getnote knowledge base. Subscribed knowledge bases are read-only unless the user is an admin.",
    requiredScopes: [],
    providerPermissions: ["note.topic.write"],
    inputSchema: s.object("Input for adding notes to a Getnote knowledge base.", {
      topicId,
      noteIds: s.array("Note IDs to add.", noteId, { minItems: 1, maxItems: 20 }),
    }),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_notes_from_knowledge_base",
    description: "Remove notes from one Getnote knowledge base.",
    requiredScopes: [],
    providerPermissions: ["note.topic.write"],
    inputSchema: s.object("Input for removing notes from a Getnote knowledge base.", {
      topicId,
      noteIds: s.array("Note IDs to remove.", noteId, { minItems: 1 }),
    }),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_knowledge_base_bloggers",
    description: "List bloggers subscribed in one Getnote knowledge base.",
    requiredScopes: [],
    providerPermissions: ["topic.blogger.read"],
    inputSchema: topicPageInput,
    outputSchema: genericListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_blogger_contents",
    description: "List content items for a subscribed blogger in a Getnote knowledge base.",
    requiredScopes: [],
    providerPermissions: ["topic.blogger.read"],
    inputSchema: s.object(
      "Input for listing Getnote blogger contents.",
      {
        topicId,
        followId: s.string("Blogger follow ID returned by list_knowledge_base_bloggers.", {
          minLength: 1,
        }),
        page: s.positiveInteger("Page number to request."),
      },
      { optional: ["page"] },
    ),
    outputSchema: genericListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_blogger_content",
    description: "Get one Getnote blogger content detail, including original text when returned.",
    requiredScopes: [],
    providerPermissions: ["topic.blogger.read"],
    inputSchema: s.object("Input for getting one Getnote blogger content item.", {
      topicId,
      postId: s.string("Blogger post ID alias returned by list_blogger_contents.", {
        minLength: 1,
      }),
    }),
    outputSchema: genericDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_knowledge_base_lives",
    description: "List completed live sessions in one Getnote knowledge base.",
    requiredScopes: [],
    providerPermissions: ["topic.live.read"],
    inputSchema: topicPageInput,
    outputSchema: genericListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_live_detail",
    description: "Get one Getnote live detail, including AI summary and transcript when returned.",
    requiredScopes: [],
    providerPermissions: ["topic.live.read"],
    inputSchema: s.object("Input for getting one Getnote live detail.", {
      topicId,
      liveId: s.string("Live ID returned by list_knowledge_base_lives.", {
        minLength: 1,
      }),
    }),
    outputSchema: genericDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "follow_live",
    description:
      "Subscribe a Dedao live channel link into one Getnote knowledge base. Upstream currently supports Dedao App live links.",
    requiredScopes: [],
    providerPermissions: ["topic.live.read"],
    inputSchema: s.object(
      "Input for following a Dedao live channel in Getnote.",
      {
        topicId,
        link: s.url("Dedao live link to subscribe."),
        platform: s.string("Optional upstream platform value."),
      },
      { optional: ["platform"] },
    ),
    outputSchema: genericDetailOutputSchema,
  }),
];
