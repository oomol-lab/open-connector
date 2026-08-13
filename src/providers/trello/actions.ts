import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { trelloReadScopes, trelloWriteScopes } from "./scopes.ts";

const service = "trello";

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const trelloFieldsInput = s.array(
  "Comma-joined Trello fields to request from the REST API.",
  nonEmptyString("One Trello field name to include in the response."),
  {
    minItems: 1,
  },
);

const trelloId = (description: string) => nonEmptyString(description);

const trelloMemberSchema = s.object(
  "A normalized Trello member returned by the REST API.",
  {
    id: s.string("Trello member ID."),
    username: s.string("Trello username."),
    fullName: s.string("Display name for the Trello member."),
  },
  {
    optional: ["id", "username", "fullName"],
    additionalProperties: true,
  },
);

const trelloBoardSchema = s.object(
  "A normalized Trello board returned by the REST API.",
  {
    id: s.string("Trello board ID."),
    name: s.string("Board name."),
    description: s.string("Board description."),
    url: s.url("Public Trello board URL."),
    shortUrl: s.url("Short Trello board URL."),
    closed: s.boolean("Whether the board is closed."),
  },
  {
    optional: ["id", "name", "description", "url", "shortUrl", "closed"],
    additionalProperties: true,
  },
);

const trelloListSchema = s.object(
  "A normalized Trello list returned by the REST API.",
  {
    id: s.string("Trello list ID."),
    boardId: s.string("Trello board ID that owns the list."),
    name: s.string("List name."),
    closed: s.boolean("Whether the list is closed."),
    position: s.number("List position on the board."),
  },
  {
    optional: ["id", "boardId", "name", "closed", "position"],
    additionalProperties: true,
  },
);

const trelloCardSchema = s.object(
  "A normalized Trello card returned by the REST API.",
  {
    id: s.string("Trello card ID."),
    boardId: s.string("Trello board ID that owns the card."),
    listId: s.string("Trello list ID that contains the card."),
    name: s.string("Card name."),
    description: s.string("Card description."),
    url: s.url("Public Trello card URL."),
    shortUrl: s.url("Short Trello card URL."),
    closed: s.boolean("Whether the card is closed."),
    due: s.nullable(s.dateTime("Card due date in ISO 8601 format.")),
    dueComplete: s.boolean("Whether the card due date is marked complete."),
  },
  {
    optional: ["id", "boardId", "listId", "name", "description", "url", "shortUrl", "closed", "due", "dueComplete"],
    additionalProperties: true,
  },
);

const trelloActionSchema = s.object(
  "A Trello action returned by the REST API.",
  {
    id: s.string("Trello action ID."),
    type: s.string("Trello action type."),
    data: s.looseObject("Action data returned by Trello."),
    date: s.dateTime("Action creation timestamp in ISO 8601 format."),
  },
  {
    optional: ["id", "type", "data", "date"],
    additionalProperties: true,
  },
);

const trelloCheckItemSchema = s.object(
  "A Trello checklist item returned by the REST API.",
  {
    id: s.string("Trello check item ID."),
    name: s.string("Check item name."),
    state: s.stringEnum("Check item state.", ["complete", "incomplete"]),
    position: s.number("Check item position in the checklist."),
  },
  {
    optional: ["id", "name", "state", "position"],
    additionalProperties: true,
  },
);

const trelloChecklistSchema = s.object(
  "A Trello checklist returned by the REST API.",
  {
    id: s.string("Trello checklist ID."),
    cardId: s.string("Trello card ID that owns the checklist."),
    name: s.string("Checklist name."),
    checkItems: s.array("Checklist items returned by Trello.", trelloCheckItemSchema),
  },
  {
    optional: ["id", "cardId", "name", "checkItems"],
    additionalProperties: true,
  },
);

const trelloAttachmentSchema = s.object(
  "A Trello card attachment returned by the REST API.",
  {
    id: s.string("Trello attachment ID."),
    name: s.string("Attachment name."),
    url: s.url("Attachment URL."),
    bytes: s.nullable(s.integer("Attachment size in bytes.")),
    date: s.dateTime("Attachment creation timestamp in ISO 8601 format."),
  },
  {
    optional: ["id", "name", "url", "bytes", "date"],
    additionalProperties: true,
  },
);

