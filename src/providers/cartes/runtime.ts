import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
  requiredInputString,
} from "../provider-runtime.ts";

export const cartesApiBaseUrl = "https://cartes.io/api";

const cartesRequestBaseUrl = `${cartesApiBaseUrl}/`;

type CartesActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type CartesQueryValue = string | number | boolean | readonly (string | number)[] | undefined;

interface CartesRequestOptions {
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  query?: Record<string, CartesQueryValue>;
  body?: Record<string, unknown>;
  phase: "validate" | "execute";
}

interface CartesRequestContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const cartesActionHandlers: ProviderActionHandlers<"cartes", CartesActionHandler> = {
  async get_current_user(_input, context) {
    return {
      user: requireResponseObject(await cartesRequest("user", context, { phase: "execute" }), "Cartes.io user"),
    };
  },

  async list_maps(input, context) {
    const page = await cartesRequest("maps", context, {
      phase: "execute",
      query: {
        ids: asStringOrNumberArray(input.ids),
        category_ids: asStringOrNumberArray(input.categoryIds),
        withMine: input.withMine === true ? true : undefined,
        orderBy: trimmedRawString(input.orderBy),
        page: optionalNumber(input.page),
      },
    });
    return normalizePage(page, "maps");
  },

  async search_maps(input, context) {
    const page = await cartesRequest("maps/search", context, {
      phase: "execute",
      query: {
        q: requiredInputString(input.query, "query"),
        page: optionalNumber(input.page),
      },
    });
    return normalizePage(page, "maps");
  },

  async create_map(input, context) {
    const map = await cartesRequest("maps", context, {
      method: "POST",
      phase: "execute",
      body: mapBody(input),
    });
    return { map: requireResponseObject(map, "Cartes.io map") };
  },

  async get_map(input, context) {
    const map = await cartesRequest(
      `maps/${encodeURIComponent(requiredInputString(input.mapUuid, "mapUuid"))}`,
      context,
      {
        phase: "execute",
        query: { map_token: trimmedRawString(input.mapToken) },
      },
    );
    return { map: requireResponseObject(map, "Cartes.io map") };
  },

  async update_map(input, context) {
    const map = await cartesRequest(
      `maps/${encodeURIComponent(requiredInputString(input.mapUuid, "mapUuid"))}`,
      context,
      {
        method: "PATCH",
        phase: "execute",
        body: {
          ...mapBody(input),
          map_token: trimmedRawString(input.mapToken),
        },
      },
    );
    return { map: requireResponseObject(map, "Cartes.io map") };
  },

  async delete_map(input, context) {
    const result = await cartesRequest(
      `maps/${encodeURIComponent(requiredInputString(input.mapUuid, "mapUuid"))}`,
      context,
      {
        method: "DELETE",
        phase: "execute",
        query: { map_token: trimmedRawString(input.mapToken) },
      },
    );
    return normalizeSuccess(result);
  },

  async list_markers(input, context) {
    const markers = await cartesRequest(
      `maps/${encodeURIComponent(requiredInputString(input.mapUuid, "mapUuid"))}/markers`,
      context,
      {
        phase: "execute",
        query: {
          map_token: trimmedRawString(input.mapToken),
          show_expired: input.showExpired === true ? true : undefined,
        },
      },
    );
    return {
      markers: requireResponseObjectArray(markers, "Cartes.io markers"),
    };
  },

  async list_public_markers(input, context) {
    const page = await cartesRequest("markers", context, {
      phase: "execute",
      query: {
        category_id: optionalNumber(input.categoryId),
        show_expired: input.showExpired === true ? "true" : undefined,
        page: optionalNumber(input.page),
      },
    });
    return normalizePage(page, "markers");
  },

  async create_marker(input, context) {
    const marker = await cartesRequest(
      `maps/${encodeURIComponent(requiredInputString(input.mapUuid, "mapUuid"))}/markers`,
      context,
      {
        method: "POST",
        phase: "execute",
        body: markerBody(input),
      },
    );
    return { marker: requireResponseObject(marker, "Cartes.io marker") };
  },

  async get_marker(input, context) {
    const marker = await cartesRequest(markerPath(input), context, {
      phase: "execute",
      query: { map_token: trimmedRawString(input.mapToken) },
    });
    return { marker: requireResponseObject(marker, "Cartes.io marker") };
  },

  async update_marker(input, context) {
    const marker = await cartesRequest(markerPath(input), context, {
      method: "PATCH",
      phase: "execute",
      body: markerUpdateBody(input),
    });
    return { marker: requireResponseObject(marker, "Cartes.io marker") };
  },

  async delete_marker(input, context) {
    const result = await cartesRequest(markerPath(input), context, {
      method: "DELETE",
      phase: "execute",
      query: { map_token: trimmedRawString(input.mapToken) },
    });
    return normalizeSuccess(result);
  },

  async create_marker_location(input, context) {
    const marker = await cartesRequest(`${markerPath(input)}/locations`, context, {
      method: "POST",
      phase: "execute",
      body: markerLocationBody(input),
    });
    return { marker: requireResponseObject(marker, "Cartes.io marker") };
  },

