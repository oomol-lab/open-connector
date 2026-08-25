import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { MondayProviderActionInput } from "./runtime-common.ts";
import type { MondayActionHandler } from "./runtime-common.ts";

import { compactObject } from "../../core/cast.ts";
import {
  asArray,
  fetchMondayCurrentUser,
  mondayGraphqlRequest,
  normalizeMondayBoard,
  normalizeMondayColumn,
  normalizeMondayGroup,
  normalizeMondayTeam,
  normalizeMondayUser,
  normalizeMondayWorkspace,
} from "./runtime-common.ts";

export const mondayDiscoveryActionHandlers: ProviderActionHandlerSubset<"monday", MondayActionHandler> = {
  get_current_user(input, fetcher) {
    return mondayGetCurrentUser(input, fetcher);
  },
  list_workspaces(input, fetcher) {
    return mondayListWorkspaces(input, fetcher);
  },
  create_workspace(input, fetcher) {
    return mondayCreateWorkspace(input, fetcher);
  },
  update_workspace(input, fetcher) {
    return mondayUpdateWorkspace(input, fetcher);
  },
  delete_workspace(input, fetcher) {
    return mondayDeleteWorkspace(input, fetcher);
  },
  list_boards(input, fetcher) {
    return mondayListBoards(input, fetcher);
  },
  list_groups(input, fetcher) {
    return mondayListGroups(input, fetcher);
  },
  list_board_columns(input, fetcher) {
    return mondayListBoardColumns(input, fetcher);
  },
  list_users(input, fetcher) {
    return mondayListUsers(input, fetcher);
  },
  list_teams(input, fetcher) {
    return mondayListTeams(input, fetcher);
  },
  list_team_members(input, fetcher) {
    return mondayListTeamMembers(input, fetcher);
  },
};

async function mondayGetCurrentUser(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const payload = await fetchMondayCurrentUser(input.apiKey, fetcher, "execute");
  return {
    user: normalizeMondayUser(payload.me),
  };
}