const optionalMemberIdInput = {
  memberId: trelloId("Trello member ID or the me shortcut. Defaults to me."),
} as const;

const boardFieldsInput = {
  fields: trelloFieldsInput,
} as const;

const cardMutationInput = {
  name: nonEmptyString("Card name."),
  description: s.string("Card description."),
  due: s.nullable(s.dateTime("Card due date in ISO 8601 format.")),
  position: s.anyOf("Card position. Use top, bottom, or a numeric position.", [
    s.stringEnum("Named card position.", ["top", "bottom"]),
    s.number("Numeric card position."),
  ]),
  memberIds: s.array("Trello member IDs to assign to the card.", trelloId("One Trello member ID."), {
    minItems: 1,
  }),
  labelIds: s.array("Trello label IDs to assign to the card.", trelloId("One Trello label ID."), {
    minItems: 1,
  }),
} as const;

const boardCreateInput = {
  name: nonEmptyString("Board name."),
  description: s.string("Board description."),
  defaultLists: s.boolean("Whether Trello should create default lists on the board."),
  permissionLevel: s.stringEnum("Board visibility preference.", ["org", "private", "public"]),
} as const;

const listMutationInput = {
  name: nonEmptyString("List name."),
  position: s.anyOf("List position. Use top, bottom, or a numeric position.", [
    s.stringEnum("Named list position.", ["top", "bottom"]),
    s.number("Numeric list position."),
  ]),
} as const;

const successOutputSchema = s.object("A successful Trello mutation response.", {
  success: s.boolean("Whether Trello accepted the mutation."),
});

const updateCardInputSchema = s.object(
  "Input parameters for updating a Trello card.",
  {
    cardId: trelloId("Trello card ID or short link."),
    ...cardMutationInput,
    listId: trelloId("Trello list ID to move the card into."),
    closed: s.boolean("Whether the card should be closed."),
    dueComplete: s.boolean("Whether the card due date should be marked complete."),
  },
  {
    optional: ["name", "description", "due", "position", "memberIds", "labelIds", "listId", "closed", "dueComplete"],
  },
);

