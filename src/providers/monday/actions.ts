import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "monday";

interface MondayActionSource {
  name: string;
  description: string;
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const idSchema = s.anyOf("A Monday identifier.", [
  s.nonEmptyString("A Monday identifier represented as a string."),
  s.positiveInteger("A Monday identifier represented as an integer."),
]);
const idArraySchema = s.array("A non-empty list of Monday identifiers.", idSchema, { minItems: 1 });
const stringArraySchema = s.stringArray("A non-empty list of strings.", { minItems: 1 });
const emptyInputSchema = s.object({}, { description: "The input payload for this action." });
const looseObjectSchema = s.looseObject("An arbitrary JSON object returned by Monday.");
const boardStateSchema = s.stringEnum("The board state filter.", ["active", "all", "archived", "deleted"]);
const boardKindSchema = s.stringEnum("The board visibility type.", ["private", "public", "share"]);
const workspaceStateSchema = s.stringEnum("The workspace state filter.", ["active", "all", "archived", "deleted"]);
const workspaceKindSchema = s.stringEnum("The workspace visibility type.", ["open", "closed"]);
const positionRelativeSchema = s.stringEnum("Where to place the item relative to another item.", [
  "before_at",
  "after_at",
]);

const userSchema = s.looseObject("A Monday user summary.", {
  id: s.string("The Monday user identifier."),
  name: s.string("The Monday user name."),
  email: s.string("The Monday user email address."),
});
const boardSchema = s.looseObject("A Monday board summary.", {
  id: s.string("The Monday board identifier."),
  name: s.string("The Monday board name."),
});
const itemSchema = s.looseObject("A Monday item summary.", {
  id: s.string("The Monday item identifier."),
  name: s.string("The Monday item name."),
});
const groupSchema = s.looseObject("A Monday group summary.", {
  id: s.string("The Monday group identifier."),
  title: s.string("The Monday group title."),
});
const columnSchema = s.looseObject("A Monday column summary.", {
  id: s.string("The Monday column identifier."),
  title: s.string("The Monday column title."),
});
const teamSchema = s.looseObject("A Monday team summary.", {
  id: s.string("The Monday team identifier."),
  name: s.string("The Monday team name."),
});
const updateSchema = s.looseObject("A Monday update summary.");
const replySchema = s.looseObject("A Monday reply summary.");
const docSchema = s.looseObject("A Monday document summary.");
const assetSchema = s.looseObject("A Monday asset summary.");
const dashboardSchema = s.looseObject("A Monday dashboard summary.");
const formSchema = s.looseObject("A Monday form response.");
const departmentSchema = s.looseObject("A Monday department.");

function updateDateFilterSchema(description: string): JsonSchema {
  return s.anyOf(description, [
    s.date("A calendar date in YYYY-MM-DD format."),
    s.stringPattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$", {
      description: "A date and time in YYYY-MM-DDTHH:mm format.",
    }),
  ]);
}

function input(description: string, properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.object(properties, { required, description });
}

function output(
  description: string,
  properties: Record<string, JsonSchema>,
  required = Object.keys(properties),
): JsonSchema {
  return s.object(properties, { required, description });
}

