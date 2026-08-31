import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { MondayProviderActionInput } from "./runtime-common.ts";
import type { MondayActionHandler } from "./runtime-common.ts";

import { compactObject, optionalRecord as asOptionalObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  asArray,
  normalizeDocBlocksFromMarkdownResult,
  mondayGraphqlRequest,
  mondayItemFields,
  normalizeItemsPage,
  normalizeMondayItem,
  serializeJsonInput,
} from "./runtime-common.ts";

export const mondayItemActionHandlers: ProviderActionHandlerSubset<"monday", MondayActionHandler> = {
  find_items_by_column_values(input, fetcher) {
    return mondayFindItemsByColumnValues(input, fetcher);
  },
  list_subitems_by_parent(input, fetcher) {
    return mondayListSubitemsByParent(input, fetcher);
  },
  get_items(input, fetcher) {
    return mondayGetItems(input, fetcher);
  },
  get_items_page(input, fetcher) {
    return mondayGetItemsPage(input, fetcher);
  },
  get_next_items_page(input, fetcher) {
    return mondayGetNextItemsPage(input, fetcher);
  },
  create_item(input, fetcher) {
    return mondayCreateItem(input, fetcher);
  },
  create_subitem(input, fetcher) {
    return mondayCreateSubitem(input, fetcher);
  },
  set_item_description_content(input, fetcher) {
    return mondaySetItemDescriptionContent(input, fetcher);
  },
  change_simple_column_value(input, fetcher) {
    return mondayChangeSimpleColumnValue(input, fetcher);
  },
  change_multiple_column_values(input, fetcher) {
    return mondayChangeMultipleColumnValues(input, fetcher);
  },
  move_item_to_group(input, fetcher) {
    return mondayMoveItemToGroup(input, fetcher);
  },
  move_item_to_board(input, fetcher) {
    return mondayMoveItemToBoard(input, fetcher);
  },
  change_item_position(input, fetcher) {
    return mondayChangeItemPosition(input, fetcher);
  },
  duplicate_item(input, fetcher) {
    return mondayDuplicateItem(input, fetcher);
  },
  archive_item(input, fetcher) {
    return mondayArchiveItem(input, fetcher);
  },
  delete_item(input, fetcher) {
    return mondayDeleteItem(input, fetcher);
  },
};

