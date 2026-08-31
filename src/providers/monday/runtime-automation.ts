import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { MondayProviderActionInput } from "./runtime-common.ts";
import type { MondayActionHandler } from "./runtime-common.ts";

import { compactObject, optionalRecord as asOptionalObject } from "../../core/cast.ts";
import {
  asArray,
  mondayGraphqlRequest,
  normalizeMondayBoard,
  normalizeMondayTeam,
  mondayProviderError,
  normalizeMondayUser,
} from "./runtime-common.ts";

export const mondayAutomationActionHandlers: ProviderActionHandlerSubset<"monday", MondayActionHandler> = {
  get_board_memberships(input, fetcher) {
    return mondayGetBoardMemberships(input, fetcher);
  },
  add_users_to_board(input, fetcher) {
    return mondayAddUsersToBoard(input, fetcher);
  },
  delete_subscribers_from_board(input, fetcher) {
    return mondayDeleteSubscribersFromBoard(input, fetcher);
  },
  add_teams_to_board(input, fetcher) {
    return mondayAddTeamsToBoard(input, fetcher);
  },
  delete_teams_from_board(input, fetcher) {
    return mondayDeleteTeamsFromBoard(input, fetcher);
  },
  create_dashboard(input, fetcher) {
    return mondayCreateDashboard(input, fetcher);
  },
  update_dashboard(input, fetcher) {
    return mondayUpdateDashboard(input, fetcher);
  },
  delete_dashboard(input, fetcher) {
    return mondayDeleteDashboard(input, fetcher);
  },
  list_activity_logs(input, fetcher) {
    return mondayListActivityLogs(input, fetcher);
  },
  list_audit_logs(input, fetcher) {
    return mondayListAuditLogs(input, fetcher);
  },
};

async function mondayGetBoardMemberships(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    boards?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query GetBoardMemberships($board_ids: [ID!], $limit: Int, $page: Int) {
          boards(ids: $board_ids) {
            id
            name
            owners {
              id
              name
              email
            }
            subscribers {
              id
              name
              email
            }
            team_owners(limit: $limit, page: $page) {
              id
              name
              picture_url
            }
            team_subscribers(limit: $limit, page: $page) {
              id
              name
              picture_url
            }
          }
        }
      `,
      variables: compactObject({
        board_ids: [source.board_id],
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  const boardRecord = getRequiredBoard(payload.boards);

  return {
    board: normalizeMondayBoard(boardRecord),
    owners: asArray(boardRecord.owners).map((user) => normalizeMondayUser(user)),
    subscribers: asArray(boardRecord.subscribers).map((user) => normalizeMondayUser(user)),
    teamOwners: asArray(boardRecord.team_owners).map((team) => normalizeMondayTeam(team)),
    teamSubscribers: asArray(boardRecord.team_subscribers).map((team) => normalizeMondayTeam(team)),
  };
}

async function mondayAddUsersToBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    add_users_to_board?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        mutation AddUsersToBoard(
          $board_id: ID!
          $kind: BoardSubscriberKind
          $user_ids: [ID!]!
        ) {
          add_users_to_board(board_id: $board_id, kind: $kind, user_ids: $user_ids) {
            id
            name
            email
          }
        }
      `,
      variables: {
        board_id: source.board_id,
        kind: source.kind,
        user_ids: source.user_ids,
      },
    },
    fetcher,
    "execute",
  );

  return {
    users: asArray(payload.add_users_to_board).map((user) => normalizeMondayUser(user)),
  };
}

async function mondayDeleteSubscribersFromBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_subscribers_from_board?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteSubscribersFromBoard($board_id: ID!, $user_ids: [ID!]!) {
          delete_subscribers_from_board(board_id: $board_id, user_ids: $user_ids) {
            id
            name
            email
          }
        }
      `,
      variables: {
        board_id: source.board_id,
        user_ids: source.user_ids,
      },
    },
    fetcher,
    "execute",
  );

  return {
    users: asArray(payload.delete_subscribers_from_board).map((user) => normalizeMondayUser(user)),
  };
}

async function mondayAddTeamsToBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    add_teams_to_board?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        mutation AddTeamsToBoard(
          $board_id: ID!
          $kind: BoardSubscriberKind
          $team_ids: [ID!]!
        ) {
          add_teams_to_board(board_id: $board_id, kind: $kind, team_ids: $team_ids) {
            id
            name
            picture_url
          }
        }
      `,
      variables: {
        board_id: source.board_id,
        kind: source.kind,
        team_ids: source.team_ids,
      },
    },
    fetcher,
    "execute",
  );

  return {
    teams: asArray(payload.add_teams_to_board).map((team) => normalizeMondayTeam(team)),
  };
}

