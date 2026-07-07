import type { CredentialValidationResult } from "../../core/types.ts";
import type { TrelloActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const trelloApiBaseUrl: string = "https://api.trello.com/1";

export interface TrelloActionContext {
  apiKey: string;
  apiToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type TrelloActionHandler = (input: Record<string, unknown>, context: TrelloActionContext) => Promise<unknown>;

type TrelloRequestInput = {
  credential: Pick<TrelloActionContext, "apiKey" | "apiToken">;
  fetcher: typeof fetch;
  method?: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
  query?: Array<[string, string | number | boolean | null | undefined]>;
  body?: Record<string, unknown>;
  phase: "validate" | "execute";
};

const defaultMemberFields = ["id", "username", "fullName"];
const defaultBoardFields = ["name", "desc", "url", "shortUrl", "closed"];
const defaultCardFields = ["name", "desc", "url", "shortUrl", "closed", "due", "dueComplete", "idBoard", "idList"];

export const trelloActionHandlers: Record<TrelloActionName, TrelloActionHandler> = {
  async get_member(input, context) {
    const memberId = readOptionalString(input.memberId) ?? "me";
    const member = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      path: `/members/${encodeURIComponent(memberId)}`,
      query: [["fields", readFields(input.fields, defaultMemberFields)]],
      phase: "execute",
    });
    return {
      member: normalizeMember(member),
    };
  },
  async list_member_boards(input, context) {
    const memberId = readOptionalString(input.memberId) ?? "me";
    const boards = await trelloRequest<unknown[]>({
      credential: context,
      fetcher: context.fetcher,
      path: `/members/${encodeURIComponent(memberId)}/boards`,
      query: [
        ["fields", readFields(input.fields, defaultBoardFields)],
        ["filter", readOptionalString(input.filter)],
      ],
      phase: "execute",
    });
    return {
      boards: boards.map((board) => normalizeBoard(asObjectPayload(board))),
    };
  },
  async get_board(input, context) {
    const boardId = readRequiredString(input.boardId, "boardId");
    const board = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      path: `/boards/${encodeURIComponent(boardId)}`,
      query: [["fields", readFields(input.fields, defaultBoardFields)]],
      phase: "execute",
    });
    return {
      board: normalizeBoard(board),
    };
  },
  async create_board(input, context) {
    const board = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: "/boards",
      body: compactObject({
        name: readRequiredString(input.name, "name"),
        desc: readOptionalString(input.description),
        defaultLists: hasField(input, "defaultLists")
          ? readRequiredBoolean(input.defaultLists, "defaultLists")
          : undefined,
        prefs_permissionLevel: readOptionalString(input.permissionLevel),
      }),
      phase: "execute",
    });
    return {
      board: normalizeBoard(board),
    };
  },
  async list_board_lists(input, context) {
    const boardId = readRequiredString(input.boardId, "boardId");
    const lists = await trelloRequest<unknown[]>({
      credential: context,
      fetcher: context.fetcher,
      path: `/boards/${encodeURIComponent(boardId)}/lists`,
      query: [["filter", readOptionalString(input.filter)]],
      phase: "execute",
    });
    return {
      lists: lists.map((list) => normalizeList(asObjectPayload(list))),
    };
  },
  async create_list(input, context) {
    const list = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: "/lists",
      body: compactObject({
        idBoard: readRequiredString(input.boardId, "boardId"),
        name: readRequiredString(input.name, "name"),
        pos: hasField(input, "position") ? readPosition(input.position, "position") : undefined,
      }),
      phase: "execute",
    });
    return {
      list: normalizeList(list),
    };
  },
  async update_list(input, context) {
    const listId = readRequiredString(input.listId, "listId");
    const body = compactObject({
      name: readOptionalString(input.name),
      pos: hasField(input, "position") ? readPosition(input.position, "position") : undefined,
    });
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "at least one list update field is required");
    }

    const list = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/lists/${encodeURIComponent(listId)}`,
      body,
      phase: "execute",
    });
    return {
      list: normalizeList(list),
    };
  },
  async archive_list(input, context) {
    const listId = readRequiredString(input.listId, "listId");
    const list = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/lists/${encodeURIComponent(listId)}`,
      body: {
        closed: true,
      },
      phase: "execute",
    });
    return {
      list: normalizeList(list),
    };
  },
  async list_board_cards(input, context) {
    const boardId = readRequiredString(input.boardId, "boardId");
    const filter = readOptionalString(input.filter) ?? "visible";
    const cards = await trelloRequest<unknown[]>({
      credential: context,
      fetcher: context.fetcher,
      path: `/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(filter)}`,
      query: [["fields", readFields(input.fields, defaultCardFields)]],
      phase: "execute",
    });
    return {
      cards: cards.map((card) => normalizeCard(asObjectPayload(card))),
    };
  },
  async list_board_members(input, context) {
    const boardId = readRequiredString(input.boardId, "boardId");
    const members = await trelloRequest<unknown[]>({
      credential: context,
      fetcher: context.fetcher,
      path: `/boards/${encodeURIComponent(boardId)}/members`,
      query: [["fields", readFields(input.fields, defaultMemberFields)]],
      phase: "execute",
    });
    return {
      members: members.map((member) => normalizeMember(asObjectPayload(member))),
    };
  },
  async list_board_labels(input, context) {
    const boardId = readRequiredString(input.boardId, "boardId");
    const labels = await trelloRequest<unknown[]>({
      credential: context,
      fetcher: context.fetcher,
      path: `/boards/${encodeURIComponent(boardId)}/labels`,
      phase: "execute",
    });
    return {
      labels: labels.map((label) => asObjectPayload(label)),
    };
  },
  async get_card(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const card = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      path: `/cards/${encodeURIComponent(cardId)}`,
      query: [["fields", readFields(input.fields, defaultCardFields)]],
      phase: "execute",
    });
    return {
      card: normalizeCard(card),
    };
  },
  async create_card(input, context) {
    const card = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: "/cards",
      body: buildCardMutationBody(input, "create"),
      phase: "execute",
    });
    return {
      card: normalizeCard(card),
    };
  },
  async move_card(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const card = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/cards/${encodeURIComponent(cardId)}`,
      body: compactObject({
        idList: readRequiredString(input.listId, "listId"),
        pos: hasField(input, "position") ? readPosition(input.position, "position") : undefined,
      }),
      phase: "execute",
    });
    return {
      card: normalizeCard(card),
    };
  },
  async archive_card(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const card = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/cards/${encodeURIComponent(cardId)}`,
      body: {
        closed: true,
      },
      phase: "execute",
    });
    return {
      card: normalizeCard(card),
    };
  },
  async update_card(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const card = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/cards/${encodeURIComponent(cardId)}`,
      body: buildCardMutationBody(input, "update"),
      phase: "execute",
    });
    return {
      card: normalizeCard(card),
    };
  },
  async add_card_comment(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const action = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: `/cards/${encodeURIComponent(cardId)}/actions/comments`,
      body: {
        text: readRequiredString(input.text, "text"),
      },
      phase: "execute",
    });
    return {
      action: normalizeAction(action),
    };
  },
  async list_card_comments(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const comments = await trelloRequest<unknown[]>({
      credential: context,
      fetcher: context.fetcher,
      path: `/cards/${encodeURIComponent(cardId)}/actions`,
      query: [
        ["filter", "commentCard"],
        ["limit", readOptionalInteger(input.limit, "limit")],
      ],
      phase: "execute",
    });
    return {
      comments: comments.map((comment) => normalizeAction(asObjectPayload(comment))),
    };
  },
  async add_card_member(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    await trelloRequest<unknown>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: `/cards/${encodeURIComponent(cardId)}/idMembers`,
      query: [["value", readRequiredString(input.memberId, "memberId")]],
      phase: "execute",
    });
    return {
      success: true,
    };
  },
  async remove_card_member(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const memberId = readRequiredString(input.memberId, "memberId");
    await trelloRequest<unknown>({
      credential: context,
      fetcher: context.fetcher,
      method: "DELETE",
      path: `/cards/${encodeURIComponent(cardId)}/idMembers/${encodeURIComponent(memberId)}`,
      phase: "execute",
    });
    return {
      success: true,
    };
  },
  async add_card_label(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    await trelloRequest<unknown>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: `/cards/${encodeURIComponent(cardId)}/idLabels`,
      query: [["value", readRequiredString(input.labelId, "labelId")]],
      phase: "execute",
    });
    return {
      success: true,
    };
  },
  async remove_card_label(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const labelId = readRequiredString(input.labelId, "labelId");
    await trelloRequest<unknown>({
      credential: context,
      fetcher: context.fetcher,
      method: "DELETE",
      path: `/cards/${encodeURIComponent(cardId)}/idLabels/${encodeURIComponent(labelId)}`,
      phase: "execute",
    });
    return {
      success: true,
    };
  },
  async create_checklist(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const checklist = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: `/cards/${encodeURIComponent(cardId)}/checklists`,
      body: {
        name: readRequiredString(input.name, "name"),
      },
      phase: "execute",
    });
    return {
      checklist: normalizeChecklist(checklist),
    };
  },
  async list_card_checklists(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const checklists = await trelloRequest<unknown[]>({
      credential: context,
      fetcher: context.fetcher,
      path: `/cards/${encodeURIComponent(cardId)}/checklists`,
      phase: "execute",
    });
    return {
      checklists: checklists.map((checklist) => normalizeChecklist(asObjectPayload(checklist))),
    };
  },
  async add_checkitem(input, context) {
    const checklistId = readRequiredString(input.checklistId, "checklistId");
    const checkItem = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: `/checklists/${encodeURIComponent(checklistId)}/checkItems`,
      body: compactObject({
        name: readRequiredString(input.name, "name"),
        pos: hasField(input, "position") ? readPosition(input.position, "position") : undefined,
        checked: hasField(input, "checked") ? readRequiredBoolean(input.checked, "checked") : undefined,
      }),
      phase: "execute",
    });
    return {
      checkItem: normalizeCheckItem(checkItem),
    };
  },
  async update_checkitem_state(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const checkItemId = readRequiredString(input.checkItemId, "checkItemId");
    const card = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/cards/${encodeURIComponent(cardId)}/checkItem/${encodeURIComponent(checkItemId)}`,
      body: {
        state: readRequiredString(input.state, "state"),
      },
      phase: "execute",
    });
    return {
      card: normalizeCard(card),
    };
  },
  async add_card_attachment_url(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const attachment = await trelloRequest<Record<string, unknown>>({
      credential: context,
      fetcher: context.fetcher,
      method: "POST",
      path: `/cards/${encodeURIComponent(cardId)}/attachments`,
      body: compactObject({
        url: readRequiredString(input.url, "url"),
        name: readOptionalString(input.name),
      }),
      phase: "execute",
    });
    return {
      attachment: normalizeAttachment(attachment),
    };
  },
  async search(input, context) {
    const payload = await trelloRequest<unknown[]>({
      credential: context,
      fetcher: context.fetcher,
      path: "/search",
      query: [
        ["query", readRequiredString(input.query, "query")],
        ["modelTypes", readOptionalStringArray(input.modelTypes)?.join(",")],
        ["cards_limit", readOptionalInteger(input.cardsLimit, "cardsLimit")],
        ["boards_limit", readOptionalInteger(input.boardsLimit, "boardsLimit")],
        ["members_limit", readOptionalInteger(input.membersLimit, "membersLimit")],
      ],
      phase: "execute",
    });
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Trello search response was not an array");
    }
    return {
      results: payload.map((result) => asObjectPayload(result)),
    };
  },
};