export const trelloActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_member",
    description: "Get a Trello member, defaulting to the authenticated member.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for retrieving a Trello member.",
      {
        ...optionalMemberIdInput,
        fields: trelloFieldsInput,
      },
      {
        optional: ["memberId", "fields"],
      },
    ),
    outputSchema: s.object("The retrieved Trello member.", {
      member: trelloMemberSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_member_boards",
    description: "List Trello boards visible to a member.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for listing boards for a Trello member.",
      {
        ...optionalMemberIdInput,
        fields: trelloFieldsInput,
        filter: s.stringEnum("Board filter passed to Trello.", [
          "all",
          "closed",
          "members",
          "open",
          "organization",
          "public",
          "starred",
        ]),
      },
      {
        optional: ["memberId", "fields", "filter"],
      },
    ),
    outputSchema: s.object("Boards returned by Trello.", {
      boards: s.array("Trello boards.", trelloBoardSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_board",
    description: "Get a Trello board by ID.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for retrieving a Trello board.",
      {
        boardId: trelloId("Trello board ID."),
        ...boardFieldsInput,
      },
      {
        optional: ["fields"],
      },
    ),
    outputSchema: s.object("The retrieved Trello board.", {
      board: trelloBoardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_board",
    description: "Create a Trello board.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for creating a Trello board.", boardCreateInput, {
      optional: ["description", "defaultLists", "permissionLevel"],
    }),
    outputSchema: s.object("The created Trello board.", {
      board: trelloBoardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_board_lists",
    description: "List Trello lists on a board.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for listing Trello lists on a board.",
      {
        boardId: trelloId("Trello board ID."),
        filter: s.stringEnum("List filter passed to Trello.", ["all", "closed", "none", "open"]),
      },
      {
        optional: ["filter"],
      },
    ),
    outputSchema: s.object("Lists returned by Trello.", {
      lists: s.array("Trello lists.", trelloListSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_list",
    description: "Create a Trello list on a board.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object(
      "Input parameters for creating a Trello list.",
      {
        boardId: trelloId("Trello board ID that will own the list."),
        ...listMutationInput,
      },
      {
        optional: ["position"],
      },
    ),
    outputSchema: s.object("The created Trello list.", {
      list: trelloListSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_list",
    description: "Update a Trello list name or position.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object(
      "Input parameters for updating a Trello list.",
      {
        listId: trelloId("Trello list ID."),
        ...listMutationInput,
      },
      {
        optional: ["name", "position"],
      },
    ),
    outputSchema: s.object("The updated Trello list.", {
      list: trelloListSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "archive_list",
    description: "Archive a Trello list.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for archiving a Trello list.", {
      listId: trelloId("Trello list ID."),
    }),
    outputSchema: s.object("The archived Trello list.", {
      list: trelloListSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_board_cards",
    description: "List Trello cards on a board.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for listing Trello cards on a board.",
      {
        boardId: trelloId("Trello board ID."),
        filter: s.stringEnum("Card filter passed to Trello.", ["all", "closed", "none", "open", "visible"]),
        fields: trelloFieldsInput,
      },
      {
        optional: ["filter", "fields"],
      },
    ),
    outputSchema: s.object("Cards returned by Trello.", {
      cards: s.array("Trello cards.", trelloCardSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_board_members",
    description: "List Trello members on a board.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for listing Trello board members.",
      {
        boardId: trelloId("Trello board ID."),
        fields: trelloFieldsInput,
      },
      {
        optional: ["fields"],
      },
    ),
    outputSchema: s.object("Board members returned by Trello.", {
      members: s.array("Trello members.", trelloMemberSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_board_labels",
    description: "List Trello labels on a board.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object("Input parameters for listing Trello board labels.", {
      boardId: trelloId("Trello board ID."),
    }),
    outputSchema: s.object("Board labels returned by Trello.", {
      labels: s.array("Trello labels.", s.looseObject("A Trello label returned by the API.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_card",
    description: "Get a Trello card by ID or short link.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for retrieving a Trello card.",
      {
        cardId: trelloId("Trello card ID or short link."),
        fields: trelloFieldsInput,
      },
      {
        optional: ["fields"],
      },
    ),
    outputSchema: s.object("The retrieved Trello card.", {
      card: trelloCardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_card",
    description: "Create a Trello card in a list.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object(
      "Input parameters for creating a Trello card.",
      {
        listId: trelloId("Trello list ID that will contain the new card."),
        ...cardMutationInput,
      },
      {
        optional: ["description", "due", "position", "memberIds", "labelIds"],
      },
    ),
    outputSchema: s.object("The created Trello card.", {
      card: trelloCardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "move_card",
    description: "Move a Trello card to another list.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object(
      "Input parameters for moving a Trello card.",
      {
        cardId: trelloId("Trello card ID or short link."),
        listId: trelloId("Destination Trello list ID."),
        position: cardMutationInput.position,
      },
      {
        optional: ["position"],
      },
    ),
    outputSchema: s.object("The moved Trello card.", {
      card: trelloCardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "archive_card",
    description: "Archive a Trello card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for archiving a Trello card.", {
      cardId: trelloId("Trello card ID or short link."),
    }),
    outputSchema: s.object("The archived Trello card.", {
      card: trelloCardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_card",
    description: "Update a Trello card by ID or short link.",
    requiredScopes: trelloWriteScopes,
    inputSchema: updateCardInputSchema,
    outputSchema: s.object("The updated Trello card.", {
      card: trelloCardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_card_comment",
    description: "Add a comment action to a Trello card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for adding a Trello card comment.", {
      cardId: trelloId("Trello card ID or short link."),
      text: nonEmptyString("Comment text to add to the card."),
    }),
    outputSchema: s.object("The created Trello comment action.", {
      action: trelloActionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_card_comments",
    description: "List comment actions on a Trello card.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for listing Trello card comments.",
      {
        cardId: trelloId("Trello card ID or short link."),
        limit: s.integer("Maximum number of comment actions to return.", {
          minimum: 1,
          maximum: 1000,
        }),
      },
      {
        optional: ["limit"],
      },
    ),
    outputSchema: s.object("Comment actions returned by Trello.", {
      comments: s.array("Trello comment actions.", trelloActionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "add_card_member",
    description: "Assign a Trello member to a card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for assigning a Trello member to a card.", {
      cardId: trelloId("Trello card ID or short link."),
      memberId: trelloId("Trello member ID to assign."),
    }),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_card_member",
    description: "Remove a Trello member from a card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for removing a Trello member from a card.", {
      cardId: trelloId("Trello card ID or short link."),
      memberId: trelloId("Trello member ID to remove."),
    }),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_card_label",
    description: "Add a Trello label to a card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for adding a Trello label to a card.", {
      cardId: trelloId("Trello card ID or short link."),
      labelId: trelloId("Trello label ID to add."),
    }),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_card_label",
    description: "Remove a Trello label from a card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for removing a Trello label from a card.", {
      cardId: trelloId("Trello card ID or short link."),
      labelId: trelloId("Trello label ID to remove."),
    }),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_checklist",
    description: "Create a Trello checklist on a card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for creating a Trello checklist.", {
      cardId: trelloId("Trello card ID or short link."),
      name: nonEmptyString("Checklist name."),
    }),
    outputSchema: s.object("The created Trello checklist.", {
      checklist: trelloChecklistSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_card_checklists",
    description: "List Trello checklists on a card.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object("Input parameters for listing Trello card checklists.", {
      cardId: trelloId("Trello card ID or short link."),
    }),
    outputSchema: s.object("Checklists returned by Trello.", {
      checklists: s.array("Trello checklists.", trelloChecklistSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "add_checkitem",
    description: "Add a check item to a Trello checklist.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object(
      "Input parameters for adding a Trello checklist item.",
      {
        checklistId: trelloId("Trello checklist ID."),
        name: nonEmptyString("Check item name."),
        position: listMutationInput.position,
        checked: s.boolean("Whether the new check item should be created as complete."),
      },
      {
        optional: ["position", "checked"],
      },
    ),
    outputSchema: s.object("The created Trello check item.", {
      checkItem: trelloCheckItemSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_checkitem_state",
    description: "Update a Trello check item state on a card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object("Input parameters for updating a Trello check item state.", {
      cardId: trelloId("Trello card ID or short link."),
      checkItemId: trelloId("Trello check item ID."),
      state: s.stringEnum("New check item state.", ["complete", "incomplete"]),
    }),
    outputSchema: s.object("The Trello card returned after updating the check item.", {
      card: trelloCardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_card_attachment_url",
    description: "Attach an external URL to a Trello card.",
    requiredScopes: trelloWriteScopes,
    inputSchema: s.object(
      "Input parameters for attaching a URL to a Trello card.",
      {
        cardId: trelloId("Trello card ID or short link."),
        url: s.url("URL to attach to the card."),
        name: nonEmptyString("Attachment display name."),
      },
      {
        optional: ["name"],
      },
    ),
    outputSchema: s.object("The created Trello attachment.", {
      attachment: trelloAttachmentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search",
    description: "Search Trello cards, boards, members, and organizations.",
    requiredScopes: trelloReadScopes,
    inputSchema: s.object(
      "Input parameters for Trello search.",
      {
        query: nonEmptyString("Search query sent to Trello."),
        modelTypes: s.array(
          "Trello model types to search.",
          s.stringEnum("One Trello model type.", ["actions", "boards", "cards", "members", "organizations"]),
          {
            minItems: 1,
          },
        ),
        cardsLimit: s.integer("Maximum number of cards to return.", {
          minimum: 1,
          maximum: 1000,
        }),
        boardsLimit: s.integer("Maximum number of boards to return.", {
          minimum: 1,
          maximum: 1000,
        }),
        membersLimit: s.integer("Maximum number of members to return.", {
          minimum: 1,
          maximum: 1000,
        }),
      },
      {
        optional: ["modelTypes", "cardsLimit", "boardsLimit", "membersLimit"],
      },
    ),
    outputSchema: s.object("Search results returned by Trello.", {
      results: s.array("Search results returned by Trello.", s.looseObject("One Trello search result.")),
    }),
  }),
];