async function mondayDeleteTeamsFromBoard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_teams_from_board?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteTeamsFromBoard($board_id: ID!, $team_ids: [ID!]!) {
          delete_teams_from_board(board_id: $board_id, team_ids: $team_ids) {
            id
            name
            picture_url
          }
        }
      `,
      variables: {
        board_id: source.board_id,
        team_ids: source.team_ids,
      },
    },
    fetcher,
    "execute",
  );

  return {
    teams: asArray(payload.delete_teams_from_board).map((team) => normalizeMondayTeam(team)),
  };
}

async function mondayCreateDashboard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_dashboard?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateDashboard(
          $name: String!
          $workspace_id: ID!
          $board_ids: [ID!]!
          $kind: DashboardKind
          $board_folder_id: ID
        ) {
          create_dashboard(
            name: $name
            workspace_id: $workspace_id
            board_ids: $board_ids
            kind: $kind
            board_folder_id: $board_folder_id
          ) {
            id
            name
            workspace_id
            kind
            board_folder_id
          }
        }
      `,
      variables: compactObject({
        name: source.name,
        workspace_id: source.workspace_id,
        board_ids: source.board_ids,
        kind: typeof source.kind === "string" ? source.kind : undefined,
        board_folder_id: source.board_folder_id,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    dashboard: normalizeMondayDashboard(payload.create_dashboard),
  };
}

async function mondayUpdateDashboard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    update_dashboard?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation UpdateDashboard(
          $id: ID!
          $name: String
          $workspace_id: ID
          $kind: DashboardKind
          $board_folder_id: ID
        ) {
          update_dashboard(
            id: $id
            name: $name
            workspace_id: $workspace_id
            kind: $kind
            board_folder_id: $board_folder_id
          ) {
            id
            name
            workspace_id
            kind
            board_folder_id
          }
        }
      `,
      variables: compactObject({
        id: source.id,
        name: typeof source.name === "string" ? source.name : undefined,
        workspace_id: source.workspace_id,
        kind: typeof source.kind === "string" ? source.kind : undefined,
        board_folder_id: source.board_folder_id,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    dashboard: normalizeMondayDashboard(payload.update_dashboard),
  };
}

async function mondayDeleteDashboard(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_dashboard?: unknown;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteDashboard($id: ID!) {
          delete_dashboard(id: $id)
        }
      `,
      variables: {
        id: source.id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    deletedDashboardId: normalizeId(source.id, "monday dashboard id"),
    success: normalizeBoolean(payload.delete_dashboard, "monday delete dashboard result"),
  };
}