export async function validateTrelloCredential(
  input: { values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const credential = resolveTrelloCredential(input.values);
  const member = await trelloRequest<Record<string, unknown>>({
    credential,
    fetcher: options.fetcher,
    path: "/members/me",
    query: [["fields", defaultMemberFields.join(",")]],
    phase: "validate",
  });
  const memberId = readOptionalString(member.id);
  const username = readOptionalString(member.username);
  const fullName = readOptionalString(member.fullName);
  const fallbackLabel = username ?? memberId ?? "Trello member";

  return {
    profile: {
      accountId: memberId ?? username ?? "trello:member",
      displayName: fullName ?? fallbackLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: trelloApiBaseUrl,
      memberId,
      username,
      validationEndpoint: "/members/me",
    }),
  };
}

function resolveTrelloCredential(
  input: Record<string, string | undefined>,
): Pick<TrelloActionContext, "apiKey" | "apiToken"> {
  return {
    apiKey: readRequiredString(input.apiKey, "apiKey"),
    apiToken: readRequiredString(input.apiToken, "apiToken"),
  };
}

async function trelloRequest<T>(input: TrelloRequestInput): Promise<T> {
  const url = new URL(`${trelloApiBaseUrl}${input.path}`);
  url.searchParams.set("key", input.credential.apiKey);
  url.searchParams.set("token", input.credential.apiToken);
  for (const [key, value] of input.query ?? []) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await input.fetcher(url.toString(), {
    method: input.method ?? "GET",
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ProviderRequestError(502, `Trello ${input.phase} request returned invalid JSON: ${detail}`);
    }
  }

  const message = await readTrelloError(response);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(400, normalizeTrelloAuthError(message));
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  throw new ProviderRequestError(
    response.status >= 400 && response.status < 600 ? response.status : 502,
    `Trello ${input.phase} request failed: ${message}`,
  );
}

