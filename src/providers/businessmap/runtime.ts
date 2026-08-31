import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const businessmapDefaultRequestTimeoutMs = 30_000;
const businessmapValidationPath = "/workspaces";

type BusinessmapMethod = "GET" | "POST" | "PATCH" | "DELETE";
type BusinessmapMode = "validate" | "execute";

export interface BusinessmapContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BusinessmapRequestInput extends BusinessmapContext {
  path: string;
  mode: BusinessmapMode;
  method?: BusinessmapMethod;
  query?: Record<string, unknown>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

interface BusinessmapAccountUrl {
  accountHost: string;
  apiBaseUrl: string;
}

export const businessmapActionHandlers: ProviderActionHandlers<
  "businessmap",
  ProviderRuntimeHandler<BusinessmapContext>
> = {
  async list_workspaces(input, context) {
    const payload = await requestBusinessmapJson({
      ...context,
      path: "/workspaces",
      mode: "execute",
      query: buildQuery(input),
    });

    return {
      workspaces: readListData(payload, "workspaces"),
    };
  },

  async list_boards(input, context) {
    const payload = await requestBusinessmapJson({
      ...context,
      path: "/boards",
      mode: "execute",
      query: buildQuery(input),
    });

    return {
      boards: readListData(payload, "boards"),
    };
  },

  async get_board(input, context) {
    const boardId = requirePositiveInteger(input.board_id, "board_id");
    const payload = await requestBusinessmapJson({
      ...context,
      path: `/boards/${boardId}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      board: readObjectData(payload, "board"),
    };
  },

  async create_board(input, context) {
    const payload = await requestBusinessmapJson({
      ...context,
      path: "/boards",
      method: "POST",
      mode: "execute",
      body: compactObject({ ...input }),
    });

    return {
      board: readObjectData(payload, "board"),
    };
  },

  async update_board(input, context) {
    const boardId = requirePositiveInteger(input.board_id, "board_id");
    const body = omitKeys(input, ["board_id"]);
    requireNonEmptyObject(body, "at least one updatable board field is required");
    const payload = await requestBusinessmapJson({
      ...context,
      path: `/boards/${boardId}`,
      method: "PATCH",
      mode: "execute",
      body,
      notFoundAsInvalidInput: true,
    });

    return {
      board: readObjectData(payload, "board"),
    };
  },

  async list_cards(input, context) {
    const payload = await requestBusinessmapJson({
      ...context,
      path: "/cards",
      mode: "execute",
      query: buildQuery(input),
    });
    const nested = readCardsData(payload);

    return compactObject({
      cards: nested.cards,
      pagination: nested.pagination,
    });
  },

  async get_card(input, context) {
    const cardId = requirePositiveInteger(input.card_id, "card_id");
    const payload = await requestBusinessmapJson({
      ...context,
      path: `/cards/${cardId}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      card: readObjectData(payload, "card"),
    };
  },

  async create_card(input, context) {
    const payload = await requestBusinessmapJson({
      ...context,
      path: "/cards",
      method: "POST",
      mode: "execute",
      body: compactObject({ ...input }),
    });

    return {
      card: readObjectData(payload, "card"),
    };
  },

  async update_card(input, context) {
    const cardId = requirePositiveInteger(input.card_id, "card_id");
    const body = omitKeys(input, ["card_id"]);
    requireNonEmptyObject(body, "at least one updatable card field is required");
    const payload = await requestBusinessmapJson({
      ...context,
      path: `/cards/${cardId}`,
      method: "PATCH",
      mode: "execute",
      body,
      notFoundAsInvalidInput: true,
    });

    return {
      card: readObjectData(payload, "card"),
    };
  },

  async delete_card(input, context) {
    const cardId = requirePositiveInteger(input.card_id, "card_id");
    await requestBusinessmapJson({
      ...context,
      path: `/cards/${cardId}`,
      method: "DELETE",
      mode: "execute",
      query: compactObject({
        exceeding_reason: input.exceeding_reason,
      }),
      notFoundAsInvalidInput: true,
    });

    return {
      deleted: true,
    };
  },
};

export async function validateBusinessmapCredential(
  apiKey: string,
  accountUrl: unknown,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const normalizedAccount = normalizeBusinessmapAccountUrl(accountUrl);
  const payload = await requestBusinessmapJson({
    apiBaseUrl: normalizedAccount.apiBaseUrl,
    apiKey,
    path: businessmapValidationPath,
    fetcher,
    signal,
    mode: "validate",
  });
  const workspaces = readListData(payload, "workspaces");

  return {
    profile: {
      accountId: `businessmap:${normalizedAccount.accountHost}`,
      displayName: `Businessmap ${normalizedAccount.accountHost}`,
    },
    grantedScopes: [],
    metadata: {
      accountHost: normalizedAccount.accountHost,
      apiBaseUrl: normalizedAccount.apiBaseUrl,
      validationEndpoint: businessmapValidationPath,
      workspaceCount: workspaces.length,
    },
  };
}

export function normalizeBusinessmapAccountUrl(value: unknown): BusinessmapAccountUrl {
  const rawValue = optionalString(value);
  if (!rawValue) {
    throw new ProviderRequestError(400, "businessmap accountUrl is required");
  }

  const withProtocol = rawValue.includes("://") ? rawValue : `https://${rawValue}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new ProviderRequestError(400, "businessmap accountUrl is invalid");
  }

  let accountHost = url.hostname.toLowerCase();
  if (!accountHost.includes(".")) {
    accountHost = `${accountHost}.kanbanize.com`;
  }
  if (!accountHost.endsWith(".kanbanize.com")) {
    throw new ProviderRequestError(400, "businessmap accountUrl must be a kanbanize.com account host or subdomain");
  }

  return {
    accountHost,
    apiBaseUrl: `https://${accountHost}/api/v2`,
  };
}

async function requestBusinessmapJson(input: BusinessmapRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, businessmapDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildBusinessmapUrl(input), {
      method: input.method ?? "GET",
      headers: {
        apikey: input.apiKey,
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });

    const payload = await readBusinessmapPayload(response);
    if (!response.ok) {
      throw createBusinessmapError(response, payload, input.mode, input.notFoundAsInvalidInput === true);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Businessmap request timed out after ${Math.max(1, Math.ceil(businessmapDefaultRequestTimeoutMs / 1000))} seconds`,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Businessmap request failed: ${error.message}` : "Businessmap request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBusinessmapUrl(input: BusinessmapRequestInput): string {
  const url = new URL(`${input.apiBaseUrl.replace(/\/+$/, "")}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.map((item) => String(item)).join(","));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readBusinessmapPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Businessmap returned invalid JSON");
  }
}

function createBusinessmapError(
  response: Response,
  payload: unknown,
  mode: BusinessmapMode,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractBusinessmapErrorMessage(payload) ?? `Businessmap request failed with ${response.status}`;

  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status, message);
}

function extractBusinessmapErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct = optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  if (direct) {
    return direct;
  }

  const nestedError = optionalRecord(record.error);
  if (nestedError) {
    return extractBusinessmapErrorMessage(nestedError);
  }

  if (Array.isArray(record.errors)) {
    const first = record.errors[0];
    if (typeof first === "string") {
      return first;
    }
    return extractBusinessmapErrorMessage(first);
  }

  return undefined;
}

function readListData(payload: unknown, label: string): unknown[] {
  const data = readWrappedData(payload, label);
  if (Array.isArray(data)) {
    return data;
  }
  throw new ProviderRequestError(502, `Businessmap ${label} response must be an array`);
}

function readObjectData(payload: unknown, label: string): Record<string, unknown> {
  const data = readWrappedData(payload, label);
  const object = optionalRecord(data);
  if (object) {
    return object;
  }
  throw new ProviderRequestError(502, `Businessmap ${label} response must be an object`);
}

function readCardsData(payload: unknown): {
  cards: unknown[];
  pagination?: Record<string, unknown>;
} {
  const data = readWrappedData(payload, "cards");
  if (Array.isArray(data)) {
    return { cards: data };
  }

  const object = optionalRecord(data);
  if (!object) {
    throw new ProviderRequestError(502, "Businessmap cards response must be an object");
  }

  if (!Array.isArray(object.data)) {
    throw new ProviderRequestError(502, "Businessmap cards response data must be an array");
  }

  return {
    cards: object.data,
    pagination: optionalRecord(object.pagination),
  };
}

function readWrappedData(payload: unknown, label: string): unknown {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `Businessmap ${label} response must be an object`);
  }
  return "data" in object ? object.data : object;
}

function buildQuery(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

function omitKeys(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const ignored = new Set(keys);
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => !ignored.has(key) && value !== undefined));
}

function requireNonEmptyObject(input: Record<string, unknown>, message: string): void {
  if (Object.keys(input).length === 0) {
    throw new ProviderRequestError(400, message);
  }
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}