  async list_categories(_input, context) {
    const categories = await cartesRequest("categories", context, {
      phase: "execute",
    });
    return {
      categories: requireResponseObjectArray(categories, "Cartes.io categories"),
    };
  },

  async list_related_maps(input, context) {
    const maps = await cartesRequest(
      `maps/${encodeURIComponent(requiredInputString(input.mapUuid, "mapUuid"))}/related`,
      context,
      { phase: "execute" },
    );
    return { maps: requireResponseObjectArray(maps, "Cartes.io related maps") };
  },

  async list_users(input, context) {
    const page = await cartesRequest("users", context, {
      phase: "execute",
      query: {
        with: asStringOrNumberArray(input.with),
        page: optionalNumber(input.page),
      },
    });
    return normalizePage(page, "users");
  },

  async get_user(input, context) {
    const user = await cartesRequest(
      `users/${encodeURIComponent(requiredInputString(input.username, "username"))}`,
      context,
      {
        phase: "execute",
        query: {
          with: asStringOrNumberArray(input.with),
        },
      },
    );
    return { user: requireResponseObject(user, "Cartes.io user") };
  },
};

export async function validateCartesCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = requireResponseObject(
    await cartesRequest("user", { apiKey, fetcher, signal }, { phase: "validate" }),
    "Cartes.io user",
  );
  const username = optionalString(user.username);

  return {
    profile: {
      accountId: username ?? "cartes-api-token",
      displayName: username ? `Cartes.io ${username}` : "Cartes.io API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: cartesApiBaseUrl,
      username,
    }),
  };
}

async function cartesRequest(
  path: string,
  context: CartesRequestContext,
  options: CartesRequestOptions,
): Promise<unknown> {
  const url = new URL(path, cartesRequestBaseUrl);
  appendQuery(url, options.query);

  const method = options.method ?? "GET";
  const timeoutHandle = createProviderTimeout(context.signal);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: options.body ? JSON.stringify(compactObject(options.body)) : undefined,
      signal: timeoutHandle.signal,
    });
    payload = await readCartesPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(502, "Cartes.io request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Cartes.io request failed: ${error.message}` : "Cartes.io request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }

  if (!response.ok) {
    throw createCartesError(response, payload, options.phase);
  }

  return payload;
}

async function readCartesPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Cartes.io response");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createCartesError(
  response: Response,
  payload: unknown,
  phase: CartesRequestOptions["phase"],
): ProviderRequestError {
  const message =
    extractCartesErrorMessage(payload) ?? optionalString(response.statusText) ?? "Cartes.io request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }

  if (response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractCartesErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  const errors = optionalRecord(record.errors);
  const firstError = errors ? Object.values(errors)[0] : undefined;
  if (Array.isArray(firstError) && typeof firstError[0] === "string") {
    return firstError[0];
  }

  return undefined;
}

function normalizePage(payload: unknown, key: string): Record<string, unknown> {
  const page = requireResponseObject(payload, "Cartes.io paginated response");
  const data = Array.isArray(page.data) ? page.data.map((item) => requireResponseObject(item, `Cartes.io ${key}`)) : [];
  return {
    [key]: data,
    page,
  };
}

function normalizeSuccess(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    return { success: true };
  }

  return {
    success: record.success === true,
    raw: record,
  };
}

function markerPath(input: Record<string, unknown>): string {
  return `maps/${encodeURIComponent(requiredInputString(input.mapUuid, "mapUuid"))}/markers/${encodeURIComponent(
    String(readRequiredNumber(input.markerId, "markerId")),
  )}`;
}

function mapBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    title: trimmedRawString(input.title),
    slug: trimmedRawString(input.slug),
    description: input.description,
    privacy: input.privacy,
    users_can_create_markers: input.usersCanCreateMarkers,
  };
}

function markerBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    map_token: trimmedRawString(input.mapToken),
    description: input.description,
    category: input.categoryId,
    category_name: trimmedRawString(input.categoryName),
    lat: input.lat,
    lng: input.lng,
    link: input.link,
    zoom: input.zoom,
    elevation: input.elevation,
    expires_at: input.expiresAt,
    meta: input.meta,
    heading: input.heading,
    pitch: input.pitch,
    roll: input.roll,
    speed: input.speed,
    is_spam: input.isSpam,
  };
}

function markerUpdateBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    map_token: trimmedRawString(input.mapToken),
    description: input.description,
    is_spam: input.isSpam,
  };
}

function markerLocationBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    map_token: trimmedRawString(input.mapToken),
    lat: input.lat,
    lng: input.lng,
    zoom: input.zoom,
    elevation: input.elevation,
    heading: input.heading,
    pitch: input.pitch,
    roll: input.roll,
    speed: input.speed,
  };
}

function appendQuery(url: URL, query: Record<string, CartesQueryValue> | undefined): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(`${key}[]`, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function requireResponseObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response did not include an object`, value);
  }
  return record;
}

function requireResponseObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  return objectArray(value, label, (message) => new ProviderRequestError(502, message, value));
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function trimmedRawString(value: unknown): string | undefined {
  const raw = optionalRawString(value);
  return raw === undefined ? undefined : raw.trim();
}

function asStringOrNumberArray(value: unknown): readonly (string | number)[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string | number => typeof item === "string" || typeof item === "number");
}