async function mondayListWorkspaces(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    workspaces?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListWorkspaces(
          $ids: [ID!]
          $kind: WorkspaceKind
          $limit: Int
          $page: Int
          $state: State
          $order_by: WorkspacesOrderBy
        ) {
          workspaces(
            ids: $ids
            kind: $kind
            limit: $limit
            page: $page
            state: $state
            order_by: $order_by
          ) {
            id
            name
            kind
            state
            description
          }
        }
      `,
      variables: compactObject({
        ids: Array.isArray(source.ids) ? source.ids : undefined,
        kind: typeof source.kind === "string" ? source.kind : undefined,
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
        state: typeof source.state === "string" ? source.state : undefined,
        order_by: typeof source.order_by === "string" ? source.order_by : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    workspaces: asArray(payload.workspaces).map((workspace) => normalizeMondayWorkspace(workspace)),
  };
}

async function mondayCreateWorkspace(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{ create_workspace?: Record<string, unknown> }>(
    input.apiKey,
    {
      query: `
        mutation CreateWorkspace(
          $name: String!
          $kind: WorkspaceKind!
          $description: String
          $account_product_id: ID
        ) {
          create_workspace(
            name: $name
            kind: $kind
            description: $description
            account_product_id: $account_product_id
          ) {
            id
            name
            kind
            state
            description
          }
        }
      `,
      variables: compactObject({
        name: source.name,
        kind: source.kind,
        description: typeof source.description === "string" ? source.description : undefined,
        account_product_id: source.account_product_id,
      }),
    },
    fetcher,
    "execute",
  );

  return { workspace: normalizeMondayWorkspace(payload.create_workspace) };
}

async function mondayUpdateWorkspace(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{ update_workspace?: Record<string, unknown> }>(
    input.apiKey,
    {
      query: `
        mutation UpdateWorkspace(
          $workspace_id: ID!
          $attributes: UpdateWorkspaceAttributesInput!
        ) {
          update_workspace(id: $workspace_id, attributes: $attributes) {
            id
            name
            kind
            state
            description
          }
        }
      `,
      variables: {
        workspace_id: source.workspace_id,
        attributes: compactObject({
          name: typeof source.name === "string" ? source.name : undefined,
          description: typeof source.description === "string" ? source.description : undefined,
          kind: typeof source.kind === "string" ? source.kind : undefined,
          account_product_id: source.account_product_id,
        }),
      },
    },
    fetcher,
    "execute",
  );

  return { workspace: normalizeMondayWorkspace(payload.update_workspace) };
}

async function mondayDeleteWorkspace(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{ delete_workspace?: Record<string, unknown> }>(
    input.apiKey,
    {
      query: `
        mutation DeleteWorkspace($workspace_id: ID!) {
          delete_workspace(workspace_id: $workspace_id) {
            id
          }
        }
      `,
      variables: { workspace_id: source.workspace_id },
    },
    fetcher,
    "execute",
  );

  return { deletedWorkspaceId: normalizeMondayWorkspace(payload.delete_workspace).id };
}

async function mondayListBoards(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    boards?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListBoards(
          $ids: [ID!]
          $limit: Int
          $page: Int
          $state: State
          $board_kind: BoardKind
          $workspace_ids: [ID]
        ) {
          boards(
            ids: $ids
            limit: $limit
            page: $page
            state: $state
            board_kind: $board_kind
            workspace_ids: $workspace_ids
          ) {
            id
            name
            state
            board_kind
            permissions
            description
            url
            workspace {
              id
              name
            }
          }
        }
      `,
      variables: compactObject({
        ids: Array.isArray(source.ids) ? source.ids : undefined,
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
        state: typeof source.state === "string" ? source.state : undefined,
        board_kind: typeof source.board_kind === "string" ? source.board_kind : undefined,
        workspace_ids: Array.isArray(source.workspace_ids) ? source.workspace_ids : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    boards: asArray(payload.boards).map((board) => normalizeMondayBoard(board)),
  };
}

async function mondayListGroups(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    boards?: Array<{
      groups?: Array<Record<string, unknown>>;
    }>;
  }>(
    input.apiKey,
    {
      query: `
        query ListGroups($board_id: ID!, $group_ids: [String!]) {
          boards(ids: [$board_id]) {
            groups(ids: $group_ids) {
              id
              title
              color
              position
            }
          }
        }
      `,
      variables: compactObject({
        board_id: source.board_id,
        group_ids: Array.isArray(source.group_ids) ? source.group_ids : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  const board = asArray(payload.boards)[0];
  return {
    groups: asArray(board?.groups).map((group) => normalizeMondayGroup(group)),
  };
}

async function mondayListBoardColumns(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    boards?: Array<{
      columns?: Array<Record<string, unknown>>;
    }>;
  }>(
    input.apiKey,
    {
      query: `
        query ListBoardColumns($board_id: ID!) {
          boards(ids: [$board_id]) {
            columns {
              id
              title
              type
              description
              archived
              settings
            }
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

  const board = asArray(payload.boards)[0];
  return {
    columns: asArray(board?.columns).map((column) => normalizeMondayColumn(column)),
  };
}

async function mondayListUsers(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    users?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListUsers(
          $ids: [ID!]
          $emails: [String]
          $name: String
          $limit: Int
          $page: Int
        ) {
          users(ids: $ids, emails: $emails, name: $name, limit: $limit, page: $page) {
            id
            name
            email
            enabled
            is_guest
            created_at
            account {
              id
              name
              slug
              tier
            }
          }
        }
      `,
      variables: compactObject({
        ids: Array.isArray(source.ids) ? source.ids : undefined,
        emails: Array.isArray(source.emails) ? source.emails : undefined,
        name: typeof source.name === "string" ? source.name : undefined,
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    users: asArray(payload.users).map((user) => normalizeMondayUser(user)),
  };
}

async function mondayListTeams(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    teams?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListTeams($ids: [ID!]) {
          teams(ids: $ids) {
            id
            name
            picture_url
          }
        }
      `,
      variables: compactObject({
        ids: Array.isArray(source.ids) ? source.ids : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    teams: asArray(payload.teams).map((team) => normalizeMondayTeam(team)),
  };
}

async function mondayListTeamMembers(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    teams?: Array<{
      users?: Array<Record<string, unknown>>;
    }>;
  }>(
    input.apiKey,
    {
      query: `
        query ListTeamMembers($team_id: ID!) {
          teams(ids: [$team_id]) {
            users {
              id
              name
              email
              enabled
              is_guest
              created_at
            }
          }
        }
      `,
      variables: {
        team_id: source.team_id,
      },
    },
    fetcher,
    "execute",
  );

  const team = asArray(payload.teams)[0];
  return {
    teamMembers: asArray(team?.users).map((user) => normalizeMondayUser(user)),
  };
}