async function mondayListActivityLogs(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    boards?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListActivityLogs(
          $board_ids: [ID!]
          $column_ids: [String]
          $from: ISO8601DateTime
          $group_ids: [String]
          $item_ids: [ID!]
          $limit: Int
          $page: Int
          $to: ISO8601DateTime
          $user_ids: [ID!]
        ) {
          boards(ids: $board_ids) {
            id
            activity_logs(
              column_ids: $column_ids
              from: $from
              group_ids: $group_ids
              item_ids: $item_ids
              limit: $limit
              page: $page
              to: $to
              user_ids: $user_ids
            ) {
              id
              event
              entity
              data
              user_id
              account_id
              created_at
            }
          }
        }
      `,
      variables: compactObject({
        board_ids: [source.board_id],
        column_ids: Array.isArray(source.column_ids) ? source.column_ids : undefined,
        from: typeof source.from === "string" ? source.from : undefined,
        group_ids: Array.isArray(source.group_ids) ? source.group_ids : undefined,
        item_ids: Array.isArray(source.item_ids) ? source.item_ids : undefined,
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
        to: typeof source.to === "string" ? source.to : undefined,
        user_ids: Array.isArray(source.user_ids) ? source.user_ids : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  const boardRecord = getRequiredBoard(payload.boards);

  return {
    activityLogs: asArray(boardRecord.activity_logs).map((entry) => normalizeMondayActivityLog(entry)),
  };
}

async function mondayListAuditLogs(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    audit_logs?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        query ListAuditLogs(
          $limit: Int
          $page: Int
          $events: [String!]
          $user_id: ID
          $ip_address: String
          $start_time: ISO8601DateTime
          $end_time: ISO8601DateTime
        ) {
          audit_logs(
            limit: $limit
            page: $page
            events: $events
            user_id: $user_id
            ip_address: $ip_address
            start_time: $start_time
            end_time: $end_time
          ) {
            logs {
              timestamp
              account_id
              event
              slug
              ip_address
              user_agent
              client_name
              client_version
              os_name
              os_version
              device_name
              device_type
              user {
                id
                name
                email
              }
              activity_metadata
            }
            pagination {
              page
              page_size
              has_more_pages
              next_page_number
            }
          }
        }
      `,
      variables: compactObject({
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
        events: Array.isArray(source.events) ? source.events : undefined,
        user_id: source.user_id,
        ip_address: typeof source.ip_address === "string" ? source.ip_address : undefined,
        start_time: typeof source.start_time === "string" ? source.start_time : undefined,
        end_time: typeof source.end_time === "string" ? source.end_time : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  const auditLogs = asOptionalObject(payload.audit_logs);

  return {
    auditLogs: asArray(auditLogs?.logs).map((entry) => normalizeMondayAuditLog(entry)),
    pagination: normalizeOptionalPagination(auditLogs?.pagination),
  };
}

function getRequiredBoard(value: unknown) {
  const board = asOptionalObject(asArray(value)[0]);
  if (!board) {
    throw mondayProviderError("monday board payload is missing", 502);
  }
  return board;
}

function normalizeMondayDashboard(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw mondayProviderError("monday dashboard payload is missing", 502);
  }

  return compactObject({
    id: normalizeId(record.id, "monday dashboard id"),
    name: toOptionalString(record.name),
    workspace_id: toOptionalId(record.workspace_id),
    kind: toOptionalString(record.kind),
    board_folder_id: toOptionalId(record.board_folder_id),
  });
}

function normalizeMondayActivityLog(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw mondayProviderError("monday activity log payload is missing", 502);
  }

  return {
    id: normalizeId(record.id, "monday activity log id"),
    event: normalizeString(record.event, "monday activity log event"),
    entity: normalizeString(record.entity, "monday activity log entity"),
    data: normalizeString(record.data, "monday activity log data"),
    user_id: normalizeString(record.user_id, "monday activity log user id"),
    account_id: normalizeString(record.account_id, "monday activity log account id"),
    created_at: normalizeString(record.created_at, "monday activity log created_at"),
  };
}

function normalizeMondayAuditLog(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw mondayProviderError("monday audit log payload is missing", 502);
  }

  return compactObject({
    timestamp: normalizeString(record.timestamp, "monday audit log timestamp"),
    account_id: toOptionalString(record.account_id),
    event: normalizeString(record.event, "monday audit log event"),
    slug: toOptionalString(record.slug),
    ip_address: toOptionalString(record.ip_address),
    user_agent: toOptionalString(record.user_agent),
    client_name: toOptionalString(record.client_name),
    client_version: toOptionalString(record.client_version),
    os_name: toOptionalString(record.os_name),
    os_version: toOptionalString(record.os_version),
    device_name: toOptionalString(record.device_name),
    device_type: toOptionalString(record.device_type),
    user: record.user ? normalizeMondayUser(record.user) : undefined,
    activity_metadata: asOptionalObject(record.activity_metadata),
  });
}

function normalizeOptionalPagination(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    page: normalizeInteger(record.page, "monday pagination page"),
    page_size: normalizeInteger(record.page_size, "monday pagination page_size"),
    has_more_pages: normalizeBoolean(record.has_more_pages, "monday pagination has_more_pages"),
    next_page_number:
      record.next_page_number === undefined || record.next_page_number === null
        ? undefined
        : normalizeInteger(record.next_page_number, "monday pagination next_page_number"),
  });
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toOptionalId(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeString(value: unknown, fieldName: string) {
  const normalized = toOptionalString(value);
  if (!normalized) {
    throw mondayProviderError(`${fieldName} is missing`, 502);
  }
  return normalized;
}

function normalizeId(value: unknown, fieldName: string) {
  const normalized = toOptionalId(value);
  if (!normalized) {
    throw mondayProviderError(`${fieldName} is missing`, 502);
  }
  return normalized;
}

function normalizeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw mondayProviderError(`${fieldName} is missing`, 502);
  }
  return value;
}

function normalizeBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw mondayProviderError(`${fieldName} is missing`, 502);
  }
  return value;
}
