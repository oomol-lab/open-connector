import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "businessmap";

const positiveInteger = (description: string) => s.positiveInteger(description);
const zeroOrOne = (description: string) => s.integer(description, { minimum: 0, maximum: 1 });
const integerList = (description: string) =>
  s.array(description, positiveInteger("One Businessmap numeric identifier."), { minItems: 1 });
const stringList = (description: string) =>
  s.array(description, s.nonEmptyString("One Businessmap field or filter value."), { minItems: 1 });

const rawObjectSchema = s.unknownObject("A raw Businessmap object returned by the API.");

const paginationSchema = s.looseObject("Businessmap pagination metadata.", {
  all_pages: s.integer("The total number of pages in the paginated result set."),
  current_page: s.integer("The current result page."),
  results_per_page: s.integer("The number of results per page."),
});

const listWorkspacesInputSchema = s.object(
  "Filters for listing Businessmap workspaces.",
  {
    workspace_ids: integerList("Workspace IDs to include."),
    type: s.integer("Workspace type. Businessmap uses 1 for Team Workspace and 2 for Management Workspace.", {
      minimum: 1,
      maximum: 2,
    }),
    is_archived: zeroOrOne("Set to 1 for archived workspaces or 0 for active workspaces."),
    if_workspace_manager: zeroOrOne("Set to 1 to return workspaces where the current user is a manager."),
    if_assigned_to_boards: zeroOrOne("Set to 1 to return workspaces where the current user is assigned."),
    board_filter_is_archived: zeroOrOne("Board archive filter used when expand includes boards."),
    board_filter_if_assigned: zeroOrOne("Board assignment filter used when expand includes boards."),
    fields: stringList("Workspace fields to include in the response."),
    expand: s.array("Workspace relationships to expand.", s.stringEnum(["boards"]), { minItems: 1 }),
  },
  {
    optional: [
      "workspace_ids",
      "type",
      "is_archived",
      "if_workspace_manager",
      "if_assigned_to_boards",
      "board_filter_is_archived",
      "board_filter_if_assigned",
      "fields",
      "expand",
    ],
  },
);

const listBoardsInputSchema = s.object(
  "Filters for listing Businessmap boards.",
  {
    board_ids: integerList("Board IDs to include."),
    workspace_ids: integerList("Workspace IDs whose boards should be returned."),
    is_archived: zeroOrOne("Set to 1 for archived boards or 0 for active boards."),
    if_assigned: zeroOrOne("Set to 1 to return boards assigned to the current user."),
    fields: stringList("Board fields to include in the response."),
    expand: s.array(
      "Board relationships to expand.",
      s.stringEnum(["workflows", "settings", "structure", "effective_cycle_time_column_ids", "data_fields"]),
      { minItems: 1 },
    ),
  },
  { optional: ["board_ids", "workspace_ids", "is_archived", "if_assigned", "fields", "expand"] },
);

const boardIdField = positiveInteger("The Businessmap board ID.");
const cardIdField = positiveInteger("The Businessmap card ID.");

const getBoardInputSchema = s.actionInput(
  {
    board_id: boardIdField,
  },
  ["board_id"],
  "Request for retrieving one Businessmap board.",
);

const createBoardInputSchema = s.actionInput(
  {
    workspace_id: positiveInteger("The workspace ID to which the board belongs."),
    name: s.string({ description: "The board name.", minLength: 1, maxLength: 100 }),
    description: s.string("The board description."),
    type: s.integer("The board type. Businessmap uses 1 for Kanban board and 2 for AI Canvas.", {
      minimum: 1,
      maximum: 2,
    }),
  },
  ["workspace_id", "name"],
  "Request for creating a Businessmap board.",
);

const updateBoardInputSchema = s.object(
  "Request for updating a Businessmap board.",
  {
    board_id: boardIdField,
    name: s.string({ description: "The updated board name.", minLength: 1, maxLength: 100 }),
    description: s.string("The updated board description."),
    is_archived: zeroOrOne("Set to 1 to archive the board or 0 to unarchive it."),
  },
  { required: ["board_id"], optional: ["name", "description", "is_archived"] },
);

const cardStateSchema = s.stringEnum("The Businessmap card state.", ["active", "archived", "discarded"]);