async function mondayFindItemsByColumnValues(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    items_page_by_column_values?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        query FindItemsByColumnValues(
          $board_id: ID!
          $columns: [ItemsPageByColumnValuesQuery!]
          $cursor: String
          $hierarchy_scope_config: String
          $limit: Int!
        ) {
          items_page_by_column_values(
            board_id: $board_id
            columns: $columns
            cursor: $cursor
            hierarchy_scope_config: $hierarchy_scope_config
            limit: $limit
          ) {
            cursor
            items {
              ${mondayItemFields}
            }
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        columns: Array.isArray(source.columns) ? source.columns : undefined,
        cursor: typeof source.cursor === "string" ? source.cursor : undefined,
        hierarchy_scope_config:
          typeof source.hierarchy_scope_config === "string" ? source.hierarchy_scope_config : undefined,
        limit: typeof source.limit === "number" ? source.limit : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return normalizeItemsPage(payload.items_page_by_column_values);
}

async function mondayListSubitemsByParent(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    items?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListSubitemsByParent($parent_item_ids: [ID!]!) {
          items(ids: $parent_item_ids) {
            id
            name
            subitems {
              ${mondayItemFields}
              parent_item {
                id
                name
              }
            }
          }
        }
      `,
      variables: {
        parent_item_ids: source.parent_item_ids,
      },
    },
    fetcher,
    "execute",
  );

  return {
    parentItems: asArray(payload.items).map((item) => normalizeMondayItem(item)),
  };
}

async function mondayGetItems(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    items?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query GetItems(
          $ids: [ID!]!
          $limit: Int
          $page: Int
          $newest_first: Boolean
          $exclude_nonactive: Boolean
        ) {
          items(
            ids: $ids
            limit: $limit
            page: $page
            newest_first: $newest_first
            exclude_nonactive: $exclude_nonactive
          ) {
            ${mondayItemFields}
          }
        }
      `,
      variables: compactObject({
        ids: source.ids,
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
        newest_first: typeof source.newest_first === "boolean" ? source.newest_first : undefined,
        exclude_nonactive: typeof source.exclude_nonactive === "boolean" ? source.exclude_nonactive : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    items: asArray(payload.items).map((item) => normalizeMondayItem(item)),
  };
}

async function mondayGetItemsPage(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    boards?: Array<{
      items_page?: Record<string, unknown>;
    }>;
  }>(
    input.apiKey,
    {
      query: `
        query GetItemsPage(
          $board_id: ID!
          $limit: Int!
          $cursor: String
          $hierarchy_scope_config: String
          $query_params: ItemsQuery
        ) {
          boards(ids: [$board_id]) {
            items_page(
              limit: $limit
              cursor: $cursor
              hierarchy_scope_config: $hierarchy_scope_config
              query_params: $query_params
            ) {
              cursor
              items {
                ${mondayItemFields}
              }
            }
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        limit: typeof source.limit === "number" ? source.limit : undefined,
        cursor: typeof source.cursor === "string" ? source.cursor : undefined,
        hierarchy_scope_config:
          typeof source.hierarchy_scope_config === "string" ? source.hierarchy_scope_config : undefined,
        query_params: asOptionalObject(source.query_params),
      }),
    },
    fetcher,
    "execute",
  );

  return normalizeItemsPage(asArray(payload.boards)[0]?.items_page);
}

async function mondayGetNextItemsPage(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    next_items_page?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        query GetNextItemsPage($cursor: String!, $limit: Int!) {
          next_items_page(cursor: $cursor, limit: $limit) {
            cursor
            items {
              ${mondayItemFields}
            }
          }
        }
      `,
      variables: {
        cursor: source.cursor,
        limit: source.limit,
      },
    },
    fetcher,
    "execute",
  );

  return normalizeItemsPage(payload.next_items_page);
}

async function mondayCreateItem(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_item?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateItem(
          $board_id: ID!
          $group_id: String
          $item_name: String!
          $column_values: JSON
          $create_labels_if_missing: Boolean
          $relative_to: ID
          $position_relative_method: PositionRelative
        ) {
          create_item(
            board_id: $board_id
            group_id: $group_id
            item_name: $item_name
            column_values: $column_values
            create_labels_if_missing: $create_labels_if_missing
            relative_to: $relative_to
            position_relative_method: $position_relative_method
          ) {
            ${mondayItemFields}
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        group_id: typeof source.group_id === "string" ? source.group_id : undefined,
        item_name: source.item_name,
        column_values: serializeJsonInput(source.column_values),
        create_labels_if_missing:
          typeof source.create_labels_if_missing === "boolean" ? source.create_labels_if_missing : undefined,
        relative_to: source.relative_to,
        position_relative_method:
          typeof source.position_relative_method === "string" ? source.position_relative_method : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    item: normalizeMondayItem(payload.create_item),
  };
}

async function mondayCreateSubitem(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_subitem?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateSubitem(
          $parent_item_id: ID!
          $item_name: String!
          $column_values: JSON
          $create_labels_if_missing: Boolean
        ) {
          create_subitem(
            parent_item_id: $parent_item_id
            item_name: $item_name
            column_values: $column_values
            create_labels_if_missing: $create_labels_if_missing
          ) {
            ${mondayItemFields}
          }
        }
      `,
      variables: compactObject({
        parent_item_id: source.parent_item_id,
        item_name: source.item_name,
        column_values: serializeJsonInput(source.column_values),
        create_labels_if_missing:
          typeof source.create_labels_if_missing === "boolean" ? source.create_labels_if_missing : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    item: normalizeMondayItem(payload.create_subitem),
  };
}

async function mondaySetItemDescriptionContent(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    set_item_description_content?: unknown;
  }>(
    input.apiKey,
    {
      query: `
        mutation SetItemDescriptionContent($item_id: ID!, $markdown: String!) {
          set_item_description_content(item_id: $item_id, markdown: $markdown) {
            success
            error
            block_ids
          }
        }
      `,
      variables: {
        item_id: source.item_id,
        markdown: source.markdown,
      },
    },
    fetcher,
    "execute",
  );

  return normalizeDocBlocksFromMarkdownResult(payload.set_item_description_content);
}

async function mondayChangeSimpleColumnValue(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    change_simple_column_value?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation ChangeSimpleColumnValue(
          $board_id: ID!
          $item_id: ID!
          $column_id: String!
          $value: String!
          $create_labels_if_missing: Boolean
        ) {
          change_simple_column_value(
            board_id: $board_id
            item_id: $item_id
            column_id: $column_id
            value: $value
            create_labels_if_missing: $create_labels_if_missing
          ) {
            ${mondayItemFields}
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        item_id: source.item_id,
        column_id: source.column_id,
        value: source.value,
        create_labels_if_missing:
          typeof source.create_labels_if_missing === "boolean" ? source.create_labels_if_missing : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    item: normalizeMondayItem(payload.change_simple_column_value),
  };
}

async function mondayChangeMultipleColumnValues(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    change_multiple_column_values?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation ChangeMultipleColumnValues(
          $board_id: ID!
          $item_id: ID!
          $column_values: JSON!
          $create_labels_if_missing: Boolean
        ) {
          change_multiple_column_values(
            board_id: $board_id
            item_id: $item_id
            column_values: $column_values
            create_labels_if_missing: $create_labels_if_missing
          ) {
            ${mondayItemFields}
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        item_id: source.item_id,
        column_values: serializeJsonInput(source.column_values),
        create_labels_if_missing:
          typeof source.create_labels_if_missing === "boolean" ? source.create_labels_if_missing : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    item: normalizeMondayItem(payload.change_multiple_column_values),
  };
}

async function mondayMoveItemToGroup(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    move_item_to_group?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation MoveItemToGroup($item_id: ID!, $group_id: String!) {
          move_item_to_group(item_id: $item_id, group_id: $group_id) {
            ${mondayItemFields}
          }
        }
      `,
      variables: {
        item_id: source.item_id,
        group_id: source.group_id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    item: normalizeMondayItem(payload.move_item_to_group),
  };
}

async function mondayMoveItemToBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    move_item_to_board?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation MoveItemToBoard(
          $item_id: ID!
          $board_id: ID!
          $group_id: ID!
          $columns_mapping: [ColumnMappingInput!]
          $subitems_columns_mapping: [ColumnMappingInput!]
        ) {
          move_item_to_board(
            item_id: $item_id
            board_id: $board_id
            group_id: $group_id
            columns_mapping: $columns_mapping
            subitems_columns_mapping: $subitems_columns_mapping
          ) {
            ${mondayItemFields}
          }
        }
      `,
      variables: compactObject({
        item_id: source.item_id,
        board_id: source.board_id,
        group_id: source.group_id,
        columns_mapping: Array.isArray(source.columns_mapping) ? source.columns_mapping : undefined,
        subitems_columns_mapping: Array.isArray(source.subitems_columns_mapping)
          ? source.subitems_columns_mapping
          : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    item: normalizeMondayItem(payload.move_item_to_board),
  };
}

async function mondayChangeItemPosition(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    change_item_position?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation ChangeItemPosition(
          $item_id: ID!
          $group_id: ID
          $group_top: Boolean
          $relative_to: ID
          $position_relative_method: PositionRelative
        ) {
          change_item_position(
            item_id: $item_id
            group_id: $group_id
            group_top: $group_top
            relative_to: $relative_to
            position_relative_method: $position_relative_method
          ) {
            ${mondayItemFields}
          }
        }
      `,
      variables: compactObject({
        item_id: source.item_id,
        group_id: source.group_id,
        group_top: typeof source.group_top === "boolean" ? source.group_top : undefined,
        relative_to: source.relative_to,
        position_relative_method:
          typeof source.position_relative_method === "string" ? source.position_relative_method : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    item: normalizeMondayItem(payload.change_item_position),
  };
}

async function mondayDuplicateItem(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    duplicate_item?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DuplicateItem($board_id: ID!, $item_id: ID!, $with_updates: Boolean) {
          duplicate_item(board_id: $board_id, item_id: $item_id, with_updates: $with_updates) {
            ${mondayItemFields}
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        item_id: source.item_id,
        with_updates: typeof source.with_updates === "boolean" ? source.with_updates : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    item: normalizeMondayItem(payload.duplicate_item),
  };
}

async function mondayArchiveItem(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    archive_item?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation ArchiveItem($item_id: ID!) {
          archive_item(item_id: $item_id) {
            id
          }
        }
      `,
      variables: {
        item_id: source.item_id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    archivedItemId: requireMutationItemId(payload.archive_item, "monday archive_item payload is missing id"),
  };
}

async function mondayDeleteItem(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_item?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteItem($item_id: ID!) {
          delete_item(item_id: $item_id) {
            id
          }
        }
      `,
      variables: {
        item_id: source.item_id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    deletedItemId: requireMutationItemId(payload.delete_item, "monday delete_item payload is missing id"),
  };
}

function requireMutationItemId(value: unknown, message: string) {
  const id = asOptionalObject(value)?.id;
  if ((typeof id === "string" && id.length > 0) || (typeof id === "number" && Number.isFinite(id))) {
    return String(id);
  }

  throw new ProviderRequestError(502, message);
}
