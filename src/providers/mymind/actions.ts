import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mymind";

const cardIdSchema = s.nonEmptyString("The mymind card identifier.");
const spaceIdSchema = s.nonEmptyString("The mymind space identifier.");

const tagSchema = s.object(
  "A mymind tag with its name and usage metadata.",
  {
    name: s.string("The tag name."),
    flags: s.integer("Bit flags mymind sets on the tag, including the marker for user-created tags."),
    count: s.integer("How many cards carry the tag."),
  },
  { optional: ["name", "flags", "count"], additionalProperties: true },
);

const cardSchema = s.object(
  "A mymind card and the metadata mymind derived for it.",
  {
    id: s.string("The card identifier used by the other mymind actions."),
    type: s.string("The card type mymind assigned, such as WebPage, Note, Image, Article, or XPost."),
    title: s.string("The card title, often the first line of the saved content rather than a descriptive name."),
    description: s.string("The card description or summary."),
    domain: s.string("The domain the card was saved from."),
    source: s.looseObject("Where the card came from, including the original URL.", {}),
    tags: s.array("The tags on the card.", tagSchema),
    created: s.string("When the card was created."),
    modified: s.string("When the card was last modified."),
  },
  {
    optional: ["id", "type", "title", "description", "domain", "source", "tags", "created", "modified"],
    additionalProperties: true,
  },
);

const spaceSchema = s.object(
  "A mymind space, which is either a manual collection or a query that populates itself.",
  {
    id: s.string("The space identifier."),
    name: s.string("The space name."),
    color: s.string("The space colour as a hex value."),
    query: s.looseObject("The filters that populate a smart space.", {}),
    objects: s.array("The cards currently in the space.", s.looseObject("A card reference.", {})),
  },
  { optional: ["id", "name", "color", "query", "objects"], additionalProperties: true },
);

const tagListOutput = s.object("The tags mymind returned.", {
  tags: s.array("The tags, ordered by usage count.", tagSchema),
});

const cardTagsOutput = s.object("The tags on a card after the change was applied.", {
  cardId: s.string("The card the tags belong to."),
  tags: s.array("The card's tags.", tagSchema),
});

const savedCardOutput = (description: string) =>
  s.object(description, {
    card: cardSchema,
    tags: s.stringArray("The tags applied to the new card after it was created."),
  });

const optionalTagsInput = s.stringArray("Tags to apply to the card once it exists.", {
  itemDescription: "A tag name.",
});