function normalizeTrelloAuthError(message: string) {
  if (message === "invalid key") {
    return "Invalid Trello API key. Use the Key from https://trello.com/power-ups/admin, not the API Secret or an Atlassian API token.";
  }
  if (message === "invalid token") {
    return "Invalid Trello API token. Generate it from the Token link beside your API Key at https://trello.com/power-ups/admin.";
  }
  return message;
}

async function readTrelloError(response: Response) {
  const fallback = response.statusText || `HTTP ${response.status}`;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    if (typeof payload === "string" && payload) {
      return payload;
    }
    const record = optionalRecord(payload);
    return (
      readOptionalString(record?.message) ??
      readOptionalString(record?.error) ??
      readOptionalString(record?.detail) ??
      fallback
    );
  }

  const text = await response.text().catch(() => "");
  return text || fallback;
}

function readFields(value: unknown, fallback: string[]) {
  if (value === undefined) {
    return fallback.join(",");
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "fields must be an array");
  }
  return value.map((field) => readRequiredString(field, "fields")).join(",");
}

function buildCardMutationBody(input: Record<string, unknown>, mode: "create" | "update") {
  const body = compactObject({
    idList: mode === "create" ? readRequiredString(input.listId, "listId") : readOptionalString(input.listId),
    name: readOptionalString(input.name),
    desc: readOptionalString(input.description),
    due: hasField(input, "due") ? (input.due === null ? null : readOptionalString(input.due)) : undefined,
    pos: hasField(input, "position") ? readPosition(input.position, "position") : undefined,
    idMembers: readOptionalIdList(input.memberIds, "memberIds"),
    idLabels: readOptionalIdList(input.labelIds, "labelIds"),
    closed: hasField(input, "closed") ? optionalBoolean(input.closed) : undefined,
    dueComplete: hasField(input, "dueComplete") ? optionalBoolean(input.dueComplete) : undefined,
  });

  if (mode === "update" && Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "at least one card update field is required");
  }

  return body;
}

