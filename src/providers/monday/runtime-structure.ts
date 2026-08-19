import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { MondayProviderActionInput } from "./runtime-common.ts";
import type { MondayActionHandler } from "./runtime-common.ts";

import { compactObject, optionalRecord as asOptionalObject } from "../../core/cast.ts";
import {
  mondayGraphqlRequest,
  normalizeMondayBoard,
  normalizeMondayColumn,
  normalizeMondayGroup,
} from "./runtime-common.ts";

export const mondayStructureActionHandlers: ProviderActionHandlerSubset<"monday", MondayActionHandler> = {
  create_group(input, fetcher) {
    return mondayCreateGroup(input, fetcher);
  },
  update_group(input, fetcher) {
    return mondayUpdateGroup(input, fetcher);
  },
  delete_group(input, fetcher) {
    return mondayDeleteGroup(input, fetcher);
  },
  create_board(input, fetcher) {
    return mondayCreateBoard(input, fetcher);
  },
  update_board(input, fetcher) {
    return mondayUpdateBoard(input, fetcher);
  },
  archive_board(input, fetcher) {
    return mondayArchiveBoard(input, fetcher);
  },
  delete_board(input, fetcher) {
    return mondayDeleteBoard(input, fetcher);
  },
  create_column(input, fetcher) {
    return mondayCreateColumn(input, fetcher);
  },
  update_column(input, fetcher) {
    return mondayUpdateColumn(input, fetcher);
  },
  delete_column(input, fetcher) {
    return mondayDeleteColumn(input, fetcher);
  },
};

async function mondayCreateGroup(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_group?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateGroup($board_id: ID!, $group_name: String!) {
          create_group(board_id: $board_id, group_name: $group_name) {
            id
            title
            color
            position
          }
        }
      `,
      variables: {
        board_id: source.board_id,
        group_name: source.group_name,
      },
    },
    fetcher,
    "execute",
  );

  return {
    group: normalizeMondayGroup(payload.create_group),
  };
}

async function mondayUpdateGroup(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    update_group?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation UpdateGroup(
          $board_id: ID!
          $group_id: String!
          $group_attribute: GroupAttributes!
          $new_value: String!
        ) {
          update_group(
            board_id: $board_id
            group_id: $group_id
            group_attribute: $group_attribute
            new_value: $new_value
          ) {
            id
            title
            color
            position
            archived
            deleted
          }
        }
      `,
      variables: {
        board_id: source.board_id,
        group_id: source.group_id,
        group_attribute: source.group_attribute,
        new_value: source.new_value,
      },
    },
    fetcher,
    "execute",
  );

  return {
    group: normalizeMondayGroup(payload.update_group),
  };
}

async function mondayDeleteGroup(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_group?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteGroup($board_id: ID!, $group_id: String!) {
          delete_group(board_id: $board_id, group_id: $group_id) {
            id
          }
        }
      `,
      variables: {
        board_id: source.board_id,
        group_id: source.group_id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    deletedGroupId: normalizeMondayGroup(payload.delete_group).id,
  };
}

async function mondayCreateBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_board?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateBoard(
          $board_name: String!
          $board_kind: BoardKind!
          $workspace_id: ID
          $empty: Boolean
        ) {
          create_board(
            board_name: $board_name
            board_kind: $board_kind
            workspace_id: $workspace_id
            empty: $empty
          ) {
            id
            name
            board_kind
            state
          }
        }
      `,
      variables: compactObject({
        board_name: source.board_name,
        board_kind: source.board_kind,
        workspace_id: source.workspace_id,
        empty: typeof source.empty === "boolean" ? source.empty : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    board: normalizeMondayBoard(payload.create_board),
  };
}

async function mondayUpdateBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    update_board?: unknown;
  }>(
    input.apiKey,
    {
      query: `
        mutation UpdateBoard(
          $board_id: ID!
          $board_attribute: BoardAttributes!
          $new_value: String!
        ) {
          update_board(
            board_id: $board_id
            board_attribute: $board_attribute
            new_value: $new_value
          )
        }
      `,
      variables: {
        board_id: source.board_id,
        board_attribute: source.board_attribute,
        new_value: source.new_value,
      },
    },
    fetcher,
    "execute",
  );

  return {
    board: normalizeUpdatedBoard(payload.update_board),
  };
}

async function mondayArchiveBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    archive_board?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation ArchiveBoard($board_id: ID!) {
          archive_board(board_id: $board_id) {
            id
          }
        }
      `,
      variables: {
        board_id: source.board_id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    archivedBoardId: normalizeMondayBoard(payload.archive_board).id,
  };
}

async function mondayDeleteBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_board?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteBoard($board_id: ID!) {
          delete_board(board_id: $board_id) {
            id
          }
        }
      `,
      variables: {
        board_id: source.board_id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    deletedBoardId: normalizeMondayBoard(payload.delete_board).id,
  };
}

async function mondayCreateColumn(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_column?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateColumn(
          $board_id: ID!
          $title: String!
          $column_type: ColumnType!
          $id: String
          $description: String
        ) {
          create_column(
            board_id: $board_id
            title: $title
            column_type: $column_type
            id: $id
            description: $description
          ) {
            id
            title
            type
            description
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        title: source.title,
        column_type: source.column_type,
        id: typeof source.id === "string" ? source.id : undefined,
        description: typeof source.description === "string" ? source.description : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    column: normalizeMondayColumn(payload.create_column),
  };
}

async function mondayUpdateColumn(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    update_column?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation UpdateColumn(
          $board_id: ID!
          $id: String!
          $revision: String!
          $column_type: ColumnType!
          $title: String
          $description: String
          $width: Int
        ) {
          update_column(
            board_id: $board_id
            id: $id
            revision: $revision
            title: $title
            description: $description
            column_type: $column_type
            width: $width
          ) {
            id
            title
            type
            description
            archived
            revision
            width
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        id: source.id,
        revision: source.revision,
        column_type: source.column_type,
        title: typeof source.title === "string" ? source.title : undefined,
        description: typeof source.description === "string" ? source.description : undefined,
        width: typeof source.width === "number" ? source.width : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    column: normalizeMondayColumn(payload.update_column),
  };
}

async function mondayDeleteColumn(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_column?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteColumn($board_id: ID!, $column_id: String!) {
          delete_column(board_id: $board_id, column_id: $column_id) {
            id
          }
        }
      `,
      variables: {
        board_id: source.board_id,
        column_id: source.column_id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    deletedColumnId: normalizeMondayColumn(payload.delete_column).id,
  };
}

function normalizeUpdatedBoard(value: unknown) {
  const record = asOptionalObject(value);
  return normalizeMondayBoard(asOptionalObject(record?.board) ?? value);
}