export const myMindActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_cards",
    description:
      "Search saved mymind cards by text and return the matching cards. Tags and descriptions are more reliable than titles for finding a card, because cards saved from social posts take their title from the first line of the post.",
    inputSchema: s.object(
      "The input for searching cards.",
      {
        query: s.nonEmptyString("The text to search for across card titles, descriptions, and content."),
        limit: s.integer("How many matching cards to load in full. Each card costs one extra request.", {
          minimum: 1,
          maximum: 50,
          default: 20,
        }),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The cards matching the search.", {
      matchCount: s.integer("How many cards matched the query before the limit was applied."),
      cards: s.array("The matching cards, newest match order preserved from mymind.", cardSchema),
    }),
    followUpActions: ["mymind.get_card_content", "mymind.add_card_tag"],
  }),
  defineProviderAction(service, {
    name: "get_card",
    description: "Get one mymind card with its title, type, tags, source, and timestamps.",
    inputSchema: s.object("The input for getting a card.", { cardId: cardIdSchema }),
    outputSchema: cardSchema,
    followUpActions: ["mymind.get_card_content"],
  }),
  defineProviderAction(service, {
    name: "get_card_content",
    description:
      "Get the full body of a mymind card, including its saved prose and any note written on it, rendered as markdown.",
    inputSchema: s.object("The input for getting card content.", { cardId: cardIdSchema }),
    outputSchema: s.object("The card body and its rendered markdown.", {
      card: cardSchema,
      proseMarkdown: s.string("The card's saved content rendered as markdown, empty when the card has none."),
      noteMarkdown: s.string("The note written on the card rendered as markdown, empty when there is no note."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_note",
    description: "Create a note in mymind from markdown content.",
    inputSchema: s.object(
      "The input for creating a note.",
      {
        content: s.nonEmptyString(
          "The note body as markdown. Headings, fenced code blocks, horizontal rules, bullet lists, ordered lists, and task lists are converted; inline emphasis is kept as literal text.",
        ),
        title: s.string("The note title."),
        tags: optionalTagsInput,
      },
      { optional: ["title", "tags"] },
    ),
    outputSchema: savedCardOutput("The created note."),
  }),
  defineProviderAction(service, {
    name: "save_url",
    description:
      "Save a URL to mymind as a card. mymind fetches the page itself and fills in the title, description, and image.",
    inputSchema: s.object(
      "The input for saving a URL.",
      {
        url: s.url("The public http or https URL to save."),
        tags: optionalTagsInput,
      },
      { optional: ["tags"] },
    ),
    outputSchema: savedCardOutput("The saved card."),
  }),
  defineProviderAction(service, {
    name: "update_card",
    description: "Rename an existing mymind card.",
    inputSchema: s.object("The input for updating a card.", {
      cardId: cardIdSchema,
      title: s.string("The new card title."),
    }),
    outputSchema: cardSchema,
  }),
  defineProviderAction(service, {
    name: "delete_card",
    description: "Delete a mymind card.",
    inputSchema: s.object("The input for deleting a card.", { cardId: cardIdSchema }),
    outputSchema: s.object("The deletion result.", {
      cardId: s.string("The deleted card identifier."),
      deleted: s.boolean("Whether mymind accepted the deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description:
      "List mymind tags ordered by how many cards use them. Restrict the list to user-created tags to see how the account owner actually organises their cards, rather than the tags mymind generated.",
    inputSchema: s.object(
      "The input for listing tags.",
      {
        customOnly: s.boolean({
          description: "Whether to return only tags the user created, excluding mymind-generated ones.",
          default: false,
        }),
        limit: s.integer("How many tags to return.", { minimum: 1, maximum: 500, default: 50 }),
      },
      { optional: ["customOnly", "limit"] },
    ),
    outputSchema: tagListOutput,
  }),
  defineProviderAction(service, {
    name: "get_card_tags",
    description: "List the tags on one mymind card.",
    inputSchema: s.object("The input for listing a card's tags.", { cardId: cardIdSchema }),
    outputSchema: cardTagsOutput,
  }),
  defineProviderAction(service, {
    name: "add_card_tag",
    description: "Add a tag to a mymind card.",
    inputSchema: s.object("The input for tagging a card.", {
      cardId: cardIdSchema,
      tag: s.nonEmptyString("The tag name to add."),
    }),
    outputSchema: cardTagsOutput,
  }),
  defineProviderAction(service, {
    name: "remove_card_tag",
    description: "Remove a tag from a mymind card.",
    inputSchema: s.object("The input for untagging a card.", {
      cardId: cardIdSchema,
      tag: s.nonEmptyString("The tag name to remove."),
    }),
    outputSchema: cardTagsOutput,
  }),
  defineProviderAction(service, {
    name: "list_spaces",
    description: "List the spaces in mymind, both manual collections and self-populating smart spaces.",
    inputSchema: s.object("The input for listing spaces.", {}),
    outputSchema: s.object("The spaces in the account.", {
      spaces: s.array("The spaces.", spaceSchema),
    }),
    followUpActions: ["mymind.get_space"],
  }),
  defineProviderAction(service, {
    name: "get_space",
    description: "Get one mymind space and the cards it currently holds.",
    inputSchema: s.object("The input for getting a space.", { spaceId: spaceIdSchema }),
    outputSchema: spaceSchema,
  }),
  defineProviderAction(service, {
    name: "create_space",
    description:
      "Create a mymind space. Passing filters creates a smart space that keeps itself populated; omitting them creates an empty manual collection.",
    inputSchema: s.object(
      "The input for creating a space.",
      {
        name: s.nonEmptyString("The space name."),
        color: s.stringPattern("^#[0-9a-fA-F]{6}$", { description: "The space colour as a six-digit hex value." }),
        filters: s.stringArray(
          "Query filters for a smart space, such as a search term or a type filter like type:webpage. Filters are combined with AND.",
          { itemDescription: "One mymind query filter.", minItems: 1 },
        ),
      },
      { optional: ["color", "filters"] },
    ),
    outputSchema: spaceSchema,
  }),
  defineProviderAction(service, {
    name: "delete_space",
    description: "Delete a mymind space. The cards it held stay in the account.",
    inputSchema: s.object("The input for deleting a space.", { spaceId: spaceIdSchema }),
    outputSchema: s.object("The deletion result.", {
      spaceId: s.string("The deleted space identifier."),
      deleted: s.boolean("Whether mymind accepted the deletion."),
    }),
  }),
];