function readPosition(value: unknown, fieldName: string) {
  if (typeof value === "number") {
    return value;
  }
  return readRequiredString(value, fieldName);
}

function readOptionalIdList(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => readRequiredString(item, fieldName)).join(",");
}

function normalizeMember(payload: Record<string, unknown>) {
  return compactObject({
    id: readOptionalString(payload.id),
    username: readOptionalString(payload.username),
    fullName: readOptionalString(payload.fullName),
  });
}

function normalizeBoard(payload: Record<string, unknown>) {
  return compactObject({
    id: readOptionalString(payload.id),
    name: readOptionalString(payload.name),
    description: readOptionalString(payload.desc),
    url: readOptionalString(payload.url),
    shortUrl: readOptionalString(payload.shortUrl),
    closed: optionalBoolean(payload.closed),
  });
}

function normalizeList(payload: Record<string, unknown>) {
  return compactObject({
    id: readOptionalString(payload.id),
    boardId: readOptionalString(payload.idBoard),
    name: readOptionalString(payload.name),
    closed: optionalBoolean(payload.closed),
    position: typeof payload.pos === "number" ? payload.pos : undefined,
  });
}

function normalizeCard(payload: Record<string, unknown>) {
  return compactObject({
    id: readOptionalString(payload.id),
    boardId: readOptionalString(payload.idBoard),
    listId: readOptionalString(payload.idList),
    name: readOptionalString(payload.name),
    description: readOptionalString(payload.desc),
    url: readOptionalString(payload.url),
    shortUrl: readOptionalString(payload.shortUrl),
    closed: optionalBoolean(payload.closed),
    due: payload.due === null ? null : readOptionalString(payload.due),
    dueComplete: optionalBoolean(payload.dueComplete),
  });
}

function normalizeAction(payload: Record<string, unknown>) {
  return compactObject({
    id: readOptionalString(payload.id),
    type: readOptionalString(payload.type),
    data: optionalRecord(payload.data),
    date: readOptionalString(payload.date),
  });
}

function normalizeChecklist(payload: Record<string, unknown>) {
  return compactObject({
    id: readOptionalString(payload.id),
    cardId: readOptionalString(payload.idCard),
    name: readOptionalString(payload.name),
    checkItems: readOptionalObjectArray(payload.checkItems)?.map((item) => normalizeCheckItem(item)),
  });
}

function normalizeCheckItem(payload: Record<string, unknown>) {
  return compactObject({
    id: readOptionalString(payload.id),
    name: readOptionalString(payload.name),
    state: readOptionalString(payload.state),
    position: typeof payload.pos === "number" ? payload.pos : undefined,
  });
}

function normalizeAttachment(payload: Record<string, unknown>) {
  return compactObject({
    id: readOptionalString(payload.id),
    name: readOptionalString(payload.name),
    url: readOptionalString(payload.url),
    bytes: typeof payload.bytes === "number" ? payload.bytes : payload.bytes === null ? null : undefined,
    date: readOptionalString(payload.date),
  });
}

function asObjectPayload(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Trello response item was not an object");
  }
  return record;
}

function readOptionalObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => asObjectPayload(item));
}

function readOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = readOptionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function readRequiredBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, `${fieldName} must be a boolean`);
  }
  return value;
}

function readOptionalStringArray(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array input is required");
  }
  return value.map((item) => readRequiredString(item, "item"));
}

function hasField(input: Record<string, unknown>, field: string) {
  return Object.hasOwn(input, field);
}