const actions: MondayActionSource[] = [
  {
    name: "get_current_user",
    description: "Retrieve the Monday user associated with the current personal API token.",
    providerPermissions: ["me:read", "account:read"],
    inputSchema: emptyInputSchema,
    outputSchema: output("The output payload for retrieving the current Monday user.", { user: userSchema }),
  },
  {
    name: "list_workspaces",
    description: "List Monday workspaces with official filters and pagination.",
    providerPermissions: ["workspaces:read"],
    inputSchema: input("The input payload for listing Monday workspaces.", {
      ids: idArraySchema,
      kind: workspaceKindSchema,
      limit: s.positiveInteger("The number of workspaces to return."),
      page: s.positiveInteger("The 1-based page number of workspaces to return."),
      state: workspaceStateSchema,
      order_by: s.literal("created_at"),
    }),
    outputSchema: output("The output payload for listing Monday workspaces.", {
      workspaces: s.array("The Monday workspaces returned by the query.", looseObjectSchema),
    }),
  },
  {
    name: "list_boards",
    description: "List Monday boards with official pagination and board-level filters.",
    providerPermissions: ["boards:read"],
    inputSchema: input("The input payload for listing Monday boards.", {
      ids: idArraySchema,
      limit: s.positiveInteger("The number of boards to return."),
      page: s.positiveInteger("The 1-based page number of boards to return."),
      state: boardStateSchema,
      board_kind: boardKindSchema,
      workspace_ids: idArraySchema,
    }),
    outputSchema: output("The output payload for listing Monday boards.", {
      boards: s.array("The Monday boards returned by the query.", boardSchema),
    }),
  },
  {
    name: "list_groups",
    description: "List the groups for a specific Monday board.",
    providerPermissions: ["boards:read"],
    inputSchema: input(
      "The input payload for listing board groups.",
      {
        board_id: idSchema,
        group_ids: stringArraySchema,
      },
      ["board_id"],
    ),
    outputSchema: output("The output payload for listing board groups.", {
      groups: s.array("The Monday groups returned by the query.", groupSchema),
    }),
  },
  {
    name: "list_board_columns",
    description: "List the columns for a specific Monday board.",
    providerPermissions: ["boards:read"],
    inputSchema: input("The input payload for listing board columns.", { board_id: idSchema }, ["board_id"]),
    outputSchema: output("The output payload for listing board columns.", {
      columns: s.array("The Monday columns returned by the query.", columnSchema),
    }),
  },
  {
    name: "list_users",
    description: "List Monday users with official root-level filters and pagination.",
    providerPermissions: ["users:read", "account:read"],
    inputSchema: input("The input payload for listing Monday users.", {
      ids: idArraySchema,
      emails: stringArraySchema,
      name: s.nonEmptyString("Name filter."),
      limit: s.positiveInteger("The number of users to return."),
      page: s.positiveInteger("The 1-based page number of users to return."),
    }),
    outputSchema: output("The output payload for listing Monday users.", {
      users: s.array("The Monday users returned by the query.", userSchema),
    }),
  },
  {
    name: "list_teams",
    description: "List Monday teams with official filters and pagination.",
    providerPermissions: ["teams:read"],
    inputSchema: input("The input payload for listing Monday teams.", {
      ids: idArraySchema,
      limit: s.positiveInteger("The number of teams to return."),
      page: s.positiveInteger("The 1-based page number of teams to return."),
    }),
    outputSchema: output("The output payload for listing Monday teams.", {
      teams: s.array("The Monday teams returned by the query.", teamSchema),
    }),
  },
  {
    name: "list_team_members",
    description: "List the members of a specific Monday team.",
    providerPermissions: ["teams:read"],
    inputSchema: input("The input payload for listing Monday team members.", { team_id: idSchema }, ["team_id"]),
    outputSchema: output("The output payload for listing Monday team members.", {
      users: s.array("The Monday users returned by the query.", userSchema),
    }),
  },
  {
    name: "create_group",
    description: "Create a Monday group on an existing board.",
    providerPermissions: ["boards:write"],
    inputSchema: input(
      "The input payload for creating a Monday group.",
      {
        board_id: idSchema,
        group_name: s.nonEmptyString("The group name."),
      },
      ["board_id", "group_name"],
    ),
    outputSchema: output("The output payload for creating a Monday group.", { group: groupSchema }),
  },
  {
    name: "update_group",
    description: "Update an existing Monday group attribute.",
    providerPermissions: ["boards:write"],
    inputSchema: input(
      "The input payload for updating a Monday group.",
      {
        board_id: idSchema,
        group_id: s.nonEmptyString("The group identifier."),
        group_attribute: s.stringEnum("The group attribute to update.", [
          "color",
          "position",
          "relative_position_after",
          "relative_position_before",
          "title",
        ]),
        new_value: s.nonEmptyString("The new value."),
      },
      ["board_id", "group_id", "group_attribute", "new_value"],
    ),
    outputSchema: output("The output payload for updating a Monday group.", { group: groupSchema }),
  },
  {
    name: "delete_group",
    description: "Delete a Monday group from an existing board.",
    providerPermissions: ["boards:write"],
    inputSchema: input(
      "The input payload for deleting a Monday group.",
      {
        board_id: idSchema,
        group_id: s.nonEmptyString("The group identifier."),
      },
      ["board_id", "group_id"],
    ),
    outputSchema: output("The output payload for deleting a Monday group.", {
      deletedGroupId: s.string("The deleted group identifier."),
    }),
  },
  {
    name: "create_board",
    description: "Create a Monday board with the official create_board mutation.",
    providerPermissions: ["boards:write"],
    inputSchema: input(
      "The input payload for creating a Monday board.",
      {
        board_name: s.nonEmptyString("The board name."),
        board_kind: boardKindSchema,
        workspace_id: idSchema,
        empty: s.boolean("Whether to create an empty board."),
      },
      ["board_name", "board_kind"],
    ),
    outputSchema: output("The output payload for creating a Monday board.", { board: boardSchema }),
  },
  {
    name: "update_board",
    description: "Update a Monday board attribute with the official update_board mutation.",
    providerPermissions: ["boards:write"],
    inputSchema: input(
      "The input payload for updating a Monday board.",
      {
        board_id: idSchema,
        board_attribute: s.stringEnum("The board attribute to update.", [
          "communication",
          "description",
          "item_nickname",
          "name",
        ]),
        new_value: s.nonEmptyString("The new value."),
      },
      ["board_id", "board_attribute", "new_value"],
    ),
    outputSchema: output("The output payload for updating a Monday board.", { board: boardSchema }),
  },
  {
    name: "archive_board",
    description: "Archive a Monday board.",
    providerPermissions: ["boards:write"],
    inputSchema: input("The input payload for archiving a Monday board.", { board_id: idSchema }, ["board_id"]),
    outputSchema: output("The output payload for archiving a Monday board.", {
      archivedBoardId: s.string("The archived board identifier."),
    }),
  },
  {
    name: "delete_board",
    description: "Delete a Monday board.",
    providerPermissions: ["boards:write"],
    inputSchema: input("The input payload for deleting a Monday board.", { board_id: idSchema }, ["board_id"]),
    outputSchema: output("The output payload for deleting a Monday board.", {
      deletedBoardId: s.string("The deleted board identifier."),
    }),
  },
  {
    name: "create_column",
    description: "Create a Monday column on an existing board.",
    providerPermissions: ["boards:write"],
    inputSchema: input(
      "The input payload for creating a Monday column.",
      {
        board_id: idSchema,
        title: s.nonEmptyString("The column title."),
        column_type: s.nonEmptyString("The Monday column type."),
        id: s.nonEmptyString("Optional custom column identifier."),
        description: s.string("Column description."),
      },
      ["board_id", "title", "column_type"],
    ),
    outputSchema: output("The output payload for creating a Monday column.", { column: columnSchema }),
  },
  {
    name: "update_column",
    description: "Update a Monday column with the official update_column mutation.",
    providerPermissions: ["boards:write"],
    inputSchema: input(
      "The input payload for updating a Monday column.",
      {
        board_id: idSchema,
        id: s.nonEmptyString("The column identifier."),
        revision: s.nonEmptyString("The column revision."),
        column_type: s.nonEmptyString("The column type."),
        title: s.string("Updated column title."),
        description: s.string("Updated column description."),
        width: s.positiveInteger("Updated column width."),
      },
      ["board_id", "id", "revision", "column_type"],
    ),
    outputSchema: output("The output payload for updating a Monday column.", { column: columnSchema }),
  },
  {
    name: "delete_column",
    description: "Delete a Monday column from an existing board.",
    providerPermissions: ["boards:write"],
    inputSchema: input(
      "The input payload for deleting a Monday column.",
      {
        board_id: idSchema,
        column_id: s.nonEmptyString("The column identifier."),
      },
      ["board_id", "column_id"],
    ),
    outputSchema: output("The output payload for deleting a Monday column.", {
      deletedColumnId: s.string("The deleted column identifier."),
    }),
  },
];