const listCardsInputSchema = s.object(
  "Filters for listing Businessmap cards.",
  {
    card_ids: integerList("Card IDs to include."),
    board_ids: integerList("Board IDs whose cards should be returned."),
    workflow_ids: integerList("Workflow IDs whose cards should be returned."),
    state: cardStateSchema,
    created_from: s.nonEmptyString("Earliest card creation date-time in Businessmap format."),
    created_from_date: s.date("Earliest card creation date in YYYY-MM-DD format."),
    created_to: s.nonEmptyString("Latest card creation date-time in Businessmap format."),
    created_to_date: s.date("Latest card creation date in YYYY-MM-DD format."),
    last_modified_from: s.nonEmptyString("Earliest card modification date-time in Businessmap format."),
    last_modified_from_date: s.date("Earliest card modification date in YYYY-MM-DD format."),
    last_modified_to: s.nonEmptyString("Latest card modification date-time in Businessmap format."),
    last_modified_to_date: s.date("Latest card modification date in YYYY-MM-DD format."),
    is_blocked: zeroOrOne("Set to 1 to return blocked cards or 0 for unblocked cards."),
    custom_ids: stringList("Custom card IDs to include."),
    owner_user_ids: integerList("Owner user IDs to include."),
    type_ids: integerList("Card type IDs to include."),
    priorities: integerList("Businessmap card priority values to include."),
    fields: stringList("Card fields to include in the response."),
    expand: stringList("Card relationships to expand in the response."),
    page: positiveInteger("The Businessmap results page to request."),
    per_page: positiveInteger("The number of cards to return per page."),
  },
  {
    optional: [
      "card_ids",
      "board_ids",
      "workflow_ids",
      "state",
      "created_from",
      "created_from_date",
      "created_to",
      "created_to_date",
      "last_modified_from",
      "last_modified_from_date",
      "last_modified_to",
      "last_modified_to_date",
      "is_blocked",
      "custom_ids",
      "owner_user_ids",
      "type_ids",
      "priorities",
      "fields",
      "expand",
      "page",
      "per_page",
    ],
  },
);

const getCardInputSchema = s.actionInput(
  {
    card_id: cardIdField,
  },
  ["card_id"],
  "Request for retrieving one Businessmap card.",
);

const cardWriteFields = {
  column_id: positiveInteger("The column ID where the card should be placed."),
  lane_id: positiveInteger("The lane ID where the card should be placed."),
  position: s.integer("The zero-based card position in the column.", { minimum: 0 }),
  track: s.integer("The timeline workflow track number.", { minimum: 0 }),
  planned_start_date: s.date("The planned start date in YYYY-MM-DD format."),
  planned_end_date: s.date("The planned end date in YYYY-MM-DD format."),
  actual_start_time: s.dateTime("The actual start time as an ISO 8601 timestamp."),
  actual_end_time: s.dateTime("The actual end time as an ISO 8601 timestamp."),
  title: s.nonEmptyString("The card title."),
  description: s.string("The card description."),
  custom_id: s.nullable(s.nonEmptyString("The custom ID assigned to the card.")),
  owner_user_id: s.nullable(positiveInteger("The user ID assigned as owner of the card.")),
  type_id: s.nullable(positiveInteger("The card type ID assigned to the card.")),
  size: s.nullable(s.number("The size assigned to the card.")),
  priority: s.nullable(s.integer("The Businessmap priority value.", { minimum: 1, maximum: 250 })),
  color: s.nonEmptyString("The card color in hexadecimal format."),
  deadline: s.nullable(s.string("The card deadline as accepted by Businessmap.")),
  reference: s.nonEmptyString("A caller-provided reference used to find the created card."),
  tag_ids_to_add: integerList("Tag IDs to add to the card."),
  tag_ids_to_remove: integerList("Tag IDs to remove from the card."),
  milestone_ids_to_add: integerList("Milestone IDs to add to the card."),
  milestone_ids_to_remove: integerList("Milestone IDs to remove from the card."),
  co_owner_ids_to_add: integerList("User IDs to add as co-owners."),
  co_owner_ids_to_remove: integerList("User IDs to remove as co-owners."),
  watcher_ids_to_add: integerList("User IDs to add as watchers."),
  watcher_ids_to_remove: integerList("User IDs to remove as watchers."),
  watch: zeroOrOne("Set to 1 for the current user to watch the card."),
  is_archived: zeroOrOne("Set to 1 to archive the card."),
  is_discarded: zeroOrOne("Set to 1 to discard the card."),
  exceeding_reason: s.nullable(s.string("Reason for exceeding a Businessmap limit during the write.")),
  reporter_user_id: s.nullable(positiveInteger("Reporter user ID when creating or updating for someone else.")),
  reporter_email: s.nullable(s.email("Reporter email when creating or updating for someone else.")),
};

