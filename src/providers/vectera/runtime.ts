import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const vecteraApiBaseUrl = "https://www.vectera.com/api/v2";
const maxResponseBytes = 10 * 1024 * 1024;
type VecteraPhase = "validate" | "execute";

interface VecteraJsonResponse {
  payload: unknown;
  headers: Headers;
}

interface VecteraRequestInput {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: VecteraPhase;
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export const vecteraActionHandlers: ProviderActionHandlers<"vectera", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_current_user(input, context) {
    const response = await requestVecteraJson({
      context,
      path: "/users/me",
      query: { include: joinStringList(input.include) },
      phase: "execute",
    });
    return { user: readObjectPayload(response.payload, "current user") };
  },
  async list_meeting_rooms(input, context) {
    const page = optionalInteger(input.page) ?? 1;
    const response = await requestVecteraJson({
      context,
      path: "/meetingRooms",
      query: {
        page: optionalInteger(input.page),
        perPage: optionalInteger(input.perPage),
        search: optionalString(input.search),
        filter: optionalString(input.filter),
        orderBy: joinStringList(input.orderBy),
        include: joinStringList(input.include),
      },
      phase: "execute",
    });
    return {
      meetingRooms: objectArray(response.payload, "meeting room list", providerError),
      pagination: parsePagination(response.headers.get("link"), page),
    };
  },
  async get_meeting_room(input, context) {
    const response = await requestVecteraJson({
      context,
      path: `/meetingRooms/${encodeURIComponent(readInputString(input.meetingRoomId, "meetingRoomId"))}`,
      query: { include: joinStringList(input.include) },
      phase: "execute",
    });
    return { meetingRoom: readObjectPayload(response.payload, "meeting room") };
  },
  async create_meeting_room(input, context) {
    if (input.key != null && input.preferredKey != null) {
      throw new ProviderRequestError(400, "key and preferredKey cannot be used together");
    }
    const response = await requestVecteraJson({
      context,
      path: "/meetingRooms",
      method: "POST",
      query: { include: joinStringList(input.include) },
      body: compactObject({
        key: optionalString(input.key),
        preferredKey: optionalString(input.preferredKey),
        templateId: optionalString(input.templateId),
        ownerId: optionalString(input.ownerId),
        publicAccessLevel: optionalString(input.publicAccessLevel),
        teamAccessLevel: optionalString(input.teamAccessLevel),
      }),
      phase: "execute",
    });
    return { meetingRoom: readObjectPayload(response.payload, "created meeting room") };
  },
  async update_meeting_room(input, context) {
    const body = compactObject({
      key: optionalString(input.key),
      ownerId: optionalString(input.ownerId),
      publicAccessLevel: optionalString(input.publicAccessLevel),
      teamAccessLevel: optionalString(input.teamAccessLevel),
    });
    requireDefinedField(body, "at least one meeting room field is required");
    const response = await requestVecteraJson({
      context,
      path: `/meetingRooms/${encodeURIComponent(readInputString(input.meetingRoomId, "meetingRoomId"))}`,
      method: "PUT",
      query: { include: joinStringList(input.include) },
      body,
      phase: "execute",
    });
    return { meetingRoom: readObjectPayload(response.payload, "updated meeting room") };
  },
  async get_meeting_room_settings(input, context) {
    const response = await requestVecteraJson({
      context,
      path: `/meetingRooms/${encodeURIComponent(readInputString(input.meetingRoomId, "meetingRoomId"))}/settings`,
      phase: "execute",
    });
    return { settings: readObjectPayload(response.payload, "meeting room settings") };
  },
  async update_meeting_room_settings(input, context) {
    const body = compactObject({
      showPrivateNotes: input.showPrivateNotes,
      presenterMode: input.presenterMode,
      forwardUrl: optionalRawString(input.forwardUrl),
    });
    requireDefinedField(body, "at least one meeting room setting is required");
    const response = await requestVecteraJson({
      context,
      path: `/meetingRooms/${encodeURIComponent(readInputString(input.meetingRoomId, "meetingRoomId"))}/settings`,
      method: "PUT",
      body,
      phase: "execute",
    });
    return { settings: readObjectPayload(response.payload, "updated meeting room settings") };
  },
  async create_meeting_room_permission(input, context) {
    if (input.email != null && input.userId != null) {
      throw new ProviderRequestError(400, "email and userId cannot be used together");
    }
    const response = await requestVecteraJson({
      context,
      path: "/permissions",
      method: "POST",
      body: compactObject({
        meetingRoomId: readInputString(input.meetingRoomId, "meetingRoomId"),
        accessLevel: optionalString(input.accessLevel),
        email: optionalString(input.email),
        userId: optionalString(input.userId),
        inviteMessage: optionalRawString(input.inviteMessage),
      }),
      phase: "execute",
    });
    return { permission: readObjectPayload(response.payload, "meeting room permission") };
  },
};