actions.push(
  ...[
    action(
      "get_items",
      "Retrieve specific Monday items by ID.",
      ["boards:read"],
      input("The input payload for retrieving Monday items.", { ids: idArraySchema }, ["ids"]),
      { items: s.array("The Monday items returned by the query.", itemSchema) },
    ),
    action(
      "get_items_page",
      "Retrieve a filtered page of Monday board items using the official items_page query.",
      ["boards:read"],
      input(
        "The input payload for querying a Monday items page.",
        { board_id: idSchema, limit: s.positiveInteger("Page size."), query_params: looseObjectSchema },
        ["board_id"],
      ),
      {
        cursor: s.nullableString("The next page cursor."),
        items: s.array("The Monday items returned by the page.", itemSchema),
      },
    ),
    action(
      "get_next_items_page",
      "Retrieve the next page of Monday items from an items_page cursor.",
      ["boards:read"],
      input(
        "The input payload for retrieving the next items page.",
        { cursor: s.nonEmptyString("The cursor returned by a previous page."), limit: s.positiveInteger("Page size.") },
        ["cursor"],
      ),
      {
        cursor: s.nullableString("The next page cursor."),
        items: s.array("The Monday items returned by the page.", itemSchema),
      },
    ),
    action(
      "find_items_by_column_values",
      "Find Monday items on a board by matching explicit column values.",
      ["boards:read"],
      input(
        "The input payload for finding Monday items by column values.",
        {
          board_id: idSchema,
          column_id: s.nonEmptyString("The column identifier."),
          column_values: stringArraySchema,
          limit: s.positiveInteger("Page size."),
        },
        ["board_id", "column_id", "column_values"],
      ),
      { cursor: s.nullableString("The next page cursor."), items: s.array("The matching Monday items.", itemSchema) },
    ),
    action(
      "list_subitems_by_parent",
      "List Monday subitems for one or more parent items.",
      ["boards:read"],
      input("The input payload for listing Monday subitems.", { parent_item_ids: idArraySchema }, ["parent_item_ids"]),
      { items: s.array("The parent items with nested subitems.", itemSchema) },
    ),
    action(
      "create_item",
      "Create a Monday item on a board, optionally setting column values and position.",
      ["boards:write"],
      input(
        "The input payload for creating a Monday item.",
        {
          board_id: idSchema,
          group_id: s.nonEmptyString("The target group identifier."),
          item_name: s.nonEmptyString("The item name."),
          column_values: looseObjectSchema,
          create_labels_if_missing: s.boolean("Whether to create missing labels."),
          relative_to: idSchema,
          position_relative_method: positionRelativeSchema,
        },
        ["board_id", "item_name"],
      ),
      { item: itemSchema },
    ),
    action(
      "create_subitem",
      "Create a Monday subitem under an existing parent item.",
      ["boards:write"],
      input(
        "The input payload for creating a Monday subitem.",
        {
          parent_item_id: idSchema,
          item_name: s.nonEmptyString("The subitem name."),
          column_values: looseObjectSchema,
          create_labels_if_missing: s.boolean("Whether to create missing labels."),
        },
        ["parent_item_id", "item_name"],
      ),
      { item: itemSchema },
    ),
    action(
      "set_item_description_content",
      "Replace a Monday item description using markdown content.",
      ["boards:write"],
      input(
        "The input payload for setting item description content.",
        { item_id: idSchema, markdown: s.string("The markdown content.") },
        ["item_id", "markdown"],
      ),
      {
        success: s.boolean("Whether Monday accepted the markdown content."),
        error: s.nullableString("Provider error text."),
        blockIds: stringArraySchema,
      },
    ),
    action(
      "change_simple_column_value",
      "Change a Monday column value using the official simple string mutation.",
      ["boards:write"],
      input(
        "The input payload for changing a simple Monday column value.",
        {
          board_id: idSchema,
          item_id: idSchema,
          column_id: s.nonEmptyString("The column identifier."),
          value: s.string("The simple column value."),
          create_labels_if_missing: s.boolean("Whether to create missing labels."),
        },
        ["board_id", "item_id", "column_id", "value"],
      ),
      { item: itemSchema },
    ),
    action(
      "change_multiple_column_values",
      "Change multiple Monday column values in one mutation using the official JSON payload shape.",
      ["boards:write"],
      input(
        "The input payload for changing multiple Monday column values.",
        {
          board_id: idSchema,
          item_id: idSchema,
          column_values: looseObjectSchema,
          create_labels_if_missing: s.boolean("Whether to create missing labels."),
        },
        ["board_id", "item_id", "column_values"],
      ),
      { item: itemSchema },
    ),
    action(
      "move_item_to_group",
      "Move a Monday item to another group on the same board.",
      ["boards:write"],
      input(
        "The input payload for moving a Monday item to another group.",
        { item_id: idSchema, group_id: s.nonEmptyString("The target group identifier.") },
        ["item_id", "group_id"],
      ),
      { item: itemSchema },
    ),
    action(
      "move_item_to_board",
      "Move a Monday item to another board and target group.",
      ["boards:write"],
      input(
        "The input payload for moving a Monday item to another board.",
        {
          item_id: idSchema,
          board_id: idSchema,
          group_id: idSchema,
          columns_mapping: s.array("Column mappings.", looseObjectSchema),
          subitems_columns_mapping: s.array("Subitem column mappings.", looseObjectSchema),
        },
        ["item_id", "board_id", "group_id"],
      ),
      { item: itemSchema },
    ),
    action(
      "change_item_position",
      "Change a Monday item's position on the same board.",
      ["boards:write"],
      input(
        "The input payload for changing a Monday item position.",
        {
          item_id: idSchema,
          group_id: idSchema,
          group_top: s.boolean("Whether to move to the top of the group."),
          relative_to: idSchema,
          position_relative_method: positionRelativeSchema,
        },
        ["item_id"],
      ),
      { item: itemSchema },
    ),
    action(
      "duplicate_item",
      "Duplicate a Monday item.",
      ["boards:write"],
      input(
        "The input payload for duplicating a Monday item.",
        { board_id: idSchema, item_id: idSchema, with_updates: s.boolean("Whether to duplicate updates.") },
        ["board_id", "item_id"],
      ),
      { item: itemSchema },
    ),
    action(
      "archive_item",
      "Archive a Monday item.",
      ["boards:write"],
      input("The input payload for archiving a Monday item.", { item_id: idSchema }, ["item_id"]),
      { archivedItemId: s.string("The archived item identifier.") },
    ),
    action(
      "delete_item",
      "Delete a Monday item.",
      ["boards:write"],
      input("The input payload for deleting a Monday item.", { item_id: idSchema }, ["item_id"]),
      { deletedItemId: s.string("The deleted item identifier.") },
    ),
    action(
      "list_updates",
      "List Monday updates with optional date filtering.",
      ["updates:read"],
      input("The input payload for listing Monday updates.", {
        limit: s.positiveInteger("Page size, up to 100 updates.", { maximum: 100 }),
        page: s.positiveInteger("Page number."),
        since: updateDateFilterSchema("Only updates created on or after this date. Requires until."),
        until: updateDateFilterSchema("Only updates created on or before this date. Requires since."),
      }),
      { updates: s.array("The Monday updates returned by the query.", updateSchema) },
    ),
    action(
      "list_update_replies",
      "List Monday replies for updates on one or more boards.",
      ["updates:read"],
      input(
        "The input payload for listing Monday update replies.",
        {
          board_ids: idArraySchema,
          limit: s.positiveInteger("Page size, up to 100 replies.", { maximum: 100 }),
          page: s.positiveInteger("Page number."),
        },
        ["board_ids"],
      ),
      { replies: s.array("The Monday replies returned by the query.", replySchema) },
    ),
    action(
      "create_update",
      "Create a Monday update on an item or as a reply to an existing update.",
      ["updates:write"],
      input(
        "The input payload for creating a Monday update.",
        { item_id: idSchema, parent_id: idSchema, body: s.nonEmptyString("The update body.") },
        ["body"],
      ),
      { update: updateSchema },
    ),
    action(
      "edit_update",
      "Edit an existing Monday update.",
      ["updates:write"],
      input(
        "The input payload for editing a Monday update.",
        { update_id: idSchema, body: s.nonEmptyString("The update body.") },
        ["update_id", "body"],
      ),
      { update: updateSchema },
    ),
    action(
      "delete_update",
      "Delete an existing Monday update.",
      ["updates:write"],
      input("The input payload for deleting a Monday update.", { update_id: idSchema }, ["update_id"]),
      { deletedUpdateId: s.string("The deleted update identifier.") },
    ),
    action(
      "list_docs",
      "List Monday docs by document, object, or workspace identifiers.",
      ["docs:read"],
      input("The input payload for listing Monday docs.", {
        ids: idArraySchema,
        object_ids: idArraySchema,
        workspace_ids: idArraySchema,
        limit: s.positiveInteger("Page size."),
        page: s.positiveInteger("Page number."),
        order_by: s.stringEnum("Document ordering.", ["created_at", "used_at"]),
      }),
      { docs: s.array("The Monday docs returned by the query.", docSchema) },
    ),
    action(
      "create_doc",
      "Create a Monday doc in a workspace or document column location.",
      ["docs:write"],
      input(
        "The input payload for creating a Monday doc.",
        { location: looseObjectSchema, name: s.nonEmptyString("The document name.") },
        ["location", "name"],
      ),
      { doc: docSchema },
    ),
    action(
      "update_doc_name",
      "Update the name of an existing Monday doc.",
      ["docs:write"],
      input(
        "The input payload for updating a Monday doc name.",
        { doc_id: idSchema, name: s.nonEmptyString("The new document name.") },
        ["doc_id", "name"],
      ),
      { name: s.string("The updated document name.") },
    ),
    action(
      "delete_doc",
      "Delete an existing Monday doc.",
      ["docs:write"],
      input("The input payload for deleting a Monday doc.", { doc_id: idSchema }, ["doc_id"]),
      { deletedDocId: s.string("The deleted doc identifier."), success: s.boolean("Whether deletion succeeded.") },
    ),
    action(
      "list_assets",
      "Retrieve one or more Monday assets by asset ID.",
      ["assets:read"],
      input("The input payload for listing Monday assets.", { ids: idArraySchema }, ["ids"]),
      { assets: s.array("The Monday assets returned by the query.", assetSchema) },
    ),
  ],
);

