import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "heyzine";

const noInputSchema = s.actionInput({}, [], "No input parameters are required for this action.");
const resourceIdSchema = s.nonEmptyString("The Heyzine flipbook or bookshelf identifier.");

const linkSchema = s.object("The public URLs returned by Heyzine for a flipbook.", {
  custom: s.nullableString("The custom domain URL for the flipbook when configured."),
  base: s.string("The base Heyzine URL for the flipbook."),
  thumbnail: s.string("The cover thumbnail URL for the flipbook."),
  pdf: s.string("The downloadable PDF URL for the flipbook."),
});

const oembedSchema = s.looseRequiredObject(
  "The oEmbed payload returned by Heyzine for a flipbook.",
  {
    type: s.string("The oEmbed content type."),
    version: s.string("The oEmbed version string."),
    title: s.nullableString("The title returned by the oEmbed payload."),
    provider_name: s.string("The oEmbed provider name."),
    provider_url: s.string("The oEmbed provider URL."),
    html: s.string("The embed HTML snippet returned by Heyzine."),
    width: s.integer("The embed width returned by Heyzine."),
    height: s.integer("The embed height returned by Heyzine."),
    thumbnail_url: s.string("The oEmbed thumbnail URL."),
    thumbnail_width: s.integer("The oEmbed thumbnail width."),
    thumbnail_height: s.integer("The oEmbed thumbnail height."),
  },
  {
    optional: [
      "title",
      "provider_name",
      "provider_url",
      "html",
      "width",
      "height",
      "thumbnail_url",
      "thumbnail_width",
      "thumbnail_height",
    ],
  },
);

const flipbookSchema = s.object("A Heyzine flipbook resource.", {
  id: s.string("The Heyzine flipbook identifier."),
  date: s.string("The publication date string returned by Heyzine."),
  title: s.nullableString("The flipbook title."),
  subtitle: s.nullableString("The flipbook subtitle."),
  description: s.nullableString("The flipbook description."),
  pages: s.integer("The number of pages in the flipbook."),
  size: s.integer("The PDF size in bytes when returned by Heyzine."),
  private: s.nullableString("The private note associated with the flipbook when returned by Heyzine."),
  position: s.integer("The 0-based bookshelf position returned by Heyzine."),
  tags: s.stringArray("The tags returned by Heyzine for the flipbook."),
  links: linkSchema,
  oembed: oembedSchema,
});

const bookshelfSchema = s.object("A Heyzine bookshelf resource.", {
  id: s.string("The Heyzine bookshelf identifier."),
  title: s.nullableString("The bookshelf title."),
  description: s.nullableString("The bookshelf description."),
  thumbnail: s.nullableString("The bookshelf thumbnail URL."),
  flipbook_count: s.integer("The number of flipbooks currently assigned to the bookshelf."),
});

const operationSchema = s.actionOutput(
  {
    success: s.boolean("Whether the Heyzine operation succeeded."),
    code: s.integer("The HTTP-like status code returned by Heyzine."),
    msg: s.string("The status message returned by Heyzine."),
  },
  "The normalized result of a mutating Heyzine API operation.",
  ["success"],
);

const idInputSchema = s.actionInput(
  {
    id: resourceIdSchema,
  },
  ["id"],
  "The input payload for selecting a Heyzine resource.",
);

const bookshelfFlipbookInputSchema = s.actionInput(
  {
    id: resourceIdSchema,
    flipbook_id: s.nonEmptyString("The Heyzine flipbook identifier."),
  },
  ["id", "flipbook_id"],
  "The input payload for selecting a Heyzine bookshelf and flipbook.",
);

const addFlipbookInputSchema = s.actionInput(
  {
    id: resourceIdSchema,
    flipbook_id: s.nonEmptyString("The Heyzine flipbook identifier."),
    position: s.integer("The optional 0-based position inside the bookshelf.", { minimum: 0 }),
  },
  ["id", "flipbook_id"],
  "The input payload for adding a flipbook to a bookshelf.",
);

const socialMetadataInputSchema = s.actionInput(
  {
    id: resourceIdSchema,
    title: s.string("The optional social sharing title."),
    description: s.string("The optional social sharing description."),
    thumbnail: s.string("The URL for the social sharing thumbnail image."),
  },
  ["id"],
  "The social metadata values to update in Heyzine. At least one of title, description, or thumbnail is required.",
);

export const heyzineActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_flipbooks",
    description: "List the flipbooks accessible with the current Heyzine API key.",
    inputSchema: noInputSchema,
    outputSchema: s.actionOutput(
      { flipbooks: s.array("The flipbooks returned by Heyzine.", flipbookSchema) },
      "The normalized output payload for the list_flipbooks action.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_flipbook",
    description: "Get the details and oEmbed metadata for a specific Heyzine flipbook.",
    inputSchema: idInputSchema,
    outputSchema: s.actionOutput(
      { flipbook: flipbookSchema },
      "The normalized output payload for the get_flipbook action.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_flipbook",
    description: "Delete a specific Heyzine flipbook.",
    inputSchema: idInputSchema,
    outputSchema: operationSchema,
  }),
  defineProviderAction(service, {
    name: "list_bookshelves",
    description: "List the bookshelves accessible with the current Heyzine API key.",
    inputSchema: noInputSchema,
    outputSchema: s.actionOutput(
      { bookshelves: s.array("The bookshelves returned by Heyzine.", bookshelfSchema) },
      "The normalized output payload for the list_bookshelves action.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_bookshelf_flipbooks",
    description: "List the flipbooks assigned to a specific Heyzine bookshelf.",
    inputSchema: idInputSchema,
    outputSchema: s.actionOutput(
      { flipbooks: s.array("The flipbooks returned for the selected bookshelf.", flipbookSchema) },
      "The normalized output payload for the list_bookshelf_flipbooks action.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_flipbook_to_bookshelf",
    description: "Add a flipbook to a specific Heyzine bookshelf.",
    inputSchema: addFlipbookInputSchema,
    outputSchema: operationSchema,
  }),
  defineProviderAction(service, {
    name: "remove_flipbook_from_bookshelf",
    description: "Remove a flipbook from a specific Heyzine bookshelf.",
    inputSchema: bookshelfFlipbookInputSchema,
    outputSchema: operationSchema,
  }),
  defineProviderAction(service, {
    name: "set_flipbook_social_data",
    description: "Set the social sharing metadata for a specific Heyzine flipbook.",
    inputSchema: socialMetadataInputSchema,
    outputSchema: operationSchema,
  }),
  defineProviderAction(service, {
    name: "set_bookshelf_social_data",
    description: "Set the social sharing metadata for a specific Heyzine bookshelf.",
    inputSchema: socialMetadataInputSchema,
    outputSchema: operationSchema,
  }),
];