export async function validateVecteraCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const response = await requestVecteraJson({
    context: { apiKey: input.apiKey, fetcher, signal },
    path: "/users/me",
    phase: "validate",
  });
  const user = readObjectPayload(response.payload, "current user");
  const id = optionalString(user.id);
  const fullName = optionalString(user.fullName);
  const email = optionalString(user.email);
  const shortName = optionalString(user.shortName);
  return {
    profile: {
      accountId: id ? `vectera:${id}` : "vectera",
      displayName: fullName ?? email ?? shortName ?? "Vectera Account",
    },
    grantedScopes: [],
    metadata: compactObject({
      userId: id,
      fullName,
      email,
      organizationId: optionalString(user.organizationId),
      apiBaseUrl: vecteraApiBaseUrl,
    }),
  };
}

async function requestVecteraJson(input: VecteraRequestInput): Promise<VecteraJsonResponse> {
  const url = new URL(`${vecteraApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Token ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (input.body != null) headers.set("content-type", "application/json");
    const response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readVecteraPayload(response);
    if (!response.ok) throw createVecteraError(response.status, payload, input.phase);
    return { payload, headers: response.headers };
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Vectera request timed out");
    }
    throw new ProviderRequestError(
      502,
      `Vectera request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readVecteraPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Vectera response", maxResponseBytes);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "Vectera returned malformed JSON");
    return text;
  }
}

function createVecteraError(status: number, payload: unknown, phase: VecteraPhase): ProviderRequestError {
  const message = extractVecteraErrorMessage(payload) ?? `Vectera request failed with status ${status}`;
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status || 502, message);
}

function extractVecteraErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  for (const key of ["detail", "message", "error"]) {
    const value = optionalString(record[key]);
    if (value) return value;
  }
  const messages = Object.entries(record).flatMap(([key, value]) =>
    Array.isArray(value)
      ? value.map((item) => `${key}: ${String(item)}`)
      : typeof value === "string"
        ? [`${key}: ${value}`]
        : [],
  );
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function readObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  return requiredRecord(payload, label, () => providerError(`${label} response`));
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireDefinedField(input: Record<string, unknown>, message: string): void {
  if (!Object.values(input).some((value) => value !== undefined)) {
    throw new ProviderRequestError(400, message);
  }
}

function joinStringList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string").join(",");
}

function parsePagination(linkHeader: string | null, page: number): Record<string, unknown> {
  const links: Record<string, string> = {};
  for (const segment of linkHeader?.split(",") ?? []) {
    const start = segment.indexOf("<");
    const end = segment.indexOf(">");
    if (start < 0 || end <= start) continue;
    const url = segment.slice(start + 1, end).trim();
    for (const parameter of segment.slice(end + 1).split(";")) {
      const [name, rawValue] = parameter.trim().split("=", 2);
      if (name === "rel" && rawValue) links[rawValue.replaceAll('"', "")] = url;
    }
  }
  return {
    page,
    next: links.next ?? null,
    previous: links.prev ?? null,
    first: links.first ?? null,
    last: links.last ?? null,
  };
}

function providerError(label: string): ProviderRequestError {
  return new ProviderRequestError(502, `Vectera ${label} must be an object`);
}