actions.push(
  ...[
    action(
      "get_board_memberships",
      "Retrieve Monday board user and team memberships.",
      ["boards:read"],
      input(
        "The input payload for retrieving Monday board memberships.",
        { board_id: idSchema, limit: s.positiveInteger("Page size."), page: s.positiveInteger("Page number.") },
        ["board_id"],
      ),
      {
        board: boardSchema,
        owners: s.array("Board owners.", userSchema),
        subscribers: s.array("Board subscribers.", userSchema),
        teamOwners: s.array("Team owners.", teamSchema),
        teamSubscribers: s.array("Team subscribers.", teamSchema),
      },
    ),
    action(
      "add_users_to_board",
      "Add users to a Monday board.",
      ["boards:write"],
      input(
        "The input payload for adding users to a Monday board.",
        {
          board_id: idSchema,
          kind: s.stringEnum("Membership role.", ["owner", "subscriber"]),
          user_ids: idArraySchema,
        },
        ["board_id", "user_ids"],
      ),
      { users: s.array("The users returned by Monday.", userSchema) },
    ),
    action(
      "delete_subscribers_from_board",
      "Remove user subscribers from a Monday board.",
      ["boards:write"],
      input(
        "The input payload for removing users from a Monday board.",
        { board_id: idSchema, user_ids: idArraySchema },
        ["board_id", "user_ids"],
      ),
      { users: s.array("The users removed from the board.", userSchema) },
    ),
    action(
      "add_teams_to_board",
      "Add teams to a Monday board.",
      ["boards:write"],
      input(
        "The input payload for adding teams to a Monday board.",
        {
          board_id: idSchema,
          kind: s.stringEnum("Membership role.", ["owner", "subscriber"]),
          team_ids: idArraySchema,
        },
        ["board_id", "team_ids"],
      ),
      { teams: s.array("The teams returned by Monday.", teamSchema) },
    ),
    action(
      "delete_teams_from_board",
      "Remove team subscribers from a Monday board.",
      ["boards:write"],
      input(
        "The input payload for removing teams from a Monday board.",
        { board_id: idSchema, team_ids: idArraySchema },
        ["board_id", "team_ids"],
      ),
      { teams: s.array("The teams removed from the board.", teamSchema) },
    ),
    action(
      "create_dashboard",
      "Create a Monday dashboard.",
      ["boards:write"],
      input(
        "The input payload for creating a Monday dashboard.",
        {
          name: s.nonEmptyString("The dashboard title."),
          workspace_id: idSchema,
          board_ids: idArraySchema,
          kind: s.stringEnum("Dashboard visibility.", ["PUBLIC", "PRIVATE"]),
          board_folder_id: idSchema,
        },
        ["name", "workspace_id", "board_ids"],
      ),
      { dashboard: dashboardSchema },
    ),
    action(
      "update_dashboard",
      "Update a Monday dashboard.",
      ["boards:write"],
      input(
        "The input payload for updating a Monday dashboard.",
        {
          id: idSchema,
          name: s.nonEmptyString("The dashboard title."),
          workspace_id: idSchema,
          kind: s.stringEnum("Dashboard visibility.", ["PUBLIC", "PRIVATE"]),
          board_folder_id: idSchema,
        },
        ["id"],
      ),
      { dashboard: dashboardSchema },
    ),
    action(
      "delete_dashboard",
      "Delete a Monday dashboard.",
      ["boards:write"],
      input("The input payload for deleting a Monday dashboard.", { id: idSchema }, ["id"]),
      {
        deletedDashboardId: s.string("The deleted dashboard identifier."),
        success: s.boolean("Whether deletion succeeded."),
      },
    ),
    action(
      "list_activity_logs",
      "List Monday board activity logs.",
      ["boards:read"],
      input(
        "The input payload for listing board activity logs.",
        {
          board_id: idSchema,
          from: s.dateTime("Start timestamp."),
          to: s.dateTime("End timestamp."),
          limit: s.positiveInteger("Page size."),
          page: s.positiveInteger("Page number."),
        },
        ["board_id"],
      ),
      { activityLogs: s.array("The board activity logs.", looseObjectSchema) },
    ),
    action(
      "list_audit_logs",
      "List Monday audit logs.",
      ["manage_account_security"],
      input("The input payload for listing Monday audit logs.", {
        from: s.dateTime("Start timestamp."),
        to: s.dateTime("End timestamp."),
        limit: s.positiveInteger("Page size."),
        page: s.positiveInteger("Page number."),
      }),
      { auditLogs: s.array("The audit logs.", looseObjectSchema), pagination: looseObjectSchema },
    ),
    action(
      "get_form",
      "Retrieve a Monday Workform by its unique form token.",
      ["boards:read"],
      input(
        "The input payload for retrieving a Monday form.",
        { formToken: s.nonEmptyString("The unique form token.") },
        ["formToken"],
      ),
      { form: formSchema },
    ),
    action(
      "create_form",
      "Create a Monday Workform and its destination responses board.",
      ["forms:write", "boards:write", "workspaces:write"],
      input(
        "The input payload for creating a Monday form.",
        {
          destination_workspace_id: idSchema,
          destination_folder_id: idSchema,
          destination_folder_name: s.nonEmptyString("Destination folder name."),
          board_kind: boardKindSchema,
          destination_name: s.nonEmptyString("Destination board name."),
          board_owner_ids: idArraySchema,
          board_owner_team_ids: idArraySchema,
          board_subscriber_ids: idArraySchema,
          board_subscriber_teams_ids: idArraySchema,
        },
        ["destination_workspace_id"],
      ),
      { form: formSchema },
    ),
    action(
      "activate_form",
      "Activate a Monday Workform so it starts accepting submissions.",
      ["forms:write"],
      input(
        "The input payload for activating a Monday form.",
        { formToken: s.nonEmptyString("The unique form token.") },
        ["formToken"],
      ),
      { formToken: s.string("The form token."), active: s.boolean("Whether the form is active.") },
    ),
    action(
      "deactivate_form",
      "Deactivate a Monday Workform so it stops accepting submissions.",
      ["forms:write"],
      input(
        "The input payload for deactivating a Monday form.",
        { formToken: s.nonEmptyString("The unique form token.") },
        ["formToken"],
      ),
      { formToken: s.string("The form token."), active: s.boolean("Whether the form is active.") },
    ),
    action(
      "list_departments",
      "List Monday departments on enterprise accounts.",
      ["departments:read"],
      input("The input payload for listing Monday departments.", { ids: idArraySchema }),
      { departments: s.array("The departments returned by Monday.", departmentSchema) },
    ),
    action(
      "create_department",
      "Create a Monday department on an enterprise account.",
      ["departments:write"],
      input("The input payload for creating a Monday department.", { data: looseObjectSchema }, ["data"]),
      { department: departmentSchema },
    ),
    action(
      "update_department",
      "Update a Monday department on an enterprise account.",
      ["departments:write"],
      input(
        "The input payload for updating a Monday department.",
        { department_id: idSchema, data: looseObjectSchema },
        ["department_id", "data"],
      ),
      { department: departmentSchema },
    ),
    action(
      "delete_department",
      "Delete a Monday department on an enterprise account.",
      ["departments:write"],
      input("The input payload for deleting a Monday department.", { department_id: idSchema }, ["department_id"]),
      { deletedDepartmentId: s.string("The deleted department identifier.") },
    ),
    action(
      "assign_department_members",
      "Assign users to a Monday department on an enterprise account.",
      ["departments:write"],
      input(
        "The input payload for assigning Monday department members.",
        { department_id: idSchema, user_ids: idArraySchema },
        ["department_id", "user_ids"],
      ),
      {
        successfulUsers: s.array("Users assigned successfully.", userSchema),
        failedUsers: s.array("Users that could not be assigned.", userSchema),
      },
    ),
    action(
      "clear_users_department",
      "Clear department assignments from Monday users on an enterprise account.",
      ["departments:write"],
      input("The input payload for clearing Monday user department assignments.", { user_ids: idArraySchema }, [
        "user_ids",
      ]),
      { clearedUsers: s.array("Users whose department assignment was cleared.", userSchema) },
    ),
  ],
);

function action(
  name: string,
  description: string,
  providerPermissions: string[],
  inputSchema: JsonSchema,
  outputProperties: Record<string, JsonSchema>,
): MondayActionSource {
  return {
    name,
    description,
    providerPermissions,
    inputSchema,
    outputSchema: output(`The output payload for ${name}.`, outputProperties),
  };
}

export const mondayActions: ActionDefinition[] = actions.map((actionSource) =>
  defineProviderAction(service, {
    name: actionSource.name,
    description: actionSource.description,
    requiredScopes: actionSource.providerPermissions,
    providerPermissions: actionSource.providerPermissions,
    inputSchema: actionSource.inputSchema,
    outputSchema: actionSource.outputSchema,
  }),
);