const optionalCardWriteFields = [
  "position",
  "track",
  "planned_start_date",
  "planned_end_date",
  "actual_start_time",
  "actual_end_time",
  "description",
  "custom_id",
  "owner_user_id",
  "type_id",
  "size",
  "priority",
  "color",
  "deadline",
  "reference",
  "tag_ids_to_add",
  "tag_ids_to_remove",
  "milestone_ids_to_add",
  "milestone_ids_to_remove",
  "co_owner_ids_to_add",
  "co_owner_ids_to_remove",
  "watcher_ids_to_add",
  "watcher_ids_to_remove",
  "watch",
  "is_archived",
  "is_discarded",
  "exceeding_reason",
  "reporter_user_id",
  "reporter_email",
];

const createCardInputSchema = s.object("Request for creating a Businessmap card.", cardWriteFields, {
  required: ["column_id", "lane_id", "title"],
  optional: optionalCardWriteFields,
});

const updateCardInputSchema = s.object(
  "Request for updating a Businessmap card.",
  {
    card_id: cardIdField,
    ...cardWriteFields,
  },
  {
    required: ["card_id"],
    optional: ["column_id", "lane_id", "title", ...optionalCardWriteFields],
  },
);

const deleteCardInputSchema = s.object(
  "Request for permanently deleting one Businessmap card.",
  {
    card_id: cardIdField,
    exceeding_reason: s.nullable(s.string("Reason for exceeding a Businessmap limit during deletion.")),
  },
  { required: ["card_id"], optional: ["exceeding_reason"] },
);

export const businessmapActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Businessmap workspaces visible to the connected API key.",
    inputSchema: listWorkspacesInputSchema,
    outputSchema: s.actionOutput(
      {
        workspaces: s.array("Workspaces returned by Businessmap.", rawObjectSchema),
      },
      "Businessmap workspace list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_boards",
    description: "List Businessmap boards visible to the connected API key.",
    inputSchema: listBoardsInputSchema,
    outputSchema: s.actionOutput(
      {
        boards: s.array("Boards returned by Businessmap.", rawObjectSchema),
      },
      "Businessmap board list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_board",
    description: "Retrieve a Businessmap board by ID.",
    inputSchema: getBoardInputSchema,
    outputSchema: s.actionOutput({ board: rawObjectSchema }, "Businessmap board response."),
  }),
  defineProviderAction(service, {
    name: "create_board",
    description: "Create a Businessmap board in a workspace.",
    inputSchema: createBoardInputSchema,
    outputSchema: s.actionOutput({ board: rawObjectSchema }, "Businessmap board response."),
  }),
  defineProviderAction(service, {
    name: "update_board",
    description: "Update a Businessmap board name, description, or archive state.",
    inputSchema: updateBoardInputSchema,
    outputSchema: s.actionOutput({ board: rawObjectSchema }, "Businessmap board response."),
  }),
  defineProviderAction(service, {
    name: "list_cards",
    description: "List Businessmap cards with common board, workflow, state, and date filters.",
    inputSchema: listCardsInputSchema,
    outputSchema: s.object(
      "Businessmap card list response.",
      {
        cards: s.array("Cards returned by Businessmap.", rawObjectSchema),
        pagination: s.nullable(paginationSchema),
      },
      { required: ["cards"], optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_card",
    description: "Retrieve a Businessmap card by ID.",
    inputSchema: getCardInputSchema,
    outputSchema: s.actionOutput({ card: rawObjectSchema }, "Businessmap card response."),
  }),
  defineProviderAction(service, {
    name: "create_card",
    description: "Create a Businessmap card using JSON card fields.",
    inputSchema: createCardInputSchema,
    outputSchema: s.actionOutput({ card: rawObjectSchema }, "Businessmap card response."),
  }),
  defineProviderAction(service, {
    name: "update_card",
    description: "Update a Businessmap card using JSON card fields.",
    inputSchema: updateCardInputSchema,
    outputSchema: s.actionOutput({ card: rawObjectSchema }, "Businessmap card response."),
  }),
  defineProviderAction(service, {
    name: "delete_card",
    description: "Permanently delete a Businessmap card.",
    inputSchema: deleteCardInputSchema,
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether Businessmap accepted the card delete request."),
      },
      "Businessmap card delete response.",
    ),
  }),
];
